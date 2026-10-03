// ============================================================================
// Purchasing service — PO lifecycle + goods receipt (stock increase).
// ============================================================================

import prisma from "@/lib/db";
import type { Prisma } from "@/lib/prisma";
import { ApiError } from "@/server/errors";
import { nextNumber } from "@/server/sequence";
import { logAudit } from "@/server/audit";
import { postMovement } from "@/server/services/inventory";
import { notifyPermissionHolders } from "@/server/services/notifications";
import { canTransition, PO_ACTIONS } from "@/lib/status";
import { round2 } from "@/lib/utils";

type Tx = Prisma.TransactionClient | typeof prisma;

export type PoItemInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRate?: number;
  description?: string;
};

export function calcLineTotal(quantity: number, unitPrice: number, discountPercent = 0, taxRate = 0) {
  const net = quantity * unitPrice * (1 - discountPercent / 100);
  return { net: round2(net), tax: round2(net * (taxRate / 100)), gross: round2(net + net * (taxRate / 100)) };
}

export function calcTotals(items: { quantity: number; unitPrice: number; discountPercent?: number; taxRate?: number }[]) {
  let subtotal = 0, discountTotal = 0, taxTotal = 0;
  for (const it of items) {
    const gross = it.quantity * it.unitPrice;
    const net = gross * (1 - (it.discountPercent ?? 0) / 100);
    subtotal += net;
    discountTotal += gross - net;
    taxTotal += net * ((it.taxRate ?? 0) / 100);
  }
  return {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    taxTotal: round2(taxTotal),
    total: round2(subtotal + taxTotal),
  };
}

export async function createPurchaseOrder(
  tx: Tx,
  p: {
    companyId: string; userId: string;
    supplierId: string; warehouseId?: string | null;
    expectedDeliveryDate?: Date | null; paymentTermDays?: number;
    notes?: string | null; items: PoItemInput[];
    orderDate?: Date;
  }
) {
  if (p.items.length === 0) throw ApiError.badRequest("A purchase order needs at least one line item.");
  const supplier = await tx.supplier.findFirst({ where: { id: p.supplierId, companyId: p.companyId, deletedAt: null } });
  if (!supplier) throw ApiError.notFound("Supplier not found.");
  const warehouse = p.warehouseId
    ? await tx.warehouse.findFirst({ where: { id: p.warehouseId, companyId: p.companyId } })
    : await tx.warehouse.findFirst({ where: { companyId: p.companyId, isDefault: true } })
      ?? await tx.warehouse.findFirst({ where: { companyId: p.companyId } });
  if (!warehouse) throw ApiError.badRequest("No warehouse available. Create a warehouse first.");

  const totals = calcTotals(p.items);
  const orderNumber = await nextNumber(tx, p.companyId, "PO", p.orderDate ?? new Date());

  const po = await tx.purchaseOrder.create({
    data: {
      companyId: p.companyId,
      orderNumber,
      supplierId: p.supplierId,
      warehouseId: warehouse.id,
      status: "DRAFT",
      orderDate: p.orderDate ?? new Date(),
      expectedDeliveryDate: p.expectedDeliveryDate ?? null,
      currency: supplier.currency,
      paymentTermDays: p.paymentTermDays ?? supplier.paymentTermDays,
      notes: p.notes ?? null,
      createdById: p.userId,
      ...totals,
      items: {
        create: p.items.map((it) => {
          const { net } = calcLineTotal(it.quantity, it.unitPrice, it.discountPercent ?? 0, it.taxRate ?? 19);
          return {
            productId: it.productId,
            description: it.description ?? null,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discountPercent: it.discountPercent ?? 0,
            taxRate: it.taxRate ?? 19,
            lineTotal: net,
          };
        }),
      },
    },
    include: { items: true },
  });

  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "CREATED",
    entityType: "PurchaseOrder", entityId: po.id, entityNumber: po.orderNumber,
    summary: `Created purchase order ${po.orderNumber} for ${supplier.companyName} (${po.items.length} lines, ${po.total.toFixed(2)} ${po.currency})`,
    after: { supplier: supplier.companyName, total: po.total, items: p.items.length },
  });
  return po;
}

/** Goods receipt — increases stock, updates PO, creates audit + notifications. */
export async function receivePurchaseOrder(
  tx: Tx,
  p: {
    purchaseOrderId: string; companyId: string; userId: string;
    lines: { itemId: string; quantity: number; batchNumber?: string; expiryDate?: string }[];
    receivedAt?: Date; notes?: string;
  }
) {
  const po = await tx.purchaseOrder.findFirst({
    where: { id: p.purchaseOrderId, companyId: p.companyId, deletedAt: null },
    include: { items: true, supplier: true },
  });
  if (!po) throw ApiError.notFound("Purchase order not found.");
  if (["RECEIVED", "CANCELLED"].includes(po.status)) {
    throw ApiError.conflict(`Purchase order ${po.orderNumber} is ${po.status.toLowerCase()} and cannot receive goods.`);
  }
  if (!po.warehouseId) throw ApiError.conflict("Purchase order has no destination warehouse.");
  if (p.lines.length === 0) throw ApiError.badRequest("Nothing to receive.");

  const receiptNumber = await nextNumber(tx, p.companyId, "GR", p.receivedAt ?? new Date());
  const receivedAt = p.receivedAt ?? new Date();

  const receipt = await tx.goodsReceipt.create({
    data: {
      companyId: p.companyId, receiptNumber, purchaseOrderId: po.id,
      warehouseId: po.warehouseId, receivedById: p.userId, receivedAt,
      notes: p.notes ?? null,
    },
  });

  let fullyReceived = true;
  for (const line of p.lines) {
    const item = po.items.find((i) => i.id === line.itemId);
    if (!item) throw ApiError.badRequest("Invalid line item in goods receipt.");
    if (line.quantity <= 0) throw ApiError.badRequest("Received quantity must be positive.");
    const outstanding = item.quantity - item.receivedQuantity;
    if (line.quantity > outstanding + 0.00001) {
      throw ApiError.conflict(
        `Cannot receive ${line.quantity} — only ${outstanding.toFixed(2)} outstanding for this line.`
      );
    }

    await postMovement(tx, {
      companyId: p.companyId,
      productId: item.productId,
      warehouseId: po.warehouseId,
      type: "PURCHASE_RECEIPT",
      quantity: line.quantity,
      unitCost: item.unitPrice,
      referenceType: "GoodsReceipt",
      referenceId: receipt.id,
      referenceNumber: receiptNumber,
      batchNumber: line.batchNumber ?? null,
      expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
      userId: p.userId,
      createdAt: receivedAt,
    });

    await tx.goodsReceiptItem.create({
      data: {
        goodsReceiptId: receipt.id, productId: item.productId, quantity: line.quantity,
        batchNumber: line.batchNumber ?? null,
        expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
      },
    });

    await tx.purchaseOrderItem.update({
      where: { id: item.id },
      data: { receivedQuantity: item.receivedQuantity + line.quantity },
    });

    if (item.receivedQuantity + line.quantity < item.quantity - 0.00001) fullyReceived = false;
  }

  const newStatus = fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED";
  await tx.purchaseOrder.update({
    where: { id: po.id },
    data: { status: newStatus, receivedAt: fullyReceived ? receivedAt : po.receivedAt },
  });

  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "RECEIVED",
    entityType: "PurchaseOrder", entityId: po.id, entityNumber: po.orderNumber,
    summary: `Received goods for ${po.orderNumber} (${receiptNumber}) from ${po.supplier.companyName} — status → ${newStatus.replace("_", " ")}`,
    after: { receiptNumber, status: newStatus, lines: p.lines.length },
  });

  await notifyPermissionHolders(tx, {
    companyId: p.companyId, permission: "purchasing.read", type: "PO_RECEIVED",
    title: `Goods received: ${po.orderNumber}`,
    body: `Goods receipt ${receiptNumber} posted from ${po.supplier.companyName}. Purchase order is now ${newStatus.replace("_", " ").toLowerCase()}.`,
    entityType: "PurchaseOrder", entityId: po.id,
  });

  return { receipt, status: newStatus };
}

/** PO status transitions (send / confirm / cancel) driven by the state machine. */
export async function purchaseOrderAction(
  tx: Tx,
  p: { purchaseOrderId: string; companyId: string; userId: string; action: string }
) {
  const po = await tx.purchaseOrder.findFirst({
    where: { id: p.purchaseOrderId, companyId: p.companyId, deletedAt: null },
    include: { supplier: true },
  });
  if (!po) throw ApiError.notFound("Purchase order not found.");
  const t = PO_ACTIONS[p.action];
  if (!t) throw ApiError.badRequest(`Unknown action "${p.action}".`);
  if (!canTransition(PO_ACTIONS, p.action, po.status)) {
    throw ApiError.conflict(`Action "${p.action}" is not allowed while the order is ${po.status.replace(/_/g, " ").toLowerCase()}.`);
  }

  const stamp: Partial<Record<string, string>> = {
    SENT: "sentAt", CONFIRMED: "confirmedAt", CANCELLED: "cancelledAt",
  };
  const stampField = stamp[t.to];

  await tx.purchaseOrder.update({
    where: { id: po.id },
    data: {
      status: t.to,
      ...(stampField ? { [stampField]: new Date() } : {}),
    },
  });

  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "STATUS_CHANGED",
    entityType: "PurchaseOrder", entityId: po.id, entityNumber: po.orderNumber,
    summary: `Purchase order ${po.orderNumber}: ${po.status} → ${t.to}`,
    before: { status: po.status }, after: { status: t.to },
  });

  return t.to;
}

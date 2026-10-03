// ============================================================================
// Sales service — quotes, orders, shipping (stock decrease), state machines.
// ============================================================================

import prisma from "@/lib/db";
import type { Prisma } from "@/lib/prisma";
import { ApiError } from "@/server/errors";
import { nextNumber } from "@/server/sequence";
import { logAudit } from "@/server/audit";
import { postMovement, reserveStock, releaseReservation, consumeStock } from "@/server/services/inventory";
import { notifyPermissionHolders, notifyUsers } from "@/server/services/notifications";
import { canTransition, SALES_ORDER_ACTIONS } from "@/lib/status";
import { round2 } from "@/lib/utils";
import { calcTotals, calcLineTotal } from "@/server/services/purchasing";

type Tx = Prisma.TransactionClient | typeof prisma;

export type SalesItemInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRate?: number;
  description?: string;
};

// ----------------------------- Quotes -----------------------------

export async function createQuote(
  tx: Tx,
  p: {
    companyId: string; userId: string; customerId: string;
    issueDate?: Date; validUntil?: Date | null; salesRepId?: string | null;
    notes?: string | null; items: SalesItemInput[];
  }
) {
  if (p.items.length === 0) throw ApiError.badRequest("A quotation needs at least one line item.");
  const customer = await tx.customer.findFirst({ where: { id: p.customerId, companyId: p.companyId, deletedAt: null } });
  if (!customer) throw ApiError.notFound("Customer not found.");

  const totals = calcTotals(p.items);
  const quoteNumber = await nextNumber(tx, p.companyId, "QT", p.issueDate ?? new Date());
  const validUntil = p.validUntil ?? new Date(Date.now() + 30 * 24 * 3600 * 1000);

  const quote = await tx.salesQuote.create({
    data: {
      companyId: p.companyId, quoteNumber, customerId: p.customerId,
      status: "DRAFT", issueDate: p.issueDate ?? new Date(), validUntil,
      currency: customer.currency, salesRepId: p.salesRepId ?? null,
      notes: p.notes ?? null, ...totals,
      items: {
        create: p.items.map((it) => ({
          productId: it.productId, description: it.description ?? null,
          quantity: it.quantity, unitPrice: it.unitPrice,
          discountPercent: it.discountPercent ?? 0, taxRate: it.taxRate ?? 19,
          lineTotal: calcLineTotal(it.quantity, it.unitPrice, it.discountPercent ?? 0, it.taxRate ?? 19).net,
        })),
      },
    },
    include: { items: true },
  });

  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "CREATED",
    entityType: "SalesQuote", entityId: quote.id, entityNumber: quote.quoteNumber,
    summary: `Created quotation ${quote.quoteNumber} for ${customer.companyName ?? `${customer.firstName} ${customer.lastName}`}`,
    after: { total: quote.total, items: p.items.length },
  });
  return quote;
}

export async function quoteAction(
  tx: Tx,
  p: { quoteId: string; companyId: string; userId: string; action: string }
) {
  const quote = await tx.salesQuote.findFirst({
    where: { id: p.quoteId, companyId: p.companyId, deletedAt: null },
    include: { customer: true, items: true },
  });
  if (!quote) throw ApiError.notFound("Quotation not found.");

  const transitions: Record<string, { from: string[]; to: string }> = {
    send: { from: ["DRAFT"], to: "SENT" },
    markViewed: { from: ["SENT"], to: "VIEWED" },
    accept: { from: ["SENT", "VIEWED"], to: "ACCEPTED" },
    reject: { from: ["SENT", "VIEWED"], to: "REJECTED" },
    expire: { from: ["SENT", "VIEWED", "ACCEPTED"], to: "EXPIRED" },
  };
  const t = transitions[p.action];
  if (!t) throw ApiError.badRequest(`Unknown action "${p.action}".`);
  if (!t.from.includes(quote.status)) {
    throw ApiError.conflict(`Action "${p.action}" is not allowed while the quotation is ${quote.status.toLowerCase()}.`);
  }

  await tx.salesQuote.update({
    where: { id: quote.id },
    data: { status: t.to, ...(t.to === "SENT" ? { sentAt: new Date() } : {}) },
  });
  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "STATUS_CHANGED",
    entityType: "SalesQuote", entityId: quote.id, entityNumber: quote.quoteNumber,
    summary: `Quotation ${quote.quoteNumber}: ${quote.status} → ${t.to}`,
    before: { status: quote.status }, after: { status: t.to },
  });
  return t.to;
}

/** Convert an accepted (or sent) quotation into a sales order. */
export async function convertQuoteToOrder(
  tx: Tx,
  p: { quoteId: string; companyId: string; userId: string; warehouseId?: string | null }
) {
  const quote = await tx.salesQuote.findFirst({
    where: { id: p.quoteId, companyId: p.companyId, deletedAt: null },
    include: { items: true, customer: true },
  });
  if (!quote) throw ApiError.notFound("Quotation not found.");
  if (!["SENT", "VIEWED", "ACCEPTED"].includes(quote.status)) {
    throw ApiError.conflict(`Only sent/accepted quotations can be converted (current: ${quote.status}).`);
  }

  const order = await createOrder(tx, {
    companyId: p.companyId, userId: p.userId, customerId: quote.customerId,
    quoteId: quote.id, warehouseId: p.warehouseId ?? null,
    salesRepId: quote.salesRepId, notes: `Converted from quotation ${quote.quoteNumber}`,
    orderDate: new Date(),
    items: quote.items.map((it) => ({
      productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice,
      discountPercent: it.discountPercent, taxRate: it.taxRate, description: it.description ?? undefined,
    })),
  });

  await tx.salesQuote.update({
    where: { id: quote.id },
    data: { status: "CONVERTED", convertedOrderId: order.id, convertedAt: new Date() },
  });
  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "CONVERTED",
    entityType: "SalesQuote", entityId: quote.id, entityNumber: quote.quoteNumber,
    summary: `Quotation ${quote.quoteNumber} converted to sales order ${order.orderNumber}`,
  });
  return order;
}

// ----------------------------- Orders -----------------------------

export async function createOrder(
  tx: Tx,
  p: {
    companyId: string; userId: string; customerId: string;
    quoteId?: string | null; warehouseId?: string | null;
    orderDate?: Date; requestedDeliveryDate?: Date | null;
    salesRepId?: string | null; notes?: string | null;
    shippingCost?: number; items: SalesItemInput[];
  }
) {
  if (p.items.length === 0) throw ApiError.badRequest("A sales order needs at least one line item.");
  const customer = await tx.customer.findFirst({ where: { id: p.customerId, companyId: p.companyId, deletedAt: null } });
  if (!customer) throw ApiError.notFound("Customer not found.");
  const warehouse = p.warehouseId
    ? await tx.warehouse.findFirst({ where: { id: p.warehouseId, companyId: p.companyId } })
    : await tx.warehouse.findFirst({ where: { companyId: p.companyId, isDefault: true } })
      ?? await tx.warehouse.findFirst({ where: { companyId: p.companyId } });
  if (!warehouse) throw ApiError.badRequest("No warehouse available. Create a warehouse first.");

  const totals = calcTotals(p.items);
  const orderNumber = await nextNumber(tx, p.companyId, "SO", p.orderDate ?? new Date());

  const order = await tx.salesOrder.create({
    data: {
      companyId: p.companyId, orderNumber, customerId: p.customerId,
      quoteId: p.quoteId ?? null, status: "DRAFT",
      orderDate: p.orderDate ?? new Date(),
      requestedDeliveryDate: p.requestedDeliveryDate ?? null,
      warehouseId: warehouse.id, salesRepId: p.salesRepId ?? null,
      currency: customer.currency, shippingCost: p.shippingCost ?? 0,
      notes: p.notes ?? null, createdById: p.userId,
      subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal,
      total: round2(totals.total + (p.shippingCost ?? 0)),
      items: {
        create: p.items.map((it) => ({
          productId: it.productId, description: it.description ?? null,
          quantity: it.quantity, unitPrice: it.unitPrice,
          discountPercent: it.discountPercent ?? 0, taxRate: it.taxRate ?? 19,
          lineTotal: calcLineTotal(it.quantity, it.unitPrice, it.discountPercent ?? 0, it.taxRate ?? 19).net,
        })),
      },
    },
    include: { items: true },
  });

  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "CREATED",
    entityType: "SalesOrder", entityId: order.id, entityNumber: order.orderNumber,
    summary: `Created sales order ${order.orderNumber} for ${customer.companyName ?? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim()} (${order.total.toFixed(2)} ${order.currency})`,
    after: { total: order.total, items: p.items.length, customerId: customer.id },
  });

  await notifyPermissionHolders(tx, {
    companyId: p.companyId, permission: "sales.read", type: "ORDER_CREATED",
    title: `New sales order ${order.orderNumber}`,
    body: `Order for ${customer.companyName ?? customer.lastName} with a total of ${order.total.toFixed(2)} ${order.currency}.`,
    entityType: "SalesOrder", entityId: order.id,
  });

  return order;
}

/** State-machine driven order actions, incl. reservation and shipping logic. */
export async function salesOrderAction(
  tx: Tx,
  p: {
    orderId: string; companyId: string; userId: string;
    action: string;
    shipLines?: { itemId: string; quantity: number }[];
    carrier?: string; trackingNumber?: string;
  }
) {
  const order = await tx.salesOrder.findFirst({
    where: { id: p.orderId, companyId: p.companyId, deletedAt: null },
    include: { items: true, customer: true },
  });
  if (!order) throw ApiError.notFound("Sales order not found.");
  const t = SALES_ORDER_ACTIONS[p.action];
  if (!t) throw ApiError.badRequest(`Unknown action "${p.action}".`);
  if (!canTransition(SALES_ORDER_ACTIONS, p.action, order.status)) {
    throw ApiError.conflict(
      `Action "${p.action}" is not allowed while the order is ${order.status.replace(/_/g, " ").toLowerCase()}.`
    );
  }

  // ---------------- CANCEL: release reservations ----------------
  if (p.action === "cancel") {
    if (order.status === "RESERVED" && order.warehouseId) {
      for (const item of order.items) {
        const toRelease = item.quantity - item.shippedQuantity;
        if (toRelease > 0) {
          await releaseReservation(tx, {
            companyId: p.companyId, productId: item.productId,
            warehouseId: order.warehouseId, quantity: toRelease,
          });
        }
      }
    }
    await tx.salesOrder.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await logAudit(tx, {
      companyId: p.companyId, userId: p.userId, action: "STATUS_CHANGED",
      entityType: "SalesOrder", entityId: order.id, entityNumber: order.orderNumber,
      summary: `Sales order ${order.orderNumber} cancelled (reservations released: ${order.status === "RESERVED"})`,
      before: { status: order.status }, after: { status: "CANCELLED" },
    });
    return { status: "CANCELLED" };
  }

  // ---------------- RESERVE: hold available stock ----------------
  if (p.action === "reserve") {
    if (!order.warehouseId) throw ApiError.conflict("Order has no warehouse assigned.");
    for (const item of order.items) {
      await reserveStock(tx, {
        companyId: p.companyId, productId: item.productId,
        warehouseId: order.warehouseId, quantity: item.quantity,
      });
    }
    await tx.salesOrder.update({ where: { id: order.id }, data: { status: "RESERVED" } });
    await logAudit(tx, {
      companyId: p.companyId, userId: p.userId, action: "STATUS_CHANGED",
      entityType: "SalesOrder", entityId: order.id, entityNumber: order.orderNumber,
      summary: `Sales order ${order.orderNumber}: ${order.status} → RESERVED (stock reserved)`,
      before: { status: order.status }, after: { status: "RESERVED" },
    });
    return { status: "RESERVED" };
  }

  // ---------------- SHIP: consume stock, create shipment ----------------
  if (p.action === "ship") {
    if (!order.warehouseId) throw ApiError.conflict("Order has no warehouse assigned.");
    const lines = p.shipLines && p.shipLines.length > 0
      ? p.shipLines
      : order.items
          .filter((i) => i.quantity - i.shippedQuantity > 0.00001)
          .map((i) => ({ itemId: i.id, quantity: i.quantity - i.shippedQuantity }));
    if (lines.length === 0) throw ApiError.conflict("Nothing left to ship on this order.");

    const shipmentNumber = await nextNumber(tx, p.companyId, "SHP");
    const shippingAddress = JSON.stringify({
      street: order.customer.shippingStreet ?? order.customer.billingStreet,
      city: order.customer.shippingCity ?? order.customer.billingCity,
      postalCode: order.customer.shippingPostalCode ?? order.customer.billingPostalCode,
      country: order.customer.shippingCountry ?? order.customer.billingCountry,
    });

    const shipment = await tx.shipment.create({
      data: {
        companyId: p.companyId, shipmentNumber, salesOrderId: order.id,
        customerId: order.customerId, warehouseId: order.warehouseId,
        carrier: p.carrier ?? "DHL", trackingNumber: p.trackingNumber ?? null,
        status: "SHIPPED", plannedDate: new Date(), actualDate: new Date(),
        shippingAddress, packageCount: 1,
      },
    });

    let allShipped = true;
    for (const line of lines) {
      const item = order.items.find((i) => i.id === line.itemId);
      if (!item) throw ApiError.badRequest("Invalid ship line.");
      const outstanding = item.quantity - item.shippedQuantity;
      if (line.quantity <= 0) continue;
      if (line.quantity > outstanding + 0.00001) {
        throw ApiError.conflict(`Cannot ship ${line.quantity} — only ${outstanding.toFixed(2)} outstanding for this line.`);
      }
      await consumeStock(tx, {
        companyId: p.companyId, productId: item.productId, warehouseId: order.warehouseId,
        quantity: line.quantity, type: "SALES_SHIPMENT",
        referenceType: "SalesOrder", referenceId: order.id, referenceNumber: order.orderNumber,
        userId: p.userId,
      });
      await tx.shipmentItem.create({
        data: { shipmentId: shipment.id, productId: item.productId, quantity: line.quantity },
      });
      await tx.salesOrderItem.update({
        where: { id: item.id },
        data: { shippedQuantity: item.shippedQuantity + line.quantity },
      });
      if (item.shippedQuantity + line.quantity < item.quantity - 0.00001) allShipped = false;
    }

    const newStatus = allShipped ? "SHIPPED" : "PARTIALLY_SHIPPED";
    await tx.salesOrder.update({
      where: { id: order.id },
      data: { status: newStatus, shippedAt: allShipped ? new Date() : order.shippedAt },
    });

    await logAudit(tx, {
      companyId: p.companyId, userId: p.userId, action: "SHIPPED",
      entityType: "SalesOrder", entityId: order.id, entityNumber: order.orderNumber,
      summary: `Sales order ${order.orderNumber} shipped via ${shipment.shipmentNumber} (${p.carrier ?? "DHL"}) — status → ${newStatus.replace("_", " ")}`,
      after: { shipmentNumber, status: newStatus, lines: lines.length },
    });

    return { status: newStatus, shipmentNumber };
  }

  // ---------------- Simple transitions (approve / pick / pack / complete) ----------------
  const to = typeof t.to === "function" ? t.to(true) : t.to;
  const stamps: Record<string, Record<string, Date>> = {
    CONFIRMED: { confirmedAt: new Date() },
    SHIPPED: { shippedAt: new Date() },
    COMPLETED: { completedAt: new Date() },
  };
  await tx.salesOrder.update({
    where: { id: order.id },
    data: { status: to, ...(stamps[to] ?? {}) },
  });
  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "STATUS_CHANGED",
    entityType: "SalesOrder", entityId: order.id, entityNumber: order.orderNumber,
    summary: `Sales order ${order.orderNumber}: ${order.status} → ${to.replace(/_/g, " ")}`,
    before: { status: order.status }, after: { status: to },
  });
  return { status: to };
}

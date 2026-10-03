// ============================================================================
// Inventory service — the single authority over stock.
// RULE: physical stock is NEVER modified without an InventoryMovement row.
// All functions run inside the caller's transaction.
// ============================================================================

import prisma from "@/lib/db";
import type { Prisma } from "@/lib/prisma";
import { ApiError } from "@/server/errors";
import { nextNumber } from "@/server/sequence";

type Tx = Prisma.TransactionClient | typeof prisma;

export type MovementType =
  | "PURCHASE_RECEIPT" | "SALES_SHIPMENT" | "TRANSFER_OUT" | "TRANSFER_IN"
  | "PRODUCTION_CONSUMPTION" | "PRODUCTION_OUTPUT" | "ADJUSTMENT"
  | "RETURN_IN" | "RETURN_OUT" | "QUARANTINE_IN" | "QUARANTINE_OUT"
  | "OPENING_STOCK" | "STOCKTAKE";

export type MovementInput = {
  companyId: string;
  productId: string;
  warehouseId: string;
  locationId?: string | null;
  type: MovementType;
  quantity: number; // signed: >0 in, <0 out
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceNumber?: string | null;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  note?: string | null;
  userId?: string | null;
  createdAt?: Date; // backdating (seed / document dating)
};

/** Post a movement and update the inventory balance. Blocks negative stock. */
export async function postMovement(tx: Tx, input: MovementInput) {
  if (input.quantity === 0) {
    throw ApiError.badRequest("Movement quantity cannot be zero.");
  }

  const item = await tx.inventoryItem.upsert({
    where: {
      productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId },
    },
    create: {
      companyId: input.companyId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      locationId: input.locationId ?? null,
      physicalQty: 0,
    },
    update: {},
  });

  const newQty = item.physicalQty + input.quantity;
  if (newQty < -0.00001) {
    const product = await tx.product.findUnique({ where: { id: input.productId } });
    const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
    throw ApiError.conflict(
      `Insufficient stock for "${product?.name ?? input.productId}" in warehouse ` +
        `"${warehouse?.name ?? input.warehouseId}": available ${item.physicalQty.toFixed(2)}, ` +
        `required ${Math.abs(input.quantity).toFixed(2)}.`,
      { productId: input.productId, available: item.physicalQty, required: Math.abs(input.quantity) }
    );
  }

  await tx.inventoryItem.update({
    where: { id: item.id },
    data: {
      physicalQty: newQty,
      updatedAt: new Date(),
      ...(input.locationId && !item.locationId ? { locationId: input.locationId } : {}),
    },
  });

  const movementNumber = await nextNumber(tx, input.companyId, "MV", input.createdAt ?? new Date());

  const movement = await tx.inventoryMovement.create({
    data: {
      companyId: input.companyId,
      movementNumber,
      type: input.type,
      productId: input.productId,
      warehouseId: input.warehouseId,
      locationId: input.locationId ?? null,
      quantity: input.quantity,
      unitCost: input.unitCost ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      referenceNumber: input.referenceNumber ?? null,
      batchNumber: input.batchNumber ?? null,
      expiryDate: input.expiryDate ?? null,
      note: input.note ?? null,
      userId: input.userId ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });

  return movement;
}

/** Reserve available stock (available = physical - reserved). */
export async function reserveStock(
  tx: Tx,
  p: { companyId: string; productId: string; warehouseId: string; quantity: number }
) {
  const item = await tx.inventoryItem.findUnique({
    where: { productId_warehouseId: { productId: p.productId, warehouseId: p.warehouseId } },
  });
  const available = (item?.physicalQty ?? 0) - (item?.reservedQty ?? 0);
  if (available + 0.00001 < p.quantity) {
    throw ApiError.conflict(
      `Insufficient available stock to reserve: required ${p.quantity.toFixed(2)}, available ${available.toFixed(2)}.`,
      { productId: p.productId, available }
    );
  }
  await tx.inventoryItem.update({
    where: { id: item!.id },
    data: { reservedQty: item!.reservedQty + p.quantity },
  });
}

/** Release a reservation (e.g. order cancelled). */
export async function releaseReservation(
  tx: Tx,
  p: { companyId: string; productId: string; warehouseId: string; quantity: number }
) {
  const item = await tx.inventoryItem.findUnique({
    where: { productId_warehouseId: { productId: p.productId, warehouseId: p.warehouseId } },
  });
  if (!item) return;
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { reservedQty: Math.max(0, item.reservedQty - p.quantity) },
  });
}

/** Consume stock (shipment / production issue). Previously reserved quantity is
 *  released from the reservation counter, then physically removed via a movement. */
export async function consumeStock(
  tx: Tx,
  p: {
    companyId: string; productId: string; warehouseId: string; quantity: number;
    type: MovementType; note?: string | null; userId?: string | null;
    referenceType?: string | null; referenceId?: string | null; referenceNumber?: string | null;
    batchNumber?: string | null;
  }
) {
  const item = await tx.inventoryItem.findUnique({
    where: { productId_warehouseId: { productId: p.productId, warehouseId: p.warehouseId } },
  });
  if (item && item.reservedQty > 0) {
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { reservedQty: Math.max(0, item.reservedQty - p.quantity) },
    });
  }
  return postMovement(tx, {
    companyId: p.companyId,
    productId: p.productId,
    warehouseId: p.warehouseId,
    type: p.type,
    quantity: -p.quantity,
    note: p.note ?? null,
    userId: p.userId ?? null,
    referenceType: p.referenceType ?? null,
    referenceId: p.referenceId ?? null,
    referenceNumber: p.referenceNumber ?? null,
    batchNumber: p.batchNumber ?? null,
  });
}

/** Manual adjustment (positive or negative) with mandatory reason. */
export async function adjustStock(
  tx: Tx,
  p: {
    companyId: string; productId: string; warehouseId: string; quantity: number;
    reason: string; userId?: string; batchNumber?: string; type?: "ADJUSTMENT" | "STOCKTAKE" | "OPENING_STOCK";
    createdAt?: Date;
  }
) {
  return postMovement(tx, {
    companyId: p.companyId,
    productId: p.productId,
    warehouseId: p.warehouseId,
    type: p.type ?? "ADJUSTMENT",
    quantity: p.quantity,
    note: p.reason,
    userId: p.userId,
    batchNumber: p.batchNumber ?? null,
    referenceType: "Manual",
    createdAt: p.createdAt,
  });
}

/** Transfer between warehouses: TRANSFER_OUT + TRANSFER_IN pair. */
export async function transferStock(
  tx: Tx,
  p: {
    companyId: string; productId: string; fromWarehouseId: string; toWarehouseId: string;
    quantity: number; note?: string; userId?: string;
  }
) {
  if (p.fromWarehouseId === p.toWarehouseId) {
    throw ApiError.badRequest("Source and destination warehouse must differ.");
  }
  const out = await postMovement(tx, {
    companyId: p.companyId, productId: p.productId, warehouseId: p.fromWarehouseId,
    type: "TRANSFER_OUT", quantity: -p.quantity, note: p.note, userId: p.userId,
    referenceType: "Transfer",
  });
  const inbound = await postMovement(tx, {
    companyId: p.companyId, productId: p.productId, warehouseId: p.toWarehouseId,
    type: "TRANSFER_IN", quantity: p.quantity, note: p.note, userId: p.userId,
    referenceType: "Transfer", referenceId: out.id, referenceNumber: out.movementNumber,
  });
  return { out, in: inbound };
}

/** Move quantity into quarantine (quality fail) — physical down, quarantined up. */
export async function quarantineStock(
  tx: Tx,
  p: { companyId: string; productId: string; warehouseId: string; quantity: number; reason: string; userId?: string; referenceType?: string; referenceId?: string; referenceNumber?: string }
) {
  await postMovement(tx, {
    companyId: p.companyId, productId: p.productId, warehouseId: p.warehouseId,
    type: "QUARANTINE_IN", quantity: -p.quantity, note: p.reason, userId: p.userId,
    referenceType: p.referenceType ?? "QualityInspection", referenceId: p.referenceId ?? null,
    referenceNumber: p.referenceNumber ?? null,
  });
  const item = await tx.inventoryItem.findUnique({
    where: { productId_warehouseId: { productId: p.productId, warehouseId: p.warehouseId } },
  });
  if (item) {
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { quarantinedQty: item.quarantinedQty + p.quantity },
    });
  }
}

/** Release from quarantine back to available stock. */
export async function releaseFromQuarantine(
  tx: Tx,
  p: { companyId: string; productId: string; warehouseId: string; quantity: number; userId?: string }
) {
  const item = await tx.inventoryItem.findUnique({
    where: { productId_warehouseId: { productId: p.productId, warehouseId: p.warehouseId } },
  });
  if (!item || item.quarantinedQty < p.quantity - 0.00001) {
    throw ApiError.conflict("Not enough quarantined stock to release.");
  }
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { quarantinedQty: item.quarantinedQty - p.quantity },
  });
  return postMovement(tx, {
    companyId: p.companyId, productId: p.productId, warehouseId: p.warehouseId,
    type: "QUARANTINE_OUT", quantity: p.quantity, userId: p.userId,
    referenceType: "QualityInspection",
  });
}

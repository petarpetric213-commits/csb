// ============================================================================
// Production service — BOM, production orders (consume components, produce goods).
// ============================================================================

import prisma from "@/lib/db";
import type { Prisma } from "@/lib/prisma";
import { ApiError } from "@/server/errors";
import { nextNumber } from "@/server/sequence";
import { logAudit } from "@/server/audit";
import {
  postMovement, reserveStock, releaseReservation, consumeStock,
} from "@/server/services/inventory";
import { notifyPermissionHolders } from "@/server/services/notifications";
import { canTransition, PRODUCTION_ACTIONS } from "@/lib/status";
import { round2 } from "@/lib/utils";

type Tx = Prisma.TransactionClient | typeof prisma;

/** Expand a BOM recursively (nested BOMs) → flat component list with total qty. */
export async function explodeBom(
  tx: Tx,
  bomId: string,
  quantity: number,
  depth = 0
): Promise<{ productId: string; quantity: number; unit: string; wastePercent: number }[]> {
  if (depth > 8) throw ApiError.badRequest("BOM nesting too deep (possible cycle).");
  const bom = await tx.bom.findUnique({ where: { id: bomId }, include: { items: true } });
  if (!bom) throw ApiError.notFound("BOM not found.");
  const out: { productId: string; quantity: number; unit: string; wastePercent: number }[] = [];
  for (const item of bom.items) {
    const needed = quantity * item.quantity * (1 + item.wastePercent / 100);
    const nested = await tx.bom.findFirst({
      where: { productId: item.componentProductId, status: "ACTIVE" },
      include: { items: true },
    });
    if (nested && nested.id !== bomId && nested.items.length > 0 && depth < 2) {
      const sub = await explodeBom(tx, nested.id, needed, depth + 1);
      for (const s of sub) {
        const existing = out.find((o) => o.productId === s.productId);
        if (existing) existing.quantity = round2(existing.quantity + s.quantity);
        else out.push({ ...s });
      }
    } else {
      const existing = out.find((o) => o.productId === item.componentProductId);
      if (existing) existing.quantity = round2(existing.quantity + needed);
      else out.push({ productId: item.componentProductId, quantity: round2(needed), unit: item.unit, wastePercent: item.wastePercent });
    }
  }
  return out;
}

export async function createProductionOrder(
  tx: Tx,
  p: {
    companyId: string; userId: string; productId: string; quantity: number;
    bomId?: string | null; warehouseId?: string | null; workCenterId?: string | null;
    responsibleId?: string | null; priority?: string; plannedStart?: Date | null;
    plannedEnd?: Date | null; notes?: string | null;
  }
) {
  const product = await tx.product.findFirst({ where: { id: p.productId, companyId: p.companyId, deletedAt: null } });
  if (!product) throw ApiError.notFound("Product not found.");
  if (p.quantity <= 0) throw ApiError.badRequest("Quantity must be positive.");

  const bom = p.bomId
    ? await tx.bom.findFirst({ where: { id: p.bomId, companyId: p.companyId } })
    : await tx.bom.findFirst({ where: { productId: p.productId, companyId: p.companyId, status: "ACTIVE" } });

  const warehouse = p.warehouseId
    ? await tx.warehouse.findFirst({ where: { id: p.warehouseId, companyId: p.companyId } })
    : await tx.warehouse.findFirst({ where: { companyId: p.companyId, isDefault: true } })
      ?? await tx.warehouse.findFirst({ where: { companyId: p.companyId } });
  if (!warehouse) throw ApiError.badRequest("No warehouse available.");

  const orderNumber = await nextNumber(tx, p.companyId, "MO");
  const components = bom
    ? await explodeBom(tx, bom.id, p.quantity)
    : [];

  const order = await tx.productionOrder.create({
    data: {
      companyId: p.companyId, orderNumber, productId: p.productId,
      bomId: bom?.id ?? null, quantity: p.quantity, status: "PLANNED",
      priority: p.priority ?? "NORMAL",
      plannedStart: p.plannedStart ?? null, plannedEnd: p.plannedEnd ?? null,
      warehouseId: warehouse.id, workCenterId: p.workCenterId ?? null,
      responsibleId: p.responsibleId ?? null, notes: p.notes ?? null,
      createdById: p.userId,
      components: {
        create: components.map((c) => ({
          productId: c.productId, requiredQty: c.quantity, warehouseId: warehouse.id,
        })),
      },
    },
    include: { components: true },
  });

  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "CREATED",
    entityType: "ProductionOrder", entityId: order.id, entityNumber: order.orderNumber,
    summary: `Created production order ${order.orderNumber} for ${p.quantity} × ${product.name}${bom ? ` (BOM v${bom.version})` : ""}`,
    after: { quantity: p.quantity, components: components.length },
  });
  return order;
}

export async function productionOrderAction(
  tx: Tx,
  p: { productionOrderId: string; companyId: string; userId: string; action: string; producedQuantity?: number }
) {
  const order = await tx.productionOrder.findFirst({
    where: { id: p.productionOrderId, companyId: p.companyId, deletedAt: null },
    include: { components: true, product: true },
  });
  if (!order) throw ApiError.notFound("Production order not found.");
  const t = PRODUCTION_ACTIONS[p.action];
  if (!t) throw ApiError.badRequest(`Unknown action "${p.action}".`);
  if (!canTransition(PRODUCTION_ACTIONS, p.action, order.status)) {
    throw ApiError.conflict(
      `Action "${p.action}" is not allowed while the order is ${order.status.replace(/_/g, " ").toLowerCase()}.`
    );
  }

  // ---------- CANCEL — release reserved material ----------
  if (p.action === "cancel") {
    if (order.materialStatus === "RESERVED" && order.warehouseId) {
      for (const c of order.components) {
        if (c.issuedQty > 0) continue;
        await releaseReservation(tx, {
          companyId: p.companyId, productId: c.productId,
          warehouseId: c.warehouseId ?? order.warehouseId, quantity: c.requiredQty,
        });
      }
    }
    await tx.productionOrder.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await logAudit(tx, {
      companyId: p.companyId, userId: p.userId, action: "STATUS_CHANGED",
      entityType: "ProductionOrder", entityId: order.id, entityNumber: order.orderNumber,
      summary: `Production order ${order.orderNumber} cancelled`,
      before: { status: order.status }, after: { status: "CANCELLED" },
    });
    return { status: "CANCELLED" };
  }

  // ---------- RELEASE — reserve components ----------
  if (p.action === "release") {
    if (!order.warehouseId) throw ApiError.conflict("No output warehouse assigned.");
    for (const c of order.components) {
      await reserveStock(tx, {
        companyId: p.companyId, productId: c.productId,
        warehouseId: c.warehouseId ?? order.warehouseId, quantity: c.requiredQty,
      });
    }
    await tx.productionOrder.update({
      where: { id: order.id },
      data: { status: "RELEASED", releasedAt: new Date(), materialStatus: "RESERVED" },
    });
    await logAudit(tx, {
      companyId: p.companyId, userId: p.userId, action: "STATUS_CHANGED",
      entityType: "ProductionOrder", entityId: order.id, entityNumber: order.orderNumber,
      summary: `Production order ${order.orderNumber} released — ${order.components.length} components reserved`,
      before: { status: order.status }, after: { status: "RELEASED" },
    });
    await notifyPermissionHolders(tx, {
      companyId: p.companyId, permission: "production.read", type: "PRODUCTION_DELAY",
      title: `Production order released: ${order.orderNumber}`,
      body: `${order.quantity} × ${order.product.name} — materials reserved and ready to start.`,
      entityType: "ProductionOrder", entityId: order.id,
    });
    return { status: "RELEASED" };
  }

  // ---------- START — issue (consume) components from stock ----------
  if (p.action === "start") {
    if (!order.warehouseId) throw ApiError.conflict("No output warehouse assigned.");
    for (const c of order.components) {
      if (c.issuedQty >= c.requiredQty - 0.00001) continue;
      await consumeStock(tx, {
        companyId: p.companyId, productId: c.productId,
        warehouseId: c.warehouseId ?? order.warehouseId,
        quantity: c.requiredQty, type: "PRODUCTION_CONSUMPTION",
        referenceType: "ProductionOrder", referenceId: order.id, referenceNumber: order.orderNumber,
        userId: p.userId,
      });
      await tx.productionOrderComponent.update({
        where: { id: c.id },
        data: { issuedQty: c.requiredQty },
      });
    }
    await tx.productionOrder.update({
      where: { id: order.id },
      data: { status: "IN_PROGRESS", actualStart: new Date(), materialStatus: "ISSUED" },
    });
    await logAudit(tx, {
      companyId: p.companyId, userId: p.userId, action: "STATUS_CHANGED",
      entityType: "ProductionOrder", entityId: order.id, entityNumber: order.orderNumber,
      summary: `Production order ${order.orderNumber} started — ${order.components.length} components issued from stock`,
      before: { status: order.status }, after: { status: "IN_PROGRESS" },
    });
    return { status: "IN_PROGRESS" };
  }

  // ---------- COMPLETE — produce finished goods into warehouse ----------
  if (p.action === "complete") {
    if (!order.warehouseId) throw ApiError.conflict("No output warehouse assigned.");
    const producedQty = p.producedQuantity ?? order.quantity;
    if (producedQty <= 0) throw ApiError.badRequest("Produced quantity must be positive.");
    await postMovement(tx, {
      companyId: p.companyId, productId: order.productId, warehouseId: order.warehouseId,
      type: "PRODUCTION_OUTPUT", quantity: producedQty,
      unitCost: order.product.purchasePrice || null,
      referenceType: "ProductionOrder", referenceId: order.id, referenceNumber: order.orderNumber,
      batchNumber: `B-${order.orderNumber.split("-").pop()}`,
      userId: p.userId,
    });
    await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        status: "COMPLETED", actualEnd: new Date(), completedAt: new Date(),
        producedQuantity: producedQty,
      },
    });
    await logAudit(tx, {
      companyId: p.companyId, userId: p.userId, action: "COMPLETED",
      entityType: "ProductionOrder", entityId: order.id, entityNumber: order.orderNumber,
      summary: `Production order ${order.orderNumber} completed — ${producedQty} × ${order.product.name} produced`,
      after: { producedQuantity: producedQty },
    });
    return { status: "COMPLETED" };
  }

  // ---------- finishProduction / pause / resume ----------
  const stamps: Record<string, Record<string, Date>> = {
    QUALITY_CONTROL: {},
    PAUSED: {},
    IN_PROGRESS: { actualStart: order.actualStart ?? new Date() },
  };
  await tx.productionOrder.update({
    where: { id: order.id },
    data: { status: t.to, ...(stamps[t.to] ?? {}) },
  });
  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "STATUS_CHANGED",
    entityType: "ProductionOrder", entityId: order.id, entityNumber: order.orderNumber,
    summary: `Production order ${order.orderNumber}: ${order.status} → ${t.to.replace(/_/g, " ")}`,
    before: { status: order.status }, after: { status: t.to },
  });
  return { status: t.to };
}

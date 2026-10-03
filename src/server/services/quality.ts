// ============================================================================
// Quality & MRP services.
// ============================================================================

import prisma from "@/lib/db";
import type { Prisma } from "@/lib/prisma";
import { ApiError } from "@/server/errors";
import { nextNumber } from "@/server/sequence";
import { logAudit } from "@/server/audit";
import { quarantineStock } from "@/server/services/inventory";
import { notifyPermissionHolders } from "@/server/services/notifications";
import { explodeBom } from "@/server/services/production";

type Tx = Prisma.TransactionClient | typeof prisma;

export type InspectionCriteria = { name: string; method?: string; target?: string; tolerance?: string };

export async function createInspection(
  tx: Tx,
  p: {
    companyId: string; userId: string; productId: string;
    batchNumber?: string; sourceType?: string; sourceId?: string;
    productionOrderId?: string; inspectorId?: string;
    inspectedAt?: Date; criteria?: InspectionCriteria[];
    notes?: string; quantity?: number; warehouseId?: string;
  }
) {
  const product = await tx.product.findFirst({ where: { id: p.productId, companyId: p.companyId, deletedAt: null } });
  if (!product) throw ApiError.notFound("Product not found.");
  const inspectionNumber = await nextNumber(tx, p.companyId, "QI", p.inspectedAt ?? new Date());

  const inspection = await tx.qualityInspection.create({
    data: {
      companyId: p.companyId, inspectionNumber, productId: p.productId,
      batchNumber: p.batchNumber ?? null,
      sourceType: p.sourceType ?? "GOODS_RECEIPT", sourceId: p.sourceId ?? null,
      productionOrderId: p.productionOrderId ?? null,
      inspectorId: p.inspectorId ?? p.userId,
      inspectedAt: p.inspectedAt ?? new Date(),
      result: "PENDING",
      criteria: p.criteria ? JSON.stringify(p.criteria) : null,
      notes: p.notes ?? null,
      createdById: p.userId,
    },
  });

  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "CREATED",
    entityType: "QualityInspection", entityId: inspection.id, entityNumber: inspection.inspectionNumber,
    summary: `Quality inspection ${inspection.inspectionNumber} created for ${product.name}${p.batchNumber ? ` (batch ${p.batchNumber})` : ""}`,
    after: { productId: p.productId, batchNumber: p.batchNumber ?? null },
  });
  return inspection;
}

/** Record an inspection result. FAIL automatically quarantines the given stock. */
export async function recordInspectionResult(
  tx: Tx,
  p: {
    inspectionId: string; companyId: string; userId: string;
    result: "PASS" | "FAIL" | "CONDITIONAL";
    measurements?: { criterion: string; value: string; ok: boolean }[];
    notes?: string;
    quarantineQty?: number; warehouseId?: string;
  }
) {
  const inspection = await tx.qualityInspection.findFirst({
    where: { id: p.inspectionId, companyId: p.companyId },
    include: { product: true },
  });
  if (!inspection) throw ApiError.notFound("Inspection not found.");
  if (inspection.result !== "PENDING") {
    throw ApiError.conflict(`This inspection already has a result (${inspection.result}).`);
  }

  let quarantined = 0;
  if (p.result === "FAIL") {
    const qty = p.quarantineQty ?? 0;
    const warehouseId =
      p.warehouseId ??
      (await tx.warehouse.findFirst({ where: { companyId: p.companyId, isDefault: true } }))?.id;
    if (qty > 0 && warehouseId) {
      await quarantineStock(tx, {
        companyId: p.companyId, productId: inspection.productId, warehouseId,
        quantity: qty, reason: `Quality fail — ${inspection.inspectionNumber}`,
        userId: p.userId, referenceType: "QualityInspection",
        referenceId: inspection.id, referenceNumber: inspection.inspectionNumber,
      });
      quarantined = qty;
    }
  }

  await tx.qualityInspection.update({
    where: { id: inspection.id },
    data: {
      result: p.result,
      measurements: p.measurements ? JSON.stringify(p.measurements) : null,
      notes: p.notes ?? inspection.notes,
    },
  });

  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "QUALITY_RESULT",
    entityType: "QualityInspection", entityId: inspection.id, entityNumber: inspection.inspectionNumber,
    summary: `Inspection ${inspection.inspectionNumber} (${inspection.product.name}): ${p.result}${quarantined ? ` — ${quarantined} units quarantined` : ""}`,
    after: { result: p.result, quarantined },
  });

  if (p.result === "FAIL") {
    await notifyPermissionHolders(tx, {
      companyId: p.companyId, permission: "quality.read", type: "QUALITY_FAIL", priority: "URGENT",
      title: `Quality failure: ${inspection.product.name}`,
      body: `Inspection ${inspection.inspectionNumber} FAILED${quarantined ? ` — ${quarantined} units quarantined` : ""}.`,
      entityType: "QualityInspection", entityId: inspection.id,
    });
  }

  return { result: p.result, quarantined };
}

// ============================================================================
// MRP — Material Requirements Planning
// ============================================================================

export type MrpRow = {
  productId: string;
  sku: string;
  name: string;
  productType: string;
  unit: string;
  physical: number;
  reserved: number;
  available: number;
  incoming: number;
  openDemand: number;
  reorderPoint: number;
  minStock: number;
  shortage: number; // negative = surplus
  recommendation: "NONE" | "PURCHASE" | "PRODUCE";
  recommendedQty: number;
  bomId: string | null;
};

export async function computeMrp(companyId: string): Promise<MrpRow[]> {
  const products = await prisma.product.findMany({
    where: { companyId, deletedAt: null, isStockTracked: true, status: "ACTIVE" },
    include: { inventoryItems: true },
  });
  const productIds = products.map((p) => p.id);

  // Expected incoming = open PO lines
  const poLines = await prisma.purchaseOrderItem.findMany({
    where: {
      purchaseOrder: { companyId, status: { in: ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] }, deletedAt: null },
      productId: { in: productIds },
    },
    select: { productId: true, quantity: true, receivedQuantity: true },
  });
  // Open demand = open SO lines (not shipped)
  const soLines = await prisma.salesOrderItem.findMany({
    where: {
      order: { companyId, status: { in: ["DRAFT", "CONFIRMED", "RESERVED", "PICKING", "PACKED", "PARTIALLY_SHIPPED"] }, deletedAt: null },
      productId: { in: productIds },
    },
    select: { productId: true, quantity: true, shippedQuantity: true },
  });
  // Planned production demand (components) and output
  const moComponents = await prisma.productionOrderComponent.findMany({
    where: {
      productionOrder: { companyId, status: { in: ["PLANNED", "RELEASED"] }, deletedAt: null },
    },
    select: { productId: true, requiredQty: true, issuedQty: true },
  });
  const moOutputs = await prisma.productionOrder.findMany({
    where: { companyId, status: { in: ["PLANNED", "RELEASED", "IN_PROGRESS", "PAUSED", "QUALITY_CONTROL"] }, deletedAt: null },
    select: { productId: true, quantity: true },
  });

  const incoming = new Map<string, number>();
  for (const l of poLines) incoming.set(l.productId, (incoming.get(l.productId) ?? 0) + (l.quantity - l.receivedQuantity));
  const demand = new Map<string, number>();
  for (const l of soLines) demand.set(l.productId, (demand.get(l.productId) ?? 0) + (l.quantity - l.shippedQuantity));
  for (const c of moComponents) demand.set(c.productId, (demand.get(c.productId) ?? 0) + Math.max(0, c.requiredQty - c.issuedQty));
  for (const o of moOutputs) incoming.set(o.productId, (incoming.get(o.productId) ?? 0) + o.quantity);

  const boms = await prisma.bom.findMany({
    where: { companyId, status: "ACTIVE" },
    select: { id: true, productId: true },
  });
  const bomByProduct = new Map(boms.map((b) => [b.productId, b.id]));

  const rows: MrpRow[] = [];
  for (const p of products) {
    const physical = p.inventoryItems.reduce((s, i) => s + i.physicalQty, 0);
    const reserved = p.inventoryItems.reduce((s, i) => s + i.reservedQty, 0);
    const available = physical - reserved;
    const inc = incoming.get(p.id) ?? 0;
    const dem = demand.get(p.id) ?? 0;
    const shortage = dem + p.reorderPoint - (available + inc);

    let recommendation: MrpRow["recommendation"] = "NONE";
    let recommendedQty = 0;
    if (shortage > 0) {
      const target = Math.ceil((shortage + (p.minStock || 0)) / 10) * 10; // round up to tens
      recommendedQty = target;
      recommendation = bomByProduct.has(p.id) ? "PRODUCE" : "PURCHASE";
    }

    rows.push({
      productId: p.id, sku: p.sku, name: p.name, productType: p.productType, unit: p.unit,
      physical: Math.round(physical * 100) / 100,
      reserved: Math.round(reserved * 100) / 100,
      available: Math.round(available * 100) / 100,
      incoming: Math.round(inc * 100) / 100,
      openDemand: Math.round(dem * 100) / 100,
      reorderPoint: p.reorderPoint, minStock: p.minStock,
      shortage: Math.round(shortage * 100) / 100,
      recommendation, recommendedQty, bomId: bomByProduct.get(p.id) ?? null,
    });
  }
  return rows.sort((a, b) => b.shortage - a.shortage);
}

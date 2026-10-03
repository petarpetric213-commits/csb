import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "products.read" }, async ({ params, session }) => {
  const product = await prisma.product.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    include: {
      category: true,
      supplier: { select: { id: true, companyName: true } },
      variants: true,
      priceHistory: { orderBy: { validFrom: "desc" }, take: 10 },
      inventoryItems: { include: { warehouse: { select: { code: true, name: true } }, location: { select: { code: true } } } },
      boms: { include: { items: { include: { component: { select: { sku: true, name: true, unit: true } } } } } },
      bomComponents: { include: { bom: { include: { product: { select: { sku: true, name: true } } } } } },
    },
  });
  if (!product) throw ApiError.notFound("Product not found.");

  const [movements, orderStats] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, movementNumber: true, type: true, quantity: true, createdAt: true, referenceNumber: true, warehouse: { select: { code: true } } },
    }),
    prisma.salesOrderItem.aggregate({
      where: { product: { id: product.id }, order: { deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } } },
      _sum: { quantity: true },
    }),
  ]);

  return ok({
    ...product,
    movements,
    soldQuantity: orderStats._sum.quantity ?? 0,
  });
});

const patchSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  shortDescription: z.string().max(400).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  productType: z.enum(["FINISHED_GOOD", "RAW_MATERIAL", "SEMIFINISHED", "SERVICE"]).optional(),
  unit: z.enum(["pcs", "kg", "g", "l", "box", "pallet", "m"]).optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  salesPrice: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  minStock: z.coerce.number().min(0).optional(),
  maxStock: z.coerce.number().min(0).optional(),
  reorderPoint: z.coerce.number().min(0).optional(),
  weightKg: z.coerce.number().min(0).nullable().optional(),
  shelfLifeDays: z.coerce.number().int().min(0).max(3650).nullable().optional(),
  supplierId: z.string().nullable().optional(),
  isStockTracked: z.coerce.boolean().optional(),
  isBatchTracked: z.coerce.boolean().optional(),
  isExpiryTracked: z.coerce.boolean().optional(),
  status: z.enum(["ACTIVE", "DRAFT", "DISCONTINUED"]).optional(),
});

export const PATCH = route({ permission: "products.update", schema: patchSchema }, async ({ params, body, session }) => {
  const existing = await prisma.product.findFirst({ where: { id: params.id, companyId: session.companyId, deletedAt: null } });
  if (!existing) throw ApiError.notFound("Product not found.");
  const { categoryId, supplierId, shortDescription, ...rest } = body;

  // Price change → documented in price history (German ERP convention).
  if (body.salesPrice !== undefined && body.salesPrice !== existing.salesPrice) {
    await prisma.productPriceHistory.create({
      data: {
        productId: existing.id,
        price: body.salesPrice, validFrom: new Date(),
      },
    });
  }

  const product = await prisma.product.update({
    where: { id: existing.id },
    data: {
      ...rest,
      shortDescription: shortDescription !== undefined ? shortDescription || null : undefined,
      categoryId: categoryId !== undefined ? categoryId || null : undefined,
      supplierId: supplierId !== undefined ? supplierId || null : undefined,
    },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "UPDATED",
    entityType: "Product", entityId: product.id, entityNumber: product.sku,
    summary: `Updated product ${product.name} (${product.sku})`,
    before: { salesPrice: existing.salesPrice, status: existing.status, reorderPoint: existing.reorderPoint },
    after: { salesPrice: product.salesPrice, status: product.status, reorderPoint: product.reorderPoint },
  });
  return ok(product);
});

export const DELETE = route({ permission: "products.delete" }, async ({ params, session }) => {
  const existing = await prisma.product.findFirst({ where: { id: params.id, companyId: session.companyId, deletedAt: null } });
  if (!existing) throw ApiError.notFound("Product not found.");
  const used = await prisma.salesOrderItem.count({ where: { productId: existing.id } });
  if (used > 0) {
    await prisma.product.update({ where: { id: existing.id }, data: { deletedAt: new Date(), status: "DISCONTINUED" } });
    await logAudit(prisma, {
      companyId: session.companyId, userId: session.user.id, action: "DELETED",
      entityType: "Product", entityId: existing.id, entityNumber: existing.sku,
      summary: `Discontinued product ${existing.name} (used in ${used} order lines — archived, not removed)`,
    });
    return ok({ archived: true });
  }
  await prisma.product.delete({ where: { id: existing.id } });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "DELETED",
    entityType: "Product", entityId: existing.id, entityNumber: existing.sku,
    summary: `Deleted product ${existing.name}`,
  });
  return ok({ deleted: true });
});

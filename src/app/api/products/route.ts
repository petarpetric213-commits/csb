import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { nextNumber } from "@/server/sequence";
import { z } from "zod";

export const GET = route({ permission: "products.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const status = query.get("status");
  const categoryId = query.get("categoryId");
  const productType = query.get("productType");

  const where = {
    companyId: session.companyId,
    deletedAt: null,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(productType && productType !== "ALL" ? { productType } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(q
      ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }, { brand: { contains: q } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        supplier: { select: { companyName: true } },
        inventoryItems: { select: { physicalQty: true, reservedQty: true, quarantinedQty: true } },
      },
      orderBy: { sku: query.get("sorting")?.includes("desc") ? "desc" : "asc" },
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);

  return okPaginated(
    items.map((p) => {
      const physical = p.inventoryItems.reduce((s, i) => s + i.physicalQty, 0);
      const reserved = p.inventoryItems.reduce((s, i) => s + i.reservedQty, 0);
      const quarantined = p.inventoryItems.reduce((s, i) => s + i.quarantinedQty, 0);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category?.name ?? null,
        supplier: p.supplier?.companyName ?? null,
        productType: p.productType,
        unit: p.unit,
        purchasePrice: p.purchasePrice,
        salesPrice: p.salesPrice,
        taxRate: p.taxRate,
        reorderPoint: p.reorderPoint,
        minStock: p.minStock,
        status: p.status,
        isBatchTracked: p.isBatchTracked,
        isExpiryTracked: p.isExpiryTracked,
        physical,
        reserved,
        quarantined,
        available: physical - reserved,
        low: p.isStockTracked && physical - reserved <= p.reorderPoint,
      };
    }),
    total,
    page,
    pageSize
  );
});

const createSchema = z.object({
  sku: z.string().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, "Only letters, digits, dot, dash, underscore"),
  name: z.string().min(2).max(160),
  shortDescription: z.string().max(400).optional().or(z.literal("")),
  categoryId: z.string().optional().nullable(),
  productType: z.enum(["FINISHED_GOOD", "RAW_MATERIAL", "SEMIFINISHED", "SERVICE"]).default("FINISHED_GOOD"),
  unit: z.enum(["pcs", "kg", "g", "l", "box", "pallet", "m"]).default("pcs"),
  purchasePrice: z.coerce.number().min(0).default(0),
  salesPrice: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(19),
  minStock: z.coerce.number().min(0).default(0),
  maxStock: z.coerce.number().min(0).default(0),
  reorderPoint: z.coerce.number().min(0).default(0),
  weightKg: z.coerce.number().min(0).optional(),
  shelfLifeDays: z.coerce.number().int().min(0).max(3650).optional(),
  supplierId: z.string().optional().nullable(),
  isStockTracked: z.coerce.boolean().default(true),
  isBatchTracked: z.coerce.boolean().default(false),
  isExpiryTracked: z.coerce.boolean().default(false),
  status: z.enum(["ACTIVE", "DRAFT", "DISCONTINUED"]).default("ACTIVE"),
});

export const POST = route({ permission: "products.create", schema: createSchema }, async ({ body, session }) => {
  const dupe = await prisma.product.findFirst({ where: { companyId: session.companyId, sku: body.sku } });
  if (dupe) {
    return Response.json(
      { error: { code: "VALIDATION", message: "Please correct the highlighted fields.", details: [{ path: "sku", message: `SKU ${body.sku} already exists.` }] } },
      { status: 400 }
    );
  }
  const { categoryId, supplierId, shortDescription, ...rest } = body;
  const product = await prisma.product.create({
    data: {
      ...rest,
      shortDescription: shortDescription || null,
      categoryId: categoryId || null,
      supplierId: supplierId || null,
      companyId: session.companyId,
    },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "CREATED",
    entityType: "Product", entityId: product.id, entityNumber: product.sku,
    summary: `Created product ${product.name} (${product.sku})`,
    after: { sku: product.sku, salesPrice: product.salesPrice, productType: product.productType },
  });
  return Response.json({ data: product }, { status: 201 });
});

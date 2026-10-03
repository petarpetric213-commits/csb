import { route, ok, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "boms.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query, 50);
  const q = query.get("q")?.trim();
  const where = {
    companyId: session.companyId,
    ...(q ? { OR: [{ product: { name: { contains: q } } }, { product: { sku: { contains: q } } }, { name: { contains: q } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.bom.findMany({
      where,
      include: {
        product: { select: { sku: true, name: true, unit: true } },
        items: { include: { component: { select: { sku: true, name: true, unit: true } } } },
        _count: { select: { productionOrders: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.bom.count({ where }),
  ]);
  return okPaginated(items.map((b) => ({ ...b, usageCount: b._count.productionOrders })), total, page, pageSize);
});

const createSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(2).max(120),
  notes: z.string().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        componentProductId: z.string().min(1),
        quantity: z.coerce.number().positive(),
        wastePercent: z.coerce.number().min(0).max(50).optional(),
      })
    )
    .min(1, "A BOM needs at least one component."),
});

export const POST = route({ permission: "boms.create", schema: createSchema }, async ({ body, session }) => {
  const product = await prisma.product.findFirst({
    where: { id: body.productId, companyId: session.companyId, deletedAt: null },
  });
  if (!product) throw ApiError.notFound("Product not found.");

  const existing = await prisma.bom.findFirst({
    where: { productId: product.id, status: "ACTIVE" },
  });
  if (existing) {
    throw ApiError.conflict(`An active BOM already exists for ${product.name} (v${existing.version}). Archive it first.`);
  }

  // validate components exist in company
  const componentIds = body.items.map((i: { componentProductId: string }) => i.componentProductId);
  const componentCount = await prisma.product.count({
    where: { id: { in: componentIds }, companyId: session.companyId, deletedAt: null },
  });
  if (componentCount !== componentIds.length) throw ApiError.badRequest("One or more components were not found.");

  const bom = await prisma.bom.create({
    data: {
      companyId: session.companyId,
      productId: product.id,
      name: body.name,
      notes: body.notes || null,
      status: "ACTIVE",
      items: {
        create: body.items.map((i: { componentProductId: string; quantity: number; wastePercent?: number }) => ({
          componentProductId: i.componentProductId,
          quantity: i.quantity,
          wastePercent: i.wastePercent ?? 0,
        })),
      },
    },
    include: { items: true },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "CREATED",
    entityType: "Bom", entityId: bom.id, entityNumber: `${product.sku} v${bom.version}`,
    summary: `Created BOM "${bom.name}" for ${product.name} with ${bom.items.length} components`,
    after: { productId: product.id, items: body.items.length },
  });
  return Response.json({ data: bom }, { status: 201 });
});

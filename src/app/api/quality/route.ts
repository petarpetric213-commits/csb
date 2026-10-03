import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { createInspection } from "@/server/services/quality";
import { z } from "zod";

export const GET = route({ permission: "quality.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const result = query.get("result");

  const where = {
    companyId: session.companyId,
    ...(result && result !== "ALL" ? { result } : {}),
    ...(q
      ? {
          OR: [
            { inspectionNumber: { contains: q } },
            { batchNumber: { contains: q } },
            { product: { name: { contains: q } } },
            { product: { sku: { contains: q } } },
          ],
        }
      : {}),
  };

  const [items, total, stats] = await Promise.all([
    prisma.qualityInspection.findMany({
      where,
      orderBy: { inspectedAt: "desc" },
      include: {
        product: { select: { sku: true, name: true, unit: true } },
        inspector: { select: { name: true } },
        productionOrder: { select: { orderNumber: true } },
      },
      skip,
      take,
    }),
    prisma.qualityInspection.count({ where }),
    prisma.qualityInspection.groupBy({
      by: ["result"],
      where: { companyId: session.companyId },
      _count: true,
    }),
  ]);

  return Response.json({
    data: items,
    meta: {
      total, page, pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      byResult: Object.fromEntries(stats.map((s) => [s.result, s._count])),
    },
  });
});

const createSchema = z.object({
  productId: z.string().min(1),
  batchNumber: z.string().max(40).optional(),
  sourceType: z.enum(["GOODS_RECEIPT", "PRODUCTION", "ROUTINE", "CUSTOMER_COMPLAINT"]).default("ROUTINE"),
  sourceId: z.string().optional().nullable(),
  productionOrderId: z.string().optional().nullable(),
  quantity: z.coerce.number().positive().optional(),
  warehouseId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  criteria: z
    .array(z.object({ criterion: z.string().max(120), target: z.string().max(120).optional() }))
    .optional(),
});

export const POST = route({ permission: "quality.create", schema: createSchema }, async ({ body, session }) => {
  const inspection = await prisma.$transaction((tx) =>
    createInspection(tx, {
      companyId: session.companyId,
      userId: session.user.id,
      productId: body.productId,
      batchNumber: body.batchNumber,
      sourceType: body.sourceType,
      sourceId: body.sourceId ?? null,
      productionOrderId: body.productionOrderId ?? null,
      quantity: body.quantity,
      warehouseId: body.warehouseId ?? null,
      notes: body.notes || null,
      criteria: body.criteria,
    })
  );
  return Response.json({ data: { id: inspection.id, inspectionNumber: inspection.inspectionNumber } }, { status: 201 });
});

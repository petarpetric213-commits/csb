import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { createProductionOrder } from "@/server/services/production";
import { z } from "zod";

export const GET = route({ permission: "production.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const status = query.get("status");

  const where = {
    companyId: session.companyId,
    deletedAt: null,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q } },
            { product: { name: { contains: q } } },
            { product: { sku: { contains: q } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.productionOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { sku: true, name: true, unit: true } },
        workCenter: { select: { code: true, name: true } },
        responsible: { select: { firstName: true, lastName: true } },
        _count: { select: { components: true } },
      },
      skip,
      take,
    }),
    prisma.productionOrder.count({ where }),
  ]);

  return okPaginated(
    items.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      productId: o.productId,
      product: o.product.name,
      sku: o.product.sku,
      status: o.status,
      priority: o.priority,
      quantity: o.quantity,
      producedQuantity: o.producedQuantity,
      unit: o.product.unit,
      workCenter: o.workCenter?.name ?? null,
      responsible: o.responsible ? `${o.responsible.firstName} ${o.responsible.lastName}` : null,
      plannedStart: o.plannedStart,
      plannedEnd: o.plannedEnd,
      actualStart: o.actualStart,
      actualEnd: o.actualEnd,
      materialStatus: o.materialStatus,
      componentCount: o._count.components,
    })),
    total,
    page,
    pageSize
  );
});

const createSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  bomId: z.string().optional().nullable(),
  warehouseId: z.string().optional().nullable(),
  workCenterId: z.string().optional().nullable(),
  responsibleId: z.string().optional().nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  plannedStart: z.string().optional().nullable(),
  plannedEnd: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const POST = route({ permission: "production.create", schema: createSchema }, async ({ body, session }) => {
  const mo = await prisma.$transaction((tx) =>
    createProductionOrder(tx, {
      companyId: session.companyId,
      userId: session.user.id,
      productId: body.productId,
      quantity: body.quantity,
      bomId: body.bomId || null,
      warehouseId: body.warehouseId || null,
      workCenterId: body.workCenterId || null,
      responsibleId: body.responsibleId || null,
      priority: body.priority,
      plannedStart: body.plannedStart ? new Date(body.plannedStart) : null,
      plannedEnd: body.plannedEnd ? new Date(body.plannedEnd) : null,
      notes: body.notes || null,
    })
  );
  return Response.json({ data: { id: mo.id, orderNumber: mo.orderNumber } }, { status: 201 });
});

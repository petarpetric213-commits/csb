import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { createPurchaseOrder, type PoItemInput } from "@/server/services/purchasing";
import { z } from "zod";

export const GET = route({ permission: "purchasing.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const status = query.get("status");

  const where = {
    companyId: session.companyId,
    deletedAt: null,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(q ? { OR: [{ orderNumber: { contains: q } }, { supplier: { companyName: { contains: q } } }] } : {}),
  };

  const [items, total, totals] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { orderDate: "desc" },
      include: {
        supplier: { select: { companyName: true } },
        warehouse: { select: { code: true } },
        _count: { select: { items: true, goodsReceipts: true } },
      },
      skip,
      take,
    }),
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.aggregate({ where, _sum: { total: true } }),
  ]);

  return Response.json({
    data: items.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      supplierId: o.supplierId,
      supplier: o.supplier.companyName,
      status: o.status,
      orderDate: o.orderDate,
      expectedDeliveryDate: o.expectedDeliveryDate,
      total: o.total,
      currency: o.currency,
      warehouse: o.warehouse?.code ?? null,
      itemCount: o._count.items,
      receiptCount: o._count.goodsReceipts,
    })),
    meta: {
      total, page, pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      sumTotal: totals._sum.total ?? 0,
    },
  });
});

const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  description: z.string().max(400).optional(),
});

const createSchema = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().optional().nullable(),
  expectedDeliveryDate: z.string().optional().nullable(),
  paymentTermDays: z.coerce.number().int().min(0).max(180).optional(),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(itemSchema).min(1, "At least one line item is required."),
});

export const POST = route({ permission: "purchasing.create", schema: createSchema }, async ({ body, session }) => {
  const items: PoItemInput[] = body.items;
  const po = await prisma.$transaction((tx) =>
    createPurchaseOrder(tx, {
      companyId: session.companyId,
      userId: session.user.id,
      supplierId: body.supplierId,
      warehouseId: body.warehouseId || null,
      expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null,
      paymentTermDays: body.paymentTermDays,
      notes: body.notes || null,
      items,
    })
  );
  return Response.json({ data: { id: po.id, orderNumber: po.orderNumber } }, { status: 201 });
});

import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { createOrder, type SalesItemInput } from "@/server/services/sales";
import { z } from "zod";

const STATUS_FILTERS: Record<string, string[]> = {
  OPEN: ["DRAFT", "CONFIRMED", "RESERVED", "PICKING", "PACKED", "PARTIALLY_SHIPPED"],
  SHIPPED: ["SHIPPED", "PARTIALLY_SHIPPED"],
  DONE: ["COMPLETED"],
  CANCELLED: ["CANCELLED"],
};

export const GET = route({ permission: "sales.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const status = query.get("status");
  const customerId = query.get("customerId");

  const statusFilter = status && STATUS_FILTERS[status] ? { in: STATUS_FILTERS[status] } : status && status !== "ALL" ? status : undefined;

  const where = {
    companyId: session.companyId,
    deletedAt: null,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(customerId ? { customerId } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q } },
            { customer: { companyName: { contains: q } } },
            { customer: { lastName: { contains: q } } },
          ],
        }
      : {}),
  };

  const [items, total, totals] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      orderBy: { orderDate: "desc" },
      include: {
        customer: { select: { companyName: true, firstName: true, lastName: true } },
        salesRep: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true, shipments: true, invoices: true } },
      },
      skip,
      take,
    }),
    prisma.salesOrder.count({ where }),
    prisma.salesOrder.aggregate({
      where,
      _sum: { total: true },
    }),
  ]);

  return Response.json({
    data: items.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerId: o.customerId,
      customer: o.customer.companyName ?? `${o.customer.firstName ?? ""} ${o.customer.lastName ?? ""}`.trim(),
      status: o.status,
      orderDate: o.orderDate,
      requestedDeliveryDate: o.requestedDeliveryDate,
      total: o.total,
      currency: o.currency,
      salesRep: o.salesRep ? `${o.salesRep.firstName} ${o.salesRep.lastName}` : null,
      itemCount: o._count.items,
      shipmentCount: o._count.shipments,
      invoiceCount: o._count.invoices,
    })),
    meta: { total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)), sumTotal: totals._sum.total ?? 0 },
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
  customerId: z.string().min(1),
  quoteId: z.string().optional().nullable(),
  warehouseId: z.string().optional().nullable(),
  salesRepId: z.string().optional().nullable(),
  requestedDeliveryDate: z.string().optional().nullable(),
  shippingCost: z.coerce.number().min(0).optional(),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(itemSchema).min(1, "At least one line item is required."),
});

export const POST = route({ permission: "sales.create", schema: createSchema }, async ({ body, session }) => {
  const items: SalesItemInput[] = body.items;
  const order = await prisma.$transaction((tx) =>
    createOrder(tx, {
      companyId: session.companyId,
      userId: session.user.id,
      customerId: body.customerId,
      quoteId: body.quoteId || null,
      warehouseId: body.warehouseId || null,
      salesRepId: body.salesRepId || null,
      requestedDeliveryDate: body.requestedDeliveryDate ? new Date(body.requestedDeliveryDate) : null,
      shippingCost: body.shippingCost ?? 0,
      notes: body.notes || null,
      items,
    })
  );
  return Response.json({ data: { id: order.id, orderNumber: order.orderNumber } }, { status: 201 });
});

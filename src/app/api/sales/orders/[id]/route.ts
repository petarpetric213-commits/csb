import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { salesOrderAction } from "@/server/services/sales";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "sales.read" }, async ({ params, session }) => {
  const order = await prisma.salesOrder.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    include: {
      customer: true,
      quote: { select: { id: true, quoteNumber: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      salesRep: { select: { id: true, firstName: true, lastName: true } },
      items: {
        include: { product: { select: { sku: true, name: true, unit: true, isStockTracked: true } } },
        },
      shipments: {
        include: { items: { include: { product: { select: { sku: true } } } } },
        orderBy: { createdAt: "desc" },
      },
      invoices: { orderBy: { issueDate: "desc" }, select: { id: true, invoiceNumber: true, status: true, issueDate: true, dueDate: true, total: true, paidAmount: true } },
    },
  });
  if (!order) throw ApiError.notFound("Sales order not found.");

  // Availability per line for the picking UI.
  const avail = await Promise.all(
    order.items.map(async (it) => {
      const rows = await prisma.inventoryItem.findMany({
        where: { productId: it.productId, ...(order.warehouseId ? { warehouseId: order.warehouseId } : {}) },
        select: { physicalQty: true, reservedQty: true },
      });
      return {
        itemId: it.id,
        available: rows.reduce((s, r) => s + r.physicalQty - r.reservedQty, 0),
      };
    })
  );
  return ok({ ...order, availability: avail });
});

const actionSchema = z.object({
  action: z.enum(["approve", "reserve", "startPicking", "pack", "ship", "complete", "cancel"]),
  shipLines: z.array(z.object({ itemId: z.string(), quantity: z.coerce.number().positive() })).optional(),
  carrier: z.string().max(60).optional(),
  trackingNumber: z.string().max(60).optional(),
  reason: z.string().max(400).optional(),
});

export const POST = route({ permission: "sales.update", schema: actionSchema }, async ({ params, body, session }) => {
  const result = await prisma.$transaction((tx) =>
    salesOrderAction(tx, {
      orderId: params.id,
      companyId: session.companyId,
      userId: session.user.id,
      action: body.action,
      shipLines: body.shipLines,
      carrier: body.carrier,
      trackingNumber: body.trackingNumber,
    })
  );
  return ok(result);
});

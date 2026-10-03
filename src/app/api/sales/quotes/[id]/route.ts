import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { quoteAction, convertQuoteToOrder } from "@/server/services/sales";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "quotes.read" }, async ({ params, session }) => {
  const quote = await prisma.salesQuote.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    include: {
      customer: true,
      salesRep: { select: { id: true, firstName: true, lastName: true } },
      items: { include: { product: { select: { sku: true, name: true, unit: true } } } },
    },
  });
  if (!quote) throw ApiError.notFound("Quotation not found.");
  return ok(quote);
});

const actionSchema = z.object({
  action: z.enum(["send", "markViewed", "accept", "reject", "expire", "convert"]),
  warehouseId: z.string().optional().nullable(),
});

export const POST = route({ permission: "quotes.update", schema: actionSchema }, async ({ params, body, session }) => {
  if (body.action === "convert") {
    const order = await prisma.$transaction((tx) =>
      convertQuoteToOrder(tx, {
        quoteId: params.id,
        companyId: session.companyId,
        userId: session.user.id,
        warehouseId: body.warehouseId || null,
      })
    );
    return ok({ converted: true, orderId: order.id, orderNumber: order.orderNumber });
  }
  const status = await prisma.$transaction((tx) =>
    quoteAction(tx, { quoteId: params.id, companyId: session.companyId, userId: session.user.id, action: body.action })
  );
  return ok({ status });
});

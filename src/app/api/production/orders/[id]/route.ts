import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { productionOrderAction } from "@/server/services/production";
import { PRODUCTION_ACTIONS } from "@/lib/status";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "production.read" }, async ({ params, session }) => {
  const order = await prisma.productionOrder.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true } },
      bom: { select: { id: true, name: true, version: true } },
      workCenter: { select: { code: true, name: true } },
      warehouse: { select: { code: true, name: true } },
      responsible: { select: { id: true, firstName: true, lastName: true } },
      components: {
        include: { product: { select: { sku: true, name: true, unit: true } } },
      },
      inspections: { orderBy: { inspectedAt: "desc" } },
    },
  });
  if (!order) throw ApiError.notFound("Production order not found.");

  const availableActions = Object.entries(PRODUCTION_ACTIONS)
    .filter(([, def]) => def.from.includes(order.status))
    .map(([action]) => action);

  // component availability
  const availability = await Promise.all(
    order.components.map(async (c) => {
      const rows = await prisma.inventoryItem.findMany({
        where: { productId: c.productId, warehouseId: c.warehouseId ?? order.warehouseId ?? "" },
        select: { physicalQty: true, reservedQty: true },
      });
      return {
        componentId: c.id,
        available: rows.reduce((s, r) => s + r.physicalQty - r.reservedQty, 0),
      };
    })
  );
  return ok({ ...order, availableActions, availability });
});

const actionSchema = z.object({
  action: z.enum(["release", "start", "pause", "resume", "finishProduction", "complete", "cancel"]),
  producedQuantity: z.coerce.number().positive().optional(),
  reason: z.string().max(400).optional(),
});

export const POST = route({ permission: "production.update", schema: actionSchema }, async ({ params, body, session }) => {
  const result = await prisma.$transaction((tx) =>
    productionOrderAction(tx, {
      productionOrderId: params.id,
      companyId: session.companyId,
      userId: session.user.id,
      action: body.action,
      producedQuantity: body.producedQuantity,
    })
  );
  return ok(result);
});

import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { adjustStock } from "@/server/services/inventory";
import { z } from "zod";

const schema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number(),
  reason: z.string().min(3).max(400),
  type: z.enum(["ADJUSTMENT", "STOCKTAKE", "OPENING_STOCK"]).default("ADJUSTMENT"),
  batchNumber: z.string().max(40).optional(),
});

/** Positive or negative correction with mandatory reason; posts an
 *  InventoryMovement (ADJUSTMENT / STOCKTAKE) and updates the stock level. */
export const POST = route({ permission: "inventory.adjust", schema }, async ({ body, session }) => {
  const result = await adjustStock(prisma, {
    companyId: session.companyId,
    productId: body.productId,
    warehouseId: body.warehouseId,
    quantity: body.quantity,
    reason: body.reason,
    type: body.type,
    batchNumber: body.batchNumber,
    userId: session.user.id,
  });
  return ok(result);
});

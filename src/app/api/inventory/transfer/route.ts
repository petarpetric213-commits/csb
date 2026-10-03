import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { transferStock } from "@/server/services/inventory";
import { z } from "zod";

const schema = z.object({
  productId: z.string().min(1),
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  reason: z.string().max(400).optional(),
});

export const POST = route({ permission: "inventory.transfer", schema }, async ({ body, session }) => {
  if (body.fromWarehouseId === body.toWarehouseId) {
    return Response.json(
      { error: { code: "VALIDATION", message: "Please correct the highlighted fields.", details: [{ path: "toWarehouseId", message: "Source and target warehouse must differ." }] } },
      { status: 400 }
    );
  }
  const result = await transferStock(prisma, {
    companyId: session.companyId,
    productId: body.productId,
    fromWarehouseId: body.fromWarehouseId,
    toWarehouseId: body.toWarehouseId,
    quantity: body.quantity,
    note: body.reason,
    userId: session.user.id,
  });
  return ok(result);
});

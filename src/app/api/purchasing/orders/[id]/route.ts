import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { purchaseOrderAction, receivePurchaseOrder } from "@/server/services/purchasing";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "purchasing.read" }, async ({ params, session }) => {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    include: {
      supplier: true,
      warehouse: { select: { id: true, code: true, name: true } },
      items: { include: { product: { select: { sku: true, name: true, unit: true, isBatchTracked: true, isExpiryTracked: true } } } },
      goodsReceipts: {
        include: { items: true },
        orderBy: { receivedAt: "desc" },
      },
    },
  });
  if (!po) throw ApiError.notFound("Purchase order not found.");
  return ok(po);
});

const receiveSchema = z.object({
  action: z.literal("receive"),
  lines: z
    .array(
      z.object({
        itemId: z.string(),
        quantity: z.coerce.number().positive(),
        batchNumber: z.string().max(40).optional(),
        expiryDate: z.string().optional(),
      })
    )
    .min(1, "Nothing to receive."),
  receivedAt: z.string().optional(),
  notes: z.string().max(400).optional(),
});

const actionSchema = z.object({
  action: z.enum(["send", "confirm", "cancel"]),
  reason: z.string().max(400).optional(),
});

const bodySchema = z.union([receiveSchema, actionSchema]);

export const POST = route({ permission: "purchasing.update", schema: bodySchema }, async ({ params, body, session }) => {
  if (body.action === "receive") {
    const { receipt } = await prisma.$transaction((tx) =>
      receivePurchaseOrder(tx, {
        purchaseOrderId: params.id,
        companyId: session.companyId,
        userId: session.user.id,
        lines: body.lines,
        receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
        notes: body.notes,
      })
    );
    return ok({ received: true, receiptId: receipt.id, receiptNumber: receipt.receiptNumber });
  }
  const result = await prisma.$transaction((tx) =>
    purchaseOrderAction(tx, {
      purchaseOrderId: params.id,
      companyId: session.companyId,
      userId: session.user.id,
      action: body.action,
    })
  );
  return ok(result);
});

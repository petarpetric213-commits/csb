import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { recordInspectionResult } from "@/server/services/quality";
import { releaseFromQuarantine } from "@/server/services/inventory";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "quality.read" }, async ({ params, session }) => {
  const inspection = await prisma.qualityInspection.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: {
      product: { select: { sku: true, name: true, unit: true, isBatchTracked: true } },
      inspector: { select: { name: true } },
      productionOrder: { select: { id: true, orderNumber: true, status: true } },
    },
  });
  if (!inspection) throw ApiError.notFound("Inspection not found.");
  return ok(inspection);
});

const bodySchema = z.union([
  z.object({
    action: z.literal("result"),
    result: z.enum(["PASS", "FAIL", "CONDITIONAL"]),
    measurements: z.array(z.object({ criterion: z.string().max(120), value: z.string().max(120), ok: z.boolean() })).optional(),
    notes: z.string().max(2000).optional(),
    quarantineQty: z.coerce.number().min(0).optional(),
    warehouseId: z.string().optional(),
  }),
  z.object({
    action: z.literal("releaseQuarantine"),
    quantity: z.coerce.number().positive(),
    warehouseId: z.string(),
  }),
]);

export const POST = route({ permission: "quality.update", schema: bodySchema }, async ({ params, body, session }) => {
  if (body.action === "releaseQuarantine") {
    const inspection = await prisma.qualityInspection.findFirst({
      where: { id: params.id, companyId: session.companyId },
    });
    if (!inspection) throw ApiError.notFound("Inspection not found.");
    await prisma.$transaction((tx) =>
      releaseFromQuarantine(tx, {
        companyId: session.companyId,
        productId: inspection.productId,
        warehouseId: body.warehouseId,
        quantity: body.quantity,
        userId: session.user.id,
      })
    );
    return ok({ released: true });
  }
  const result = await prisma.$transaction((tx) =>
    recordInspectionResult(tx, {
      inspectionId: params.id,
      companyId: session.companyId,
      userId: session.user.id,
      result: body.result,
      measurements: body.measurements,
      notes: body.notes,
      quarantineQty: body.quarantineQty,
      warehouseId: body.warehouseId,
    })
  );
  return ok(result);
});

import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { SHIPMENT_ACTIONS } from "@/lib/status";
import { ApiError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { z } from "zod";

export const GET = route({ permission: "logistics.read" }, async ({ params, session }) => {
  const shipment = await prisma.shipment.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: {
      customer: true,
      salesOrder: { select: { id: true, orderNumber: true, status: true } },
      warehouse: { select: { code: true, name: true } },
      items: { include: { product: { select: { sku: true, name: true, unit: true } } } },
    },
  });
  if (!shipment) throw ApiError.notFound("Shipment not found.");

  const available = Object.entries(SHIPMENT_ACTIONS)
    .filter(([, def]) => def.from.includes(shipment.status))
    .map(([action]) => action);

  return ok({ ...shipment, availableActions: available });
});

const actionSchema = z.object({
  action: z.enum(["pick", "pack", "ship", "startTransit", "deliver", "cancel"]),
  carrier: z.string().max(60).optional(),
  trackingNumber: z.string().max(60).optional(),
  driverName: z.string().max(80).optional(),
  packageCount: z.coerce.number().int().min(1).optional(),
  notes: z.string().max(400).optional(),
});

export const POST = route({ permission: "logistics.update", schema: actionSchema }, async ({ params, body, session }) => {
  const shipment = await prisma.shipment.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: { salesOrder: true },
  });
  if (!shipment) throw ApiError.notFound("Shipment not found.");

  const t = SHIPMENT_ACTIONS[body.action];
  if (!t) throw ApiError.badRequest(`Unknown action "${body.action}".`);
  if (!t.from.includes(shipment.status)) {
    throw ApiError.conflict(`Action "${body.action}" is not allowed while the shipment is ${shipment.status.replace(/_/g, " ").toLowerCase()}.`);
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: t.to };
  if (body.action === "ship") {
    data.carrier = body.carrier ?? shipment.carrier;
    data.trackingNumber = body.trackingNumber ?? shipment.trackingNumber ?? `TRK-${Date.now().toString().slice(-8)}`;
    data.actualDate = now;
    if (body.packageCount) data.packageCount = body.packageCount;
    if (shipment.salesOrder && shipment.salesOrder.status !== "SHIPPED" && shipment.salesOrder.status !== "COMPLETED" && shipment.salesOrder.status !== "PARTIALLY_SHIPPED") {
      await prisma.salesOrder.update({
        where: { id: shipment.salesOrder.id },
        data: { status: "SHIPPED", shippedAt: now },
      });
    }
  }
  if (body.action === "deliver") data.actualDate = now;
  if (body.action === "startTransit" && body.driverName) data.driverName = body.driverName;
  if (body.notes) data.notes = body.notes;

  const updated = await prisma.shipment.update({ where: { id: shipment.id }, data });
  await logAudit(prisma, {
    companyId: session.companyId,
    userId: session.user.id,
    action: "STATUS_CHANGED",
    entityType: "Shipment",
    entityId: shipment.id,
    entityNumber: shipment.shipmentNumber,
    summary: `Shipment ${shipment.shipmentNumber}: ${shipment.status} → ${t.to}`,
    before: { status: shipment.status },
    after: { status: t.to },
  });
  return ok({ status: updated.status });
});

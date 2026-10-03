import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "boms.read" }, async ({ params, session }) => {
  const bom = await prisma.bom.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: {
      product: { select: { sku: true, name: true, unit: true } },
      items: { include: { component: { select: { sku: true, name: true, unit: true, purchasePrice: true } } } },
      productionOrders: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, orderNumber: true, status: true, quantity: true, plannedStart: true },
      },
    },
  });
  if (!bom) throw ApiError.notFound("BOM not found.");
  const cost = bom.items.reduce((s, i) => s + i.quantity * (1 + i.wastePercent / 100) * i.component.purchasePrice, 0);
  return ok({ ...bom, materialCost: Math.round(cost * 100) / 100 });
});

const patchSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  name: z.string().min(2).max(120).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const PATCH = route({ permission: "boms.update", schema: patchSchema }, async ({ params, body, session }) => {
  const existing = await prisma.bom.findFirst({ where: { id: params.id, companyId: session.companyId } });
  if (!existing) throw ApiError.notFound("BOM not found.");
  if (body.status === "ACTIVE") {
    const otherActive = await prisma.bom.findFirst({
      where: { productId: existing.productId, status: "ACTIVE", NOT: { id: existing.id } },
    });
    if (otherActive) throw ApiError.conflict(`Another active BOM (v${otherActive.version}) exists for this product.`);
  }
  const bom = await prisma.bom.update({ where: { id: existing.id }, data: body });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "UPDATED",
    entityType: "Bom", entityId: bom.id,
    summary: `BOM "${bom.name}" → ${bom.status}`,
    before: { status: existing.status }, after: { status: bom.status },
  });
  return ok(bom);
});

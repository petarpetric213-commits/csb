import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const PATCH = route({ permission: "workcenters.update" }, async ({ params, body, session }) => {
  const existing = await prisma.workCenter.findFirst({ where: { id: params.id, companyId: session.companyId } });
  if (!existing) throw ApiError.notFound("Work center not found.");
  const parsed = z
    .object({
      name: z.string().min(2).max(80).optional(),
      department: z.string().max(80).nullable().optional(),
      capacityPerDay: z.coerce.number().min(0).optional(),
      hourlyCost: z.coerce.number().min(0).optional(),
      status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).optional(),
    })
    .parse(body);
  const wc = await prisma.workCenter.update({ where: { id: existing.id }, data: parsed });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "UPDATED",
    entityType: "WorkCenter", entityId: wc.id, entityNumber: wc.code,
    summary: `Updated work center ${wc.name}`,
    before: { status: existing.status, hourlyCost: existing.hourlyCost },
    after: { status: wc.status, hourlyCost: wc.hourlyCost },
  });
  return ok(wc);
});

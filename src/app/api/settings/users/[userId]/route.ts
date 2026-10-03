import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

const patchSchema = z.object({
  roleId: z.string().optional(),
  isActive: z.boolean().optional(),
});

/** Change a member's role or deactivate their login (company scope). */
export const PATCH = route({ permission: "settings.update", schema: patchSchema }, async ({ params, body, session }) => {
  const membership = await prisma.userCompany.findFirst({
    where: { userId: params.userId, companyId: session.companyId },
    include: { user: true, role: true },
  });
  if (!membership) throw ApiError.notFound("User is not a member of this company.");

  if (body.roleId) {
    const role = await prisma.role.findFirst({ where: { id: body.roleId, companyId: session.companyId } });
    if (!role) throw ApiError.badRequest("Role not found in this company.");
    await prisma.userCompany.update({ where: { id: membership.id }, data: { roleId: role.id } });
    await logAudit(prisma, {
      companyId: session.companyId, userId: session.user.id, action: "UPDATED",
      entityType: "User", entityId: membership.userId, entityNumber: membership.user.email,
      summary: `Role of ${membership.user.email}: ${membership.role.name} → ${role.name}`,
      before: { role: membership.role.key }, after: { role: role.key },
    });
  }
  if (body.isActive !== undefined) {
    if (membership.userId === session.user.id && body.isActive === false) {
      throw ApiError.conflict("You cannot deactivate your own account.");
    }
    await prisma.user.update({ where: { id: membership.userId }, data: { isActive: body.isActive } });
    if (!body.isActive) {
      await prisma.session.deleteMany({ where: { userId: membership.userId } });
    }
    await logAudit(prisma, {
      companyId: session.companyId, userId: session.user.id, action: "UPDATED",
      entityType: "User", entityId: membership.userId, entityNumber: membership.user.email,
      summary: `${membership.user.email} ${body.isActive ? "reactivated" : "deactivated"}`,
    });
  }
  return ok({ updated: true });
});

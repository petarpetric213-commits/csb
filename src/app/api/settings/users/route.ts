import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { hashPassword } from "@/server/auth";
import { z } from "zod";

/** Invite a user into the current company (creates login + membership). */
const createSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  roleId: z.string().min(1),
});

export const POST = route({ permission: "settings.update", schema: createSchema }, async ({ body, session }) => {
  const role = await prisma.role.findFirst({ where: { id: body.roleId, companyId: session.companyId } });
  if (!role) throw ApiError.badRequest("Role not found in this company.");

  const email = body.email.toLowerCase();

  const { membership, user } = await prisma.$transaction(async (tx) => {
    let u = await tx.user.findUnique({ where: { email } });
    if (!u) {
      u = await tx.user.create({
        data: { email, name: body.name, passwordHash: await hashPassword(body.password) },
      });
    } else {
      const existingMembership = await tx.userCompany.findFirst({ where: { userId: u.id, companyId: session.companyId } });
      if (existingMembership) throw ApiError.conflict(`${email} is already a member of this company.`);
    }
    const membership = await tx.userCompany.create({
      data: { userId: u.id, companyId: session.companyId, roleId: role.id },
    });
    return { membership, user: u };
  });

  await logAudit(prisma, {
    companyId: session.companyId,
    userId: session.user.id,
    action: "CREATED",
    entityType: "User",
    entityId: user.id,
    summary: `Added user ${user.email} with role ${role.name}`,
    after: { email: user.email, role: role.key },
  });
  return Response.json({ data: { membershipId: membership.id, userId: user.id } }, { status: 201 });
});

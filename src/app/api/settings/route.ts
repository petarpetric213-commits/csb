import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { z } from "zod";

/** Company profile + settings + users + roles for the settings screen. */
export const GET = route({ permission: "settings.read" }, async ({ session }) => {
  const [company, settings, members, roles] = await Promise.all([
    prisma.company.findUnique({ where: { id: session.companyId } }),
    prisma.setting.findMany({ where: { companyId: session.companyId, NOT: { key: { startsWith: "seq:" } } } }),
    prisma.userCompany.findMany({
      where: { companyId: session.companyId },
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true, createdAt: true } },
        role: { select: { id: true, name: true, key: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.role.findMany({
      where: { companyId: session.companyId },
      include: { permissions: { select: { permission: true } }, _count: { select: { users: true } } },
      orderBy: { key: "asc" },
    }),
  ]);
  return ok({
    company,
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
    members: members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      isActive: m.user.isActive,
      lastLoginAt: m.user.lastLoginAt,
      roleId: m.role.id,
      roleName: m.role.name,
      isDefault: m.isDefault,
    })),
    roles: roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions.map((p) => p.permission),
    })),
  });
});

const patchSchema = z.object({
  legalName: z.string().min(2).max(160).optional(),
  tradingName: z.string().max(160).nullable().optional(),
  taxNumber: z.string().max(60).nullable().optional(),
  registrationNumber: z.string().max(60).nullable().optional(),
  street: z.string().max(160).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  country: z.string().length(2).optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  currency: z.enum(["EUR", "RSD", "USD", "CHF", "GBP"]).optional(),
  locale: z.enum(["en", "de", "sr"]).optional(),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
});

export const PATCH = route({ permission: "settings.update", schema: patchSchema }, async ({ body, session }) => {
  const before = await prisma.company.findUnique({ where: { id: session.companyId } });
  const company = await prisma.company.update({ where: { id: session.companyId }, data: body });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "UPDATED",
    entityType: "Company", entityId: company.id,
    summary: `Updated company profile (${company.legalName})`,
    before: { legalName: before?.legalName, currency: before?.currency },
    after: { legalName: company.legalName, currency: company.currency },
  });
  return ok(company);
});

import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "employees.read" }, async ({ params, session }) => {
  const employee = await prisma.employee.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    include: {
      manager: { select: { id: true, firstName: true, lastName: true } },
      reports: { select: { id: true, firstName: true, lastName: true, position: true } },
      userLinks: { include: { user: { select: { id: true, email: true, lastLoginAt: true } }, role: { select: { name: true } } } },
    },
  });
  if (!employee) throw ApiError.notFound("Employee not found.");
  return ok(employee);
});

const patchSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  department: z.string().max(80).nullable().optional(),
  position: z.string().max(80).nullable().optional(),
  managerId: z.string().nullable().optional(),
  employmentStatus: z.enum(["ACTIVE", "PROBATION", "ON_LEAVE", "TERMINATED"]).optional(),
  endDate: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const PATCH = route({ permission: "employees.update", schema: patchSchema }, async ({ params, body, session }) => {
  const existing = await prisma.employee.findFirst({ where: { id: params.id, companyId: session.companyId, deletedAt: null } });
  if (!existing) throw ApiError.notFound("Employee not found.");
  const { endDate, managerId, ...rest } = body;
  const employee = await prisma.employee.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(managerId !== undefined ? { managerId: managerId || null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
    },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "UPDATED",
    entityType: "Employee", entityId: employee.id, entityNumber: employee.employeeNumber,
    summary: `Updated employee ${employee.firstName} ${employee.lastName}`,
    before: { employmentStatus: existing.employmentStatus, department: existing.department },
    after: { employmentStatus: employee.employmentStatus, department: employee.department },
  });
  return ok(employee);
});

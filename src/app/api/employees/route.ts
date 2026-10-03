import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { nextNumber } from "@/server/sequence";
import { z } from "zod";

export const GET = route({ permission: "employees.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const department = query.get("department");
  const status = query.get("status");

  const where = {
    companyId: session.companyId,
    deletedAt: null,
    ...(department && department !== "ALL" ? { department } : {}),
    ...(status && status !== "ALL" ? { employmentStatus: status } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { employeeNumber: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {}),
  };

  const [items, total, departments] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        manager: { select: { firstName: true, lastName: true } },
        userLinks: { include: { user: { select: { email: true, lastLoginAt: true } } } },
      },
      orderBy: { lastName: "asc" },
      skip,
      take,
    }),
    prisma.employee.count({ where }),
    prisma.employee.groupBy({ by: ["department"], where: { companyId: session.companyId, deletedAt: null } }),
  ]);

  return Response.json({
    data: items.map((e) => ({
      id: e.id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      phone: e.phone,
      department: e.department,
      position: e.position,
      employmentStatus: e.employmentStatus,
      startDate: e.startDate,
      manager: e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : null,
      hasLogin: e.userLinks.length > 0,
      loginEmail: e.userLinks[0]?.user.email ?? null,
    })),
    meta: {
      total, page, pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      departments: departments.map((d) => d.department).filter(Boolean),
    },
  });
});

const createSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  department: z.string().max(80).optional().or(z.literal("")),
  position: z.string().max(80).optional().or(z.literal("")),
  startDate: z.string().optional(),
  employmentStatus: z.enum(["ACTIVE", "PROBATION", "ON_LEAVE", "TERMINATED"]).default("ACTIVE"),
});

export const POST = route({ permission: "employees.create", schema: createSchema }, async ({ body, session }) => {
  const employeeNumber = await nextNumber(prisma, session.companyId, "MA");
  const employee = await prisma.employee.create({
    data: {
      companyId: session.companyId,
      employeeNumber,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email || null,
      phone: body.phone || null,
      department: body.department || null,
      position: body.position || null,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      employmentStatus: body.employmentStatus,
    },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "CREATED",
    entityType: "Employee", entityId: employee.id, entityNumber: employee.employeeNumber,
    summary: `Created employee ${employee.firstName} ${employee.lastName} (${employee.employeeNumber})`,
  });
  return Response.json({ data: employee }, { status: 201 });
});

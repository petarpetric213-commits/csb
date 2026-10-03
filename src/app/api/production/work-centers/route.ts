import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "workcenters.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query, 50);
  const [items, total] = await Promise.all([
    prisma.workCenter.findMany({
      where: { companyId: session.companyId },
      include: {
        manager: { select: { firstName: true, lastName: true } },
        _count: { select: { productionOrders: true } },
      },
      orderBy: { code: "asc" },
      skip,
      take,
    }),
    prisma.workCenter.count({ where: { companyId: session.companyId } }),
  ]);
  return okPaginated(
    items.map((w) => ({
      ...w,
      managerName: w.manager ? `${w.manager.firstName} ${w.manager.lastName}` : null,
      moCount: w._count.productionOrders,
    })),
    total,
    page,
    pageSize
  );
});

const createSchema = z.object({
  code: z.string().min(2).max(20).regex(/^[A-Za-z0-9-]+$/),
  name: z.string().min(2).max(80),
  department: z.string().max(80).optional().or(z.literal("")),
  capacityPerDay: z.coerce.number().min(0).default(0),
  hourlyCost: z.coerce.number().min(0).default(0),
});

export const POST = route({ permission: "workcenters.create", schema: createSchema }, async ({ body, session }) => {
  const dupe = await prisma.workCenter.findFirst({ where: { companyId: session.companyId, code: body.code } });
  if (dupe) throw ApiError.conflict(`Work center ${body.code} already exists.`);
  const wc = await prisma.workCenter.create({
    data: {
      companyId: session.companyId,
      code: body.code,
      name: body.name,
      department: body.department || null,
      capacityPerDay: body.capacityPerDay,
      hourlyCost: body.hourlyCost,
    },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "CREATED",
    entityType: "WorkCenter", entityId: wc.id, entityNumber: wc.code,
    summary: `Created work center ${wc.name} (${wc.code})`,
  });
  return Response.json({ data: wc }, { status: 201 });
});

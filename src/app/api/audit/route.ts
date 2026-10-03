import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";

export const GET = route({ permission: "audit.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const entityType = query.get("entityType");
  const action = query.get("action");
  const userId = query.get("userId");
  const from = query.get("from");
  const to = query.get("to");

  const where = {
    companyId: session.companyId,
    ...(entityType && entityType !== "ALL" ? { entityType } : {}),
    ...(action && action !== "ALL" ? { action } : {}),
    ...(userId ? { userId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { summary: { contains: q } },
            { entityNumber: { contains: q } },
            { user: { name: { contains: q } } },
          ],
        }
      : {}),
  };

  const [items, total, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["entityType"], where: { companyId: session.companyId } }),
  ]);

  return Response.json({
    data: items,
    meta: {
      total, page, pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      entityTypes: entityTypes.map((e) => e.entityType).sort(),
    },
  });
});

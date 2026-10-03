import { route, ok, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "categories.read" }, async ({ session, query }) => {
  if (query.get("flat") === "1") {
    const items = await prisma.productCategory.findMany({
      where: { companyId: session.companyId },
      orderBy: { name: "asc" },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    return ok(items.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products })));
  }
  const { page, pageSize, skip, take } = pagination(query);
  const [items, total] = await Promise.all([
    prisma.productCategory.findMany({
      where: { companyId: session.companyId },
      orderBy: { name: "asc" },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
      skip,
      take,
    }),
    prisma.productCategory.count({ where: { companyId: session.companyId } }),
  ]);
  return okPaginated(items, total, page, pageSize);
});

const createSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(400).optional().or(z.literal("")),
});

export const POST = route({ permission: "categories.create", schema: createSchema }, async ({ body, session }) => {
  const dupe = await prisma.productCategory.findFirst({ where: { companyId: session.companyId, name: body.name } });
  if (dupe) throw ApiError.conflict(`Category "${body.name}" already exists.`);
  const category = await prisma.productCategory.create({
    data: { companyId: session.companyId, name: body.name, description: body.description || null },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "CREATED",
    entityType: "ProductCategory", entityId: category.id,
    summary: `Created product category ${category.name}`,
  });
  return Response.json({ data: category }, { status: 201 });
});

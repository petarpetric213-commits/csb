import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const PATCH = route({ permission: "categories.update" }, async ({ params, body, session }) => {
  const existing = await prisma.productCategory.findFirst({ where: { id: params.id, companyId: session.companyId } });
  if (!existing) throw ApiError.notFound("Category not found.");
  const parsed = z.object({ name: z.string().min(2).max(80), description: z.string().max(400).nullable().optional() }).parse(body);
  const category = await prisma.productCategory.update({
    where: { id: existing.id },
    data: { name: parsed.name, description: parsed.description ?? existing.description },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "UPDATED",
    entityType: "ProductCategory", entityId: category.id,
    summary: `Renamed category "${existing.name}" → "${category.name}"`,
    before: { name: existing.name }, after: { name: category.name },
  });
  return ok(category);
});

export const DELETE = route({ permission: "categories.delete" }, async ({ params, session }) => {
  const existing = await prisma.productCategory.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  if (!existing) throw ApiError.notFound("Category not found.");
  if (existing._count.products > 0) {
    throw ApiError.conflict(`Category "${existing.name}" still has ${existing._count.products} products assigned.`);
  }
  await prisma.productCategory.delete({ where: { id: existing.id } });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "DELETED",
    entityType: "ProductCategory", entityId: existing.id,
    summary: `Deleted category ${existing.name}`,
  });
  return ok({ deleted: true });
});

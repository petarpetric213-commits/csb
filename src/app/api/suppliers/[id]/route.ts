import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "suppliers.read" }, async ({ params, session }) => {
  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    include: {
      contacts: true,
      purchaseOrders: {
        where: { deletedAt: null },
        orderBy: { orderDate: "desc" },
        take: 20,
        select: { id: true, orderNumber: true, status: true, orderDate: true, total: true, currency: true },
      },
      products: { where: { deletedAt: null }, select: { id: true, sku: true, name: true, purchasePrice: true, unit: true }, take: 50 },
    },
  });
  if (!supplier) throw ApiError.notFound("Supplier not found.");
  const agg = await prisma.purchaseOrder.aggregate({
    where: { supplierId: supplier.id, deletedAt: null, status: { not: "CANCELLED" } },
    _sum: { total: true },
    _count: true,
  });
  return ok({ ...supplier, stats: { poCount: agg._count, totalVolume: agg._sum.total ?? 0 } });
});

const patchSchema = z.object({
  companyName: z.string().min(2).max(160).optional(),
  contactPerson: z.string().max(120).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  street: z.string().max(160).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  country: z.string().length(2).optional(),
  category: z.string().max(80).nullable().optional(),
  paymentTermDays: z.coerce.number().int().min(0).max(180).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  status: z.enum(["ACTIVE", "PROSPECT", "INACTIVE", "BLOCKED"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const PATCH = route({ permission: "suppliers.update", schema: patchSchema }, async ({ params, body, session }) => {
  const existing = await prisma.supplier.findFirst({ where: { id: params.id, companyId: session.companyId, deletedAt: null } });
  if (!existing) throw ApiError.notFound("Supplier not found.");
  const supplier = await prisma.supplier.update({ where: { id: existing.id }, data: body });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "UPDATED",
    entityType: "Supplier", entityId: supplier.id, entityNumber: supplier.supplierNumber,
    summary: `Updated supplier ${supplier.companyName}`,
    before: { status: existing.status, rating: existing.rating },
    after: { status: supplier.status, rating: supplier.rating },
  });
  return ok(supplier);
});

export const DELETE = route({ permission: "suppliers.delete" }, async ({ params, session }) => {
  const existing = await prisma.supplier.findFirst({ where: { id: params.id, companyId: session.companyId, deletedAt: null } });
  if (!existing) throw ApiError.notFound("Supplier not found.");
  const poCount = await prisma.purchaseOrder.count({ where: { supplierId: existing.id, deletedAt: null } });
  if (poCount > 0) {
    await prisma.supplier.update({ where: { id: existing.id }, data: { deletedAt: new Date(), status: "INACTIVE" } });
    await logAudit(prisma, {
      companyId: session.companyId, userId: session.user.id, action: "DELETED",
      entityType: "Supplier", entityId: existing.id, entityNumber: existing.supplierNumber,
      summary: `Archived supplier ${existing.companyName} (has ${poCount} purchase orders)`,
    });
    return ok({ archived: true });
  }
  await prisma.supplier.delete({ where: { id: existing.id } });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "DELETED",
    entityType: "Supplier", entityId: existing.id, entityNumber: existing.supplierNumber,
    summary: `Deleted supplier ${existing.companyName}`,
  });
  return ok({ deleted: true });
});

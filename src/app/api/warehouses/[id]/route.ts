import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "warehouses.read" }, async ({ params, session }) => {
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: {
      manager: { select: { id: true, firstName: true, lastName: true } },
      locations: { orderBy: { code: "asc" } },
      inventory: {
        include: { product: { select: { sku: true, name: true, unit: true, purchasePrice: true } } },
      },
    },
  });
  if (!warehouse) throw ApiError.notFound("Warehouse not found.");
  return ok({
    ...warehouse,
    stockValue: warehouse.inventory.reduce((s, i) => s + i.physicalQty * i.product.purchasePrice, 0),
  });
});

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  street: z.string().max(160).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  country: z.string().length(2).optional(),
  managerId: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  isDefault: z.coerce.boolean().optional(),
});

export const PATCH = route({ permission: "warehouses.update", schema: patchSchema }, async ({ params, body, session }) => {
  const existing = await prisma.warehouse.findFirst({ where: { id: params.id, companyId: session.companyId } });
  if (!existing) throw ApiError.notFound("Warehouse not found.");
  if (body.isDefault) {
    await prisma.warehouse.updateMany({ where: { companyId: session.companyId }, data: { isDefault: false } });
  }
  const { managerId, ...rest } = body;
  const warehouse = await prisma.warehouse.update({
    where: { id: existing.id },
    data: { ...rest, ...(managerId !== undefined ? { managerId: managerId || null } : {}) },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "UPDATED",
    entityType: "Warehouse", entityId: warehouse.id, entityNumber: warehouse.code,
    summary: `Updated warehouse ${warehouse.name}`,
    before: { isDefault: existing.isDefault, status: existing.status },
    after: { isDefault: warehouse.isDefault, status: warehouse.status },
  });
  return ok(warehouse);
});

const locationSchema = z.object({
  code: z.string().min(1).max(40),
  zone: z.string().max(20).optional().or(z.literal("")),
  aisle: z.string().max(20).optional().or(z.literal("")),
  description: z.string().max(160).optional().or(z.literal("")),
});

/** Add a storage location to the warehouse. */
export const PUT = route({ permission: "warehouses.update", schema: locationSchema }, async ({ params, body, session }) => {
  const warehouse = await prisma.warehouse.findFirst({ where: { id: params.id, companyId: session.companyId } });
  if (!warehouse) throw ApiError.notFound("Warehouse not found.");
  const dupe = await prisma.warehouseLocation.findFirst({ where: { warehouseId: warehouse.id, code: body.code } });
  if (dupe) throw ApiError.conflict(`Location ${body.code} already exists in this warehouse.`);
  const location = await prisma.warehouseLocation.create({
    data: {
      warehouseId: warehouse.id,
      code: body.code,
      zone: body.zone || null,
      aisle: body.aisle || null,
      description: body.description || null,
    },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "CREATED",
    entityType: "WarehouseLocation", entityId: location.id, entityNumber: location.code,
    summary: `Added location ${location.code} to warehouse ${warehouse.code}`,
  });
  return Response.json({ data: location }, { status: 201 });
});

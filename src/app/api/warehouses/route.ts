import { route, ok, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "warehouses.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query, 50);
  const [items, total] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: session.companyId },
      include: {
        manager: { select: { firstName: true, lastName: true } },
        locations: true,
        _count: { select: { inventory: true, movements: true } },
      },
      orderBy: { code: "asc" },
      skip,
      take,
    }),
    prisma.warehouse.count({ where: { companyId: session.companyId } }),
  ]);
  if (query.get("flat") === "1") {
    return ok(items.map((w) => ({ id: w.id, code: w.code, name: w.name })));
  }
  return okPaginated(
    items.map((w) => ({
      ...w,
      managerName: w.manager ? `${w.manager.firstName} ${w.manager.lastName}` : null,
      inventoryCount: w._count.inventory,
      locationCount: w.locations.length,
    })),
    total,
    page,
    pageSize
  );
});

const createSchema = z.object({
  code: z.string().min(2).max(20).regex(/^[A-Za-z0-9-]+$/),
  name: z.string().min(2).max(80),
  street: z.string().max(160).optional().or(z.literal("")),
  postalCode: z.string().max(20).optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
  country: z.string().length(2).default("DE"),
  managerId: z.string().optional().nullable(),
  isDefault: z.coerce.boolean().default(false),
});

export const POST = route({ permission: "warehouses.create", schema: createSchema }, async ({ body, session }) => {
  const dupe = await prisma.warehouse.findFirst({ where: { companyId: session.companyId, code: body.code } });
  if (dupe) throw ApiError.conflict(`Warehouse code ${body.code} already exists.`);
  if (body.isDefault) {
    await prisma.warehouse.updateMany({ where: { companyId: session.companyId }, data: { isDefault: false } });
  }
  const warehouse = await prisma.warehouse.create({
    data: {
      companyId: session.companyId,
      code: body.code,
      name: body.name,
      street: body.street || null,
      postalCode: body.postalCode || null,
      city: body.city || null,
      country: body.country,
      managerId: body.managerId || null,
      isDefault: body.isDefault,
    },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "CREATED",
    entityType: "Warehouse", entityId: warehouse.id, entityNumber: warehouse.code,
    summary: `Created warehouse ${warehouse.name} (${warehouse.code})`,
  });
  return Response.json({ data: warehouse }, { status: 201 });
});

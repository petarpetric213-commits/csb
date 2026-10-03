import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { nextNumber } from "@/server/sequence";
import { z } from "zod";

export const GET = route({ permission: "suppliers.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const status = query.get("status");

  const where = {
    companyId: session.companyId,
    deletedAt: null,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(q
      ? { OR: [{ companyName: { contains: q } }, { supplierNumber: { contains: q } }, { city: { contains: q } }, { category: { contains: q } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: query.get("sorting")?.includes("desc") ? { companyName: "desc" } : { companyName: "asc" },
      include: { _count: { select: { purchaseOrders: true, products: true } } },
      skip,
      take,
    }),
    prisma.supplier.count({ where }),
  ]);

  return okPaginated(
    items.map((s) => ({
      id: s.id,
      supplierNumber: s.supplierNumber,
      companyName: s.companyName,
      contactPerson: s.contactPerson,
      email: s.email,
      phone: s.phone,
      city: s.city,
      country: s.country,
      category: s.category,
      rating: s.rating,
      paymentTermDays: s.paymentTermDays,
      status: s.status,
      poCount: s._count.purchaseOrders,
      productCount: s._count.products,
    })),
    total,
    page,
    pageSize
  );
});

const createSchema = z.object({
  companyName: z.string().min(2).max(160),
  contactPerson: z.string().max(120).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  street: z.string().max(160).optional().or(z.literal("")),
  postalCode: z.string().max(20).optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
  country: z.string().length(2).default("DE"),
  category: z.string().max(80).optional().or(z.literal("")),
  paymentTermDays: z.coerce.number().int().min(0).max(180).default(30),
  taxNumber: z.string().max(40).optional().or(z.literal("")),
  iban: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "PROSPECT", "INACTIVE", "BLOCKED"]).default("ACTIVE"),
});

export const POST = route({ permission: "suppliers.create", schema: createSchema }, async ({ body, session }) => {
  const supplierNumber = await nextNumber(prisma, session.companyId, "L");
  const supplier = await prisma.supplier.create({
    data: {
      companyId: session.companyId,
      supplierNumber,
      companyName: body.companyName,
      contactPerson: body.contactPerson || null,
      email: body.email || null,
      phone: body.phone || null,
      street: body.street || null,
      postalCode: body.postalCode || null,
      city: body.city || null,
      country: body.country,
      category: body.category || null,
      paymentTermDays: body.paymentTermDays,
      taxNumber: body.taxNumber || null,
      iban: body.iban || null,
      notes: body.notes || null,
      status: body.status,
    },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "CREATED",
    entityType: "Supplier", entityId: supplier.id, entityNumber: supplier.supplierNumber,
    summary: `Created supplier ${supplier.companyName} (${supplier.supplierNumber})`,
    after: { supplierNumber, companyName: supplier.companyName },
  });
  return Response.json({ data: supplier }, { status: 201 });
});

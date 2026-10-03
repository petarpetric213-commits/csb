import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";
import { nextNumber } from "@/server/sequence";

const SORTABLE = ["customerNumber", "companyName", "status", "createdAt", "paymentTermDays", "creditLimit"] as const;

export const GET = route({ permission: "customers.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const status = query.get("status");
  const groupId = query.get("groupId");

  const where = {
    companyId: session.companyId,
    deletedAt: null,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(groupId ? { groupId } : {}),
    ...(q
      ? {
          OR: [
            { companyName: { contains: q } },
            { customerNumber: { contains: q } },
            { lastName: { contains: q } },
            { email: { contains: q } },
            { billingCity: { contains: q } },
          ],
        }
      : {}),
  };

  const sortKey = query.get("sorting")?.split(":")[0] ?? "customerNumber";
  const sortDir = query.get("sorting")?.split(":")[1] === "desc" ? "desc" : "asc";
  const orderBy = (SORTABLE as readonly string[]).includes(sortKey)
    ? { [sortKey]: sortDir }
    : { customerNumber: "asc" as const };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        group: { select: { name: true } },
        _count: { select: { orders: { where: { deletedAt: null } }, invoices: true } },
      },
      orderBy,
      skip,
      take,
    }),
    prisma.customer.count({ where }),
  ]);

  return okPaginated(
    items.map((c) => ({
      id: c.id,
      customerNumber: c.customerNumber,
      companyName: c.companyName ?? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
      type: c.type,
      email: c.email,
      phone: c.phone,
      billingCity: c.billingCity,
      billingCountry: c.billingCountry,
      paymentTermDays: c.paymentTermDays,
      creditLimit: c.creditLimit,
      status: c.status,
      group: c.group?.name ?? null,
      orderCount: c._count.orders,
    })),
    total,
    page,
    pageSize
  );
});

const createSchema = z.object({
  type: z.enum(["COMPANY", "PERSON"]).default("COMPANY"),
  companyName: z.string().min(2).max(160).optional().or(z.literal("")),
  firstName: z.string().max(80).optional().or(z.literal("")),
  lastName: z.string().max(80).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  billingStreet: z.string().max(160).optional().or(z.literal("")),
  billingPostalCode: z.string().max(20).optional().or(z.literal("")),
  billingCity: z.string().max(80).optional().or(z.literal("")),
  billingCountry: z.string().length(2).default("DE"),
  shippingStreet: z.string().max(160).optional().or(z.literal("")),
  shippingPostalCode: z.string().max(20).optional().or(z.literal("")),
  shippingCity: z.string().max(80).optional().or(z.literal("")),
  shippingCountry: z.string().length(2).optional().or(z.literal("")),
  paymentTermDays: z.coerce.number().int().min(0).max(180).default(30),
  creditLimit: z.coerce.number().min(0).default(0),
  groupId: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "PROSPECT", "INACTIVE", "BLOCKED"]).default("ACTIVE"),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const POST = route({ permission: "customers.create", schema: createSchema }, async ({ body, session }) => {
  const customerNumber = await nextNumber(prisma, session.companyId, "K");
  const customer = await prisma.customer.create({
    data: {
      companyId: session.companyId,
      customerNumber,
      type: body.type,
      companyName: body.companyName || null,
      firstName: body.firstName || null,
      lastName: body.lastName || null,
      email: body.email || null,
      phone: body.phone || null,
      billingStreet: body.billingStreet || null,
      billingPostalCode: body.billingPostalCode || null,
      billingCity: body.billingCity || null,
      billingCountry: body.billingCountry,
      shippingStreet: body.shippingStreet || null,
      shippingPostalCode: body.shippingPostalCode || null,
      shippingCity: body.shippingCity || null,
      shippingCountry: body.shippingCountry || null,
      paymentTermDays: body.paymentTermDays,
      creditLimit: body.creditLimit,
      groupId: body.groupId || null,
      status: body.status,
      notes: body.notes || null,
    },
  });
  await logAudit(prisma, {
    companyId: session.companyId,
    userId: session.user.id,
    action: "CREATED",
    entityType: "Customer",
    entityId: customer.id,
    entityNumber: customer.customerNumber,
    summary: `Created customer ${customer.companyName ?? customer.customerNumber} (${customer.customerNumber})`,
    after: { customerNumber, companyName: customer.companyName, status: customer.status },
  });
  return Response.json({ data: customer }, { status: 201 });
});

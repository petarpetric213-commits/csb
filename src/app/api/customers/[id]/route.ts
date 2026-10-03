import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

type Ctx = { params: Record<string, string> };

export const GET = route({ permission: "customers.read" }, async ({ params, session }) => {
  const customer = await prisma.customer.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    include: {
      group: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      contacts: true,
      orders: {
        where: { deletedAt: null },
        orderBy: { orderDate: "desc" },
        take: 20,
        select: { id: true, orderNumber: true, status: true, orderDate: true, total: true, currency: true },
      },
      quotes: {
        orderBy: { issueDate: "desc" },
        take: 10,
        select: { id: true, quoteNumber: true, status: true, issueDate: true, total: true },
      },
      invoices: {
        orderBy: { issueDate: "desc" },
        take: 20,
        select: { id: true, invoiceNumber: true, status: true, issueDate: true, dueDate: true, total: true, paidAmount: true },
      },
      shipments: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, shipmentNumber: true, status: true, actualDate: true, carrier: true },
      },
      _count: { select: { orders: { where: { deletedAt: null } }, invoices: true, contacts: true } },
    },
  });
  if (!customer) throw ApiError.notFound("Customer not found.");

  const revenueAgg = await prisma.salesOrder.aggregate({
    where: { customerId: customer.id, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
    _sum: { total: true },
    _count: true,
  });
  const openInvoices = await prisma.invoice.aggregate({
    where: { customerId: customer.id, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
    _sum: { total: true, paidAmount: true },
  });

  return ok({
    ...customer,
    stats: {
      orderCount: revenueAgg._count,
      lifetimeRevenue: revenueAgg._sum.total ?? 0,
      openBalance: (openInvoices._sum.total ?? 0) - (openInvoices._sum.paidAmount ?? 0),
    },
  });
});

const patchSchema = z.object({
  companyName: z.string().min(2).max(160).nullable().optional(),
  firstName: z.string().max(80).nullable().optional(),
  lastName: z.string().max(80).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  billingStreet: z.string().max(160).nullable().optional(),
  billingPostalCode: z.string().max(20).nullable().optional(),
  billingCity: z.string().max(80).nullable().optional(),
  billingCountry: z.string().length(2).optional(),
  shippingStreet: z.string().max(160).nullable().optional(),
  shippingCity: z.string().max(80).nullable().optional(),
  shippingPostalCode: z.string().max(20).nullable().optional(),
  shippingCountry: z.string().length(2).nullable().optional(),
  paymentTermDays: z.coerce.number().int().min(0).max(180).optional(),
  creditLimit: z.coerce.number().min(0).optional(),
  groupId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "PROSPECT", "INACTIVE", "BLOCKED"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const PATCH = route({ permission: "customers.update", schema: patchSchema }, async ({ params, body, session }) => {
  const existing = await prisma.customer.findFirst({ where: { id: params.id, companyId: session.companyId, deletedAt: null } });
  if (!existing) throw ApiError.notFound("Customer not found.");
  const { groupId, assignedToId, ...rest } = body;
  const customer = await prisma.customer.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(groupId !== undefined ? { groupId: groupId || null } : {}),
      ...(assignedToId !== undefined ? { assignedToId: assignedToId || null } : {}),
    },
  });
  await logAudit(prisma, {
    companyId: session.companyId,
    userId: session.user.id,
    action: "UPDATED",
    entityType: "Customer",
    entityId: customer.id,
    entityNumber: customer.customerNumber,
    summary: `Updated customer ${customer.companyName ?? customer.customerNumber}`,
    before: { status: existing.status, paymentTermDays: existing.paymentTermDays, creditLimit: existing.creditLimit },
    after: { status: customer.status, paymentTermDays: customer.paymentTermDays, creditLimit: customer.creditLimit },
  });
  return ok(customer);
});

export const DELETE = route({ permission: "customers.delete" }, async ({ params, session }) => {
  const existing = await prisma.customer.findFirst({ where: { id: params.id, companyId: session.companyId, deletedAt: null } });
  if (!existing) throw ApiError.notFound("Customer not found.");
  const orderCount = await prisma.salesOrder.count({ where: { customerId: existing.id, deletedAt: null } });
  if (orderCount > 0) {
    // Soft delete: business partners with documents must remain traceable.
    await prisma.customer.update({ where: { id: existing.id }, data: { deletedAt: new Date(), status: "INACTIVE" } });
    await logAudit(prisma, {
      companyId: session.companyId, userId: session.user.id, action: "DELETED",
      entityType: "Customer", entityId: existing.id, entityNumber: existing.customerNumber,
      summary: `Archived customer ${existing.companyName ?? existing.customerNumber} (has ${orderCount} orders)`,
      before: { status: existing.status }, after: { deletedAt: new Date().toISOString() },
    });
    return ok({ archived: true });
  }
  await prisma.customer.delete({ where: { id: existing.id } });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "DELETED",
    entityType: "Customer", entityId: existing.id, entityNumber: existing.customerNumber,
    summary: `Deleted customer ${existing.companyName ?? existing.customerNumber}`,
  });
  return ok({ deleted: true });
});

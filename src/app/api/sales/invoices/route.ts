import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { createManualInvoice } from "@/server/services/invoicing";
import { markOverdueInvoices } from "@/server/services/invoicing";
import { z } from "zod";

export const GET = route({ permission: "invoices.read" }, async ({ session, query }) => {
  // Keep due-date status current whenever the list is viewed.
  await markOverdueInvoices(session.companyId).catch(() => 0);

  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const status = query.get("status");

  const where = {
    companyId: session.companyId,
    deletedAt: null,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(q ? { OR: [{ invoiceNumber: { contains: q } }, { customer: { companyName: { contains: q } } }] } : {}),
  };

  const [items, total, totals] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issueDate: "desc" },
      include: {
        customer: { select: { companyName: true, firstName: true, lastName: true } },
        salesOrder: { select: { orderNumber: true } },
      },
      skip,
      take,
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where, _sum: { total: true, paidAmount: true } }),
  ]);

  return Response.json({
    data: items.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      customerId: i.customerId,
      customer: i.customer.companyName ?? `${i.customer.firstName ?? ""} ${i.customer.lastName ?? ""}`.trim(),
      status: i.status,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      total: i.total,
      paidAmount: i.paidAmount,
      outstanding: Math.round((i.total - i.paidAmount) * 100) / 100,
      currency: i.currency,
      orderNumber: i.salesOrder?.orderNumber ?? null,
    })),
    meta: {
      total, page, pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      sumTotal: totals._sum.total ?? 0,
      sumPaid: totals._sum.paidAmount ?? 0,
      sumOutstanding: (totals._sum.total ?? 0) - (totals._sum.paidAmount ?? 0),
    },
  });
});

const createSchema = z.object({
  customerId: z.string().min(1),
  issueDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        description: z.string().max(400).optional(),
        quantity: z.coerce.number().positive(),
        unitPrice: z.coerce.number().min(0),
        discountPercent: z.coerce.number().min(0).max(100).optional(),
        taxRate: z.coerce.number().min(0).max(100).optional(),
      })
    )
    .min(1),
});

/** Manual invoice (direct billing without an order). */
export const POST = route({ permission: "invoices.create", schema: createSchema }, async ({ body, session }) => {
  const invoice = await prisma.$transaction((tx) =>
    createManualInvoice(tx, {
      companyId: session.companyId,
      userId: session.user.id,
      customerId: body.customerId,
      issueDate: body.issueDate ? new Date(body.issueDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes || null,
      items: body.items,
    })
  );
  return Response.json({ data: { id: invoice.id, invoiceNumber: invoice.invoiceNumber } }, { status: 201 });
});

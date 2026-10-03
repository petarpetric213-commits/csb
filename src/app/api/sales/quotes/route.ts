import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { createQuote, type SalesItemInput } from "@/server/services/sales";
import { z } from "zod";

export const GET = route({ permission: "quotes.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const status = query.get("status");

  const where = {
    companyId: session.companyId,
    deletedAt: null,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(q ? { OR: [{ quoteNumber: { contains: q } }, { customer: { companyName: { contains: q } } }] } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.salesQuote.findMany({
      where,
      orderBy: { issueDate: "desc" },
      include: {
        customer: { select: { companyName: true, firstName: true, lastName: true } },
        salesRep: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
      skip,
      take,
    }),
    prisma.salesQuote.count({ where }),
  ]);

  return okPaginated(
    items.map((x) => ({
      id: x.id,
      quoteNumber: x.quoteNumber,
      customerId: x.customerId,
      customer: x.customer.companyName ?? `${x.customer.firstName ?? ""} ${x.customer.lastName ?? ""}`.trim(),
      status: x.status,
      issueDate: x.issueDate,
      validUntil: x.validUntil,
      total: x.total,
      currency: x.currency,
      salesRep: x.salesRep ? `${x.salesRep.firstName} ${x.salesRep.lastName}` : null,
      itemCount: x._count.items,
    })),
    total,
    page,
    pageSize
  );
});

const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  description: z.string().max(400).optional(),
});

const createSchema = z.object({
  customerId: z.string().min(1),
  salesRepId: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(itemSchema).min(1, "At least one line item is required."),
});

export const POST = route({ permission: "quotes.create", schema: createSchema }, async ({ body, session }) => {
  const items: SalesItemInput[] = body.items;
  const quote = await prisma.$transaction((tx) =>
    createQuote(tx, {
      companyId: session.companyId,
      userId: session.user.id,
      customerId: body.customerId,
      salesRepId: body.salesRepId || null,
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      notes: body.notes || null,
      items,
    })
  );
  return Response.json({ data: { id: quote.id, quoteNumber: quote.quoteNumber } }, { status: 201 });
});

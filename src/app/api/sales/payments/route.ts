import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";

export const GET = route({ permission: "payments.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const direction = query.get("direction");

  const where = {
    companyId: session.companyId,
    ...(direction && direction !== "ALL" ? { direction } : {}),
    ...(q
      ? {
          OR: [
            { paymentNumber: { contains: q } },
            { reference: { contains: q } },
            { customer: { companyName: { contains: q } } },
            { supplier: { companyName: { contains: q } } },
          ],
        }
      : {}),
  };

  const [items, total, totals] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      include: {
        customer: { select: { companyName: true, firstName: true, lastName: true } },
        supplier: { select: { companyName: true } },
        invoice: { select: { invoiceNumber: true } },
      },
      skip,
      take,
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where, _sum: { amount: true } }),
  ]);

  return Response.json({
    data: items.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      direction: p.direction,
      partner: p.customer
        ? p.customer.companyName ?? `${p.customer.firstName ?? ""} ${p.customer.lastName ?? ""}`.trim()
        : p.supplier?.companyName ?? "—",
      invoiceNumber: p.invoice?.invoiceNumber ?? null,
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      reference: p.reference,
      status: p.status,
      paidAt: p.paidAt,
    })),
    meta: {
      total, page, pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      sumAmount: totals._sum.amount ?? 0,
    },
  });
});

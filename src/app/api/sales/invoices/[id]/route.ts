import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { invoiceAction, registerPayment } from "@/server/services/invoicing";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const GET = route({ permission: "invoices.read" }, async ({ params, session }) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    include: {
      customer: true,
      salesOrder: { select: { id: true, orderNumber: true, status: true } },
      items: { include: { product: { select: { sku: true, name: true, unit: true } } } },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
  if (!invoice) throw ApiError.notFound("Invoice not found.");
  return ok(invoice);
});

const actionSchema = z.object({
  action: z.enum(["issue", "cancel", "pay"]),
  amount: z.coerce.number().positive().optional(),
  method: z.enum(["BANK_TRANSFER", "CASH", "CARD", "OTHER"]).optional(),
  reference: z.string().max(80).optional(),
  paidAt: z.string().optional(),
  notes: z.string().max(400).optional(),
});

export const POST = route({ permission: "invoices.update", schema: actionSchema }, async ({ params, body, session }) => {
  if (body.action === "pay") {
    const { payment, invoiceStatus } = await prisma.$transaction((tx) =>
      registerPayment(tx, {
        companyId: session.companyId,
        userId: session.user.id,
        invoiceId: params.id,
        amount: body.amount!,
        method: body.method,
        reference: body.reference,
        paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
        notes: body.notes,
      })
    );
    return ok({ paid: true, paymentId: payment.id, paymentNumber: payment.paymentNumber, invoiceStatus });
  }
  const status = await prisma.$transaction((tx) =>
    invoiceAction(tx, { invoiceId: params.id, companyId: session.companyId, userId: session.user.id, action: body.action as "issue" | "cancel" })
  );
  return ok({ status });
});

import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { createInvoiceFromOrder } from "@/server/services/invoicing";
import { z } from "zod";

const schema = z.object({
  issueDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
});

/** Generate the invoice for a shipped/completed sales order. */
export const POST = route({ permission: "invoices.create", schema }, async ({ params, body, session }) => {
  const invoice = await prisma.$transaction((tx) =>
    createInvoiceFromOrder(tx, {
      orderId: params.id,
      companyId: session.companyId,
      userId: session.user.id,
      issueDate: body.issueDate ? new Date(body.issueDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    })
  );
  return Response.json({ data: { id: invoice.id, invoiceNumber: invoice.invoiceNumber } }, { status: 201 });
});

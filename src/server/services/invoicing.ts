// ============================================================================
// Invoicing & payments service.
// ============================================================================

import prisma from "@/lib/db";
import type { Prisma } from "@/lib/prisma";
import { ApiError } from "@/server/errors";
import { nextNumber } from "@/server/sequence";
import { logAudit } from "@/server/audit";
import { notifyPermissionHolders } from "@/server/services/notifications";
import { round2 } from "@/lib/utils";
import { calcTotals, calcLineTotal } from "@/server/services/purchasing";

type Tx = Prisma.TransactionClient | typeof prisma;

/** Generate an invoice from a (shipped) sales order. */
export async function createInvoiceFromOrder(
  tx: Tx,
  p: { orderId: string; companyId: string; userId: string; dueDate?: Date | null; issueDate?: Date }
) {
  const order = await tx.salesOrder.findFirst({
    where: { id: p.orderId, companyId: p.companyId, deletedAt: null },
    include: { items: true, customer: true, invoices: true },
  });
  if (!order) throw ApiError.notFound("Sales order not found.");
  if (!["SHIPPED", "PARTIALLY_SHIPPED", "COMPLETED"].includes(order.status)) {
    throw ApiError.conflict(
      `An invoice can only be generated for shipped or completed orders (current: ${order.status.replace(/_/g, " ").toLowerCase()}).`
    );
  }
  const already = order.invoices.find((i) => i.status !== "CANCELLED");
  if (already) {
    throw ApiError.conflict(`Invoice ${already.invoiceNumber} already exists for this order.`);
  }

  const issueDate = p.issueDate ?? new Date();
  const dueDate = p.dueDate ?? new Date(issueDate.getTime() + order.customer.paymentTermDays * 24 * 3600 * 1000);
  const invoiceNumber = await nextNumber(tx, p.companyId, "INV", issueDate);

  const invoice = await tx.invoice.create({
    data: {
      companyId: p.companyId, invoiceNumber, customerId: order.customerId,
      salesOrderId: order.id, type: "CUSTOMER", status: "DRAFT",
      issueDate, dueDate, currency: order.currency,
      subtotal: order.subtotal, discountTotal: order.discountTotal,
      taxTotal: order.taxTotal, total: order.total,
      notes: `For sales order ${order.orderNumber}`,
      items: {
        create: order.items.map((it) => ({
          productId: it.productId,
          description: it.description ?? "",
          quantity: it.quantity, unitPrice: it.unitPrice,
          discountPercent: it.discountPercent, taxRate: it.taxRate, lineTotal: it.lineTotal,
        })),
      },
    },
    include: { items: true },
  });

  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "CREATED",
    entityType: "Invoice", entityId: invoice.id, entityNumber: invoice.invoiceNumber,
    summary: `Generated invoice ${invoice.invoiceNumber} (${invoice.total.toFixed(2)} ${invoice.currency}) from order ${order.orderNumber}`,
    after: { orderId: order.id, total: invoice.total },
  });
  return invoice;
}

export async function createManualInvoice(
  tx: Tx,
  p: {
    companyId: string; userId: string; customerId: string;
    issueDate?: Date; dueDate?: Date | null; notes?: string | null;
    items: { productId?: string | null; description: string; quantity: number; unitPrice: number; discountPercent?: number; taxRate?: number }[];
  }
) {
  if (p.items.length === 0) throw ApiError.badRequest("An invoice needs at least one line item.");
  const customer = await tx.customer.findFirst({ where: { id: p.customerId, companyId: p.companyId, deletedAt: null } });
  if (!customer) throw ApiError.notFound("Customer not found.");

  const issueDate = p.issueDate ?? new Date();
  const dueDate = p.dueDate ?? new Date(issueDate.getTime() + customer.paymentTermDays * 24 * 3600 * 1000);
  const invoiceNumber = await nextNumber(tx, p.companyId, "INV", issueDate);

  const totals = calcTotals(p.items);
  const invoice = await tx.invoice.create({
    data: {
      companyId: p.companyId, invoiceNumber, customerId: p.customerId,
      type: "CUSTOMER", status: "DRAFT", issueDate, dueDate,
      currency: customer.currency, notes: p.notes ?? null, ...totals,
      items: {
        create: p.items.map((it) => ({
          productId: it.productId ?? null, description: it.description,
          quantity: it.quantity, unitPrice: it.unitPrice,
          discountPercent: it.discountPercent ?? 0, taxRate: it.taxRate ?? 19,
          lineTotal: calcLineTotal(it.quantity, it.unitPrice, it.discountPercent ?? 0, it.taxRate ?? 19).net,
        })),
      },
    },
    include: { items: true },
  });

  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "CREATED",
    entityType: "Invoice", entityId: invoice.id, entityNumber: invoice.invoiceNumber,
    summary: `Created invoice ${invoice.invoiceNumber} (${invoice.total.toFixed(2)} ${invoice.currency})`,
    after: { total: invoice.total },
  });
  return invoice;
}

export async function invoiceAction(
  tx: Tx,
  p: { invoiceId: string; companyId: string; userId: string; action: "issue" | "cancel" }
) {
  const invoice = await tx.invoice.findFirst({
    where: { id: p.invoiceId, companyId: p.companyId, deletedAt: null },
  });
  if (!invoice) throw ApiError.notFound("Invoice not found.");

  if (p.action === "issue") {
    if (invoice.status !== "DRAFT") {
      throw ApiError.conflict(`Only draft invoices can be issued (current: ${invoice.status}).`);
    }
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "ISSUED", issuedAt: new Date(), issuedById: p.userId },
    });
    await logAudit(tx, {
      companyId: p.companyId, userId: p.userId, action: "STATUS_CHANGED",
      entityType: "Invoice", entityId: invoice.id, entityNumber: invoice.invoiceNumber,
      summary: `Invoice ${invoice.invoiceNumber} issued (due ${invoice.dueDate?.toISOString().slice(0, 10) ?? "—"})`,
      before: { status: "DRAFT" }, after: { status: "ISSUED" },
    });
    return "ISSUED";
  }

  if (p.action === "cancel") {
    if (["PAID", "CANCELLED"].includes(invoice.status)) {
      throw ApiError.conflict(`A ${invoice.status.toLowerCase()} invoice cannot be cancelled.`);
    }
    if (invoice.paidAmount > 0) {
      throw ApiError.conflict("Invoice already has payments recorded — reverse them first.");
    }
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await logAudit(tx, {
      companyId: p.companyId, userId: p.userId, action: "STATUS_CHANGED",
      entityType: "Invoice", entityId: invoice.id, entityNumber: invoice.invoiceNumber,
      summary: `Invoice ${invoice.invoiceNumber} cancelled`,
      before: { status: invoice.status }, after: { status: "CANCELLED" },
    });
    return "CANCELLED";
  }
  throw ApiError.badRequest("Unknown action.");
}

/** Record a payment against an invoice; updates payment status. */
export async function registerPayment(
  tx: Tx,
  p: {
    companyId: string; userId: string; invoiceId: string;
    amount: number; method?: string; reference?: string;
    paidAt?: Date; notes?: string;
  }
) {
  const invoice = await tx.invoice.findFirst({
    where: { id: p.invoiceId, companyId: p.companyId, deletedAt: null },
    include: { customer: true },
  });
  if (!invoice) throw ApiError.notFound("Invoice not found.");
  if (invoice.status === "CANCELLED") throw ApiError.conflict("Cannot pay a cancelled invoice.");
  if (invoice.status === "DRAFT") throw ApiError.conflict("Issue the invoice before recording payments.");
  if (p.amount <= 0) throw ApiError.badRequest("Payment amount must be positive.");

  const outstanding = round2(invoice.total - invoice.paidAmount);
  if (p.amount > outstanding + 0.00001) {
    throw ApiError.conflict(`Payment exceeds the outstanding amount (${outstanding.toFixed(2)} ${invoice.currency}).`);
  }

  const paidAt = p.paidAt ?? new Date();
  const paymentNumber = await nextNumber(tx, p.companyId, "PAY", paidAt);

  const payment = await tx.payment.create({
    data: {
      companyId: p.companyId, paymentNumber, direction: "INBOUND",
      customerId: invoice.customerId, invoiceId: invoice.id,
      amount: p.amount, currency: invoice.currency,
      method: p.method ?? "BANK_TRANSFER", reference: p.reference ?? null,
      status: "COMPLETED", paidAt, notes: p.notes ?? null, createdById: p.userId,
    },
  });

  const newPaidAmount = round2(invoice.paidAmount + p.amount);
  const newStatus = newPaidAmount >= invoice.total - 0.00001 ? "PAID" : "PARTIALLY_PAID";
  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      paidAmount: newPaidAmount,
      status: newStatus,
      paidAt: newStatus === "PAID" ? paidAt : invoice.paidAt,
    },
  });

  await logAudit(tx, {
    companyId: p.companyId, userId: p.userId, action: "PAYMENT_RECORDED",
    entityType: "Invoice", entityId: invoice.id, entityNumber: invoice.invoiceNumber,
    summary: `Payment ${paymentNumber} of ${p.amount.toFixed(2)} ${invoice.currency} (${p.method ?? "bank transfer"}) for invoice ${invoice.invoiceNumber} — status → ${newStatus.replace("_", " ")}`,
    after: { paymentNumber, amount: p.amount, status: newStatus },
  });

  await notifyPermissionHolders(tx, {
    companyId: p.companyId, permission: "invoices.read", type: "PAYMENT_RECEIVED",
    title: `Payment received: ${p.amount.toFixed(2)} ${invoice.currency}`,
    body: `Invoice ${invoice.invoiceNumber} is now ${newStatus === "PAID" ? "fully paid" : "partially paid"}.`,
    entityType: "Invoice", entityId: invoice.id,
  });

  return { payment, invoiceStatus: newStatus };
}

/** Flag issued invoices past their due date as OVERDUE (+ notification). Cheap, called on dashboard load. */
export async function markOverdueInvoices(companyId: string) {
  const overdue = await prisma.invoice.findMany({
    where: {
      companyId,
      status: { in: ["ISSUED", "PARTIALLY_PAID"] },
      dueDate: { lt: new Date() },
    },
    take: 50,
  });
  for (const inv of overdue) {
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: "OVERDUE" } });
    await prisma.notification.create({
      data: {
        companyId,
        userId: inv.issuedById ?? (await prisma.userCompany.findFirst({ where: { companyId } }))!.userId,
        type: "INVOICE_OVERDUE", priority: "HIGH",
        title: `Invoice overdue: ${inv.invoiceNumber}`,
        body: `Invoice ${inv.invoiceNumber} (${inv.total.toFixed(2)} ${inv.currency}) passed its due date.`,
        entityType: "Invoice", entityId: inv.id,
      },
    });
    await logAudit(prisma, {
      companyId, action: "STATUS_CHANGED", entityType: "Invoice",
      entityId: inv.id, entityNumber: inv.invoiceNumber,
      summary: `Invoice ${inv.invoiceNumber} automatically marked OVERDUE`,
      before: { status: inv.status }, after: { status: "OVERDUE" },
    });
  }
  return overdue.length;
}

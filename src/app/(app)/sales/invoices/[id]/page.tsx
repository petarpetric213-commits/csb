"use client";

import React, { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n, useConfirm, useToast } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiGet, apiPost, ApiClientError } from "@/lib/client/api";
import { PageHeader, EntityHeader, DescriptionList, Card } from "@/components/ui/patterns";
import { LoadingState, ErrorState, Money } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { localeDate } from "@/lib/i18n";

type InvoiceDetail = {
  id: string; invoiceNumber: string; status: string; issueDate: string; dueDate: string | null;
  currency: string; subtotal: number; discountTotal: number; taxTotal: number; total: number; paidAmount: number;
  notes: string | null; issuedAt: string | null; paidAt: string | null;
  customer: { id: string; customerNumber: string; companyName: string | null; firstName: string | null; lastName: string | null; paymentTermDays: number };
  salesOrder: { id: string; orderNumber: string; status: string } | null;
  items: { id: string; productId: string | null; description: string | null; quantity: number; unitPrice: number; discountPercent: number; taxRate: number; lineTotal: number; product: { sku: string; name: string; unit: string } | null }[];
  payments: { id: string; paymentNumber: string; amount: number; method: string; reference: string | null; paidAt: string; status: string }[];
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const can = usePermission();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [payOpen, setPayOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => apiGet<InvoiceDetail>(`/api/sales/invoices/${id}`),
  });

  const act = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost(`/api/sales/invoices/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("success", t("common.saved"));
    },
    onError: (e) => toast("error", e instanceof ApiClientError ? e.message : t("common.error")),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data) return <ErrorState title={t("error.notFound")} retry={refetch} />;

  const customerName = data.customer.companyName ?? `${data.customer.firstName ?? ""} ${data.customer.lastName ?? ""}`.trim();
  const outstanding = Math.round((data.total - data.paidAmount) * 100) / 100;

  return (
    <div>
      <PageHeader
        title={data.invoiceNumber}
        breadcrumbs={[{ label: t("nav.invoices"), href: "/sales/invoices" }, { label: data.invoiceNumber }]}
      />
      <EntityHeader
        number={data.invoiceNumber}
        title={customerName}
        status={<StatusBadge status={data.status} />}
        meta={
          <>
            <span>{t("invoices.issued")}: {localeDate(data.issueDate, locale)}</span>
            {data.dueDate && <span>{t("invoices.due")}: {localeDate(data.dueDate, locale)}</span>}
            <span><Money amount={data.total} currency={data.currency} /></span>
            <span>{t("invoices.outstanding")}: <strong className={outstanding > 0 ? "text-warning" : "text-success"}><Money amount={outstanding} currency={data.currency} /></strong></span>
          </>
        }
        actions={
          can("invoices.update") && (
            <div className="flex flex-wrap items-center gap-2">
              {data.status === "DRAFT" && (
                <Button onClick={() => act.mutate({ action: "issue" })} disabled={act.isPending}>{t("invoices.issue")}</Button>
              )}
              {outstanding > 0.001 && !["DRAFT", "CANCELLED", "PAID"].includes(data.status) && (
                <Button variant="success" onClick={() => setPayOpen(true)}>{t("invoices.registerPayment")}</Button>
              )}
              {!["PAID", "CANCELLED"].includes(data.status) && data.paidAmount === 0 && (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (await confirm({ title: t("invoices.cancel"), message: t("invoices.cancelConfirm", { number: data.invoiceNumber }), danger: true, confirmLabel: t("invoices.cancel") })) {
                      act.mutate({ action: "cancel" });
                    }
                  }}
                >
                  {t("common.cancel")}
                </Button>
              )}
            </div>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("invoices.positions")} noPadding className="lg:col-span-2">
          <table className="data-table w-full text-[13px]">
            <thead>
              <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                <th className="px-4 py-2 text-left">{t("products.title")}</th>
                <th className="px-4 py-2 text-right">{t("common.quantity")}</th>
                <th className="px-4 py-2 text-right">{t("common.price")}</th>
                <th className="px-4 py-2 text-right">%</th>
                <th className="px-4 py-2 text-right">{t("common.vat")}</th>
                <th className="px-4 py-2 text-right">{t("common.total")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    {it.product ? (
                      <Link href={`/products/${it.productId}`} className="hover:text-primary hover:underline">
                        <span className="font-mono text-2xs">{it.product.sku}</span> {it.product.name}
                      </Link>
                    ) : (
                      it.description ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.unitPrice.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.discountPercent || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.taxRate}%</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td colSpan={5} className="px-4 py-1.5 text-right text-muted-foreground">{t("common.subtotal")}</td>
                <td className="px-4 py-1.5 text-right tabular-nums">{data.subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td colSpan={5} className="px-4 py-1.5 text-right text-muted-foreground">{t("common.vat")}</td>
                <td className="px-4 py-1.5 text-right tabular-nums">{data.taxTotal.toFixed(2)}</td>
              </tr>
              <tr className="border-t font-semibold">
                <td colSpan={5} className="px-4 py-2 text-right">{t("common.total")}</td>
                <td className="px-4 py-2 text-right tabular-nums"><Money amount={data.total} currency={data.currency} /></td>
              </tr>
              <tr>
                <td colSpan={5} className="px-4 py-1.5 text-right text-muted-foreground">{t("invoices.paid")}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-success">{data.paidAmount.toFixed(2)}</td>
              </tr>
              <tr className="font-semibold">
                <td colSpan={5} className="px-4 py-1.5 text-right">{t("invoices.outstanding")}</td>
                <td className="px-4 py-1.5 text-right tabular-nums"><Money amount={outstanding} currency={data.currency} /></td>
              </tr>
            </tfoot>
          </table>
        </Card>

        <div className="space-y-4">
          <Card title={t("common.overview")}>
            <DescriptionList
              columns={1}
              items={[
                { label: t("customers.title"), value: <Link href={`/customers/${data.customer.id}`} className="text-primary hover:underline">{customerName}</Link> },
                { label: t("nav.orders"), value: data.salesOrder ? <Link href={`/sales/orders/${data.salesOrder.id}`} className="font-mono text-2xs text-primary hover:underline">{data.salesOrder.orderNumber}</Link> : "—" },
                { label: t("invoices.issued"), value: localeDate(data.issueDate, locale) },
                { label: t("invoices.due"), value: data.dueDate ? localeDate(data.dueDate, locale) : "—" },
                { label: t("customers.paymentTermDays"), value: `${data.customer.paymentTermDays} ${t("common.days")}` },
              ]}
            />
          </Card>
          <Card title={t("payments.title")} noPadding>
            {data.payments.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">{t("payments.none")}</p>
            ) : (
              <table className="w-full text-[13px]">
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <p className="font-mono text-2xs">{p.paymentNumber}</p>
                        <p className="text-2xs text-muted-foreground">{localeDate(p.paidAt, locale)} · {t(`payments.method_${p.method}`)}</p>
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-success">
                        +{p.amount.toFixed(2)} {data.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      <PayDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        invoice={data}
        onPay={(payload) => {
          act.mutate(payload);
          setPayOpen(false);
        }}
      />
    </div>
  );
}

function PayDialog({
  open, onClose, invoice, onPay,
}: {
  open: boolean; onClose: () => void; invoice: InvoiceDetail; onPay: (payload: Record<string, unknown>) => void;
}) {
  const t = useI18n().t;
  const outstanding = Math.round((invoice.total - invoice.paidAmount) * 100) / 100;
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");

  React.useEffect(() => {
    if (open) { setAmount(String(outstanding)); setMethod("BANK_TRANSFER"); setReference(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog
      open={open} onClose={onClose} title={t("invoices.registerPayment")} description={invoice.invoiceNumber}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="success" onClick={() => onPay({ action: "pay", amount: Number(amount), method, reference: reference || undefined })}>
          {t("invoices.registerPayment")}
        </Button>
      </>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("payments.amount")} required hint={`${t("invoices.outstanding")}: ${outstanding.toFixed(2)} ${invoice.currency}`}>
          <Input type="number" min={0.01} max={outstanding} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("payments.method")}>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="BANK_TRANSFER">{t("payments.method_BANK_TRANSFER")}</option>
            <option value="CASH">{t("payments.method_CASH")}</option>
            <option value="CARD">{t("payments.method_CARD")}</option>
            <option value="OTHER">{t("payments.method_OTHER")}</option>
          </Select>
        </Field>
        <Field label={t("payments.reference")} className="sm:col-span-2">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SEPA-Referenz / Kassenbeleg" />
        </Field>
      </div>
    </Dialog>
  );
}

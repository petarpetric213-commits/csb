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
import { localeDate } from "@/lib/i18n";

type QuoteDetail = {
  id: string; quoteNumber: string; status: string; issueDate: string; validUntil: string | null;
  currency: string; subtotal: number; discountTotal: number; taxTotal: number; total: number;
  notes: string | null; sentAt: string | null; convertedOrderId: string | null; convertedAt: string | null;
  customer: { id: string; customerNumber: string; companyName: string | null; firstName: string | null; lastName: string | null };
  salesRep: { firstName: string; lastName: string } | null;
  items: { id: string; productId: string; quantity: number; unitPrice: number; discountPercent: number; taxRate: number; lineTotal: number; product: { sku: string; name: string; unit: string } }[];
};

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const can = usePermission();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["quote", id],
    queryFn: () => apiGet<QuoteDetail>(`/api/sales/quotes/${id}`),
  });

  const act = useMutation({
    mutationFn: (action: string) => apiPost(`/api/sales/quotes/${id}`, { action }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["quote", id] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      if (res?.converted) {
        toast("success", t("sales.convertedTo", { number: res.orderNumber }));
        router.push(`/sales/orders/${res.orderId}`);
      } else {
        toast("success", t("sales.statusNow", { status: t(`status.${res.status}`) }));
      }
    },
    onError: (e) => toast("error", e instanceof ApiClientError ? e.message : t("common.error")),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data) return <ErrorState title={t("error.notFound")} retry={refetch} />;

  const customerName = data.customer.companyName ?? `${data.customer.firstName ?? ""} ${data.customer.lastName ?? ""}`.trim();
  const buttons: { label: string; action: string; variant?: "default" | "secondary" | "success" | "destructive" }[] = [];
  if (data.status === "DRAFT") buttons.push({ label: t("sales.send"), action: "send" });
  if (["SENT", "VIEWED"].includes(data.status)) {
    buttons.push({ label: t("sales.markViewed"), action: "markViewed", variant: "secondary" });
    buttons.push({ label: t("sales.accept"), action: "accept", variant: "success" });
    buttons.push({ label: t("sales.reject"), action: "reject", variant: "destructive" });
  }

  return (
    <div>
      <PageHeader
        title={data.quoteNumber}
        breadcrumbs={[{ label: t("nav.quotes"), href: "/sales/quotes" }, { label: data.quoteNumber }]}
      />
      <EntityHeader
        number={data.quoteNumber}
        title={customerName}
        status={<StatusBadge status={data.status} />}
        meta={
          <>
            <span>{t("sales.issueDate")}: {localeDate(data.issueDate, locale)}</span>
            {data.validUntil && <span>{t("sales.validUntil")}: {localeDate(data.validUntil, locale)}</span>}
            <span><Money amount={data.total} currency={data.currency} /></span>
          </>
        }
        actions={
          can("quotes.update") && (
            <div className="flex flex-wrap items-center gap-2">
              {buttons.map((b) => (
                <Button key={b.action} variant={b.variant ?? "default"} onClick={() => act.mutate(b.action)} disabled={act.isPending}>
                  {b.label}
                </Button>
              ))}
              {["SENT", "VIEWED", "ACCEPTED"].includes(data.status) && can("sales.create") && (
                <Button
                  variant="success"
                  disabled={act.isPending}
                  onClick={async () => {
                    if (await confirm({ title: t("sales.convert"), message: t("sales.convertConfirm", { number: data.quoteNumber }), confirmLabel: t("sales.convert") })) {
                      act.mutate("convert");
                    }
                  }}
                >
                  {t("sales.convert")}
                </Button>
              )}
            </div>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("sales.positions")} noPadding className="lg:col-span-2">
          <table className="data-table w-full text-[13px]">
            <thead>
              <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                <th className="px-4 py-2 text-left">SKU</th>
                <th className="px-4 py-2 text-left">{t("products.title")}</th>
                <th className="px-4 py-2 text-right">{t("common.quantity")}</th>
                <th className="px-4 py-2 text-right">{t("common.price")}</th>
                <th className="px-4 py-2 text-right">%</th>
                <th className="px-4 py-2 text-right">{t("common.total")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-mono text-2xs">{it.product.sku}</td>
                  <td className="px-4 py-2">
                    <Link href={`/products/${it.productId}`} className="hover:text-primary hover:underline">{it.product.name}</Link>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.quantity} {it.product.unit}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.unitPrice.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.discountPercent || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td colSpan={5} className="px-4 py-1.5 text-right text-muted-foreground">{t("common.subtotal")}</td>
                <td className="px-4 py-1.5 text-right tabular-nums">{data.subtotal.toFixed(2)}</td>
              </tr>
              <tr className="border-t font-semibold">
                <td colSpan={5} className="px-4 py-2 text-right">{t("common.total")}</td>
                <td className="px-4 py-2 text-right tabular-nums"><Money amount={data.total} currency={data.currency} /></td>
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
                { label: t("sales.issueDate"), value: localeDate(data.issueDate, locale) },
                { label: t("sales.validUntil"), value: data.validUntil ? localeDate(data.validUntil, locale) : "—" },
                { label: t("sales.salesRep"), value: data.salesRep ? `${data.salesRep.firstName} ${data.salesRep.lastName}` : "—" },
                { label: t("sales.sentAt"), value: data.sentAt ? localeDate(data.sentAt, locale) : "—" },
              ]}
            />
          </Card>
          {data.notes && (
            <Card title={t("common.notes")}>
              <p className="whitespace-pre-wrap text-[13px] text-muted-foreground">{data.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

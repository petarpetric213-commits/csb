"use client";

import React, { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiGet } from "@/lib/client/api";
import { PageHeader, EntityHeader, DescriptionList, Card } from "@/components/ui/patterns";
import { LoadingState, ErrorState, Money, MetricCard } from "@/components/ui/states";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { localeDate } from "@/lib/i18n";

type SupplierDetail = {
  id: string; supplierNumber: string; companyName: string; contactPerson: string | null; email: string | null;
  phone: string | null; street: string | null; postalCode: string | null; city: string | null; country: string;
  category: string | null; paymentTermDays: number; taxNumber: string | null; iban: string | null;
  rating: number | null; status: string; notes: string | null;
  contacts: { id: string; firstName: string; lastName: string; position: string | null; email: string | null; phone: string | null }[];
  purchaseOrders: { id: string; orderNumber: string; status: string; orderDate: string; total: number; currency: string }[];
  products: { id: string; sku: string; name: string; purchasePrice: number; unit: string }[];
  stats: { poCount: number; totalVolume: number };
};

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => apiGet<SupplierDetail>(`/api/suppliers/${id}`),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data) return <ErrorState title={t("error.notFound")} retry={refetch} />;

  return (
    <div>
      <PageHeader
        title={data.companyName}
        breadcrumbs={[{ label: t("nav.suppliers"), href: "/suppliers" }, { label: data.supplierNumber }]}
      />
      <EntityHeader
        number={data.supplierNumber}
        title={data.companyName}
        status={<StatusBadge status={data.status} />}
        meta={
          <>
            <span>{data.category ?? "—"}</span>
            {data.contactPerson && <span>{data.contactPerson}</span>}
            <span>{data.email ?? "—"}</span>
            {data.rating && (
              <span className="inline-flex items-center gap-1"><Star size={12} className="text-warning" /> {data.rating.toFixed(1)}</span>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label={t("purchasing.poCount")} value={String(data.stats.poCount)} />
        <MetricCard label={t("purchasing.totalVolume")} value={`${data.stats.totalVolume.toLocaleString("de-DE")} €`} />
        <MetricCard label={t("suppliers.productCount")} value={String(data.products.length)} />
        <MetricCard label={t("suppliers.paymentTermDays")} value={`${data.paymentTermDays} ${t("common.days")}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("suppliers.address")} className="lg:col-span-1">
          <DescriptionList
            columns={1}
            items={[
              { label: t("common.name"), value: data.companyName },
              { label: t("suppliers.street"), value: data.street ?? "—" },
              { label: t("suppliers.city"), value: `${data.postalCode ?? ""} ${data.city ?? ""} (${data.country})` },
              { label: t("common.email"), value: data.email ?? "—" },
              { label: t("common.phone"), value: data.phone ?? "—" },
              { label: t("suppliers.taxNumber"), value: data.taxNumber ?? "—" },
              { label: t("suppliers.iban"), value: data.iban ?? "—" },
            ]}
          />
        </Card>

        <Card title={t("nav.purchaseOrders")} noPadding className="lg:col-span-2">
          <table className="data-table w-full text-[13px]">
            <thead>
              <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                <th className="px-4 py-2 text-left">{t("purchasing.poNumber")}</th>
                <th className="px-4 py-2 text-left">{t("common.date")}</th>
                <th className="px-4 py-2 text-right">{t("common.total")}</th>
                <th className="px-4 py-2 text-right">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.purchaseOrders.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noResults")}</td></tr>
              )}
              {data.purchaseOrders.map((po) => (
                <tr key={po.id} className="border-b last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-2">
                    <Link href={`/purchasing/orders/${po.id}`} className="font-mono text-2xs text-primary hover:underline">{po.orderNumber}</Link>
                  </td>
                  <td className="px-4 py-2">{localeDate(po.orderDate, locale)}</td>
                  <td className="px-4 py-2 text-right tabular-nums"><Money amount={po.total} currency={po.currency} /></td>
                  <td className="px-4 py-2 text-right"><StatusBadge status={po.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {data.products.length > 0 && (
          <Card title={t("products.title")} noPadding className="lg:col-span-3">
            <div className="flex flex-wrap gap-2 p-4">
              {data.products.map((p) => (
                <Link key={p.id} href={`/products/${p.id}`}>
                  <Badge tone="info" className="hover:opacity-80">
                    {p.sku} · {p.name} · {p.purchasePrice.toFixed(2)} €/{p.unit}
                  </Badge>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

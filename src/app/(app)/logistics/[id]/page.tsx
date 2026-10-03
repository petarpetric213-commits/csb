"use client";

import React, { use } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n, useToast } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiGet, apiPost, ApiClientError } from "@/lib/client/api";
import { PageHeader, EntityHeader, DescriptionList, Card } from "@/components/ui/patterns";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localeDate } from "@/lib/i18n";

type ShipmentDetail = {
  id: string; shipmentNumber: string; status: string; carrier: string | null; trackingNumber: string | null;
  plannedDate: string | null; actualDate: string | null; packageCount: number; weightKg: number | null;
  driverName: string | null; route: string | null; notes: string | null; createdAt: string;
  customer: { id: string; companyName: string | null; firstName: string | null; lastName: string | null; billingStreet: string | null; billingCity: string | null; billingPostalCode: string | null; billingCountry: string };
  salesOrder: { id: string; orderNumber: string; status: string } | null;
  warehouse: { code: string; name: string } | null;
  items: { id: string; productId: string; quantity: number; product: { sku: string; name: string; unit: string } }[];
  availableActions: string[];
};

const ACTION_LABELS: Record<string, string> = {
  pick: "logistics.pick",
  pack: "logistics.pack",
  ship: "logistics.ship",
  startTransit: "logistics.startTransit",
  deliver: "logistics.deliver",
  cancel: "common.cancel",
};

export default function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const can = usePermission();
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["shipment", id],
    queryFn: () => apiGet<ShipmentDetail>(`/api/logistics/${id}`),
  });

  const act = useMutation({
    mutationFn: (action: string) => apiPost(`/api/logistics/${id}`, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment", id] });
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("success", t("common.saved"));
    },
    onError: (e) => toast("error", e instanceof ApiClientError ? e.message : t("common.error")),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data) return <ErrorState title={t("error.notFound")} retry={refetch} />;

  const customerName = data.customer.companyName ?? `${data.customer.firstName ?? ""} ${data.customer.lastName ?? ""}`.trim();

  return (
    <div>
      <PageHeader
        title={data.shipmentNumber}
        breadcrumbs={[{ label: t("nav.shipments"), href: "/logistics" }, { label: data.shipmentNumber }]}
      />
      <EntityHeader
        number={data.shipmentNumber}
        title={customerName}
        status={<StatusBadge status={data.status} />}
        meta={
          <>
            {data.salesOrder && <span>{t("nav.orders")}: <Link href={`/sales/orders/${data.salesOrder.id}`} className="font-mono text-2xs text-primary hover:underline">{data.salesOrder.orderNumber}</Link></span>}
            <span>{t("logistics.carrier")}: {data.carrier ?? "—"}</span>
            {data.trackingNumber && <span className="font-mono text-2xs">{data.trackingNumber}</span>}
            <span>{t("logistics.packages")}: {data.packageCount}</span>
          </>
        }
        actions={
          can("logistics.update") && (
            <div className="flex flex-wrap items-center gap-2">
              {data.availableActions.map((action) => (
                <Button
                  key={action}
                  variant={action === "deliver" ? "success" : action === "cancel" ? "destructive" : action === "ship" ? "default" : "secondary"}
                  onClick={() => act.mutate(action)}
                  disabled={act.isPending}
                >
                  {t(ACTION_LABELS[action] ?? action)}
                </Button>
              ))}
            </div>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("logistics.cargo")} noPadding className="lg:col-span-2">
          <table className="data-table w-full text-[13px]">
            <thead>
              <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                <th className="px-4 py-2 text-left">SKU</th>
                <th className="px-4 py-2 text-left">{t("products.title")}</th>
                <th className="px-4 py-2 text-right">{t("common.quantity")}</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="space-y-4">
          <Card title={t("common.overview")}>
            <DescriptionList
              columns={1}
              items={[
                { label: t("customers.title"), value: <Link href={`/customers/${data.customer.id}`} className="text-primary hover:underline">{customerName}</Link> },
                {
                  label: t("logistics.address"),
                  value: (
                    <>
                      {data.customer.billingStreet ?? "—"}<br />
                      {data.customer.billingPostalCode ?? ""} {data.customer.billingCity ?? ""} ({data.customer.billingCountry})
                    </>
                  ),
                },
                { label: t("warehouses.title"), value: data.warehouse ? `${data.warehouse.code} — ${data.warehouse.name}` : "—" },
                { label: t("logistics.plannedDate"), value: data.plannedDate ? localeDate(data.plannedDate, locale) : "—" },
                { label: t("logistics.actualDate"), value: data.actualDate ? localeDate(data.actualDate, locale) : "—" },
                { label: t("logistics.driver"), value: data.driverName ?? "—" },
                ...(data.weightKg ? [{ label: t("products.weightKg"), value: `${data.weightKg} kg` }] : []),
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

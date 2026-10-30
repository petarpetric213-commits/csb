"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiGet } from "@/lib/client/api";
import { PageHeader, Card } from "@/components/ui/patterns";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Package, ShoppingCart, Receipt, Truck } from "lucide-react";

type Company = {
  id: string;
  legalName: string;
  tradingName: string | null;
  city: string | null;
  country: string;
  currency: string;
  isDemo: boolean;
  createdAt: string;
  counts: { memberships: number; employees: number; customers: number; suppliers: number; products: number; salesOrders: number; purchaseOrders: number; invoices: number };
};

export default function AdminPage() {
  const { t } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin"],
    queryFn: () => apiGet<Company[]>("/api/admin"),
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorState title={t("common.error")} retry={refetch} />;

  return (
    <div>
      <PageHeader title={t("admin.title")} description={t("admin.subtitle")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Card title={t("admin.health")}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded border p-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success animate-pulse" />{t("admin.database")}: <Badge tone="success">{t("admin.operational")}</Badge></div>
            <div className="rounded border p-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success animate-pulse" />{t("admin.api")}: <Badge tone="success">{t("admin.operational")}</Badge></div>
            <div className="rounded border p-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success animate-pulse" />{t("admin.auth")}: <Badge tone="success">{t("admin.operational")}</Badge></div>
            <div className="rounded border p-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-warning" />{t("admin.storage")}: <Badge tone="neutral">{t("admin.operational")}</Badge></div>
          </div>
        </Card>
        <Card title={t("admin.companies")}>
          <p className="text-2xl font-bold">{data?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground">{t("admin.subtitle")}</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-3">
        {data?.map((c) => (
          <Card key={c.id} title={c.tradingName ?? c.legalName} actions={c.isDemo ? <Badge tone="warning">DEMO</Badge> : <Badge tone="success">{c.country}</Badge>}>
            <p className="text-xs text-muted-foreground mb-3">{c.legalName} — {c.city ?? "—"} ({c.currency})</p>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="rounded bg-muted p-2 text-center"><Users size={14} className="mx-auto mb-1" />{c.counts.memberships} users<br /><span className="text-2xs text-muted-foreground">{c.counts.employees} {t("dashboard.employees")}</span></div>
              <div className="rounded bg-muted p-2 text-center"><Building2 size={14} className="mx-auto mb-1" />{c.counts.customers} {t("nav.customers")}<br /><span className="text-2xs text-muted-foreground">{c.counts.suppliers} {t("nav.suppliers")}</span></div>
              <div className="rounded bg-muted p-2 text-center"><Package size={14} className="mx-auto mb-1" />{c.counts.products} {t("nav.products")}<br /><span className="text-2xs text-muted-foreground">{c.counts.purchaseOrders} PO · {c.counts.salesOrders} SO</span></div>
              <div className="rounded bg-muted p-2 text-center"><Receipt size={14} className="mx-auto mb-1" />{c.counts.invoices} {t("nav.invoices")}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiGet } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { PageHeader } from "@/components/ui/patterns";
import { MetricCard, LoadingState, ErrorState } from "@/components/ui/states";
import { LineChartCard, BarChartCard, DonutChartCard, AreaChartCard } from "@/components/charts/chart-card";
import { Card } from "@/components/ui/patterns";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import {
  TrendingUp, ShoppingCart, Receipt, Boxes, AlertTriangle, Package,
  Factory, Truck, ListTodo, Users, Building2, Euro, LayoutGrid,
} from "lucide-react";

type DashboardData = {
  kpis: Record<string, number>;
  charts: {
    revenueByMonth: { name: string; revenue: number; orders: number }[];
    salesByCategory: { name: string; value: number }[];
    topCustomers: { name: string; value: number }[];
    inventoryMovements: { day: string; inbound: number; outbound: number }[];
    purchasingTrend: { label: string; value: number }[];
    productionOutput: { label: string; value: number }[];
  };
  lists: { lowStock: { name: string; sku: string; unit: string; available: number; reorderPoint: number }[] };
};

const WIDGETS = [
  "revenueByMonth", "salesByCategory", "topCustomers", "inventoryMovements",
  "purchasingTrend", "productionOutput",
] as const;
type WidgetKey = (typeof WIDGETS)[number];

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { session } = useSession();
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    setHidden(JSON.parse(localStorage.getItem("nexora.dashboard.hidden") ?? "[]"));
  }, []);

  const { data, isLoading, error, refetch } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => apiGet("/api/dashboard"),
    refetchInterval: 60_000,
  });

  const toggleWidget = (key: WidgetKey) => {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key];
      localStorage.setItem("nexora.dashboard.hidden", JSON.stringify(next));
      return next;
    });
  };

  const k = data?.kpis;
  const fmt = (n: number | undefined) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n ?? 0);
  const money = (n: number | undefined) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: session.company.currency ?? "EUR", maximumFractionDigits: 0 }).format(n ?? 0);

  const visible = (key: WidgetKey) => !hidden.includes(key);

  return (
    <div>
      <PageHeader
        title={t("dashboard.welcome", { name: session.user.name.split(" ")[0] })}
        description={new Intl.DateTimeFormat(locale === "de" ? "de-DE" : locale === "sr" ? "sr-RS" : "en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date())}
        actions={
          <div className="flex items-center gap-2">
            <Select
              aria-label={t("dashboard.configure")}
              className="h-8 w-40"
              value=""
              onChange={(e) => {
                if (e.target.value) toggleWidget(e.target.value as WidgetKey);
                e.target.value = "";
              }}
            >
              <option value="">{t("dashboard.configure")}</option>
              {WIDGETS.filter((w) => hidden.includes(w)).map((w) => (
                <option key={w} value={w}>
                  + {t(`dashboard.${w}`)}
                </option>
              ))}
              {WIDGETS.filter((w) => !hidden.includes(w)).map((w) => (
                <option key={`h-${w}`} value={w}>
                  − {t(`dashboard.${w}`)}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {isLoading ? (
        <LoadingState rows={10} />
      ) : error ? (
        <ErrorState title={t("common.error")} retry={refetch} />
      ) : data ? (
        <div className="space-y-4">
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <Link href="/sales/orders"><MetricCard label={t("dashboard.revenueMonth")} value={money(k!.revenueMonth)} icon={<TrendingUp size={15} />} /></Link>
            <Link href="/sales/orders"><MetricCard label={t("dashboard.ordersMonth")} value={fmt(k!.ordersMonthCount)} icon={<ShoppingCart size={15} />} /></Link>
            <Link href="/sales/invoices"><MetricCard label={t("dashboard.outstanding")} value={money(k!.outstanding)} icon={<Receipt size={15} />} tone={k!.overdue > 0 ? "warning" : "default"} sub={`${t("dashboard.overdue")}: ${money(k!.overdue)}`} /></Link>
            <Link href="/inventory"><MetricCard label={t("dashboard.inventoryValue")} value={money(k!.inventoryValue)} icon={<Boxes size={15} />} /></Link>
            <Link href="/inventory"><MetricCard label={t("dashboard.lowStock")} value={fmt(k!.lowStockCount)} icon={<AlertTriangle size={15} />} tone={k!.lowStockCount > 0 ? "warning" : "success"} /></Link>
            <Link href="/tasks"><MetricCard label={t("dashboard.tasks")} value={fmt(k!.tasksOpen)} icon={<ListTodo size={15} />} /></Link>
            <Link href="/customers"><MetricCard label={t("dashboard.customers")} value={fmt(k!.customerCount)} icon={<Users size={15} />} /></Link>
            <Link href="/suppliers"><MetricCard label={t("dashboard.suppliers")} value={fmt(k!.supplierCount)} icon={<Building2 size={15} />} /></Link>
            <Link href="/products"><MetricCard label={t("dashboard.products")} value={fmt(k!.productCount)} icon={<Package size={15} />} /></Link>
            <Link href="/purchasing/orders"><MetricCard label={t("dashboard.openPos")} value={fmt(k!.poOpen)} icon={<Package size={15} />} /></Link>
            <Link href="/production/orders"><MetricCard label={t("dashboard.openMos")} value={fmt(k!.moOpen)} icon={<Factory size={15} />} /></Link>
            <Link href="/logistics"><MetricCard label={t("dashboard.shipments")} value={fmt(k!.shipmentsOpen)} icon={<Truck size={15} />} /></Link>
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            {visible("revenueByMonth") && (
              <LineChartCard
                title={t("dashboard.revenueByMonth")}
                data={data.charts.revenueByMonth}
                series={[{ key: "revenue", label: "€ " + t("common.total") }]}
              />
            )}
            {visible("inventoryMovements") && (
              <AreaChartCard
                title={t("dashboard.inventoryMovements")}
                data={data.charts.inventoryMovements}
                series={[
                  { key: "inbound", label: t("dashboard.inbound"), color: "hsl(152 64% 35%)" },
                  { key: "outbound", label: t("dashboard.outbound"), color: "hsl(0 68% 48%)" },
                ]}
              />
            )}
            {visible("salesByCategory") && (
              <DonutChartCard title={t("dashboard.salesByCategory")} data={data.charts.salesByCategory} />
            )}
            {visible("topCustomers") && (
              <BarChartCard
                title={t("dashboard.topCustomers")}
                data={data.charts.topCustomers}
                series={[{ key: "value", label: "€" }]}
              />
            )}
            {visible("purchasingTrend") && (
              <BarChartCard
                title={t("dashboard.purchasingTrend")}
                data={data.charts.purchasingTrend}
                series={[{ key: "value", label: "€", color: "hsl(205 80% 42%)" }]}
              />
            )}
            {visible("productionOutput") && (
              <BarChartCard
                title={t("dashboard.productionOutput")}
                data={data.charts.productionOutput}
                series={[{ key: "value", label: t("production.produced"), color: "hsl(270 55% 50%)" }]}
              />
            )}
          </div>

          {/* Low stock list */}
          <Card title={t("dashboard.lowStockList")} noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2">{t("products.sku")}</th>
                  <th className="px-4 py-2">{t("common.name")}</th>
                  <th className="px-4 py-2 text-right">{t("products.available")}</th>
                  <th className="px-4 py-2 text-right">{t("products.reorderPoint")}</th>
                  <th className="px-4 py-2 text-right">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.lists.lowStock.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">
                      ✓ {t("mrp.none")}
                    </td>
                  </tr>
                )}
                {data.lists.lowStock.map((p) => (
                  <tr key={p.sku} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-2 font-mono text-2xs">{p.sku}</td>
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {p.available.toLocaleString("de-DE")} {p.unit}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{p.reorderPoint}</td>
                    <td className="px-4 py-2 text-right">
                      <StatusBadge status={p.available <= 0 ? "BLOCKED" : "MAINTENANCE"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

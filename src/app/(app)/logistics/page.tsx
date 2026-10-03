"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiList } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect, useStatusOptions } from "@/components/shared/filters";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { localeDate } from "@/lib/i18n";

type Row = {
  id: string; shipmentNumber: string; orderNumber: string | null; customer: string; status: string;
  carrier: string | null; trackingNumber: string | null; plannedDate: string | null; actualDate: string | null;
  packageCount: number; warehouse: string | null; itemCount: number;
};

function LogisticsPageInner() {
  const t = useI18n().t;
  const { locale } = useI18n();
  const router = useRouter();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();
  const statusOpts = useStatusOptions();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["shipments", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/logistics", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "shipmentNumber", header: t("logistics.number"), cell: (r) => <span className="font-mono text-2xs text-primary">{r.shipmentNumber}</span> }),
      col<Row>({ key: "customer", header: t("customers.title"), cell: (r) => <span className="font-medium">{r.customer}</span> }),
      col<Row>({ key: "orderNumber", header: t("nav.orders"), cell: (r) => r.orderNumber ? <span className="font-mono text-2xs">{r.orderNumber}</span> : "—" }),
      col<Row>({ key: "carrier", header: t("logistics.carrier"), cell: (r) => r.carrier ?? "—" }),
      col<Row>({ key: "trackingNumber", header: t("logistics.trackingNumber"), cell: (r) => r.trackingNumber ? <span className="font-mono text-2xs">{r.trackingNumber}</span> : "—" }),
      col<Row>({ key: "actualDate", header: t("logistics.date"), cell: (r) => r.actualDate ? localeDate(r.actualDate, locale) : "—" }),
      col<Row>({ key: "packageCount", header: t("logistics.packages"), align: "right" }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader title={t("logistics.title")} description={t("logistics.subtitle")} />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={
          <FilterSelect label={t("common.status")} value={filters.status ?? "ALL"} options={statusOpts.shipment}
            onChange={(v) => setFilter("status", v === "ALL" ? null : v)} />
        }
      />
      <DataTable
        storageKey="shipments"
        columns={columns}
        data={data?.items ?? []}
        total={data?.total}
        page={page} pageSize={pageSize}
        onPageChange={onPageChange}
        sorting={sorting ? [{ id: sorting.split(":")[0], desc: sorting.split(":")[1] === "desc" }] : []}
        onSortingChange={onSortingChange as never}
        isLoading={isLoading}
        error={error ? (error as Error).message : null}
        onRetry={refetch}
        onRowClick={(r) => router.push(`/logistics/${r.id}`)}
        emptyTitle={t("common.noResults")}
        exportName="shipments"
        csvHeaders={["Nummer", "Kunde", "Auftrag", "Spedition", "Tracking", "Datum", "Pakete", "Status"]}
        csvRows={(rows) => rows.map((r) => [r.shipmentNumber, r.customer, r.orderNumber ?? "", r.carrier ?? "", r.trackingNumber ?? "", r.actualDate?.slice(0, 10) ?? "", r.packageCount, r.status])}
      />
    </div>
  );
}

export default function LogisticsPage() {
  return <Suspense><LogisticsPageInner /></Suspense>;
}

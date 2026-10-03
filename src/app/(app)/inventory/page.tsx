"use client";

import React, { useMemo, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiList } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/states";

type Row = {
  id: string; sku: string; name: string; category: string | null; unit: string; reorderPoint: number;
  physical: number; reserved: number; quarantined: number; available: number; value: number;
  low: boolean; belowMin: boolean;
  warehouses: { warehouseId: string; warehouse: string; physical: number; reserved: number; quarantined: number }[];
};

function InventoryPageInner() {
  const t = useI18n().t;
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery({ pageSize: 50 });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "flat"],
    queryFn: () => apiList("/api/warehouses", { flat: "1" }),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["inventory", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/inventory", { page, pageSize, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "sku", header: t("products.sku"), cell: (r) => <span className="font-mono text-2xs">{r.sku}</span> }),
      col<Row>({ key: "name", header: t("common.name"), cell: (r) => (
        <div>
          <p className="font-medium">{r.name}</p>
          <p className="text-2xs text-muted-foreground">{r.category ?? "—"}</p>
        </div>
      ) }),
      col<Row>({ key: "warehouses", header: t("warehouses.title"), cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.warehouses.map((w) => (
            <span key={w.warehouseId} className="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs">
              {w.warehouse}: {w.physical.toLocaleString("de-DE")}
            </span>
          ))}
          {r.warehouses.length === 0 && <span className="text-2xs text-muted-foreground">—</span>}
        </div>
      ) }),
      col<Row>({ key: "physical", header: t("products.physical"), align: "right", cell: (r) => <span className="tabular-nums">{r.physical.toLocaleString("de-DE")} {r.unit}</span> }),
      col<Row>({ key: "reserved", header: t("products.reserved"), align: "right", cell: (r) => <span className="tabular-nums text-muted-foreground">{r.reserved.toLocaleString("de-DE")}</span> }),
      col<Row>({ key: "available", header: t("products.available"), align: "right", cell: (r) => (
        <span className={`tabular-nums ${r.belowMin ? "font-semibold text-danger" : r.low ? "font-semibold text-warning" : ""}`}>
          {r.available.toLocaleString("de-DE")}
        </span>
      ) }),
      col<Row>({ key: "reorderPoint", header: t("products.reorderPoint"), align: "right", cell: (r) => <span className="tabular-nums text-muted-foreground">{r.reorderPoint}</span> }),
      col<Row>({ key: "value", header: t("inventory.value"), align: "right", cell: (r) => <Money amount={r.value} /> }),
      col<Row>({ key: "flag", header: t("common.status"), cell: (r) => r.belowMin ? <Badge tone="danger">{t("inventory.belowMin")}</Badge> : r.low ? <Badge tone="warning">{t("inventory.low")}</Badge> : <Badge tone="success">{t("status.ACTIVE")}</Badge> }),
    ],
    [t]
  );

  const totalValue = (data?.items ?? []).reduce((s: number, r) => s + r.value, 0);

  return (
    <div>
      <PageHeader
        title={t("inventory.title")}
        description={t("inventory.subtitle")}
        actions={<span className="text-xs text-muted-foreground">{t("inventory.value")}: <strong className="text-foreground"><Money amount={totalValue} /></strong></span>}
      />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={
          <>
            <FilterSelect label={t("warehouses.title")} value={filters.warehouseId ?? "ALL"}
              options={(warehouses?.items ?? []).map((w: any) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
              onChange={(v) => setFilter("warehouseId", v === "ALL" ? null : v)} />
            <FilterSelect label={t("common.filter")} value={filters.filter ?? "ALL"}
              options={[{ value: "low", label: t("inventory.lowOnly") }]}
              onChange={(v) => setFilter("filter", v === "ALL" ? null : v)} />
          </>
        }
      />
      <DataTable
        storageKey="inventory"
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
        emptyTitle={t("common.noResults")}
        exportName="stock"
        csvHeaders={["SKU", "Name", "Lager", "Physisch", "Reserviert", "Verfügbar", "Meldebestand", "Wert"]}
        csvRows={(rows) => rows.map((r) => [r.sku, r.name, r.warehouses.map((w: Row["warehouses"][number]) => `${w.warehouse}:${w.physical}`).join(" "), r.physical, r.reserved, r.available, r.reorderPoint, r.value])}
      />
    </div>
  );
}

export default function InventoryPage() {
  return <Suspense><InventoryPageInner /></Suspense>;
}

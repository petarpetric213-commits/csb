"use client";

import React, { useMemo, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiList } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { localeDate } from "@/lib/i18n";

type Row = {
  id: string; movementNumber: string; type: string; quantity: number; createdAt: string;
  referenceNumber: string | null; batchNumber: string | null; note: string | null;
  product: { sku: string; name: string; unit: string };
  warehouse: { code: string; name: string };
};

const TYPES = [
  "PURCHASE_RECEIPT", "SALES_SHIPMENT", "TRANSFER_OUT", "TRANSFER_IN", "PRODUCTION_CONSUMPTION",
  "PRODUCTION_OUTPUT", "ADJUSTMENT", "RETURN_IN", "RETURN_OUT", "QUARANTINE_IN", "QUARANTINE_OUT",
  "OPENING_STOCK", "STOCKTAKE",
];

function MovementsPageInner() {
  const t = useI18n().t;
  const { locale } = useI18n();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "flat"],
    queryFn: () => apiList("/api/warehouses", { flat: "1" }),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["movements", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/inventory/movements", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "createdAt", header: t("common.date"), cell: (r) => localeDate(r.createdAt, locale) }),
      col<Row>({ key: "movementNumber", header: t("movements.number"), cell: (r) => <span className="font-mono text-2xs">{r.movementNumber}</span> }),
      col<Row>({ key: "product", header: t("products.title"), cell: (r) => (
        <div>
          <p className="font-medium">{r.product.name}</p>
          <p className="font-mono text-2xs text-muted-foreground">{r.product.sku}</p>
        </div>
      ) }),
      col<Row>({ key: "type", header: t("movements.type"), cell: (r) => t(`movements.type_${r.type}`) }),
      col<Row>({ key: "warehouse", header: t("warehouses.title"), cell: (r) => r.warehouse.code }),
      col<Row>({ key: "quantity", header: t("common.quantity"), align: "right", cell: (r) => (
        <span className={`tabular-nums ${r.quantity > 0 ? "text-success" : "text-danger"}`}>
          {r.quantity > 0 ? "+" : ""}{r.quantity.toLocaleString("de-DE")} {r.product.unit}
        </span>
      ) }),
      col<Row>({ key: "referenceNumber", header: t("common.reference"), cell: (r) => r.referenceNumber ?? (r.batchNumber ? `${t("quality.batch")}: ${r.batchNumber}` : "—") }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader title={t("movements.title")} description={t("movements.subtitle")} />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={
          <>
            <FilterSelect label={t("movements.type")} value={filters.type ?? "ALL"}
              options={TYPES.map((ty) => ({ value: ty, label: t(`movements.type_${ty}`) }))}
              onChange={(v) => setFilter("type", v === "ALL" ? null : v)} />
            <FilterSelect label={t("warehouses.title")} value={filters.warehouseId ?? "ALL"}
              options={(warehouses?.items ?? []).map((w: any) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
              onChange={(v) => setFilter("warehouseId", v === "ALL" ? null : v)} />
          </>
        }
      />
      <DataTable
        storageKey="movements"
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
        exportName="stock-movements"
        csvHeaders={["Datum", "Nummer", "Produkt", "Typ", "Lager", "Menge", "Referenz"]}
        csvRows={(rows) => rows.map((r) => [r.createdAt.slice(0, 10), r.movementNumber, `${r.product.sku} ${r.product.name}`, r.type, r.warehouse.code, r.quantity, r.referenceNumber ?? ""])}
      />
    </div>
  );
}

export default function MovementsPage() {
  return <Suspense><MovementsPageInner /></Suspense>;
}

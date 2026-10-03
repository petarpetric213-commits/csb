"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, ApiClientError } from "@/lib/client/api";
import { useListQuery, useCreateParam } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect, useStatusOptions } from "@/components/shared/filters";
import { LineItemsEditor, type LineItem, type ProductOption } from "@/components/shared/line-items-editor";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Money } from "@/components/ui/states";
import { localeDate } from "@/lib/i18n";

type Row = {
  id: string; orderNumber: string; supplier: string; status: string; orderDate: string;
  expectedDeliveryDate: string | null; total: number; currency: string; warehouse: string | null;
  itemCount: number; receiptCount: number;
};

export function PoCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", "flat"],
    queryFn: () => apiList("/api/suppliers", { pageSize: 200, status: "ACTIVE" }),
    enabled: open,
  });
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "flat"],
    queryFn: () => apiList("/api/warehouses", { flat: "1" }),
    enabled: open,
  });
  const { data: products } = useQuery({
    queryKey: ["products", "raw"],
    queryFn: () => apiList<ProductOption>("/api/products", { pageSize: 200, productType: "RAW_MATERIAL", sorting: "sku:asc" }),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (open && products?.items?.length && items.length === 0) {
      const p = products.items[0];
      setItems([{ key: crypto.randomUUID(), productId: p.id, quantity: 100, unitPrice: p.purchasePrice, discountPercent: 0, taxRate: p.taxRate }]);
    }
    if (!open) { setItems([]); setSupplierId(""); setNotes(""); setErrors({}); setExpectedDeliveryDate(""); setWarehouseId(""); }
  }, [open, products]);

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/purchasing/orders", {
        supplierId,
        warehouseId: warehouseId || null,
        expectedDeliveryDate: expectedDeliveryDate || null,
        notes: notes || null,
        items: items.map((it) => ({ productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice, discountPercent: it.discountPercent, taxRate: it.taxRate })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });

  return (
    <Dialog
      open={open} onClose={onClose} title={t("purchasing.new")} description={t("purchasing.ordersSubtitle")} size="xl"
      footer={<>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending || !supplierId || items.length === 0}>
          {create.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("suppliers.title")} required error={errors.supplierId}>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">—</option>
              {(suppliers?.items ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.supplierNumber} — {s.companyName}</option>)}
            </Select>
          </Field>
          <Field label={t("warehouses.title")}>
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">{t("purchasing.defaultWarehouse")}</option>
              {(warehouses?.items ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </Select>
          </Field>
          <Field label={t("purchasing.expectedDelivery")} error={errors.expectedDeliveryDate}>
            <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
          </Field>
          <Field label={t("common.notes")}>
            <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <LineItemsEditor items={items} onChange={setItems} products={products?.items ?? []} priceField="purchasePrice" />
      </div>
    </Dialog>
  );
}

function PurchaseOrdersPageInner() {
  const t = useI18n().t;
  const { locale } = useI18n();
  const router = useRouter();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();
  const statusOpts = useStatusOptions();
  const [createOpen, setCreateOpen] = useState(false);
  const { isNew, clearCreateParam } = useCreateParam();
  useEffect(() => {
    if (isNew && can("purchasing.create")) { setCreateOpen(true); clearCreateParam(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["purchase-orders", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/purchasing/orders", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "orderNumber", header: t("purchasing.poNumber"), cell: (r) => <span className="font-mono text-2xs text-primary">{r.orderNumber}</span> }),
      col<Row>({ key: "supplier", header: t("suppliers.title"), cell: (r) => <span className="font-medium">{r.supplier}</span> }),
      col<Row>({ key: "orderDate", header: t("common.date"), cell: (r) => localeDate(r.orderDate, locale) }),
      col<Row>({ key: "expectedDeliveryDate", header: t("purchasing.expectedDelivery"), cell: (r) => r.expectedDeliveryDate ? localeDate(r.expectedDeliveryDate, locale) : "—" }),
      col<Row>({ key: "total", header: t("common.total"), align: "right", cell: (r) => <Money amount={r.total} currency={r.currency} /> }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader
        title={t("purchasing.ordersTitle")}
        description={t("purchasing.ordersSubtitle")}
        actions={
          <>
            {data?.sumTotal !== undefined && (
              <span className="mr-2 text-xs text-muted-foreground">{t("common.total")}: <Money amount={data.sumTotal as number} /></span>
            )}
            {can("purchasing.create") && <Button onClick={() => setCreateOpen(true)}>+ {t("purchasing.new")}</Button>}
          </>
        }
      />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={
          <FilterSelect label={t("common.status")} value={filters.status ?? "ALL"} options={statusOpts.purchaseOrder}
            onChange={(v) => setFilter("status", v === "ALL" ? null : v)} />
        }
      />
      <DataTable
        storageKey="purchase-orders"
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
        onRowClick={(r) => router.push(`/purchasing/orders/${r.id}`)}
        emptyTitle={t("common.noResults")}
        exportName="purchase-orders"
        csvHeaders={["Nummer", "Lieferant", "Datum", "Lieferung vsl.", "Summe", "Status"]}
        csvRows={(rows) => rows.map((r) => [r.orderNumber, r.supplier, r.orderDate.slice(0, 10), r.expectedDeliveryDate?.slice(0, 10) ?? "", r.total, r.status])}
      />
      <PoCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function PurchaseOrdersPage() {
  return <Suspense><PurchaseOrdersPageInner /></Suspense>;
}

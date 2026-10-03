"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiGet, apiPost, ApiClientError } from "@/lib/client/api";
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
  id: string; orderNumber: string; customer: string; status: string; orderDate: string;
  requestedDeliveryDate: string | null; total: number; currency: string;
  salesRep: string | null; itemCount: number; invoiceCount: number;
};

export function OrderCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [shippingCost, setShippingCost] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: customers } = useQuery({
    queryKey: ["customers", "flat"],
    queryFn: () => apiList("/api/customers", { pageSize: 200, status: "ACTIVE" }),
    enabled: open,
  });
  const { data: products } = useQuery({
    queryKey: ["products", "flat"],
    queryFn: () => apiList<ProductOption>("/api/products", { pageSize: 200, status: "ACTIVE", sorting: "sku:asc" }),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (open && products?.items?.length && items.length === 0) {
      const p = products.items[0];
      setItems([{ key: crypto.randomUUID(), productId: p.id, quantity: 10, unitPrice: p.salesPrice, discountPercent: 0, taxRate: p.taxRate }]);
    }
    if (!open) {
      setItems([]); setCustomerId(""); setNotes(""); setShippingCost("0"); setRequestedDeliveryDate(""); setErrors({});
    }
  }, [open, products]);

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/sales/orders", {
        customerId,
        requestedDeliveryDate: requestedDeliveryDate || null,
        shippingCost: Number(shippingCost) || 0,
        notes: notes || null,
        items: items.map((it) => ({
          productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice,
          discountPercent: it.discountPercent, taxRate: it.taxRate,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });

  return (
    <Dialog
      open={open} onClose={onClose} title={t("sales.new")} description={t("sales.ordersSubtitle")} size="xl"
      footer={<>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending || !customerId || items.length === 0}>
          {create.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("customers.title")} required error={errors.customerId}>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">—</option>
              {(customers?.items ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.customerNumber} — {c.companyName}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("sales.requestedDelivery")} error={errors.requestedDeliveryDate}>
            <Input type="date" value={requestedDeliveryDate} onChange={(e) => setRequestedDeliveryDate(e.target.value)} />
          </Field>
          <Field label={t("sales.shippingCost")}>
            <Input type="number" min={0} step="0.01" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
          </Field>
          <Field label={t("common.notes")}>
            <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <LineItemsEditor items={items} onChange={setItems} products={products?.items ?? []} priceField="salesPrice" />
      </div>
    </Dialog>
  );
}

function SalesOrdersPageInner() {
  const t = useI18n().t;
  const { locale } = useI18n();
  const router = useRouter();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();
  const statusOpts = useStatusOptions();
  const [createOpen, setCreateOpen] = useState(false);
  const { isNew, clearCreateParam } = useCreateParam();
  useEffect(() => {
    if (isNew && can("sales.create")) { setCreateOpen(true); clearCreateParam(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sales-orders", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/sales/orders", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "orderNumber", header: t("sales.orderNumber"), cell: (r) => <span className="font-mono text-2xs text-primary">{r.orderNumber}</span> }),
      col<Row>({ key: "customer", header: t("customers.title"), cell: (r) => <span className="font-medium">{r.customer}</span> }),
      col<Row>({ key: "orderDate", header: t("common.date"), cell: (r) => localeDate(r.orderDate, locale) }),
      col<Row>({ key: "requestedDeliveryDate", header: t("sales.requestedDelivery"), cell: (r) => r.requestedDeliveryDate ? localeDate(r.requestedDeliveryDate, locale) : "—" }),
      col<Row>({ key: "itemCount", header: t("sales.positions"), align: "right" }),
      col<Row>({ key: "total", header: t("common.total"), align: "right", cell: (r) => <Money amount={r.total} currency={r.currency} /> }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader
        title={t("sales.ordersTitle")}
        description={t("sales.ordersSubtitle")}
        actions={
          <>
            {data?.sumTotal !== undefined && (
              <span className="mr-2 text-xs text-muted-foreground">
                {t("common.total")}: <Money amount={data.sumTotal as number} />
              </span>
            )}
            {can("sales.create") && <Button onClick={() => setCreateOpen(true)}>+ {t("sales.new")}</Button>}
          </>
        }
      />
      <ListFilters
        q={q}
        onSearch={onSearch}
        selects={
          <FilterSelect label={t("common.status")} value={filters.status ?? "ALL"} options={statusOpts.salesOrder}
            onChange={(v) => setFilter("status", v === "ALL" ? null : v)} />
        }
      />
      <DataTable
        storageKey="sales-orders"
        columns={columns}
        data={data?.items ?? []}
        total={data?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        sorting={sorting ? [{ id: sorting.split(":")[0], desc: sorting.split(":")[1] === "desc" }] : []}
        onSortingChange={onSortingChange as never}
        isLoading={isLoading}
        error={error ? (error as Error).message : null}
        onRetry={refetch}
        onRowClick={(r) => router.push(`/sales/orders/${r.id}`)}
        emptyTitle={t("common.noResults")}
        exportName="sales-orders"
        csvHeaders={["Nummer", "Kunde", "Datum", "Status", "Summe"]}
        csvRows={(rows) => rows.map((r) => [r.orderNumber, r.customer, r.orderDate.slice(0, 10), r.status, r.total])}
      />
      <OrderCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function SalesOrdersPage() {
  return <Suspense><SalesOrdersPageInner /></Suspense>;
}

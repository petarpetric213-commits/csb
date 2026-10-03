"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, ApiClientError } from "@/lib/client/api";
import { useListQuery, useCreateParam } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect } from "@/components/shared/filters";
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
  id: string; quoteNumber: string; customer: string; status: string; issueDate: string;
  validUntil: string | null; total: number; currency: string; salesRep: string | null; itemCount: number;
};

function QuoteCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: customers } = useQuery({
    queryKey: ["customers", "flat"],
    queryFn: () => apiList("/api/customers", { pageSize: 200 }),
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
    if (!open) { setItems([]); setCustomerId(""); setNotes(""); setErrors({}); setValidUntil(""); }
  }, [open, products]);

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/sales/quotes", {
        customerId,
        validUntil: validUntil || null,
        notes: notes || null,
        items: items.map((it) => ({ productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice, discountPercent: it.discountPercent, taxRate: it.taxRate })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      onClose();
    },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });

  return (
    <Dialog
      open={open} onClose={onClose} title={t("sales.newQuote")} description={t("sales.quotesSubtitle")} size="xl"
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
          <Field label={t("sales.validUntil")}>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
          <Field label={t("common.notes")} className="sm:col-span-2">
            <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <LineItemsEditor items={items} onChange={setItems} products={products?.items ?? []} />
      </div>
    </Dialog>
  );
}

function QuotesPageInner() {
  const t = useI18n().t;
  const { locale } = useI18n();
  const router = useRouter();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const { isNew, clearCreateParam } = useCreateParam();
  useEffect(() => {
    if (isNew && can("quotes.create")) { setCreateOpen(true); clearCreateParam(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["quotes", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/sales/quotes", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "quoteNumber", header: t("sales.quoteNumber"), cell: (r) => <span className="font-mono text-2xs text-primary">{r.quoteNumber}</span> }),
      col<Row>({ key: "customer", header: t("customers.title"), cell: (r) => <span className="font-medium">{r.customer}</span> }),
      col<Row>({ key: "issueDate", header: t("sales.issueDate"), cell: (r) => localeDate(r.issueDate, locale) }),
      col<Row>({ key: "validUntil", header: t("sales.validUntil"), cell: (r) => r.validUntil ? localeDate(r.validUntil, locale) : "—" }),
      col<Row>({ key: "total", header: t("common.total"), align: "right", cell: (r) => <Money amount={r.total} currency={r.currency} /> }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader
        title={t("sales.quotesTitle")}
        description={t("sales.quotesSubtitle")}
        actions={can("quotes.create") && <Button onClick={() => setCreateOpen(true)}>+ {t("sales.newQuote")}</Button>}
      />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={
          <FilterSelect label={t("common.status")} value={filters.status ?? "ALL"}
            options={["DRAFT", "SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"].map((s) => ({ value: s, label: t(`status.${s}`) }))}
            onChange={(v) => setFilter("status", v === "ALL" ? null : v)} />
        }
      />
      <DataTable
        storageKey="quotes"
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
        onRowClick={(r) => router.push(`/sales/quotes/${r.id}`)}
        emptyTitle={t("common.noResults")}
        exportName="quotes"
        csvHeaders={["Nummer", "Kunde", "Datum", "Status", "Summe"]}
        csvRows={(rows) => rows.map((r) => [r.quoteNumber, r.customer, r.issueDate.slice(0, 10), r.status, r.total])}
      />
      <QuoteCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function QuotesPage() {
  return <Suspense><QuotesPageInner /></Suspense>;
}

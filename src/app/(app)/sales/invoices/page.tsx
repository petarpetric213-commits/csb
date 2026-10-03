"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, ApiClientError } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
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
  id: string; invoiceNumber: string; customer: string; status: string; issueDate: string;
  dueDate: string | null; total: number; paidAmount: number; outstanding: number;
  currency: string; orderNumber: string | null;
};

function ManualInvoiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
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

  React.useEffect(() => {
    if (!open) { setItems([]); setCustomerId(""); setNotes(""); setErrors({}); setDueDate(""); }
  }, [open]);

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/sales/invoices", {
        customerId, issueDate, dueDate: dueDate || null, notes: notes || null,
        items: items.map((it) => ({ productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice, discountPercent: it.discountPercent, taxRate: it.taxRate })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onClose();
    },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });

  return (
    <Dialog
      open={open} onClose={onClose} title={t("invoices.newManual")} description={t("invoices.manualSubtitle")} size="xl"
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
              {(customers?.items ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.customerNumber} — {c.companyName}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("invoices.issued")} error={errors.issueDate}>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
            <Field label={t("invoices.due")}>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
          <Field label={t("common.notes")} className="sm:col-span-2">
            <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <LineItemsEditor items={items} onChange={setItems} products={products?.items ?? []} />
      </div>
    </Dialog>
  );
}

function InvoicesPageInner() {
  const t = useI18n().t;
  const { locale } = useI18n();
  const router = useRouter();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();
  const statusOpts = useStatusOptions();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["invoices", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/sales/invoices", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "invoiceNumber", header: t("invoices.number"), cell: (r) => <span className="font-mono text-2xs text-primary">{r.invoiceNumber}</span> }),
      col<Row>({ key: "customer", header: t("customers.title"), cell: (r) => <span className="font-medium">{r.customer}</span> }),
      col<Row>({ key: "issueDate", header: t("invoices.issued"), cell: (r) => localeDate(r.issueDate, locale) }),
      col<Row>({ key: "dueDate", header: t("invoices.due"), cell: (r) => r.dueDate ? localeDate(r.dueDate, locale) : "—" }),
      col<Row>({ key: "total", header: t("common.total"), align: "right", cell: (r) => <Money amount={r.total} currency={r.currency} /> }),
      col<Row>({ key: "paidAmount", header: t("invoices.paid"), align: "right", cell: (r) => <Money amount={r.paidAmount} currency={r.currency} /> }),
      col<Row>({ key: "outstanding", header: t("invoices.outstanding"), align: "right", cell: (r) => <span className={r.outstanding > 0 ? "font-semibold" : "text-success"}><Money amount={r.outstanding} currency={r.currency} /></span> }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader
        title={t("invoices.title")}
        description={t("invoices.subtitle")}
        actions={
          <>
            {data && (
              <div className="mr-2 flex gap-3 text-xs text-muted-foreground">
                <span>{t("common.total")}: <Money amount={data.sumTotal as number} /></span>
                <span>{t("invoices.outstanding")}: <strong className="text-foreground"><Money amount={data.sumOutstanding as number} /></strong></span>
              </div>
            )}
            {can("invoices.create") && <Button variant="outline" onClick={() => setCreateOpen(true)}>+ {t("invoices.newManual")}</Button>}
          </>
        }
      />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={
          <FilterSelect label={t("common.status")} value={filters.status ?? "ALL"} options={statusOpts.invoice}
            onChange={(v) => setFilter("status", v === "ALL" ? null : v)} />
        }
      />
      <DataTable
        storageKey="invoices"
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
        onRowClick={(r) => router.push(`/sales/invoices/${r.id}`)}
        emptyTitle={t("common.noResults")}
        exportName="invoices"
        csvHeaders={["Nummer", "Kunde", "Datum", "Fällig", "Summe", "Bezahlt", "Offen", "Status"]}
        csvRows={(rows) => rows.map((r) => [r.invoiceNumber, r.customer, r.issueDate.slice(0, 10), r.dueDate?.slice(0, 10) ?? "", r.total, r.paidAmount, r.outstanding, r.status])}
      />
      <ManualInvoiceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function InvoicesPage() {
  return <Suspense><InvoicesPageInner /></Suspense>;
}

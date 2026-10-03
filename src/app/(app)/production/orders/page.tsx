"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, ApiClientError } from "@/lib/client/api";
import { useListQuery, useCreateParam } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect, useStatusOptions } from "@/components/shared/filters";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { localeDate } from "@/lib/i18n";

type Row = {
  id: string; orderNumber: string; product: string; sku: string; status: string; priority: string;
  quantity: number; producedQuantity: number; unit: string; workCenter: string | null;
  responsible: string | null; plannedStart: string | null; plannedEnd: string | null;
  actualStart: string | null; actualEnd: string | null; materialStatus: string;
};

function MoCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({
    productId: "", quantity: "100", workCenterId: "", priority: "NORMAL",
    plannedStart: "", plannedEnd: "", notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: products } = useQuery({
    queryKey: ["products", "fg"],
    queryFn: () => apiList("/api/products", { pageSize: 200, productType: "FINISHED_GOOD", sorting: "sku:asc" }),
    enabled: open,
  });
  const { data: workCenters } = useQuery({
    queryKey: ["work-centers"],
    queryFn: () => apiList("/api/production/work-centers", { pageSize: 100 }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/production/orders", {
        ...form,
        quantity: Number(form.quantity),
        workCenterId: form.workCenterId || null,
        plannedStart: form.plannedStart || null,
        plannedEnd: form.plannedEnd || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog
      open={open} onClose={onClose} title={t("production.new")} description={t("production.ordersSubtitle")} size="lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending || !form.productId}>
          {create.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("products.title")} required error={errors.productId} className="sm:col-span-2">
          <Select value={form.productId} onChange={set("productId")}>
            <option value="">—</option>
            {(products?.items ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
          </Select>
        </Field>
        <Field label={t("common.quantity")} required error={errors.quantity}>
          <Input type="number" min={1} step="any" value={form.quantity} onChange={set("quantity")} />
        </Field>
        <Field label={t("production.priority")}>
          <Select value={form.priority} onChange={set("priority")}>
            <option value="LOW">{t("common.prio_LOW")}</option>
            <option value="NORMAL">{t("common.prio_NORMAL")}</option>
            <option value="HIGH">{t("common.prio_HIGH")}</option>
            <option value="URGENT">{t("common.prio_URGENT")}</option>
          </Select>
        </Field>
        <Field label={t("workcenters.title")}>
          <Select value={form.workCenterId} onChange={set("workCenterId")}>
            <option value="">—</option>
            {(workCenters?.items ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("production.plannedStart")}>
            <Input type="date" value={form.plannedStart} onChange={set("plannedStart")} />
          </Field>
          <Field label={t("production.plannedEnd")}>
            <Input type="date" value={form.plannedEnd} onChange={set("plannedEnd")} />
          </Field>
        </div>
        <Field label={t("common.notes")} className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={set("notes")} />
        </Field>
        <p className="text-2xs text-muted-foreground sm:col-span-2">{t("production.bomHint")}</p>
      </div>
    </Dialog>
  );
}

function ProductionOrdersPageInner() {
  const t = useI18n().t;
  const { locale } = useI18n();
  const router = useRouter();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();
  const statusOpts = useStatusOptions();
  const [createOpen, setCreateOpen] = useState(false);
  const { isNew, clearCreateParam } = useCreateParam();
  useEffect(() => {
    if (isNew && can("production.create")) { setCreateOpen(true); clearCreateParam(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["production-orders", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/production/orders", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "orderNumber", header: t("production.moNumber"), cell: (r) => <span className="font-mono text-2xs text-primary">{r.orderNumber}</span> }),
      col<Row>({ key: "product", header: t("products.title"), cell: (r) => (
        <div>
          <p className="font-medium">{r.product}</p>
          <p className="font-mono text-2xs text-muted-foreground">{r.sku}</p>
        </div>
      ) }),
      col<Row>({ key: "quantity", header: t("common.quantity"), align: "right", cell: (r) => (
        <span className="tabular-nums">
          {r.producedQuantity > 0 ? `${r.producedQuantity}/${r.quantity}` : r.quantity} {r.unit}
        </span>
      ) }),
      col<Row>({ key: "priority", header: t("production.priority"), cell: (r) => (
        <Badge tone={r.priority === "URGENT" ? "danger" : r.priority === "HIGH" ? "warning" : r.priority === "LOW" ? "neutral" : "info"}>
          {t(`common.prio_${r.priority}`)}
        </Badge>
      ) }),
      col<Row>({ key: "workCenter", header: t("workcenters.title"), cell: (r) => r.workCenter ?? "—" }),
      col<Row>({ key: "plannedStart", header: t("production.plannedStart"), cell: (r) => r.plannedStart ? localeDate(r.plannedStart, locale) : "—" }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader
        title={t("production.ordersTitle")}
        description={t("production.ordersSubtitle")}
        actions={can("production.create") && <Button onClick={() => setCreateOpen(true)}>+ {t("production.new")}</Button>}
      />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={
          <FilterSelect label={t("common.status")} value={filters.status ?? "ALL"} options={statusOpts.mo}
            onChange={(v) => setFilter("status", v === "ALL" ? null : v)} />
        }
      />
      <DataTable
        storageKey="production-orders"
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
        onRowClick={(r) => router.push(`/production/orders/${r.id}`)}
        emptyTitle={t("common.noResults")}
        exportName="production-orders"
        csvHeaders={["Nummer", "Produkt", "Menge", "Priorität", "Arbeitsplatz", "Start", "Status"]}
        csvRows={(rows) => rows.map((r) => [r.orderNumber, `${r.sku} ${r.product}`, `${r.producedQuantity}/${r.quantity}`, r.priority, r.workCenter ?? "", r.plannedStart?.slice(0, 10) ?? "", r.status])}
      />
      <MoCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function ProductionOrdersPage() {
  return <Suspense><ProductionOrdersPageInner /></Suspense>;
}

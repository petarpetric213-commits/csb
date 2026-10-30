"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, ApiClientError, apiGet, apiSend } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect } from "@/components/shared/filters";
import { PageHeader, Card } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { localeDate } from "@/lib/i18n";

type Row = {
  id: string;
  inspectionNumber: string;
  batchNumber: string | null;
  sourceType: string;
  result: string;
  inspectedAt: string;
  product: { sku: string; name: string; unit: string };
  inspector: { name: string } | null;
};

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [form, setForm] = useState({ productId: "", batchNumber: "", sourceType: "ROUTINE", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: products } = useQuery({
    queryKey: ["productsFlat"], queryFn: () => apiGet<{ items: { id: string; name: string; sku: string }[] }>("/api/products?pageSize=100").then((r: any) => r.items ?? r.data ?? []),
    enabled: open,
  });
  const create = useMutation({
    mutationFn: () => apiPost("/api/quality", form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quality"] }); onClose(); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // fallback fetch products via apiList
  const productsList = (products as any) ?? [];
  return (
    <Dialog open={open} onClose={onClose} title={t("quality.new")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={() => create.mutate()}>{t("common.save")}</Button></>}>
      <div className="grid gap-3">
        <Field label={t("common.product")} required error={errors.productId}>
          <Select value={form.productId} onChange={set("productId")}>
            <option value="">—</option>
            {productsList.map((p: any) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
          </Select>
        </Field>
        <Field label={t("quality.batch")}><Input value={form.batchNumber} onChange={set("batchNumber")} /></Field>
        <Field label={t("quality.source")}><Select value={form.sourceType} onChange={set("sourceType")}><option value="ROUTINE">ROUTINE</option><option value="GOODS_RECEIPT">GOODS_RECEIPT</option><option value="PRODUCTION">PRODUCTION</option><option value="CUSTOMER_COMPLAINT">CUSTOMER_COMPLAINT</option></Select></Field>
        <Field label={t("common.notes")}><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field>
      </div>
    </Dialog>
  );
}

function QualityPageInner() {
  const { t, locale } = useI18n();
  const can = usePermission();
  const { page, pageSize, q, onPageChange, onSearch, setFilter, filters } = useListQuery();
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["quality", { page, pageSize, q, ...filters }],
    queryFn: () => apiList<Row>("/api/quality", { page, pageSize, q, ...filters }),
  });

  const recordResult = useMutation({
    mutationFn: ({ id, result }: { id: string; result: string }) => apiSend(`/api/quality/${id}`, "POST", { result }),
    onSuccess: () => refetch(),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "inspectionNumber", header: t("quality.number"), cell: (r) => <span className="font-mono text-2xs">{r.inspectionNumber}</span> }),
      col<Row>({ key: "product", header: t("common.product"), cell: (r) => <span>{r.product.sku} — {r.product.name}</span> }),
      col<Row>({ key: "batchNumber", header: t("quality.batch"), cell: (r) => r.batchNumber ?? "—" }),
      col<Row>({ key: "sourceType", header: t("quality.source"), cell: (r) => <Badge tone="neutral">{r.sourceType}</Badge> }),
      col<Row>({ key: "result", header: t("quality.result"), cell: (r) => <StatusBadge status={r.result} /> }),
      col<Row>({ key: "inspectedAt", header: t("quality.inspectedAt"), cell: (r) => localeDate(r.inspectedAt, locale) }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader title={t("quality.title")} description={t("quality.subtitle")} actions={can("quality.create") ? <Button onClick={() => setOpen(true)}>+ {t("quality.new")}</Button> : null} />
      <ListFilters q={q} onSearch={onSearch} selects={<FilterSelect label={t("quality.result")} value={filters.result ?? "ALL"} options={[{ value: "PENDING", label: "PENDING" }, { value: "PASS", label: "PASS" }, { value: "FAIL", label: "FAIL" }, { value: "CONDITIONAL", label: "CONDITIONAL" }]} onChange={(v) => setFilter("result", v === "ALL" ? null : v)} />} />
      <DataTable
        storageKey="quality" columns={columns} data={data?.items ?? []} total={data?.total} page={page} pageSize={pageSize} onPageChange={onPageChange} isLoading={isLoading} error={error ? (error as Error).message : null} onRetry={refetch} emptyTitle={t("common.noResults")}
        rowActions={(row: Row) => row.result === "PENDING" && can("quality.update") ? (
          <div className="flex gap-1"><Button size="xs" variant="outline" onClick={() => recordResult.mutate({ id: row.id, result: "PASS" })}>PASS</Button><Button size="xs" variant="destructive" onClick={() => recordResult.mutate({ id: row.id, result: "FAIL" })}>FAIL</Button></div>
        ) : null}
      />
      <CreateDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export default function QualityPage() {
  return <Suspense><QualityPageInner /></Suspense>;
}

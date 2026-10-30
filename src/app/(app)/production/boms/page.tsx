"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, ApiClientError } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col, SearchInput } from "@/components/ui/data-table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";

type Row = {
  id: string;
  name: string | null;
  status: string;
  version: number;
  product: { sku: string; name: string; unit: string };
  items: { component: { sku: string; name: string } }[];
  usageCount: number;
};

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [form, setForm] = useState({ productId: "", name: "", componentProductId: "", quantity: "1" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: products } = useQuery({
    queryKey: ["productsForBom"], queryFn: async () => {
      const r = await fetch("/api/products?pageSize=100", { credentials: "same-origin" }).then((res) => res.json());
      return r.data as { id: string; sku: string; name: string }[];
    }, enabled: open,
  });

  const create = useMutation({
    mutationFn: () => apiPost("/api/production/boms", {
      productId: form.productId,
      name: form.name,
      items: [{ componentProductId: form.componentProductId, quantity: Number(form.quantity) }],
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["boms"] }); onClose(); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const list = (products ?? []) as any[];
  return (
    <Dialog open={open} onClose={onClose} title={t("boms.new")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={() => create.mutate()}>{t("common.save")}</Button></>}>
      <div className="grid gap-3">
        <Field label={t("boms.finishedProduct")} required error={errors.productId}><Select value={form.productId} onChange={set("productId")}><option value="">—</option>{list.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</Select></Field>
        <Field label={t("common.name")} required error={errors.name}><Input value={form.name} onChange={set("name")} placeholder="npr. Burek sastavnica" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("boms.component")} required><Select value={form.componentProductId} onChange={set("componentProductId")}><option value="">—</option>{list.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</Select></Field>
          <Field label={t("common.quantity")}><Input type="number" min={0} step="0.01" value={form.quantity} onChange={set("quantity")} /></Field>
        </div>
        <p className="text-2xs text-muted-foreground">Minimalno kreiranje sa 1 komponentom. Za kompleksnije sastavnice izmeni preko API-ja ili dodaj više komponenti kasnije.</p>
      </div>
    </Dialog>
  );
}

function BomPageInner() {
  const t = useI18n().t;
  const can = usePermission();
  const { page, pageSize, q, onPageChange, onSearch } = useListQuery({ pageSize: 25 });
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["boms", { page, pageSize, q }],
    queryFn: () => apiList<Row>("/api/production/boms", { page, pageSize, q }),
  });
  const columns = useMemo(
    () => [
      col<Row>({ key: "product", header: t("boms.finishedProduct"), cell: (r) => <span className="font-medium">{r.product.sku} — {r.product.name}</span> }),
      col<Row>({ key: "name", header: t("common.name"), cell: (r) => r.name ?? "—" }),
      col<Row>({ key: "version", header: t("boms.version"), cell: (r) => `v${r.version}` }),
      col<Row>({ key: "components", header: t("production.components"), cell: (r) => <span className="text-xs">{r.items.length} {t("common.items")}</span> }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
    ],
    [t]
  );
  return (
    <div>
      <PageHeader title={t("boms.title")} description={t("boms.subtitle")} actions={can("boms.create") ? <Button onClick={() => setOpen(true)}>+ {t("boms.new")}</Button> : null} />
      <div className="mb-3 flex items-center gap-2"><SearchInput value={q} onChange={onSearch} placeholder={t("common.searchPlaceholder")} className="w-64" /></div>
      <DataTable storageKey="boms" columns={columns} data={data?.items ?? []} total={data?.total} page={page} pageSize={pageSize} onPageChange={onPageChange} isLoading={isLoading} error={error ? (error as Error).message : null} onRetry={refetch} emptyTitle={t("common.noResults")} />
      <CreateDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export default function BomsPage() {
  return <Suspense><BomPageInner /></Suspense>;
}

"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, apiPatch, apiDelete, ApiClientError } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col, SearchInput } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";

type Row = { id: string; name: string; description: string | null; productCount: number };

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => apiPost("/api/categories", form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); onClose(); setForm({ name: "", description: "" }); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog open={open} onClose={onClose} title={t("categories.new")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={() => create.mutate()}>{t("common.save")}</Button></>}>
      <div className="grid gap-3">
        <Field label={t("common.name")} required error={errors.name}><Input value={form.name} onChange={set("name")} /></Field>
        <Field label={t("common.description")}><Textarea rows={2} value={form.description} onChange={set("description")} /></Field>
      </div>
    </Dialog>
  );
}

function CategoriesPageInner() {
  const t = useI18n().t;
  const can = usePermission();
  const { page, pageSize, q, onPageChange, onSearch } = useListQuery({ pageSize: 25 });
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["categories", { page, pageSize, q }],
    queryFn: () => apiList<Row>("/api/categories", { page, pageSize, q }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/categories/${id}`),
    onSuccess: () => refetch(),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "name", header: t("common.name"), cell: (r) => <span className="font-medium">{r.name}</span> }),
      col<Row>({ key: "description", header: t("common.description"), cell: (r) => r.description ?? "—" }),
      col<Row>({ key: "productCount", header: t("products.title"), align: "right", cell: (r) => `${r.productCount}` }),
    ],
    [t]
  );

  return (
    <div>
      <PageHeader title={t("nav.categories")} description={t("categories.subtitle")} actions={can("categories.manage") ? <Button onClick={() => setOpen(true)}>+ {t("categories.new")}</Button> : null} />
      <div className="mb-3 flex items-center gap-2"><SearchInput value={q} onChange={onSearch} placeholder={t("common.searchPlaceholder")} className="w-64" /></div>
      <DataTable
        storageKey="categories" columns={columns} data={data?.items ?? []} total={data?.total} page={page} pageSize={pageSize} onPageChange={onPageChange} isLoading={isLoading} error={error ? (error as Error).message : null} onRetry={refetch} emptyTitle={t("common.noResults")}
        rowActions={(row: Row) => can("categories.manage") ? <Button size="xs" variant="destructive" onClick={() => { if (confirm(t("common.confirmDelete"))) remove.mutate(row.id); }}>{t("common.delete")}</Button> : null}
      />
      <CreateDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export default function CategoriesPage() {
  return <Suspense><CategoriesPageInner /></Suspense>;
}

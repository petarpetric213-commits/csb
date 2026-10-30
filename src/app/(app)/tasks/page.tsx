"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, apiPatch, ApiClientError } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect } from "@/components/shared/filters";
import { PageHeader, Card } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { localeDate } from "@/lib/i18n";

type Row = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  assignee: { id: string; name: string } | null;
  createdBy: { name: string } | null;
};

function TaskCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", description: "", priority: "NORMAL", dueDate: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => apiPost("/api/tasks", { ...form, description: form.description || null, dueDate: form.dueDate || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); onClose(); setForm({ title: "", description: "", priority: "NORMAL", dueDate: "" }); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog open={open} onClose={onClose} title={t("tasks.new")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={() => create.mutate()} disabled={create.isPending}>{t("common.save")}</Button></>}>
      <div className="grid gap-3">
        <Field label={t("common.title")} required error={errors.title}><Input value={form.title} onChange={set("title")} /></Field>
        <Field label={t("common.description")}><Textarea rows={2} value={form.description} onChange={set("description")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("common.priority")}><Select value={form.priority} onChange={set("priority")}><option value="LOW">{t("priority.LOW")}</option><option value="NORMAL">{t("priority.NORMAL")}</option><option value="HIGH">{t("priority.HIGH")}</option><option value="URGENT">{t("priority.URGENT")}</option></Select></Field>
          <Field label={t("tasks.dueDate")}><Input type="date" value={form.dueDate} onChange={set("dueDate")} /></Field>
        </div>
      </div>
    </Dialog>
  );
}

function TasksPageInner() {
  const { t, locale } = useI18n();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tasks", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/tasks", { page, pageSize, sorting, q, ...filters }),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => apiPatch(`/api/tasks/${id}`, { action }),
    onSuccess: () => refetch(),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "title", header: t("common.title"), cell: (r) => <div><p className="font-medium">{r.title}</p><p className="text-2xs text-muted-foreground truncate max-w-[320px]">{r.description ?? "—"}</p></div> }),
      col<Row>({ key: "priority", header: t("common.priority"), cell: (r) => <Badge tone={r.priority === "URGENT" ? "danger" : r.priority === "HIGH" ? "warning" : "neutral"}>{t(`priority.${r.priority}`)}</Badge> }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
      col<Row>({ key: "assignee", header: t("common.assignee"), cell: (r) => r.assignee?.name ?? "—" }),
      col<Row>({ key: "dueDate", header: t("tasks.dueDate"), cell: (r) => r.dueDate ? localeDate(r.dueDate, locale) : "—" }),
      col<Row>({ key: "createdBy", header: t("common.createdBy"), cell: (r) => r.createdBy?.name ?? "—" }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader title={t("tasks.title")} description={t("tasks.subtitle")} actions={can("tasks.create") ? <Button onClick={() => setCreateOpen(true)}>+ {t("tasks.new")}</Button> : null} />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={
          <FilterSelect label={t("common.status")} value={filters.status ?? "ALL"} options={[{ value: "TODO", label: t("status.TODO") }, { value: "IN_PROGRESS", label: t("status.IN_PROGRESS") }, { value: "WAITING", label: t("status.WAITING") }, { value: "COMPLETED", label: t("status.COMPLETED") }]} onChange={(v) => setFilter("status", v === "ALL" ? null : v)} />
        }
      />
      <DataTable
        storageKey="tasks"
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
        exportName="tasks"
        rowActions={(row: Row) => (
          <div className="flex gap-1">
            {row.status !== "COMPLETED" && <Button size="xs" variant="outline" onClick={() => toggleStatus.mutate({ id: row.id, action: "complete" })}>{t("common.complete")}</Button>}
            {row.status === "COMPLETED" && <Button size="xs" variant="ghost" onClick={() => toggleStatus.mutate({ id: row.id, action: "reopen" })}>{t("common.reopen")}</Button>}
          </div>
        )}
      />
      <TaskCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function TasksPage() {
  return <Suspense><TasksPageInner /></Suspense>;
}

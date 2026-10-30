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
import { Field, Input } from "@/components/ui/form";

type Row = { id: string; code: string; name: string; department: string | null; capacityPerDay: number; hourlyCost: number; status: string; managerName: string | null; moCount: number };

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: "", name: "", department: "", capacityPerDay: "0", hourlyCost: "0" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => apiPost("/api/production/work-centers", { ...form, capacityPerDay: Number(form.capacityPerDay), hourlyCost: Number(form.hourlyCost), department: form.department || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workcenters"] }); onClose(); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog open={open} onClose={onClose} title={t("workcenters.new")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={() => create.mutate()}>{t("common.save")}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("workcenters.code")} required error={errors.code}><Input value={form.code} onChange={set("code")} placeholder="WC-01" /></Field>
        <Field label={t("common.name")} required error={errors.name}><Input value={form.name} onChange={set("name")} /></Field>
        <Field label={t("workcenters.department")}><Input value={form.department} onChange={set("department")} /></Field>
        <Field label={t("workcenters.capacityPerDay")}><Input type="number" value={form.capacityPerDay} onChange={set("capacityPerDay")} /></Field>
        <Field label={t("workcenters.hourlyCost")}><Input type="number" value={form.hourlyCost} onChange={set("hourlyCost")} /></Field>
      </div>
    </Dialog>
  );
}

function WorkCentersPageInner() {
  const t = useI18n().t;
  const can = usePermission();
  const { page, pageSize, q, onPageChange, onSearch } = useListQuery({ pageSize: 25 });
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workcenters", { page, pageSize, q }],
    queryFn: () => apiList<Row>("/api/production/work-centers", { page, pageSize, q }),
  });
  const columns = useMemo(
    () => [
      col<Row>({ key: "code", header: t("workcenters.code"), cell: (r) => <span className="font-mono text-2xs">{r.code}</span> }),
      col<Row>({ key: "name", header: t("common.name"), cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-2xs text-muted-foreground">{r.department ?? "—"}</p></div> }),
      col<Row>({ key: "capacityPerDay", header: t("workcenters.capacityPerDay"), align: "right", cell: (r) => `${r.capacityPerDay}` }),
      col<Row>({ key: "hourlyCost", header: t("workcenters.hourlyCost"), align: "right", cell: (r) => `${r.hourlyCost} €` }),
      col<Row>({ key: "moCount", header: t("workcenters.workload"), align: "right", cell: (r) => <Badge tone="neutral">{r.moCount}</Badge> }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
    ],
    [t]
  );
  return (
    <div>
      <PageHeader title={t("workcenters.title")} description={t("workcenters.subtitle")} actions={can("workcenters.manage") ? <Button onClick={() => setOpen(true)}>+ {t("workcenters.new")}</Button> : null} />
      <div className="mb-3 flex items-center gap-2"><SearchInput value={q} onChange={onSearch} placeholder={t("common.searchPlaceholder")} className="w-64" /></div>
      <DataTable storageKey="workcenters" columns={columns} data={data?.items ?? []} total={data?.total} page={page} pageSize={pageSize} onPageChange={onPageChange} isLoading={isLoading} error={error ? (error as Error).message : null} onRetry={refetch} emptyTitle={t("common.noResults")} />
      <CreateDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export default function WorkCentersPage() {
  return <Suspense><WorkCentersPageInner /></Suspense>;
}

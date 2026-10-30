"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, ApiClientError } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { PageHeader, Card } from "@/components/ui/patterns";
import { DataTable, col, SearchInput } from "@/components/ui/data-table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Checkbox } from "@/components/ui/form";

type Row = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  country: string;
  status: string;
  isDefault: boolean;
  managerName: string | null;
  inventoryCount: number;
  locationCount: number;
  updatedAt: string;
};

function WarehouseCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({
    code: "",
    name: "",
    street: "",
    postalCode: "",
    city: "",
    country: "DE",
    isDefault: "false",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/warehouses", {
        code: form.code,
        name: form.name,
        street: form.street || null,
        postalCode: form.postalCode || null,
        city: form.city || null,
        country: form.country,
        isDefault: form.isDefault === "true",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      onClose();
      setErrors({});
    },
    onError: (e) => {
      if (e instanceof ApiClientError) setErrors(e.fieldErrors);
    },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("warehouses.new")}
      description={t("warehouses.subtitle")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? t("common.saving") : t("common.save")}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("warehouses.code")} required error={errors.code} hint="npr. WH-01">
          <Input value={form.code} onChange={set("code")} placeholder="WH-01" />
        </Field>
        <Field label={t("common.name")} required error={errors.name}>
          <Input value={form.name} onChange={set("name")} placeholder="Centralno skladište" />
        </Field>
        <Field label={t("common.street")} error={errors.street} className="sm:col-span-2">
          <Input value={form.street} onChange={set("street")} />
        </Field>
        <Field label={t("common.postalCode")} error={errors.postalCode}>
          <Input value={form.postalCode} onChange={set("postalCode")} />
        </Field>
        <Field label={t("common.city")} error={errors.city}>
          <Input value={form.city} onChange={set("city")} />
        </Field>
        <Field label={t("common.country")}>
          <Select value={form.country} onChange={set("country")}>
            <option value="DE">DE</option><option value="RS">RS</option><option value="AT">AT</option><option value="CH">CH</option><option value="FR">FR</option><option value="US">US</option>
          </Select>
        </Field>
        <Field label={t("warehouses.isDefault")}>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isDefault === "true"} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked ? "true" : "false" }))} />{t("warehouses.isDefault")}</label>
        </Field>
      </div>
    </Dialog>
  );
}

function WarehousesPageInner() {
  const t = useI18n().t;
  const router = useRouter();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch } = useListQuery({ pageSize: 25 });
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["warehouses", { page, pageSize, sorting, q }],
    queryFn: () => apiList<Row>("/api/warehouses", { page, pageSize, sorting, q }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "code", header: t("warehouses.code"), sortable: true, cell: (r) => <span className="font-mono text-xs font-semibold">{r.code}</span> }),
      col<Row>({ key: "name", header: t("common.name"), cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-2xs text-muted-foreground">{r.city ?? "—"} ({r.country})</p></div> }),
      col<Row>({ key: "managerName", header: t("warehouses.manager"), cell: (r) => r.managerName ?? "—" }),
      col<Row>({ key: "locationCount", header: t("warehouses.locations"), align: "right", cell: (r) => <Badge tone="neutral">{r.locationCount}</Badge> }),
      col<Row>({ key: "inventoryCount", header: t("warehouses.stock"), align: "right", cell: (r) => <span className="tabular-nums">{r.inventoryCount}</span> }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
      col<Row>({ key: "isDefault", header: t("warehouses.isDefault"), cell: (r) => r.isDefault ? <Badge tone="success">★ {t("common.yes")}</Badge> : "—" }),
    ],
    [t]
  );

  return (
    <div>
      <PageHeader
        title={t("warehouses.title")}
        description={t("warehouses.subtitle")}
        actions={
          can("warehouses.manage") ? <Button onClick={() => setCreateOpen(true)}>+ {t("warehouses.new")}</Button> : null
        }
      />
      <div className="mb-3 flex items-center gap-2">
        <SearchInput value={q} onChange={onSearch} placeholder={t("common.searchPlaceholder")} className="w-64" />
        <span className="text-xs text-muted-foreground">{data?.total ?? 0} {t("common.rows")}</span>
      </div>
      <DataTable
        storageKey="warehouses"
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
        onRowClick={(r) => router.push(`/warehouses/${r.id}`)}
        emptyTitle={t("common.noResults")}
        exportName="warehouses"
        csvHeaders={["Kod", "Naziv", "Grad", "Menadžer", "Lokacije", "Status"]}
        csvRows={(rows) => rows.map((r: Row) => [r.code, r.name, r.city ?? "", r.managerName ?? "", r.locationCount, r.status])}
      />
      <WarehouseCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function WarehousesPage() {
  return <Suspense><WarehousesPageInner /></Suspense>;
}

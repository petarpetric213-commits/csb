"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, ApiClientError } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect, useStatusOptions } from "@/components/shared/filters";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Star } from "lucide-react";

type Row = {
  id: string; supplierNumber: string; companyName: string; contactPerson: string | null;
  email: string | null; city: string | null; country: string; category: string | null;
  rating: number | null; paymentTermDays: number; status: string; poCount: number; productCount: number;
};

function SupplierCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({
    companyName: "", contactPerson: "", email: "", phone: "", street: "", postalCode: "",
    city: "", country: "DE", category: "", paymentTermDays: "30", taxNumber: "", iban: "", notes: "", status: "ACTIVE",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () => apiPost("/api/suppliers", { ...form, paymentTermDays: Number(form.paymentTermDays) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); onClose(); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog
      open={open} onClose={onClose} title={t("suppliers.new")} description={t("suppliers.subtitle")} size="lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? t("common.saving") : t("common.save")}</Button>
      </>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("suppliers.companyName")} required error={errors.companyName} className="sm:col-span-2">
          <Input value={form.companyName} onChange={set("companyName")} />
        </Field>
        <Field label={t("suppliers.contactPerson")}>
          <Input value={form.contactPerson} onChange={set("contactPerson")} />
        </Field>
        <Field label={t("common.email")} error={errors.email}>
          <Input type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label={t("common.phone")}>
          <Input value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label={t("suppliers.category")} hint="z.B. Fleisch, Verpackung …">
          <Input value={form.category} onChange={set("category")} />
        </Field>
        <Field label={t("suppliers.street")}>
          <Input value={form.street} onChange={set("street")} />
        </Field>
        <div className="grid grid-cols-[100px_1fr_90px] gap-2">
          <Field label={t("suppliers.zip")}><Input value={form.postalCode} onChange={set("postalCode")} /></Field>
          <Field label={t("suppliers.city")}><Input value={form.city} onChange={set("city")} /></Field>
          <Field label={t("suppliers.country")}>
            <Select value={form.country} onChange={set("country")}>
              <option value="DE">DE</option><option value="AT">AT</option><option value="CH">CH</option><option value="RS">RS</option>
            </Select>
          </Field>
        </div>
        <Field label={t("suppliers.paymentTermDays")}>
          <Input type="number" min={0} max={180} value={form.paymentTermDays} onChange={set("paymentTermDays")} />
        </Field>
        <Field label={t("suppliers.taxNumber")}>
          <Input value={form.taxNumber} onChange={set("taxNumber")} />
        </Field>
        <Field label={t("suppliers.iban")}>
          <Input value={form.iban} onChange={set("iban")} />
        </Field>
        <Field label={t("common.notes")} className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={set("notes")} />
        </Field>
      </div>
    </Dialog>
  );
}

function SuppliersPageInner() {
  const t = useI18n().t;
  const router = useRouter();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();
  const statusOpts = useStatusOptions();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["suppliers", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/suppliers", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "supplierNumber", header: t("suppliers.number"), cell: (r) => <span className="font-mono text-2xs">{r.supplierNumber}</span> }),
      col<Row>({ key: "companyName", header: t("common.name"), cell: (r) => (
        <div>
          <p className="font-medium">{r.companyName}</p>
          <p className="text-2xs text-muted-foreground">{r.category ?? "—"}</p>
        </div>
      ) }),
      col<Row>({ key: "city", header: t("suppliers.city"), cell: (r) => `${r.city ?? "—"} (${r.country})` }),
      col<Row>({ key: "rating", header: t("suppliers.rating"), align: "right", cell: (r) => r.rating ? (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Star size={12} className="text-warning" /> {r.rating.toFixed(1)}
        </span>
      ) : "—" }),
      col<Row>({ key: "poCount", header: t("purchasing.poCount"), align: "right" }),
      col<Row>({ key: "paymentTermDays", header: t("suppliers.paymentTermDays"), align: "right", cell: (r) => `${r.paymentTermDays} ${t("common.days")}` }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
    ],
    [t]
  );

  return (
    <div>
      <PageHeader
        title={t("suppliers.title")}
        description={t("suppliers.subtitle")}
        actions={can("suppliers.create") && <Button onClick={() => setCreateOpen(true)}>+ {t("suppliers.new")}</Button>}
      />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={
          <FilterSelect label={t("common.status")} value={filters.status ?? "ALL"} options={statusOpts.customer}
            onChange={(v) => setFilter("status", v === "ALL" ? null : v)} />
        }
      />
      <DataTable
        storageKey="suppliers"
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
        onRowClick={(r) => router.push(`/suppliers/${r.id}`)}
        emptyTitle={t("common.noResults")}
        exportName="suppliers"
        csvHeaders={["Nr", "Name", "Stadt", "Kategorie", "Bewertung", "Status"]}
        csvRows={(rows) => rows.map((r) => [r.supplierNumber, r.companyName, r.city, r.category, r.rating ?? "", r.status])}
      />
      <SupplierCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function SuppliersPage() {
  return <Suspense><SuppliersPageInner /></Suspense>;
}

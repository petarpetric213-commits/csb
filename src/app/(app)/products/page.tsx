"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiGet, apiPost, ApiClientError } from "@/lib/client/api";
import { useListQuery, useCreateParam } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Money } from "@/components/ui/states";

type Row = {
  id: string; sku: string; name: string; category: string | null; supplier: string | null;
  productType: string; unit: string; purchasePrice: number; salesPrice: number; taxRate: number;
  reorderPoint: number; status: string; isBatchTracked: boolean; isExpiryTracked: boolean;
  physical: number; reserved: number; available: number; low: boolean;
};

function ProductCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({
    sku: "", name: "", shortDescription: "", categoryId: "", productType: "FINISHED_GOOD", unit: "pcs",
    purchasePrice: "0", salesPrice: "0", taxRate: "7", minStock: "0", maxStock: "0", reorderPoint: "0",
    shelfLifeDays: "", supplierId: "", status: "ACTIVE",
  });
  const [flags, setFlags] = useState({ isStockTracked: true, isBatchTracked: false, isExpiryTracked: false });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ id: string; name: string }[]>("/api/categories?flat=1"),
    enabled: open,
  });
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", "flat"],
    queryFn: () => apiList("/api/suppliers", { pageSize: 100 }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/products", {
        ...form,
        minStock: Number(form.minStock), maxStock: Number(form.maxStock),
        reorderPoint: Number(form.reorderPoint), purchasePrice: Number(form.purchasePrice),
        salesPrice: Number(form.salesPrice), taxRate: Number(form.taxRate),
        shelfLifeDays: form.shelfLifeDays ? Number(form.shelfLifeDays) : undefined,
        categoryId: form.categoryId || null, supplierId: form.supplierId || null,
        ...flags,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiClientError) setErrors(e.fieldErrors);
    },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog
      open={open} onClose={onClose} title={t("products.new")} description={t("products.subtitle")} size="lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? t("common.saving") : t("common.save")}</Button>
      </>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("products.sku")} required error={errors.sku} hint="z.B. FG-1234">
          <Input value={form.sku} onChange={set("sku")} />
        </Field>
        <Field label={t("products.name")} required error={errors.name}>
          <Input value={form.name} onChange={set("name")} />
        </Field>
        <Field label={t("products.type")}>
          <Select value={form.productType} onChange={set("productType")}>
            <option value="FINISHED_GOOD">{t("products.typeFinished")}</option>
            <option value="RAW_MATERIAL">{t("products.typeRaw")}</option>
            <option value="SEMIFINISHED">{t("products.typeSemi")}</option>
            <option value="SERVICE">{t("products.typeService")}</option>
          </Select>
        </Field>
        <Field label={t("products.unit")}>
          <Select value={form.unit} onChange={set("unit")}>
            {["pcs", "kg", "g", "l", "box", "pallet", "m"].map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label={t("products.category")}>
          <Select value={form.categoryId} onChange={set("categoryId")}>
            <option value="">—</option>
            {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t("suppliers.title")}>
          <Select value={form.supplierId} onChange={set("supplierId")}>
            <option value="">—</option>
            {(suppliers?.items ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
          </Select>
        </Field>
        <Field label={t("products.purchasePrice")} required error={errors.purchasePrice}>
          <Input type="number" min={0} step="0.01" value={form.purchasePrice} onChange={set("purchasePrice")} />
        </Field>
        <Field label={t("products.salesPrice")} required error={errors.salesPrice}>
          <Input type="number" min={0} step="0.01" value={form.salesPrice} onChange={set("salesPrice")} />
        </Field>
        <Field label={t("common.vat")} error={errors.taxRate}>
          <Select value={form.taxRate} onChange={set("taxRate")}>
            <option value="7">7 %</option><option value="10">10 %</option><option value="19">19 %</option>
            <option value="20">20 %</option><option value="0">0 %</option>
          </Select>
        </Field>
        <Field label={t("products.shelfLifeDays")}>
          <Input type="number" min={0} value={form.shelfLifeDays} onChange={set("shelfLifeDays")} />
        </Field>
        <Field label={t("products.minStock")}>
          <Input type="number" min={0} value={form.minStock} onChange={set("minStock")} />
        </Field>
        <Field label={t("products.reorderPoint")}>
          <Input type="number" min={0} value={form.reorderPoint} onChange={set("reorderPoint")} />
        </Field>
        <Field label={t("products.maxStock")}>
          <Input type="number" min={0} value={form.maxStock} onChange={set("maxStock")} />
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={flags.isStockTracked} onChange={(e) => setFlags((f) => ({ ...f, isStockTracked: e.target.checked }))} />
            {t("products.stockTracked")}
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={flags.isBatchTracked} onChange={(e) => setFlags((f) => ({ ...f, isBatchTracked: e.target.checked }))} />
            {t("products.batchTracked")}
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={flags.isExpiryTracked} onChange={(e) => setFlags((f) => ({ ...f, isExpiryTracked: e.target.checked }))} />
            {t("products.expiryTracked")}
          </label>
        </div>
        <Field label={t("common.notes")} className="sm:col-span-2">
          <Textarea rows={2} value={form.shortDescription} onChange={set("shortDescription")} />
        </Field>
      </div>
    </Dialog>
  );
}

function ProductsPageInner() {
  const t = useI18n().t;
  const router = useRouter();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const { isNew, clearCreateParam } = useCreateParam();
  React.useEffect(() => {
    if (isNew && can("products.create")) {
      setCreateOpen(true);
      clearCreateParam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ id: string; name: string }[]>("/api/categories?flat=1"),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["products", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/products", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "sku", header: t("products.sku"), sortable: true, cell: (r) => <span className="font-mono text-2xs">{r.sku}</span> }),
      col<Row>({ key: "name", header: t("common.name"), cell: (r) => (
        <div>
          <p className="font-medium">{r.name}</p>
          <p className="text-2xs text-muted-foreground">{r.category ?? "—"}</p>
        </div>
      ) }),
      col<Row>({ key: "productType", header: t("products.type"), cell: (r) => (
        <Badge tone={r.productType === "FINISHED_GOOD" ? "success" : r.productType === "RAW_MATERIAL" ? "info" : "neutral"}>
          {t(`products.type_${r.productType}`)}
        </Badge>
      ) }),
      col<Row>({ key: "available", header: t("products.available"), align: "right", cell: (r) => (
        <span className={r.low ? "font-semibold text-warning" : "tabular-nums"}>
          {r.available.toLocaleString("de-DE")} {r.unit}
        </span>
      ) }),
      col<Row>({ key: "reorderPoint", header: t("products.reorderPoint"), align: "right", cell: (r) => <span className="tabular-nums text-muted-foreground">{r.reorderPoint}</span> }),
      col<Row>({ key: "purchasePrice", header: t("products.purchasePrice"), align: "right", cell: (r) => <Money amount={r.purchasePrice} /> }),
      col<Row>({ key: "salesPrice", header: t("products.salesPrice"), align: "right", cell: (r) => <Money amount={r.salesPrice} /> }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
    ],
    [t]
  );

  return (
    <div>
      <PageHeader
        title={t("products.title")}
        description={t("products.subtitle")}
        actions={can("products.create") && <Button onClick={() => setCreateOpen(true)}>+ {t("products.new")}</Button>}
      />
      <ListFilters
        q={q}
        onSearch={onSearch}
        selects={
          <>
            <FilterSelect label={t("products.type")} value={filters.productType ?? "ALL"}
              options={[
                { value: "FINISHED_GOOD", label: t("products.typeFinished") },
                { value: "RAW_MATERIAL", label: t("products.typeRaw") },
                { value: "SEMIFINISHED", label: t("products.typeSemi") },
                { value: "SERVICE", label: t("products.typeService") },
              ]}
              onChange={(v) => setFilter("productType", v === "ALL" ? null : v)} />
            <FilterSelect label={t("products.category")} value={filters.categoryId ?? "ALL"}
              options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
              onChange={(v) => setFilter("categoryId", v === "ALL" ? null : v)} />
          </>
        }
      />
      <DataTable
        storageKey="products"
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
        onRowClick={(r) => router.push(`/products/${r.id}`)}
        emptyTitle={t("common.noResults")}
        exportName="products"
        csvHeaders={["SKU", "Name", "Typ", "Verfügbar", "Meldebestand", "EK", "VK", "Status"]}
        csvRows={(rows) => rows.map((r) => [r.sku, r.name, r.productType, r.available, r.reorderPoint, r.purchasePrice, r.salesPrice, r.status])}
      />
      <ProductCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function ProductsPage() {
  return <Suspense><ProductsPageInner /></Suspense>;
}

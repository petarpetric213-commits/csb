"use client";

import React, { useState, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n, useToast } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, ApiClientError } from "@/lib/client/api";
import { PageHeader, Card } from "@/components/ui/patterns";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { LoadingState } from "@/components/ui/states";
import { ArrowLeftRight } from "lucide-react";

/** Warehouse-to-warehouse transfer: posts a TRANSFER_OUT + TRANSFER_IN pair. */
function TransfersPageInner() {
  const t = useI18n().t;
  const { toast } = useToast();
  const can = usePermission();
  const qc = useQueryClient();
  const [form, setForm] = useState({ productId: "", fromWarehouseId: "", toWarehouseId: "", quantity: "", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: products } = useQuery({
    queryKey: ["products", "stock"],
    queryFn: () => apiList("/api/products", { pageSize: 200, sorting: "sku:asc" }),
  });
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "flat"],
    queryFn: () => apiList("/api/warehouses", { flat: "1" }),
  });

  const transfer = useMutation({
    mutationFn: () => apiPost("/api/inventory/transfer", { ...form, quantity: Number(form.quantity) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      toast("success", t("transfers.posted"));
      setForm((f) => ({ ...f, quantity: "", reason: "" }));
    },
    onError: (e) => {
      if (e instanceof ApiClientError) setErrors(e.fieldErrors);
      toast("error", e instanceof ApiClientError ? e.message : t("common.error"));
    },
  });

  if (!products) return <LoadingState rows={4} />;

  return (
    <div>
      <PageHeader title={t("transfers.title")} description={t("transfers.subtitle")} />
      <Card title={t("transfers.new")}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErrors({});
            transfer.mutate();
          }}
        >
          <Field label={t("products.title")} required error={errors.productId} className="sm:col-span-2">
            <Select required value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}>
              <option value="">—</option>
              {(products?.items ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
            </Select>
          </Field>
          <Field label={t("transfers.from")} required error={errors.fromWarehouseId}>
            <Select required value={form.fromWarehouseId} onChange={(e) => setForm((f) => ({ ...f, fromWarehouseId: e.target.value }))}>
              <option value="">—</option>
              {(warehouses?.items ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </Select>
          </Field>
          <Field label={t("transfers.to")} required error={errors.toWarehouseId}>
            <Select required value={form.toWarehouseId} onChange={(e) => setForm((f) => ({ ...f, toWarehouseId: e.target.value }))}>
              <option value="">—</option>
              {(warehouses?.items ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </Select>
          </Field>
          <Field label={t("common.quantity")} required error={errors.quantity}>
            <Input required type="number" min={0.001} step="any" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          </Field>
          <Field label={t("adjustments.reason")} hint="optional">
            <Textarea rows={1} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={transfer.isPending || !can("inventory.transfer")}>
              <ArrowLeftRight size={14} /> {transfer.isPending ? t("common.saving") : t("transfers.post")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function TransfersPage() {
  return <Suspense><TransfersPageInner /></Suspense>;
}

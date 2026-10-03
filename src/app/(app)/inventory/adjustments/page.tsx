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

/** Stock correction: post an ADJUSTMENT / STOCKTAKE movement. */
function AdjustmentsPageInner() {
  const t = useI18n().t;
  const { toast } = useToast();
  const can = usePermission();
  const qc = useQueryClient();
  const [form, setForm] = useState({ productId: "", warehouseId: "", quantity: "", reason: "", type: "ADJUSTMENT", batchNumber: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: products } = useQuery({
    queryKey: ["products", "stock"],
    queryFn: () => apiList("/api/products", { pageSize: 200, sorting: "sku:asc" }),
  });
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "flat"],
    queryFn: () => apiList("/api/warehouses", { flat: "1" }),
  });

  const adjust = useMutation({
    mutationFn: () => apiPost("/api/inventory/adjust", { ...form, quantity: Number(form.quantity) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("success", t("adjustments.posted"));
      setForm((f) => ({ ...f, quantity: "", reason: "", batchNumber: "" }));
    },
    onError: (e) => {
      if (e instanceof ApiClientError) setErrors(e.fieldErrors);
      toast("error", e instanceof ApiClientError ? e.message : t("common.error"));
    },
  });

  if (!products) return <LoadingState rows={4} />;

  return (
    <div>
      <PageHeader title={t("adjustments.title")} description={t("adjustments.subtitle")} />
      <Card title={t("adjustments.new")}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErrors({});
            adjust.mutate();
          }}
        >
          <Field label={t("products.title")} required error={errors.productId}>
            <Select required value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}>
              <option value="">—</option>
              {(products?.items ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
            </Select>
          </Field>
          <Field label={t("warehouses.title")} required error={errors.warehouseId}>
            <Select required value={form.warehouseId} onChange={(e) => setForm((f) => ({ ...f, warehouseId: e.target.value }))}>
              <option value="">—</option>
              {(warehouses?.items ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </Select>
          </Field>
          <Field label={t("adjustments.quantity")} required error={errors.quantity} hint={t("adjustments.quantityHint")}>
            <Input required type="number" step="any" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="z.B. -12 oder 40" />
          </Field>
          <Field label={t("adjustments.type")}>
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="ADJUSTMENT">{t("adjustments.type_ADJUSTMENT")}</option>
              <option value="STOCKTAKE">{t("adjustments.type_STOCKTAKE")}</option>
              <option value="OPENING_STOCK">{t("adjustments.type_OPENING_STOCK")}</option>
            </Select>
          </Field>
          <Field label={t("quality.batch")} hint="optional">
            <Input value={form.batchNumber} onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))} />
          </Field>
          <Field label={t("adjustments.reason")} required error={errors.reason} className="sm:col-span-2">
            <Textarea required rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder={t("adjustments.reasonPlaceholder")} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={adjust.isPending || !can("inventory.adjust")}>
              {adjust.isPending ? t("common.saving") : t("adjustments.post")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function AdjustmentsPage() {
  return <Suspense><AdjustmentsPageInner /></Suspense>;
}

"use client";

import React, { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiGet, apiPatch, apiDelete, ApiClientError } from "@/lib/client/api";
import { useConfirm } from "@/components/providers";
import { PageHeader, EntityHeader, DescriptionList, Card } from "@/components/ui/patterns";
import { LoadingState, ErrorState, Money } from "@/components/ui/states";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { localeDate } from "@/lib/i18n";

type Detail = {
  id: string; sku: string; name: string; shortDescription: string | null; productType: string; unit: string;
  purchasePrice: number; salesPrice: number; taxRate: number; minStock: number; maxStock: number;
  reorderPoint: number; shelfLifeDays: number | null; status: string; weightKg: number | null;
  isStockTracked: boolean; isBatchTracked: boolean; isExpiryTracked: boolean;
  category: { id: string; name: string } | null;
  supplier: { id: string; companyName: string } | null;
  variants: { id: string; name: string; skuSuffix: string | null }[];
  priceHistory: { id: string; price: number; validFrom: string }[];
  inventoryItems: { id: string; physicalQty: number; reservedQty: number; quarantinedQty: number; warehouse: { code: string; name: string }; location: { code: string } | null }[];
  boms: { id: string; name: string; status: string; version: number }[];
  bomComponents: { id: string; bom: { id: string; name: string; product: { sku: string; name: string } } }[];
  movements: { id: string; movementNumber: string; type: string; quantity: number; createdAt: string; referenceNumber: string | null; warehouse: { code: string } }[];
  soldQuantity: number;
};

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const can = usePermission();
  const { confirm } = useConfirm();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["product", id],
    queryFn: () => apiGet<Detail>(`/api/products/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      router.push("/products");
    },
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data) return <ErrorState title={t("error.notFound")} retry={refetch} />;

  const totalPhysical = data.inventoryItems.reduce((s, i) => s + i.physicalQty, 0);
  const totalReserved = data.inventoryItems.reduce((s, i) => s + i.reservedQty, 0);
  const totalQuarantined = data.inventoryItems.reduce((s, i) => s + i.quarantinedQty, 0);

  return (
    <div>
      <PageHeader
        title={data.name}
        breadcrumbs={[{ label: t("nav.products"), href: "/products" }, { label: data.sku }]}
      />
      <EntityHeader
        number={data.sku}
        title={data.name}
        status={<StatusBadge status={data.status} />}
        meta={
          <>
            <span>{data.category?.name ?? "—"}</span>
            <span>{t("products.unit")}: {data.unit}</span>
            <span>{t("common.vat")}: {data.taxRate}%</span>
            {data.isBatchTracked && <Badge tone="info">{t("products.batchTracked")}</Badge>}
            {data.isExpiryTracked && <Badge tone="warning">{t("products.expiryTracked")}</Badge>}
          </>
        }
        actions={
          <>
            {can("products.update") && <Button variant="outline" onClick={() => setEditOpen(true)}>{t("common.edit")}</Button>}
            {can("products.delete") && (
              <Button
                variant="destructive"
                onClick={async () => {
                  if (await confirm({ title: t("common.delete"), message: t("products.deleteConfirm", { name: data.name }), danger: true, confirmLabel: t("common.delete") })) {
                    remove.mutate();
                  }
                }}
              >
                {t("common.delete")}
              </Button>
            )}
          </>
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: t("common.overview") },
          { key: "stock", label: t("nav.stock"), count: data.inventoryItems.length },
          { key: "movements", label: t("nav.movements"), count: data.movements.length },
          { key: "bom", label: t("nav.boms"), count: data.boms.length + data.bomComponents.length },
          { key: "prices", label: t("products.priceHistory"), count: data.priceHistory.length },
        ]}
      />

      <div className="mt-4">
        <TabPanel active={tab} tabKey="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={t("products.masterData")} className="lg:col-span-2">
              <DescriptionList
                items={[
                  { label: t("products.type"), value: t(`products.type_${data.productType}`) },
                  { label: t("products.category"), value: data.category?.name ?? "—" },
                  { label: t("suppliers.title"), value: data.supplier?.companyName ?? "—" },
                  { label: t("products.purchasePrice"), value: <Money amount={data.purchasePrice} /> },
                  { label: t("products.salesPrice"), value: <Money amount={data.salesPrice} /> },
                  { label: t("common.vat"), value: `${data.taxRate} %` },
                  { label: t("products.minStock"), value: `${data.minStock} ${data.unit}` },
                  { label: t("products.reorderPoint"), value: `${data.reorderPoint} ${data.unit}` },
                  { label: t("products.maxStock"), value: `${data.maxStock} ${data.unit}` },
                  { label: t("products.shelfLifeDays"), value: data.shelfLifeDays ? `${data.shelfLifeDays} ${t("common.days")}` : "—" },
                  { label: t("products.weightKg"), value: data.weightKg ? `${data.weightKg} kg` : "—" },
                  { label: t("products.soldQty"), value: `${Math.round(data.soldQuantity)} ${data.unit}` },
                ]}
              />
            </Card>
            <Card title={t("products.stockSummary")}>
              <div className="space-y-3">
                <div>
                  <p className="text-2xs uppercase text-muted-foreground">{t("products.physical")}</p>
                  <p className="text-lg font-semibold tabular-nums">{totalPhysical.toLocaleString("de-DE")} {data.unit}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase text-muted-foreground">{t("products.reserved")}</p>
                  <p className="text-lg font-semibold tabular-nums">{totalReserved.toLocaleString("de-DE")} {data.unit}</p>
                </div>
                {totalQuarantined > 0 && (
                  <div>
                    <p className="text-2xs uppercase text-muted-foreground">{t("products.quarantined")}</p>
                    <p className="text-lg font-semibold tabular-nums text-warning">{totalQuarantined.toLocaleString("de-DE")} {data.unit}</p>
                  </div>
                )}
                <div className="border-t pt-2">
                  <p className="text-2xs uppercase text-muted-foreground">{t("products.available")}</p>
                  <p className={`text-lg font-semibold tabular-nums ${totalPhysical - totalReserved <= data.reorderPoint ? "text-warning" : ""}`}>
                    {(totalPhysical - totalReserved).toLocaleString("de-DE")} {data.unit}
                  </p>
                </div>
              </div>
            </Card>
            {data.shortDescription && (
              <Card title={t("common.description")} className="lg:col-span-3">
                <p className="whitespace-pre-wrap text-[13px] text-muted-foreground">{data.shortDescription}</p>
              </Card>
            )}
          </div>
        </TabPanel>

        <TabPanel active={tab} tabKey="stock">
          <Card noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 text-left">{t("warehouses.title")}</th>
                  <th className="px-4 py-2 text-left">{t("warehouses.location")}</th>
                  <th className="px-4 py-2 text-right">{t("products.physical")}</th>
                  <th className="px-4 py-2 text-right">{t("products.reserved")}</th>
                  <th className="px-4 py-2 text-right">{t("products.quarantined")}</th>
                </tr>
              </thead>
              <tbody>
                {data.inventoryItems.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("products.noStock")}</td></tr>
                )}
                {data.inventoryItems.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{i.warehouse.code} — {i.warehouse.name}</td>
                    <td className="px-4 py-2 font-mono text-2xs">{i.location?.code ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.physicalQty.toLocaleString("de-DE")}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.reservedQty.toLocaleString("de-DE")}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.quarantinedQty.toLocaleString("de-DE")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabPanel>

        <TabPanel active={tab} tabKey="movements">
          <Card noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 text-left">{t("common.date")}</th>
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">{t("movements.type")}</th>
                  <th className="px-4 py-2 text-left">{t("common.reference")}</th>
                  <th className="px-4 py-2 text-left">WH</th>
                  <th className="px-4 py-2 text-right">{t("common.quantity")}</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noResults")}</td></tr>
                )}
                {data.movements.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{localeDate(m.createdAt, locale)}</td>
                    <td className="px-4 py-2 font-mono text-2xs">{m.movementNumber}</td>
                    <td className="px-4 py-2">{t(`movements.type_${m.type}`)}</td>
                    <td className="px-4 py-2">{m.referenceNumber ?? "—"}</td>
                    <td className="px-4 py-2">{m.warehouse.code}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${m.quantity > 0 ? "text-success" : "text-danger"}`}>
                      {m.quantity > 0 ? "+" : ""}{m.quantity.toLocaleString("de-DE")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabPanel>

        <TabPanel active={tab} tabKey="bom">
          <div className="space-y-4">
            {data.boms.length > 0 && (
              <Card title={t("boms.asFinishedProduct")}>
                {data.boms.map((b) => (
                  <div key={b.id} className="flex items-center justify-between border-b py-2 last:border-0">
                    <div>
                      <Link href={`/production/boms`} className="font-medium text-primary hover:underline">{b.name}</Link>
                      <p className="text-2xs text-muted-foreground">v{b.version}</p>
                    </div>
                    <StatusBadge status={b.status === "ACTIVE" ? "ACTIVE" : b.status === "DRAFT" ? "DRAFT" : "INACTIVE"} />
                  </div>
                ))}
              </Card>
            )}
            {data.bomComponents.length > 0 && (
              <Card title={t("boms.asComponent")}>
                {data.bomComponents.map((c) => (
                  <div key={c.id} className="flex items-center justify-between border-b py-2 last:border-0">
                    <div>
                      <p className="font-medium">{c.bom.product.name} ({c.bom.product.sku})</p>
                      <p className="text-2xs text-muted-foreground">{c.bom.name}</p>
                    </div>
                    <Button variant="link" size="sm" onClick={() => router.push("/production/boms")}>{t("common.open")}</Button>
                  </div>
                ))}
              </Card>
            )}
            {data.boms.length === 0 && data.bomComponents.length === 0 && (
              <Card><p className="py-4 text-center text-xs text-muted-foreground">{t("common.noResults")}</p></Card>
            )}
          </div>
        </TabPanel>

        <TabPanel active={tab} tabKey="prices">
          <Card noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 text-left">{t("products.validFrom")}</th>
                  <th className="px-4 py-2 text-right">{t("products.salesPrice")}</th>
                </tr>
              </thead>
              <tbody>
                {data.priceHistory.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{localeDate(p.validFrom, locale)}</td>
                    <td className="px-4 py-2 text-right tabular-nums"><Money amount={p.price} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabPanel>
      </div>

      <EditProductDialog open={editOpen} onClose={() => setEditOpen(false)} product={data} onSaved={() => refetch()} />
    </div>
  );
}

function EditProductDialog({ open, onClose, product, onSaved }: { open: boolean; onClose: () => void; product: Detail; onSaved: () => void }) {
  const t = useI18n().t;
  const [form, setForm] = useState({
    name: product.name,
    purchasePrice: String(product.purchasePrice),
    salesPrice: String(product.salesPrice),
    taxRate: String(product.taxRate),
    minStock: String(product.minStock),
    reorderPoint: String(product.reorderPoint),
    maxStock: String(product.maxStock),
    status: product.status,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () =>
      apiPatch(`/api/products/${product.id}`, {
        ...form,
        purchasePrice: Number(form.purchasePrice),
        salesPrice: Number(form.salesPrice),
        taxRate: Number(form.taxRate),
        minStock: Number(form.minStock),
        reorderPoint: Number(form.reorderPoint),
        maxStock: Number(form.maxStock),
      }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog
      open={open} onClose={onClose} title={t("products.edit")} size="lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? t("common.saving") : t("common.save")}</Button>
      </>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("products.name")} error={errors.name} className="sm:col-span-2">
          <Input value={form.name} onChange={set("name")} />
        </Field>
        <Field label={t("products.purchasePrice")} error={errors.purchasePrice}>
          <Input type="number" min={0} step="0.01" value={form.purchasePrice} onChange={set("purchasePrice")} />
        </Field>
        <Field label={t("products.salesPrice")} error={errors.salesPrice} hint={form.salesPrice !== String(product.salesPrice) ? t("products.priceChangeHint") : undefined}>
          <Input type="number" min={0} step="0.01" value={form.salesPrice} onChange={set("salesPrice")} />
        </Field>
        <Field label={t("common.vat")}>
          <Select value={form.taxRate} onChange={set("taxRate")}>
            <option value="7">7 %</option><option value="10">10 %</option><option value="19">19 %</option><option value="20">20 %</option><option value="0">0 %</option>
          </Select>
        </Field>
        <Field label={t("common.status")}>
          <Select value={form.status} onChange={set("status")}>
            <option value="ACTIVE">{t("status.ACTIVE")}</option>
            <option value="DRAFT">{t("status.DRAFT")}</option>
            <option value="DISCONTINUED">{t("status.DISCONTINUED")}</option>
          </Select>
        </Field>
        <Field label={t("products.minStock")}>
          <Input type="number" min={0} value={form.minStock} onChange={set("minStock")} />
        </Field>
        <Field label={t("products.reorderPoint")}>
          <Input type="number" min={0} value={form.reorderPoint} onChange={set("reorderPoint")} />
        </Field>
        <Field label={t("products.maxStock")} className="sm:col-span-2">
          <Input type="number" min={0} value={form.maxStock} onChange={set("maxStock")} />
        </Field>
      </div>
    </Dialog>
  );
}

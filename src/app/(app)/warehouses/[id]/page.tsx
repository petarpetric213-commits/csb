"use client";

import React, { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiGet, apiPatch, apiPost, apiPut, ApiClientError } from "@/lib/client/api";
import { PageHeader, EntityHeader, DescriptionList, Card } from "@/components/ui/patterns";
import { LoadingState, ErrorState, Money } from "@/components/ui/states";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Checkbox } from "@/components/ui/form";
import { localeDate } from "@/lib/i18n";

type Detail = {
  id: string;
  code: string;
  name: string;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  status: string;
  isDefault: boolean;
  manager: { id: string; firstName: string; lastName: string } | null;
  locations: { id: string; code: string; zone: string | null; aisle: string | null; description: string | null }[];
  inventory: { id: string; physicalQty: number; reservedQty: number; quarantinedQty: number; product: { sku: string; name: string; unit: string; purchasePrice: number } }[];
  stockValue: number;
};

export default function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const can = usePermission();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["warehouse", id],
    queryFn: () => apiGet<Detail>(`/api/warehouses/${id}`),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data) return <ErrorState title={t("error.notFound")} retry={refetch} />;

  return (
    <div>
      <PageHeader title={data.name} breadcrumbs={[{ label: t("nav.warehouses"), href: "/warehouses" }, { label: data.code }]} />
      <EntityHeader
        number={data.code}
        title={data.name}
        status={<StatusBadge status={data.status} />}
        meta={<><span>{data.city ?? "—"} ({data.country})</span>{data.manager && <span>{t("warehouses.manager")}: {data.manager.firstName} {data.manager.lastName}</span>}{data.isDefault && <Badge tone="success">★ {t("warehouses.isDefault")}</Badge>}<span>{t("warehouses.stock")}: <Money amount={data.stockValue} /></span></>}
        actions={can("warehouses.manage") ? <Button variant="outline" onClick={() => setEditOpen(true)}>{t("common.edit")}</Button> : null}
      />

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: "overview", label: t("common.overview") },
        { key: "locations", label: t("warehouses.locations"), count: data.locations.length },
        { key: "stock", label: t("warehouses.stock"), count: data.inventory.length },
      ]} />

      <div className="mt-4">
        <TabPanel active={tab} tabKey="overview">
          <Card title={t("common.details")}>
            <DescriptionList items={[
              { label: t("warehouses.code"), value: data.code },
              { label: t("common.name"), value: data.name },
              { label: t("common.street"), value: data.street ?? "—" },
              { label: t("common.postalCode"), value: data.postalCode ?? "—" },
              { label: t("common.city"), value: data.city ?? "—" },
              { label: t("common.country"), value: data.country },
              { label: t("common.status"), value: <StatusBadge status={data.status} /> },
              { label: t("warehouses.isDefault"), value: data.isDefault ? t("common.yes") : t("common.no") },
              { label: t("warehouses.locations"), value: `${data.locations.length}` },
              { label: t("warehouses.stock"), value: <Money amount={data.stockValue} /> },
            ]} />
          </Card>
        </TabPanel>
        <TabPanel active={tab} tabKey="locations">
          <Card title={t("warehouses.locations")} actions={can("warehouses.manage") ? <Button size="sm" onClick={() => setLocOpen(true)}>+ {t("common.add")}</Button> : undefined} noPadding>
            <table className="w-full text-[13px]">
              <thead><tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground"><th className="px-4 py-2 text-left">{t("warehouses.code")}</th><th className="px-4 py-2 text-left">{t("warehouses.zone")}</th><th className="px-4 py-2 text-left">{t("warehouses.aisle")}</th><th className="px-4 py-2 text-left">{t("common.description")}</th></tr></thead>
              <tbody>
                {data.locations.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noData")}</td></tr>}
                {data.locations.map((l) => <tr key={l.id} className="border-b last:border-0"><td className="px-4 py-2 font-mono text-2xs">{l.code}</td><td className="px-4 py-2">{l.zone ?? "—"}</td><td className="px-4 py-2">{l.aisle ?? "—"}</td><td className="px-4 py-2 text-muted-foreground">{l.description ?? "—"}</td></tr>)}
              </tbody>
            </table>
          </Card>
        </TabPanel>
        <TabPanel active={tab} tabKey="stock">
          <Card title={t("warehouses.stock")} noPadding>
            <table className="w-full text-[13px]">
              <thead><tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground"><th className="px-4 py-2 text-left">{t("products.sku")}</th><th className="px-4 py-2 text-left">{t("common.name")}</th><th className="px-4 py-2 text-right">{t("products.physical")}</th><th className="px-4 py-2 text-right">{t("products.reserved")}</th><th className="px-4 py-2 text-right">{t("products.quarantined")}</th><th className="px-4 py-2 text-right">{t("common.value")}</th></tr></thead>
              <tbody>
                {data.inventory.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noData")}</td></tr>}
                {data.inventory.map((i) => <tr key={i.id} className="border-b last:border-0"><td className="px-4 py-2 font-mono text-2xs">{i.product.sku}</td><td className="px-4 py-2">{i.product.name}<span className="text-2xs text-muted-foreground"> — {i.product.unit}</span></td><td className="px-4 py-2 text-right tabular-nums">{i.physicalQty.toLocaleString("de-DE")}</td><td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{i.reservedQty.toLocaleString("de-DE")}</td><td className="px-4 py-2 text-right tabular-nums">{i.quarantinedQty.toLocaleString("de-DE")}</td><td className="px-4 py-2 text-right tabular-nums"><Money amount={i.physicalQty * i.product.purchasePrice} /></td></tr>)}
              </tbody>
            </table>
            {data.inventory.length > 0 && <div className="border-t bg-muted/30 px-4 py-2 text-right text-xs"><strong>{t("common.total")}: <Money amount={data.stockValue} /></strong></div>}
          </Card>
        </TabPanel>
      </div>

      <EditDialog open={editOpen} onClose={() => setEditOpen(false)} warehouse={data} onSaved={() => { qc.invalidateQueries({ queryKey: ["warehouse", id]}); refetch(); }} />
      <LocationDialog open={locOpen} onClose={() => setLocOpen(false)} warehouseId={id} onCreated={() => refetch()} />
    </div>
  );
}

function EditDialog({ open, onClose, warehouse, onSaved }: { open: boolean; onClose: () => void; warehouse: Detail; onSaved: () => void }) {
  const t = useI18n().t;
  const [form, setForm] = useState({ name: warehouse.name, street: warehouse.street ?? "", city: warehouse.city ?? "", postalCode: warehouse.postalCode ?? "", country: warehouse.country, status: warehouse.status, isDefault: warehouse.isDefault });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => apiPatch(`/api/warehouses/${warehouse.id}`, { ...form, street: form.street || null, city: form.city || null, postalCode: form.postalCode || null }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog open={open} onClose={onClose} title={t("common.edit")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? t("common.saving") : t("common.save")}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("common.name")} required error={errors.name} className="sm:col-span-2"><Input value={form.name} onChange={set("name")} /></Field>
        <Field label={t("common.street")} className="sm:col-span-2"><Input value={form.street} onChange={set("street")} /></Field>
        <Field label={t("common.postalCode")}><Input value={form.postalCode} onChange={set("postalCode")} /></Field>
        <Field label={t("common.city")}><Input value={form.city} onChange={set("city")} /></Field>
        <Field label={t("common.country")}><Select value={form.country} onChange={set("country")}><option value="DE">DE</option><option value="RS">RS</option><option value="AT">AT</option><option value="CH">CH</option></Select></Field>
        <Field label={t("common.status")}><Select value={form.status} onChange={set("status")}><option value="ACTIVE">{t("status.ACTIVE")}</option><option value="INACTIVE">{t("status.INACTIVE")}</option></Select></Field>
        <Field label={t("warehouses.isDefault")}><label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} />{t("warehouses.isDefault")}</label></Field>
      </div>
    </Dialog>
  );
}

function LocationDialog({ open, onClose, warehouseId, onCreated }: { open: boolean; onClose: () => void; warehouseId: string; onCreated: () => void }) {
  const t = useI18n().t;
  const [form, setForm] = useState({ code: "", zone: "", aisle: "", description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => apiPut(`/api/warehouses/${warehouseId}`, form),
    onSuccess: () => { onCreated(); onClose(); setForm({ code: "", zone: "", aisle: "", description: "" }); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog open={open} onClose={onClose} title={t("warehouses.locations")} description={t("warehouses.subtitle")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={() => create.mutate()} disabled={create.isPending}>{t("common.save")}</Button></>}>
      <div className="grid gap-3">
        <Field label={t("warehouses.code")} required error={errors.code}><Input value={form.code} onChange={set("code")} placeholder="A-03-05-B12" /></Field>
        <Field label={t("warehouses.zone")}><Input value={form.zone} onChange={set("zone")} /></Field>
        <Field label={t("warehouses.aisle")}><Input value={form.aisle} onChange={set("aisle")} /></Field>
        <Field label={t("common.description")}><Input value={form.description} onChange={set("description")} /></Field>
      </div>
    </Dialog>
  );
}

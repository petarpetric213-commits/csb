"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiGet, apiPatch, apiPost, ApiClientError } from "@/lib/client/api";
import { PageHeader, Card, DescriptionList } from "@/components/ui/patterns";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { localeDate } from "@/lib/i18n";

type SettingsData = {
  company: {
    id: string; legalName: string; tradingName: string | null; taxNumber: string | null; registrationNumber: string | null;
    street: string | null; city: string | null; postalCode: string | null; country: string; phone: string | null; email: string | null; website: string | null;
    currency: string; locale: string; timezone: string; fiscalYearStartMonth: number;
  };
  settings: Record<string, string>;
  members: { id: string; userId: string; name: string; email: string; isActive: boolean; lastLoginAt: string | null; roleId: string; roleName: string; isDefault: boolean }[];
  roles: { id: string; key: string; name: string; description: string | null; isSystem: boolean; userCount: number; permissions: string[] }[];
};

export default function SettingsPage() {
  const { t, locale } = useI18n();
  const can = usePermission();
  const qc = useQueryClient();
  const [tab, setTab] = useState("company");
  const [editOpen, setEditOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsData>("/api/settings"),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data) return <ErrorState title={t("common.error")} retry={refetch} />;

  return (
    <div>
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: "company", label: t("settings.company") },
        { key: "users", label: t("settings.users"), count: data.members.length },
        { key: "roles", label: t("settings.roles"), count: data.roles.length },
      ]} />

      <div className="mt-4">
        <TabPanel active={tab} tabKey="company">
          <Card title={t("settings.company")} actions={can("settings.update") ? <Button variant="outline" onClick={() => setEditOpen(true)}>{t("common.edit")}</Button> : undefined}>
            <DescriptionList items={[
              { label: t("settings.legalName"), value: data.company.legalName },
              { label: t("settings.tradingName"), value: data.company.tradingName ?? "—" },
              { label: t("settings.taxNumber"), value: data.company.taxNumber ?? "—" },
              { label: t("common.street"), value: data.company.street ?? "—" },
              { label: t("common.city"), value: data.company.city ? `${data.company.city} ${data.company.postalCode ?? ""} (${data.company.country})` : "—" },
              { label: t("common.phone"), value: data.company.phone ?? "—" },
              { label: t("common.email"), value: data.company.email ?? "—" },
              { label: t("settings.currency"), value: data.company.currency },
              { label: t("settings.locale"), value: data.company.locale },
              { label: t("settings.timezone"), value: data.company.timezone },
            ]} />
          </Card>
          {editOpen && <CompanyEditDialog company={data.company} onClose={() => setEditOpen(false)} onSaved={() => refetch()} />}
        </TabPanel>

        <TabPanel active={tab} tabKey="users">
          <Card title={t("settings.usersInvite")} actions={can("settings.update") ? <Button size="sm" onClick={() => setUserOpen(true)}>+ {t("settings.newUser")}</Button> : undefined} noPadding>
            <table className="w-full text-[13px]">
              <thead><tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground"><th className="px-4 py-2 text-left">{t("common.name")}</th><th className="px-4 py-2 text-left">{t("common.email")}</th><th className="px-4 py-2 text-left">{t("settings.role")}</th><th className="px-4 py-2 text-left">{t("common.createdAt")}</th><th className="px-4 py-2 text-left">{t("common.status")}</th></tr></thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{m.name}{m.isDefault ? <Badge tone="info" className="ml-2">default</Badge> : null}</td>
                    <td className="px-4 py-2">{m.email}</td>
                    <td className="px-4 py-2"><Badge tone="neutral">{m.roleName}</Badge></td>
                    <td className="px-4 py-2 text-2xs text-muted-foreground">{m.lastLoginAt ? localeDate(m.lastLoginAt, locale) : t("common.never")}</td>
                    <td className="px-4 py-2">{m.isActive ? <Badge tone="success">{t("status.ACTIVE")}</Badge> : <Badge tone="danger">{t("status.INACTIVE")}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {userOpen && <UserCreateDialog onClose={() => setUserOpen(false)} onSaved={() => refetch()} />}
        </TabPanel>

        <TabPanel active={tab} tabKey="roles">
          <div className="grid gap-3 md:grid-cols-2">
            {data.roles.map((r) => (
              <Card key={r.id} title={r.name} actions={<Badge tone={r.isSystem ? "neutral" : "info"}>{r.userCount} {t("common.users")}</Badge>}>
                <p className="text-xs text-muted-foreground mb-2">{r.description ?? "—"}</p>
                <p className="text-2xs font-semibold uppercase tracking-wide mb-1">{t("settings.permissions")} ({r.permissions.length})</p>
                <div className="flex flex-wrap gap-1">
                  {r.permissions.slice(0, 20).map((p) => <span key={p} className="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs">{p}</span>)}
                  {r.permissions.length > 20 && <span className="text-2xs text-muted-foreground">+{r.permissions.length - 20} {t("common.more")}</span>}
                </div>
              </Card>
            ))}
          </div>
        </TabPanel>
      </div>
    </div>
  );
}

function CompanyEditDialog({ company, onClose, onSaved }: { company: SettingsData["company"]; onClose: () => void; onSaved: () => void }) {
  const t = useI18n().t;
  const [form, setForm] = useState({
    legalName: company.legalName, tradingName: company.tradingName ?? "", taxNumber: company.taxNumber ?? "", street: company.street ?? "", city: company.city ?? "", postalCode: company.postalCode ?? "", country: company.country, phone: company.phone ?? "", email: company.email ?? "", currency: company.currency, locale: company.locale,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => apiPatch("/api/settings", { ...form, tradingName: form.tradingName || null, taxNumber: form.taxNumber || null, street: form.street || null, city: form.city || null, postalCode: form.postalCode || null, phone: form.phone || null, email: form.email || null }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog open onClose={onClose} title={t("settings.company")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={() => save.mutate()}>{t("common.save")}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("settings.legalName")} required error={errors.legalName} className="sm:col-span-2"><Input value={form.legalName} onChange={set("legalName")} /></Field>
        <Field label={t("settings.tradingName")}><Input value={form.tradingName} onChange={set("tradingName")} /></Field>
        <Field label={t("settings.taxNumber")}><Input value={form.taxNumber} onChange={set("taxNumber")} /></Field>
        <Field label={t("common.street")} className="sm:col-span-2"><Input value={form.street} onChange={set("street")} /></Field>
        <Field label={t("common.postalCode")}><Input value={form.postalCode} onChange={set("postalCode")} /></Field>
        <Field label={t("common.city")}><Input value={form.city} onChange={set("city")} /></Field>
        <Field label={t("common.country")}><Select value={form.country} onChange={set("country")}><option value="DE">DE</option><option value="RS">RS</option><option value="AT">AT</option><option value="CH">CH</option></Select></Field>
        <Field label={t("settings.currency")}><Select value={form.currency} onChange={set("currency")}><option value="EUR">EUR</option><option value="RSD">RSD</option><option value="USD">USD</option><option value="CHF">CHF</option></Select></Field>
        <Field label={t("common.email")}><Input value={form.email} onChange={set("email")} /></Field>
        <Field label={t("common.phone")}><Input value={form.phone} onChange={set("phone")} /></Field>
      </div>
    </Dialog>
  );
}

function UserCreateDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useI18n().t;
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<SettingsData>("/api/settings") });
  const [form, setForm] = useState({ name: "", email: "", password: "", roleId: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => apiPost("/api/settings/users", form),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog open onClose={onClose} title={t("settings.newUser")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={() => create.mutate()}>{t("common.create")}</Button></>}>
      <div className="grid gap-3">
        <Field label={t("common.name")} required error={errors.name}><Input value={form.name} onChange={set("name")} /></Field>
        <Field label={t("common.email")} required error={errors.email}><Input value={form.email} onChange={set("email")} /></Field>
        <Field label={t("auth.password")} required error={errors.password}><Input type="password" value={form.password} onChange={set("password")} /></Field>
        <Field label={t("settings.role")} required error={errors.roleId}>
          <Select value={form.roleId} onChange={set("roleId")}>
            <option value="">—</option>
            {settings?.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

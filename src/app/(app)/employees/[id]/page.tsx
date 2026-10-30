"use client";

import React, { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiGet, apiPatch, ApiClientError } from "@/lib/client/api";
import { PageHeader, EntityHeader, DescriptionList, Card } from "@/components/ui/patterns";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { localeDate } from "@/lib/i18n";

type Detail = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  employmentStatus: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  manager: { id: string; firstName: string; lastName: string } | null;
  reports: { id: string; firstName: string; lastName: string; position: string | null }[];
  managerId: string | null;
  userLinks: { user: { id: string; email: string; lastLoginAt: string | null }; role: { name: string } }[];
};

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const can = usePermission();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => apiGet<Detail>(`/api/employees/${id}`),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data) return <ErrorState title={t("error.notFound")} retry={refetch} />;

  return (
    <div>
      <PageHeader
        title={`${data.firstName} ${data.lastName}`}
        breadcrumbs={[{ label: t("nav.employees"), href: "/employees" }, { label: data.employeeNumber }]}
      />
      <EntityHeader
        number={data.employeeNumber}
        title={`${data.firstName} ${data.lastName}`}
        status={<StatusBadge status={data.employmentStatus} />}
        meta={
          <>
            <span>{data.department ?? "—"}</span>
            <span>{data.position ?? "—"}</span>
            {data.manager && <span>{t("employees.manager")}: {data.manager.firstName} {data.manager.lastName}</span>}
            {data.userLinks.length > 0 && <Badge tone="success">{data.userLinks[0].user.email} ({data.userLinks[0].role.name})</Badge>}
          </>
        }
        actions={
          can("employees.manage") ? <Button variant="outline" onClick={() => setEditOpen(true)}>{t("common.edit")}</Button> : null
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: t("common.overview") },
          { key: "reports", label: t("employees.reports"), count: data.reports.length },
        ]}
      />

      <div className="mt-4">
        <TabPanel active={tab} tabKey="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={t("common.details")} className="lg:col-span-2">
              <DescriptionList
                items={[
                  { label: t("employees.number"), value: data.employeeNumber },
                  { label: t("employees.firstName"), value: data.firstName },
                  { label: t("employees.lastName"), value: data.lastName },
                  { label: t("common.email"), value: data.email ?? "—" },
                  { label: t("common.phone"), value: data.phone ?? "—" },
                  { label: t("employees.department"), value: data.department ?? "—" },
                  { label: t("employees.position"), value: data.position ?? "—" },
                  { label: t("employees.employmentStatus"), value: <StatusBadge status={data.employmentStatus} /> },
                  { label: t("employees.startDate"), value: data.startDate ? localeDate(data.startDate, locale) : "—" },
                  { label: t("employees.endDate"), value: data.endDate ? localeDate(data.endDate, locale) : "—" },
                  { label: t("common.notes"), value: data.notes ?? "—" },
                  { label: t("employees.manager"), value: data.manager ? `${data.manager.firstName} ${data.manager.lastName}` : "—" },
                ]}
              />
            </Card>
            <Card title={t("user.profile")}>
              {data.userLinks.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">{t("employees.noLogin")}</p>
              ) : (
                <div className="space-y-2">
                  {data.userLinks.map((l, i) => (
                    <div key={i} className="rounded border p-3">
                      <p className="text-sm font-medium">{l.user.email}</p>
                      <p className="text-2xs text-muted-foreground">{l.role.name}</p>
                      <p className="text-2xs text-muted-foreground">{l.user.lastLoginAt ? localeDate(l.user.lastLoginAt, locale) : t("common.never")}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </TabPanel>
        <TabPanel active={tab} tabKey="reports">
          <Card title={t("employees.reports")} noPadding>
            <table className="w-full text-[13px]">
              <thead><tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground"><th className="px-4 py-2 text-left">{t("common.name")}</th><th className="px-4 py-2 text-left">{t("employees.position")}</th></tr></thead>
              <tbody>
                {data.reports.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noData")}</td></tr>}
                {data.reports.map((r) => <tr key={r.id} className="border-b last:border-0"><td className="px-4 py-2">{r.firstName} {r.lastName}</td><td className="px-4 py-2 text-muted-foreground">{r.position ?? "—"}</td></tr>)}
              </tbody>
            </table>
          </Card>
        </TabPanel>
      </div>

      <EditDialog open={editOpen} onClose={() => setEditOpen(false)} employee={data} onSaved={() => refetch()} />
    </div>
  );
}

function EditDialog({ open, onClose, employee, onSaved }: { open: boolean; onClose: () => void; employee: Detail; onSaved: () => void }) {
  const t = useI18n().t;
  const [form, setForm] = useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    department: employee.department ?? "",
    position: employee.position ?? "",
    employmentStatus: employee.employmentStatus,
    notes: employee.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => apiPatch(`/api/employees/${employee.id}`, { ...form, email: form.email || null, phone: form.phone || null, department: form.department || null, position: form.position || null, notes: form.notes || null }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => { if (e instanceof ApiClientError) setErrors(e.fieldErrors); },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onClose={onClose} title={t("common.edit")} size="lg"
      footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? t("common.saving") : t("common.save")}</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("employees.firstName")} required error={errors.firstName}><Input value={form.firstName} onChange={set("firstName")} /></Field>
        <Field label={t("employees.lastName")} required error={errors.lastName}><Input value={form.lastName} onChange={set("lastName")} /></Field>
        <Field label={t("common.email")} error={errors.email}><Input value={form.email} onChange={set("email")} /></Field>
        <Field label={t("common.phone")}><Input value={form.phone} onChange={set("phone")} /></Field>
        <Field label={t("employees.department")}><Input value={form.department} onChange={set("department")} /></Field>
        <Field label={t("employees.position")}><Input value={form.position} onChange={set("position")} /></Field>
        <Field label={t("employees.employmentStatus")}>
          <Select value={form.employmentStatus} onChange={set("employmentStatus")}>
            <option value="ACTIVE">{t("status.ACTIVE")}</option>
            <option value="PROBATION">{t("status.PROBATION")}</option>
            <option value="ON_LEAVE">{t("status.ON_LEAVE")}</option>
            <option value="TERMINATED">{t("status.TERMINATED")}</option>
          </Select>
        </Field>
        <Field label={t("common.notes")} className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field>
      </div>
    </Dialog>
  );
}

"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiPost, ApiClientError } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";

type Row = {
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
  manager: string | null;
  hasLogin: boolean;
  loginEmail: string | null;
};

function EmployeeCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    department: "",
    position: "",
    employmentStatus: "ACTIVE",
    startDate: new Date().toISOString().slice(0, 10),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () => apiPost("/api/employees", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      onClose();
      setForm({ firstName: "", lastName: "", email: "", phone: "", department: "", position: "", employmentStatus: "ACTIVE", startDate: new Date().toISOString().slice(0, 10) });
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
      title={t("employees.new")}
      description={t("employees.subtitle")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? t("common.saving") : t("common.save")}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("employees.firstName")} required error={errors.firstName}>
          <Input value={form.firstName} onChange={set("firstName")} placeholder="Petar" />
        </Field>
        <Field label={t("employees.lastName")} required error={errors.lastName}>
          <Input value={form.lastName} onChange={set("lastName")} placeholder="Petrović" />
        </Field>
        <Field label={t("common.email")} error={errors.email}>
          <Input type="email" value={form.email} onChange={set("email")} placeholder="petar@nexora.demo" />
        </Field>
        <Field label={t("common.phone")} error={errors.phone}>
          <Input value={form.phone} onChange={set("phone")} placeholder="+381 60 123 4567" />
        </Field>
        <Field label={t("employees.department")} error={errors.department}>
          <Select value={form.department} onChange={set("department")}>
            <option value="">—</option>
            <option value="Production">Production</option>
            <option value="Sales">Sales</option>
            <option value="Purchasing">Purchasing</option>
            <option value="Warehouse">Warehouse</option>
            <option value="Quality">Quality</option>
            <option value="Finance">Finance</option>
            <option value="Management">Management</option>
          </Select>
        </Field>
        <Field label={t("employees.position")} error={errors.position}>
          <Input value={form.position} onChange={set("position")} placeholder="Operator" />
        </Field>
        <Field label={t("employees.employmentStatus")}>
          <Select value={form.employmentStatus} onChange={set("employmentStatus")}>
            <option value="ACTIVE">{t("status.ACTIVE")}</option>
            <option value="PROBATION">{t("status.PROBATION")}</option>
            <option value="ON_LEAVE">{t("status.ON_LEAVE")}</option>
            <option value="TERMINATED">{t("status.TERMINATED")}</option>
          </Select>
        </Field>
        <Field label={t("employees.startDate")}>
          <Input type="date" value={form.startDate} onChange={set("startDate")} />
        </Field>
      </div>
    </Dialog>
  );
}

function EmployeesPageInner() {
  const t = useI18n().t;
  const router = useRouter();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();

  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["employees", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/employees", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "employeeNumber", header: t("employees.number"), cell: (r) => <span className="font-mono text-2xs">{r.employeeNumber}</span> }),
      col<Row>({
        key: "name", header: t("common.name"), cell: (r) => (
          <div>
            <p className="font-medium">{r.firstName} {r.lastName}</p>
            <p className="text-2xs text-muted-foreground">{r.email ?? "—"}</p>
          </div>
        )
      }),
      col<Row>({ key: "department", header: t("employees.department"), cell: (r) => r.department ? <Badge tone="info">{r.department}</Badge> : "—" }),
      col<Row>({ key: "position", header: t("employees.position"), cell: (r) => r.position ?? "—" }),
      col<Row>({ key: "manager", header: t("employees.manager"), cell: (r) => r.manager ?? "—" }),
      col<Row>({ key: "hasLogin", header: t("settings.users"), cell: (r) => r.hasLogin ? <Badge tone="success">Login: {r.loginEmail}</Badge> : <span className="text-2xs text-muted-foreground">—</span> }),
      col<Row>({ key: "employmentStatus", header: t("employees.employmentStatus"), cell: (r) => <StatusBadge status={r.employmentStatus} /> }),
    ],
    [t]
  );

  return (
    <div>
      <PageHeader
        title={t("employees.title")}
        description={t("employees.subtitle")}
        actions={
          can("employees.manage") && (
            <Button onClick={() => setCreateOpen(true)}>+ {t("employees.new")}</Button>
          )
        }
      />
      <ListFilters
        q={q}
        onSearch={onSearch}
        selects={
          <>
            <FilterSelect
              label={t("employees.department")}
              value={filters.department ?? "ALL"}
              options={[
                { value: "Production", label: "Production" },
                { value: "Sales", label: "Sales" },
                { value: "Purchasing", label: "Purchasing" },
                { value: "Warehouse", label: "Warehouse" },
                { value: "Quality", label: "Quality" },
                { value: "Finance", label: "Finance" },
              ]}
              onChange={(v) => setFilter("department", v === "ALL" ? null : v)}
            />
            <FilterSelect
              label={t("common.status")}
              value={filters.status ?? "ALL"}
              options={[
                { value: "ACTIVE", label: t("status.ACTIVE") },
                { value: "PROBATION", label: t("status.PROBATION") },
                { value: "ON_LEAVE", label: t("status.ON_LEAVE") },
                { value: "TERMINATED", label: t("status.TERMINATED") },
              ]}
              onChange={(v) => setFilter("status", v === "ALL" ? null : v)}
            />
          </>
        }
      />
      <DataTable
        storageKey="employees"
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
        onRowClick={(r) => router.push(`/employees/${r.id}`)}
        emptyTitle={t("common.noResults")}
        exportName="employees"
        csvHeaders={["Broj", "Ime", "Prezime", "Email", "Sektor", "Pozicija", "Status"]}
        csvRows={(rows) => rows.map((r: Row) => [r.employeeNumber, r.firstName, r.lastName, r.email ?? "", r.department ?? "", r.position ?? "", r.employmentStatus])}
      />
      <EmployeeCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function EmployeesPage() {
  return <Suspense><EmployeesPageInner /></Suspense>;
}

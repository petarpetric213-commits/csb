"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, apiGet, apiPost, ApiClientError } from "@/lib/client/api";
import { useListQuery, useCreateParam } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect, useStatusOptions } from "@/components/shared/filters";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Money } from "@/components/ui/states";

type Row = {
  id: string; customerNumber: string; companyName: string; type: string;
  email: string | null; billingCity: string | null; billingCountry: string;
  paymentTermDays: number; creditLimit: number; status: string; group: string | null; orderCount: number;
};

function CustomerCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({
    type: "COMPANY", companyName: "", firstName: "", lastName: "", email: "",
    phone: "", billingStreet: "", billingPostalCode: "", billingCity: "", billingCountry: "DE",
    paymentTermDays: "30", creditLimit: "0", status: "ACTIVE", notes: "", groupId: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: groups } = useQuery({
    queryKey: ["customer-groups"],
    queryFn: () => apiGet<{ id: string; name: string }[]>("/api/customers/groups"),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => apiPost("/api/customers", { ...form, groupId: form["groupId"] ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiClientError) setFieldErrors(e.fieldErrors);
    },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("customers.new")}
      description={t("customers.subtitle")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("customers.type")} required>
          <Select value={form.type} onChange={set("type")}>
            <option value="COMPANY">{t("customers.typeCompany")}</option>
            <option value="PERSON">{t("customers.typePerson")}</option>
          </Select>
        </Field>
        <Field label={t("customers.group")}>
          <Select value={form["groupId"] ?? ""} onChange={set("groupId")}>
            <option value="">—</option>
            {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        {form.type === "COMPANY" ? (
          <Field label={t("customers.companyName")} required error={fieldErrors.companyName} className="sm:col-span-2">
            <Input value={form.companyName} onChange={set("companyName")} placeholder="Muster Lebensmittel GmbH" />
          </Field>
        ) : (
          <>
            <Field label={t("common.firstName")} required error={fieldErrors.firstName}>
              <Input value={form.firstName} onChange={set("firstName")} />
            </Field>
            <Field label={t("common.lastName")} required error={fieldErrors.lastName}>
              <Input value={form.lastName} onChange={set("lastName")} />
            </Field>
          </>
        )}
        <Field label={t("common.email")} error={fieldErrors.email}>
          <Input type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label={t("common.phone")} error={fieldErrors.phone}>
          <Input value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label={t("customers.street")} error={fieldErrors.billingStreet}>
          <Input value={form.billingStreet} onChange={set("billingStreet")} />
        </Field>
        <div className="grid grid-cols-[100px_1fr_90px] gap-2">
          <Field label={t("customers.zip")} error={fieldErrors.billingPostalCode}>
            <Input value={form.billingPostalCode} onChange={set("billingPostalCode")} />
          </Field>
          <Field label={t("customers.city")} error={fieldErrors.billingCity}>
            <Input value={form.billingCity} onChange={set("billingCity")} />
          </Field>
          <Field label={t("customers.country")}>
            <Select value={form.billingCountry} onChange={set("billingCountry")}>
              <option value="DE">DE</option><option value="AT">AT</option><option value="CH">CH</option>
              <option value="RS">RS</option><option value="NL">NL</option><option value="FR">FR</option>
            </Select>
          </Field>
        </div>
        <Field label={t("customers.paymentTermDays")} error={fieldErrors.paymentTermDays}>
          <Input type="number" min={0} max={180} value={form.paymentTermDays} onChange={set("paymentTermDays")} />
        </Field>
        <Field label={t("customers.creditLimit")} error={fieldErrors.creditLimit}>
          <Input type="number" min={0} step="0.01" value={form.creditLimit} onChange={set("creditLimit")} />
        </Field>
        <Field label={t("common.status")}>
          <Select value={form.status} onChange={set("status")}>
            <option value="ACTIVE">{t("status.ACTIVE")}</option>
            <option value="PROSPECT">{t("status.PROSPECT")}</option>
            <option value="INACTIVE">{t("status.INACTIVE")}</option>
            <option value="BLOCKED">{t("status.BLOCKED")}</option>
          </Select>
        </Field>
        <Field label={t("common.notes")} className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={set("notes")} />
        </Field>
      </div>
    </Dialog>
  );
}

function CustomersPageInner() {
  const t = useI18n().t;
  const router = useRouter();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();
  const statusOpts = useStatusOptions();
  const [createOpen, setCreateOpen] = useState(false);
  const { isNew, clearCreateParam } = useCreateParam();
  React.useEffect(() => {
    if (isNew && can("customers.create")) {
      setCreateOpen(true);
      clearCreateParam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["customers", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/customers", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "customerNumber", header: t("customers.number"), sortable: true, cell: (r) => <span className="font-mono text-2xs">{r.customerNumber}</span> }),
      col<Row>({ key: "companyName", header: t("common.name"), sortable: true, cell: (r) => (
        <div>
          <p className="font-medium">{r.companyName}</p>
          <p className="text-2xs text-muted-foreground">{r.email ?? "—"}</p>
        </div>
      ) }),
      col<Row>({ key: "billingCity", header: t("customers.city"), cell: (r) => `${r.billingCity ?? "—"} (${r.billingCountry})` }),
      col<Row>({ key: "group", header: t("customers.group"), cell: (r) => (r.group ? <Badge tone="info">{r.group}</Badge> : "—") }),
      col<Row>({ key: "paymentTermDays", header: t("customers.paymentTermDays"), align: "right", cell: (r) => `${r.paymentTermDays} ${t("common.days")}` }),
      col<Row>({ key: "creditLimit", header: t("customers.creditLimit"), align: "right", cell: (r) => <Money amount={r.creditLimit} /> }),
      col<Row>({ key: "orderCount", header: t("customers.orderCount"), align: "right" }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <StatusBadge status={r.status} /> }),
    ],
    [t]
  );


  return (
    <div>
      <PageHeader
        title={t("customers.title")}
        description={t("customers.subtitle")}
        actions={
          can("customers.create") && (
            <Button onClick={() => setCreateOpen(true)}>+ {t("customers.new")}</Button>
          )
        }
      />
      <ListFilters
        q={q}
        onSearch={onSearch}
        selects={
          <FilterSelect
            label={t("common.status")}
            value={filters.status ?? "ALL"}
            options={statusOpts.customer}
            onChange={(v) => setFilter("status", v === "ALL" ? null : v)}
          />
        }
      />
      <DataTable
        storageKey="customers"
        columns={columns}
        data={data?.items ?? []}
        total={data?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        sorting={sorting ? [{ id: sorting.split(":")[0], desc: sorting.split(":")[1] === "desc" }] : []}
        onSortingChange={onSortingChange as never}
        isLoading={isLoading}
        error={error ? String((error as Error).message) : null}
        onRetry={refetch}
        onRowClick={(r) => router.push(`/customers/${r.id}`)}
        emptyTitle={t("common.noResults")}
        exportName="customers"
        csvHeaders={["Nr", "Name", "Stadt", "Gruppe", "Ziel (Tage)", "Limit", "Status"]}
        csvRows={(rows) => rows.map((r) => [r.customerNumber, r.companyName, r.billingCity, r.group, r.paymentTermDays, r.creditLimit, r.status])}
      />
      <CustomerCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersPageInner />
    </Suspense>
  );
}

"use client";

import React, { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiGet, apiPatch, ApiClientError } from "@/lib/client/api";
import { PageHeader, EntityHeader, DescriptionList, Card } from "@/components/ui/patterns";
import { LoadingState, ErrorState, Money } from "@/components/ui/states";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { localeDate } from "@/lib/i18n";

type CustomerDetail = {
  id: string; customerNumber: string; type: string; companyName: string | null;
  firstName: string | null; lastName: string | null; email: string | null; phone: string | null;
  billingStreet: string | null; billingCity: string | null; billingPostalCode: string | null; billingCountry: string;
  shippingStreet: string | null; shippingCity: string | null; shippingPostalCode: string | null;
  paymentTermDays: number; creditLimit: number; currency: string; status: string; notes: string | null;
  group: { id: string; name: string } | null;
  contacts: { id: string; firstName: string; lastName: string; position: string | null; email: string | null; phone: string | null; isPrimary: boolean }[];
  orders: { id: string; orderNumber: string; status: string; orderDate: string; total: number; currency: string }[];
  quotes: { id: string; quoteNumber: string; status: string; issueDate: string; total: number }[];
  invoices: { id: string; invoiceNumber: string; status: string; issueDate: string; dueDate: string | null; total: number; paidAmount: number }[];
  shipments: { id: string; shipmentNumber: string; status: string; actualDate: string | null; carrier: string | null }[];
  stats: { orderCount: number; lifetimeRevenue: number; openBalance: number };
};

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const can = usePermission();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => apiGet<CustomerDetail>(`/api/customers/${id}`),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data)
    return (
      <ErrorState
        title={t("error.notFound")}
        hint={t("customers.title")}
        retry={() => {
          refetch();
          if ((error as any)?.status === 404) router.push("/customers");
        }}
      />
    );

  const name = data.companyName ?? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim();

  return (
    <div>
      <PageHeader
        title={name}
        breadcrumbs={[{ label: t("nav.customers"), href: "/customers" }, { label: data.customerNumber }]}
      />
      <EntityHeader
        number={data.customerNumber}
        title={name}
        status={<StatusBadge status={data.status} />}
        meta={
          <>
            <span>{data.email ?? "—"}</span>
            <span>{data.group?.name ?? t("customers.noGroup")}</span>
            <span>
              {t("customers.openBalance")}:{" "}
              <strong className={data.stats.openBalance > data.creditLimit ? "text-danger" : "text-foreground"}>
                <Money amount={data.stats.openBalance} currency={data.currency} />
              </strong>{" "}
              / <Money amount={data.creditLimit} currency={data.currency} /> {t("customers.creditLimit")}
            </span>
          </>
        }
        actions={
          <>
            {can("customers.update") && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                {t("common.edit")}
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
          { key: "orders", label: t("nav.orders"), count: data.orders.length },
          { key: "quotes", label: t("nav.quotes"), count: data.quotes.length },
          { key: "invoices", label: t("nav.invoices"), count: data.invoices.length },
          { key: "shipments", label: t("nav.shipments"), count: data.shipments.length },
          { key: "contacts", label: t("customers.contacts"), count: data.contacts.length },
        ]}
      />

      <div className="mt-4">
        <TabPanel active={tab} tabKey="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={t("customers.billingAddress")} className="lg:col-span-2">
              <DescriptionList
                items={[
                  { label: t("customers.companyName"), value: data.companyName ?? "—" },
                  { label: t("common.email"), value: data.email ?? "—" },
                  { label: t("common.phone"), value: data.phone ?? "—" },
                  {
                    label: t("customers.address"),
                    value: (
                      <>
                        {data.billingStreet ?? "—"}
                        <br />
                        {data.billingPostalCode ?? ""} {data.billingCity ?? ""} ({data.billingCountry})
                      </>
                    ),
                  },
                  { label: t("customers.paymentTermDays"), value: `${data.paymentTermDays} ${t("common.days")}` },
                  { label: t("customers.creditLimit"), value: <Money amount={data.creditLimit} currency={data.currency} /> },
                ]}
              />
            </Card>
            <Card title={t("customers.kpis")}>
              <div className="space-y-3">
                <div>
                  <p className="text-2xs uppercase text-muted-foreground">{t("customers.lifetimeRevenue")}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    <Money amount={data.stats.lifetimeRevenue} currency={data.currency} />
                  </p>
                </div>
                <div>
                  <p className="text-2xs uppercase text-muted-foreground">{t("customers.orderCount")}</p>
                  <p className="text-lg font-semibold tabular-nums">{data.stats.orderCount}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase text-muted-foreground">{t("customers.openBalance")}</p>
                  <p className={`text-lg font-semibold tabular-nums ${data.stats.openBalance > data.creditLimit ? "text-danger" : ""}`}>
                    <Money amount={data.stats.openBalance} currency={data.currency} />
                  </p>
                </div>
              </div>
            </Card>
            {data.notes && (
              <Card title={t("common.notes")} className="lg:col-span-3">
                <p className="whitespace-pre-wrap text-[13px] text-muted-foreground">{data.notes}</p>
              </Card>
            )}
          </div>
        </TabPanel>

        <TabPanel active={tab} tabKey="orders">
          <Card noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 text-left">{t("sales.orderNumber")}</th>
                  <th className="px-4 py-2 text-left">{t("common.date")}</th>
                  <th className="px-4 py-2 text-right">{t("common.total")}</th>
                  <th className="px-4 py-2 text-right">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noResults")}</td></tr>
                )}
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-2">
                      <Link href={`/sales/orders/${o.id}`} className="font-mono text-2xs text-primary hover:underline">{o.orderNumber}</Link>
                    </td>
                    <td className="px-4 py-2">{localeDate(o.orderDate, locale)}</td>
                    <td className="px-4 py-2 text-right tabular-nums"><Money amount={o.total} currency={o.currency} /></td>
                    <td className="px-4 py-2 text-right"><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabPanel>

        <TabPanel active={tab} tabKey="quotes">
          <Card noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 text-left">{t("sales.quoteNumber")}</th>
                  <th className="px-4 py-2 text-left">{t("common.date")}</th>
                  <th className="px-4 py-2 text-right">{t("common.total")}</th>
                  <th className="px-4 py-2 text-right">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.quotes.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noResults")}</td></tr>
                )}
                {data.quotes.map((x) => (
                  <tr key={x.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-2">
                      <Link href={`/sales/quotes/${x.id}`} className="font-mono text-2xs text-primary hover:underline">{x.quoteNumber}</Link>
                    </td>
                    <td className="px-4 py-2">{localeDate(x.issueDate, locale)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{x.total.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right"><StatusBadge status={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabPanel>

        <TabPanel active={tab} tabKey="invoices">
          <Card noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 text-left">{t("invoices.number")}</th>
                  <th className="px-4 py-2 text-left">{t("invoices.issued")}</th>
                  <th className="px-4 py-2 text-left">{t("invoices.due")}</th>
                  <th className="px-4 py-2 text-right">{t("common.total")}</th>
                  <th className="px-4 py-2 text-right">{t("invoices.paid")}</th>
                  <th className="px-4 py-2 text-right">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noResults")}</td></tr>
                )}
                {data.invoices.map((i) => (
                  <tr key={i.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-2">
                      <Link href={`/sales/invoices/${i.id}`} className="font-mono text-2xs text-primary hover:underline">{i.invoiceNumber}</Link>
                    </td>
                    <td className="px-4 py-2">{localeDate(i.issueDate, locale)}</td>
                    <td className="px-4 py-2">{i.dueDate ? localeDate(i.dueDate, locale) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.total.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.paidAmount.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right"><StatusBadge status={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabPanel>

        <TabPanel active={tab} tabKey="shipments">
          <Card noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 text-left">{t("logistics.number")}</th>
                  <th className="px-4 py-2 text-left">{t("logistics.carrier")}</th>
                  <th className="px-4 py-2 text-left">{t("logistics.date")}</th>
                  <th className="px-4 py-2 text-right">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.shipments.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noResults")}</td></tr>
                )}
                {data.shipments.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-2xs">{s.shipmentNumber}</td>
                    <td className="px-4 py-2">{s.carrier ?? "—"}</td>
                    <td className="px-4 py-2">{s.actualDate ? localeDate(s.actualDate, locale) : "—"}</td>
                    <td className="px-4 py-2 text-right"><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabPanel>

        <TabPanel active={tab} tabKey="contacts">
          <div className="grid gap-3 sm:grid-cols-2">
            {data.contacts.map((c) => (
              <Card key={c.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">
                      {c.firstName} {c.lastName}{" "}
                      {c.isPrimary && <Badge className="ml-1">{t("customers.primaryContact")}</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.position ?? "—"}</p>
                  </div>
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <p>{c.email ?? "—"}</p>
                  <p>{c.phone ?? "—"}</p>
                </div>
              </Card>
            ))}
          </div>
        </TabPanel>
      </div>

      <EditCustomerDialog open={editOpen} onClose={() => setEditOpen(false)} customer={data} onSaved={() => qc.invalidateQueries({ queryKey: ["customer", id] })} />
    </div>
  );
}

function EditCustomerDialog({
  open, onClose, customer, onSaved,
}: {
  open: boolean; onClose: () => void; customer: CustomerDetail; onSaved: () => void;
}) {
  const t = useI18n().t;
  const [form, setForm] = useState({
    companyName: customer.companyName ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    billingStreet: customer.billingStreet ?? "",
    billingPostalCode: customer.billingPostalCode ?? "",
    billingCity: customer.billingCity ?? "",
    paymentTermDays: String(customer.paymentTermDays),
    creditLimit: String(customer.creditLimit),
    status: customer.status,
    notes: customer.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => apiPatch(`/api/customers/${customer.id}`, form),
    onSuccess: () => {
      onSaved();
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
      open={open}
      onClose={onClose}
      title={t("customers.edit")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? t("common.saving") : t("common.save")}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("customers.companyName")} error={errors.companyName} className="sm:col-span-2">
          <Input value={form.companyName} onChange={set("companyName")} />
        </Field>
        <Field label={t("common.email")} error={errors.email}>
          <Input type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label={t("common.phone")}>
          <Input value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label={t("customers.street")}>
          <Input value={form.billingStreet} onChange={set("billingStreet")} />
        </Field>
        <div className="grid grid-cols-[100px_1fr] gap-2">
          <Field label={t("customers.zip")}>
            <Input value={form.billingPostalCode} onChange={set("billingPostalCode")} />
          </Field>
          <Field label={t("customers.city")}>
            <Input value={form.billingCity} onChange={set("billingCity")} />
          </Field>
        </div>
        <Field label={t("customers.paymentTermDays")}>
          <Input type="number" min={0} max={180} value={form.paymentTermDays} onChange={set("paymentTermDays")} />
        </Field>
        <Field label={t("customers.creditLimit")}>
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

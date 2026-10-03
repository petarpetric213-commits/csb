"use client";

import React, { use, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n, useConfirm, useToast } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiGet, apiPost, ApiClientError } from "@/lib/client/api";
import { PageHeader, EntityHeader, DescriptionList, Card } from "@/components/ui/patterns";
import { LoadingState, ErrorState, Money } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { localeDate } from "@/lib/i18n";
import { SALES_ORDER_ACTIONS } from "@/lib/status";

type OrderDetail = {
  id: string; orderNumber: string; status: string; orderDate: string; requestedDeliveryDate: string | null;
  deliveryDate: string | null; currency: string; subtotal: number; discountTotal: number; taxTotal: number;
  shippingCost: number; total: number; notes: string | null; confirmedAt: string | null; shippedAt: string | null;
  customer: { id: string; customerNumber: string; companyName: string | null; firstName: string | null; lastName: string | null; email: string | null; billingCity: string | null; paymentTermDays: number };
  warehouse: { id: string; code: string; name: string } | null;
  salesRep: { id: string; firstName: string; lastName: string } | null;
  items: { id: string; productId: string; quantity: number; shippedQuantity: number; unitPrice: number; discountPercent: number; taxRate: number; lineTotal: number; product: { sku: string; name: string; unit: string } }[];
  shipments: { id: string; shipmentNumber: string; status: string; carrier: string | null; actualDate: string | null; items: { quantity: number; product: { sku: string } }[] }[];
  invoices: { id: string; invoiceNumber: string; status: string; issueDate: string; dueDate: string | null; total: number; paidAmount: number }[];
  availability: { itemId: string; available: number }[];
};

export default function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const can = usePermission();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [tab, setTab] = useState("lines");
  const [shipOpen, setShipOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sales-order", id],
    queryFn: () => apiGet<OrderDetail>(`/api/sales/orders/${id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sales-order", id] });
    qc.invalidateQueries({ queryKey: ["sales-orders"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const act = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost(`/api/sales/orders/${id}`, payload),
    onSuccess: (res: any) => {
      invalidate();
      if (res?.shipmentNumber) toast("success", t("sales.shipped", { number: res.shipmentNumber }));
      else if (res?.status) toast("success", t("sales.statusNow", { status: t(`status.${res.status}`) }));
    },
    onError: (e) => toast("error", e instanceof ApiClientError ? e.message : t("common.error")),
  });

  const createInvoice = useMutation({
    mutationFn: () => apiPost(`/api/sales/orders/${id}/invoice`, {}),
    onSuccess: (res: any) => {
      invalidate();
      toast("success", t("invoices.created", { number: res.invoiceNumber }));
      router.push(`/sales/invoices`);
    },
    onError: (e) => toast("error", e instanceof ApiClientError ? e.message : t("common.error")),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data) return <ErrorState title={t("error.notFound")} retry={refetch} />;

  const availableActions = Object.entries(SALES_ORDER_ACTIONS)
    .filter(([, def]) => def.from.includes(data.status))
    .map(([action]) => action);

  const customerName = data.customer.companyName ?? `${data.customer.firstName ?? ""} ${data.customer.lastName ?? ""}`.trim();
  const canInvoice =
    ["SHIPPED", "PARTIALLY_SHIPPED", "COMPLETED"].includes(data.status) &&
    data.invoices.filter((i) => i.status !== "CANCELLED").length === 0;
  const availByItem = new Map(data.availability.map((a) => [a.itemId, a.available]));

  return (
    <div>
      <PageHeader
        title={data.orderNumber}
        breadcrumbs={[{ label: t("nav.orders"), href: "/sales/orders" }, { label: data.orderNumber }]}
      />
      <EntityHeader
        number={data.orderNumber}
        title={customerName}
        status={<StatusBadge status={data.status} />}
        meta={
          <>
            <span>{t("common.date")}: {localeDate(data.orderDate, locale)}</span>
            {data.requestedDeliveryDate && <span>{t("sales.requestedDelivery")}: {localeDate(data.requestedDeliveryDate, locale)}</span>}
            {data.warehouse && <span>{t("warehouses.title")}: {data.warehouse.code}</span>}
            <span><Money amount={data.total} currency={data.currency} /></span>
          </>
        }
        actions={
          can("sales.update") && (
            <div className="flex flex-wrap items-center gap-2">
              {availableActions.includes("approve") && (
                <Button onClick={() => act.mutate({ action: "approve" })} disabled={act.isPending}>
                  <Check size={14}/> {t("sales.approve")}
                </Button>
              )}
              {availableActions.includes("reserve") && (
                <Button variant="secondary" onClick={() => act.mutate({ action: "reserve" })} disabled={act.isPending}>
                  {t("sales.reserve")}
                </Button>
              )}
              {availableActions.includes("startPicking") && (
                <Button variant="secondary" onClick={() => act.mutate({ action: "startPicking" })} disabled={act.isPending}>
                  {t("sales.startPicking")}
                </Button>
              )}
              {availableActions.includes("pack") && (
                <Button variant="secondary" onClick={() => act.mutate({ action: "pack" })} disabled={act.isPending}>
                  {t("sales.pack")}
                </Button>
              )}
              {availableActions.includes("ship") && (
                <Button variant="success" onClick={() => setShipOpen(true)} disabled={act.isPending}>
                  {t("sales.ship")}
                </Button>
              )}
              {availableActions.includes("complete") && (
                <Button variant="success" onClick={() => act.mutate({ action: "complete" })} disabled={act.isPending}>
                  {t("sales.complete")}
                </Button>
              )}
              {canInvoice && can("invoices.create") && (
                <Button variant="outline" onClick={() => createInvoice.mutate()} disabled={createInvoice.isPending}>
                  {t("invoices.create")}
                </Button>
              )}
              {availableActions.includes("cancel") && (
                <Button
                  variant="destructive"
                  disabled={act.isPending}
                  onClick={async () => {
                    if (await confirm({ title: t("sales.cancelOrder"), message: t("sales.cancelOrderConfirm", { number: data.orderNumber }), danger: true, confirmLabel: t("sales.cancelOrder") })) {
                      act.mutate({ action: "cancel" });
                    }
                  }}
                >
                  {t("common.cancel")}
                </Button>
              )}
            </div>
          )
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "lines", label: t("sales.positions"), count: data.items.length },
          { key: "shipments", label: t("nav.shipments"), count: data.shipments.length },
          { key: "invoices", label: t("nav.invoices"), count: data.invoices.length },
          { key: "details", label: t("common.overview") },
        ]}
      />

      <div className="mt-4">
        <TabPanel active={tab} tabKey="lines">
          <Card noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-left">{t("products.title")}</th>
                  <th className="px-4 py-2 text-right">{t("common.quantity")}</th>
                  <th className="px-4 py-2 text-right">{t("sales.shippedQty")}</th>
                  <th className="px-4 py-2 text-right">{t("common.price")}</th>
                  <th className="px-4 py-2 text-right">%</th>
                  <th className="px-4 py-2 text-right">{t("common.vat")}</th>
                  <th className="px-4 py-2 text-right">{t("common.total")}</th>
                  <th className="px-4 py-2 text-right">{t("products.available")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => {
                  const avail = availByItem.get(it.id);
                  const short = avail !== undefined && avail < it.quantity - it.shippedQuantity;
                  return (
                    <tr key={it.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono text-2xs">{it.product.sku}</td>
                      <td className="px-4 py-2">
                        <Link href={`/products/${it.productId}`} className="hover:text-primary hover:underline">{it.product.name}</Link>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{it.quantity} {it.product.unit}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{it.shippedQuantity}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{it.unitPrice.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{it.discountPercent || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{it.taxRate}%</td>
                      <td className="px-4 py-2 text-right tabular-nums">{it.lineTotal.toFixed(2)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${short ? "font-semibold text-warning" : "text-muted-foreground"}`}>
                        {avail !== undefined ? Math.round(avail * 100) / 100 : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 text-[13px]">
                  <td colSpan={7} className="px-4 py-2 text-right text-muted-foreground">{t("common.subtotal")}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{data.subtotal.toFixed(2)}</td>
                  <td />
                </tr>
                {data.discountTotal > 0 && (
                  <tr className="text-[13px]">
                    <td colSpan={7} className="px-4 py-1 text-right text-muted-foreground">{t("common.discount")}</td>
                    <td className="px-4 py-1 text-right tabular-nums">−{data.discountTotal.toFixed(2)}</td>
                    <td />
                  </tr>
                )}
                <tr className="text-[13px]">
                  <td colSpan={7} className="px-4 py-1 text-right text-muted-foreground">{t("common.vat")}</td>
                  <td className="px-4 py-1 text-right tabular-nums">{data.taxTotal.toFixed(2)}</td>
                  <td />
                </tr>
                {data.shippingCost > 0 && (
                  <tr className="text-[13px]">
                    <td colSpan={7} className="px-4 py-1 text-right text-muted-foreground">{t("sales.shippingCost")}</td>
                    <td className="px-4 py-1 text-right tabular-nums">{data.shippingCost.toFixed(2)}</td>
                    <td />
                  </tr>
                )}
                <tr className="text-[13px] font-semibold">
                  <td colSpan={7} className="px-4 py-2 text-right">{t("common.total")}</td>
                  <td className="px-4 py-2 text-right tabular-nums"><Money amount={data.total} currency={data.currency} /></td>
                  <td />
                </tr>
              </tfoot>
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
                  <th className="px-4 py-2 text-left">{t("common.date")}</th>
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

        <TabPanel active={tab} tabKey="invoices">
          <Card noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 text-left">{t("invoices.number")}</th>
                  <th className="px-4 py-2 text-left">{t("invoices.issued")}</th>
                  <th className="px-4 py-2 text-left">{t("invoices.due")}</th>
                  <th className="px-4 py-2 text-right">{t("common.total")}</th>
                  <th className="px-4 py-2 text-right">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noResults")}</td></tr>
                )}
                {data.invoices.map((i) => (
                  <tr key={i.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-2">
                      <Link href={`/sales/invoices/${i.id}`} className="font-mono text-2xs text-primary hover:underline">{i.invoiceNumber}</Link>
                    </td>
                    <td className="px-4 py-2">{localeDate(i.issueDate, locale)}</td>
                    <td className="px-4 py-2">{i.dueDate ? localeDate(i.dueDate, locale) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.total.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right"><StatusBadge status={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabPanel>

        <TabPanel active={tab} tabKey="details">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t("customers.title")}>
              <DescriptionList
                items={[
                  { label: t("common.name"), value: <Link href={`/customers/${data.customer.id}`} className="text-primary hover:underline">{customerName}</Link> },
                  { label: t("customers.number"), value: data.customer.customerNumber },
                  { label: t("common.email"), value: data.customer.email ?? "—" },
                  { label: t("customers.city"), value: data.customer.billingCity ?? "—" },
                  { label: t("customers.paymentTermDays"), value: `${data.customer.paymentTermDays} ${t("common.days")}` },
                  { label: t("sales.salesRep"), value: data.salesRep ? `${data.salesRep.firstName} ${data.salesRep.lastName}` : "—" },
                ]}
              />
            </Card>
            <Card title={t("common.overview")}>
              <DescriptionList
                items={[
                  { label: t("common.date"), value: localeDate(data.orderDate, locale) },
                  { label: t("sales.confirmedAt"), value: data.confirmedAt ? localeDate(data.confirmedAt, locale) : "—" },
                  { label: t("sales.shippedAt"), value: data.shippedAt ? localeDate(data.shippedAt, locale) : "—" },
                  { label: t("warehouses.title"), value: data.warehouse ? `${data.warehouse.code} — ${data.warehouse.name}` : "—" },
                  { label: t("common.currency"), value: data.currency },
                  { label: t("common.total"), value: <Money amount={data.total} currency={data.currency} /> },
                ]}
              />
              {data.notes && (
                <div className="mt-3 rounded-md border bg-muted/30 p-3">
                  <p className="text-2xs font-medium uppercase text-muted-foreground">{t("common.notes")}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px]">{data.notes}</p>
                </div>
              )}
            </Card>
          </div>
        </TabPanel>
      </div>

      <ShipDialog
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        order={data}
        onShip={(payload) => {
          act.mutate(payload);
          setShipOpen(false);
        }}
      />
    </div>
  );
}

function ShipDialog({
  open, onClose, order, onShip,
}: {
  open: boolean; onClose: () => void; order: OrderDetail; onShip: (payload: Record<string, unknown>) => void;
}) {
  const t = useI18n().t;
  const [carrier, setCarrier] = useState("DHL");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [lines, setLines] = useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      for (const it of order.items) {
        init[it.id] = String(Math.max(0, it.quantity - it.shippedQuantity));
      }
      setLines(init);
      setCarrier("DHL");
      setTrackingNumber("");
    }
  }, [open, order]);

  const shipLines = order.items
    .map((it) => ({ itemId: it.id, quantity: Number(lines[it.id] ?? 0) }))
    .filter((l) => l.quantity > 0);

  return (
    <Dialog
      open={open} onClose={onClose} title={t("sales.shipTitle", { number: order.orderNumber })} size="lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="success" disabled={shipLines.length === 0} onClick={() => onShip({ action: "ship", carrier, trackingNumber: trackingNumber || undefined, shipLines })}>
          {t("sales.ship")}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("logistics.carrier")}>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="DHL / Dachser / …" />
          </Field>
          <Field label={t("logistics.trackingNumber")}>
            <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
          </Field>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
              <th className="px-2 py-1.5 text-left">{t("products.title")}</th>
              <th className="px-2 py-1.5 text-right">{t("sales.openQty")}</th>
              <th className="w-32 px-2 py-1.5 text-right">{t("sales.shipQty")}</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => {
              const open = it.quantity - it.shippedQuantity;
              return (
                <tr key={it.id} className="border-b last:border-0">
                  <td className="px-2 py-1.5">{it.product.sku} — {it.product.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{open} {it.product.unit}</td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number" min={0} max={open} step="any"
                      className="h-7 text-right text-xs"
                      value={lines[it.id] ?? "0"}
                      onChange={(e) => setLines((l) => ({ ...l, [it.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

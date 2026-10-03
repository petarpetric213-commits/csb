"use client";

import React, { use, useState } from "react";
import Link from "next/link";
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
import { PO_ACTIONS } from "@/lib/status";

type PoDetail = {
  id: string; orderNumber: string; status: string; orderDate: string; expectedDeliveryDate: string | null;
  currency: string; subtotal: number; discountTotal: number; taxTotal: number; total: number;
  notes: string | null; sentAt: string | null; confirmedAt: string | null; receivedAt: string | null; paymentTermDays: number;
  supplier: { id: string; supplierNumber: string; companyName: string; email: string | null; city: string | null; country: string };
  warehouse: { id: string; code: string; name: string } | null;
  items: { id: string; productId: string; quantity: number; receivedQuantity: number; unitPrice: number; discountPercent: number; taxRate: number; lineTotal: number; product: { sku: string; name: string; unit: string; isBatchTracked: boolean; isExpiryTracked: boolean } }[];
  goodsReceipts: { id: string; receiptNumber: string; receivedAt: string; status: string; notes: string | null; items: { quantity: number; batchNumber: string | null; qualityStatus: string }[] }[];
};

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const can = usePermission();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [tab, setTab] = useState("lines");
  const [receiveOpen, setReceiveOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => apiGet<PoDetail>(`/api/purchasing/orders/${id}`),
  });

  const act = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost(`/api/purchasing/orders/${id}`, payload),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["purchase-order", id] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (res?.received) toast("success", t("purchasing.receivedAs", { number: res.receiptNumber }));
      else toast("success", t("common.saved"));
    },
    onError: (e) => toast("error", e instanceof ApiClientError ? e.message : t("common.error")),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data) return <ErrorState title={t("error.notFound")} retry={refetch} />;

  const availableActions = Object.entries(PO_ACTIONS)
    .filter(([, def]) => def.from.includes(data.status))
    .map(([action]) => action);
  const canReceive = ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"].includes(data.status);
  const openLines = data.items.filter((it) => it.quantity - it.receivedQuantity > 0.001);

  return (
    <div>
      <PageHeader
        title={data.orderNumber}
        breadcrumbs={[{ label: t("nav.purchaseOrders"), href: "/purchasing/orders" }, { label: data.orderNumber }]}
      />
      <EntityHeader
        number={data.orderNumber}
        title={data.supplier.companyName}
        status={<StatusBadge status={data.status} />}
        meta={
          <>
            <span>{t("common.date")}: {localeDate(data.orderDate, locale)}</span>
            {data.expectedDeliveryDate && <span>{t("purchasing.expectedDelivery")}: {localeDate(data.expectedDeliveryDate, locale)}</span>}
            {data.warehouse && <span>{t("warehouses.title")}: {data.warehouse.code}</span>}
            <span><Money amount={data.total} currency={data.currency} /></span>
          </>
        }
        actions={
          can("purchasing.update") && (
            <div className="flex flex-wrap items-center gap-2">
              {availableActions.includes("send") && (
                <Button onClick={() => act.mutate({ action: "send" })} disabled={act.isPending}>{t("purchasing.send")}</Button>
              )}
              {availableActions.includes("confirm") && (
                <Button variant="secondary" onClick={() => act.mutate({ action: "confirm" })} disabled={act.isPending}>{t("purchasing.confirm")}</Button>
              )}
              {canReceive && openLines.length > 0 && (
                <Button variant="success" onClick={() => setReceiveOpen(true)}>{t("purchasing.receive")}</Button>
              )}
              {availableActions.includes("cancel") && (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (await confirm({ title: t("purchasing.cancel"), message: t("purchasing.cancelConfirm", { number: data.orderNumber }), danger: true, confirmLabel: t("purchasing.cancel") })) {
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
        active={tab} onChange={setTab}
        tabs={[
          { key: "lines", label: t("sales.positions"), count: data.items.length },
          { key: "receipts", label: t("purchasing.goodsReceipts"), count: data.goodsReceipts.length },
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
                  <th className="px-4 py-2 text-right">{t("purchasing.receivedQty")}</th>
                  <th className="px-4 py-2 text-right">{t("common.price")}</th>
                  <th className="px-4 py-2 text-right">%</th>
                  <th className="px-4 py-2 text-right">{t("common.total")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-2xs">{it.product.sku}</td>
                    <td className="px-4 py-2">
                      <Link href={`/products/${it.productId}`} className="hover:text-primary hover:underline">{it.product.name}</Link>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.quantity} {it.product.unit}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.receivedQuantity}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.discountPercent || "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.lineTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={6} className="px-4 py-2 text-right text-muted-foreground">{t("common.subtotal")}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{data.subtotal.toFixed(2)}</td>
                </tr>
                <tr className="font-semibold">
                  <td colSpan={6} className="px-4 py-2 text-right">{t("common.total")}</td>
                  <td className="px-4 py-2 text-right tabular-nums"><Money amount={data.total} currency={data.currency} /></td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </TabPanel>

        <TabPanel active={tab} tabKey="receipts">
          <div className="space-y-3">
            {data.goodsReceipts.length === 0 && (
              <Card><p className="py-4 text-center text-xs text-muted-foreground">{t("common.noResults")}</p></Card>
            )}
            {data.goodsReceipts.map((gr) => (
              <Card key={gr.id} title={gr.receiptNumber} actions={<span className="text-xs text-muted-foreground">{localeDate(gr.receivedAt, locale)}</span>}>
                <div className="space-y-1">
                  {gr.items.map((gri, i) => (
                    <div key={i} className="flex items-center justify-between text-[13px]">
                      <span>{gri.quantity} {t("products.unit")} {gri.batchNumber ? `· ${t("quality.batch")}: ${gri.batchNumber}` : ""}</span>
                      <StatusBadge status={gri.qualityStatus === "PASS" ? "ACTIVE" : gri.qualityStatus === "FAIL" ? "BLOCKED" : gri.qualityStatus === "PENDING" ? "DRAFT" : "MAINTENANCE"} />
                    </div>
                  ))}
                  {gr.notes && <p className="mt-1 text-xs text-muted-foreground">{gr.notes}</p>}
                </div>
              </Card>
            ))}
          </div>
        </TabPanel>

        <TabPanel active={tab} tabKey="details">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t("suppliers.title")}>
              <DescriptionList
                items={[
                  { label: t("common.name"), value: <Link href={`/suppliers/${data.supplier.id}`} className="text-primary hover:underline">{data.supplier.companyName}</Link> },
                  { label: t("suppliers.number"), value: data.supplier.supplierNumber },
                  { label: t("common.email"), value: data.supplier.email ?? "—" },
                  { label: t("suppliers.city"), value: `${data.supplier.city ?? "—"} (${data.supplier.country})` },
                ]}
              />
            </Card>
            <Card title={t("common.overview")}>
              <DescriptionList
                items={[
                  { label: t("common.date"), value: localeDate(data.orderDate, locale) },
                  { label: t("purchasing.sentAt"), value: data.sentAt ? localeDate(data.sentAt, locale) : "—" },
                  { label: t("purchasing.confirmedAt"), value: data.confirmedAt ? localeDate(data.confirmedAt, locale) : "—" },
                  { label: t("purchasing.receivedAt"), value: data.receivedAt ? localeDate(data.receivedAt, locale) : "—" },
                  { label: t("purchasing.paymentTermDays"), value: `${data.paymentTermDays} ${t("common.days")}` },
                  { label: t("warehouses.title"), value: data.warehouse ? `${data.warehouse.code} — ${data.warehouse.name}` : "—" },
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

      <ReceiveDialog
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        po={data}
        onReceive={(lines) => {
          act.mutate({ action: "receive", lines });
          setReceiveOpen(false);
        }}
      />
    </div>
  );
}

function ReceiveDialog({
  open, onClose, po, onReceive,
}: {
  open: boolean; onClose: () => void; po: PoDetail; onReceive: (lines: { itemId: string; quantity: number; batchNumber?: string; expiryDate?: string }[]) => void;
}) {
  const t = useI18n().t;
  const [lines, setLines] = useState<Record<string, { qty: string; batch: string; expiry: string }>>({});

  React.useEffect(() => {
    if (open) {
      const init: typeof lines = {};
      for (const it of po.items) {
        init[it.id] = { qty: String(Math.max(0, it.quantity - it.receivedQuantity)), batch: "", expiry: "" };
      }
      setLines(init);
    }
  }, [open, po]);

  const receiveLines = po.items
    .map((it) => ({
      itemId: it.id,
      quantity: Number(lines[it.id]?.qty ?? 0),
      batchNumber: lines[it.id]?.batch || undefined,
      expiryDate: lines[it.id]?.expiry || undefined,
    }))
    .filter((l) => l.quantity > 0);

  return (
    <Dialog
      open={open} onClose={onClose} title={t("purchasing.receiveTitle", { number: po.orderNumber })} size="lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="success" disabled={receiveLines.length === 0} onClick={() => onReceive(receiveLines)}>
          {t("purchasing.receive")}
        </Button>
      </>}
    >
      <p className="mb-3 text-xs text-muted-foreground">{t("purchasing.receiveHint")}</p>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
            <th className="px-2 py-1.5 text-left">{t("products.title")}</th>
            <th className="w-24 px-2 py-1.5 text-right">{t("purchasing.openQty")}</th>
            <th className="w-24 px-2 py-1.5 text-right">{t("purchasing.receiveQty")}</th>
            <th className="w-28 px-2 py-1.5 text-left">{t("quality.batch")}</th>
            <th className="w-36 px-2 py-1.5 text-left">{t("products.expiry")}</th>
          </tr>
        </thead>
        <tbody>
          {po.items.map((it) => {
            const open = it.quantity - it.receivedQuantity;
            if (open <= 0.001) return null;
            return (
              <tr key={it.id} className="border-b last:border-0">
                <td className="px-2 py-1.5">{it.product.sku} — {it.product.name}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{open} {it.product.unit}</td>
                <td className="px-2 py-1.5">
                  <Input type="number" min={0} max={open} step="any" className="h-7 text-right text-xs"
                    value={lines[it.id]?.qty ?? "0"}
                    onChange={(e) => setLines((l) => ({ ...l, [it.id]: { ...l[it.id], qty: e.target.value } }))} />
                </td>
                <td className="px-2 py-1.5">
                  {it.product.isBatchTracked ? (
                    <Input className="h-7 text-xs" placeholder="B…" value={lines[it.id]?.batch ?? ""}
                      onChange={(e) => setLines((l) => ({ ...l, [it.id]: { ...l[it.id], batch: e.target.value } }))} />
                  ) : <span className="text-2xs text-muted-foreground">—</span>}
                </td>
                <td className="px-2 py-1.5">
                  {it.product.isExpiryTracked ? (
                    <Input type="date" className="h-7 text-xs" value={lines[it.id]?.expiry ?? ""}
                      onChange={(e) => setLines((l) => ({ ...l, [it.id]: { ...l[it.id], expiry: e.target.value } }))} />
                  ) : <span className="text-2xs text-muted-foreground">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Dialog>
  );
}

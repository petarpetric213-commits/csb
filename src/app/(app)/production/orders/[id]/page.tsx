"use client";

import React, { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n, useConfirm, useToast } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiGet, apiPost, ApiClientError } from "@/lib/client/api";
import { PageHeader, EntityHeader, DescriptionList, Card } from "@/components/ui/patterns";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { localeDate } from "@/lib/i18n";

type MoDetail = {
  id: string; orderNumber: string; status: string; priority: string; quantity: number; producedQuantity: number;
  materialStatus: string; plannedStart: string | null; plannedEnd: string | null; actualStart: string | null;
  actualEnd: string | null; notes: string | null;
  product: { id: string; sku: string; name: string; unit: string };
  bom: { id: string; name: string; version: number } | null;
  workCenter: { code: string; name: string } | null;
  warehouse: { code: string; name: string } | null;
  responsible: { id: string; firstName: string; lastName: string } | null;
  components: { id: string; productId: string; requiredQty: number; issuedQty: number; wastePercent: number; product: { sku: string; name: string; unit: string } }[];
  inspections: { id: string; inspectionNumber: string; result: string; inspectedAt: string; batchNumber: string | null }[];
  availableActions: string[];
  availability: { componentId: string; available: number }[];
};

const MO_ACTION_LABELS: Record<string, string> = {
  release: "production.release",
  start: "production.start",
  pause: "production.pause",
  resume: "production.resume",
  finishProduction: "production.finishProduction",
  complete: "production.complete",
  cancel: "common.cancel",
};

export default function ProductionOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const can = usePermission();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [tab, setTab] = useState("components");
  const [finishOpen, setFinishOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["production-order", id],
    queryFn: () => apiGet<MoDetail>(`/api/production/orders/${id}`),
  });

  const act = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost(`/api/production/orders/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-order", id] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast("success", t("common.saved"));
    },
    onError: (e) => toast("error", e instanceof ApiClientError ? e.message : t("common.error")),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error || !data) return <ErrorState title={t("error.notFound")} retry={refetch} />;

  const availByComponent = new Map(data.availability.map((a) => [a.componentId, a.available]));
  const doAction = async (action: string, producedQuantity?: number) => {
    if (action === "cancel") {
      const ok = await confirm({ title: t("production.cancel"), message: t("production.cancelConfirm", { number: data.orderNumber }), danger: true, confirmLabel: t("production.cancel") });
      if (!ok) return;
    }
    act.mutate(producedQuantity !== undefined ? { action, producedQuantity } : { action });
  };

  return (
    <div>
      <PageHeader
        title={data.orderNumber}
        breadcrumbs={[{ label: t("nav.productionOrders"), href: "/production/orders" }, { label: data.orderNumber }]}
      />
      <EntityHeader
        number={data.orderNumber}
        title={`${data.product.name} (${data.product.sku})`}
        status={<StatusBadge status={data.status} />}
        meta={
          <>
            <span>{t("common.quantity")}: {data.quantity} {data.product.unit}</span>
            {data.workCenter && <span>{t("workcenters.title")}: {data.workCenter.name}</span>}
            {data.bom && <span>{t("nav.boms")}: {data.bom.name} (v{data.bom.version})</span>}
            <Badge tone={data.priority === "URGENT" ? "danger" : data.priority === "HIGH" ? "warning" : "info"}>{t(`common.prio_${data.priority}`)}</Badge>
          </>
        }
        actions={
          can("production.update") && (
            <div className="flex flex-wrap items-center gap-2">
              {data.availableActions.map((action) => (
                <Button
                  key={action}
                  variant={action === "cancel" ? "destructive" : action === "complete" ? "success" : "default"}
                  onClick={() => (action === "finishProduction" ? setFinishOpen(true) : doAction(action))}
                  disabled={act.isPending}
                >
                  {t(MO_ACTION_LABELS[action] ?? action)}
                </Button>
              ))}
            </div>
          )
        }
      />

      <Tabs
        active={tab} onChange={setTab}
        tabs={[
          { key: "components", label: t("production.components"), count: data.components.length },
          { key: "quality", label: t("nav.quality"), count: data.inspections.length },
          { key: "details", label: t("common.overview") },
        ]}
      />

      <div className="mt-4">
        <TabPanel active={tab} tabKey="components">
          <Card noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-left">{t("products.title")}</th>
                  <th className="px-4 py-2 text-right">{t("production.required")}</th>
                  <th className="px-4 py-2 text-right">{t("production.issued")}</th>
                  <th className="px-4 py-2 text-right">%</th>
                  <th className="px-4 py-2 text-right">{t("products.available")}</th>
                </tr>
              </thead>
              <tbody>
                {data.components.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("production.noBom")}</td></tr>
                )}
                {data.components.map((c) => {
                  const avail = availByComponent.get(c.id);
                  const short = avail !== undefined && avail < c.requiredQty - c.issuedQty;
                  return (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono text-2xs">{c.product.sku}</td>
                      <td className="px-4 py-2">
                        <Link href={`/products/${c.productId}`} className="hover:text-primary hover:underline">{c.product.name}</Link>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.requiredQty} {c.product.unit}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.issuedQty}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{c.wastePercent || "—"}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${short ? "font-semibold text-warning" : "text-muted-foreground"}`}>
                        {avail !== undefined ? Math.round(avail * 100) / 100 : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </TabPanel>

        <TabPanel active={tab} tabKey="quality">
          <Card noPadding>
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 text-left">{t("quality.number")}</th>
                  <th className="px-4 py-2 text-left">{t("quality.batch")}</th>
                  <th className="px-4 py-2 text-left">{t("quality.inspectedAt")}</th>
                  <th className="px-4 py-2 text-right">{t("quality.result")}</th>
                </tr>
              </thead>
              <tbody>
                {data.inspections.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noResults")}</td></tr>
                )}
                {data.inspections.map((qi) => (
                  <tr key={qi.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-2">
                      <Link href={`/quality/${qi.id}`} className="font-mono text-2xs text-primary hover:underline">{qi.inspectionNumber}</Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-2xs">{qi.batchNumber ?? "—"}</td>
                    <td className="px-4 py-2">{localeDate(qi.inspectedAt, locale)}</td>
                    <td className="px-4 py-2 text-right">
                      <StatusBadge status={qi.result === "PASS" ? "ACTIVE" : qi.result === "FAIL" ? "BLOCKED" : qi.result === "PENDING" ? "DRAFT" : "MAINTENANCE"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabPanel>

        <TabPanel active={tab} tabKey="details">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t("common.overview")}>
              <DescriptionList
                items={[
                  { label: t("production.plannedStart"), value: data.plannedStart ? localeDate(data.plannedStart, locale) : "—" },
                  { label: t("production.plannedEnd"), value: data.plannedEnd ? localeDate(data.plannedEnd, locale) : "—" },
                  { label: t("production.actualStart"), value: data.actualStart ? localeDate(data.actualStart, locale) : "—" },
                  { label: t("production.actualEnd"), value: data.actualEnd ? localeDate(data.actualEnd, locale) : "—" },
                  { label: t("production.responsible"), value: data.responsible ? `${data.responsible.firstName} ${data.responsible.lastName}` : "—" },
                  { label: t("warehouses.title"), value: data.warehouse ? `${data.warehouse.code} — ${data.warehouse.name}` : "—" },
                  { label: t("production.materialStatus"), value: <StatusBadge status={data.materialStatus === "RESERVED" ? "RESERVED" : data.materialStatus === "ISSUED" ? "COMPLETED" : "DRAFT"} /> },
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

      <FinishDialog
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        mo={data}
        onFinish={(qty) => {
          setFinishOpen(false);
          doAction("finishProduction", qty);
        }}
      />
    </div>
  );
}

function FinishDialog({ open, onClose, mo, onFinish }: { open: boolean; onClose: () => void; mo: MoDetail; onFinish: (qty: number) => void }) {
  const t = useI18n().t;
  const [qty, setQty] = useState(String(mo.quantity));
  React.useEffect(() => { if (open) setQty(String(mo.quantity)); }, [open, mo.quantity]);
  return (
    <Dialog
      open={open} onClose={onClose} title={t("production.finishTitle", { number: mo.orderNumber })}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="success" onClick={() => onFinish(Number(qty))}>{t("production.finishProduction")}</Button>
      </>}
    >
      <Field label={t("production.producedQty")} required hint={`${t("common.quantity")}: ${mo.quantity} ${mo.product.unit}`}>
        <Input type="number" min={0.001} step="any" max={mo.quantity} value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
      <p className="mt-3 text-xs text-muted-foreground">{t("production.finishHint")}</p>
    </Dialog>
  );
}

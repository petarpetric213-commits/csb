"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiGet } from "@/lib/client/api";
import { PageHeader, Card } from "@/components/ui/patterns";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

type Row = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  available: number;
  incoming: number;
  openDemand: number;
  shortage: number;
  safetyStock: number;
  recommendation: string; // PURCHASE | PRODUCE | NONE
};

export default function MrpPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mrp"],
    queryFn: () => apiGet<Row[]>("/api/production/mrp"),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error) return <ErrorState title={t("common.error")} retry={refetch} />;

  const rows = (data as unknown as Row[]) ?? [];

  return (
    <div>
      <PageHeader title={t("mrp.title")} description={t("mrp.subtitle")} />
      <Card noPadding>
        <table className="w-full text-[13px]">
          <thead><tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">
            <th className="px-4 py-2 text-left">{t("common.product")}</th>
            <th className="px-4 py-2 text-right">{t("mrp.available")}</th>
            <th className="px-4 py-2 text-right">{t("mrp.incoming")}</th>
            <th className="px-4 py-2 text-right">{t("mrp.openDemand")}</th>
            <th className="px-4 py-2 text-right">{t("mrp.shortage")}</th>
            <th className="px-4 py-2 text-left">{t("mrp.recommendation")}</th>
            <th className="px-4 py-2 text-left">{t("common.actions")}</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-xs text-muted-foreground">✓ {t("mrp.none")} — nema manjka</td></tr>}
            {rows.map((r) => (
              <tr key={r.productId} className="border-b last:border-0">
                <td className="px-4 py-2"><span className="font-mono text-2xs">{r.sku}</span> <span className="font-medium">{r.name}</span><span className="text-2xs text-muted-foreground"> — {r.unit}</span></td>
                <td className="px-4 py-2 text-right tabular-nums">{r.available}</td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{r.incoming}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.openDemand}</td>
                <td className={`px-4 py-2 text-right tabular-nums font-semibold ${r.shortage > 0 ? "text-danger" : "text-success"}`}>{r.shortage}</td>
                <td className="px-4 py-2"><Badge tone={r.recommendation === "PURCHASE" ? "warning" : r.recommendation === "PRODUCE" ? "info" : "success"}>{r.recommendation === "NONE" ? t("mrp.none") : t(`mrp.${r.recommendation.toLowerCase()}`)}</Badge></td>
                <td className="px-4 py-2">{r.recommendation === "PURCHASE" ? <Button size="xs" variant="outline" onClick={() => router.push("/purchasing/orders")}>{t("purchasing.createFor")}</Button> : r.recommendation === "PRODUCE" ? <Button size="xs" variant="outline" onClick={() => router.push("/production/orders")}>{t("mrp.produce")}</Button> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

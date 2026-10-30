"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiGet } from "@/lib/client/api";
import { PageHeader, Card } from "@/components/ui/patterns";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";

type Report = { columns: string[]; rows: (string | number)[][]; summary?: Record<string, number> };

export default function ReportsPage() {
  const { t } = useI18n();
  const [type, setType] = useState("salesByCustomer");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["report", type, from, to],
    queryFn: () => apiGet<Report>(`/api/reports?type=${type}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`),
  });

  const downloadCsv = () => {
    window.open(`/api/reports?type=${type}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}&format=csv`, "_blank");
  };

  return (
    <div>
      <PageHeader title={t("reports.title")} description={t("reports.subtitle")} actions={<Button variant="outline" onClick={downloadCsv}>{t("common.exportCsv")}</Button>} />
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{t("common.type")}</label>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="mt-1">
              <option value="salesByCustomer">{t("reports.sales")} — {t("common.customer")}</option>
              <option value="salesByProduct">{t("reports.sales")} — {t("common.product")}</option>
              <option value="purchasesBySupplier">{t("reports.purchases")} — {t("common.supplier")}</option>
              <option value="inventoryValuation">{t("reports.inventory")}</option>
              <option value="productionOutput">{t("reports.production")}</option>
              <option value="invoicesOutstanding">{t("reports.finance")}</option>
            </Select>
          </div>
          <div>
            <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{t("common.from")}</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{t("common.to")}</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={() => refetch()}>{t("reports.run")}</Button>
        </div>
      </Card>

      <Card className="mt-4" noPadding>
        {isLoading ? <p className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p> : !data ? <p className="p-6 text-center text-sm text-muted-foreground">{t("common.noData")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b bg-muted/50 text-2xs uppercase text-muted-foreground">{data.columns.map((c) => <th key={c} className="px-4 py-2 text-left">{c}</th>)}</tr></thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={data.columns.length} className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noData")}</td></tr>}
                {data.rows.map((row, i) => <tr key={i} className="border-b last:border-0">{row.map((v, j) => <td key={j} className="px-4 py-1.5">{String(v)}</td>)}</tr>)}
              </tbody>
            </table>
            {data.summary && (
              <div className="border-t bg-muted/30 px-4 py-2 flex flex-wrap gap-4 text-xs">
                {Object.entries(data.summary).map(([k, v]) => <span key={k}><strong>{k}:</strong> {v}</span>)}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

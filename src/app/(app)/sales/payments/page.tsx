"use client";

import React, { useMemo, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiList } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/states";
import { localeDate } from "@/lib/i18n";

type Row = {
  id: string; paymentNumber: string; direction: string; partner: string; invoiceNumber: string | null;
  amount: number; currency: string; method: string; reference: string | null; status: string; paidAt: string;
};

function PaymentsPageInner() {
  const t = useI18n().t;
  const { locale } = useI18n();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["payments", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/sales/payments", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "paymentNumber", header: t("payments.number"), cell: (r) => <span className="font-mono text-2xs">{r.paymentNumber}</span> }),
      col<Row>({ key: "paidAt", header: t("payments.paidAt"), cell: (r) => localeDate(r.paidAt, locale) }),
      col<Row>({ key: "partner", header: t("payments.partner"), cell: (r) => <span className="font-medium">{r.partner}</span> }),
      col<Row>({ key: "invoiceNumber", header: t("nav.invoices"), cell: (r) => r.invoiceNumber ? <span className="font-mono text-2xs">{r.invoiceNumber}</span> : "—" }),
      col<Row>({ key: "method", header: t("payments.method"), cell: (r) => t(`payments.method_${r.method}`) }),
      col<Row>({ key: "amount", header: t("payments.amount"), align: "right", cell: (r) => <Money amount={r.amount} currency={r.currency} /> }),
      col<Row>({ key: "status", header: t("common.status"), cell: (r) => <Badge tone={r.status === "COMPLETED" ? "success" : "warning"}>{t(`payments.status_${r.status}`)}</Badge> }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader
        title={t("payments.title")}
        description={t("payments.subtitle")}
        actions={
          data && (
            <span className="text-xs text-muted-foreground">
              {t("common.total")}: <strong className="text-foreground"><Money amount={data.sumAmount as number} /></strong>
            </span>
          )
        }
      />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={
          <FilterSelect label={t("payments.direction")} value={filters.direction ?? "ALL"}
            options={[
              { value: "INBOUND", label: t("payments.inbound") },
              { value: "OUTBOUND", label: t("payments.outbound") },
            ]}
            onChange={(v) => setFilter("direction", v === "ALL" ? null : v)} />
        }
      />
      <DataTable
        storageKey="payments"
        columns={columns}
        data={data?.items ?? []}
        total={data?.total}
        page={page} pageSize={pageSize}
        onPageChange={onPageChange}
        sorting={sorting ? [{ id: sorting.split(":")[0], desc: sorting.split(":")[1] === "desc" }] : []}
        onSortingChange={onSortingChange as never}
        isLoading={isLoading}
        error={error ? (error as Error).message : null}
        onRetry={refetch}
        emptyTitle={t("common.noResults")}
        exportName="payments"
        csvHeaders={["Nummer", "Datum", "Partner", "Rechnung", "Methode", "Betrag", "Status"]}
        csvRows={(rows) => rows.map((r) => [r.paymentNumber, r.paidAt.slice(0, 10), r.partner, r.invoiceNumber ?? "", r.method, r.amount, r.status])}
      />
    </div>
  );
}

export default function PaymentsPage() {
  return <Suspense><PaymentsPageInner /></Suspense>;
}

"use client";

import React, { useMemo, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiList } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect } from "@/components/shared/filters";
import { PageHeader, Card, KeyValueJson } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { localeDate } from "@/lib/i18n";

type Row = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityNumber: string | null;
  summary: string | null;
  beforeData: string | null;
  afterData: string | null;
  ip: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
  companyId: string;
};

function AuditPageInner() {
  const { t, locale } = useI18n();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery({ pageSize: 50 });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["audit", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/audit", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "createdAt", header: t("common.date"), cell: (r) => <span className="text-2xs">{localeDate(r.createdAt, locale)}</span> }),
      col<Row>({ key: "user", header: t("audit.user"), cell: (r) => <span className="text-xs">{r.user?.name ?? "System"}</span> }),
      col<Row>({ key: "action", header: t("audit.action"), cell: (r) => <Badge tone={r.action === "CREATED" ? "success" : r.action === "DELETED" ? "danger" : r.action === "STATUS_CHANGED" ? "warning" : "neutral"}>{r.action}</Badge> }),
      col<Row>({ key: "entityType", header: t("audit.entity"), cell: (r) => <span className="font-mono text-2xs">{r.entityType}{r.entityNumber ? ` · ${r.entityNumber}` : ""}</span> }),
      col<Row>({ key: "summary", header: t("audit.summary"), cell: (r) => <span className="text-xs truncate max-w-[420px] block">{r.summary ?? "—"}</span> }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader title={t("audit.title")} description={t("audit.subtitle")} />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={
          <>
            <FilterSelect label={t("audit.action")} value={filters.action ?? "ALL"} options={[{ value: "CREATED", label: "CREATED" }, { value: "UPDATED", label: "UPDATED" }, { value: "DELETED", label: "DELETED" }, { value: "STATUS_CHANGED", label: "STATUS_CHANGED" }]} onChange={(v) => setFilter("action", v === "ALL" ? null : v)} />
            <FilterSelect label={t("audit.entity")} value={filters.entityType ?? "ALL"} options={(data as any)?.meta?.entityTypes?.map((et: string) => ({ value: et, label: et })) ?? []} onChange={(v) => setFilter("entityType", v === "ALL" ? null : v)} />
          </>
        }
      />
      <DataTable
        storageKey="audit"
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
      />
      {data?.items?.[0] && (
        <Card title={t("audit.changes")} className="mt-4">
          <p className="text-2xs text-muted-foreground mb-2">{t("audit.before")} / {t("audit.after")} — prikaz poslednjeg zapisa kao primer strukture (svi zapisi imaju istu strukturu)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><p className="text-2xs font-semibold uppercase">{t("audit.before")}</p><KeyValueJson data={data.items[0].beforeData} /></div>
            <div><p className="text-2xs font-semibold uppercase">{t("audit.after")}</p><KeyValueJson data={data.items[0].afterData} /></div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function AuditPage() {
  return <Suspense><AuditPageInner /></Suspense>;
}

"use client";

import React, { useMemo, useState, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { usePermission } from "@/lib/client/session";
import { apiList, ApiClientError } from "@/lib/client/api";
import { useListQuery } from "@/components/shared/use-list-query";
import { ListFilters, FilterSelect } from "@/components/shared/filters";
import { PageHeader, Card } from "@/components/ui/patterns";
import { DataTable, col } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { localeDate } from "@/lib/i18n";

type Row = {
  id: string;
  filename: string;
  docType: string;
  entityType: string | null;
  entityNumber: string | null;
  tags: string | null;
  size: number;
  mimeType: string;
  uploadedBy: { name: string } | null;
  createdAt: string;
};

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("OTHER");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!file) { setError(t("documents.fileRequired")); return; }
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("docType", docType);
    if (tags) fd.set("tags", tags);
    const res = await fetch("/api/documents", { method: "POST", body: fd, credentials: "same-origin" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? t("common.error"));
      setSaving(false);
      return;
    }
    qc.invalidateQueries({ queryKey: ["documents"] });
    setSaving(false);
    onClose();
    setFile(null);
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("documents.upload")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={submit} disabled={saving}>{saving ? t("common.saving") : t("common.upload")}</Button></>}>
      <div className="grid gap-3">
        <Field label={t("documents.file")} required>
          <Input type="file" onChange={(e) => setFile((e.target as HTMLInputElement).files?.[0] ?? null)} />
          {file && <p className="text-2xs text-muted-foreground">{file.name} — {(file.size/1024).toFixed(1)} kB</p>}
        </Field>
        <Field label={t("documents.docType")}>
          <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="OTHER">{t("documents.typeOTHER")}</option>
            <option value="CONTRACT">CONTRACT</option><option value="SPECIFICATION">SPECIFICATION</option><option value="CERTIFICATE">CERTIFICATE</option><option value="INVOICE">INVOICE</option><option value="MANUAL">MANUAL</option><option value="IMAGE">IMAGE</option>
          </Select>
        </Field>
        <Field label={t("documents.tags")}><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="npr. sertifikat, ugovor" /></Field>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

function DocumentsPageInner() {
  const { t, locale } = useI18n();
  const can = usePermission();
  const { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters } = useListQuery();
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["documents", { page, pageSize, sorting, q, ...filters }],
    queryFn: () => apiList<Row>("/api/documents", { page, pageSize, sorting, q, ...filters }),
  });

  const columns = useMemo(
    () => [
      col<Row>({ key: "filename", header: t("documents.file"), cell: (r) => <span className="font-medium">{r.filename}</span> }),
      col<Row>({ key: "docType", header: t("documents.docType"), cell: (r) => <Badge tone="info">{r.docType}</Badge> }),
      col<Row>({ key: "entityType", header: t("documents.linkedTo"), cell: (r) => r.entityNumber ? `${r.entityType ?? ""} ${r.entityNumber}` : "—" }),
      col<Row>({ key: "size", header: t("documents.size"), align: "right", cell: (r) => `${(r.size/1024).toFixed(1)} kB` }),
      col<Row>({ key: "uploadedBy", header: t("common.createdBy"), cell: (r) => r.uploadedBy?.name ?? "—" }),
      col<Row>({ key: "createdAt", header: t("common.createdAt"), cell: (r) => localeDate(r.createdAt, locale) }),
    ],
    [t, locale]
  );

  return (
    <div>
      <PageHeader title={t("documents.title")} description={t("documents.subtitle")} actions={can("documents.create") ? <Button onClick={() => setUploadOpen(true)}>+ {t("documents.upload")}</Button> : null} />
      <ListFilters
        q={q} onSearch={onSearch}
        selects={<FilterSelect label={t("documents.docType")} value={filters.docType ?? "ALL"} options={[{ value: "CONTRACT", label: "CONTRACT" }, { value: "INVOICE", label: "INVOICE" }, { value: "IMAGE", label: "IMAGE" }, { value: "OTHER", label: "OTHER" }]} onChange={(v) => setFilter("docType", v === "ALL" ? null : v)} />}
      />
      <DataTable
        storageKey="documents"
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
        rowActions={(row: Row) => <Button size="xs" variant="outline" onClick={() => window.open(`/api/documents/${row.id}?download=1`, "_blank")}>{t("common.download")}</Button>}
      />
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}

export default function DocumentsPage() {
  return <Suspense><DocumentsPageInner /></Suspense>;
}

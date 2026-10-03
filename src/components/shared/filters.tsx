"use client";

import React from "react";
import { useI18n } from "@/components/providers";
import { SearchInput } from "@/components/ui/data-table";

/** Standard filter row: debounced search + enum selects (ALL + given options). */
export function ListFilters({
  q,
  onSearch,
  selects,
  right,
}: {
  q: string;
  onSearch: (v: string) => void;
  selects?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <SearchInput value={q} onChange={onSearch} className="w-64" />
      {selects}
      <div className="ml-auto flex items-center gap-2">{right}</div>
    </div>
  );
}

/** Labeled status select for ListFilters. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="whitespace-nowrap">{label}</span>
      <select
        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="ALL">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Hook exposing translated status options for the common enums. */
export function useStatusOptions() {
  const { t } = useI18n();
  return {
    customer: [
      { value: "ACTIVE", label: t("status.ACTIVE") },
      { value: "PROSPECT", label: t("status.PROSPECT") },
      { value: "INACTIVE", label: t("status.INACTIVE") },
      { value: "BLOCKED", label: t("status.BLOCKED") },
    ],
    salesOrder: [
      { value: "DRAFT", label: t("status.DRAFT") },
      { value: "CONFIRMED", label: t("status.CONFIRMED") },
      { value: "OPEN", label: t("common.open") },
      { value: "SHIPPED", label: t("status.SHIPPED") },
      { value: "DONE", label: t("status.COMPLETED") },
      { value: "CANCELLED", label: t("status.CANCELLED") },
    ],
    purchaseOrder: [
      { value: "DRAFT", label: t("status.DRAFT") },
      { value: "SENT", label: t("status.SENT") },
      { value: "CONFIRMED", label: t("status.CONFIRMED") },
      { value: "PARTIALLY_RECEIVED", label: t("status.PARTIALLY_RECEIVED") },
      { value: "RECEIVED", label: t("status.RECEIVED") },
      { value: "CANCELLED", label: t("status.CANCELLED") },
    ],
    invoice: [
      { value: "DRAFT", label: t("status.DRAFT") },
      { value: "ISSUED", label: t("status.ISSUED") },
      { value: "PARTIALLY_PAID", label: t("status.PARTIALLY_PAID") },
      { value: "PAID", label: t("status.PAID") },
      { value: "OVERDUE", label: t("status.OVERDUE") },
      { value: "CANCELLED", label: t("status.CANCELLED") },
    ],
    shipment: [
      { value: "PREPARING", label: t("status.PREPARING") },
      { value: "PICKED", label: t("status.PICKED") },
      { value: "PACKED", label: t("status.PACKED") },
      { value: "SHIPPED", label: t("status.SHIPPED") },
      { value: "IN_TRANSIT", label: t("status.IN_TRANSIT") },
      { value: "DELIVERED", label: t("status.DELIVERED") },
      { value: "CANCELLED", label: t("status.CANCELLED") },
    ],
    mo: [
      { value: "PLANNED", label: t("status.PLANNED") },
      { value: "RELEASED", label: t("status.RELEASED") },
      { value: "IN_PROGRESS", label: t("status.IN_PROGRESS") },
      { value: "PAUSED", label: t("status.PAUSED") },
      { value: "QUALITY_CONTROL", label: t("status.QUALITY_CONTROL") },
      { value: "COMPLETED", label: t("status.COMPLETED") },
      { value: "CANCELLED", label: t("status.CANCELLED") },
    ],
    task: [
      { value: "TODO", label: t("status.TODO") },
      { value: "IN_PROGRESS", label: t("status.IN_PROGRESS") },
      { value: "WAITING", label: t("status.WAITING") },
      { value: "COMPLETED", label: t("status.COMPLETED") },
    ],
  };
}

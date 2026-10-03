"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dialog";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={11} className="opacity-50" />}
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-4">
      {breadcrumbs && <div className="mb-1.5">{<Breadcrumbs items={breadcrumbs} />}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Detail-page entity header: identifier, title, status + contextual actions. */
export function EntityHeader({
  number,
  title,
  status,
  actions,
  meta,
}: {
  number?: string;
  title: React.ReactNode;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {number && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">{number}</span>}
          {status}
        </div>
        <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">{title}</h1>
        {meta && <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DescriptionList({
  items,
  columns = 2,
}: {
  items: { label: string; value: React.ReactNode }[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6",
        columns === 1 ? "grid-cols-1" : columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"
      )}
    >
      {items.map((item, i) => (
        <div key={i} className="flex flex-col border-b border-border/60 py-2 last:border-0">
          <dt className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 text-[13px]">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  noPadding,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border bg-card shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className={noPadding ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/** Read-only view of a JSON diff (audit before/after). */
export function KeyValueJson({ data }: { data: string | null | undefined }) {
  if (!data) return <span className="text-xs text-muted-foreground">—</span>;
  try {
    const parsed = JSON.parse(data);
    return (
      <pre className="max-h-64 overflow-auto rounded border bg-muted/50 p-2 font-mono text-2xs leading-relaxed scrollbar-thin">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    return <span className="font-mono text-2xs">{data}</span>;
  }
}

export function RowActions({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function MoreActionsMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const { t } = useI18n();
  return (
    <Dropdown
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={t("common.more")}>
          <MoreHorizontal size={14} />
        </Button>
      }
    >
      {(close) => (
        <>
          {items.map((item, i) => (
            <DropdownItem
              key={i}
              danger={item.danger}
              onClick={() => {
                close();
                item.onClick();
              }}
            >
              {item.label}
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}

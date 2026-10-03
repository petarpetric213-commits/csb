"use client";

import React from "react";
import { cn, formatMoney } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Inbox, Loader2 } from "lucide-react";

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card/50 px-6 py-14 text-center">
      <div className="text-muted-foreground/50">{icon ?? <Inbox size={30} />}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LoadingState({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-7 animate-pulse rounded bg-muted" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function InlineSpinner({ className }: { className?: string }) {
  return <Loader2 size={14} className={cn("animate-spin", className)} />;
}

export function ErrorState({ title, hint, retry }: { title: string; hint?: string; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger-bg/50 px-6 py-10 text-center">
      <AlertTriangle size={26} className="text-danger" />
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-md text-xs text-muted-foreground">{hint}</p>}
      {retry && (
        <button onClick={retry} className="mt-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
          Retry
        </button>
      )}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  tone,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : tone === "info" ? "text-info" : "text-foreground";
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card px-4 py-3 shadow-sm",
        onClick && "cursor-pointer hover:border-ring hover:shadow"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
      </div>
      <p className={cn("mt-1.5 text-xl font-semibold tabular-nums tracking-tight", toneClass)}>{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Money({ amount, currency = "EUR", className }: { amount: number | null | undefined; currency?: string; className?: string }) {
  if (amount === null || amount === undefined) return <span className="text-muted-foreground">—</span>;
  const negative = amount < 0;
  return (
    <span className={cn("tabular-nums", negative && "text-danger", className)}>
      {formatMoney(amount, currency)}
    </span>
  );
}

export function SuccessIcon() {
  return <CheckCircle2 size={14} className="text-success" />;
}

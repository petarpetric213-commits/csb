"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { statusDef, type StatusTone } from "@/lib/status";

const tones: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info-bg text-info border-info/25",
  success: "bg-success-bg text-success border-success/25",
  warning: "bg-warning-bg text-warning border-warning/25",
  danger: "bg-danger-bg text-danger border-danger/25",
  primary: "bg-primary/10 text-primary border-primary/25",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot = false,
}: {
  tone?: StatusTone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-2xs font-medium",
        tones[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Status badge driven by the central status registry. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const def = statusDef(status);
  return (
    <Badge tone={def.tone} className={className} dot>
      {def.label}
    </Badge>
  );
}

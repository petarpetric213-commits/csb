"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/status";

export type KanbanCardProps = {
  id: string;
  title: string;
  subtitle?: string;
  badges?: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: () => void;
  tone?: StatusTone;
};

export function KanbanColumn({
  title,
  count,
  tone = "neutral",
  children,
  onCardClick,
}: {
  title: React.ReactNode;
  count: number;
  tone?: StatusTone;
  children: KanbanCardProps[];
  onCardClick?: (id: string) => void;
}) {
  const toneBar =
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : tone === "danger" ? "bg-danger" : tone === "info" ? "bg-info" : tone === "primary" ? "bg-primary" : "bg-muted-foreground/40";
  return (
    <div className="flex min-w-[260px] flex-1 flex-col rounded-lg border bg-muted/40">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className={cn("h-2 w-2 rounded-full", toneBar)} />
        <span className="text-xs font-semibold">{title}</span>
        <span className="ml-auto rounded-full bg-muted px-1.5 py-px text-2xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="flex max-h-[calc(100vh-230px)] flex-col gap-2 overflow-y-auto p-2 scrollbar-thin">
        {count === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-2xs text-muted-foreground">Empty</div>
        )}
        {children.map((card) => (
          <button
            key={card.id}
            onClick={() => (card.onClick ?? onCardClick)?.(card.id)}
            className="w-full rounded-md border bg-card px-3 py-2.5 text-left shadow-sm transition hover:border-ring hover:shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13px] font-medium leading-snug">{card.title}</span>
            </div>
            {card.subtitle && <p className="mt-0.5 text-2xs text-muted-foreground">{card.subtitle}</p>}
            {card.badges && <div className="mt-1.5 flex flex-wrap items-center gap-1">{card.badges}</div>}
            {card.footer && <div className="mt-1.5 text-2xs text-muted-foreground">{card.footer}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
      {children}
    </div>
  );
}

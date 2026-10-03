"use client";

import React from "react";
import { cn } from "@/lib/utils";

/** URL-driven tabs (tab state survives refresh & shareable). */
export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { key: string; label: React.ReactNode; count?: number; icon?: React.ReactNode }[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5 overflow-x-auto border-b scrollbar-thin", className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
            active === tab.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && (
            <span className="rounded-full bg-muted px-1.5 py-px text-2xs tabular-nums">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ active, tabKey, children }: { active: string; tabKey: string; children: React.ReactNode }) {
  if (active !== tabKey) return null;
  return <div role="tabpanel">{children}</div>;
}

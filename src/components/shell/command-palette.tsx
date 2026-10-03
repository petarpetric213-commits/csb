"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet, qs } from "@/lib/client/api";
import { useI18n } from "@/components/providers";
import { useSession } from "@/lib/client/session";
import { NAV_GROUPS } from "./nav-config";
import { Search, ArrowRight, User, Building2, Package, ShoppingCart, Receipt, Truck, Factory, Boxes, Building } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchHit = { type: string; id: string; title: string; subtitle: string | null; number: string | null; status: string | null; href: string };

const TYPE_ICONS: Record<string, React.ReactNode> = {
  Customer: <User size={13} />,
  Supplier: <Building2 size={13} />,
  Product: <Package size={13} />,
  SalesOrder: <ShoppingCart size={13} />,
  PurchaseOrder: <Boxes size={13} />,
  Invoice: <Receipt size={13} />,
  Shipment: <Truck size={13} />,
  ProductionOrder: <Factory size={13} />,
  Warehouse: <Building size={13} />,
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const { has } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: hits } = useQuery<SearchHit[]>({
    queryKey: ["search", query],
    queryFn: () => apiGet(`/api/search${qs({ q: query })}`),
    enabled: open && query.trim().length >= 2,
    staleTime: 10_000,
  });

  const commands = useMemo(() => {
    const pages = NAV_GROUPS.flatMap((g) =>
      g.items
        .filter((i) => has(i.permission))
        .map((i) => ({ kind: "page" as const, label: t(i.key), href: i.href }))
    );
    const createActions: { kind: "action"; label: string; href: string }[] = [];
    if (has("customers.create")) createActions.push({ kind: "action", label: t("customers.new"), href: "/customers?new=1" });
    if (has("products.create")) createActions.push({ kind: "action", label: t("products.new"), href: "/products?new=1" });
    if (has("sales.create")) createActions.push({ kind: "action", label: t("sales.new"), href: "/sales/orders?new=1" });
    if (has("quotes.create")) createActions.push({ kind: "action", label: t("sales.newQuote"), href: "/sales/quotes?new=1" });
    if (has("purchasing.create")) createActions.push({ kind: "action", label: t("purchasing.new"), href: "/purchasing/orders?new=1" });
    if (has("invoices.create")) createActions.push({ kind: "action", label: t("invoices.new"), href: "/sales/invoices?new=1" });
    if (has("production.create")) createActions.push({ kind: "action", label: t("production.new"), href: "/production/orders?new=1" });
    return { pages, createActions };
  }, [t, has]);

  const q = query.trim().toLowerCase();
  const filteredPages = q ? commands.pages.filter((p) => p.label.toLowerCase().includes(q)) : commands.pages.slice(0, 8);
  const filteredActions = q ? commands.createActions.filter((a) => a.label.toLowerCase().includes(q)) : commands.createActions;
  const searchResults = (hits ?? []).filter((h) => !q || h.title.toLowerCase().includes(q) || (h.number ?? "").toLowerCase().includes(q)).slice(0, 8);

  const flat = useMemo(
    () => [
      ...searchResults.map((h) => ({ kind: "hit" as const, hit: h })),
      ...filteredActions.map((a) => ({ ...a, kind: "action" as const })),
      ...filteredPages.map((p) => ({ ...p, kind: "page" as const })),
    ],
    [searchResults, filteredActions, filteredPages]
  );

  useEffect(() => setActiveIndex(0), [query, open]);
  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const go = (item: (typeof flat)[number]) => {
    const href = item.kind === "hit" ? item.hit.href : item.href;
    onClose();
    router.push(href);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-black/50 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={t("palette.hint")}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-lg border bg-card shadow-2xl">
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search size={15} className="text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && flat[activeIndex]) {
                e.preventDefault();
                go(flat[activeIndex]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder={t("palette.placeholder")}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            aria-label={t("palette.placeholder")}
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2 scrollbar-thin">
          {flat.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">{t("palette.noResults")}</p>
          )}
          {searchResults.length > 0 && (
            <Section label={t("palette.results")} />
          )}
          {flat.map((item, i) => {
            if (item.kind === "hit") {
              const hit = item.hit;
              return (
                <Row key={`hit-${hit.id}`} active={i === activeIndex} onHover={() => setActiveIndex(i)} onClick={() => go(item)}>
                  <span className="text-muted-foreground">{TYPE_ICONS[hit.type] ?? <Search size={13} />}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {hit.title}
                    {hit.subtitle && <span className="ml-1.5 text-2xs text-muted-foreground">{hit.subtitle}</span>}
                  </span>
                  {hit.number && <span className="font-mono text-2xs text-muted-foreground">{hit.number}</span>}
                  <TypeTag type={hit.type} />
                </Row>
              );
            }
            if (item.kind === "action") {
              return (
                <Row key={`act-${item.href}`} active={i === activeIndex} onHover={() => setActiveIndex(i)} onClick={() => go(item)}>
                  <span className="rounded bg-primary/10 px-1 py-0.5 text-2xs font-bold text-primary">+</span>
                  <span className="flex-1 text-[13px]">{item.label}</span>
                  <ArrowRight size={12} className="text-muted-foreground" />
                </Row>
              );
            }
            return (
              <Row key={`page-${item.href}`} active={i === activeIndex} onHover={() => setActiveIndex(i)} onClick={() => go(item)}>
                <span className="text-muted-foreground">
                  {NAV_GROUPS.flatMap((g) => g.items).find((x) => x.href === item.href)?.icon &&
                    React.createElement(NAV_GROUPS.flatMap((g) => g.items).find((x) => x.href === item.href)!.icon, { size: 13 })}
                </span>
                <span className="flex-1 text-[13px]">{item.label}</span>
                <ArrowRight size={12} className="text-muted-foreground" />
              </Row>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Section({ label }: { label: string }) {
  return <p className="px-4 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>;
}

function Row({
  active,
  children,
  onClick,
  onHover,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-4 py-2 text-left",
        active ? "bg-accent" : "hover:bg-accent/60"
      )}
    >
      {children}
    </button>
  );
}

function TypeTag({ type }: { type: string }) {
  return <span className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">{type}</span>;
}

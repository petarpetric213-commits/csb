"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Star, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers";
import { useSession } from "@/lib/client/session";
import { NAV_GROUPS } from "./nav-config";

const SIDEBAR_KEY = "nexora.sidebar.collapsed";

export function Sidebar() {
  const t = useI18n().t;
  const { session, has } = useSession();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    setFavorites(JSON.parse(localStorage.getItem("nexora.sidebar.favorites") ?? "[]"));
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      localStorage.setItem(SIDEBAR_KEY, v ? "0" : "1");
      return !v;
    });
  };

  const toggleFavorite = (href: string) => {
    setFavorites((prev) => {
      const next = prev.includes(href) ? prev.filter((x) => x !== href) : [...prev, href];
      localStorage.setItem("nexora.sidebar.favorites", JSON.stringify(next));
      return next;
    });
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const favoriteItems = NAV_GROUPS.flatMap((g) => g.items).filter(
    (i) => favorites.includes(i.href) && has(i.permission)
  );

  return (
    <aside
      className={cn(
        "no-print z-30 flex h-full shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-150",
        collapsed ? "w-14" : "w-56"
      )}
      aria-label="Main navigation"
    >
      {/* Brand */}
      <div className="flex h-12 items-center gap-2.5 border-b px-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground shadow-sm">
          N
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold tracking-tight text-foreground">NEXORA ERP</p>
            <p className="truncate text-2xs text-muted-foreground">{t("app.tagline")}</p>
          </div>
        )}
        <button
          onClick={toggle}
          aria-label={t("sidebar.collapse")}
          className="ml-auto hidden rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground lg:block"
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2.5 scrollbar-thin">
        {/* Favorites */}
        {!collapsed && favoriteItems.length > 0 && (
          <div className="mb-2">
            <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {t("sidebar.favorites")}
            </p>
            {favoriteItems.map((item) => (
              <SidebarLink
                key={"fav-" + item.href}
                item={item}
                active={isActive(item.href)}
                collapsed={false}
                label={t(item.key)}
                onFavorite={() => toggleFavorite(item.href)}
                isFavorite
              />
            ))}
            <div className="mx-2 my-2 border-t" />
          </div>
        )}

        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => has(i.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.key} className="mb-2">
              {!collapsed && (
                <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {t(group.key)}
                </p>
              )}
              {collapsed && <div className="mx-2 my-2 border-t" />}
              {items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                  label={t(item.key)}
                  onFavorite={() => toggleFavorite(item.href)}
                  isFavorite={favorites.includes(item.href)}
                />
              ))}
            </div>
          );
        })}
      </nav>

      {/* Company badge */}
      {!collapsed && (
        <div className="border-t px-3 py-2.5">
          <p className="truncate text-2xs font-medium text-muted-foreground">{session.company.tradingName ?? session.company.legalName}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-2xs text-muted-foreground/70">
            {session.company.isDemo && (
              <span className="rounded bg-warning-bg px-1 py-px font-semibold text-warning">DEMO</span>
            )}
            {session.role.name}
          </p>
        </div>
      )}
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  label,
  onFavorite,
  isFavorite,
}: {
  item: { href: string; icon: LucideIcon };
  active: boolean;
  collapsed: boolean;
  label: string;
  onFavorite: () => void;
  isFavorite: boolean;
}) {
  const Icon = item.icon;
  return (
    <div className="group relative flex items-center">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={collapsed ? label : undefined}
        className={cn(
          "flex flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
          active
            ? "bg-primary/10 text-primary"
            : "text-sidebar-foreground/80 hover:bg-accent hover:text-foreground",
          collapsed && "justify-center px-0"
        )}
      >
        <Icon size={16} className="shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
      {!collapsed && (
        <button
          onClick={onFavorite}
          aria-label="Toggle favorite"
          className={cn(
            "rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100",
            isFavorite ? "text-warning opacity-100" : "text-muted-foreground hover:text-warning"
          )}
        >
          <Star size={11} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}

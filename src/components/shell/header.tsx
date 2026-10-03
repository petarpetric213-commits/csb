"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { apiList, apiPost, qs } from "@/lib/client/api";
import { useI18n } from "@/components/providers";
import { useSession } from "@/lib/client/session";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dialog";
import { CommandPalette } from "./command-palette";
import { NAV_GROUPS } from "./nav-config";
import {
  Search, Bell, Plus, Sun, Moon, Globe, LogOut, Settings as SettingsIcon,
  Building2, Check, ChevronDown, UserCircle2, Menu,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { LOCALES } from "@/lib/i18n";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  priority: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const t = useI18n().t;
  const { session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  // Global keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>('[aria-label="Collapse sidebar"]')?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Notifications (near-real-time: poll every 30s)
  const { data: notifications } = useQuery<{ items: NotificationItem[]; unread: number }>({
    queryKey: ["notifications-bell"],
    queryFn: () => apiList("/api/notifications", { pageSize: 8 }) as never,
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiPost(`/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-bell"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const switchCompany = useMutation({
    mutationFn: (companyId: string) => apiPost("/api/companies/switch", { companyId }),
    onSuccess: () => router.refresh(),
  });

  const setLocale = useMutation({
    mutationFn: async (locale: string) => {
      await apiPost("/api/me/locale", { locale });
    },
    onSuccess: () => router.refresh(),
  });

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const quickCreates = [
    session.permissions.includes("customers.create") && { label: t("customers.new"), href: "/customers?new=1" },
    session.permissions.includes("products.create") && { label: t("products.new"), href: "/products?new=1" },
    session.permissions.includes("quotes.create") && { label: t("sales.newQuote"), href: "/sales/quotes?new=1" },
    session.permissions.includes("sales.create") && { label: t("sales.new"), href: "/sales/orders?new=1" },
    session.permissions.includes("purchasing.create") && { label: t("purchasing.new"), href: "/purchasing/orders?new=1" },
    session.permissions.includes("invoices.create") && { label: t("invoices.new"), href: "/sales/invoices?new=1" },
    session.permissions.includes("production.create") && { label: t("production.new"), href: "/production/orders?new=1" },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <>
      <header className="no-print sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur">
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onMenuClick} aria-label="Open menu">
          <Menu size={16} />
        </Button>

        {/* Global search / command palette trigger */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border bg-muted/50 px-3 text-left text-[13px] text-muted-foreground hover:border-ring hover:bg-accent"
        >
          <Search size={14} />
          <span className="flex-1 truncate">{t("common.searchPlaceholder")}</span>
          <kbd className="hidden rounded border bg-card px-1.5 py-0.5 font-mono text-2xs sm:block">⌘K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          {/* Quick create */}
          {quickCreates.length > 0 && (
            <Dropdown
              trigger={
                <Button size="sm" className="hidden sm:inline-flex">
                  <Plus size={14} /> {t("common.quickCreate")}
                </Button>
              }
            >
              {(close) => (
                <>
                  {quickCreates.map((qc) => (
                    <DropdownItem
                      key={qc.href}
                      onClick={() => {
                        close();
                        router.push(qc.href);
                      }}
                    >
                      <Plus size={12} /> {qc.label}
                    </DropdownItem>
                  ))}
                </>
              )}
            </Dropdown>
          )}

          {/* Language */}
          <Dropdown
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Language">
                <Globe size={15} />
              </Button>
            }
          >
            {(close) => (
              <>
                {LOCALES.map((l) => (
                  <DropdownItem
                    key={l.code}
                    onClick={() => {
                      close();
                      setLocale.mutate(l.code);
                    }}
                  >
                    <span className="flex w-full items-center justify-between">
                      {t(`lang.${l.code}`)}
                      {session.user && null}
                    </span>
                  </DropdownItem>
                ))}
              </>
            )}
          </Dropdown>

          {/* Theme */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </Button>

          {/* Notifications */}
          <Dropdown
            className="w-96"
            trigger={
              <button
                className="relative rounded-md p-1.5 hover:bg-accent"
                aria-label={t("notifications.title")}
              >
                <Bell size={16} />
                {(notifications?.unread ?? 0) > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                    {notifications!.unread > 9 ? "9+" : notifications!.unread}
                  </span>
                )}
              </button>
            }
          >
            {(close) => (
              <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-xs font-semibold">{t("notifications.title")}</span>
                  <button
                    className="text-2xs text-primary hover:underline"
                    onClick={() => {
                      close();
                      router.push("/notifications");
                    }}
                  >
                    {t("notifications.viewAll")}
                  </button>
                </div>
                {(notifications?.items ?? []).length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("notifications.empty")}</p>
                )}
                {(notifications?.items ?? []).map((n) => (
                  <button
                    key={n.id}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left last:border-0 hover:bg-accent/60",
                      !n.readAt && "bg-primary/[0.04]"
                    )}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate(n.id);
                      close();
                      if (n.entityType === "SalesOrder" && n.entityId) router.push(`/sales/orders/${n.entityId}`);
                      else if (n.entityType === "Invoice" && n.entityId) router.push(`/sales/invoices/${n.entityId}`);
                      else if (n.entityType === "PurchaseOrder" && n.entityId) router.push(`/purchasing/orders/${n.entityId}`);
                      else if (n.entityType === "ProductionOrder" && n.entityId) router.push(`/production/orders/${n.entityId}`);
                      else router.push("/notifications");
                    }}
                  >
                    <span className="flex w-full items-center gap-1.5">
                      {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                      <span className={cn("text-xs", n.priority === "URGENT" && "font-semibold text-danger")}>{n.title}</span>
                      <span className="ml-auto whitespace-nowrap text-2xs text-muted-foreground">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    {n.body && <span className="line-clamp-2 text-2xs text-muted-foreground">{n.body}</span>}
                  </button>
                ))}
              </div>
            )}
          </Dropdown>

          {/* Company switcher */}
          {session.companies.length > 1 && (
            <Dropdown
              trigger={
                <button className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent">
                  <Building2 size={13} />
                  <span className="hidden max-w-32 truncate md:inline">
                    {session.company.tradingName ?? session.company.legalName}
                  </span>
                  <ChevronDown size={12} />
                </button>
              }
            >
              {(close) => (
                <>
                  <p className="px-3 pb-1 pt-1.5 text-2xs font-semibold uppercase text-muted-foreground">
                    {t("company.switch")}
                  </p>
                  {session.companies.map((c) => (
                    <DropdownItem
                      key={c.id}
                      onClick={() => {
                        close();
                        switchCompany.mutate(c.id);
                      }}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate">{c.name}</span>
                        {c.id === session.company.id && <Check size={13} className="text-success" />}
                      </span>
                    </DropdownItem>
                  ))}
                </>
              )}
            </Dropdown>
          )}

          {/* User menu */}
          <Dropdown
            trigger={
              <button className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent" aria-label="User menu">
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-primary/15 text-2xs font-semibold text-primary">
                  {initials(session.user.name)}
                </span>
                <span className="hidden text-xs font-medium md:inline">{session.user.name.split(" ")[0]}</span>
                <ChevronDown size={12} className="hidden text-muted-foreground md:block" />
              </button>
            }
          >
            {(close) => (
              <>
                <div className="border-b px-3 py-2">
                  <p className="text-xs font-semibold">{session.user.name}</p>
                  <p className="text-2xs text-muted-foreground">{session.user.email}</p>
                  <p className="mt-1 text-2xs text-muted-foreground">{session.role.name}</p>
                </div>
                <DropdownItem
                  onClick={() => {
                    close();
                    router.push("/settings");
                  }}
                >
                  <UserCircle2 size={13} /> {t("user.profile")}
                </DropdownItem>
                <DropdownItem
                  onClick={() => {
                    close();
                    router.push("/settings");
                  }}
                >
                  <SettingsIcon size={13} /> {t("user.settings")}
                </DropdownItem>
                <div className="my-1 border-t" />
                <DropdownItem onClick={logout} danger>
                  <LogOut size={13} /> {t("user.signOut")}
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

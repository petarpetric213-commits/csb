"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/providers";
import { apiPost, ApiClientError } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Field, Input, Checkbox } from "@/components/ui/form";
import { Languages } from "lucide-react";
import { LOCALES } from "@/lib/i18n";
import { useMutation } from "@tanstack/react-query";

export default function LoginPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: () => apiPost("/api/auth/login", { email, password, remember }),
    onSuccess: () => {
      router.push("/dashboard");
      router.refresh();
    },
    onError: (e: any) => {
      setError(e instanceof ApiClientError ? e.message : t("common.error"));
    },
  });

  const setLocale = useMutation({
    mutationFn: (l: string) => apiPost("/api/me/locale", { locale: l }),
    onSuccess: () => router.refresh(),
  });

  return (
    <div className="grid overflow-hidden rounded-xl border bg-card shadow-lg lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden flex-col justify-between bg-gradient-to-br from-primary to-primary/80 p-10 text-primary-foreground lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-lg font-bold backdrop-blur">N</div>
            <div>
              <p className="text-lg font-bold tracking-tight">NEXORA ERP</p>
              <p className="text-xs opacity-80">{t("app.tagline")}</p>
            </div>
          </div>
        </div>
        <div className="space-y-4 text-sm opacity-90">
          <p className="text-base font-medium leading-snug">
            Sales · Purchasing · Inventory · Production · Quality · Logistics · Finance
          </p>
          <ul className="space-y-1.5 text-xs opacity-80">
            <li>• Real business workflows with full audit trail</li>
            <li>• Role-based access control, multi-company</li>
            <li>• Material planning (MRP) and BOM management</li>
          </ul>
        </div>
        <p className="text-2xs opacity-60">© {new Date().getFullYear()} NEXORA — original product inspired by German ERP concepts</p>
      </div>

      {/* Form panel */}
      <div className="p-8 lg:p-10">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t("auth.signIn")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("auth.signInTo")}</p>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Languages size={14} />
            {LOCALES.filter((l) => l.code !== locale).map((l) => (
              <button
                key={l.code}
                onClick={() => setLocale.mutate(l.code)}
                className="rounded px-1.5 py-0.5 text-2xs font-medium uppercase hover:bg-accent hover:text-foreground"
              >
                {l.code}
              </button>
            ))}
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            login.mutate();
          }}
        >
          <Field label={t("common.email")} required>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </Field>
          <Field label={t("auth.password")} required error={error ?? undefined}>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              {t("auth.rememberMe")}
            </label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              {t("auth.forgotPassword")}
            </Link>
          </div>

          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? t("common.loading") : t("auth.signIn")}
          </Button>
        </form>

        <div className="mt-4 rounded-lg border border-dashed bg-muted/40 p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{t("auth.demoTitle")}</p>
          <p className="mt-1 text-2xs text-muted-foreground">{t("auth.demoHint")}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-2xs">
            {[
              ["admin@example.com", "Super Admin"],
              ["verkauf@nexora.demo", "Sales"],
              ["einkauf@nexora.demo", "Purchasing"],
              ["lager@nexora.demo", "Warehouse"],
              ["produktion@nexora.demo", "Production"],
              ["finanzen@nexora.demo", "Finance"],
            ].map(([email2, role]) => (
              <button
                key={email2}
                type="button"
                onClick={() => {
                  setEmail(email2);
                  setPassword("demo1234");
                }}
                className="rounded border bg-card px-2 py-1 text-left font-mono hover:border-ring hover:bg-accent"
              >
                {email2}
                <span className="ml-1 font-sans text-muted-foreground">({role})</span>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {t("auth.register")}
          </Link>
        </p>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiPost, ApiClientError } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export default function RegisterPage() {
  const t = useI18n().t;
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "" });
  const [error, setError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: () => apiPost("/api/auth/register", form),
    onSuccess: () => {
      router.push("/dashboard");
      router.refresh();
    },
    onError: (e: any) => setError(e instanceof ApiClientError ? e.message : t("common.error")),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
      <h1 className="text-xl font-semibold tracking-tight">{t("auth.registerTitle")}</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">{t("auth.registerHint")}</p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          register.mutate();
        }}
      >
        <Field label={t("auth.companyName")} required>
          <Input required value={form.companyName} onChange={set("companyName")} placeholder="Meine Firma GmbH" />
        </Field>
        <Field label={t("auth.fullName")} required>
          <Input required value={form.name} onChange={set("name")} placeholder="Max Mustermann" />
        </Field>
        <Field label={t("common.email")} required>
          <Input type="email" required autoComplete="email" value={form.email} onChange={set("email")} placeholder="max@firma.de" />
        </Field>
        <Field label={t("auth.password")} required hint="Min. 8 characters" error={error ?? undefined}>
          <Input type="password" required autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} />
        </Field>
        <Button type="submit" className="w-full" disabled={register.isPending}>
          {register.isPending ? t("common.loading") : t("auth.createAccount")}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </div>
  );
}

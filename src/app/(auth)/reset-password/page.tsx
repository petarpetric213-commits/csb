"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiPost, ApiClientError } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

function ResetForm() {
  const t = useI18n().t;
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: () => apiPost("/api/auth/reset-password", { token, password }),
    onSuccess: () => {
      router.push("/login");
    },
    onError: (e: any) => setError(e instanceof ApiClientError ? e.message : t("common.error")),
  });

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
      <h1 className="text-xl font-semibold tracking-tight">{t("auth.resetTitle")}</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">{t("auth.newPassword")}</p>

      {!token ? (
        <p className="mt-6 rounded-md border border-warning/30 bg-warning-bg p-3 text-xs text-warning">
          Missing reset token. Use the link from your email.{" "}
          <Link href="/forgot-password" className="underline">
            Request a new one
          </Link>
          .
        </p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            reset.mutate();
          }}
        >
          <Field label={t("auth.newPassword")} required hint="Min. 8 characters" error={error ?? undefined}>
            <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={reset.isPending}>
            {reset.isPending ? t("common.loading") : t("auth.setPassword")}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

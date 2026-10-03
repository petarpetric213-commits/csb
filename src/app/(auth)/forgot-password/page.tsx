"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useI18n } from "@/components/providers";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export default function ForgotPasswordPage() {
  const t = useI18n().t;
  const [email, setEmail] = useState("");
  const [devLink, setDevLink] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: () => apiPost<{ resetUrl?: string }>("/api/auth/forgot-password", { email }),
    onSuccess: (data) => setDevLink(data?.resetUrl ?? null),
  });

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
      <h1 className="text-xl font-semibold tracking-tight">{t("auth.resetTitle")}</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">{t("auth.resetHint")}</p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          request.mutate();
        }}
      >
        <Field label={t("common.email")} required>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={request.isPending}>
          {request.isPending ? t("common.loading") : t("auth.sendResetLink")}
        </Button>
      </form>

      {request.isSuccess && (
        <div className="mt-4 rounded-md border border-info/30 bg-info-bg p-3 text-xs text-info">
          <p>{t("auth.resetSent")}</p>
          {devLink && (
            <p className="mt-2 break-all">
              <span className="font-semibold">Demo mode:</span>{" "}
              <Link href={devLink} className="font-mono underline">
                {devLink}
              </Link>
            </p>
          )}
        </div>
      )}

      <p className="mt-5 text-center text-xs text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          ← {t("auth.signIn")}
        </Link>
      </p>
    </div>
  );
}

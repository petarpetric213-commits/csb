"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { getDictionary, translate, type Dictionary, type Locale } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// i18n context
// ---------------------------------------------------------------------------
const I18nContext = createContext<{ locale: Locale; dict: Dictionary; t: (key: string, params?: Record<string, string | number>) => string }>({
  locale: "en",
  dict: {} as Dictionary,
  t: (k) => k,
});

export function useI18n() {
  return useContext(I18nContext);
}

// ---------------------------------------------------------------------------
// Toast context
// ---------------------------------------------------------------------------
type Toast = { id: number; kind: "success" | "error" | "info"; message: string };
const ToastContext = createContext<{
  toast: (kind: Toast["kind"], message: string) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Confirm dialog context
// ---------------------------------------------------------------------------
const ConfirmContext = createContext<{
  confirm: (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
}>({ confirm: async () => false });

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function Providers({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: Locale;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: (failureCount, error: any) => {
              if (error?.status === 401 || error?.status === 403 || error?.status === 404) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const dict = getDictionary(locale);
  const fallback = getDictionary("en");
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(dict, fallback, key, params),
    [dict, fallback]
  );

  // ---- toasts ----
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-4), { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  }, []);

  // ---- confirm dialog ----
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger: boolean;
    resolve: (v: boolean) => void;
  }>({ open: false, title: "", message: "", confirmLabel: "", danger: false, resolve: () => {} });

  const confirm = useCallback(
    (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({
          open: true,
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel ?? opts.title,
          danger: opts.danger ?? true,
          resolve,
        });
      }),
    []
  );

  const closeConfirm = (result: boolean) => {
    confirmState.resolve(result);
    setConfirmState((s) => ({ ...s, open: false }));
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        <I18nContext.Provider value={{ locale, dict, t }}>
          <ToastContext.Provider value={{ toast }}>
            <ConfirmContext.Provider value={{ confirm }}>
              {children}
              {/* Toast viewport */}
              <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
                {toasts.map((x) => (
                  <div
                    key={x.id}
                    role="status"
                    className={`pointer-events-auto rounded-md border px-3.5 py-2.5 text-[13px] shadow-lg ${
                      x.kind === "success"
                        ? "border-success/30 bg-success-bg text-success"
                        : x.kind === "error"
                          ? "border-danger/30 bg-danger-bg text-danger"
                          : "border-info/30 bg-info-bg text-info"
                    }`}
                  >
                    {x.message}
                  </div>
                ))}
              </div>
              {/* Confirm dialog */}
              {confirmState.open && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
                  <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl">
                    <h3 className="text-[15px] font-semibold">{confirmState.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{confirmState.message}</p>
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        className="rounded-md border px-3 py-1.5 text-[13px] font-medium hover:bg-accent"
                        onClick={() => closeConfirm(false)}
                        autoFocus
                      >
                        Cancel
                      </button>
                      <button
                        className={`rounded-md px-3 py-1.5 text-[13px] font-medium text-white ${
                          confirmState.danger ? "bg-danger hover:bg-danger/90" : "bg-primary hover:bg-primary/90"
                        }`}
                        onClick={() => closeConfirm(true)}
                      >
                        {confirmState.confirmLabel}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </ConfirmContext.Provider>
          </ToastContext.Provider>
        </I18nContext.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

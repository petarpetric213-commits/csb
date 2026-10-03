"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** URL-driven list state: page/pageSize/sorting/q + arbitrary extra filters.
 *  Keeps pagination in the URL so links/back-button work. */
export function useListQuery(defaults?: { pageSize?: number; sorting?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, parseInt(params.get("pageSize") ?? String(defaults?.pageSize ?? 25), 10) || 25);
  const sorting = params.get("sorting") ?? defaults?.sorting ?? "";
  const q = params.get("q") ?? "";

  const setParams = useCallback(
    (updates: Record<string, string | null>, opts?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (opts?.resetPage !== false && ("page" in updates ? false : true) && !("page" in updates)) {
        // any filter change resets to page 1 unless the update IS the page
      }
      if (!("page" in updates) && Object.keys(updates).some((k) => k !== "page")) {
        next.delete("page");
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const onPageChange = useCallback(
    (p: number, ps: number) => setParams({ page: String(p), pageSize: ps === 25 ? null : String(ps) }),
    [setParams]
  );
  const onSortingChange = useCallback(
    (s: { id: string; desc: boolean }[]) => setParams({ sorting: s[0] ? `${s[0].id}:${s[0].desc ? "desc" : "asc"}` : null }),
    [setParams]
  );
  const onSearch = useCallback((value: string) => setParams({ q: value || null }), [setParams]);
  const setFilter = useCallback((key: string, value: string | null) => setParams({ [key]: value || null }), [setParams]);

  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    params.forEach((v, k) => {
      if (!["page", "pageSize", "sorting", "q", "new"].includes(k)) out[k] = v;
    });
    return out;
  }, [params]);

  return { page, pageSize, sorting, q, onPageChange, onSortingChange, onSearch, setFilter, filters, params, setParams };
}

/** Open a create dialog when the URL contains ?new=1 (quick-create links). */
export function useCreateParam(onDetected?: () => void) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isNew = params.get("new") === "1";

  useEffect(() => {
    if (isNew) onDetected?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  const clearCreateParam = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("new");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  return { isNew, clearCreateParam };
}

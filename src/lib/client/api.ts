"use client";

// Typed fetch wrapper for the NEXORA API. Consistent error envelope:
// { error: { code, message, details? } }

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: { path: string; message: string }[];

  constructor(status: number, code: string, message: string, details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field errors keyed by path, for form display. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details) {
        if (d?.path && d?.message) out[d.path] = d.message;
      }
    }
    return out;
  }
}

async function parse<T>(res: Response): Promise<T> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = body?.error;
    throw new ApiClientError(
      res.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? `Request failed (${res.status})`,
      err?.details
    );
  }
  return body?.data as T;
}

export async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, credentials: "same-origin" });
  return parse<T>(res);
}

/** GET a paginated list: builds the query string and merges `meta`
 *  (total, page, pageCount, plus any extra counters) into the result. */
export async function apiList<T>(
  url: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  signal?: AbortSignal
): Promise<Paginated<T> & Record<string, unknown>> {
  const query = params ? qs(params) : "";
  const res = await fetch(url + query, { signal, credentials: "same-origin" });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = body?.error;
    throw new ApiClientError(res.status, err?.code ?? "UNKNOWN", err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  const meta = body?.meta ?? {};
  return {
    items: (body?.data ?? []) as T[],
    total: meta.total ?? 0,
    page: meta.page ?? 1,
    pageSize: meta.pageSize ?? 25,
    pageCount: meta.pageCount ?? 1,
    ...meta,
  };
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse<T>(res);
}

export const apiPost = <T>(url: string, body?: unknown) => apiSend<T>(url, "POST", body);
export const apiPatch = <T>(url: string, body?: unknown) => apiSend<T>(url, "PATCH", body);
export const apiDelete = <T>(url: string) => apiSend<T>(url, "DELETE");

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number; pageCount: number };

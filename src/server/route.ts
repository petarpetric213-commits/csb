import { NextRequest, NextResponse } from "next/server";
import { ZodType } from "zod";
import { getSession, SessionContext, clientIp, rateLimit } from "@/server/auth";
import { ApiError } from "@/server/errors";

export type RouteContext = {
  req: NextRequest;
  session: SessionContext;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  ip: string;
};

type RouteOptions = {
  /** Required permission, e.g. "customers.read". Omit for public routes. */
  permission?: string;
  /** Zod schema validating the request body. */
  schema?: ZodType;
  /** Extra permission — the user must hold at least ONE of permission/anyOf. */
  anyOf?: string[];
  /** Apply in-memory rate limiting: max requests per window. */
  rateLimit?: { max: number; windowMs: number; key?: string };
  /** Set true for auth endpoints (no session required). */
  public?: boolean;
};

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function okPaginated(
  items: unknown[],
  total: number,
  page: number,
  pageSize: number
): NextResponse {
  return NextResponse.json({
    data: items,
    meta: { total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
  });
}

/**
 * Wraps a route handler with:
 *  - session resolution (401)
 *  - server-side permission check (403)
 *  - body validation via Zod (400 with field details)
 *  - CSRF origin verification for state-changing methods
 *  - rate limiting (option)
 *  - centralized error envelope
 */
export function route(
  options: RouteOptions,
  handler: (ctx: RouteContext) => Promise<NextResponse | Response>
) {
  return async function (req: NextRequest, routeCtx?: { params?: Promise<Record<string,string>> | Record<string,string> }) {
    try {
      const method = req.method.toUpperCase();
      const ip = clientIp(req);

      // ---- Rate limiting ----
      if (options.rateLimit) {
        const key = `${options.rateLimit.key ?? req.nextUrl.pathname}:${ip}`;
        const allowed = rateLimit(key, options.rateLimit.max, options.rateLimit.windowMs);
        if (!allowed) {
          return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } },
            { status: 429 }
          );
        }
      }

      // ---- CSRF: for mutations, Origin (when present) must match Host ----
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const origin = req.headers.get("origin");
        if (origin) {
          const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
          try {
            const originHost = new URL(origin).host;
            if (host && originHost !== host) {
              return NextResponse.json(
                { error: { code: "CSRF", message: "Cross-origin request rejected." } },
                { status: 403 }
              );
            }
          } catch {
            /* malformed origin — ignore */
          }
        }
      }

      // ---- Session ----
      const session = await getSession(req);
      if (!options.public && !session) {
        return NextResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
          { status: 401 }
        );
      }

      // ---- Authorization ----
      if (session && options.permission) {
        const perms = new Set(session.permissions);
        const required = [options.permission, ...(options.anyOf ?? [])];
        if (!required.some((p) => perms.has(p))) {
          return NextResponse.json(
            {
              error: {
                code: "FORBIDDEN",
                message: `Missing permission: ${options.permission}. Contact your administrator.`,
              },
            },
            { status: 403 }
          );
        }
      }

      // ---- Body validation ----
      let body: any = undefined;
      if (!["GET", "HEAD", "DELETE"].includes(method)) {
        const raw = await req.json().catch(() => ({}));
        if (options.schema) {
          const parsed = options.schema.safeParse(raw);
          if (!parsed.success) {
            return NextResponse.json(
              {
                error: {
                  code: "VALIDATION",
                  message: "Please correct the highlighted fields.",
                  details: parsed.error.issues.map((i) => ({
                    path: i.path.join("."),
                    message: i.message,
                  })),
                },
              },
              { status: 400 }
            );
          }
          body = parsed.data;
        } else {
          body = raw;
        }
      }

      // ---- Route params (Next 14 may deliver a promise) ----
      let params: Record<string, string> = {};
      if (routeCtx?.params) {
        params =
          routeCtx.params instanceof Promise
            ? await routeCtx.params
            : (routeCtx.params as Record<string, string>);
      }

      return await handler({
        req,
        session: session as SessionContext,
        params,
        query: req.nextUrl.searchParams,
        body,
        ip,
      });
    } catch (err: any) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message, details: err.details } },
          { status: err.status }
        );
      }
      // Structured server error — never leak raw DB errors to the client.
      console.error(`[API ${req.method} ${req.nextUrl.pathname}]`, err);
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "An unexpected error occurred. The incident was logged." } },
        { status: 500 }
      );
    }
  };
}

/** Pagination params helper. */
export function pagination(query: URLSearchParams, defaultSize = 25) {
  const page = Math.max(1, parseInt(query.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(query.get("pageSize") ?? String(defaultSize), 10) || defaultSize)
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

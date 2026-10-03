import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { ApiError } from "@/server/errors";

export const SESSION_COOKIE = "nexora_session";
const SESSION_TTL_HOURS = 24 * 7; // 7 days
const REMEMBER_TTL_HOURS = 24 * 30; // 30 days with "remember me"

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 11);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export type SessionContext = {
  user: { id: string; email: string; name: string; locale: string };
  companyId: string;
  company: { id: string; legalName: string; tradingName: string | null; currency: string; locale: string; isDemo: boolean };
  membershipId: string;
  role: { id: string; key: string; name: string };
  permissions: string[];
  sessionId: string;
};

/** Create a DB session and return the raw token (to be set as cookie). */
export async function createSession(
  userId: string,
  companyId: string | null,
  opts: { ip?: string; userAgent?: string; remember?: boolean } = {}
): Promise<string> {
  const token = generateToken();
  const ttlMs = (opts.remember ? REMEMBER_TTL_HOURS : SESSION_TTL_HOURS) * 3600 * 1000;
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      companyId,
      expiresAt: new Date(Date.now() + ttlMs),
      ip: opts.ip,
      userAgent: opts.userAgent?.slice(0, 250),
    },
  });
  return token;
}

export function sessionCookieOptions(token: string, remember = false) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: (remember ? REMEMBER_TTL_HOURS : SESSION_TTL_HOURS) * 3600,
  };
}

/** Resolve the current session from cookies. Works in route handlers and RSC. */
export async function getSession(req?: NextRequest): Promise<SessionContext | null> {
  let token: string | undefined;
  if (req) {
    token = req.cookies.get(SESSION_COOKIE)?.value;
  } else {
    const store = cookies();
    token = store.get(SESSION_COOKIE)?.value;
  }
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;

  const memberships = await prisma.userCompany.findMany({
    where: { userId: session.userId },
    include: { role: { include: { permissions: true } }, company: true },
  });
  if (memberships.length === 0) return null;

  const active =
    memberships.find((m) => m.companyId === session.companyId) ?? memberships[0];

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      locale: session.user.locale,
    },
    companyId: active.companyId,
    company: {
      id: active.company.id,
      legalName: active.company.legalName,
      tradingName: active.company.tradingName,
      currency: active.company.currency,
      locale: active.company.locale,
      isDemo: active.company.isDemo,
    },
    membershipId: active.id,
    role: { id: active.role.id, key: active.role.key, name: active.role.name },
    permissions: active.role.permissions.map((p) => p.permission),
    sessionId: session.id,
  };
}

/** Switch the active company of the current session. */
export async function switchCompany(sessionId: string, userId: string, companyId: string) {
  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  if (!membership) {
    throw ApiError.forbidden("You are not a member of this company.");
  }
  await prisma.session.update({ where: { id: sessionId }, data: { companyId } });
}

/** Simple in-memory rate limiter (per process). Production: Redis. */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

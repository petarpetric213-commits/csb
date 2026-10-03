import { NextResponse } from "next/server";
import { z } from "zod";
import { route, ok } from "@/server/route";
import { verifyPassword, createSession, sessionCookieOptions, clientIp } from "@/server/auth";
import prisma from "@/lib/db";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional().default(false),
});

export const POST = route(
  { public: true, schema, rateLimit: { max: 10, windowMs: 60_000, key: "login" } },
  async ({ body, req, ip }) => {
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } },
        { status: 401 }
      );
    }
    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } },
        { status: 401 }
      );
    }

    const membership = await prisma.userCompany.findFirst({
      where: { userId: user.id, isDefault: true },
    }) ?? await prisma.userCompany.findFirst({ where: { userId: user.id } });

    const token = await createSession(user.id, membership?.companyId ?? null, {
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
      remember: body.remember,
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const res = ok({ id: user.id, name: user.name, email: user.email });
    res.cookies.set(sessionCookieOptions(token, body.remember));
    return res;
  }
);

import { NextResponse } from "next/server";
import { z } from "zod";
import { route, ok } from "@/server/route";
import { hashToken, hashPassword } from "@/server/auth";
import prisma from "@/lib/db";

const schema = z.object({ token: z.string().min(10), password: z.string().min(8).max(100) });

export const POST = route(
  { public: true, schema, rateLimit: { max: 10, windowMs: 60_000, key: "reset" } },
  async ({ body }) => {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(body.token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return NextResponse.json(
        { error: { code: "INVALID_TOKEN", message: "This reset link is invalid or has expired. Please request a new one." } },
        { status: 400 }
      );
    }
    const passwordHash = await hashPassword(body.password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Invalidate all sessions of this user (security).
      prisma.session.deleteMany({ where: { userId: record.userId } }),
    ]);
    return ok({ reset: true });
  }
);

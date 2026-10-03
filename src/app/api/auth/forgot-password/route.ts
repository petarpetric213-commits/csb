import { NextResponse } from "next/server";
import { z } from "zod";
import { route, ok } from "@/server/route";
import { generateToken, hashToken } from "@/server/auth";
import prisma from "@/lib/db";
import { sendEmail, EMAIL_TEMPLATES } from "@/server/services/email";

const schema = z.object({ email: z.string().email() });

export const POST = route(
  { public: true, schema, rateLimit: { max: 5, windowMs: 60_000, key: "forgot" } },
  async ({ body }) => {
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    // Never reveal whether the address exists.
    if (!user) return ok({ requested: true });

    const token = generateToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const membership = await prisma.userCompany.findFirst({ where: { userId: user.id } });
    const resetUrl = `/reset-password?token=${token}`;

    if (membership) {
      await sendEmail(prisma, {
        companyId: membership.companyId,
        to: user.email,
        template: EMAIL_TEMPLATES.PASSWORD_RESET,
        subject: "Reset your NEXORA ERP password",
        body: `Hello ${user.name},\n\nUse this link within 60 minutes to reset your password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      });
    }

    // Demo mode convenience: return the link so it can be opened without an
    // email provider (clearly a demo-only affordance).
    const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
    return ok({ requested: true, ...(demo ? { resetUrl } : {}) });
  }
);

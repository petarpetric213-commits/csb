// ============================================================================
// Email service abstraction.
// The default transport only LOGS (DB EmailLog + console) — no provider is
// hardcoded. To integrate a real provider, implement EmailTransport and
// register it in getTransport(). See ARCHITECTURE.md.
// ============================================================================

import prisma from "@/lib/db";
import type { Prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient | typeof prisma;

export interface EmailTransport {
  name: string;
  send(p: { to: string; subject: string; body: string }): Promise<{ ok: boolean; error?: string }>;
}

class LogTransport implements EmailTransport {
  name = "log";
  async send(p: { to: string; subject: string; body: string }) {
    console.log(`[email:log] to=${p.to} subject="${p.subject}"`);
    return { ok: true };
  }
}

let configuredTransport: EmailTransport | null = null;

export function getTransport(): EmailTransport {
  if (configuredTransport) return configuredTransport;
  // Future: switch on process.env.EMAIL_PROVIDER (smtp | resend | sendgrid …)
  configuredTransport = new LogTransport();
  return configuredTransport;
}

export function registerTransport(t: EmailTransport) {
  configuredTransport = t;
}

export const EMAIL_TEMPLATES = {
  WELCOME: "welcome",
  PASSWORD_RESET: "password_reset",
  EMAIL_VERIFICATION: "email_verification",
  INVOICE_ISSUED: "invoice_issued",
  ORDER_CONFIRMATION: "order_confirmation",
  SHIPMENT_NOTIFICATION: "shipment_notification",
  LOW_STOCK_ALERT: "low_stock_alert",
  PRODUCTION_ALERT: "production_alert",
} as const;

export async function sendEmail(
  tx: Tx,
  p: { companyId: string; to: string; template: string; subject: string; body: string }
) {
  const transport = getTransport();
  let status = "LOGGED";
  let sentAt: Date | null = null;
  try {
    const result = await transport.send({ to: p.to, subject: p.subject, body: p.body });
    if (result.ok) {
      status = "SENT";
      sentAt = new Date();
    } else {
      status = "FAILED";
    }
  } catch {
    status = "FAILED";
  }
  await tx.emailLog.create({
    data: {
      companyId: p.companyId,
      toEmail: p.to,
      template: p.template,
      subject: p.subject,
      body: p.body,
      status,
      sentAt,
    },
  });
}

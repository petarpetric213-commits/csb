import { NextResponse } from "next/server";
import { z } from "zod";
import { route, ok } from "@/server/route";
import {
  hashPassword, createSession, sessionCookieOptions, clientIp,
} from "@/server/auth";
import prisma from "@/lib/db";
import { ROLE_DEFINITIONS } from "@/lib/permissions";
import { logAudit } from "@/server/audit";
import { sendEmail, EMAIL_TEMPLATES } from "@/server/services/email";

const schema = z.object({
  companyName: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

/** Register a new company + its administrator. Seeds default roles,
 *  a default warehouse and starter settings for the new tenant. */
export const POST = route(
  { public: true, schema, rateLimit: { max: 5, windowMs: 60_000, key: "register" } },
  async ({ body, req, ip }) => {
    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: { code: "EMAIL_TAKEN", message: "An account with this email already exists." } },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(body.password);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { legalName: body.companyName, tradingName: body.companyName, country: "DE" },
      });

      // Seed system roles for the new tenant
      const roles = [];
      for (const def of ROLE_DEFINITIONS) {
        const role = await tx.role.create({
          data: {
            companyId: company.id,
            key: def.key,
            name: def.name,
            description: def.description,
            isSystem: true,
            permissions: { create: def.permissions.map((p) => ({ permission: p })) },
          },
        });
        roles.push(role);
      }
      const adminRole = roles.find((r) => r.key === "COMPANY_ADMIN")!;

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: body.name,
          emailVerifiedAt: new Date(), // demo: auto-verified (architecture supports verification emails)
        },
      });

      const employee = await tx.employee.create({
        data: {
          companyId: company.id,
          employeeNumber: "MA-0001",
          firstName: body.name.split(" ")[0],
          lastName: body.name.split(" ").slice(1).join(" ") || "—",
          email,
          department: "Management",
          position: "Administrator",
          startDate: new Date(),
        },
      });

      await tx.userCompany.create({
        data: { userId: user.id, companyId: company.id, roleId: adminRole.id, employeeId: employee.id, isDefault: true },
      });

      // Starter data: default warehouse
      const warehouse = await tx.warehouse.create({
        data: { companyId: company.id, code: "WH01", name: "Hauptlager", city: "", isDefault: true },
      });

      await tx.setting.createMany({
        data: [
          { companyId: company.id, key: "ui.defaultWarehouse", value: warehouse.id },
          { companyId: company.id, key: "notifications.lowStock", value: "true" },
        ],
      });

      await logAudit(tx, {
        companyId: company.id,
        userId: user.id,
        action: "CREATED",
        entityType: "Company",
        entityId: company.id,
        summary: `Company "${company.legalName}" registered`,
        after: { legalName: company.legalName },
      });

      await sendEmail(tx, {
        companyId: company.id,
        to: email,
        template: EMAIL_TEMPLATES.WELCOME,
        subject: `Welcome to NEXORA ERP — ${company.legalName}`,
        body: `Hello ${body.name},\n\nYour company workspace "${company.legalName}" is ready. You are signed in as Company Administrator.`,
      });

      return { user, company };
    });

    const token = await createSession(result.user.id, result.company.id, {
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    const res = ok({ id: result.user.id, companyId: result.company.id });
    res.cookies.set(sessionCookieOptions(token));
    return res;
  }
);

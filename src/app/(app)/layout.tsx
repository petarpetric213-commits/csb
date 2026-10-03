import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import prisma from "@/lib/db";
import { SessionProvider } from "@/lib/client/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const memberships = await prisma.userCompany.findMany({
    where: { userId: session.user.id },
    include: { company: { select: { id: true, legalName: true, tradingName: true, isDemo: true } } },
  });

  const sessionInfo = {
    user: session.user,
    company: {
      id: session.company.id,
      legalName: session.company.legalName,
      tradingName: session.company.tradingName,
      currency: session.company.currency,
      isDemo: session.company.isDemo,
    },
    companies: memberships.map((m) => ({
      id: m.company.id,
      name: m.company.tradingName ?? m.company.legalName,
      isDemo: m.company.isDemo,
    })),
    role: session.role,
    permissions: session.permissions,
  };

  return (
    <SessionProvider session={sessionInfo}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}

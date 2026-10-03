"use client";

import React, { createContext, useContext } from "react";

export type SessionInfo = {
  user: { id: string; email: string; name: string };
  company: { id: string; legalName: string; tradingName: string | null; currency: string; isDemo: boolean };
  companies: { id: string; name: string; isDemo: boolean }[];
  role: { key: string; name: string };
  permissions: string[];
};

const SessionContext = createContext<{
  session: SessionInfo;
  has: (permission: string) => boolean;
  hasAny: (permissions: string[]) => boolean;
}>({ session: null as unknown as SessionInfo, has: () => false, hasAny: () => false });

export function useSession() {
  return useContext(SessionContext);
}

export function usePermission() {
  return useContext(SessionContext).has;
}

export function SessionProvider({
  session,
  children,
}: {
  session: SessionInfo;
  children: React.ReactNode;
}) {
  const permSet = new Set(session.permissions);
  const has = (p: string) => permSet.has(p);
  const hasAny = (ps: string[]) => ps.some((p) => permSet.has(p));
  return <SessionContext.Provider value={{ session, has, hasAny }}>{children}</SessionContext.Provider>;
}

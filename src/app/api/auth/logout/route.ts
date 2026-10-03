import { NextResponse } from "next/server";
import { route, ok } from "@/server/route";
import { getSession } from "@/server/auth";
import prisma from "@/lib/db";

export const POST = route({ public: true }, async ({ req }) => {
  const session = await getSession(req);
  if (session) {
    await prisma.session.deleteMany({ where: { id: session.sessionId } });
  }
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set({ name: "nexora_session", value: "", path: "/", maxAge: 0 });
  return res;
});

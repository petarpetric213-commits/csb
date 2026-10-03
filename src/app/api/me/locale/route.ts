import { z } from "zod";
import { cookies } from "next/headers";
import { route, ok } from "@/server/route";
import prisma from "@/lib/db";

const schema = z.object({ locale: z.enum(["en", "de", "sr"]) });

export const POST = route({ public: true, schema, rateLimit: { max: 30, windowMs: 60_000 } }, async ({ body }) => {
  const store = cookies();
  store.set("nexora_locale", body.locale, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  // Persist preference for signed-in users (best effort — route is public).
  const token = store.get("nexora_session")?.value;
  if (token) {
    const { createHash } = await import("crypto");
    const session = await prisma.session.findUnique({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    });
    if (session) {
      await prisma.user.update({ where: { id: session.userId }, data: { locale: body.locale } });
    }
  }
  return ok({ locale: body.locale });
});

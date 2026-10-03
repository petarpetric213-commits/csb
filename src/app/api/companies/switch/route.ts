import { z } from "zod";
import { route, ok } from "@/server/route";
import { switchCompany } from "@/server/auth";

const schema = z.object({ companyId: z.string().min(1) });

export const POST = route({ schema }, async ({ body, session }) => {
  await switchCompany(session.sessionId, session.user.id, body.companyId);
  return ok({ switched: true });
});

import { route, ok } from "@/server/route";
import { globalSearch } from "@/server/services/search";

export const GET = route({ permission: "search.read" }, async ({ session, query }) => {
  const q = query.get("q") ?? "";
  const hits = await globalSearch(session.companyId, q);
  return ok(hits);
});

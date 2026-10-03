import { route, ok } from "@/server/route";
import { computeMrp } from "@/server/services/quality";

/** Material requirements planning: shortage list with recommendations
 *  (PRODUCE if an active BOM exists, otherwise PURCHASE). */
export const GET = route({ permission: "mrp.read" }, async ({ session }) => {
  const rows = await computeMrp(session.companyId);
  return ok(rows);
});

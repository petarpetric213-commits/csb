import { route, ok } from "@/server/route";
import { runReport, reportToCsv } from "@/server/services/reports";
import { z } from "zod";

const querySchema = z.object({
  type: z.string().min(2),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const GET = route({ permission: "reports.read" }, async ({ session, query }) => {
  const params = querySchema.parse({
    type: query.get("type") ?? "salesByCustomer",
    from: query.get("from") ?? undefined,
    to: query.get("to") ?? undefined,
  });
  const report = await runReport(session.companyId, params.type, params.from, params.to);

  if (query.get("format") === "csv") {
    const csv = reportToCsv(report);
    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${params.type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }
  return ok(report);
});

import { route, ok } from "@/server/route";
import { getDashboard } from "@/server/services/dashboard";
import { markOverdueInvoices } from "@/server/services/invoicing";

export const GET = route({ permission: "dashboard.read" }, async ({ session }) => {
  // Near-real-time housekeeping: flag overdue invoices on dashboard load.
  await markOverdueInvoices(session.companyId).catch(() => 0);
  const data = await getDashboard(session.companyId);
  return ok(data);
});

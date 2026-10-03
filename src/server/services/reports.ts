// ============================================================================
// Reporting service — server-side aggregation per report type + CSV export.
// ============================================================================
import prisma from "@/lib/db";
import { round2 } from "@/lib/utils";

export type ReportRange = { from: Date; to: Date };

export type ReportResult = {
  type: string;
  title: string;
  columns: { key: string; label: string; type?: "money" | "number" | "date" | "text" }[];
  rows: Record<string, any>[];
  summary: { label: string; value: string }[];
};

function parseRange(from?: string, to?: string): ReportRange {
  const to_ = to ? new Date(to) : new Date();
  const from_ = from ? new Date(from) : new Date(to_.getTime() - 90 * 24 * 3600 * 1000);
  if (from_ > to_) from_.setTime(to_.getTime() - 7 * 24 * 3600 * 1000);
  to_.setHours(23, 59, 59, 999);
  return { from: from_, to: to_ };
}

export async function runReport(companyId: string, type: string, from?: string, to?: string): Promise<ReportResult> {
  const range = parseRange(from, to);

  if (type === "sales") {
    const orders = await prisma.salesOrder.findMany({
      where: { companyId, deletedAt: null, orderDate: { gte: range.from, lte: range.to } },
      include: { customer: true, salesRep: true },
      orderBy: { orderDate: "asc" },
    });
    const rows = orders.map((o) => ({
      orderNumber: o.orderNumber,
      date: o.orderDate,
      customer: o.customer.companyName ?? `${o.customer.firstName ?? ""} ${o.customer.lastName ?? ""}`.trim(),
      rep: o.salesRep ? `${o.salesRep.firstName} ${o.salesRep.lastName}` : "—",
      status: o.status,
      subtotal: o.subtotal,
      tax: o.taxTotal,
      total: o.total,
    }));
    const revenue = round2(orders.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + o.total, 0));
    const avg = orders.length ? round2(revenue / orders.length) : 0;
    return {
      type, title: "Sales report",
      columns: [
        { key: "orderNumber", label: "Order" }, { key: "date", label: "Date", type: "date" },
        { key: "customer", label: "Customer" }, { key: "rep", label: "Sales rep" },
        { key: "status", label: "Status" }, { key: "subtotal", label: "Subtotal", type: "money" },
        { key: "tax", label: "Tax", type: "money" }, { key: "total", label: "Total", type: "money" },
      ],
      rows,
      summary: [
        { label: "Orders", value: String(orders.length) },
        { label: "Revenue", value: revenue.toFixed(2) },
        { label: "Average order value", value: avg.toFixed(2) },
      ],
    };
  }

  if (type === "purchases") {
    const pos = await prisma.purchaseOrder.findMany({
      where: { companyId, deletedAt: null, orderDate: { gte: range.from, lte: range.to } },
      include: { supplier: true },
      orderBy: { orderDate: "asc" },
    });
    const rows = pos.map((o) => ({
      orderNumber: o.orderNumber, date: o.orderDate, supplier: o.supplier.companyName,
      status: o.status, subtotal: o.subtotal, tax: o.taxTotal, total: o.total,
    }));
    const spend = round2(pos.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + o.total, 0));
    return {
      type, title: "Purchases report",
      columns: [
        { key: "orderNumber", label: "PO" }, { key: "date", label: "Date", type: "date" },
        { key: "supplier", label: "Supplier" }, { key: "status", label: "Status" },
        { key: "subtotal", label: "Subtotal", type: "money" }, { key: "tax", label: "Tax", type: "money" },
        { key: "total", label: "Total", type: "money" },
      ],
      rows,
      summary: [
        { label: "Purchase orders", value: String(pos.length) },
        { label: "Total spend", value: spend.toFixed(2) },
      ],
    };
  }

  if (type === "inventory") {
    const items = await prisma.inventoryItem.findMany({
      where: { companyId },
      include: { product: { select: { sku: true, name: true, unit: true, purchasePrice: true, productType: true } }, warehouse: { select: { code: true, name: true } } },
    });
    const rows = items
      .filter((i) => i.physicalQty !== 0 || i.reservedQty !== 0)
      .map((i) => ({
        sku: i.product.sku, product: i.product.name, type: i.product.productType,
        warehouse: `${i.warehouse.code} — ${i.warehouse.name}`,
        physical: i.physicalQty, reserved: i.reservedQty, quarantined: i.quarantinedQty,
        available: round2(i.physicalQty - i.reservedQty),
        value: round2(i.physicalQty * (i.product.purchasePrice || 0)),
        unit: i.product.unit,
      }))
      .sort((a, b) => b.value - a.value);
    const value = round2(rows.reduce((s, r) => s + r.value, 0));
    return {
      type, title: "Inventory valuation",
      columns: [
        { key: "sku", label: "SKU" }, { key: "product", label: "Product" },
        { key: "type", label: "Type" }, { key: "warehouse", label: "Warehouse" },
        { key: "physical", label: "Physical", type: "number" }, { key: "reserved", label: "Reserved", type: "number" },
        { key: "quarantined", label: "Quarant.", type: "number" }, { key: "available", label: "Available", type: "number" },
        { key: "unit", label: "Unit" }, { key: "value", label: "Value", type: "money" },
      ],
      rows,
      summary: [
        { label: "Stocked items", value: String(rows.length) },
        { label: "Total value (purchase price)", value: value.toFixed(2) },
      ],
    };
  }

  if (type === "production") {
    const mos = await prisma.productionOrder.findMany({
      where: { companyId, deletedAt: null, createdAt: { gte: range.from, lte: range.to } },
      include: { product: true, workCenter: true, responsible: true },
      orderBy: { createdAt: "asc" },
    });
    const rows = mos.map((m) => ({
      orderNumber: m.orderNumber, product: m.product.name, quantity: m.quantity,
      produced: m.producedQuantity, status: m.status, priority: m.priority,
      workCenter: m.workCenter?.name ?? "—",
      responsible: m.responsible ? `${m.responsible.firstName} ${m.responsible.lastName}` : "—",
      plannedStart: m.plannedStart, actualEnd: m.actualEnd,
    }));
    const completed = mos.filter((m) => m.status === "COMPLETED");
    const output = round2(completed.reduce((s, m) => s + m.producedQuantity, 0));
    return {
      type, title: "Production report",
      columns: [
        { key: "orderNumber", label: "MO" }, { key: "product", label: "Product" },
        { key: "quantity", label: "Planned", type: "number" }, { key: "produced", label: "Produced", type: "number" },
        { key: "status", label: "Status" }, { key: "priority", label: "Priority" },
        { key: "workCenter", label: "Work center" }, { key: "responsible", label: "Responsible" },
        { key: "plannedStart", label: "Planned start", type: "date" },
      ],
      rows,
      summary: [
        { label: "Orders", value: String(mos.length) },
        { label: "Completed", value: String(completed.length) },
        { label: "Total output", value: String(output) },
      ],
    };
  }

  if (type === "finance") {
    const invoices = await prisma.invoice.findMany({
      where: { companyId, deletedAt: null, issueDate: { gte: range.from, lte: range.to } },
      include: { customer: true },
      orderBy: { issueDate: "asc" },
    });
    const rows = invoices.map((i) => ({
      invoiceNumber: i.invoiceNumber, issueDate: i.issueDate, dueDate: i.dueDate,
      customer: i.customer.companyName ?? i.customer.lastName ?? "—",
      status: i.status, total: i.total, paid: i.paidAmount,
      outstanding: round2(i.total - i.paidAmount),
    }));
    const total = round2(invoices.reduce((s, i) => s + i.total, 0));
    const paid = round2(invoices.reduce((s, i) => s + i.paidAmount, 0));
    return {
      type, title: "Invoice & payment report",
      columns: [
        { key: "invoiceNumber", label: "Invoice" }, { key: "issueDate", label: "Issued", type: "date" },
        { key: "dueDate", label: "Due", type: "date" }, { key: "customer", label: "Customer" },
        { key: "status", label: "Status" }, { key: "total", label: "Total", type: "money" },
        { key: "paid", label: "Paid", type: "money" }, { key: "outstanding", label: "Outstanding", type: "money" },
      ],
      rows,
      summary: [
        { label: "Invoices", value: String(invoices.length) },
        { label: "Invoiced total", value: total.toFixed(2) },
        { label: "Received", value: paid.toFixed(2) },
        { label: "Outstanding", value: (total - paid).toFixed(2) },
      ],
    };
  }

  if (type === "logistics") {
    const shipments = await prisma.shipment.findMany({
      where: { companyId, createdAt: { gte: range.from, lte: range.to } },
      include: { customer: true, warehouse: true, salesOrder: true },
      orderBy: { createdAt: "asc" },
    });
    const rows = shipments.map((s) => ({
      shipmentNumber: s.shipmentNumber, order: s.salesOrder?.orderNumber ?? "—",
      customer: s.customer.companyName ?? s.customer.lastName ?? "—",
      warehouse: s.warehouse.code, carrier: s.carrier ?? "—", status: s.status,
      plannedDate: s.plannedDate, actualDate: s.actualDate, packages: s.packageCount,
    }));
    const delivered = shipments.filter((s) => s.status === "DELIVERED").length;
    return {
      type, title: "Logistics report",
      columns: [
        { key: "shipmentNumber", label: "Shipment" }, { key: "order", label: "Order" },
        { key: "customer", label: "Customer" }, { key: "warehouse", label: "WH" },
        { key: "carrier", label: "Carrier" }, { key: "status", label: "Status" },
        { key: "plannedDate", label: "Planned", type: "date" }, { key: "actualDate", label: "Actual", type: "date" },
        { key: "packages", label: "Packages", type: "number" },
      ],
      rows,
      summary: [
        { label: "Shipments", value: String(shipments.length) },
        { label: "Delivered", value: String(delivered) },
      ],
    };
  }

  throw new Error(`Unknown report type: ${type}`);
}

export function reportToCsv(report: ReportResult): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = report.columns.map((c) => esc(c.label)).join(";");
  const lines = report.rows.map((r) => report.columns.map((c) => esc(r[c.key])).join(";"));
  const summary = ["", ...report.summary.map((s) => esc(`${s.label}: ${s.value}`))].join("\n");
  // Excel-friendly: use ; separator and UTF-8 BOM is added by the caller.
  return [header, ...lines, summary].join("\n");
}

export const REPORT_TYPES = [
  { key: "sales", label: "Sales" },
  { key: "purchases", label: "Purchases" },
  { key: "inventory", label: "Inventory" },
  { key: "production", label: "Production" },
  { key: "finance", label: "Invoices & payments" },
  { key: "logistics", label: "Logistics" },
];

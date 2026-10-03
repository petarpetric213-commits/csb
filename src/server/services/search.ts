// ============================================================================
// Global search — one query across the major entities (company-scoped).
// ============================================================================
import prisma from "@/lib/db";

export type SearchHit = {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  number: string | null;
  status: string | null;
  href: string;
};

export async function globalSearch(companyId: string, q: string, limitPerType = 4): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const contains = { contains: term };

  const [customers, suppliers, products, orders, invoices, purchaseOrders, warehouses, employees, productionOrders, quotes, shipments] =
    await Promise.all([
      prisma.customer.findMany({
        where: { companyId, deletedAt: null, OR: [{ companyName: contains }, { customerNumber: contains }, { lastName: contains }, { email: contains }] },
        take: limitPerType,
      }),
      prisma.supplier.findMany({
        where: { companyId, deletedAt: null, OR: [{ companyName: contains }, { supplierNumber: contains }] },
        take: limitPerType,
      }),
      prisma.product.findMany({
        where: { companyId, deletedAt: null, OR: [{ name: contains }, { sku: contains }, { barcode: contains }, { ean: contains }] },
        take: limitPerType,
      }),
      prisma.salesOrder.findMany({
        where: { companyId, deletedAt: null, OR: [{ orderNumber: contains }, { customer: { companyName: contains } }] },
        include: { customer: true }, take: limitPerType,
      }),
      prisma.invoice.findMany({
        where: { companyId, deletedAt: null, OR: [{ invoiceNumber: contains }, { customer: { companyName: contains } }] },
        include: { customer: true }, take: limitPerType,
      }),
      prisma.purchaseOrder.findMany({
        where: { companyId, deletedAt: null, OR: [{ orderNumber: contains }, { supplier: { companyName: contains } }] },
        include: { supplier: true }, take: limitPerType,
      }),
      prisma.warehouse.findMany({
        where: { companyId, OR: [{ name: contains }, { code: contains }] }, take: limitPerType,
      }),
      prisma.employee.findMany({
        where: { companyId, deletedAt: null, OR: [{ firstName: contains }, { lastName: contains }, { employeeNumber: contains }] },
        take: limitPerType,
      }),
      prisma.productionOrder.findMany({
        where: { companyId, deletedAt: null, orderNumber: contains },
        include: { product: true }, take: limitPerType,
      }),
      prisma.salesQuote.findMany({
        where: { companyId, deletedAt: null, quoteNumber: contains },
        take: limitPerType,
      }),
      prisma.shipment.findMany({
        where: { companyId, shipmentNumber: contains }, take: limitPerType,
      }),
    ]);

  const hits: SearchHit[] = [];
  for (const c of customers) hits.push({ type: "Customer", id: c.id, title: c.companyName ?? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(), subtitle: c.email ?? null, number: c.customerNumber, status: c.status, href: `/customers/${c.id}` });
  for (const s of suppliers) hits.push({ type: "Supplier", id: s.id, title: s.companyName, subtitle: s.city ?? null, number: s.supplierNumber, status: s.status, href: `/suppliers/${s.id}` });
  for (const p of products) hits.push({ type: "Product", id: p.id, title: p.name, subtitle: p.brand ?? null, number: p.sku, status: p.status, href: `/products/${p.id}` });
  for (const o of orders) hits.push({ type: "SalesOrder", id: o.id, title: o.orderNumber, subtitle: o.customer.companyName ?? null, number: o.orderNumber, status: o.status, href: `/sales/orders/${o.id}` });
  for (const i of invoices) hits.push({ type: "Invoice", id: i.id, title: i.invoiceNumber, subtitle: i.customer.companyName ?? null, number: i.invoiceNumber, status: i.status, href: `/sales/invoices/${i.id}` });
  for (const po of purchaseOrders) hits.push({ type: "PurchaseOrder", id: po.id, title: po.orderNumber, subtitle: po.supplier.companyName ?? null, number: po.orderNumber, status: po.status, href: `/purchasing/orders/${po.id}` });
  for (const w of warehouses) hits.push({ type: "Warehouse", id: w.id, title: w.name, subtitle: w.city ?? null, number: w.code, status: w.status, href: `/warehouses/${w.id}` });
  for (const e of employees) hits.push({ type: "Employee", id: e.id, title: `${e.firstName} ${e.lastName}`, subtitle: e.position ?? null, number: e.employeeNumber, status: e.employmentStatus, href: `/employees/${e.id}` });
  for (const mo of productionOrders) hits.push({ type: "ProductionOrder", id: mo.id, title: mo.orderNumber, subtitle: mo.product.name, number: mo.orderNumber, status: mo.status, href: `/production/orders/${mo.id}` });
  for (const qt of quotes) hits.push({ type: "Quote", id: qt.id, title: qt.quoteNumber, subtitle: null, number: qt.quoteNumber, status: qt.status, href: `/sales/quotes/${qt.id}` });
  for (const sh of shipments) hits.push({ type: "Shipment", id: sh.id, title: sh.shipmentNumber, subtitle: sh.carrier ?? null, number: sh.shipmentNumber, status: sh.status, href: `/logistics` });

  return hits.slice(0, 40);
}

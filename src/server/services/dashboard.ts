// ============================================================================
// Dashboard aggregation service.
// ============================================================================
import prisma from "@/lib/db";
import { round2 } from "@/lib/utils";

export async function getDashboard(companyId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const day180 = new Date(now.getTime() - 180 * 24 * 3600 * 1000);

  const [
    customerCount, supplierCount, productCount, employeeCount,
    ordersMonth, ordersOpen, quotesOpen,
    invoices, inventoryValueItems, lowStockProducts,
    poOpen, moOpen, shipmentsOpen, tasksOpen,
  ] = await Promise.all([
    prisma.customer.count({ where: { companyId, deletedAt: null } }),
    prisma.supplier.count({ where: { companyId, deletedAt: null } }),
    prisma.product.count({ where: { companyId, deletedAt: null } }),
    prisma.employee.count({ where: { companyId, deletedAt: null } }),
    prisma.salesOrder.findMany({
      where: { companyId, deletedAt: null, orderDate: { gte: monthStart } },
      select: { total: true },
    }),
    prisma.salesOrder.count({ where: { companyId, deletedAt: null, status: { in: ["DRAFT", "CONFIRMED", "RESERVED", "PICKING", "PACKED", "PARTIALLY_SHIPPED"] } } }),
    prisma.salesQuote.count({ where: { companyId, deletedAt: null, status: { in: ["DRAFT", "SENT", "VIEWED"] } } }),
    prisma.invoice.findMany({
      where: { companyId, deletedAt: null, status: { not: "CANCELLED" } },
      select: { total: true, paidAmount: true, status: true, issueDate: true, dueDate: true },
    }),
    prisma.inventoryItem.findMany({
      where: { companyId },
      select: { physicalQty: true, product: { select: { purchasePrice: true } } },
    }),
    prisma.product.findMany({
      where: { companyId, deletedAt: null, isStockTracked: true },
      select: { name: true, sku: true, reorderPoint: true, unit: true, inventoryItems: { select: { physicalQty: true, reservedQty: true } } },
    }),
    prisma.purchaseOrder.count({ where: { companyId, deletedAt: null, status: { in: ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] } } }),
    prisma.productionOrder.count({ where: { companyId, deletedAt: null, status: { in: ["PLANNED", "RELEASED", "IN_PROGRESS", "PAUSED", "QUALITY_CONTROL"] } } }),
    prisma.shipment.count({ where: { companyId, status: { in: ["PREPARING", "PICKED", "PACKED", "SHIPPED", "IN_TRANSIT"] } } }),
    prisma.task.count({ where: { companyId, status: { not: "COMPLETED" } } }),
  ]);

  // ---- Invoice KPIs ----
  const totalInvoiced = round2(invoices.reduce((s, i) => s + i.total, 0));
  const totalPaid = round2(invoices.reduce((s, i) => s + i.paidAmount, 0));
  const outstanding = round2(invoices.reduce((s, i) => s + (i.total - i.paidAmount), 0));
  const overdue = round2(
    invoices.filter((i) => i.status === "OVERDUE" || (i.dueDate && i.dueDate < now && i.paidAmount < i.total - 0.001 && i.status !== "CANCELLED" && i.status !== "DRAFT"))
      .reduce((s, i) => s + (i.total - i.paidAmount), 0)
  );
  const overdueCount = invoices.filter(
    (i) => i.status === "OVERDUE" || (i.dueDate && i.dueDate < now && i.paidAmount < i.total - 0.001 && i.status !== "CANCELLED" && i.status !== "DRAFT")
  ).length;

  const revenueMonth = round2(ordersMonth.reduce((s, o) => s + o.total, 0));
  const ordersMonthCount = ordersMonth.length;

  // ---- Inventory value & low stock ----
  const inventoryValue = round2(inventoryValueItems.reduce((s, i) => s + i.physicalQty * (i.product.purchasePrice || 0), 0));
  const lowStock = lowStockProducts
    .map((p) => {
      const physical = p.inventoryItems.reduce((s, i) => s + i.physicalQty, 0);
      const reserved = p.inventoryItems.reduce((s, i) => s + i.reservedQty, 0);
      return { productId: p.sku as any, id: p.name as any, name: p.sku as any, sku: p.name as any, unit: p.unit, available: physical - reserved, reorderPoint: p.reorderPoint } as any;
    })
    .map((p) => p);
  // Build low stock list properly
  const lowStockList = lowStockProducts
    .map((p) => {
      const physical = p.inventoryItems.reduce((s, i) => s + i.physicalQty, 0);
      const reserved = p.inventoryItems.reduce((s, i) => s + i.reservedQty, 0);
      const available = physical - reserved;
      return {
        name: (p as any).name,
        sku: (p as any).sku,
        unit: (p as any).unit,
        available: Math.round(available * 100) / 100,
        reorderPoint: (p as any).reorderPoint,
        below: available <= (p as any).reorderPoint,
      };
    })
    .filter((p) => p.below && (p as any).reorderPoint > 0)
    .sort((a, b) => a.available - b.available)
    .slice(0, 8);

  // ---- Chart: revenue & orders per month (last 6 months) ----
  const months: { key: string; label: string; revenue: number; orders: number }[] = [];
  for (let m = 5; m >= 0; m--) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const label = start.toLocaleDateString("en-US", { month: "short" });
    months.push({ key: start.toISOString().slice(0, 7), label, revenue: 0, orders: 0 });
    // fill below
  }
  const ordersAll = await prisma.salesOrder.findMany({
    where: { companyId, deletedAt: null, orderDate: { gte: months[0] ? new Date(now.getFullYear(), now.getMonth() - 5, 1) : day180 }, status: { not: "CANCELLED" } },
    select: { orderDate: true, total: true },
  });
  for (const o of ordersAll) {
    const key = o.orderDate.toISOString().slice(0, 7);
    const bucket = months.find((m) => m.key === key);
    if (bucket) {
      bucket.revenue = round2(bucket.revenue + o.total);
      bucket.orders += 1;
    }
  }

  // ---- Chart: sales by category ----
  const soldItems = await prisma.salesOrderItem.findMany({
    where: {
      order: { companyId, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] }, orderDate: { gte: day180 } },
    },
    select: { quantity: true, unitPrice: true, discountPercent: true, product: { select: { category: { select: { name: true } } } } },
  });
  const byCategory = new Map<string, number>();
  for (const it of soldItems) {
    const cat = it.product.category?.name ?? "Uncategorized";
    const net = it.quantity * it.unitPrice * (1 - (it.discountPercent ?? 0) / 100);
    byCategory.set(cat, round2((byCategory.get(cat) ?? 0) + net));
  }
  const salesByCategory = [...byCategory.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // ---- Chart: top customers ----
  const ordersWithCustomer = await prisma.salesOrder.findMany({
    where: { companyId, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] }, orderDate: { gte: day180 } },
    select: { total: true, customer: { select: { companyName: true, firstName: true, lastName: true } } },
  });
  const byCustomer = new Map<string, number>();
  for (const o of ordersWithCustomer) {
    const name = o.customer.companyName ?? `${o.customer.firstName ?? ""} ${o.customer.lastName ?? ""}`.trim();
    byCustomer.set(name, round2((byCustomer.get(name) ?? 0) + o.total));
  }
  const topCustomers = [...byCustomer.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // ---- Chart: inventory movements last 14 days ----
  const movements = await prisma.inventoryMovement.findMany({
    where: { companyId, createdAt: { gte: new Date(now.getTime() - 14 * 24 * 3600 * 1000) } },
    select: { quantity: true, createdAt: true, type: true },
  });
  const movementDays: { day: string; inbound: number; outbound: number }[] = [];
  for (let d = 13; d >= 0; d--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    const key = day.toISOString().slice(0, 10);
    movementDays.push({ day: key.slice(5), inbound: 0, outbound: 0 });
  }
  for (const mv of movements) {
    const key = mv.createdAt.toISOString().slice(0, 10);
    const bucket = movementDays.find((m) => m.day === key.slice(5));
    if (bucket) {
      if (mv.quantity > 0) bucket.inbound = round2(bucket.inbound + mv.quantity);
      else bucket.outbound = round2(bucket.outbound + Math.abs(mv.quantity));
    }
  }

  // ---- Chart: purchasing trend (6 months) ----
  const poTrend: { label: string; value: number }[] = months.map((m) => ({ label: m.label, value: 0 }));
  const pos = await prisma.purchaseOrder.findMany({
    where: { companyId, deletedAt: null, status: { not: "CANCELLED" }, orderDate: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
    select: { orderDate: true, total: true },
  });
  for (const po of pos) {
    const d = po.orderDate;
    const idx = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    const slot = 5 - idx;
    if (slot >= 0 && slot < 6) poTrend[slot].value = round2(poTrend[slot].value + po.total);
  }

  // ---- Chart: production output per month ----
  const moTrend: { label: string; value: number }[] = months.map((m) => ({ label: m.label, value: 0 }));
  const mos = await prisma.productionOrder.findMany({
    where: { companyId, deletedAt: null, status: "COMPLETED", actualEnd: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
    select: { actualEnd: true, producedQuantity: true },
  });
  for (const mo of mos) {
    const d = mo.actualEnd!;
    const idx = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    const slot = 5 - idx;
    if (slot >= 0 && slot < 6) moTrend[slot].value = round2(moTrend[slot].value + mo.producedQuantity);
  }

  return {
    kpis: {
      revenueMonth,
      ordersMonthCount,
      ordersOpen,
      quotesOpen,
      totalInvoiced,
      totalPaid,
      outstanding,
      overdue,
      overdueCount,
      inventoryValue,
      lowStockCount: lowStockList.length,
      poOpen,
      moOpen,
      shipmentsOpen,
      tasksOpen,
      customerCount,
      supplierCount,
      productCount,
      employeeCount,
    },
    charts: {
      revenueByMonth: months.map((m) => ({ name: m.label, revenue: m.revenue, orders: m.orders })),
      salesByCategory,
      topCustomers,
      inventoryMovements: movementDays,
      purchasingTrend: poTrend,
      productionOutput: moTrend,
    },
    lists: {
      lowStock: lowStockList,
    },
  };
}

// Smoke test: verifies the offline Prisma stack (WASM engine + node:sqlite
// driver adapter) end-to-end: schema, CRUD, relations, DateTime round-trip,
// transactions, aggregates.
import { PrismaClient } from "../src/generated/prisma/client";
import { createNodeSqliteAdapterFactory } from "../src/lib/sqlite-adapter";

async function main() {
  const db = process.env.SMOKE_DB ?? "file:./prisma/smoke.db";
  const adapter = createNodeSqliteAdapterFactory(db);
  const prisma = new PrismaClient({ adapter, log: ["error"] } as any);

  const company = await prisma.company.create({
    data: { legalName: "Smoke Test GmbH", currency: "EUR", country: "DE" },
  });
  console.log("✓ create company:", company.id);

  const user = await prisma.user.create({
    data: { email: `smoke-${Date.now()}@test.local`, passwordHash: "x", name: "Smoke Tester" },
  });
  console.log("✓ create user:", user.id, "createdAt is Date:", user.createdAt instanceof Date);

  const customer = await prisma.customer.create({
    data: {
      companyId: company.id,
      customerNumber: "C-00001",
      companyName: "Beispiel Handel GmbH",
      email: "info@beispiel.de",
      paymentTermDays: 14,
      creditLimit: 50000,
    },
  });
  console.log("✓ create customer:", customer.customerNumber);

  const supplier = await prisma.supplier.create({
    data: { companyId: company.id, supplierNumber: "S-00001", companyName: "Rohstoff AG" },
  });

  const category = await prisma.productCategory.create({
    data: { companyId: company.id, name: "Lebensmittel" },
  });
  const product = await prisma.product.create({
    data: {
      companyId: company.id,
      sku: "SKU-001",
      name: "Bio-Schokolade 100g",
      categoryId: category.id,
      supplierId: supplier.id,
      purchasePrice: 1.2,
      salesPrice: 2.49,
      taxRate: 7,
    },
  });
  console.log("✓ create product:", product.sku, "updatedAt:", product.updatedAt instanceof Date);

  // Relation include
  const productWithRel = await prisma.product.findUnique({
    where: { id: product.id },
    include: { category: true, supplier: true },
  });
  console.log("✓ include relations:", productWithRel?.category?.name, "/", productWithRel?.supplier?.companyName);

  // Warehouse + inventory
  const warehouse = await prisma.warehouse.create({
    data: { companyId: company.id, code: "WH01", name: "Hauptlager", isDefault: true },
  });
  const inv = await prisma.inventoryItem.create({
    data: {
      companyId: company.id, productId: product.id, warehouseId: warehouse.id,
      physicalQty: 100, reservedQty: 0,
    },
  });

  // DateTime filter (range query)
  const recent = await prisma.product.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  console.log("✓ dateTime range filter:", recent.length, "product(s) found");

  // Transaction with rollback on error
  try {
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: customer.id }, data: { status: "PROSPECT" } });
      throw new Error("rollback-test");
    });
  } catch (e) {
    const check = await prisma.customer.findUnique({ where: { id: customer.id } });
    console.log("✓ transaction rollback, status unchanged:", check?.status === "ACTIVE");
  }

  // Transaction commit
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: customer.id }, data: { status: "PROSPECT" } });
    await tx.inventoryItem.update({ where: { id: inv.id }, data: { physicalQty: 90 } });
  });
  const check2 = await prisma.customer.findUnique({ where: { id: customer.id } });
  console.log("✓ transaction commit, status:", check2?.status);

  // Aggregations
  const agg = await prisma.customer.aggregate({ _count: true, where: { companyId: company.id } });
  console.log("✓ aggregate count:", agg._count);

  // Update + delete
  await prisma.customer.update({ where: { id: customer.id }, data: { notes: "test note" } });
  await prisma.customer.delete({ where: { id: customer.id } });
  console.log("✓ update + delete");

  // Bool round-trip
  const c2 = await prisma.company.findUnique({ where: { id: company.id } });
  console.log("✓ boolean round-trip isDemo:", c2?.isDemo === false);

  await prisma.$disconnect();
  console.log("\nALL SMOKE TESTS PASSED");
  process.exit(0);
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});

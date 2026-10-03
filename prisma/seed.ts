// ============================================================================
// NEXORA ERP — Database seed
//
// Chronological simulation of a food-manufacturing company (German ERP
// heritage): master data first, then ~6 months of purchasing, sales,
// production, quality and payment activity created THROUGH the real
// services, so every document carries audit entries, notifications and
// consistent stock movements. Deterministic via mulberry32.
//
// Run: DATABASE_URL="file:./prisma/dev.db" npx tsx prisma/seed.ts
// ============================================================================
import { hashPassword } from "@/server/auth";
import { ROLE_DEFINITIONS } from "@/lib/permissions";
import { logAudit } from "@/server/audit";
import prisma from "@/lib/db";
import { adjustStock, transferStock } from "@/server/services/inventory";
import { createPurchaseOrder, purchaseOrderAction, receivePurchaseOrder } from "@/server/services/purchasing";
import {
  createQuote, quoteAction, convertQuoteToOrder, createOrder, salesOrderAction,
} from "@/server/services/sales";
import { createInvoiceFromOrder, invoiceAction, registerPayment, markOverdueInvoices } from "@/server/services/invoicing";
import { createProductionOrder, productionOrderAction } from "@/server/services/production";
import { createInspection, recordInspectionResult } from "@/server/services/quality";
import { notifyUsers } from "@/server/services/notifications";

// ---------------------------------------------------------------- utilities
/** Deterministic RNG (mulberry32) so every seed run produces the same data. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const between = (min: number, max: number) => min + rnd() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const round2 = (n: number) => Math.round(n * 100) / 100;

const DAY = 24 * 3600 * 1000;
const now = new Date();
const daysAgo = (n: number, hour = 10) => {
  const d = new Date(now.getTime() - n * DAY);
  d.setHours(hour, intBetween(0, 59), 0, 0);
  return d;
};

async function main() {
  console.log("🌱 Seeding NEXORA ERP demo data …");

  // ------------------------------------------------------------ clean slate
  // Companies cascade virtually everything; User-owned rows cleared after.
  await prisma.company.deleteMany();
  await prisma.session.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.userCompany.deleteMany();
  await prisma.user.deleteMany();

  // ------------------------------------------------------------ companies
  const de = await prisma.company.create({
    data: {
      legalName: "NEXORA Manufacturing GmbH",
      tradingName: "NEXORA",
      taxNumber: "DE 119 457 832",
      registrationNumber: "HRB 78451",
      street: "Am Lebensmittelzentrum 12",
      city: "Düsseldorf",
      postalCode: "40213",
      country: "DE",
      phone: "+49 211 998 70-0",
      email: "info@nexora.demo",
      website: "https://nexora.demo",
      currency: "EUR",
      timezone: "Europe/Berlin",
      locale: "de",
      isDemo: true,
    },
  });
  const rs = await prisma.company.create({
    data: {
      legalName: "Nexora Srbija d.o.o.",
      tradingName: "Nexora Srbija",
      taxNumber: "108452293",
      registrationNumber: "21312345",
      street: "Bulevar vojvode Mišića 21",
      city: "Beograd",
      postalCode: "11000",
      country: "RS",
      phone: "+381 11 400 2200",
      email: "office@nexora.demo",
      currency: "RSD",
      timezone: "Europe/Belgrade",
      locale: "sr",
      isDemo: true,
    },
  });

  // ------------------------------------------------------------ roles
  async function seedRoles(companyId: string) {
    const map = new Map<string, string>();
    for (const def of ROLE_DEFINITIONS) {
      const role = await prisma.role.create({
        data: {
          companyId,
          key: def.key,
          name: def.name,
          description: def.description,
          isSystem: true,
          permissions: { create: def.permissions.map((p) => ({ permission: p })) },
        },
      });
      map.set(def.key, role.id);
    }
    return map;
  }
  const rolesDe = await seedRoles(de.id);
  const rolesRs = await seedRoles(rs.id);

  // ------------------------------------------------------------ users
  const passwordHash = await hashPassword("demo1234");
  async function createUser(opts: {
    email: string; name: string; roleId: string; companyId: string;
    employee: { employeeNumber: string; firstName: string; lastName: string; department: string; position: string };
    isDefault?: boolean; locale?: string;
  }) {
    const user = await prisma.user.create({
      data: {
        email: opts.email,
        passwordHash,
        name: opts.name,
        emailVerifiedAt: daysAgo(400),
        locale: opts.locale ?? "de",
        lastLoginAt: daysAgo(intBetween(0, 5)),
      },
    });
    const employee = await prisma.employee.create({
      data: {
        companyId: opts.companyId,
        employeeNumber: opts.employee.employeeNumber,
        firstName: opts.employee.firstName,
        lastName: opts.employee.lastName,
        email: opts.email,
        department: opts.employee.department,
        position: opts.employee.position,
        startDate: daysAgo(900),
        phone: `+49 211 998 70-${intBetween(10, 99)}`,
      },
    });
    await prisma.userCompany.create({
      data: {
        userId: user.id,
        companyId: opts.companyId,
        roleId: opts.roleId,
        employeeId: employee.id,
        isDefault: opts.isDefault ?? true,
      },
    });
    return { user, employee };
  }

  const admin = await createUser({
    email: "admin@nexora.demo", name: "Anna Schmidt", roleId: rolesDe.get("COMPANY_ADMIN")!, companyId: de.id,
    employee: { employeeNumber: "MA-0001", firstName: "Anna", lastName: "Schmidt", department: "Geschäftsführung", position: "Geschäftsführerin" },
    locale: "de",
  });
  const sales = await createUser({
    email: "verkauf@nexora.demo", name: "Lukas Weber", roleId: rolesDe.get("SALES")!, companyId: de.id,
    employee: { employeeNumber: "MA-0002", firstName: "Lukas", lastName: "Weber", department: "Vertrieb", position: "Vertriebsleiter" },
  });
  const purchasing = await createUser({
    email: "einkauf@nexora.demo", name: "Thomas Fischer", roleId: rolesDe.get("PURCHASING")!, companyId: de.id,
    employee: { employeeNumber: "MA-0003", firstName: "Thomas", lastName: "Fischer", department: "Einkauf", position: "Einkäufer" },
  });
  const warehouse = await createUser({
    email: "lager@nexora.demo", name: "Martina Schulz", roleId: rolesDe.get("WAREHOUSE")!, companyId: de.id,
    employee: { employeeNumber: "MA-0004", firstName: "Martina", lastName: "Schulz", department: "Lager & Logistik", position: "Lagerleiterin" },
  });
  const production = await createUser({
    email: "produktion@nexora.demo", name: "Stefan Krüger", roleId: rolesDe.get("PRODUCTION")!, companyId: de.id,
    employee: { employeeNumber: "MA-0005", firstName: "Stefan", lastName: "Krüger", department: "Produktion", position: "Produktionsleiter" },
  });
  const quality = await createUser({
    email: "qualitaet@nexora.demo", name: "Petra Braun", roleId: rolesDe.get("QUALITY")!, companyId: de.id,
    employee: { employeeNumber: "MA-0006", firstName: "Petra", lastName: "Braun", department: "Qualitätssicherung", position: "QS-Leiterin" },
  });
  const finance = await createUser({
    email: "finanzen@nexora.demo", name: "Michael Hoffmann", roleId: rolesDe.get("FINANCE")!, companyId: de.id,
    employee: { employeeNumber: "MA-0007", firstName: "Michael", lastName: "Hoffmann", department: "Finanzen", position: "Finanzbuchhalter" },
  });
  const viewer = await createUser({
    email: "viewer@nexora.demo", name: "Julia Klein", roleId: rolesDe.get("VIEWER")!, companyId: de.id,
    employee: { employeeNumber: "MA-0008", firstName: "Julia", lastName: "Klein", department: "Assistenz", position: "Teamassistentin" },
  });

  // Extra employees without logins (for the HR module)
  const extraEmployees = [
    { n: "MA-0009", first: "Jonas", last: "Müller", dept: "Produktion", pos: "Maschinenbediener", status: "ACTIVE" },
    { n: "MA-0010", first: "Sabine", last: "Neumann", dept: "Produktion", pos: "Fachkraft Molkerei", status: "ACTIVE" },
    { n: "MA-0011", first: "Ali", last: "Yılmaz", dept: "Lager & Logistik", pos: "Fachlagerist", status: "ACTIVE" },
    { n: "MA-0012", first: "Claudia", last: "Roth", dept: "Vertrieb", pos: "Inside Sales", status: "PROBATION" },
    { n: "MA-0013", first: "Bernd", last: "Wagner", dept: "Instandhaltung", pos: "Techniker", status: "ON_LEAVE" },
    { n: "MA-0014", first: "Elif", last: "Kaya", dept: "Qualitätssicherung", pos: "QS-Mitarbeiterin", status: "ACTIVE" },
  ];
  for (const e of extraEmployees) {
    await prisma.employee.create({
      data: {
        companyId: de.id, employeeNumber: e.n, firstName: e.first, lastName: e.last,
        department: e.dept, position: e.pos, employmentStatus: e.status,
        startDate: daysAgo(intBetween(200, 900)),
        email: `${e.first.toLowerCase().replace(/[^a-z]/g, "")}.${e.last.toLowerCase().replace(/[^a-z]/g, "")}@nexora.demo`,
      },
    });
  }

  // Admin also manages the Serbian subsidiary (for company switching demo)
  await prisma.userCompany.create({
    data: {
      userId: admin.user.id, companyId: rs.id, roleId: rolesRs.get("COMPANY_ADMIN")!,
      isDefault: false,
    },
  });

  const ctx = { companyId: de.id };

  // ------------------------------------------------------------ customer groups
  const groups = new Map<string, string>();
  for (const g of [
    { name: "Einzelhandel", description: "Lebensmitteleinzelhandel", discountPercent: 3 },
    { name: "Großhandel", description: "Food-Großhandel und C&C", discountPercent: 7 },
    { name: "Gastronomie", description: "Restaurants, Hotels, Catering", discountPercent: 5 },
    { name: "Key Account", description: "Strategische Großkunden", discountPercent: 0 },
  ]) {
    const row = await prisma.customerGroup.create({ data: { ...g, companyId: de.id } });
    groups.set(g.name, row.id);
  }

  // ------------------------------------------------------------ customers
  const customerData: [string, string, number, number, string][] = [
    // name, city, term days, credit limit, group
    ["Metro Cash & Carry Deutschland GmbH", "Düsseldorf", 30, 250000, "Großhandel"],
    ["Rewe Großhandel Süd GmbH & Co. KG", "Wiesloch", 30, 180000, "Großhandel"],
    ["Edeka Foodservice GmbH", "Hamburg", 45, 200000, "Großhandel"],
    ["Restaurantkette Zum Goldenen Hahn GmbH", "Köln", 14, 40000, "Gastronomie"],
    ["Hotelpartner Rhein-Ruhr AG", "Essen", 30, 60000, "Gastronomie"],
    ["Feinkost Böckmann GmbH & Co. KG", "Münster", 30, 35000, "Einzelhandel"],
    ["BioMarkt Naturalis e.K.", "Dortmund", 14, 20000, "Einzelhandel"],
    ["Catering Magnus Eventgastronomie", "Düsseldorf", 21, 30000, "Gastronomie"],
    ["Großküchen Service NRW GmbH", "Bochum", 30, 45000, "Gastronomie"],
    ["Südback Handels GmbH", "Stuttgart", 30, 80000, "Großhandel"],
    ["Fischhaus NordseePremium oHG", "Kiel", 30, 15000, "Einzelhandel"],
    ["Bäckerei & Konditorei Sonnenhof", "Neuss", 14, 12000, "Einzelhandel"],
  ];
  const customers: { id: string; name: string }[] = [];
  for (let i = 0; i < customerData.length; i++) {
    const [name, city, term, limit, group] = customerData[i];
    const c = await prisma.customer.create({
      data: {
        companyId: de.id,
        customerNumber: `K-${String(i + 1).padStart(5, "0")}`,
        type: "COMPANY",
        companyName: name,
        email: `einkauf${i + 1}@${name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "")}.de`,
        phone: `+49 ${intBetween(200, 899)} ${intBetween(100000, 999999)}`,
        billingStreet: `${pick(["Hauptstraße", "Industrieweg", "Marktplatz", "Hafenstraße"])} ${intBetween(1, 80)}`,
        billingCity: city,
        billingPostalCode: String(intBetween(10000, 99999)),
        billingCountry: "DE",
        shippingCity: city,
        paymentTermDays: term,
        creditLimit: limit,
        groupId: groups.get(group),
        assignedToId: sales.employee.id,
        status: i === 10 ? "PROSPECT" : "ACTIVE",
        notes: i === 10 ? "Interessent aus dem Fischhandel — Erstkontakt auf der Messe." : null,
      },
    });
    customers.push({ id: c.id, name });
    if (i < 8) {
      await prisma.customerContact.create({
        data: {
          customerId: c.id,
          firstName: pick(["Markus", "Sandra", "Peter", "Anke", "Tobias", "Nadine", "Frank", "Lena"]),
          lastName: pick(["Berger", "Koch", "Vogel", "Richter", "Bauer", "Winkler", "Sommer", "Kaiser"]),
          position: pick(["Einkaufsleitung", "Einkäufer", "Disponent", "Geschäftsführung"]),
          email: `kontakt${i + 1}@kunde${i + 1}.de`,
          phone: `+49 170 ${intBetween(1000000, 9999999)}`,
          isPrimary: true,
        },
      });
    }
  }
  // One private customer
  await prisma.customer.create({
    data: {
      companyId: de.id, customerNumber: "K-00013", type: "PERSON",
      firstName: "Hans", lastName: "Müller",
      email: "hans.mueller@web.de", billingCity: "Dormagen",
      paymentTermDays: 7, creditLimit: 2000, groupId: groups.get("Einzelhandel"),
      status: "ACTIVE",
    },
  });

  // ------------------------------------------------------------ suppliers
  const supplierData: [string, string, string, number][] = [
    ["Fleischhof Rheinland GmbH & Co. KG", "Mönchengladbach", "Fleisch & Geflügel", 3],
    ["Milchwerk Niederrhein eG", "Kempen", "Milchprodukte", 14],
    ["Gewürzhaus Alba KG", "Hilden", "Gewürze & Zutaten", 7],
    ["Verpackung Nord GmbH", "Duisburg", "Verpackung", 21],
    ["Getreidemühle Kamp-Lintfort", "Kamp-Lintfort", "Mehl & Backzutaten", 14],
    ["Frischei-Vertrieb West", "Krefeld", "Eier", 7],
    ["Obsthof van Daalen", "Straelen", "Obst & Gemüse", 14],
    ["Kakaohandel Bremen", "Bremen", "Kakao & Zucker", 21],
  ];
  const suppliers: { id: string; name: string; term: number }[] = [];
  for (let i = 0; i < supplierData.length; i++) {
    const [name, city, category, term] = supplierData[i];
    const s = await prisma.supplier.create({
      data: {
        companyId: de.id,
        supplierNumber: `L-${String(i + 1).padStart(5, "0")}`,
        companyName: name,
        email: `verkauf@${name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "")}.de`,
        phone: `+49 ${intBetween(200, 899)} ${intBetween(100000, 999999)}`,
        street: `${pick(["Gewerbepark", "Siemensstraße", "Werkstraße"])} ${intBetween(1, 40)}`,
        city, postalCode: String(intBetween(10000, 99999)), country: "DE",
        category, paymentTermDays: term,
        status: i === 7 ? "PROSPECT" : "ACTIVE",
        rating: round2(between(3.2, 5)),
        notes: category === "Fleisch & Geflügel" ? "IFS-Zertifizierung gültig bis nächstes Jahr." : null,
      },
    });
    suppliers.push({ id: s.id, name, term });
  }

  // ------------------------------------------------------------ categories
  const categories = new Map<string, string>();
  for (const name of ["Fleisch & Wurstwaren", "Milchprodukte", "Backwaren", "Süßwaren", "Getränke", "Zutaten", "Verpackung"]) {
    const c = await prisma.productCategory.create({ data: { companyId: de.id, name } });
    categories.set(name, c.id);
  }

  // ------------------------------------------------------------ products
  type P = { sku: string; name: string; cat: string; type: string; unit: string; purchase: number; sales: number; vat: number; min: number; reorder: number; max: number; batch?: boolean; expiry?: boolean; shelfLifeDays?: number; weightKg?: number };
  const productData: P[] = [
    // Finished goods (food = 7% VAT in DE)
    { sku: "FG-1001", name: "Wiener Würstchen 500g", cat: "Fleisch & Wurstwaren", type: "FINISHED_GOOD", unit: "pcs", purchase: 1.95, sales: 3.49, vat: 7, min: 400, reorder: 600, max: 3000, batch: true, expiry: true, shelfLifeDays: 35, weightKg: 0.5 },
    { sku: "FG-1002", name: "Leberkäse 1kg", cat: "Fleisch & Wurstwaren", type: "FINISHED_GOOD", unit: "pcs", purchase: 2.85, sales: 4.99, vat: 7, min: 200, reorder: 300, max: 1500, batch: true, expiry: true, shelfLifeDays: 21, weightKg: 1 },
    { sku: "FG-1003", name: "Salami Rheinländer 200g", cat: "Fleisch & Wurstwaren", type: "FINISHED_GOOD", unit: "pcs", purchase: 1.55, sales: 2.79, vat: 7, min: 500, reorder: 800, max: 4000, batch: true, expiry: true, shelfLifeDays: 120, weightKg: 0.2 },
    { sku: "FG-2001", name: "Gouda Scheiben 250g", cat: "Milchprodukte", type: "FINISHED_GOOD", unit: "pcs", purchase: 1.30, sales: 2.29, vat: 7, min: 300, reorder: 500, max: 2500, batch: true, expiry: true, shelfLifeDays: 45, weightKg: 0.25 },
    { sku: "FG-2002", name: "Joghurt Erdbeere 500g", cat: "Milchprodukte", type: "FINISHED_GOOD", unit: "pcs", purchase: 0.82, sales: 1.49, vat: 7, min: 400, reorder: 600, max: 3000, batch: true, expiry: true, shelfLifeDays: 28, weightKg: 0.5 },
    { sku: "FG-2003", name: "Speisequark 40% 500g", cat: "Milchprodukte", type: "FINISHED_GOOD", unit: "pcs", purchase: 1.05, sales: 1.99, vat: 7, min: 250, reorder: 400, max: 2000, batch: true, expiry: true, shelfLifeDays: 24, weightKg: 0.5 },
    { sku: "FG-3001", name: "Vollkornbrötchen TK 50er", cat: "Backwaren", type: "FINISHED_GOOD", unit: "box", purchase: 3.90, sales: 6.90, vat: 7, min: 150, reorder: 250, max: 1200, batch: true, expiry: true, shelfLifeDays: 180, weightKg: 3.2 },
    { sku: "FG-3002", name: "Butterkuchen TK 12er", cat: "Backwaren", type: "FINISHED_GOOD", unit: "box", purchase: 4.80, sales: 8.50, vat: 7, min: 80, reorder: 140, max: 700, batch: true, expiry: true, shelfLifeDays: 180 },
    { sku: "FG-4001", name: "Rote Grütze 500g", cat: "Süßwaren", type: "FINISHED_GOOD", unit: "pcs", purchase: 1.20, sales: 2.19, vat: 7, min: 200, reorder: 350, max: 1800, batch: true, expiry: true, shelfLifeDays: 60, weightKg: 0.5 },
    { sku: "FG-4002", name: "Schoko-Riegel Sortiment 24er", cat: "Süßwaren", type: "FINISHED_GOOD", unit: "box", purchase: 4.60, sales: 7.80, vat: 7, min: 100, reorder: 180, max: 900, batch: true, shelfLifeDays: 240 },
    { sku: "FG-5001", name: "Apfelsaft direkt 1L 12er", cat: "Getränke", type: "FINISHED_GOOD", unit: "box", purchase: 5.90, sales: 9.90, vat: 7, min: 120, reorder: 200, max: 1000, batch: true, shelfLifeDays: 365 },
    // Raw materials
    { sku: "RM-9001", name: "Schweinefleisch mager", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 4.20, sales: 0, vat: 7, min: 200, reorder: 350, max: 1200, batch: true, expiry: true, shelfLifeDays: 7 },
    { sku: "RM-9002", name: "Rindfleisch mager", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 6.80, sales: 0, vat: 7, min: 100, reorder: 200, max: 800, batch: true, expiry: true, shelfLifeDays: 7 },
    { sku: "RM-9003", name: "Speck durchwachsen", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 3.90, sales: 0, vat: 7, min: 80, reorder: 150, max: 600, batch: true, expiry: true, shelfLifeDays: 10 },
    { sku: "RM-9004", name: "Gewürzmischung Brühwurst", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 8.50, sales: 0, vat: 19, min: 30, reorder: 50, max: 200, batch: true },
    { sku: "RM-9005", name: "Frischmilch 3,5%", cat: "Zutaten", type: "RAW_MATERIAL", unit: "l", purchase: 0.78, sales: 0, vat: 7, min: 400, reorder: 700, max: 3000, batch: true, expiry: true, shelfLifeDays: 8 },
    { sku: "RM-9006", name: "Joghurtkulturen", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 24.00, sales: 0, vat: 19, min: 5, reorder: 10, max: 40, batch: true },
    { sku: "RM-9007", name: "Weizenmehl Type 550", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 0.65, sales: 0, vat: 7, min: 200, reorder: 350, max: 1500 },
    { sku: "RM-9008", name: "Hefe frisch", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 3.20, sales: 0, vat: 7, min: 20, reorder: 40, max: 150, batch: true, expiry: true, shelfLifeDays: 14 },
    { sku: "RM-9009", name: "Erdbeeren TK", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 4.10, sales: 0, vat: 7, min: 100, reorder: 180, max: 800, batch: true, expiry: true, shelfLifeDays: 540 },
    { sku: "RM-9010", name: "Zucker weiß", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 0.95, sales: 0, vat: 7, min: 150, reorder: 250, max: 1000 },
    { sku: "RM-9011", name: "Pektin", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 12.50, sales: 0, vat: 19, min: 10, reorder: 20, max: 80 },
    { sku: "RM-9012", name: "Kakaomasse", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 7.40, sales: 0, vat: 7, min: 25, reorder: 50, max: 200 },
    { sku: "RM-9013", name: "Äpfel zur Saftproduktion", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 1.10, sales: 0, vat: 7, min: 300, reorder: 500, max: 2000, batch: true, expiry: true, shelfLifeDays: 30 },
    { sku: "RM-9014", name: "Gouda Block 4,5kg", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 5.60, sales: 0, vat: 7, min: 100, reorder: 180, max: 700, batch: true, expiry: true, shelfLifeDays: 60 },
    { sku: "RM-9015", name: "Dinkelvollkornmehl", cat: "Zutaten", type: "RAW_MATERIAL", unit: "kg", purchase: 1.15, sales: 0, vat: 7, min: 80, reorder: 150, max: 600 },
    // Packaging
    { sku: "PK-9501", name: "Vakuumbeutel 500g", cat: "Verpackung", type: "RAW_MATERIAL", unit: "pcs", purchase: 0.08, sales: 0, vat: 19, min: 2000, reorder: 5000, max: 40000 },
    { sku: "PK-9502", name: "Becher 500g mit Deckel", cat: "Verpackung", type: "RAW_MATERIAL", unit: "pcs", purchase: 0.11, sales: 0, vat: 19, min: 1500, reorder: 4000, max: 30000 },
    { sku: "PK-9503", name: "Karton 12er Getränk", cat: "Verpackung", type: "RAW_MATERIAL", unit: "pcs", purchase: 0.35, sales: 0, vat: 19, min: 400, reorder: 900, max: 6000 },
    { sku: "PK-9504", name: "Etiketten Lebensmittelinformation", cat: "Verpackung", type: "RAW_MATERIAL", unit: "pcs", purchase: 0.02, sales: 0, vat: 19, min: 3000, reorder: 8000, max: 60000 },
  ];
  const products = new Map<string, string>(); // sku -> id
  for (const p of productData) {
    const row = await prisma.product.create({
      data: {
        companyId: de.id,
        sku: p.sku,
        barcode: `40${intBetween(10000000000, 99999999999)}`,
        name: p.name,
        shortDescription: `${p.name} — NEXORA Hausmarke`,
        categoryId: categories.get(p.cat),
        productType: p.type,
        unit: p.unit,
        purchasePrice: p.purchase,
        salesPrice: p.sales,
        taxRate: p.vat,
        minStock: p.min,
        maxStock: p.max,
        reorderPoint: p.reorder,
        isBatchTracked: p.batch ?? false,
        isExpiryTracked: p.expiry ?? false,
        shelfLifeDays: p.shelfLifeDays,
        weightKg: p.weightKg,
        status: "ACTIVE",
        supplierId: p.sku.startsWith("RM-9") ? pick(suppliers).id : null,
      },
    });
    products.set(p.sku, row.id);
  }
  const pid = (sku: string) => products.get(sku)!;
  const finishedSkus = ["FG-1001", "FG-1002", "FG-1003", "FG-2001", "FG-2002", "FG-2003", "FG-3001", "FG-3002", "FG-4001", "FG-4002", "FG-5001"];

  // ------------------------------------------------------------ warehouses
  const wh1 = await prisma.warehouse.create({
    data: { companyId: de.id, code: "WH01", name: "Hauptlager", street: "Am Lebensmittelzentrum 12", city: "Düsseldorf", postalCode: "40213", country: "DE", isDefault: true, managerId: warehouse.employee.id },
  });
  const wh2 = await prisma.warehouse.create({
    data: { companyId: de.id, code: "WH02", name: "Kühlhaus", street: "Kühlweg 3", city: "Düsseldorf", postalCode: "40215", country: "DE", managerId: warehouse.employee.id },
  });
  const wh3 = await prisma.warehouse.create({
    data: { companyId: de.id, code: "WH03", name: "Verpackungslager", street: "Am Lebensmittelzentrum 8", city: "Düsseldorf", postalCode: "40213", country: "DE" },
  });
  const locations = new Map<string, string>();
  const locationDefs: [string, string, string, string, string][] = [
    [wh1.id, "A-01-01", "A", "01", "Regal 1 — Wurstwaren"],
    [wh1.id, "A-01-02", "A", "01", "Regal 2 — Molkerei"],
    [wh1.id, "A-02-01", "A", "02", "Regal 1 — Backwaren"],
    [wh1.id, "B-01-01", "B", "01", "Regal 1 — Süßwaren"],
    [wh1.id, "B-02-01", "B", "02", "Regal 1 — Getränke"],
    [wh2.id, "K-01-01", "K", "01", "Kühlregal 1 — Rohstoffe"],
    [wh2.id, "K-02-01", "K", "02", "Kühlregal 2 — Fleisch"],
    [wh3.id, "P-01-01", "P", "01", "Palettenregal — Beutel"],
    [wh3.id, "P-01-02", "P", "01", "Palettenregal — Kartons"],
  ];
  for (const [wh, code, zone, aisle, desc] of locationDefs) {
    const loc = await prisma.warehouseLocation.create({
      data: { warehouseId: wh, code, zone, aisle, rack: aisle, description: desc },
    });
    locations.set(code, loc.id);
  }

  // ------------------------------------------------------------ work centers
  const workCenters = new Map<string, string>();
  for (const [code, name, dept, cap, cost] of [
    ["WC-CUT", "Schneiderei", "Produktion", 1200, 65],
    ["WC-COOK", "Kocherei", "Produktion", 900, 78],
    ["WC-DAIRY", "Molkerei", "Produktion", 2000, 55],
    ["WC-BAKE", "Bäckerei", "Produktion", 800, 60],
    ["WC-PACK", "Abpackung", "Produktion", 2500, 48],
  ] as [string, string, string, number, number][]) {
    const wc = await prisma.workCenter.create({
      data: { companyId: de.id, code, name, department: dept, capacityPerDay: cap, hourlyCost: cost, status: "ACTIVE" },
    });
    workCenters.set(code, wc.id);
  }

  // ------------------------------------------------------------ bills of materials
  async function createBom(fgSku: string, name: string, items: [string, number][]) {
    const bom = await prisma.bom.create({
      data: { companyId: de.id, productId: pid(fgSku), version: 1, name, status: "ACTIVE" },
    });
    for (const [componentSku, qty] of items) {
      const component = productData.find((p) => p.sku === componentSku)!;
      await prisma.bomItem.create({
        data: {
          bomId: bom.id, componentProductId: pid(componentSku),
          quantity: qty, unit: component.unit,
          wastePercent: rnd() < 0.3 ? round2(between(1, 4)) : 0,
        },
      });
    }
    return bom;
  }
  await createBom("FG-1001", "Wiener Würstchen — Standardrezeptur", [
    ["RM-9001", 0.55], ["RM-9002", 0.15], ["RM-9003", 0.1], ["RM-9004", 0.03], ["PK-9501", 1],
  ]);
  await createBom("FG-1002", "Leberkäse — Hausrezeptur", [
    ["RM-9001", 0.6], ["RM-9003", 0.3], ["RM-9004", 0.025], ["PK-9501", 1],
  ]);
  await createBom("FG-1003", "Salami Rheinländer", [
    ["RM-9001", 0.18], ["RM-9003", 0.05], ["RM-9004", 0.006], ["PK-9501", 1],
  ]);
  await createBom("FG-2001", "Gouda Scheiben", [
    ["RM-9014", 0.26], ["PK-9502", 0],
  ]);
  await createBom("FG-2002", "Joghurt Erdbeere", [
    ["RM-9005", 0.85], ["RM-9006", 0.005], ["RM-9009", 0.08], ["RM-9010", 0.04], ["PK-9502", 1],
  ]);
  await createBom("FG-2003", "Speisequark", [
    ["RM-9005", 0.9], ["RM-9006", 0.004], ["PK-9502", 1],
  ]);
  await createBom("FG-3001", "Vollkornbrötchen TK", [
    ["RM-9015", 1.8], ["RM-9008", 0.06], ["RM-9010", 0.05],
  ]);
  await createBom("FG-3002", "Butterkuchen TK", [
    ["RM-9007", 1.2], ["RM-9010", 0.3], ["RM-9008", 0.04],
  ]);
  await createBom("FG-4001", "Rote Grütze", [
    ["RM-9009", 0.25], ["RM-9010", 0.09], ["RM-9011", 0.008], ["PK-9502", 1],
  ]);
  await createBom("FG-4002", "Schoko-Riegel", [
    ["RM-9012", 0.35], ["RM-9010", 0.2], ["RM-9007", 0.15],
  ]);
  await createBom("FG-5001", "Apfelsaft direkt", [
    ["RM-9013", 1.45], ["PK-9503", 1], ["PK-9504", 12],
  ]);

  // ------------------------------------------------------------ opening stock
  const openingDate = daysAgo(190, 6);
  const packagingSkus = ["PK-9501", "PK-9502", "PK-9503", "PK-9504"];
  for (const p of productData) {
    const id = pid(p.sku);
    // All inputs (raw materials + packaging) are stocked in the main warehouse
    // so production orders (which reserve from their output warehouse) can
    // always cover their BOM. Generous opening quantities keep the 6-month
    // simulation from draining stock.
    if (!p.sku.startsWith("FG-")) {
      const qty = intBetween(p.max * 0.55, p.max * 0.9);
      await adjustStock(prisma, {
        companyId: de.id, productId: id, warehouseId: wh1.id, quantity: qty,
        reason: "Anfangsbestand", userId: warehouse.user.id, type: "OPENING_STOCK", createdAt: openingDate,
      });
      continue;
    }
    // finished goods: stock in WH01, some chilled in WH02
    const qty = intBetween(p.reorder * 1.5, p.max * 0.9);
    await adjustStock(prisma, {
      companyId: de.id, productId: id, warehouseId: wh1.id, quantity: qty,
      reason: "Anfangsbestand", userId: warehouse.user.id, type: "OPENING_STOCK", createdAt: openingDate,
    });
    if (["FG-1001", "FG-1002", "FG-2002"].includes(p.sku)) {
      await adjustStock(prisma, {
        companyId: de.id, productId: id, warehouseId: wh2.id, quantity: intBetween(50, 200),
        reason: "Anfangsbestand Kühlhaus", userId: warehouse.user.id, type: "OPENING_STOCK", createdAt: openingDate,
      });
    }
  }

  // ------------------------------------------------------------ settings
  await prisma.setting.createMany({
    data: [
      { companyId: de.id, key: "ui.defaultWarehouse", value: wh1.id },
      { companyId: de.id, key: "notifications.lowStock", value: "true" },
      { companyId: de.id, key: "notifications.invoiceOverdue", value: "true" },
      { companyId: rs.id, key: "ui.defaultWarehouse", value: "" },
    ],
  });

  // ============================================================ simulation
  // ~6 months of business activity, all through the real services.
  const fg = (sku: string) => ({ productId: pid(sku), unitPrice: productData.find((p) => p.sku === sku)!.sales, taxRate: productData.find((p) => p.sku === sku)!.vat });

  async function backdate(model: "salesOrder" | "purchaseOrder" | "productionOrder" | "invoice" | "shipment" | "salesQuote", id: string, data: Record<string, Date | null>) {
    // @ts-expect-error dynamic model access with partial date payloads
    await prisma[model].update({ where: { id }, data });
  }

  const supplierForCategory = (cat: string) => {
    const map: Record<string, number> = {
      "Fleisch & Wurstwaren": 0, Milchprodukte: 1, Zutaten: 2, Verpackung: 3,
      Backwaren: 4, Süßwaren: 7, Getränke: 6,
    };
    return suppliers[map[cat] ?? 2];
  };

  for (let month = 5; month >= 0; month--) {
    const baseDaysAgo = month * 30 + 20; // within that month
    const date = (offset: number, hour = 9) => daysAgo(baseDaysAgo - offset, hour);

    // ---------------- purchasing: 2 POs per month ----------------
    for (let k = 0; k < 2; k++) {
      const supplier = pick(suppliers.slice(0, 6));
      const sku = pick(["RM-9001", "RM-9002", "RM-9005", "RM-9007", "RM-9009", "RM-9010", "RM-9013", "RM-9014", "PK-9501", "PK-9502"]);
      const meta = productData.find((p) => p.sku === sku)!;
      const qty = intBetween(meta.reorder, meta.max * 0.6);
      const po = await createPurchaseOrder(prisma, {
        ...ctx, userId: purchasing.user.id, supplierId: supplier.id,
        orderDate: date(k * 6, 9),
        expectedDeliveryDate: date(k * 6 + 5, 8),
        paymentTermDays: supplier.term,
        items: [{ productId: pid(sku), quantity: qty, unitPrice: meta.purchase, taxRate: meta.vat }],
      });
      await purchaseOrderAction(prisma, { ...ctx, userId: purchasing.user.id, purchaseOrderId: po.id, action: "send" })
        .catch(() => {});
      await backdate("purchaseOrder", po.id, { createdAt: date(k * 6, 9) });
      if (month > 0) {
        // older months: confirm + full receipt
        await purchaseOrderAction(prisma, { ...ctx, userId: purchasing.user.id, purchaseOrderId: po.id, action: "confirm" })
          .catch(() => {});
        await receivePurchaseOrder(prisma, {
          ...ctx, userId: warehouse.user.id, purchaseOrderId: po.id,
          receivedAt: date(k * 6 + 5, 11),
          lines: po.items.map((it: any) => ({
            itemId: it.id, quantity: it.quantity,
            batchNumber: `B${intBetween(10000, 99999)}`,
            expiryDate: meta.expiry ? new Date(date(k * 6 + 5).getTime() + (meta.shelfLifeDays ?? 30) * DAY).toISOString() : undefined,
          })),
        });
      } else if (k === 0) {
        // current month: one PO confirmed but not yet delivered, one still DRAFT-ish (sent)
        await purchaseOrderAction(prisma, { ...ctx, userId: purchasing.user.id, purchaseOrderId: po.id, action: "confirm" })
          .catch(() => {});
      }
    }

    // ---------------- quotes: 2 per month ----------------
    const quotePlans = [
      { customer: pick(customers), skus: [pick(finishedSkus), pick(finishedSkus)], fate: month > 0 ? (rnd() < 0.75 ? "convert" : "reject") : rnd() < 0.5 ? "send" : "draft" },
      { customer: pick(customers), skus: [pick(finishedSkus)], fate: month > 0 ? (rnd() < 0.5 ? "convert" : "lose") : "sent" },
    ];
    for (const plan of quotePlans) {
      try {
        const q = await createQuote(prisma, {
          ...ctx, userId: sales.user.id, customerId: plan.customer.id,
          issueDate: date(2, 10),
          validUntil: date(-25, 10),
          items: plan.skus.map((sku) => ({ ...fg(sku), quantity: intBetween(40, 300), discountPercent: pick([0, 0, 3, 5]) })),
        });
        await backdate("salesQuote", q.id, { createdAt: date(2, 10) });
        if (plan.fate === "convert" || plan.fate === "send" || plan.fate === "sent") {
          await quoteAction(prisma, { ...ctx, userId: sales.user.id, quoteId: q.id, action: "send" });
          if (plan.fate === "convert") {
            await quoteAction(prisma, { ...ctx, userId: sales.user.id, quoteId: q.id, action: "accept" });
            await convertQuoteToOrder(prisma, { ...ctx, userId: sales.user.id, quoteId: q.id });
            await backdate("salesQuote", q.id, { convertedAt: date(6, 14) });
          }
        } else if (plan.fate === "reject" || plan.fate === "lose") {
          await quoteAction(prisma, { ...ctx, userId: sales.user.id, quoteId: q.id, action: "send" });
          await quoteAction(prisma, { ...ctx, userId: sales.user.id, quoteId: q.id, action: rnd() < 0.5 ? "reject" : "expire" });
        }
      } catch { /* keep seeding even if one quote hits an edge */ }
    }

    // ---------------- sales orders: 4 per month ----------------
    for (let k = 0; k < 4; k++) {
      const customer = pick(customers);
      const skus = [pick(finishedSkus)];
      if (rnd() < 0.6) skus.push(pick(finishedSkus));
      if (rnd() < 0.25) skus.push(pick(finishedSkus));
      const orderDate = date(k * 5 + 1, 11);
      try {
        const order = await createOrder(prisma, {
          ...ctx, userId: sales.user.id, customerId: customer.id,
          orderDate, requestedDeliveryDate: date(k * 5 + 8, 8),
          salesRepId: sales.employee.id,
          shippingCost: rnd() < 0.3 ? round2(between(8, 35)) : 0,
          notes: rnd() < 0.2 ? "Lieferung nur vormittags." : null,
          items: skus.map((sku) => {
            const base = fg(sku);
            return { ...base, quantity: intBetween(30, 260), discountPercent: pick([0, 0, 0, 3, 5]) };
          }),
        });
        await backdate("salesOrder", order.id, { createdAt: orderDate });

        const monthsAgoIsOld = month > 1; // fully process orders older than ~2 months
        const partial = month === 1 && k === 0; // one partial shipment
        if (monthsAgoIsOld || (month === 1 && partial)) {
          await salesOrderAction(prisma, { ...ctx, userId: sales.user.id, orderId: order.id, action: "approve" });
          await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "reserve" });
          if (partial) {
            // ship only part of the lines → PARTIALLY_SHIPPED
            const lines = order.items.map((it: any, idx: number) => ({ itemId: it.id, quantity: idx === 0 ? it.quantity : Math.floor(it.quantity / 2) }));
            await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "ship", shipLines: lines, carrier: pick(["DHL", "Dachser", "Spedition Rhein"]) });
          } else {
            await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "startPicking" });
            await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "pack" });
            await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "ship", carrier: pick(["DHL", "Dachser", "Spedition Rhein"]) });
            await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "complete" });
          }
          const shippedAt = date(k * 5 + 6, 13);
          await backdate("salesOrder", order.id, {
            confirmedAt: date(k * 5 + 2, 9), shippedAt, completedAt: shippedAt,
          });

          // invoice + payment for shipped orders
          const issueDate = new Date(shippedAt.getTime() + DAY);
          const invoice = await createInvoiceFromOrder(prisma, {
            ...ctx, userId: finance.user.id, orderId: order.id, issueDate,
          });
          await invoiceAction(prisma, { ...ctx, userId: finance.user.id, invoiceId: invoice.id, action: "issue" });
          await backdate("invoice", invoice.id, { createdAt: issueDate, issuedAt: issueDate });
          const roll = rnd();
          if (roll < 0.62) {
            await registerPayment(prisma, {
              ...ctx, userId: finance.user.id, invoiceId: invoice.id,
              amount: invoice.total, method: pick(["BANK_TRANSFER", "BANK_TRANSFER", "CARD"]),
              paidAt: new Date(issueDate.getTime() + intBetween(5, 30) * DAY),
              reference: `SEPA-${intBetween(100000, 999999)}`,
            });
          } else if (roll < 0.8) {
            await registerPayment(prisma, {
              ...ctx, userId: finance.user.id, invoiceId: invoice.id,
              amount: round2(invoice.total * between(0.3, 0.6)),
              method: "BANK_TRANSFER", paidAt: new Date(issueDate.getTime() + intBetween(5, 20) * DAY),
              reference: `SEPA-${intBetween(100000, 999999)}`,
            });
          }
        } else if (month <= 1) {
          // recent orders: leave in various in-flight states
          const state = month === 1 ? pick(["draft", "confirmed", "reserved"]) : pick(["draft", "confirmed", "reserved", "picking", "packed"]);
          if (state !== "draft") {
            await salesOrderAction(prisma, { ...ctx, userId: sales.user.id, orderId: order.id, action: "approve" });
            await backdate("salesOrder", order.id, { confirmedAt: date(k * 5 + 2, 9) });
          }
          if (state === "reserved" || state === "picking" || state === "packed") {
            await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "reserve" });
          }
          if (state === "picking" || state === "packed") {
            await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "startPicking" });
          }
          if (state === "packed") {
            await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "pack" });
          }
        }
      } catch (e) {
        console.warn(`   ⚠ sales order skipped: ${(e as Error).message}`);
      }
    }

    // ---------------- production: 2 MOs per month ----------------
    for (let k = 0; k < 2; k++) {
      const sku = pick(finishedSkus);
      const meta = productData.find((p) => p.sku === sku)!;
      const qty = intBetween(Math.max(80, meta.reorder / 3), meta.reorder);
      try {
        const plannedStart = date(k * 8 + 3, 6);
        const mo = await createProductionOrder(prisma, {
          ...ctx, userId: production.user.id, productId: pid(sku), quantity: qty,
          workCenterId: workCenters.get(pick(["WC-CUT", "WC-COOK", "WC-DAIRY", "WC-BAKE", "WC-PACK"]))!,
          responsibleId: production.employee.id,
          priority: pick(["NORMAL", "NORMAL", "HIGH", "LOW"]),
          plannedStart, plannedEnd: new Date(plannedStart.getTime() + 2 * DAY),
        });
        await backdate("productionOrder", mo.id, { createdAt: plannedStart });
        if (month > 0) {
          await productionOrderAction(prisma, { ...ctx, userId: production.user.id, productionOrderId: mo.id, action: "release" });
          await productionOrderAction(prisma, { ...ctx, userId: production.user.id, productionOrderId: mo.id, action: "start" });
          await productionOrderAction(prisma, { ...ctx, userId: production.user.id, productionOrderId: mo.id, action: "finishProduction", producedQuantity: qty });
          // quality check on the produced batch
          const inspection = await createInspection(prisma, {
            ...ctx, userId: quality.user.id, productId: pid(sku), quantity: qty,
            sourceType: "PRODUCTION", sourceId: mo.id, productionOrderId: mo.id,
            inspectedAt: new Date(plannedStart.getTime() + 3 * DAY),
            batchNumber: `B${intBetween(10000, 99999)}`,
            notes: "Sichtprüfung, Gewichtskontrolle und Sensorik gemäß Prüfplan.",
          });
          const pass = rnd() > 0.12;
          await recordInspectionResult(prisma, {
            ...ctx, userId: quality.user.id, inspectionId: inspection.id,
            result: pass ? "PASS" : "CONDITIONAL",
            measurements: [
              { criterion: "Aussehen", value: pass ? "io" : "bedingt io", ok: true },
              { criterion: "Gewicht (Soll/Ist)", value: `${qty} / ${qty}`, ok: true },
              { criterion: "Temperatur", value: `${(between(2, 6)).toFixed(1)} °C`, ok: true },
            ],
          });
          if (!pass) {
            await prisma.qualityInspection.update({
              where: { id: inspection.id },
              data: { notes: "Kleine Etikettenverschiebung — Nacharbeit veranlasst, Freigabe unter Auflagen." },
            });
          }
          await productionOrderAction(prisma, { ...ctx, userId: production.user.id, productionOrderId: mo.id, action: "complete" });
          const actualEnd = new Date(plannedStart.getTime() + 3 * DAY);
          await backdate("productionOrder", mo.id, { actualStart: plannedStart, actualEnd });
        } else if (k === 0) {
          // current month: one MO in progress, one still planned
          await productionOrderAction(prisma, { ...ctx, userId: production.user.id, productionOrderId: mo.id, action: "release" });
          await productionOrderAction(prisma, { ...ctx, userId: production.user.id, productionOrderId: mo.id, action: "start" });
        }
      } catch (e) {
        console.warn(`   ⚠ production order skipped: ${(e as Error).message}`);
      }
    }

    // ---------------- transfers & stocktake ----------------
    if (rnd() < 0.7) {
      const sku = pick(["FG-1001", "FG-1002", "FG-2002"]);
      try {
        await transferStock(prisma, {
          ...ctx, productId: pid(sku), fromWarehouseId: wh1.id, toWarehouseId: wh2.id,
          quantity: intBetween(20, 80), userId: warehouse.user.id,
          note: "Nachschub Kühlhaus",
        });
      } catch { /* insufficient stock edge — ignore */ }
    }
  }

  // ---------------- current-month extras ----------------
  // A failed incoming-goods inspection with quarantine (quality module demo)
  {
    const sku = "RM-9001";
    const supplier = supplierForCategory("Fleisch & Wurstwaren");
    const meta = productData.find((p) => p.sku === sku)!;
    const po = await createPurchaseOrder(prisma, {
      ...ctx, userId: purchasing.user.id, supplierId: supplier.id,
      orderDate: daysAgo(9, 9), expectedDeliveryDate: daysAgo(3, 8),
      items: [{ productId: pid(sku), quantity: 400, unitPrice: meta.purchase, taxRate: meta.vat }],
      notes: "Eilauftrag — Bestand unter Minimum.",
    });
    await purchaseOrderAction(prisma, { ...ctx, userId: purchasing.user.id, purchaseOrderId: po.id, action: "send" });
    await purchaseOrderAction(prisma, { ...ctx, userId: purchasing.user.id, purchaseOrderId: po.id, action: "confirm" });
    await receivePurchaseOrder(prisma, {
      ...ctx, userId: warehouse.user.id, purchaseOrderId: po.id, receivedAt: daysAgo(3, 11),
      lines: po.items.map((it: any) => ({ itemId: it.id, quantity: it.quantity, batchNumber: `B${intBetween(10000, 99999)}` })),
    });
    const inspection = await createInspection(prisma, {
      ...ctx, userId: quality.user.id, productId: pid(sku), quantity: 120,
      sourceType: "GOODS_RECEIPT", sourceId: po.id,
      inspectedAt: daysAgo(2, 14), batchNumber: "B77123",
      notes: "Warenschlüssel-Prüfung bei Anlieferung — Temperaturdokumentation auffällig.",
    });
    await recordInspectionResult(prisma, {
      ...ctx, userId: quality.user.id, inspectionId: inspection.id, result: "FAIL",
      quarantineQty: 120, warehouseId: wh1.id,
      measurements: [
        { criterion: "Kerntemperatur bei Anlieferung", value: "8,4 °C (max. 7 °C)", ok: false },
        { criterion: "Verpackung intakt", value: "io", ok: true },
        { criterion: "Mindesthaltbarkeit", value: "io", ok: true },
      ],
      notes: "Kerntemperatur zu hoch — Charge gesperrt, Rücksprache mit Lieferant.",
    });
  }

  // One deliberately overdue, unpaid invoice (finance module demo)
  {
    const customer = customers[3];
    const order = await createOrder(prisma, {
      ...ctx, userId: sales.user.id, customerId: customer.id,
      orderDate: daysAgo(75, 10), requestedDeliveryDate: daysAgo(68, 8),
      salesRepId: sales.employee.id,
      items: [{ ...fg("FG-1001"), quantity: 180 }, { ...fg("FG-2002"), quantity: 240 }],
    });
    await salesOrderAction(prisma, { ...ctx, userId: sales.user.id, orderId: order.id, action: "approve" });
    await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "reserve" });
    await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "startPicking" });
    await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "pack" });
    await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "ship", carrier: "Dachser" });
    await salesOrderAction(prisma, { ...ctx, userId: warehouse.user.id, orderId: order.id, action: "complete" });
    const issueDate = daysAgo(52, 9);
    const invoice = await createInvoiceFromOrder(prisma, { ...ctx, userId: finance.user.id, orderId: order.id, issueDate });
    await invoiceAction(prisma, { ...ctx, userId: finance.user.id, invoiceId: invoice.id, action: "issue" });
    await backdate("salesOrder", order.id, { createdAt: daysAgo(75), confirmedAt: daysAgo(73), shippedAt: daysAgo(66), completedAt: daysAgo(65) });
    await backdate("invoice", invoice.id, { createdAt: issueDate, issuedAt: issueDate });
  }
  await markOverdueInvoices(de.id);

  // One low-stock raw material (MRP demo): drain Äpfel far below reorder point
  {
    const item = await prisma.inventoryItem.findFirst({
      where: { companyId: de.id, productId: pid("RM-9013") },
    });
    if (item) {
      await prisma.inventoryMovement.create({
        data: {
          companyId: de.id, movementNumber: `MV-ADJ-${intBetween(1000, 9999)}`,
          type: "ADJUSTMENT", productId: pid("RM-9013"), warehouseId: item.warehouseId,
          quantity: -Math.max(0, item.physicalQty - 80),
          referenceType: "Manual", referenceNumber: null,
          note: "Abschluss Bestandskorrektur nach Inventur", userId: warehouse.user.id,
        },
      });
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { physicalQty: 80 },
      });
    }
  }

  // ---------------- tasks ----------------
  const taskDefs: { title: string; desc: string; status: string; prio: string; assignee: string; due: Date; entity?: [string, string] }[] = [
    { title: "Saisonal-Angebot Weihnachtsgeschäft erstellen", desc: "Angebotsvorlage für Großhandel inkl. Rabattstaffel vorbereiten.", status: "IN_PROGRESS", prio: "HIGH", assignee: sales.user.id, due: daysAgo(-7, 16) },
    { title: "Rückruf-Simulation mit QA durchspielen", desc: "Charge B77123Charge nachziehen, Traceability-Report erzeugen.", status: "TODO", prio: "URGENT", assignee: quality.user.id, due: daysAgo(1, 12), entity: ["QualityInspection", ""] },
    { title: "Jahresinventur WH01 planen", desc: "Termine, Teams und Zähllisten vorbereiten; Scanner einplanen.", status: "TODO", prio: "NORMAL", assignee: warehouse.user.id, due: daysAgo(-21, 12) },
    { title: "Lieferantenbewertung Q4 aktualisieren", desc: "Bewertung aller A-Lieferanten inkl. IFS-Status prüfen.", status: "WAITING", prio: "NORMAL", assignee: purchasing.user.id, due: daysAgo(-14, 12) },
    { title: "Überfällige Rechnung mahnen", desc: "Mahnstufe 1 vorbereiten und telefonisch nachfassen.", status: "TODO", prio: "HIGH", assignee: finance.user.id, due: daysAgo(2, 10) },
    { title: "Wartung Kochkessel WC-COOK", desc: "Quartalswartung mit externem Dienstleister abstimmen.", status: "WAITING", prio: "LOW", assignee: production.user.id, due: daysAgo(-10, 9) },
    { title: "Onboarding neue QS-Mitarbeiterin", desc: "Einarbeitungsplan und Prüfplan-Schulung abgeschlossen.", status: "COMPLETED", prio: "NORMAL", assignee: quality.user.id, due: daysAgo(12, 12) },
  ];
  for (const t of taskDefs) {
    await prisma.task.create({
      data: {
        companyId: de.id, title: t.title, description: t.desc, status: t.status, priority: t.prio,
        assigneeId: t.assignee, createdById: admin.user.id, dueDate: t.due,
        completedAt: t.status === "COMPLETED" ? daysAgo(11, 15) : null,
        createdAt: daysAgo(intBetween(3, 20), 9),
      },
    });
  }

  // ---------------- welcome notifications (unread) ----------------
  for (const u of [admin, sales, purchasing, warehouse, production, quality, finance]) {
    await notifyUsers(prisma, {
      companyId: de.id, userIds: [u.user.id], type: "SYSTEM",
      title: "Willkommen bei NEXORA ERP 👋",
      body: "Dies ist die Demoumgebung mit realistischen Belegdaten. Nutzen Sie die Suche (Strg+K) und das Dashboard als Einstieg.",
      priority: "LOW",
    });
  }

  // Welcome audit entry
  await logAudit(prisma, {
    companyId: de.id, userId: admin.user.id, action: "CREATED",
    entityType: "Company", entityId: de.id,
    summary: `Demo-Datenbank für ${de.legalName} initialisiert`,
    after: { customers: customers.length + 1, products: productData.length, suppliers: suppliers.length },
  });

  // ============================================================ company 2 (RS)
  {
    const ctx2 = { companyId: rs.id };
    const whRs = await prisma.warehouse.create({
      data: { companyId: rs.id, code: "WH01", name: "Glavni magacin", city: "Beograd", country: "RS", isDefault: true },
    });
    const catRs = await prisma.productCategory.create({ data: { companyId: rs.id, name: "Pekara" } });
    const prodRs = await prisma.product.create({
      data: {
        companyId: rs.id, sku: "FG-7001", name: "Bela hleb 500g", productType: "FINISHED_GOOD",
        unit: "pcs", purchasePrice: 45, salesPrice: 75, taxRate: 10,
        minStock: 100, reorderPoint: 200, maxStock: 1000, categoryId: catRs.id, status: "ACTIVE",
      },
    });
    const prodRs2 = await prisma.product.create({
      data: {
        companyId: rs.id, sku: "FG-7002", name: "Kiflice 10kom", productType: "FINISHED_GOOD",
        unit: "pcs", purchasePrice: 60, salesPrice: 110, taxRate: 10,
        minStock: 80, reorderPoint: 150, maxStock: 800, categoryId: catRs.id, status: "ACTIVE",
      },
    });
    const supRs = await prisma.supplier.create({
      data: { companyId: rs.id, supplierNumber: "L-00001", companyName: "Mlin Pančevo", city: "Pančevo", country: "RS", paymentTermDays: 15, status: "ACTIVE" },
    });
    const custRs = await prisma.customer.create({
      data: {
        companyId: rs.id, customerNumber: "K-00001", companyName: "Marketić d.o.o.",
        billingStreet: "Kneza Miloša 45", billingCity: "Beograd", billingPostalCode: "11000", billingCountry: "RS",
        paymentTermDays: 30, creditLimit: 500000, status: "ACTIVE",
      },
    });
    await adjustStock(prisma, {
      ...ctx2, productId: prodRs.id, warehouseId: whRs.id, quantity: 600,
      reason: "Početni stanje", userId: admin.user.id, type: "OPENING_STOCK",
    });
    await adjustStock(prisma, {
      ...ctx2, productId: prodRs2.id, warehouseId: whRs.id, quantity: 400,
      reason: "Početni stanje", userId: admin.user.id, type: "OPENING_STOCK",
    });
    const poRs = await createPurchaseOrder(prisma, {
      ...ctx2, userId: admin.user.id, supplierId: supRs.id,
      items: [{ productId: prodRs.id, quantity: 300, unitPrice: 45, taxRate: 10 }],
    });
    await purchaseOrderAction(prisma, { ...ctx2, userId: admin.user.id, purchaseOrderId: poRs.id, action: "send" });
    const orderRs = await createOrder(prisma, {
      ...ctx2, userId: admin.user.id, customerId: custRs.id,
      items: [
        { productId: prodRs.id, quantity: 120, unitPrice: 75, taxRate: 10 },
        { productId: prodRs2.id, quantity: 80, unitPrice: 110, taxRate: 10 },
      ],
    });
    await salesOrderAction(prisma, { ...ctx2, userId: admin.user.id, orderId: orderRs.id, action: "approve" });
  }

  // ------------------------------------------------------------ summary
  const counts = {
    users: await prisma.user.count(),
    companies: await prisma.company.count(),
    customers: await prisma.customer.count(),
    suppliers: await prisma.supplier.count(),
    products: await prisma.product.count(),
    purchaseOrders: await prisma.purchaseOrder.count(),
    goodsReceipts: await prisma.goodsReceipt.count(),
    salesQuotes: await prisma.salesQuote.count(),
    salesOrders: await prisma.salesOrder.count(),
    shipments: await prisma.shipment.count(),
    invoices: await prisma.invoice.count(),
    payments: await prisma.payment.count(),
    productionOrders: await prisma.productionOrder.count(),
    inspections: await prisma.qualityInspection.count(),
    movements: await prisma.inventoryMovement.count(),
    tasks: await prisma.task.count(),
    notifications: await prisma.notification.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  console.log("✅ Seed complete:");
  for (const [k, v] of Object.entries(counts)) console.log(`   ${k.padEnd(18)} ${v}`);
  console.log("\n🔑 Demo logins (password: demo1234):");
  console.log("   admin@nexora.demo · verkauf@ · einkauf@ · lager@ · produktion@ · qualitaet@ · finanzen@ · viewer@nexora.demo");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

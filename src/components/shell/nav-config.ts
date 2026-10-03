import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Package, Boxes, Warehouse, ClipboardList,
  Factory, ClipboardCheck, Truck, FolderOpen, ListTodo, IdCard, ShieldCheck,
  Settings, Server, BarChart3, Building2, Receipt, CreditCard, ArrowLeftRight,
  Layers, Wrench, Calculator, ScrollText,
} from "lucide-react";

export type NavItem = {
  key: string; // i18n key
  href: string;
  icon: LucideIcon;
  permission: string;
};

export type NavGroup = {
  key: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "nav.overview",
    items: [
      { key: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.read" },
      { key: "nav.reports", href: "/reports/sales", icon: BarChart3, permission: "reports.read" },
    ],
  },
  {
    key: "nav.sales",
    items: [
      { key: "nav.customers", href: "/customers", icon: Users, permission: "customers.read" },
      { key: "nav.quotes", href: "/sales/quotes", icon: FileText, permission: "quotes.read" },
      { key: "nav.orders", href: "/sales/orders", icon: ClipboardList, permission: "sales.read" },
      { key: "nav.shipments", href: "/logistics", icon: Truck, permission: "logistics.read" },
      { key: "nav.invoices", href: "/sales/invoices", icon: Receipt, permission: "invoices.read" },
      { key: "nav.payments", href: "/sales/payments", icon: CreditCard, permission: "payments.read" },
    ],
  },
  {
    key: "nav.purchasing",
    items: [
      { key: "nav.suppliers", href: "/suppliers", icon: Building2, permission: "suppliers.read" },
      { key: "nav.purchaseOrders", href: "/purchasing/orders", icon: Package, permission: "purchasing.read" },
    ],
  },
  {
    key: "nav.inventory",
    items: [
      { key: "nav.products", href: "/products", icon: Package, permission: "products.read" },
      { key: "nav.categories", href: "/categories", icon: Layers, permission: "categories.read" },
      { key: "nav.stock", href: "/inventory", icon: Warehouse, permission: "inventory.read" },
      { key: "nav.movements", href: "/inventory/movements", icon: ArrowLeftRight, permission: "inventory.read" },
      { key: "nav.adjustments", href: "/inventory/adjustments", icon: ScrollText, permission: "inventory.read" },
      { key: "nav.transfers", href: "/inventory/transfers", icon: Truck, permission: "inventory.read" },
      { key: "nav.warehouses", href: "/warehouses", icon: Warehouse, permission: "warehouses.read" },
    ],
  },
  {
    key: "nav.production",
    items: [
      { key: "nav.productionOrders", href: "/production/orders", icon: Factory, permission: "production.read" },
      { key: "nav.boms", href: "/production/boms", icon: ClipboardCheck, permission: "boms.read" },
      { key: "nav.workCenters", href: "/production/work-centers", icon: Wrench, permission: "workcenters.read" },
      { key: "nav.mrp", href: "/production/mrp", icon: Calculator, permission: "mrp.read" },
      { key: "nav.quality", href: "/quality", icon: ShieldCheck, permission: "quality.read" },
    ],
  },
  {
    key: "nav.organization",
    items: [
      { key: "nav.employees", href: "/employees", icon: IdCard, permission: "employees.read" },
      { key: "nav.tasks", href: "/tasks", icon: ListTodo, permission: "tasks.read" },
      { key: "nav.documents", href: "/documents", icon: FolderOpen, permission: "documents.read" },
    ],
  },
  {
    key: "nav.administration",
    items: [
      { key: "nav.audit", href: "/audit", icon: ScrollText, permission: "audit.read" },
      { key: "nav.settings", href: "/settings", icon: Settings, permission: "settings.read" },
      { key: "nav.admin", href: "/admin", icon: Server, permission: "admin.read" },
    ],
  },
];

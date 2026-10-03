// ============================================================================
// Status catalogue, labels, colors and state machines.
// Statuses are stored as strings (SQLite) and enforced HERE + in Zod schemas.
// ============================================================================

export type StatusDef = { value: string; tone: StatusTone; label: string };

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

const def = (value: string, tone: StatusTone, label: string): StatusDef => ({ value, tone, label });

// ------------------------- Sales Order -------------------------
export const SALES_ORDER_STATUSES: StatusDef[] = [
  def("DRAFT", "neutral", "Draft"),
  def("CONFIRMED", "info", "Confirmed"),
  def("RESERVED", "primary", "Reserved"),
  def("PICKING", "warning", "Picking"),
  def("PACKED", "warning", "Packed"),
  def("PARTIALLY_SHIPPED", "warning", "Partially shipped"),
  def("SHIPPED", "info", "Shipped"),
  def("COMPLETED", "success", "Completed"),
  def("CANCELLED", "danger", "Cancelled"),
];

export const SALES_ORDER_ACTIONS: Record<
  string,
  { from: string[]; to: string | ((full: boolean) => string); permission: string }
> = {
  approve: { from: ["DRAFT"], to: "CONFIRMED", permission: "sales.approve" },
  reserve: { from: ["CONFIRMED"], to: "RESERVED", permission: "sales.update" },
  startPicking: { from: ["RESERVED"], to: "PICKING", permission: "sales.ship" },
  pack: { from: ["PICKING"], to: "PACKED", permission: "sales.ship" },
  ship: {
    from: ["RESERVED", "PICKING", "PACKED", "PARTIALLY_SHIPPED"],
    to: (full: boolean) => (full ? "SHIPPED" : "PARTIALLY_SHIPPED"),
    permission: "sales.ship",
  },
  complete: { from: ["SHIPPED"], to: "COMPLETED", permission: "sales.update" },
  cancel: {
    from: ["DRAFT", "CONFIRMED", "RESERVED"],
    to: "CANCELLED",
    permission: "sales.cancel",
  },
};

// ------------------------- Purchase Order -------------------------
export const PO_STATUSES: StatusDef[] = [
  def("DRAFT", "neutral", "Draft"),
  def("SENT", "info", "Sent"),
  def("CONFIRMED", "info", "Confirmed"),
  def("PARTIALLY_RECEIVED", "warning", "Partially received"),
  def("RECEIVED", "success", "Received"),
  def("CANCELLED", "danger", "Cancelled"),
];

export const PO_ACTIONS: Record<string, { from: string[]; to: string; permission: string }> = {
  send: { from: ["DRAFT"], to: "SENT", permission: "purchasing.update" },
  confirm: { from: ["DRAFT", "SENT"], to: "CONFIRMED", permission: "purchasing.update" },
  cancel: {
    from: ["DRAFT", "SENT", "CONFIRMED"],
    to: "CANCELLED",
    permission: "purchasing.cancel",
  },
};

// ------------------------- Quote -------------------------
export const QUOTE_STATUSES: StatusDef[] = [
  def("DRAFT", "neutral", "Draft"),
  def("SENT", "info", "Sent"),
  def("VIEWED", "info", "Viewed"),
  def("ACCEPTED", "success", "Accepted"),
  def("REJECTED", "danger", "Rejected"),
  def("EXPIRED", "warning", "Expired"),
  def("CONVERTED", "primary", "Converted"),
];

// ------------------------- Invoice -------------------------
export const INVOICE_STATUSES: StatusDef[] = [
  def("DRAFT", "neutral", "Draft"),
  def("ISSUED", "info", "Issued"),
  def("PARTIALLY_PAID", "warning", "Partially paid"),
  def("PAID", "success", "Paid"),
  def("OVERDUE", "danger", "Overdue"),
  def("CANCELLED", "danger", "Cancelled"),
];

// ------------------------- Shipment -------------------------
export const SHIPMENT_STATUSES: StatusDef[] = [
  def("PREPARING", "neutral", "Preparing"),
  def("PICKED", "info", "Picked"),
  def("PACKED", "info", "Packed"),
  def("SHIPPED", "primary", "Shipped"),
  def("IN_TRANSIT", "primary", "In transit"),
  def("DELIVERED", "success", "Delivered"),
  def("RETURNED", "danger", "Returned"),
  def("CANCELLED", "danger", "Cancelled"),
];

export const SHIPMENT_ACTIONS: Record<string, { from: string[]; to: string; permission: string }> = {
  pick: { from: ["PREPARING"], to: "PICKED", permission: "logistics.update" },
  pack: { from: ["PREPARING", "PICKED"], to: "PACKED", permission: "logistics.update" },
  ship: { from: ["PREPARING", "PICKED", "PACKED"], to: "SHIPPED", permission: "logistics.update" },
  startTransit: { from: ["SHIPPED"], to: "IN_TRANSIT", permission: "logistics.update" },
  deliver: { from: ["SHIPPED", "IN_TRANSIT"], to: "DELIVERED", permission: "logistics.update" },
  cancel: {
    from: ["PREPARING", "PICKED", "PACKED"],
    to: "CANCELLED",
    permission: "logistics.update",
  },
};

// ------------------------- Production Order -------------------------
export const PRODUCTION_STATUSES: StatusDef[] = [
  def("PLANNED", "neutral", "Planned"),
  def("RELEASED", "primary", "Released"),
  def("IN_PROGRESS", "info", "In progress"),
  def("PAUSED", "warning", "Paused"),
  def("QUALITY_CONTROL", "warning", "Quality control"),
  def("COMPLETED", "success", "Completed"),
  def("CANCELLED", "danger", "Cancelled"),
];

export const PRODUCTION_ACTIONS: Record<
  string,
  { from: string[]; to: string; permission: string }
> = {
  release: { from: ["PLANNED"], to: "RELEASED", permission: "production.release" },
  start: { from: ["RELEASED", "PAUSED"], to: "IN_PROGRESS", permission: "production.release" },
  pause: { from: ["IN_PROGRESS"], to: "PAUSED", permission: "production.release" },
  finishProduction: {
    from: ["IN_PROGRESS"],
    to: "QUALITY_CONTROL",
    permission: "production.complete",
  },
  complete: { from: ["QUALITY_CONTROL", "IN_PROGRESS"], to: "COMPLETED", permission: "production.complete" },
  cancel: {
    from: ["PLANNED", "RELEASED"],
    to: "CANCELLED",
    permission: "production.cancel",
  },
};

// ------------------------- Quality -------------------------
export const QUALITY_RESULTS: StatusDef[] = [
  def("PENDING", "warning", "Pending"),
  def("PASS", "success", "Pass"),
  def("FAIL", "danger", "Fail"),
  def("CONDITIONAL", "info", "Conditional"),
];

// ------------------------- Generic entity status -------------------------
export const ENTITY_STATUS: StatusDef[] = [
  def("ACTIVE", "success", "Active"),
  def("INACTIVE", "neutral", "Inactive"),
  def("PROSPECT", "info", "Prospect"),
  def("BLOCKED", "danger", "Blocked"),
  def("DRAFT", "neutral", "Draft"),
  def("DISCONTINUED", "danger", "Discontinued"),
  def("MAINTENANCE", "warning", "Maintenance"),
];

export const TASK_STATUSES: StatusDef[] = [
  def("TODO", "neutral", "To do"),
  def("IN_PROGRESS", "info", "In progress"),
  def("WAITING", "warning", "Waiting"),
  def("COMPLETED", "success", "Completed"),
];

export const PRIORITIES: StatusDef[] = [
  def("LOW", "neutral", "Low"),
  def("NORMAL", "info", "Normal"),
  def("HIGH", "warning", "High"),
  def("URGENT", "danger", "Urgent"),
];

export const MOVEMENT_TYPES: StatusDef[] = [
  def("PURCHASE_RECEIPT", "success", "Purchase receipt"),
  def("SALES_SHIPMENT", "info", "Sales shipment"),
  def("TRANSFER_OUT", "warning", "Transfer out"),
  def("TRANSFER_IN", "info", "Transfer in"),
  def("PRODUCTION_CONSUMPTION", "warning", "Production consumption"),
  def("PRODUCTION_OUTPUT", "success", "Production output"),
  def("ADJUSTMENT", "neutral", "Manual adjustment"),
  def("RETURN_IN", "info", "Customer return"),
  def("RETURN_OUT", "warning", "Return to supplier"),
  def("QUARANTINE_IN", "danger", "Quarantined"),
  def("QUARANTINE_OUT", "success", "Released from quarantine"),
  def("OPENING_STOCK", "neutral", "Opening stock"),
  def("STOCKTAKE", "neutral", "Stocktake"),
];

const ALL: StatusDef[] = [
  ...SALES_ORDER_STATUSES, ...PO_STATUSES, ...QUOTE_STATUSES, ...INVOICE_STATUSES,
  ...SHIPMENT_STATUSES, ...PRODUCTION_STATUSES, ...QUALITY_RESULTS, ...ENTITY_STATUS,
  ...TASK_STATUSES, ...PRIORITIES, ...MOVEMENT_TYPES,
];

const REGISTRY = new Map<string, StatusDef>(ALL.map((s) => [s.value, s]));

export function statusDef(value: string): StatusDef {
  return REGISTRY.get(value) ?? { value, tone: "neutral" as const, label: value };
}

/** Validity check for state-machine driven transitions. */
export function canTransition(
  machine: Record<string, { from: string[] }>,
  action: string,
  currentStatus: string
): boolean {
  const t = machine[action];
  if (!t) return false;
  return t.from.includes(currentStatus);
}

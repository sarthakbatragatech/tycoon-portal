// lib/constants/status.ts

export type OrderStatus =
  | "draft"
  | "submitted"
  | "pending"
  | "in_production"
  | "packed"
  | "partially_dispatched"
  | "dispatched"
  | "cancelled";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pending: "Pending",
  in_production: "In Production",
  packed: "Packed",
  partially_dispatched: "Partially Dispatched",
  dispatched: "Dispatched",
  cancelled: "Cancelled",
};

// Used in dropdowns (excludes draft/submitted which are system statuses)
export const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_production", label: "In production" },
  { value: "packed", label: "Packed" },
  { value: "partially_dispatched", label: "Partially dispatched" },
  { value: "dispatched", label: "Dispatched" },
  { value: "cancelled", label: "Cancelled" },
];

// Match Orders page colours
export const STATUS_COLORS: Record<string, string> = {
  pending: "#6b7280", // grey
  in_production: "#0f766e", // teal
  packed: "#8b5cf6", // purple
  partially_dispatched: "#f97316", // orange
  dispatched: "#22c55e", // green
  cancelled: "#ef4444", // red
};

export function getStatusLabel(status?: string | null) {
  if (!status) return "-";
  return (STATUS_LABELS as any)[status] || status;
}

export function getStatusColor(status?: string | null) {
  if (!status) return "#6b7280";
  return (STATUS_COLORS as any)[status] || "#6b7280";
}

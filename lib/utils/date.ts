// lib/utils/date.ts

export function getTodayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateShort(dateInput: string | Date, withYearShort = true) {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return "Invalid date";

  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
  };
  if (withYearShort) opts.year = "2-digit";

  return d.toLocaleDateString("en-IN", opts);
}

export function toINShort(dateISO?: string | null) {
  if (!dateISO) return "-";
  return formatDateShort(dateISO, true);
}

// @ts-nocheck
"use client";

import useThemeMode from "@/app/_components/useThemeMode";
import { STATUS_OPTIONS } from "@/lib/constants/status";

type Props = {
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  fulfilmentFilter: string;
  setFulfilmentFilter: (v: string) => void;
  hideDispatched: boolean;
  setHideDispatched: (v: boolean) => void;
  onClear: () => void;
};

export default function OrdersFilters({
  statusFilter,
  setStatusFilter,
  fulfilmentFilter,
  setFulfilmentFilter,
  hideDispatched,
  setHideDispatched,
  onClear,
}: Props) {
  const themeMode = useThemeMode();
  const showClear =
    statusFilter !== "all" || fulfilmentFilter !== "all" || hideDispatched;

  const uiTheme =
    themeMode === "light"
      ? {
          input: {
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid var(--input-border)",
            background: "var(--surface-plain)",
            color: "var(--text-primary)",
            fontSize: 11,
          },
          ghostButton: {
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid var(--input-border)",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: 11,
          },
          labelColor: "var(--text-primary)",
        }
      : {
          input: {
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid var(--input-border)",
            background: "var(--surface-plain)",
            color: "var(--text-primary)",
            fontSize: 11,
          },
          ghostButton: {
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid var(--input-border)",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: 11,
          },
          labelColor: "var(--text-primary)",
        };

  return (
    <div
      style={{
        marginBottom: 10,
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        fontSize: 11,
      }}
    >
      <span style={{ opacity: 0.75 }}>Filters:</span>

      {/* Status filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ opacity: 0.7 }}>Status</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={uiTheme.input}
        >
          <option value="all">All</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Fulfilment filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ opacity: 0.7 }}>Fulfilment</span>
        <select
          value={fulfilmentFilter}
          onChange={(e) => setFulfilmentFilter(e.target.value)}
          style={uiTheme.input}
        >
          <option value="all">All</option>
          <option value="low">&lt; 40%</option>
          <option value="medium">40–74%</option>
          <option value="high">75–99%</option>
          <option value="complete">100%</option>
        </select>
      </div>

      {/* Hide dispatched toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            color: uiTheme.labelColor,
          }}
        >
          <input
            type="checkbox"
            checked={hideDispatched}
            onChange={(e) => setHideDispatched(e.target.checked)}
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              border: "1px solid var(--input-border)",
              background: "var(--surface-plain)",
              accentColor: "#f97316",
            }}
          />
          <span>Hide dispatched orders</span>
        </label>
      </div>

      {showClear && (
        <button
          type="button"
          onClick={onClear}
          style={uiTheme.ghostButton}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// @ts-nocheck
"use client";

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
  const showClear =
    statusFilter !== "all" || fulfilmentFilter !== "all" || hideDispatched;

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
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid #333",
            background: "#050505",
            color: "#f5f5f5",
            fontSize: 11,
          }}
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
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid #333",
            background: "#050505",
            color: "#f5f5f5",
            fontSize: 11,
          }}
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
            color: "#e5e7eb",
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
              border: "1px solid #4b5563",
              background: "#050505",
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
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid #333",
            background: "transparent",
            color: "#f5f5f5",
            fontSize: 11,
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

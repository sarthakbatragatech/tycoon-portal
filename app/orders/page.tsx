// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

// Shared status options
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_production", label: "In production" },
  { value: "packed", label: "Packed" },
  { value: "partially_dispatched", label: "Partially dispatched" },
  { value: "dispatched", label: "Dispatched" },
  { value: "cancelled", label: "Cancelled" },
];

// Map status → colors
const STATUS_COLORS: Record<string, string> = {
  pending: "#6b7280", // grey
  in_production: "#0f766e", // teal instead of strong blue
  packed: "#8b5cf6", // purple
  partially_dispatched: "#f97316", // orange
  dispatched: "#22c55e", // green
  cancelled: "#ef4444", // red
};

// Status suggestion helper
function getStatusSuggestion(status: string, fulfil: number) {
  const st = status || "pending";

  if (fulfil === 100 && st !== "dispatched") {
    return "⚠ Order looks fully dispatched — consider marking as 'dispatched' on the detail page.";
  }

  if (fulfil > 0 && fulfil < 100 && st === "pending") {
    return "⚠ Items have been dispatched — consider 'partially_dispatched' on the detail page.";
  }

  if (fulfil >= 75 && st === "in_production") {
    return "⚠ Most items dispatched — consider 'partially_dispatched' or 'dispatched' on the detail page.";
  }

  return "";
}

type OrderWithRelations = {
  id: string;
  order_code: string | null;
  order_date: string | null;
  expected_dispatch_date: string | null;
  status: string | null;
  total_qty: number | null;
  total_value: number | null;
  parties?: any;
  order_lines?: any[];
};

type EnhancedOrder = {
  id: string;
  orderCode: string;
  orderDateLabel: string;
  orderDateRaw: string | null;
  expectedDispatchLabel: string;
  isOverdue: boolean;
  partyName: string;
  partyCity: string;
  status: string;
  totalQty: number;
  totalValue: number;
  orderedTotal: number;
  dispatchedTotal: number;
  pendingTotal: number;
  fulfilmentPercent: number;
  lines: {
    itemName: string;
    ordered: number;
    dispatched: number;
    pending: number;
  }[];
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [fulfilmentFilter, setFulfilmentFilter] = useState("all");

  // Search (party name + item name only)
  const [searchQuery, setSearchQuery] = useState("");

  // DATE FILTERS (A)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_code,
        order_date,
        expected_dispatch_date,
        status,
        total_qty,
        total_value,
        parties (
          name,
          city
        ),
        order_lines (
          qty,
          dispatched_qty,
          dealer_rate_at_order,
          line_total,
          items (
            name
          )
        )
      `
      )
      .order("order_date", { ascending: false });

    if (error) {
      console.error("🚨 Supabase error loading orders:", error);
      setOrders([]);
    } else {
      setOrders((data || []) as any);
    }

    setLoading(false);
  }

  function toggleExpand(orderId: string) {
    setExpandedOrderId((current) => (current === orderId ? null : orderId));
  }

  function formatDateLocal(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // DATE QUICK RANGE HELPER (B)
  function setQuickRange(mode: "all" | "thisMonth" | "lastMonth" | "last90") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (mode === "all") {
      setDateFrom("");
      setDateTo("");
      return;
    }

    if (mode === "thisMonth") {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFrom(formatDateLocal(from));
      setDateTo(formatDateLocal(today));
      return;
    }

    if (mode === "lastMonth") {
      const year = today.getFullYear();
      const month = today.getMonth();
      const firstThisMonth = new Date(year, month, 1);
      const lastMonthEnd = new Date(firstThisMonth.getTime() - 1);
      const lastMonthStart = new Date(
        lastMonthEnd.getFullYear(),
        lastMonthEnd.getMonth(),
        1
      );
      setDateFrom(formatDateLocal(lastMonthStart));
      setDateTo(formatDateLocal(lastMonthEnd));
      return;
    }

    if (mode === "last90") {
      const from = new Date(today);
      from.setDate(from.getDate() - 89);
      setDateFrom(formatDateLocal(from));
      setDateTo(formatDateLocal(today));
      return;
    }
  }

  // Build rich objects per order
  const enhancedOrders: EnhancedOrder[] = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return orders.map((o) => {
      // Party: Supabase may return object or array
      const partyRel: any = (o as any).parties;
      const party =
        partyRel && Array.isArray(partyRel) && partyRel.length > 0
          ? partyRel[0]
          : partyRel || null;

      // Lines: handle items array/object + dispatched_qty
      const linesRaw: any[] = (o as any).order_lines || [];

      const lineSummaries = linesRaw.map((l) => {
        const itemRel: any = (l as any).items;
        const item =
          itemRel && Array.isArray(itemRel) && itemRel.length > 0
            ? itemRel[0]
            : itemRel || null;

        const itemName = (item?.name || "Unknown item") as string;
        const ordered = (l as any).qty ?? 0;

        const dispatchedRaw = (l as any).dispatched_qty ?? 0;
        let dispatched = Number(dispatchedRaw);
        if (Number.isNaN(dispatched)) dispatched = 0;
        if (dispatched < 0) dispatched = 0;
        if (dispatched > ordered) dispatched = ordered;

        const pending = Math.max(ordered - dispatched, 0);

        return {
          itemName,
          ordered,
          dispatched,
          pending,
        };
      });

      const orderedTotal = lineSummaries.reduce(
        (sum, l) => sum + l.ordered,
        0
      );
      const dispatchedTotal = lineSummaries.reduce(
        (sum, l) => sum + l.dispatched,
        0
      );
      const pendingTotal = Math.max(orderedTotal - dispatchedTotal, 0);

      const fulfilmentPercent =
        orderedTotal > 0
          ? Math.round((dispatchedTotal / orderedTotal) * 100)
          : 0;

      // Compute total value from lines (prefer line_total, fallback to rate * qty)
      const totalValueFromLines = linesRaw.reduce((sum, l: any) => {
        const qty = l.qty ?? 0;
        const lineTotal =
          typeof l.line_total === "number"
            ? l.line_total
            : (l.dealer_rate_at_order ?? 0) * qty;
        return sum + lineTotal;
      }, 0);

      // If for some reason there are no lines / totals from lines are 0,
      // fall back to existing header totals so old data still shows something.
      const finalTotalQty =
        orderedTotal > 0 ? orderedTotal : o.total_qty ?? 0;
      const finalTotalValue =
        totalValueFromLines > 0
          ? totalValueFromLines
          : Number(o.total_value ?? 0);

      const rawDateStr = o.order_date;
      const date = rawDateStr ? new Date(rawDateStr) : null;
      const orderDateLabel = date
        ? date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "2-digit",
          })
        : "No date";

      const orderCode =
        (o.order_code && o.order_code !== "") || o.order_code === "0"
          ? (o.order_code as string)
          : o.id.slice(0, 8);

      // Expected dispatch
      const expectedRaw = (o as any).expected_dispatch_date as string | null;
      const expectedDate = expectedRaw ? new Date(expectedRaw) : null;

      const expectedDispatchLabel = expectedDate
        ? expectedDate.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
          })
        : "Not set";

      let isOverdue = false;
      if (expectedDate) {
        const ed = new Date(expectedDate);
        ed.setHours(0, 0, 0, 0);
        const st = (o.status || "pending").toLowerCase();
        if (ed < today && st !== "dispatched") {
          isOverdue = true;
        }
      }

      return {
        id: o.id,
        orderCode,
        orderDateLabel,
        orderDateRaw: rawDateStr || null,
        expectedDispatchLabel,
        isOverdue,
        partyName: (party?.name || "Unknown party") as string,
        partyCity: (party?.city || "") as string,
        status: (o.status || "pending") as string,
        totalQty: finalTotalQty,
        totalValue: finalTotalValue,
        orderedTotal,
        dispatchedTotal,
        pendingTotal,
        fulfilmentPercent,
        lines: lineSummaries,
      };
    });
  }, [orders]);

  // Apply date filter + status filter + fulfilment filter + search (C)
  const visibleOrders = useMemo(() => {
    let list = [...enhancedOrders];

    // DATE FILTER (same logic as dashboard)
    if (dateFrom || dateTo) {
      const fromDate = dateFrom ? new Date(dateFrom) : null;
      const toDate = dateTo ? new Date(dateTo) : null;
      let endOfTo: Date | null = null;

      if (toDate) {
        endOfTo = new Date(toDate);
        endOfTo.setHours(23, 59, 59, 999);
      }

      list = list.filter((o) => {
        if (!o.orderDateRaw) return false;
        const od = new Date(o.orderDateRaw);
        if (Number.isNaN(od.getTime())) return false;

        if (fromDate && od < fromDate) return false;
        if (endOfTo && od > endOfTo) return false;

        return true;
      });
    }

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((o) => {
        const st = (o.status || "pending").toLowerCase();
        return st === statusFilter;
      });
    }

    // Fulfilment filter
    if (fulfilmentFilter !== "all") {
      list = list.filter((o) => {
        const p = o.fulfilmentPercent ?? 0;

        if (fulfilmentFilter === "low") return p < 40;
        if (fulfilmentFilter === "medium") return p >= 40 && p < 75;
        if (fulfilmentFilter === "high") return p >= 75 && p < 100;
        if (fulfilmentFilter === "complete") return p === 100;

        return true;
      });
    }

    // Search filter (party name + item names only)
    if (searchQuery.trim() !== "") {
      const q = searchQuery.trim().toLowerCase();

      list = list.filter((o) => {
        const party = o.partyName?.toLowerCase() || "";
        const itemMatch = o.lines.some((line) =>
          line.itemName.toLowerCase().includes(q)
        );

        return party.includes(q) || itemMatch;
      });
    }

    return list;
  }, [
    enhancedOrders,
    statusFilter,
    fulfilmentFilter,
    searchQuery,
    dateFrom,
    dateTo,
  ]);

  function fulfilmentColour(percent: number): string {
    if (percent >= 100) return "#22c55e";
    if (percent >= 75) return "#4ade80";
    if (percent >= 40) return "#facc15";
    if (percent > 0) return "#fb923c";
    return "#f87171";
  }

  return (
    <>
      <h1 className="section-title">Orders</h1>
      <p className="section-subtitle">
        View all Tycoon orders, see fulfilment, and drill into details.
      </p>

      {/* SEARCH BAR */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search by party or item name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid #333",
            background: "#050505",
            color: "#f5f5f5",
            fontSize: 13,
          }}
        />
      </div>

      {/* DATE FILTERS (UI) */}
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontSize: 12,
        }}
      >
        {/* Quick ranges */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ opacity: 0.8 }}>Quick range:</span>

          <button
            type="button"
            onClick={() => setQuickRange("all")}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "transparent",
              color: "#f5f5f5",
              fontSize: 11,
            }}
          >
            All time
          </button>

          <button
            type="button"
            onClick={() => setQuickRange("thisMonth")}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "transparent",
              color: "#f5f5f5",
              fontSize: 11,
            }}
          >
            This month
          </button>

          <button
            type="button"
            onClick={() => setQuickRange("lastMonth")}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "transparent",
              color: "#f5f5f5",
              fontSize: 11,
            }}
          >
            Last month
          </button>

          <button
            type="button"
            onClick={() => setQuickRange("last90")}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "transparent",
              color: "#f5f5f5",
              fontSize: 11,
            }}
          >
            Last 90 days
          </button>
        </div>

        {/* Manual date inputs */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={{ opacity: 0.8 }}>Filter by order date:</span>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #333",
                background: "#050505",
                color: "#f5f5f5",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #333",
                background: "#050505",
                color: "#f5f5f5",
              }}
            />
          </div>

          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #333",
                background: "transparent",
                color: "#f5f5f5",
                fontSize: 11,
              }}
            >
              Clear date
            </button>
          )}
        </div>
      </div>

      {/* FILTER BAR (status + fulfilment) */}
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

        {(statusFilter !== "all" || fulfilmentFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setFulfilmentFilter("all");
            }}
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

      {loading && enhancedOrders.length === 0 && (
        <div className="card">
          <div className="card-label">Loading orders…</div>
        </div>
      )}

      {!loading && enhancedOrders.length === 0 && (
        <div className="card">
          <div className="card-label">No orders yet</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Punch an order from the <strong>Punch Order</strong> page to see it
            here.
          </div>
        </div>
      )}

      {!loading && enhancedOrders.length > 0 && visibleOrders.length === 0 && (
        <div className="card">
          <div className="card-label">
            No orders match the current filters/search
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Try changing the date range, status, fulfilment, or search text.
          </div>
        </div>
      )}

      {/* ORDER CARDS GRID - MAX 2 PER ROW */}
      {!loading && visibleOrders.length > 0 && (
        <>
          <div className="card-grid orders-grid">
            {visibleOrders.map((order) => {
              const expanded = expandedOrderId === order.id;
              const colour = fulfilmentColour(order.fulfilmentPercent);
              const barWidth = Math.max(
                4,
                Math.min(order.fulfilmentPercent, 100)
              );

              const suggestion = getStatusSuggestion(
                order.status,
                order.fulfilmentPercent
              );

              const statusColor =
                STATUS_COLORS[order.status] || "#4b5563";

              return (
                <div
                  key={order.id}
                  className="card"
                  style={{
                    position: "relative",
                    padding: 14,
                    border:
                      expanded === true
                        ? "1px solid rgba(250,250,250,0.6)"
                        : "1px solid #1f2933",
                    boxShadow: expanded
                      ? "0 0 0 1px rgba(255,255,255,0.08)"
                      : "0 10px 24px rgba(0,0,0,0.35)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    minHeight: 160,
                    overflow: "hidden",
                  }}
                >
                  {/* status accent strip */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 3,
                      background: statusColor,
                    }}
                  />

                  {/* HEADER ROW (clickable) */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(order.id)}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      cursor: "pointer",
                      gap: 12,
                    }}
                  >
                    {/* Left block: party + meta */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 28,
                          height: 28,
                          borderRadius: "999px",
                          border: "1px solid #4b5563",
                          background: expanded ? "#111827" : "transparent",
                          fontSize: 15,
                          flexShrink: 0,
                          transition:
                            "background-color 120ms ease-out, border-color 120ms ease-out, transform 120ms ease-out",
                        }}
                      >
                        {expanded ? "▾" : "▸"}
                      </span>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            color: "#f9fafb",
                          }}
                        >
                          {order.partyName}
                          {order.partyCity ? ` · ${order.partyCity}` : ""}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 6,
                            marginTop: 2,
                            color: "#9ca3af",
                          }}
                        >
                          <span>Order #{order.orderCode}</span>
                          <span>·</span>
                          <span>{order.orderDateLabel}</span>
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            marginTop: 6,
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            flexWrap: "wrap",
                            color: "#d1d5db",
                          }}
                        >
                          <span style={{ opacity: 0.8 }}>
                            Expected dispatch:
                          </span>
                          <span>{order.expectedDispatchLabel}</span>
                          {order.isOverdue && (
                            <span
                              style={{
                                background: "#ef4444",
                                color: "#fff",
                                padding: "2px 8px",
                                borderRadius: 999,
                                fontSize: 10,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: 0.4,
                              }}
                            >
                              Overdue
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right block: qty/value + status */}
                    <div
                      style={{
                        textAlign: "right",
                        fontSize: 11,
                        minWidth: 150,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "#f9fafb",
                        }}
                      >
                        {order.totalQty} pcs
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#e5e7eb",
                          opacity: 0.9,
                        }}
                      >
                        ₹ {order.totalValue.toLocaleString("en-IN")}
                      </div>

                      <div style={{ marginTop: 6 }}>
                        <span
                          style={{
                            marginRight: 4,
                            opacity: 0.75,
                            color: "#d1d5db",
                          }}
                        >
                          Status:
                        </span>

                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: statusColor,
                            color: "#f9fafb",
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: "capitalize",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {(order.status || "pending").replace("_", " ")}
                        </span>
                      </div>

                      {suggestion && (
                        <div
                          style={{
                            fontSize: 10,
                            marginTop: 6,
                            opacity: 0.9,
                            color: "#fbbf24",
                          }}
                        >
                          {suggestion}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* FULFILMENT BAR */}
                  <div style={{ marginTop: 4 }}>
                    <div
                      style={{
                        width: "100%",
                        background: "#050505",
                        borderRadius: 999,
                        overflow: "hidden",
                        height: 10,
                        border: "1px solid #262626",
                      }}
                    >
                      <div
                        style={{
                          width: `${barWidth}%`,
                          background: colour,
                          height: "100%",
                          transition: "width 160ms ease-out",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 4,
                        opacity: 0.9,
                        display: "flex",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 4,
                        color: "#e5e7eb",
                      }}
                    >
                      <span>
                        {order.fulfilmentPercent}% fulfilled ·{" "}
                        {order.dispatchedTotal}/{order.orderedTotal} pcs
                        dispatched
                      </span>
                      <span>Pending: {order.pendingTotal} pcs</span>
                    </div>
                  </div>

                  {/* EXPANDED DETAILS */}
                  {expanded && (
                    <div
                      style={{
                        marginTop: 10,
                        borderTop: "1px solid #1f2933",
                        paddingTop: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 6,
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.85,
                            color: "#e5e7eb",
                          }}
                        >
                          Line items in this order
                        </div>
                        <Link
                          href={`/orders/${order.id}`}
                          style={{
                            fontSize: 11,
                            textDecoration: "underline",
                            textUnderlineOffset: 3,
                            color: "#f9fafb",
                          }}
                        >
                          Open detail page →
                        </Link>
                      </div>

                      <div className="table-wrapper">
                        <table className="table">
                          <thead>
                            <tr>
                              <th style={{ width: "45%" }}>Item</th>
                              <th>Ordered</th>
                              <th>Dispatched</th>
                              <th>Pending</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.lines.length === 0 && (
                              <tr>
                                <td
                                  colSpan={4}
                                  style={{
                                    textAlign: "center",
                                    padding: 8,
                                    fontSize: 12,
                                    opacity: 0.8,
                                  }}
                                >
                                  No line items found for this order.
                                </td>
                              </tr>
                            )}

                            {order.lines.map((line, idx) => (
                              <tr key={idx}>
                                <td>{line.itemName}</td>
                                <td>{line.ordered} pcs</td>
                                <td>{line.dispatched} pcs</td>
                                <td>{line.pending} pcs</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Local styles to force max 2 columns */}
          <style jsx>{`
            .orders-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr);
              gap: 20px;
              max-width: 1120px;
              margin: 0 auto;
            }

            @media (min-width: 900px) {
              .orders-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
            }
          `}</style>
        </>
      )}
    </>
  );
}
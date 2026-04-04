// @ts-nocheck
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useThemeMode from "@/app/_components/useThemeMode";
import { supabase } from "@/lib/supabase";
import { STATUS_COLORS } from "@/lib/constants/status";
import OrdersFilters from "./OrdersFilters";

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

const PAGE_SIZE = 20;

export default function OrdersListClient() {
  const themeMode = useThemeMode();
  const [orders, setOrders] = useState<OrderWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [fulfilmentFilter, setFulfilmentFilter] = useState("all");
  const [hideDispatched, setHideDispatched] = useState(true);

  // Search (party name + item name only)
  const [searchQuery, setSearchQuery] = useState("");

  // DATE FILTERS (A)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Pagination: how many filtered orders are currently visible
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  // Apply date filter + status filter + fulfilment filter + hideDispatched + search (C)
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

    // Hide dispatched toggle
    if (hideDispatched) {
      list = list.filter((o) => {
        const st = (o.status || "pending").toLowerCase();
        return st !== "dispatched";
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
    hideDispatched,
    fulfilmentFilter,
    searchQuery,
    dateFrom,
    dateTo,
  ]);

  // Reset pagination when filters/search/date/hideDispatched change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [statusFilter, hideDispatched, fulfilmentFilter, searchQuery, dateFrom, dateTo]);

  function fulfilmentColour(percent: number): string {
    if (percent >= 100) return "#22c55e";
    if (percent >= 75) return "#4ade80";
    if (percent >= 40) return "#facc15";
    if (percent > 0) return "#fb923c";
    return "#f87171";
  }

  const pagedOrders = visibleOrders.slice(0, visibleCount);

  const uiTheme = useMemo(
    () =>
      themeMode === "light"
        ? {
            input: {
              width: "100%",
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid var(--input-border)",
              background: "var(--surface-plain)",
              color: "var(--text-primary)",
              fontSize: 13,
            },
            quickButton: {
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid var(--input-border)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 11,
            },
            cardBorder: "#2b3440",
            expandedBorder: "rgba(31,31,31,0.45)",
            cardShadow: "0 10px 24px rgba(84,72,52,0.14)",
            expandedShadow: "0 0 0 1px rgba(23,23,23,0.06)",
            iconBg: "rgba(23,23,23,0.04)",
            iconBorder: "1px solid rgba(123,123,123,0.28)",
            title: "#171717",
            meta: "#667085",
            submeta: "#6b7280",
            strong: "#374151",
            pillText: "#fffdf9",
            barTrack: "#f1ece3",
            barBorder: "1px solid #d9d1c5",
            expandedDivider: "1px solid #d8d2c9",
            footerMeta: "#6b7280",
            link: "#171717",
            countText: "#4b5563",
            primaryButton: {
              padding: "6px 16px",
              borderRadius: 999,
              border: "1px solid var(--text-primary)",
              background: "var(--text-primary)",
              color: "var(--nav-active-text)",
              fontSize: 12,
              cursor: "pointer",
            },
          }
        : {
            input: {
              width: "100%",
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid var(--input-border)",
              background: "var(--surface-plain)",
              color: "var(--text-primary)",
              fontSize: 13,
            },
            quickButton: {
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid var(--input-border)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 11,
            },
            cardBorder: "#1f2933",
            expandedBorder: "rgba(250,250,250,0.6)",
            cardShadow: "0 10px 24px rgba(0,0,0,0.35)",
            expandedShadow: "0 0 0 1px rgba(255,255,255,0.08)",
            iconBg: "rgba(255,255,255,0.03)",
            iconBorder: "1px solid rgba(148,163,184,0.35)",
            title: "#f9fafb",
            meta: "#9ca3af",
            submeta: "#d1d5db",
            strong: "#e5e7eb",
            pillText: "#f9fafb",
            barTrack: "#050505",
            barBorder: "1px solid #262626",
            expandedDivider: "1px solid #1f2933",
            footerMeta: "#d1d5db",
            link: "#f9fafb",
            countText: "#d1d5db",
            primaryButton: {
              padding: "6px 16px",
              borderRadius: 999,
              border: "1px solid var(--text-primary)",
              background: "var(--text-primary)",
              color: "var(--nav-active-text)",
              fontSize: 12,
              cursor: "pointer",
            },
          },
    [themeMode]
  );

  return (
    <>
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="section-title">Orders</h1>
          <p className="section-subtitle page-header-subtitle">
            View all Tycoon orders, see fulfilment, and drill into details.
          </p>
        </div>
      </div>

      <div className="orders-search-wrap">
        <input
          type="text"
          placeholder="Search by party or item name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={uiTheme.input}
        />
      </div>

      <div className="filters-panel orders-date-panel">
        <div className="filters-row">
          <span style={{ opacity: 0.8 }}>Quick range:</span>

          <button
            type="button"
            onClick={() => setQuickRange("all")}
            style={uiTheme.quickButton}
          >
            All time
          </button>

          <button
            type="button"
            onClick={() => setQuickRange("thisMonth")}
            style={uiTheme.quickButton}
          >
            This month
          </button>

          <button
            type="button"
            onClick={() => setQuickRange("lastMonth")}
            style={uiTheme.quickButton}
          >
            Last month
          </button>

          <button
            type="button"
            onClick={() => setQuickRange("last90")}
            style={uiTheme.quickButton}
          >
            Last 90 days
          </button>
        </div>

        <div className="filters-row filters-row-fields">
          <span style={{ opacity: 0.8 }}>Filter by order date:</span>

          <div className="filter-field-group">
            <div className="compact-field">
              <span style={{ opacity: 0.7 }}>From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="compact-input"
              />
            </div>

            <div className="compact-field">
              <span style={{ opacity: 0.7 }}>To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="compact-input"
              />
            </div>
          </div>

          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="action-button small secondary"
            >
              Clear date
            </button>
          )}
        </div>
      </div>

      <OrdersFilters
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        fulfilmentFilter={fulfilmentFilter}
        setFulfilmentFilter={setFulfilmentFilter}
        hideDispatched={hideDispatched}
        setHideDispatched={setHideDispatched}
        onClear={() => {
          setStatusFilter("all");
          setFulfilmentFilter("all");
          setHideDispatched(false);
        }}
      />

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

      {!loading &&
        enhancedOrders.length > 0 &&
        visibleOrders.length === 0 && (
          <div className="card">
            <div className="card-label">
              No orders match the current filters/search
            </div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              Try changing the date range, status, fulfilment, or search text.
            </div>
          </div>
        )}

      {/* ORDER CARDS GRID - MAX 2 PER ROW + LOAD MORE */}
      {!loading && visibleOrders.length > 0 && (
        <>
          <div className="card-grid orders-grid">
            {pagedOrders.map((order) => {
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
                        ? `1px solid ${uiTheme.expandedBorder}`
                        : `1px solid ${uiTheme.cardBorder}`,
                    boxShadow: expanded
                      ? uiTheme.expandedShadow
                      : uiTheme.cardShadow,
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
                    className="orders-card-trigger"
                  >
                    {/* Left block: party + meta */}
                    <div className="orders-card-main">
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 34,
                          height: 34,
                          borderRadius: "999px",
                          background: expanded ? "rgba(56,189,248,0.08)" : uiTheme.iconBg,
                          border: uiTheme.iconBorder,
                          boxShadow: expanded
                            ? "0 0 8px rgba(56,189,248,0.45)"
                            : "0 0 2px rgba(148,163,184,0.25)",
                          flexShrink: 0,
                          transition: "all 160ms ease-out",
                        }}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          style={{
                            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 160ms ease-out",
                          }}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>

                      <div className="orders-card-copy">
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            color: uiTheme.title,
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
                            color: uiTheme.meta,
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
                            color: uiTheme.submeta,
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
                                color: uiTheme.pillText,
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
                    <div className="orders-card-side">
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: uiTheme.title,
                        }}
                      >
                        {order.totalQty} pcs
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: uiTheme.strong,
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
                            color: uiTheme.submeta,
                          }}
                        >
                          Status:
                        </span>

                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: statusColor,
                            color: uiTheme.pillText,
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
                        background: uiTheme.barTrack,
                        borderRadius: 999,
                        overflow: "hidden",
                        height: 10,
                        border: uiTheme.barBorder,
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
                    <div className="orders-card-fulfilment" style={{ color: uiTheme.strong }}>
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
                        borderTop: uiTheme.expandedDivider,
                        paddingTop: 8,
                      }}
                    >
                      <div className="orders-expanded-header">
                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.85,
                            color: uiTheme.strong,
                          }}
                        >
                          Line items in this order
                        </div>
                        <Link
                          href={`/orders/${order.id}`}
                          className="orders-expanded-link"
                          style={{ color: uiTheme.link }}
                        >
                          Open detail page →
                        </Link>
                      </div>

                      <div className="table-wrapper">
                        <table className="table table-mobile-cards">
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
                                  className="table-empty-cell"
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
                                <td data-label="Item">{line.itemName}</td>
                                <td data-label="Ordered">{line.ordered} pcs</td>
                                <td data-label="Dispatched">{line.dispatched} pcs</td>
                                <td data-label="Pending">{line.pending} pcs</td>
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

          {/* LOAD MORE + META */}
          {visibleOrders.length > PAGE_SIZE && (
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: uiTheme.countText,
              }}
            >
              <div>
                Showing{" "}
                <strong>
                  {Math.min(visibleCount, visibleOrders.length)}
                </strong>{" "}
                of <strong>{visibleOrders.length}</strong> matching orders
              </div>

              {visibleCount < visibleOrders.length && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((c) =>
                      Math.min(c + PAGE_SIZE, visibleOrders.length)
                    )
                  }
                  style={uiTheme.primaryButton}
                >
                  Load more orders
                </button>
              )}
            </div>
          )}

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

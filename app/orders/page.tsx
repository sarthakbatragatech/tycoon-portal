// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type OrderWithRelations = {
  id: string;
  order_code: string | null;
  order_date: string | null;
  status: string | null;
  total_qty: number | null;
  total_value: number | null;
  parties?: any; // Supabase may return object or array
  order_lines?: any[];
};

type EnhancedOrder = {
  id: string;
  orderCode: string;
  orderDateLabel: string;
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [fulfilmentFilter, setFulfilmentFilter] = useState("all");

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

  const enhancedOrders: EnhancedOrder[] = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    return orders.map((o) => {
      // --- party: handle object or array shape ---
      const partyRel: any = (o as any).parties;
      const party =
        partyRel && Array.isArray(partyRel) && partyRel.length > 0
          ? partyRel[0]
          : partyRel || null;

      // --- lines: handle items object/array + dispatched_qty ---
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

      const date = o.order_date ? new Date(o.order_date) : null;
      const orderDateLabel = date
        ? date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "2-digit",
          })
        : "No date";

      const orderCode =
        (o.order_code && o.order_code !== "") ||
        o.order_code === "0"
          ? (o.order_code as string)
          : o.id.slice(0, 8);

      return {
        id: o.id,
        orderCode,
        orderDateLabel,
        partyName: (party?.name || "Unknown party") as string,
        partyCity: (party?.city || "") as string,
        status: (o.status || "pending") as string,
        totalQty: o.total_qty ?? orderedTotal,
        totalValue: Number(o.total_value ?? 0),
        orderedTotal,
        dispatchedTotal,
        pendingTotal,
        fulfilmentPercent,
        lines: lineSummaries,
      };
    });
  }, [orders]);

  const visibleOrders = useMemo(() => {
    let list = [...enhancedOrders];

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

    return list;
  }, [enhancedOrders, statusFilter, fulfilmentFilter]);

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

      {/* FILTER BAR */}
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
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_production">In production</option>
            <option value="dispatched">Dispatched</option>
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
            Clear
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

      {!loading &&
      enhancedOrders.length > 0 &&
      visibleOrders.length === 0 && (
        <div className="card">
          <div className="card-label">No orders match these filters</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Try clearing or relaxing the filters.
          </div>
        </div>
      )}

      <div className="card-grid" style={{ flexDirection: "column", gap: 10 }}>
        {visibleOrders.map((order) => {
          const expanded = expandedOrderId === order.id;
          const colour = fulfilmentColour(order.fulfilmentPercent);
          const barWidth = Math.max(
            4,
            Math.min(order.fulfilmentPercent, 100)
          );

          return (
            <div
              key={order.id}
              className="card"
              style={{
                padding: 10,
                border:
                  expanded ? "1px solid #f5f5f5" : "1px solid #1f2933",
                boxShadow: expanded
                  ? "0 0 0 1px rgba(255,255,255,0.08)"
                  : "none",
              }}
            >
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
                  alignItems: "center",
                  cursor: "pointer",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
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
                      width: 22,
                      height: 22,
                      borderRadius: "999px",
                      border: "1px solid #4b5563",
                      fontSize: 13,
                    }}
                  >
                    {expanded ? "▾" : "▸"}
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {order.partyName}
                      {order.partyCity ? ` · ${order.partyCity}` : ""}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.8,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <span>Order #{order.orderCode}</span>
                      <span>·</span>
                      <span>{order.orderDateLabel}</span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    textAlign: "right",
                    fontSize: 11,
                    opacity: 0.9,
                    minWidth: 110,
                  }}
                >
                  <div>
                    {order.totalQty} pcs · ₹{" "}
                    {order.totalValue.toLocaleString("en-IN")}
                  </div>
                  <div style={{ textTransform: "capitalize" }}>
                    Status: {order.status || "pending"}
                  </div>
                </div>
              </button>

              {/* FULFILMENT BAR (always visible) */}
              <div style={{ marginTop: 8 }}>
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
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 11,
                    marginTop: 4,
                    opacity: 0.85,
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 4,
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
    </>
  );
}
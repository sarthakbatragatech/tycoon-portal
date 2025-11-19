// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_production: "In Production",
  packed: "Packed",
  dispatched: "Dispatched",
  cancelled: "Cancelled",
};

type FilterMode = "all" | "pending";

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

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
          dispatched_qty
        )
      `
      )
      .order("order_date", { ascending: false });

    if (error) {
      console.error("Error loading orders", error);
      setOrders([]);
    } else {
      setOrders(data || []);
    }

    setLoading(false);
  }

  // Helper: compute fulfilment for one order
  function getFulfilment(o: any) {
    const lines = o.order_lines || [];
    const totalOrdered = lines.reduce(
      (sum: number, l: any) => sum + (l.qty ?? 0),
      0
    );

    const totalDispatched = lines.reduce(
      (sum: number, l: any) => {
        const ordered = l.qty ?? 0;
        const raw =
          l.dispatched_qty === "" || l.dispatched_qty == null
            ? 0
            : Number(l.dispatched_qty);
        let dispatched = Number.isNaN(raw) ? 0 : raw;
        if (dispatched < 0) dispatched = 0;
        if (dispatched > ordered) dispatched = ordered;
        return sum + dispatched;
      },
      0
    );

    const percent =
      totalOrdered > 0
        ? Math.round((totalDispatched / totalOrdered) * 100)
        : 0;

    return { totalOrdered, totalDispatched, percent };
  }

  // For the summary cards, we still use ALL orders
  const totalQty = orders.reduce(
    (sum, o) => sum + (o.total_qty ?? 0),
    0
  );
  const totalValue = orders.reduce(
    (sum, o) => sum + Number(o.total_value ?? 0),
    0
  );

  // Apply filter for the table only
  const displayedOrders =
    filterMode === "all"
      ? orders
      : orders.filter((o) => {
          const { totalOrdered, percent } = getFulfilment(o);
          // Pending = ordered > 0 and less than 100% fulfilled
          return totalOrdered > 0 && percent < 100;
        });

  return (
    <>
      <h1 className="section-title">View Orders</h1>
      <p className="section-subtitle">
        Tap an order code or &ldquo;View details&rdquo; to open the full order.
      </p>

      {/* SUMMARY CARDS (always for all orders) */}
      <div className="card-grid" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-label">Total Orders</div>
          <div className="card-value">{orders.length}</div>
          <div className="card-meta">Across all parties</div>
        </div>

        <div className="card">
          <div className="card-label">Total Qty (sum)</div>
          <div className="card-value">{totalQty} pcs</div>
          <div className="card-meta">From all listed orders</div>
        </div>

        <div className="card">
          <div className="card-label">Total Value (sum)</div>
          <div className="card-value">
            ₹ {totalValue.toLocaleString("en-IN")}
          </div>
          <div className="card-meta">Approx order value</div>
        </div>
      </div>

      <div className="table-wrapper">
        <div className="table-header">
          <div className="table-title">Orders</div>
          <div
            className="table-filters"
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              {loading
                ? "Loading..."
                : displayedOrders.length === 0
                ? "No orders in this view"
                : `Showing ${displayedOrders.length} orders`}
            </span>

            {/* Filter control */}
            <div
              style={{
                display: "inline-flex",
                borderRadius: 999,
                border: "1px solid #333",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => setFilterMode("all")}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  border: "none",
                  background:
                    filterMode === "all" ? "#f5f5f5" : "transparent",
                  color: filterMode === "all" ? "#000" : "#f5f5f5",
                }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("pending")}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  border: "none",
                  borderLeft: "1px solid #333",
                  background:
                    filterMode === "pending"
                      ? "#f5f5f5"
                      : "transparent",
                  color:
                    filterMode === "pending" ? "#000" : "#f5f5f5",
                }}
              >
                Pending only
              </button>
            </div>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "24%" }}>Order (tap to open)</th>
              <th>Party</th>
              <th>Date</th>
              <th>Qty</th>
              <th>Value</th>
              <th>Fulfilment</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {displayedOrders.map((o) => {
              const rawParty = Array.isArray(o.parties)
                ? o.parties[0]
                : o.parties;

              const partyName = rawParty?.name ?? "Unknown party";
              const city = rawParty?.city ?? "";
              const statusLabel = STATUS_LABELS[o.status] ?? o.status;
              const displayCode =
                o.order_code || (o.id || "").slice(0, 8);

              const { totalOrdered, totalDispatched, percent } =
                getFulfilment(o);

              return (
                <tr key={o.id}>
                  <td>
                    <Link
                      href={`/orders/${o.id}`}
                      style={{
                        display: "inline-flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid #333",
                        textDecoration: "none",
                        color: "#f5f5f5",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          letterSpacing: 0.4,
                          fontWeight: 600,
                        }}
                      >
                        {displayCode}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          opacity: 0.7,
                          marginTop: 2,
                        }}
                      >
                        View details ↗
                      </span>
                    </Link>
                  </td>
                  <td>
                    {partyName}
                    {city ? ` · ${city}` : ""}
                  </td>
                  <td>{o.order_date}</td>
                  <td>{o.total_qty ?? 0} pcs</td>
                  <td>
                    ₹ {(o.total_value ?? 0).toLocaleString("en-IN")}
                  </td>
                  <td>
                    {/* Tiny fulfilment bar */}
                    <div style={{ minWidth: 80 }}>
                      <div
                        style={{
                          width: "100%",
                          height: 4,
                          borderRadius: 999,
                          background: "#151515",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${percent}%`,
                            height: "100%",
                            borderRadius: 999,
                            background:
                              percent === 100 ? "#22c55e" : "#f5f5f5",
                            transition: "width 0.2s ease-out",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          marginTop: 3,
                          opacity: 0.8,
                        }}
                      >
                        {percent}% ({totalDispatched}/{totalOrdered})
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge">{statusLabel}</span>
                  </td>
                </tr>
              );
            })}

            {!loading && displayedOrders.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 12 }}>
                  No orders in this view. Try switching the filter above.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 12 }}>
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
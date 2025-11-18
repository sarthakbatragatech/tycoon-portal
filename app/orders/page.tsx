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

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        order_date,
        status,
        total_qty,
        total_value,
        parties (
          name,
          city
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

  const totalQty = orders.reduce(
    (sum, o) => sum + (o.total_qty ?? 0),
    0
  );
  const totalValue = orders.reduce(
    (sum, o) => sum + (o.total_value ?? 0),
    0
  );

  return (
    <>
      <h1 className="section-title">View Orders</h1>
      <p className="section-subtitle">
        Latest Tycoon orders from your Supabase database.
      </p>

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
          <div className="table-filters">
            {loading
              ? "Loading..."
              : orders.length === 0
              ? "No orders yet"
              : `Showing ${orders.length} orders`}
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "20%" }}>Order ID</th>
              <th>Party</th>
              <th>Date</th>
              <th>Qty</th>
              <th>Value</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((o) => {
              const shortId = (o.id || "").slice(0, 8);

              const rawParty = Array.isArray(o.parties)
                ? o.parties[0]
                : o.parties;

              const partyName = rawParty?.name ?? "Unknown party";
              const city = rawParty?.city ?? "";
              const statusLabel = STATUS_LABELS[o.status] ?? o.status;

              return (
                <tr key={o.id}>
                  <td>
                    <Link
                      href={`/orders/${o.id}`}
                      style={{
                        textDecoration: "none",
                        color: "#f5f5f5",
                      }}
                    >
                      {shortId}
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
                    <span className="badge">{statusLabel}</span>
                  </td>
                </tr>
              );
            })}

            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 12 }}>
                  No orders yet. Punch one from the{" "}
                  <strong>Punch Order</strong> page.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 12 }}>
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
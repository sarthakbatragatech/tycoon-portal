// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_production: "In Production",
  packed: "Packed",
  dispatched: "Dispatched",
  cancelled: "Cancelled",
};

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    loadOrder();
  }, [orderId]);

  async function loadOrder() {
    setLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_date,
        expected_dispatch_date,
        status,
        remarks,
        total_qty,
        total_value,
        parties (
          name,
          city
        ),
        order_lines (
          id,
          qty,
          dealer_rate_at_order,
          line_total,
          items (
            name,
            category
          )
        )
      `
      )
      .eq("id", orderId)
      .single();

    if (error) {
      console.error("Error loading order", error);
      setOrder(null);
    } else {
      setOrder(data);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <>
        <h1 className="section-title">Order Detail</h1>
        <p className="section-subtitle">Loading order…</p>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <h1 className="section-title">Order Detail</h1>
        <p className="section-subtitle">Order not found.</p>
        <button
          className="pill-button"
          type="button"
          onClick={() => router.push("/orders")}
        >
          Back to orders
        </button>
      </>
    );
  }

  const party =
    Array.isArray(order.parties) && order.parties.length > 0
      ? order.parties[0]
      : order.parties;

  const lines = order.order_lines || [];
  const statusLabel = STATUS_LABELS[order.status] ?? order.status;

  return (
    <>
      {/* HEADER */}
      <h1 className="section-title">Order Detail</h1>
      <p className="section-subtitle">
        Full breakdown of a single Tycoon order.
      </p>

      {/* TOP SUMMARY */}
      <div className="card-grid" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-label">Order ID</div>
          <div className="card-value" style={{ fontSize: 16 }}>
            {order.id}
          </div>
          <div className="card-meta">
            Status:{" "}
            <span style={{ textTransform: "uppercase" }}>{statusLabel}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-label">Party</div>
          <div className="card-value" style={{ fontSize: 16 }}>
            {party?.name ?? "Unknown party"}
          </div>
          <div className="card-meta">
            {party?.city ? party.city : "City not set"}
          </div>
        </div>

        <div className="card">
          <div className="card-label">Dates</div>
          <div className="card-value" style={{ fontSize: 16 }}>
            {order.order_date}
          </div>
          <div className="card-meta">
            {order.expected_dispatch_date
              ? `Expected: ${order.expected_dispatch_date}`
              : "Expected dispatch not set"}
          </div>
        </div>

        <div className="card">
          <div className="card-label">Totals</div>
          <div className="card-value" style={{ fontSize: 16 }}>
            {order.total_qty ?? 0} pcs · ₹
            {(order.total_value ?? 0).toLocaleString("en-IN")}
          </div>
          <div className="card-meta">Sum of all line items</div>
        </div>
      </div>

      {/* REMARKS */}
      {order.remarks && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-label">Order Remarks</div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "#e0e0e0",
              whiteSpace: "pre-wrap",
            }}
          >
            {order.remarks}
          </div>
        </div>
      )}

      {/* ITEMS TABLE */}
      <div className="table-wrapper">
        <div className="table-header">
          <div className="table-title">Items in this order</div>
          <div className="table-filters">
            {lines.length} line{lines.length === 1 ? "" : "s"}
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Item</th>
              <th>Category</th>
              <th>Rate</th>
              <th style={{ width: 80 }}>Qty</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any) => {
              const item =
                Array.isArray(l.items) && l.items.length > 0
                  ? l.items[0]
                  : l.items;

              return (
                <tr key={l.id}>
                  <td>{item?.name ?? "Unknown item"}</td>
                  <td>{item?.category ?? "—"}</td>
                  <td>
                    ₹ {(l.dealer_rate_at_order ?? 0).toLocaleString("en-IN")}
                  </td>
                  <td>{l.qty ?? 0} pcs</td>
                  <td>₹ {(l.line_total ?? 0).toLocaleString("en-IN")}</td>
                </tr>
              );
            })}

            {lines.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: 12 }}>
                  No line items found for this order.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* BACK BUTTON */}
      <div style={{ marginTop: 16 }}>
        <button
          className="pill-button"
          type="button"
          onClick={() => router.push("/orders")}
        >
          ← Back to orders
        </button>
      </div>
    </>
  );
}
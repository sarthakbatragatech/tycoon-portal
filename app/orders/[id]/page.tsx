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

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_production", label: "In production" },
  { value: "packed", label: "Packed" },
  { value: "partially_dispatched", label: "Partially dispatched" },
  { value: "dispatched", label: "Dispatched" },
  { value: "cancelled", label: "Cancelled" },
];

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [expectedDispatch, setExpectedDispatch] = useState("");
  const [savingExpectedDate, setSavingExpectedDate] = useState(false);

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
        order_code,
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
          dispatched_qty,
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
      setExpectedDispatch(data.expected_dispatch_date || "");
    }

    setLoading(false);
  }

  // Make dispatched_qty behave nicely: editable, can be empty, numeric only
  function handleDispatchedChange(lineId: string, value: string) {
    if (!order) return;

    const updated = {
      ...order,
      order_lines: (order.order_lines || []).map((l: any) => {
        if (l.id !== lineId) return l;

        // Allow fully empty input
        if (value.trim() === "") {
          return { ...l, dispatched_qty: "" };
        }

        // Keep only digits
        const cleaned = value.replace(/[^\d]/g, "");
        if (cleaned === "") {
          return { ...l, dispatched_qty: "" };
        }

        let num = parseInt(cleaned, 10);
        if (Number.isNaN(num) || num < 0) {
          num = 0;
        }

        const max = l.qty ?? 0;
        if (num > max) num = max;

        return { ...l, dispatched_qty: num };
      }),
    };

    setOrder(updated);
  }

  async function saveDispatch() {
    if (!order) return;
    setSavingDispatch(true);

    try {
      const lines = order.order_lines || [];

      for (const l of lines) {
        // Convert "" / null to 0, clamp to [0, qty]
        const raw =
          l.dispatched_qty === "" || l.dispatched_qty == null
            ? 0
            : Number(l.dispatched_qty);

        let dispatched = Number.isNaN(raw) ? 0 : raw;
        const max = l.qty ?? 0;

        if (dispatched < 0) dispatched = 0;
        if (dispatched > max) dispatched = max;

        const { error } = await supabase
          .from("order_lines")
          .update({ dispatched_qty: dispatched })
          .eq("id", l.id);

        if (error) {
          console.error("Error updating line", l.id, error);
          alert("Error updating some lines: " + error.message);
          setSavingDispatch(false);
          return;
        }
      }

      alert("Dispatch quantities updated.");
      await loadOrder();
    } finally {
      setSavingDispatch(false);
    }
  }

  function handleStatusChange(value: string) {
    if (!order) return;
    setOrder({ ...order, status: value });
  }

  async function saveStatus() {
    if (!order) return;
    setSavingStatus(true);

    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: order.status })
        .eq("id", order.id);

      if (error) {
        console.error("Error updating status", error);
        alert("Error updating status: " + error.message);
        setSavingStatus(false);
        return;
      }

      alert("Order status updated.");
      await loadOrder();
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveExpectedDispatchDate() {
    if (!order) return;
    setSavingExpectedDate(true);

    try {
      const value =
        expectedDispatch && expectedDispatch.trim() !== ""
          ? expectedDispatch
          : null;

      const { error } = await supabase
        .from("orders")
        .update({ expected_dispatch_date: value })
        .eq("id", order.id);

      if (error) {
        console.error("Error updating expected dispatch date", error);
        alert("Error updating expected dispatch date: " + error.message);
        return;
      }

      // keep local order in sync
      setOrder({ ...order, expected_dispatch_date: value });
      alert("Expected dispatch date updated.");
    } finally {
      setSavingExpectedDate(false);
    }
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
  const displayCode = order.order_code || order.id;

  // Dispatch progress
  const totalOrdered = lines.reduce((sum, l: any) => sum + (l.qty ?? 0), 0);
  const totalDispatched = lines.reduce((sum, l: any) => {
    const raw =
      l.dispatched_qty === "" || l.dispatched_qty == null
        ? 0
        : Number(l.dispatched_qty);
    const ordered = l.qty ?? 0;
    let dispatched = Number.isNaN(raw) ? 0 : raw;
    if (dispatched < 0) dispatched = 0;
    if (dispatched > ordered) dispatched = ordered;
    return sum + dispatched;
  }, 0);

  const fulfillmentPercent =
    totalOrdered > 0
      ? Math.round((totalDispatched / totalOrdered) * 100)
      : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let isOverdue = false;
  if (order?.expected_dispatch_date) {
    const ed = new Date(order.expected_dispatch_date);
    ed.setHours(0, 0, 0, 0);
    const st = (order.status || "pending").toLowerCase();
    if (ed < today && st !== "dispatched") {
      isOverdue = true;
    }
  }

  return (
    <>
      <h1 className="section-title">Order Detail</h1>
      <p className="section-subtitle">
        Full breakdown of this Tycoon order with status & dispatch tracking.
      </p>

      {/* TOP SUMMARY */}
      <div className="card-grid" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-label">Order Code</div>
          <div className="card-value" style={{ fontSize: 16 }}>
            {displayCode}
          </div>
          <div className="card-meta" style={{ fontSize: 12, lineHeight: 1.5 }}>
            Internal ID: <span style={{ fontSize: 11 }}>{order.id}</span>
            <br />
            <span style={{ display: "inline-block", marginTop: 6 }}>
              Status:&nbsp;
              <select
                value={order.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #333",
                  background: "#050505",
                  color: "#f5f5f5",
                  fontSize: 11,
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </span>
            <br />
            <span style={{ opacity: 0.7 }}>
              Current: {statusLabel || "Unknown"}
            </span>
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

          {/* Order date (read-only) */}
          <div
            className="card-meta"
            style={{ fontSize: 12, marginBottom: 6 }}
          >
            Order date:&nbsp;
            {order.order_date
              ? new Date(order.order_date).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                })
              : "Not set"}
          </div>

          {/* Expected dispatch: editable */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12,
            }}
          >
            <span style={{ opacity: 0.8 }}>Expected dispatch date</span>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                type="date"
                value={expectedDispatch}
                onChange={(e) => setExpectedDispatch(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #333",
                  background: "#050505",
                  color: "#f5f5f5",
                  fontSize: 12,
                }}
              />

              <button
                type="button"
                onClick={saveExpectedDispatchDate}
                disabled={savingExpectedDate}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #f5f5f5",
                  background: savingExpectedDate ? "#111827" : "#f5f5f5",
                  color: savingExpectedDate ? "#9ca3af" : "#000",
                  fontSize: 11,
                  cursor: savingExpectedDate ? "default" : "pointer",
                }}
              >
                {savingExpectedDate ? "Saving…" : "Save"}
              </button>

              {order.expected_dispatch_date && (
                <span style={{ opacity: 0.75 }}>
                  Current:{" "}
                  {new Date(order.expected_dispatch_date).toLocaleDateString(
                    "en-IN",
                    { day: "2-digit", month: "short", year: "2-digit" }
                  )}
                </span>
              )}

              {isOverdue && (
                <span
                  style={{
                    background: "#ef4444",
                    color: "#fff",
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  Overdue
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-label">Totals</div>
          <div className="card-value" style={{ fontSize: 16 }}>
            {order.total_qty ?? 0} pcs · ₹
            {(order.total_value ?? 0).toLocaleString("en-IN")}
          </div>
          <div className="card-meta">
            Dispatched: {totalDispatched} / {totalOrdered} pcs
          </div>

          {/* Fulfilment bar */}
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                width: "100%",
                height: 6,
                borderRadius: 999,
                background: "#151515",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${fulfillmentPercent}%`,
                  height: "100%",
                  borderRadius: 999,
                  background:
                    fulfillmentPercent === 100 ? "#22c55e" : "#f5f5f5",
                  transition: "width 0.2s ease-out",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 11,
                marginTop: 4,
                opacity: 0.8,
              }}
            >
              {fulfillmentPercent}% fulfilled
            </div>
          </div>
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

      {/* ITEMS TABLE WITH DISPATCHED QTY */}
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
              <th style={{ width: "24%" }}>Item</th>
              <th>Category</th>
              <th>Rate</th>
              <th>Ordered</th>
              <th>Dispatched</th>
              <th>Pending</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any) => {
              const item =
                Array.isArray(l.items) && l.items.length > 0
                  ? l.items[0]
                  : l.items;

              const ordered = l.qty ?? 0;

              const rawDispatched =
                l.dispatched_qty === "" || l.dispatched_qty == null
                  ? 0
                  : Number(l.dispatched_qty);

              let dispatched = Number.isNaN(rawDispatched)
                ? 0
                : rawDispatched;

              if (dispatched < 0) dispatched = 0;
              if (dispatched > ordered) dispatched = ordered;

              const pending = Math.max(ordered - dispatched, 0);

              return (
                <tr key={l.id}>
                  <td>{item?.name ?? "Unknown item"}</td>
                  <td>{item?.category ?? "—"}</td>
                  <td>
                    ₹ {(l.dealer_rate_at_order ?? 0).toLocaleString("en-IN")}
                  </td>
                  <td>{ordered} pcs</td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={
                        l.dispatched_qty === "" ? "" : String(dispatched)
                      }
                      onChange={(e) =>
                        handleDispatchedChange(l.id, e.target.value)
                      }
                      style={{
                        width: 80,
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "1px solid #333",
                        background: "#050505",
                        color: "#f5f5f5",
                        fontSize: 12,
                      }}
                    />
                  </td>
                  <td>{pending} pcs</td>
                  <td>₹ {(l.line_total ?? 0).toLocaleString("en-IN")}</td>
                </tr>
              );
            })}

            {lines.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 12 }}>
                  No line items found for this order.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ACTIONS */}
      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          className="pill-button"
          type="button"
          onClick={() => router.push("/orders")}
        >
          ← Back to orders
        </button>

        <button
          className="pill-button"
          type="button"
          onClick={saveDispatch}
          disabled={savingDispatch}
        >
          {savingDispatch ? "Saving…" : "Save dispatch quantities"}
        </button>

        <button
          className="pill-button"
          type="button"
          onClick={saveStatus}
          disabled={savingStatus}
        >
          {savingStatus ? "Saving status…" : "Save status"}
        </button>
      </div>
    </>
  );
}
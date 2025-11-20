// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pending: "Pending",
  in_production: "In Production",
  packed: "Packed",
  partially_dispatched: "Partially Dispatched",
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
          line_remarks,
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

  // Handle notes/line_remarks editing
  function handleNoteChange(lineId: string, value: string) {
    if (!order) return;

    const updated = {
      ...order,
      order_lines: (order.order_lines || []).map((l: any) => {
        if (l.id !== lineId) return l;
        return { ...l, line_remarks: value };
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

        const note =
          typeof l.line_remarks === "string" &&
          l.line_remarks.trim() !== ""
            ? l.line_remarks.trim()
            : null;

        const { error } = await supabase
          .from("order_lines")
          .update({
            dispatched_qty: dispatched,
            line_remarks: note,
          })
          .eq("id", l.id);

        if (error) {
          console.error("Error updating line", l.id, error);
          alert("Error updating some lines: " + error.message);
          setSavingDispatch(false);
          return;
        }
      }

      alert("Dispatch quantities and notes updated.");
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

  // PDF EXPORT – uses a separate light, print-friendly layout
  async function exportPDF() {
    if (!order) return;

    try {
      const element = document.getElementById("order-export-print");
      if (!element) {
        alert("Error: export area not found.");
        return;
      }

      // Ensure images (logo) in the print area are loaded before capture
      const imgs = Array.from(element.getElementsByTagName("img"));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve(null);
          return new Promise((resolve) => {
            img.onload = () => resolve(null);
            img.onerror = () => resolve(null);
          });
        })
      );

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF("p", "mm", "a4");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgProps = pdf.getImageProperties(imgData);
      const marginX = 10;
      const marginY = 10;
      let pdfWidth = pageWidth - marginX * 2;
      let pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      if (pdfHeight > pageHeight - marginY * 2) {
        pdfHeight = pageHeight - marginY * 2;
        pdfWidth = (imgProps.width * pdfHeight) / imgProps.height;
      }

      pdf.addImage(
        imgData,
        "JPEG",
        marginX,
        marginY,
        pdfWidth,
        pdfHeight
      );

      const name = order.order_code || order.id || "order";
      pdf.save(`Tycoon-${name}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("PDF export failed. Check console for details.");
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

  // ---------- WHATSAPP SUMMARY HELPERS (WITH NOTES) ----------
  function buildWhatsAppText() {
    const partyName = party?.name ?? "Unknown party";
    const partyCity = party?.city ? ` (${party.city})` : "";
    const orderDateText = order.order_date
      ? new Date(order.order_date).toLocaleDateString("en-IN")
      : "Not set";
    const expectedText = order.expected_dispatch_date
      ? new Date(order.expected_dispatch_date).toLocaleDateString("en-IN")
      : "Not set";

    let text = `*TYCOON ORDER SUMMARY*\n`;
    text += `----------------------------------\n`;
    text += `*Order:* ${displayCode}\n`;
    text += `*Party:* ${partyName}${partyCity}\n`;
    text += `*Order Date:* ${orderDateText}\n`;
    text += `*Expected Dispatch:* ${expectedText}\n`;
    text += `*Status:* ${statusLabel}\n`;
    text += `*Fulfilment:* ${totalDispatched}/${totalOrdered} pcs (${fulfillmentPercent}%)\n`;
    text += `----------------------------------\n\n`;

    text += `*ITEM DETAILS*\n`;

    lines.forEach((l: any) => {
      const item =
        Array.isArray(l.items) && l.items.length > 0 ? l.items[0] : l.items;

      const name = item?.name ?? "Unknown item";
      const ordered = l.qty ?? 0;

      const rawDispatched =
        l.dispatched_qty === "" || l.dispatched_qty == null
          ? 0
          : Number(l.dispatched_qty);

      let dispatched = Number.isNaN(rawDispatched) ? 0 : rawDispatched;
      if (dispatched > ordered) dispatched = ordered;
      const pending = Math.max(ordered - dispatched, 0);

      const notes =
        typeof l.line_remarks === "string" && l.line_remarks.trim() !== ""
          ? l.line_remarks.trim()
          : null;

      text += `• *${name}*\n`;
      text += `  - Ordered: ${ordered} pcs\n`;
      text += `  - Dispatched: ${dispatched} pcs\n`;
      text += `  - Pending: ${pending} pcs\n`;

      if (notes) {
        text += `  - Notes: _${notes}_\n`;
      }

      text += `\n`;
    });

    if (order.remarks) {
      text += `----------------------------------\n`;
      text += `*Order Remarks:*\n${order.remarks.trim()}\n\n`;
    }

    text += `_Sent via Tycoon Order Portal_`;

    return text;
  }

  function shareOnWhatsApp() {
    try {
      const message = buildWhatsAppText();
      const encoded = encodeURIComponent(message);
      const url = `https://api.whatsapp.com/send?text=${encoded}`;
      window.open(url, "_blank");
    } catch (err) {
      console.error("Error building WhatsApp message", err);
      alert("Could not open WhatsApp. Check console for details.");
    }
  }

  // ---------- RENDER ----------
  return (
    <>
      {/* NORMAL DARK UI */}
      <div id="order-export-area">
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
            <div
              className="card-meta"
              style={{ fontSize: 12, lineHeight: 1.5 }}
            >
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

        {/* ITEMS TABLE WITH DISPATCHED QTY + NOTES */}
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
                <th>Notes</th>
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
                    <td>
                      <input
                        type="text"
                        value={l.line_remarks ?? ""}
                        onChange={(e) =>
                          handleNoteChange(l.id, e.target.value)
                        }
                        placeholder="Colour / customisation…"
                        style={{
                          width: "100%",
                          maxWidth: 220,
                          padding: "4px 8px",
                          borderRadius: 999,
                          border: "1px solid #333",
                          background: "#050505",
                          color: "#f5f5f5",
                          fontSize: 12,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}

              {lines.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 12 }}>
                    No line items found for this order.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* LIGHT PRINT-FRIENDLY LAYOUT (hidden off-screen, NO VALUES) */}
      <div
        id="order-export-print"
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "800px",
          backgroundColor: "#ffffff",
          color: "#111827",
          padding: "24px",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: "11px",
        }}
      >
        {/* Header with logo + title */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 8,
            gap: 12,
          }}
        >
          <img
            src="/Tycoon_Logo.JPG"
            alt="Tycoon Logo"
            style={{ height: 32 }}
          />
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 0.5,
              }}
            >
              TYCOON ORDER PORTAL
            </div>
            <div style={{ fontSize: 11, color: "#4b5563" }}>Order Sheet</div>
          </div>
        </div>

        <hr
          style={{
            border: 0,
            borderTop: "1px solid #e5e7eb",
            margin: "8px 0 16px",
          }}
        />

        {/* Meta section */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 24,
            marginBottom: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Party details
            </div>
            <div style={{ fontSize: 11, color: "#374151" }}>
              <div>{party?.name ?? "Unknown party"}</div>
              <div>{party?.city ?? ""}</div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Order details
            </div>
            <div style={{ fontSize: 11, color: "#374151" }}>
              <div>Order code: {displayCode}</div>
              <div>
                Order date:{" "}
                {order.order_date
                  ? new Date(order.order_date).toLocaleDateString("en-IN")
                  : "Not set"}
              </div>
              <div>Status: {statusLabel}</div>
              <div>
                Expected dispatch:{" "}
                {order.expected_dispatch_date
                  ? new Date(
                      order.expected_dispatch_date
                    ).toLocaleDateString("en-IN")
                  : "Not set"}
              </div>
              <div>
                Dispatched: {totalDispatched} / {totalOrdered} pcs (
                {fulfillmentPercent}%)
              </div>
            </div>
          </div>
        </div>

        {/* Remarks (light) */}
        {order.remarks && (
          <div
            style={{
              fontSize: 11,
              color: "#374151",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Remarks
            </div>
            <div
              style={{
                whiteSpace: "pre-wrap",
                border: "1px solid #e5e7eb",
                borderRadius: 4,
                padding: 8,
                backgroundColor: "#f9fafb",
              }}
            >
              {order.remarks}
            </div>
          </div>
        )}

        {/* Items table – light theme, NO RATES / VALUES, notes under item */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: 4,
          }}
        >
          <thead>
            <tr>
              {["Item", "Category", "Ordered", "Dispatched", "Pending"].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #e5e7eb",
                      padding: "6px 4px",
                      fontWeight: 600,
                      fontSize: 11,
                      color: "#111827",
                    }}
                  >
                    {h}
                  </th>
                )
              )}
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

              const notes =
                typeof l.line_remarks === "string" &&
                l.line_remarks.trim() !== ""
                  ? l.line_remarks.trim()
                  : null;

              return (
                <tr key={l.id}>
                  <td
                    style={{
                      padding: "4px 4px",
                      borderBottom: "1px solid #f3f4f6",
                      fontSize: 11,
                      color: "#111827",
                    }}
                  >
                    <div>{item?.name ?? "Unknown item"}</div>
                    {notes && (
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 10,
                          color: "#6b7280",
                        }}
                      >
                        Notes: {notes}
                      </div>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "4px 4px",
                      borderBottom: "1px solid #f3f4f6",
                      fontSize: 11,
                      color: "#4b5563",
                    }}
                  >
                    {item?.category ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "4px 4px",
                      borderBottom: "1px solid #f3f4f6",
                      fontSize: 11,
                      color: "#4b5563",
                    }}
                  >
                    {ordered}
                  </td>
                  <td
                    style={{
                      padding: "4px 4px",
                      borderBottom: "1px solid #f3f4f6",
                      fontSize: 11,
                      color: "#4b5563",
                    }}
                  >
                    {dispatched}
                  </td>
                  <td
                    style={{
                      padding: "4px 4px",
                      borderBottom: "1px solid #f3f4f6",
                      fontSize: 11,
                      color: "#4b5563",
                    }}
                  >
                    {pending}
                  </td>
                </tr>
              );
            })}

            {lines.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    textAlign: "center",
                    padding: 10,
                    fontSize: 11,
                    color: "#6b7280",
                  }}
                >
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
          {savingDispatch ? "Saving…" : "Save dispatch qty. + notes"}
        </button>

        <button
          className="pill-button"
          type="button"
          onClick={saveStatus}
          disabled={savingStatus}
        >
          {savingStatus ? "Saving status…" : "Save status"}
        </button>

        <button
          className="pill-button"
          type="button"
          onClick={exportPDF}
          style={{ background: "#e5e5e5", color: "#000" }}
        >
          📄 Export as PDF
        </button>

        <button
          className="pill-button"
          type="button"
          onClick={shareOnWhatsApp}
          style={{
            background: "#25D366",
            borderColor: "#25D366",
            color: "#000",
          }}
        >
          🟢 Share on WhatsApp
        </button>
      </div>
    </>
  );
}
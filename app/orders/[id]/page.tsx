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
  const [originalLines, setOriginalLines] = useState<any[]>([]);
  const [originalStatus, setOriginalStatus] = useState<string | null>(null);

  const [logs, setLogs] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [orderRemarks, setOrderRemarks] = useState("");
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [expectedDispatch, setExpectedDispatch] = useState("");
  const [savingExpectedDate, setSavingExpectedDate] = useState(false);

  // For adding new lines
  const [items, setItems] = useState<any[]>([]);
  const [addingLine, setAddingLine] = useState(false);
  const [newLineItemId, setNewLineItemId] = useState("");
  const [newLineQty, setNewLineQty] = useState("");
  const [newLineNote, setNewLineNote] = useState("");
  const [savingNewLine, setSavingNewLine] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    loadOrder();
    loadItems();
    loadLogs();
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
      setOriginalLines(data.order_lines || []);
      setOriginalStatus(data.status || null);
      setOrderRemarks(data.remarks ?? "");
    }

    setLoading(false);
  }

  async function loadItems() {
    const { data, error } = await supabase
      .from("items")
      .select("id, name, category, dealer_rate")
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("Error loading items", error);
      setItems([]);
    } else {
      setItems(data || []);
    }
  }

  async function loadLogs() {
    if (!orderId) return;
    const { data, error } = await supabase
      .from("order_logs")
      .select("id, message, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error loading logs", error);
      setLogs([]);
    } else {
      setLogs(data || []);
    }
  }

  // ---------- INLINE EDIT HANDLERS ----------

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

  // ---------- SAVE DISPATCH + NOTES (WITH LOGS) ----------

  async function saveDispatch() {
    if (!order) return;
    setSavingDispatch(true);

    try {
      const lines = order.order_lines || [];
      const logsToInsert: { order_id: string; message: string }[] = [];

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

        const newNote = (l.line_remarks || "").trim() || null;

        const { error } = await supabase
          .from("order_lines")
          .update({
            dispatched_qty: dispatched,
            line_remarks: newNote,
          })
          .eq("id", l.id);

        if (error) {
          console.error("Error updating line", l.id, error);
          alert("Error updating some lines: " + error.message);
          setSavingDispatch(false);
          return;
        }

        // Find original line for logging
        const orig = originalLines.find((ol: any) => ol.id === l.id) || {};
        const origDispatched = orig.dispatched_qty ?? 0;
        const origNote = (orig.line_remarks || "").trim();

        const itemRel = l.items;
        const item =
          itemRel && Array.isArray(itemRel) && itemRel.length > 0
            ? itemRel[0]
            : itemRel || null;
        const itemName = item?.name || "Unknown item";

        // Log dispatched qty change
        if (dispatched !== origDispatched) {
          logsToInsert.push({
            order_id: order.id,
            message: `Updated dispatched qty for ${itemName}: ${origDispatched} → ${dispatched}`,
          });
        }

        const newNoteStr = (newNote || "").trim();
        if (origNote !== newNoteStr) {
          logsToInsert.push({
            order_id: order.id,
            message: `Updated note for ${itemName}: "${origNote || "-"}" → "${
              newNoteStr || "-"
            }"`,
          });
        }
      }

      if (logsToInsert.length > 0) {
        const { error: logError } = await supabase
          .from("order_logs")
          .insert(logsToInsert);
        if (logError) {
          console.error("Error inserting dispatch logs", logError);
        }
      }

      alert("Dispatch quantities & notes updated.");
      await loadOrder();
      await loadLogs();
    } finally {
      setSavingDispatch(false);
    }
  }

  // ---------- STATUS CHANGE (WITH LOG) ----------

  function handleStatusChange(value: string) {
    if (!order) return;
    setOrder({ ...order, status: value });
  }

  async function saveStatus() {
    if (!order) return;
    setSavingStatus(true);

    try {
      const newStatus = order.status || "pending";
      const prevStatus = originalStatus || order.status || "pending";

      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", order.id);

      if (error) {
        console.error("Error updating status", error);
        alert("Error updating status: " + error.message);
        setSavingStatus(false);
        return;
      }

      // log only if changed
      if (newStatus !== prevStatus) {
        const { error: logError } = await supabase.from("order_logs").insert([
          {
            order_id: order.id,
            message: `Status changed: ${prevStatus} → ${newStatus}`,
          },
        ]);
        if (logError) {
          console.error("Error inserting status log", logError);
        }
      }

      alert("Order status updated.");
      await loadOrder();
      await loadLogs();
    } finally {
      setSavingStatus(false);
    }
  }

  // ---------- EXPECTED DISPATCH DATE ----------

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

      setOrder({ ...order, expected_dispatch_date: value });
      alert("Expected dispatch date updated.");
      await loadLogs(); // optional to log this later if you want
    } finally {
      setSavingExpectedDate(false);
    }
  }

  async function saveRemarks() {
    if (!order) return;
    setSavingRemarks(true);

    try {
      const trimmed =
        orderRemarks.trim() === "" ? null : orderRemarks.trim();

      const { error } = await supabase
        .from("orders")
        .update({ remarks: trimmed })
        .eq("id", order.id);

      if (error) {
        console.error("Error updating remarks", error);
        alert("Error updating remarks: " + error.message);
        return;
      }

      // keep local order in sync
      setOrder({ ...order, remarks: trimmed });
      alert("Remarks updated.");
    } finally {
      setSavingRemarks(false);
    }
  }

  // ---------- DELETE LINE (WITH LOG) ----------

  async function deleteLine(line: any) {
    if (!order) return;
    if (!confirm("Remove this item from the order?")) return;

    const itemRel = line.items;
    const item =
      itemRel && Array.isArray(itemRel) && itemRel.length > 0
        ? itemRel[0]
        : itemRel || null;
    const itemName = item?.name || "Unknown item";
    const qty = line.qty ?? 0;

    const { error } = await supabase
      .from("order_lines")
      .delete()
      .eq("id", line.id);

    if (error) {
      console.error("Error deleting line", error);
      alert("Could not delete line: " + error.message);
      return;
    }

    const { error: logError } = await supabase.from("order_logs").insert([
      {
        order_id: order.id,
        message: `Deleted line item: ${itemName} (${qty} pcs)`,
      },
    ]);
    if (logError) {
      console.error("Error inserting delete log", logError);
    }

    await loadOrder();
    await loadLogs();
  }

  // ---------- ADD NEW LINE (WITH LOG) ----------

  function handleNewLineQtyChange(value: string) {
    if (value.trim() === "") {
      setNewLineQty("");
      return;
    }
    const cleaned = value.replace(/[^\d]/g, "");
    if (cleaned === "") {
      setNewLineQty("");
      return;
    }
    const num = parseInt(cleaned, 10);
    if (Number.isNaN(num) || num < 0) {
      setNewLineQty("");
      return;
    }
    setNewLineQty(String(num));
  }

  async function saveNewLine() {
    if (!order) return;
    if (!newLineItemId) {
      alert("Select an item for the new line.");
      return;
    }
    if (!newLineQty) {
      alert("Enter quantity for the new line.");
      return;
    }

    const qty = parseInt(newLineQty, 10);
    if (!qty || qty <= 0) {
      alert("Quantity must be greater than zero.");
      return;
    }

    const item = items.find((i) => i.id === newLineItemId);
    const rate = item?.dealer_rate ?? 0;
    const lineTotal = rate * qty;
    const note = newLineNote.trim() || null;

    setSavingNewLine(true);

    try {
      const { data, error } = await supabase
        .from("order_lines")
        .insert([
          {
            order_id: order.id,
            item_id: newLineItemId,
            qty,
            dispatched_qty: 0,
            dealer_rate_at_order: rate,
            line_total: lineTotal,
            line_remarks: note,
          },
        ])
        .select("id");

      if (error) {
        console.error("Error adding new line", error);
        alert("Error adding line: " + error.message);
        setSavingNewLine(false);
        return;
      }

      const itemName = item?.name || "Unknown item";
      const msgBase = `Added line item: ${itemName} (${qty} pcs)`;
      const message = note ? `${msgBase}, Note: "${note}"` : msgBase;

      const { error: logError } = await supabase.from("order_logs").insert([
        {
          order_id: order.id,
          message,
        },
      ]);
      if (logError) {
        console.error("Error inserting add-line log", logError);
      }

      setAddingLine(false);
      setNewLineItemId("");
      setNewLineQty("");
      setNewLineNote("");

      await loadOrder();
      await loadLogs();
    } finally {
      setSavingNewLine(false);
    }
  }

  // ---------- PDF EXPORT ----------

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

      pdf.addImage(imgData, "JPEG", marginX, marginY, pdfWidth, pdfHeight);

      const name = order.order_code || order.id || "order";
      pdf.save(`Tycoon-${name}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("PDF export failed. Check console for details.");
    }
  }

  // ---------- WHATSAPP SUMMARY (INCLUDES NOTES) ----------

  const party =
    order &&
    Array.isArray(order.parties) &&
    order.parties.length > 0
      ? order.parties[0]
      : order?.parties;

  const lines = order?.order_lines || [];
  const statusLabel = order
    ? STATUS_LABELS[order.status] ?? order.status
    : "";
  const displayCode = order?.order_code || order?.id;

  const totalOrdered = lines.reduce(
    (sum, l: any) => sum + (l.qty ?? 0),
    0
  );

  // Compute total value from lines (prefer line_total, fallback to rate * qty)
  const totalValueFromLines = lines.reduce((sum, l: any) => {
    const qty = l.qty ?? 0;
    const lineTotal =
      typeof l.line_total === "number"
        ? l.line_total
        : (l.dealer_rate_at_order ?? 0) * qty;
    return sum + lineTotal;
  }, 0);

  // For consistency, use lines for total qty too
  const totalQtyFromLines = totalOrdered;

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

  function buildWhatsAppText() {
    if (!order) return "";

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
      const itemRel = l.items;
      const item =
        itemRel && Array.isArray(itemRel) && itemRel.length > 0
          ? itemRel[0]
          : itemRel || null;

      const name = item?.name ?? "Unknown item";
      const ordered = l.qty ?? 0;

      const rawDispatched =
        l.dispatched_qty === "" || l.dispatched_qty == null
          ? 0
          : Number(l.dispatched_qty);

      let dispatched = Number.isNaN(rawDispatched)
        ? 0
        : rawDispatched;
      if (dispatched > ordered) dispatched = ordered;
      const pending = Math.max(ordered - dispatched, 0);

      const notes =
        typeof l.line_remarks === "string" &&
        l.line_remarks.trim() !== ""
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
      if (!message) return;
      const encoded = encodeURIComponent(message);
      const url = `https://api.whatsapp.com/send?text=${encoded}`;
      window.open(url, "_blank");
    } catch (err) {
      console.error("Error building WhatsApp message", err);
      alert("Could not open WhatsApp. Check console for details.");
    }
  }

  // ---------- RENDER ----------

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

  return (
    <>
      {/* NORMAL DARK UI */}
      <div id="order-export-area">
        <h1 className="section-title">Order Detail</h1>
        <p className="section-subtitle">
          Full breakdown of this Tycoon order with status, notes & dispatch
          tracking.
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
                    {new Date(
                      order.expected_dispatch_date
                    ).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
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
              {totalQtyFromLines} pcs · ₹
              {totalValueFromLines.toLocaleString("en-IN")}
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

        {/* REMARKS – editable */}
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-label">Order Remarks</div>

          <textarea
            value={orderRemarks}
            onChange={(e) => setOrderRemarks(e.target.value)}
            rows={3}
            placeholder="Add any remarks for this order…"
            style={{
              width: "100%",
              marginTop: 6,
              fontSize: 12,
              lineHeight: 1.5,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #333",
              background: "#050505",
              color: "#f5f5f5",
              resize: "vertical",
              whiteSpace: "pre-wrap",
            }}
          />

          <div
            style={{
              marginTop: 8,
              display: "flex",
              justifyContent: "flex-start",
              gap: 8,
              alignItems: "center",
              fontSize: 11,
            }}
          >
            <button
              type="button"
              onClick={saveRemarks}
              disabled={savingRemarks}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #f5f5f5",
                background: savingRemarks ? "#111827" : "#f5f5f5",
                color: savingRemarks ? "#9ca3af" : "#000",
                cursor: savingRemarks ? "default" : "pointer",
              }}
            >
              {savingRemarks ? "Saving…" : "Save remarks"}
            </button>

            {order.remarks && (
              <span style={{ opacity: 0.7 }}>
                Last saved:{" "}
                {order.remarks.length > 40
                  ? order.remarks.slice(0, 40) + "…"
                  : order.remarks}
              </span>
            )}
          </div>
        </div>

        {/* ITEMS TABLE WITH DISPATCHED QTY + NOTES + DELETE */}
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="table-header">
            <div className="table-title">Items in this order</div>
            <div className="table-filters">
              {lines.length} line{lines.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "22%" }}>Item</th>
                  <th>Category</th>
                  <th>Rate</th>
                  <th>Ordered</th>
                  <th>Dispatched</th>
                  <th>Pending</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l: any) => {
                  const itemRel = l.items;
                  const item =
                    itemRel && Array.isArray(itemRel) && itemRel.length > 0
                      ? itemRel[0]
                      : itemRel || null;

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
                        ₹{" "}
                        {(l.dealer_rate_at_order ?? 0).toLocaleString(
                          "en-IN"
                        )}
                      </td>
                      <td>{ordered} pcs</td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={
                            l.dispatched_qty === ""
                              ? ""
                              : String(dispatched)
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
                      <td>
                        <input
                          type="text"
                          value={l.line_remarks || ""}
                          onChange={(e) =>
                            handleNoteChange(l.id, e.target.value)
                          }
                          placeholder="Colour / customisation..."
                          style={{
                            width: "100%",
                            padding: "4px 8px",
                            borderRadius: 8,
                            border: "1px solid #333",
                            background: "#050505",
                            color: "#f5f5f5",
                            fontSize: 12,
                          }}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => deleteLine(l)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid #333",
                            background: "transparent",
                            color: "#aaa",
                            fontSize: 12,
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {lines.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      style={{ textAlign: "center", padding: 12 }}
                    >
                      No line items found for this order.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ADD NEW LINE UI */}
          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            {!addingLine && (
              <button
                type="button"
                onClick={() => setAddingLine(true)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "1px solid #fff",
                  background: "transparent",
                  color: "#fff",
                  fontSize: 12,
                }}
              >
                + Add line
              </button>
            )}

            {addingLine && (
              <div
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid #333",
                  background: "#050505",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <span style={{ opacity: 0.8 }}>New line:</span>

                <select
                  value={newLineItemId}
                  onChange={(e) => setNewLineItemId(e.target.value)}
                  style={{
                    minWidth: 180,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid #333",
                    background: "#050505",
                    color: "#f5f5f5",
                  }}
                >
                  <option value="">Select item</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={newLineQty}
                  onChange={(e) => handleNewLineQtyChange(e.target.value)}
                  placeholder="Qty"
                  style={{
                    width: 70,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid #333",
                    background: "#050505",
                    color: "#f5f5f5",
                  }}
                />

                <input
                  type="text"
                  value={newLineNote}
                  onChange={(e) => setNewLineNote(e.target.value)}
                  placeholder="Notes (colour / customisation)"
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid #333",
                    background: "#050505",
                    color: "#f5f5f5",
                  }}
                />

                <button
                  type="button"
                  onClick={saveNewLine}
                  disabled={savingNewLine}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #fff",
                    background: savingNewLine ? "#111827" : "#f5f5f5",
                    color: savingNewLine ? "#9ca3af" : "#000",
                    cursor: savingNewLine ? "default" : "pointer",
                  }}
                >
                  {savingNewLine ? "Adding…" : "Save line"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAddingLine(false);
                    setNewLineItemId("");
                    setNewLineQty("");
                    setNewLineNote("");
                  }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #333",
                    background: "transparent",
                    color: "#f5f5f5",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LIGHT PRINT-FRIENDLY LAYOUT (hidden off-screen, INCLUDES NOTES) */}
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
            <div style={{ fontSize: 11, color: "#4b5563" }}>
              Order Sheet
            </div>
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
                  ? new Date(order.order_date).toLocaleDateString(
                      "en-IN"
                    )
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

        {/* Items table – light theme, notes shown under item */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: 4,
          }}
        >
          <thead>
            <tr>
              {["Item", "Ordered", "Dispatched", "Pending"].map(
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
              const itemRel = l.items;
              const item =
                itemRel && Array.isArray(itemRel) && itemRel.length > 0
                  ? itemRel[0]
                  : itemRel || null;

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
              const note =
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
                    {note && (
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 10,
                          color: "#6b7280",
                          fontStyle: "italic",
                        }}
                      >
                        Note: {note}
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
          {savingDispatch
            ? "Saving…"
            : "Save dispatch quantities & notes"}
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

      {/* ACTIVITY LOG */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-label">Activity log</div>
        {logs.length === 0 && (
          <div
            style={{
              fontSize: 12,
              opacity: 0.8,
              marginTop: 4,
            }}
          >
            No activity recorded yet.
          </div>
        )}

        {logs.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              marginTop: 6,
              fontSize: 12,
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {logs.map((log) => (
              <li
                key={log.id}
                style={{
                  padding: "4px 0",
                  borderBottom: "1px solid #1f2933",
                }}
              >
                <div
                  style={{
                    opacity: 0.75,
                    fontSize: 10,
                    marginBottom: 2,
                  }}
                >
                  {log.created_at
                    ? new Date(log.created_at).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </div>
                <div>{log.message}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
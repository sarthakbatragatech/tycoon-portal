// @ts-nocheck
"use client";

import ActivityLogCard from "./ActivityLogCard";
import FullyDispatchedBatches from "./FullyDispatchedBatches";
import { STATUS_LABELS, STATUS_OPTIONS } from "@/lib/constants/status";
import { formatDateShort } from "@/lib/utils/date";

export default function OrderDetailView(props: any) {
  const {
    router,
    order,
    logs,

    // remarks
    orderRemarks,
    setOrderRemarks,
    savingRemarks,
    saveRemarks,

    // status
    savingStatus,
    handleStatusChange,
    saveStatus,
    statusColor,

    // expected dispatch
    expectedDispatch,
    setExpectedDispatch,
    savingExpectedDate,
    saveExpectedDispatchDate,

    // ✅ dispatch + notes (FIX: accept new names but keep old variable names)
    dispatchDate,
    setDispatchDate,

    // client sends "dispatchedToday" -> view uses "dispatchedNow"
    dispatchedToday: dispatchedNow,

    // client sends "handleDispatchedTodayChange" -> view uses "handleDispatchedNowChange"
    handleDispatchedTodayChange: handleDispatchedNowChange,

    handleNoteChange,
    savingDispatch,

    // client sends "saveDispatchAndNotes" -> view uses "saveDispatch"
    saveDispatchAndNotes: saveDispatch,

    // add new line
    items,
    addingLine,
    setAddingLine,
    newLineItemId,
    setNewLineItemId,
    newLineQty,
    setNewLineQty,
    newLineNote,
    setNewLineNote,
    savingNewLine,
    handleNewLineQtyChange,

    // client sends "addNewLine" -> view uses "saveNewLine"
    addNewLine: saveNewLine,

    // delete line
    deleteLine,

    // export / whatsapp
    exportPDF,
    shareOnWhatsApp,

    // dispatch history
    dispatchEvents,
  } = props;

  const lines = Array.isArray(order?.order_lines) ? order.order_lines : [];

  // ---------- helpers ----------
  function getItemFromRel(line: any) {
    const rel = line?.items;
    if (rel && Array.isArray(rel) && rel.length > 0) return rel[0];
    return rel || null;
  }

  function getLineStats(l: any) {
    const ordered = Number(l?.qty) || 0;
    const raw =
      l?.dispatched_qty === "" || l?.dispatched_qty == null
        ? 0
        : Number(l?.dispatched_qty);

    let dispatched = Number.isNaN(raw) ? 0 : raw;
    if (dispatched < 0) dispatched = 0;
    if (dispatched > ordered) dispatched = ordered;

    const pending = Math.max(ordered - dispatched, 0);
    return { ordered, dispatched, pending };
  }

  const pendingLines = lines.filter((l: any) => getLineStats(l).pending > 0);

  const fullyDispatchedLines = lines.filter((l: any) => {
    const { ordered, dispatched, pending } = getLineStats(l);
    return ordered > 0 && dispatched === ordered && pending === 0;
  });

  // ---------- totals ----------
  const totalOrdered = lines.reduce(
    (s: number, l: any) => s + (Number(l?.qty) || 0),
    0
  );

  const totalDispatched = lines.reduce((s: number, l: any) => {
    const { ordered, dispatched } = getLineStats(l);
    return s + Math.min(dispatched, ordered);
  }, 0);

  const totalValue = lines.reduce((s: number, l: any) => {
    const qty = Number(l?.qty) || 0;
    const lineTotal =
      typeof l?.line_total === "number"
        ? l.line_total
        : (Number(l?.dealer_rate_at_order) || 0) * qty;
    return s + (Number(lineTotal) || 0);
  }, 0);

  const fulfillmentPercent =
    totalOrdered > 0 ? Math.round((totalDispatched / totalOrdered) * 100) : 0;

  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  // ---------- party ----------
  const party =
    order && Array.isArray(order?.parties) && order.parties.length > 0
      ? order.parties[0]
      : order?.parties;

  // ---------- overdue ----------
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let isOverdue = false;
  if (order?.expected_dispatch_date) {
    const ed = new Date(order.expected_dispatch_date);
    ed.setHours(0, 0, 0, 0);
    const st = String(order.status || "pending").toLowerCase();
    if (ed < today && st !== "dispatched") isOverdue = true;
  }

  // ---------- table styles ----------
  const thBase: any = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.08,
    opacity: 0.85,
    padding: "10px 10px",
    whiteSpace: "nowrap",
    textAlign: "center",
    verticalAlign: "middle",
  };
  const thLeft: any = { ...thBase, textAlign: "left" };
  const tdBase: any = {
    padding: "10px 10px",
    fontSize: 12,
    verticalAlign: "middle",
  };

  if (!order) {
    return (
      <>
        <h1 className="section-title">Order Detail</h1>
        <p className="section-subtitle">Order not found.</p>
        <button
          className="pill-button"
          type="button"
          onClick={() => router?.push?.("/orders")}
        >
          Back to orders
        </button>
      </>
    );
  }

  return (
    <>
      <div id="order-export-area">
        <h1 className="section-title">Order Detail</h1>
        <p className="section-subtitle">
          Full breakdown of this Tycoon order with status, notes & dispatch
          tracking.
        </p>

        {/* TOP SUMMARY */}
        <div className="card-grid" style={{ marginBottom: 18 }}>
          {/* ORDER CODE + STATUS */}
          <div className="card">
            <div className="card-label">Order Code</div>
            <div className="card-value" style={{ fontSize: 16 }}>
              {order?.order_code ?? order?.id ?? "—"}
            </div>

            <div
              className="card-meta"
              style={{ fontSize: 12, lineHeight: 1.5, marginTop: 4 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span style={{ opacity: 0.8 }}>Status</span>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: statusColor || "#4b5563",
                    color: "#f9fafb",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "capitalize",
                    whiteSpace: "nowrap",
                  }}
                >
                  {STATUS_LABELS?.[order.status] ?? order.status ?? "Pending"}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <select
                  value={order.status}
                  onChange={(e) => handleStatusChange?.(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid #333",
                    background: "#050505",
                    color: "#f5f5f5",
                    fontSize: 11,
                  }}
                >
                  {(STATUS_OPTIONS || []).map((opt: any) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => saveStatus?.()}
                  disabled={!!savingStatus}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #f5f5f5",
                    background: savingStatus ? "#111827" : "#f5f5f5",
                    color: savingStatus ? "#9ca3af" : "#000",
                    fontSize: 11,
                    cursor: savingStatus ? "default" : "pointer",
                    fontWeight: 700,
                  }}
                >
                  {savingStatus ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>

          {/* PARTY */}
          <div className="card">
            <div className="card-label">Party</div>

            <div className="card-value" style={{ fontSize: 16 }}>
              {party?.name ?? "—"}
            </div>

            <div className="card-meta" style={{ marginTop: 4 }}>
              {party?.city ?? ""}
            </div>

            {/* Overdue badge on next line */}
            {isOverdue && (
              <div style={{ marginTop: 8 }}>
                <span
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 900,
                    background: "#ef4444",
                    color: "#111",
                    lineHeight: 1.35,
                    display: "inline-block",
                  }}
                >
                  Overdue
                </span>
              </div>
            )}
          </div>

          {/* DATES */}
          <div className="card">
            <div className="card-label">Dates</div>

            <div className="card-meta" style={{ fontSize: 12, marginBottom: 6 }}>
              Order date:&nbsp;
              {order?.order_date
                ? new Date(order.order_date).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "2-digit",
                  })
                : "Not set"}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Expected dispatch date
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={expectedDispatch || ""}
                  onChange={(e) => setExpectedDispatch?.(e.target.value)}
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
                  onClick={() => saveExpectedDispatchDate?.()}
                  disabled={!!savingExpectedDate}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #f5f5f5",
                    background: savingExpectedDate ? "#111827" : "#f5f5f5",
                    color: savingExpectedDate ? "#9ca3af" : "#000",
                    fontSize: 11,
                    cursor: savingExpectedDate ? "default" : "pointer",
                    fontWeight: 700,
                  }}
                >
                  {savingExpectedDate ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>

          {/* TOTALS */}
          <div className="card">
            <div className="card-label">Totals</div>

            <div className="card-value" style={{ fontSize: 16 }}>
              {totalOrdered} pcs : {money.format(totalValue)}
            </div>

            <div className="card-meta" style={{ marginTop: 6, fontSize: 12 }}>
              Dispatched: {totalDispatched}/{totalOrdered} pcs
            </div>

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
                    background: "#f5f5f5",
                    transition: "width 0.2s ease-out",
                  }}
                />
              </div>
              <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                {fulfillmentPercent}% fulfilled
              </div>
            </div>
          </div>
        </div>

        {/* REMARKS */}
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-label">Order Remarks</div>

          <textarea
            value={orderRemarks ?? ""}
            onChange={(e) => setOrderRemarks?.(e.target.value)}
            rows={1}
            placeholder="Add any remarks for this order…"
            style={{
              width: "100%",
              marginTop: 6,
              fontSize: 12,
              lineHeight: 1.4,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #333",
              background: "#050505",
              color: "#f5f5f5",
              resize: "vertical",
              whiteSpace: "pre-wrap",
              minHeight: 34,
            }}
          />

          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => saveRemarks?.()}
              disabled={!!savingRemarks}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #f5f5f5",
                background: savingRemarks ? "#111827" : "#f5f5f5",
                color: savingRemarks ? "#9ca3af" : "#000",
                cursor: savingRemarks ? "default" : "pointer",
                fontWeight: 800,
                fontSize: 11,
              }}
            >
              {savingRemarks ? "Saving…" : "Save remarks"}
            </button>
          </div>
        </div>

        {/* ITEMS TABLES */}
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="table-header">
            <div className="table-title">Items in this order</div>
            <div className="table-filters">{lines.length} lines</div>
          </div>

          {/* Dispatch date halo */}
          <div
            style={{
              marginTop: 8,
              marginBottom: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 12,
            }}
          >
            <span style={{ opacity: 0.8 }}>
              Enter &quot;Dispatched Today&quot; quantities for the date shown
              on the right.
            </span>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #38bdf8",
                boxShadow: "0 0 0 1px rgba(56,189,248,0.35)",
                background:
                  "radial-gradient(circle at top left, rgba(56,189,248,0.18), #020617)",
                whiteSpace: "nowrap",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  color: "#e0f2fe",
                  fontWeight: 800,
                }}
              >
                Dispatch date
              </span>

              <input
                type="date"
                value={dispatchDate || ""}
                onChange={(e) => setDispatchDate?.(e.target.value)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #0f172a",
                  background: "#020617",
                  color: "#f9fafb",
                  fontSize: 12,
                }}
              />
            </div>
          </div>

          {/* PENDING */}
          <div
            style={{
              marginTop: 6,
              marginBottom: 4,
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 0.06,
              opacity: 0.9,
            }}
          >
            Pending / partially dispatched items
          </div>

          <div className="table-wrapper" style={{ marginTop: 4 }}>
            <table className="table" style={{ tableLayout: "fixed", width: "100%" }}>
              <colgroup>
                <col style={{ width: "20%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "8%" }} />
              </colgroup>

              <thead>
                <tr>
                  <th style={thLeft}>Item</th>
                  <th style={thBase}>Rate</th>
                  <th style={thBase}>Ordered</th>
                  <th style={thBase}>Dispatched</th>
                  <th style={thBase}>Pending</th>
                  <th style={thBase}>
                    <div style={{ lineHeight: 1.1 }}>
                      Dispatched
                      <br />
                      Today
                    </div>
                  </th>
                  <th style={thBase}>Notes</th>
                  <th style={thBase}></th>
                </tr>
              </thead>

              <tbody>
                {pendingLines.map((l: any) => {
                  const item = getItemFromRel(l);
                  const { ordered, dispatched, pending } = getLineStats(l);
                  const rate = Number(l?.dealer_rate_at_order) || 0;

                  return (
                    <tr key={l.id}>
                      <td style={{ ...tdBase, textAlign: "left" }}>
                        {item?.name ?? "Unknown item"}
                      </td>

                      <td style={{ ...tdBase, textAlign: "center", opacity: 0.9 }}>
                        ₹ {rate.toLocaleString("en-IN")}
                      </td>

                      <td style={{ ...tdBase, textAlign: "center" }}>
                        {ordered} pcs
                      </td>

                      <td style={{ ...tdBase, textAlign: "center" }}>
                        {dispatched} pcs
                      </td>

                      <td style={{ ...tdBase, textAlign: "center" }}>
                        {pending} pcs
                      </td>

                      <td style={{ ...tdBase, textAlign: "center" }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={String(dispatchedNow?.[l.id] ?? "")}
                          onChange={(e) =>
                            handleDispatchedNowChange?.(l.id, e.target.value)
                          }
                          style={{
                            width: 54,
                            textAlign: "center",
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid #333",
                            background: "#050505",
                            color: "#f5f5f5",
                            fontSize: 12,
                          }}
                        />
                      </td>

                      <td style={{ ...tdBase, textAlign: "center" }}>
                        <input
                          type="text"
                          value={l?.line_remarks ?? ""}
                          onChange={(e) =>
                            handleNoteChange?.(l.id, e.target.value)
                          }
                          placeholder="Colour / customisation…"
                          style={{
                            width: "100%",
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid #333",
                            background: "#050505",
                            color: "#f5f5f5",
                            fontSize: 12,
                          }}
                        />
                      </td>

                      <td style={{ ...tdBase, textAlign: "center" }}>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                        <button
                          type="button"
                          onClick={() => deleteLine?.(l)}
                          style={{
                            width: 70,
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid #ef4444",
                            background: "#ef4444",
                            color: "#000",
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          Delete
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {pendingLines.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      style={{ textAlign: "center", padding: 12, opacity: 0.75 }}
                    >
                      No pending items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* BETWEEN TABLES: Save Dispatch + Add Line */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
          <button
            className="pill-button"
            type="button"
            onClick={() => saveDispatch?.()}
            disabled={!!savingDispatch}
            style={{
              background: savingDispatch ? "#14532d" : "#22c55e",
              borderColor: savingDispatch ? "#14532d" : "#22c55e",
              color: "#000",
              fontWeight: 900,
              opacity: savingDispatch ? 0.75 : 1,
              cursor: savingDispatch ? "default" : "pointer",
            }}
          >
            {savingDispatch ? "Saving…" : "Save dispatch quantities & notes"}
          </button>

            {!addingLine && (
              <button
                type="button"
                onClick={() => setAddingLine?.(true)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "1px solid #22c55e",
                  background: "#22c55e",
                  color: "#000",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                + Add line
              </button>
            )}
          </div>

          {addingLine && (
            <div
              style={{
                width: "100%",
                marginTop: 10,
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
                value={newLineItemId || ""}
                onChange={(e) => setNewLineItemId?.(e.target.value)}
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
                {(items || []).map((i: any) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={newLineQty || ""}
                onChange={(e) => handleNewLineQtyChange?.(e.target.value)}
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
                value={newLineNote || ""}
                onChange={(e) => setNewLineNote?.(e.target.value)}
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
                onClick={() => saveNewLine?.()}
                disabled={!!savingNewLine}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #fff",
                  background: savingNewLine ? "#111827" : "#f5f5f5",
                  color: savingNewLine ? "#9ca3af" : "#000",
                  cursor: savingNewLine ? "default" : "pointer",
                  fontWeight: 900,
                }}
              >
                {savingNewLine ? "Adding…" : "Save line"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAddingLine?.(false);
                  setNewLineItemId?.("");
                  setNewLineQty?.("");
                  setNewLineNote?.("");
                }}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #333",
                  background: "transparent",
                  color: "#f5f5f5",
                  fontWeight: 800,
                }}
              >
                Cancel
              </button>
            </div>
          )}

          <div style={{ marginTop: 18 }} />

          {/* ✅ Screen version */}
          <FullyDispatchedBatches
            fullyDispatchedLines={fullyDispatchedLines}
            dispatchEvents={dispatchEvents}
            getItemFromRel={getItemFromRel}
            getLineStats={getLineStats}
            formatDateShort={formatDateShort}
            variant="screen"
          />
        </div>

        {/* ACTIONS */}
        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            className="pill-button"
            type="button"
            onClick={() => router?.push?.("/orders")}
          >
            ← Back to orders
          </button>

          <button
            className="pill-button"
            type="button"
            onClick={() => exportPDF?.()}
            style={{ background: "#e5e5e5", color: "#000" }}
          >
            📄 Export as PDF
          </button>

          <button
            className="pill-button"
            type="button"
            onClick={() => shareOnWhatsApp?.()}
            style={{ background: "#25D366", borderColor: "#25D366", color: "#000" }}
          >
            🟢 Share on WhatsApp
          </button>
        </div>

        <ActivityLogCard logs={logs} />
      </div>

      {/* ✅ PRINT AREA (PRETTY) */}
      <div
        id="order-export-print"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: "794px", // A4 @ ~96dpi
          background: "#ffffff",
          color: "#111827",
          padding: 28,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
          fontSize: 12,
          opacity: 0,
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        {/* Header band */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            padding: "14px 14px",
            borderRadius: 14,
            border: "1px solid #e5e7eb",
            background: "linear-gradient(90deg, #0b1220 0%, #111827 100%)",
            color: "#f9fafb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src="/Tycoon_Logo.JPG"
              alt="Tycoon Logo"
              style={{ height: 34, width: "auto", borderRadius: 8 }}
              crossOrigin="anonymous"
            />
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.6 }}>
                TYCOON ORDER SHEET
              </div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>
                Order portal export ·{" "}
                {new Date().toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, opacity: 0.9 }}>Order code</div>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.6 }}>
              {order?.order_code ?? order?.id ?? "—"}
            </div>
          </div>
        </div>

        {/* Summary chips */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          {[
            {
              k: "Status",
              v: STATUS_LABELS?.[order?.status] ?? order?.status ?? "Pending",
            },
            {
              k: "Order date",
              v: order?.order_date
                ? new Date(order.order_date).toLocaleDateString("en-IN")
                : "Not set",
            },
            {
              k: "Expected dispatch",
              v: order?.expected_dispatch_date
                ? new Date(order.expected_dispatch_date).toLocaleDateString("en-IN")
                : "Not set",
            },
          ].map((x) => (
            <div
              key={x.k}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 999,
                padding: "6px 10px",
                background: "#f9fafb",
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                {x.k}
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#111827" }}>
                {x.v}
              </span>
            </div>
          ))}
        </div>

        {/* ✅ Party + Fulfilment + Notes */}
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
          }}
        >
          {/* PARTY */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "#6b7280",
              }}
            >
              Party
            </div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 900 }}>
              {party?.name ?? "—"}
            </div>
            <div style={{ marginTop: 2, fontSize: 12, color: "#4b5563" }}>
              {party?.city ?? ""}
            </div>
          </div>

          {/* FULFILMENT */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "#6b7280",
              }}
            >
              Fulfilment
            </div>

            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 900 }}>
              {totalDispatched} / {totalOrdered} pcs
            </div>

            <div style={{ marginTop: 6 }}>
              <div
                style={{
                  width: "100%",
                  height: 6,
                  borderRadius: 999,
                  background: "#e5e7eb",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${fulfillmentPercent}%`,
                    height: "100%",
                    background: fulfillmentPercent === 100 ? "#16a34a" : "#f59e0b",
                    borderRadius: 999,
                  }}
                />
              </div>
              <div style={{ fontSize: 11, marginTop: 4, color: "#374151" }}>
                {fulfillmentPercent}% fulfilled
              </div>
            </div>
          </div>

          {/* NOTES */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "#6b7280",
              }}
            >
              Notes
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#374151", whiteSpace: "pre-wrap" }}>
              {order?.remarks ?? "—"}
            </div>
          </div>
        </div>

        {/* Section title */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 10,
            borderTop: "2px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 1000, letterSpacing: 0.6, textTransform: "uppercase" }}>
            Pending / partially dispatched items
          </div>
        </div>

        {/* Pending table (prettier) */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: 10,
            border: "1px solid #e5e7eb",
          }}
        >
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              {["Item", "Ordered", "Dispatched", "Pending", "Notes"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === "Item" || h === "Notes" ? "left" : "center",
                    padding: "10px 10px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: 10.5,
                    fontWeight: 1000,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    color: "#374151",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {(pendingLines || []).map((l: any, idx: number) => {
              const item = getItemFromRel(l);
              const { ordered, dispatched, pending } = getLineStats(l);
              const note = (l?.line_remarks ?? "").trim();

              return (
                <tr
                  key={l.id}
                  style={{ background: idx % 2 === 0 ? "#ffffff" : "#fafafa" }}
                >
                  <td
                    style={{
                      padding: "9px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      fontWeight: 800,
                    }}
                  >
                    {item?.name ?? "Unknown item"}
                  </td>
                  <td
                    style={{
                      padding: "9px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      textAlign: "center",
                    }}
                  >
                    {ordered}
                  </td>
                  <td
                    style={{
                      padding: "9px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      textAlign: "center",
                    }}
                  >
                    {dispatched}
                  </td>
                  <td
                    style={{
                      padding: "9px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      textAlign: "center",
                      fontWeight: 1000,
                      color: pending > 0 ? "#b45309" : "#111827",
                    }}
                  >
                    {pending}
                  </td>
                  <td
                    style={{
                      padding: "9px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "pre-wrap",
                      color: "#374151",
                    }}
                  >
                    {note || "—"}
                  </td>
                </tr>
              );
            })}

            {(pendingLines || []).length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 12,
                    textAlign: "center",
                    color: "#6b7280",
                  }}
                >
                  No pending items.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Fully dispatched batches */}
        {(fullyDispatchedLines || []).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 1000, letterSpacing: 0.6, textTransform: "uppercase" }}>
              Fully dispatched items (by batch)
            </div>

            <div style={{ marginTop: 10 }}>
              <FullyDispatchedBatches
                fullyDispatchedLines={fullyDispatchedLines}
                dispatchEvents={dispatchEvents}
                getItemFromRel={getItemFromRel}
                getLineStats={getLineStats}
                formatDateShort={formatDateShort}
                variant="print"
              />
            </div>
          </div>
        )}

        {/* ✅ Footer (NO hardcoded Page text here) */}
        <div
          style={{
            marginTop: 18,
            borderTop: "1px solid #e5e7eb",
            paddingTop: 10,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 10.5, color: "#6b7280" }}>
            Generated from Tycoon Order Portal
          </div>
        </div>
      </div>
    </>
  );
}
// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function PunchOrderPage() {
  const [parties, setParties] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  const [partyId, setPartyId] = useState("");
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [expectedDate, setExpectedDate] = useState("");
  const [remarks, setRemarks] = useState("");

  // qty is kept as string so it can be truly empty
  const [lines, setLines] = useState<any[]>([
    { lineId: "l1", itemId: "", qty: "", note: "" },
    { lineId: "l2", itemId: "", qty: "", note: "" },
    { lineId: "l3", itemId: "", qty: "", note: "" },
  ]);

  useEffect(() => {
    loadParties();
    loadItems();
  }, []);

  async function loadParties() {
    const { data, error } = await supabase
      .from("parties")
      .select("id, name, city")
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("Error loading parties", error);
      setParties([]);
    } else {
      setParties(data || []);
    }
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

  function updateLine(
    id: string,
    field: "itemId" | "qty" | "note",
    value: string
  ) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.lineId !== id) return l;

        if (field === "qty") {
          // Allow fully empty
          if (value.trim() === "") {
            return { ...l, qty: "" };
          }

          // Keep only digits
          const cleaned = value.replace(/[^\d]/g, "");

          if (cleaned === "") {
            return { ...l, qty: "" };
          }

          // Store as number (no leading zeros in state)
          const num = parseInt(cleaned, 10);
          if (Number.isNaN(num) || num < 0) {
            return { ...l, qty: "" };
          }

          return { ...l, qty: num };
        }

        if (field === "note") {
          return { ...l, note: value };
        }

        // itemId
        return { ...l, itemId: value };
      })
    );
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        lineId: `l${prev.length + 1}`,
        itemId: "",
        qty: "",
        note: "",
      },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.lineId !== id));
  }

  // Attach details & compute totals
  const withDetails = lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId);
    const qty = l.qty === "" ? 0 : Number(l.qty);
    const rate = item?.dealer_rate ?? 0;
    const total = rate * qty;

    return { ...l, item, qty, rate, total };
  });

  const totals = withDetails.reduce(
    (acc, l) => ({
      qty: acc.qty + l.qty,
      value: acc.value + l.total,
    }),
    { qty: 0, value: 0 }
  );

  // Generate a new order code like TY-2025-11-0001
  async function generateOrderCode(orderDateStr: string) {
    const d = new Date(orderDateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const prefix = `TY-${year}-${month}-`;

    const start = `${year}-${month}-01`;

    const nextMonth = new Date(d);
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    const nextMonthYear = nextMonth.getFullYear();
    const nextMonthNum = String(nextMonth.getMonth() + 1).padStart(2, "0");
    const nextStart = `${nextMonthYear}-${nextMonthNum}-01`;

    const { data, error } = await supabase
      .from("orders")
      .select("order_code, created_at")
      .gte("order_date", start)
      .lt("order_date", nextStart)
      .not("order_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    let nextNumber = 1;

    if (!error && data && data.length > 0 && data[0].order_code) {
      const last = data[0].order_code as string;
      const parts = last.split("-");
      const lastSegment = parts[3] || "";
      const n = parseInt(lastSegment, 10);
      if (!Number.isNaN(n)) {
        nextNumber = n + 1;
      }
    }

    return `${prefix}${String(nextNumber).padStart(4, "0")}`;
  }

  async function submitOrder(status: "draft" | "submitted") {
    if (!partyId) {
      alert("Please select a party.");
      return;
    }

    // 1) Generate order code for this month
    const orderCode = await generateOrderCode(orderDate);

    // 2) Insert order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          party_id: partyId,
          status,
          order_date: orderDate,
          expected_dispatch_date: expectedDate || null,
          remarks,
          total_qty: totals.qty,
          total_value: totals.value,
          order_code: orderCode,
        },
      ])
      .select("id")
      .single();

    if (orderError) {
      alert("Error saving order: " + orderError.message);
      return;
    }

    const orderId = order.id;

    const linesToInsert = withDetails
      .filter((l) => l.itemId && l.qty > 0)
      .map((l) => ({
        order_id: orderId,
        item_id: l.itemId,
        qty: l.qty,
        dealer_rate_at_order: l.rate,
        line_total: l.total,
        line_remarks:
          l.note && String(l.note).trim() !== ""
            ? String(l.note).trim()
            : null,
      }));

    const { error: lineError } = await supabase
      .from("order_lines")
      .insert(linesToInsert);

    if (lineError) {
      alert("Error saving order lines: " + lineError.message);
      return;
    }

    alert(`Order ${status === "draft" ? "saved as draft" : "submitted"}!`);
  }

  return (
    <>
      <h1 className="section-title">Punch Order</h1>
      <p className="section-subtitle">
        Capture a Tycoon party order · order code will be auto-generated.
      </p>

      {/* PARTY + DATES + TOTALS */}
      <div className="card-grid">
        <div className="card">
          <div className="card-label">Party</div>
          <select
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "#050505",
              color: "#f5f5f5",
            }}
          >
            <option value="">Select party</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.city ? ` · ${p.city}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="card">
          <div className="card-label">Order Date</div>
          <input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "#050505",
              color: "#f5f5f5",
            }}
          />
        </div>

        <div className="card">
          <div className="card-label">Expected Dispatch</div>
          <input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "#050505",
              color: "#f5f5f5",
            }}
          />
        </div>

        <div className="card">
          <div className="card-label">Totals</div>
          <div className="card-value">
            {totals.qty} pcs · ₹ {totals.value.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* REMARKS */}
      <div className="card" style={{ marginTop: 18, marginBottom: 18 }}>
        <div className="card-label">Order Remarks</div>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid #333",
            background: "#050505",
            color: "#f5f5f5",
          }}
          placeholder="Any special notes..."
        />
      </div>

      {/* ITEM LINES */}
      <div className="table-wrapper">
        <div className="table-header">
          <div className="table-title">Order Lines</div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "26%" }}>Item</th>
              <th>Category</th>
              <th>Rate</th>
              <th style={{ width: 80 }}>Qty</th>
              <th style={{ width: "22%" }}>Note</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {withDetails.map((l) => (
              <tr key={l.lineId}>
                <td>
                  <select
                    value={l.itemId || ""}
                    onChange={(e) =>
                      updateLine(l.lineId, "itemId", e.target.value)
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
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
                </td>
                <td>{l.item?.category ?? "—"}</td>
                <td>₹ {l.rate.toLocaleString("en-IN")}</td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={l.qty === "" ? "" : String(l.qty)}
                    onChange={(e) =>
                      updateLine(l.lineId, "qty", e.target.value)
                    }
                    style={{
                      width: 70,
                      padding: "6px 8px",
                      borderRadius: 999,
                      border: "1px solid #333",
                      background: "#050505",
                      color: "#f5f5f5",
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={l.note ?? ""}
                    onChange={(e) =>
                      updateLine(l.lineId, "note", e.target.value)
                    }
                    placeholder="Colour / customization"
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#050505",
                      color: "#f5f5f5",
                      fontSize: 12,
                    }}
                  />
                </td>
                <td>₹ {l.total.toLocaleString("en-IN")}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => removeLine(l.lineId)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid #333",
                      background: "transparent",
                      color: "#aaa",
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}

            <tr>
              <td colSpan={7} style={{ textAlign: "center", padding: 10 }}>
                <button
                  type="button"
                  onClick={addLine}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: "1px solid #fff",
                    background: "transparent",
                    color: "#fff",
                  }}
                >
                  + Add Line
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ACTIONS */}
      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
        <button
          className="pill-button"
          type="button"
          onClick={() => submitOrder("draft")}
        >
          Save Draft
        </button>
        <button
          className="pill-button"
          type="button"
          onClick={() => submitOrder("submitted")}
        >
          Submit Order
        </button>
      </div>
    </>
  );
}
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Types for Supabase data
type Party = {
  id: string;
  name: string;
  city: string;
};

type Item = {
  id: string;
  name: string;
  category: string;
  dealer_rate: number;
};

type Line = {
  lineId: string;
  itemId?: string;
  qty: number | "";
};

export default function PunchOrderPage() {
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [partyId, setPartyId] = useState("");
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [expectedDate, setExpectedDate] = useState("");
  const [remarks, setRemarks] = useState("");

  const [lines, setLines] = useState<Line[]>([
    { lineId: "l1", qty: "" },
    { lineId: "l2", qty: "" },
    { lineId: "l3", qty: "" },
  ]);

  // Load Parties + Items on page load
  useEffect(() => {
    loadParties();
    loadItems();
  }, []);

  async function loadParties() {
    const { data, error } = await supabase
      .from("parties")
      .select("id, name, city")
      .order("name");

    if (error) console.error(error);
    else setParties(data || []);
  }

  async function loadItems() {
    const { data, error } = await supabase
      .from("items")
      .select("id, name, category, dealer_rate")
      .eq("is_active", true)
      .order("name");

    if (error) console.error(error);
    else setItems(data || []);
  }

  // Update one line
  function updateLine(id: string, field: "itemId" | "qty", value: any) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.lineId !== id) return l;

        if (field === "qty") {
          const num = value === "" ? "" : Number(value);
          return { ...l, qty: Number.isNaN(num) ? "" : num };
        }

        return { ...l, itemId: value };
      })
    );
  }

  // Add new blank line
  function addLine() {
    setLines((prev) => [
      ...prev,
      { lineId: `l${prev.length + 1}`, qty: "" },
    ]);
  }

  // Remove a line
  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.lineId !== id));
  }

  // Attach item details
  const withDetails = lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId);
    const qty = typeof l.qty === "number" ? l.qty : 0;
    const rate = item?.dealer_rate ?? 0;
    const total = qty * rate;

    return { ...l, item, rate, total, qty };
  });

  // Calculate totals
  const totals = withDetails.reduce(
    (acc, l) => ({
      qty: acc.qty + l.qty,
      value: acc.value + l.total,
    }),
    { qty: 0, value: 0 }
  );

  // Save into Supabase
  async function submitOrder(status: "draft" | "submitted") {
    if (!partyId) {
      alert("Please select a party.");
      return;
    }

    // 1) Insert into orders table
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          party_id: partyId,
          stakeholder_id: "admin", // TEMP until we add login system
          status,
          order_date: orderDate,
          expected_dispatch_date: expectedDate || null,
          remarks,
          total_qty: totals.qty,
          total_value: totals.value,
        },
      ])
      .select("id")
      .single();

    if (orderError) {
      alert("Error saving order: " + orderError.message);
      return;
    }

    const orderId = order.id;

    // 2) Insert into order_lines
    const linesToInsert = withDetails
      .filter((l) => l.itemId && l.qty > 0)
      .map((l) => ({
        order_id: orderId,
        item_id: l.itemId,
        qty: l.qty,
        dealer_rate_at_order: l.rate,
        line_total: l.total,
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
      <p className="section-subtitle">Connected to real Supabase data.</p>

      {/* PARTY + DATES */}
      <div className="card-grid">
        {/* PARTY */}
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
                {p.name} · {p.city}
              </option>
            ))}
          </select>
        </div>

        {/* ORDER DATE */}
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

        {/* EXPECTED DATE */}
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

        {/* TOTALS */}
        <div className="card">
          <div className="card-label">Totals</div>
          <div className="card-value">
            {totals.qty} pcs · ₹{totals.value.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* REMARKS */}
      <div className="card" style={{ marginTop: 20 }}>
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
      <div className="table-wrapper" style={{ marginTop: 20 }}>
        <div className="table-header">
          <div className="table-title">Order Lines</div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Item</th>
              <th>Category</th>
              <th>Rate</th>
              <th style={{ width: 80 }}>Qty</th>
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

                <td>{l.item?.category || "—"}</td>
                <td>₹ {l.rate}</td>

                <td>
                  <input
                    type="number"
                    min={0}
                    value={l.qty}
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

                <td>₹ {l.total}</td>

                <td>
                  <button
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
              <td colSpan={6} style={{ textAlign: "center", padding: 10 }}>
                <button
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

      {/* ACTION BUTTONS */}
      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
        <button className="pill-button" onClick={() => submitOrder("draft")}>
          Save Draft
        </button>
        <button
          className="pill-button"
          onClick={() => submitOrder("submitted")}
        >
          Submit Order
        </button>
      </div>
    </>
  );
}
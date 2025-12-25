// app/sales/page.tsx
// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * SALES PAGE (Dispatch-based, factory-out) — FULL WIDTH SECTIONS (stacked)
 * 1) Party bar chart (full width)
 * 2) Party list table (full width)
 * 3) Party statistics card (full width) + pie inside it (stable colors)
 * 4) Item-wise sales table (full width)
 *
 * Fixes included:
 * - "All time" works: when dispatchFrom/dispatchTo are blank, we DO NOT apply gte/lte and DO NOT default dates.
 * - Pie colors are stable via fixed domain/range scale.
 * - Excludes spares everywhere. Pie also excludes uncategorised.
 */

// ---------- INLINE VEGA-LITE CHART COMPONENT ----------

type VegaLiteSpec = any;

function VegaLiteChart({
  spec,
  height = 260,
}: {
  spec: VegaLiteSpec;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let view: any;
    let cancelled = false;

    (async () => {
      try {
        const embedModule = await import("vega-embed");
        const embed = embedModule.default;

        if (!containerRef.current || cancelled) return;

        const result = await embed(
          containerRef.current,
          { ...spec, height },
          {
            actions: { export: true, source: false, editor: true },
            tooltip: true,
          }
        );

        view = result.view;
      } catch (err) {
        console.error("Error rendering VegaLite chart", err);
      }
    })();

    return () => {
      cancelled = true;
      if (view) view.finalize?.();
    };
  }, [spec, height]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", minHeight: height + 30 }}
    />
  );
}

// ---------- HELPERS ----------

function isSpareCategory(cat: string) {
  const c = (cat || "").trim().toLowerCase();
  return c === "spare" || c === "spares" || c === "spare parts" || c === "spare part";
}

function isUncategorised(cat: string) {
  const c = (cat || "").trim().toLowerCase();
  return c === "uncategorised" || c === "uncategorized" || c === "" || c === "unknown";
}

function formatDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeFirst(rel: any) {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const csv =
    header.join(",") +
    "\n" +
    rows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell ?? "");
            const escaped = s.replace(/"/g, '""');
            if (/[,\n"]/.test(escaped)) return `"${escaped}"`;
            return escaped;
          })
          .join(",")
      )
      .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Stable palette so colors don’t change when party changes
const CATEGORY_DOMAIN = [
  "small jeep",
  "big jeep",
  "medium jeep",
  "small bike",
  "scooter",
  "car",
  "jeep",
  "bike",
];

const CATEGORY_RANGE = [
  "#a855f7", // small jeep
  "#38bdf8", // big jeep
  "#22c55e", // medium jeep
  "#f59e0b", // small bike
  "#f97316", // scooter
  "#ef4444", // car
  "#c084fc", // jeep (fallback)
  "#60a5fa", // bike (fallback)
];

// ---------- TYPES ----------

type PartyAgg = {
  party_id: string;
  party_name: string;
  qty: number;
  value: number;
  ordersServed: number;
};

type PartyItemRow = {
  item: string;
  category: string;
  qty: number;
  value: number;
  ordersCount: number;
};

type CategorySlice = {
  category: string;
  value: number;
  qty: number;
};

// ---------- PAGE ----------

export default function SalesPage() {
  // Dispatch date filter
  const [dispatchFrom, setDispatchFrom] = useState<string>("");
  const [dispatchTo, setDispatchTo] = useState<string>("");

  // Party aggregates
  const [partyAgg, setPartyAgg] = useState<PartyAgg[]>([]);
  const [partyAggLoading, setPartyAggLoading] = useState(true);
  const [partyAggError, setPartyAggError] = useState<string | null>(null);

  // Selected party
  const [selectedPartyId, setSelectedPartyId] = useState<string>("");
  const [selectedPartyName, setSelectedPartyName] = useState<string>("");

  // Selected party details
  const [partyDetailLoading, setPartyDetailLoading] = useState(true);
  const [partyDetailError, setPartyDetailError] = useState<string | null>(null);

  const [partyTotals, setPartyTotals] = useState({
    qty: 0,
    value: 0,
    ordersServed: 0,
    fulfillmentPct: 0,
    avgRealisation: 0,
  });

  const [partyCategorySlices, setPartyCategorySlices] = useState<CategorySlice[]>([]);
  const [partyItems, setPartyItems] = useState<PartyItemRow[]>([]);

  // Default to this month (same behavior as your dashboard), but All-time must work once user clicks it.
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    setDispatchFrom(formatDateLocal(from));
    setDispatchTo(formatDateLocal(today));
  }, []);

  useEffect(() => {
    loadPartyAgg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchFrom, dispatchTo]);

  useEffect(() => {
    if (!selectedPartyId) {
      if (partyAgg && partyAgg.length > 0) {
        setSelectedPartyId(partyAgg[0].party_id);
        setSelectedPartyName(partyAgg[0].party_name);
      } else {
        setPartyTotals({
          qty: 0,
          value: 0,
          ordersServed: 0,
          fulfillmentPct: 0,
          avgRealisation: 0,
        });
        setPartyCategorySlices([]);
        setPartyItems([]);
        setPartyDetailLoading(false);
      }
      return;
    }
    loadPartyDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartyId, dispatchFrom, dispatchTo, partyAgg]);

  function setQuickRangeDispatch(mode: "all" | "thisMonth" | "lastMonth" | "last90") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (mode === "all") {
      setDispatchFrom("");
      setDispatchTo("");
      return;
    }

    if (mode === "thisMonth") {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      setDispatchFrom(formatDateLocal(from));
      setDispatchTo(formatDateLocal(today));
      return;
    }

    if (mode === "lastMonth") {
      const year = today.getFullYear();
      const month = today.getMonth();
      const firstThisMonth = new Date(year, month, 1);
      const lastMonthEnd = new Date(firstThisMonth.getTime() - 1);
      const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
      setDispatchFrom(formatDateLocal(lastMonthStart));
      setDispatchTo(formatDateLocal(lastMonthEnd));
      return;
    }

    if (mode === "last90") {
      const from = new Date(today);
      from.setDate(from.getDate() - 89);
      setDispatchFrom(formatDateLocal(from));
      setDispatchTo(formatDateLocal(today));
      return;
    }
  }

  async function loadPartyAgg() {
    setPartyAggLoading(true);
    setPartyAggError(null);

    let q = supabase
      .from("dispatch_events")
      .select(
        `
        id,
        dispatched_at,
        dispatched_qty,
        order_lines:order_line_id (
          order_id,
          dealer_rate_at_order,
          items (
            company,
            category
          ),
          orders:order_id (
            party_id,
            parties:party_id (
              id,
              name
            )
          )
        )
      `
      );

    // All time FIX: apply filters ONLY if user set them
    if (dispatchFrom) q = q.gte("dispatched_at", dispatchFrom);
    if (dispatchTo) q = q.lte("dispatched_at", dispatchTo);

    const { data, error } = await q;

    if (error) {
      console.error("Error loading party agg", error);
      setPartyAgg([]);
      setPartyAggLoading(false);
      setPartyAggError("Could not load sales by party.");
      return;
    }

    const byParty = new Map<
      string,
      { party_name: string; qty: number; value: number; orders: Set<string> }
    >();

    (data || []).forEach((row: any) => {
      const dqty = Number(row?.dispatched_qty ?? 0);
      if (!dqty || dqty <= 0) return;

      const line = row?.order_lines;
      const item = safeFirst(line?.items);
      if ((item?.company || "") !== "Tycoon") return;

      const cat = item?.category || "";
      if (isSpareCategory(cat)) return;

      const ord = safeFirst(line?.orders);
      const party = safeFirst(ord?.parties);
      const party_id = party?.id || ord?.party_id;
      const party_name = party?.name || "Unknown party";
      if (!party_id) return;

      const rate = Number(line?.dealer_rate_at_order ?? 0);
      const val = dqty * rate;

      if (!byParty.has(party_id)) {
        byParty.set(party_id, { party_name, qty: 0, value: 0, orders: new Set<string>() });
      }

      const agg = byParty.get(party_id)!;
      agg.qty += dqty;
      agg.value += val;
      if (line?.order_id) agg.orders.add(line.order_id);
    });

    const rows: PartyAgg[] = Array.from(byParty.entries())
      .map(([party_id, agg]) => ({
        party_id,
        party_name: agg.party_name,
        qty: agg.qty,
        value: agg.value,
        ordersServed: agg.orders.size,
      }))
      .sort((a, b) => b.value - a.value);

    setPartyAgg(rows);

    if (rows.length > 0) {
      const stillExists = selectedPartyId && rows.some((r) => r.party_id === selectedPartyId);
      if (!stillExists) {
        setSelectedPartyId(rows[0].party_id);
        setSelectedPartyName(rows[0].party_name);
      } else {
        const r = rows.find((x) => x.party_id === selectedPartyId);
        if (r) setSelectedPartyName(r.party_name);
      }
    } else {
      setSelectedPartyId("");
      setSelectedPartyName("");
    }

    setPartyAggLoading(false);
  }

  async function loadPartyDetail() {
    if (!selectedPartyId) return;

    setPartyDetailLoading(true);
    setPartyDetailError(null);

    let q = supabase
      .from("dispatch_events")
      .select(
        `
        id,
        dispatched_at,
        dispatched_qty,
        order_lines:order_line_id (
          order_id,
          qty,
          dispatched_qty,
          dealer_rate_at_order,
          items (
            name,
            category,
            company
          ),
          orders:order_id (
            party_id
          )
        )
      `
      );

    // All time FIX
    if (dispatchFrom) q = q.gte("dispatched_at", dispatchFrom);
    if (dispatchTo) q = q.lte("dispatched_at", dispatchTo);

    const { data, error } = await q;

    if (error) {
      console.error("Error loading party detail", error);
      setPartyDetailLoading(false);
      setPartyDetailError("Could not load selected party details.");
      return;
    }

    let qty = 0;
    let value = 0;
    const orderSet = new Set<string>();

    const byCategory = new Map<string, { value: number; qty: number }>();
    const byItem = new Map<string, { category: string; qty: number; value: number; orders: Set<string> }>();

    // Fulfilment % across served orders (to-date dispatched / ordered)
    const orderQtySum = new Map<string, { ordered: number; dispatched: number }>();

    (data || []).forEach((row: any) => {
      const dqty = Number(row?.dispatched_qty ?? 0);
      if (!dqty || dqty <= 0) return;

      const line = row?.order_lines;
      const ord = safeFirst(line?.orders);
      if ((ord?.party_id || "") !== selectedPartyId) return;

      const item = safeFirst(line?.items);
      if ((item?.company || "") !== "Tycoon") return;

      const category = (item?.category || "").trim();
      if (isSpareCategory(category)) return;

      const itemName = (item?.name || "Unknown item").trim();
      const rate = Number(line?.dealer_rate_at_order ?? 0);
      const v = dqty * rate;

      qty += dqty;
      value += v;
      if (line?.order_id) orderSet.add(line.order_id);

      // Pie excludes uncategorised
      if (!isUncategorised(category)) {
        if (!byCategory.has(category)) byCategory.set(category, { value: 0, qty: 0 });
        const c = byCategory.get(category)!;
        c.value += v;
        c.qty += dqty;
      }

      // Item table includes uncategorised (still excluding spares)
      const catForItem = category && category.trim() !== "" ? category : "Uncategorised";
      if (!byItem.has(itemName)) {
        byItem.set(itemName, { category: catForItem, qty: 0, value: 0, orders: new Set<string>() });
      }
      const it = byItem.get(itemName)!;
      it.qty += dqty;
      it.value += v;
      if (line?.order_id) it.orders.add(line.order_id);

      // fulfilment calc (served orders)
      const oid = line?.order_id;
      if (oid) {
        const orderedQty = Number(line?.qty ?? 0);
        const raw = line?.dispatched_qty === "" || line?.dispatched_qty == null ? 0 : Number(line?.dispatched_qty);
        let dispatchedQty = Number.isNaN(raw) ? 0 : raw;
        if (dispatchedQty < 0) dispatchedQty = 0;
        if (dispatchedQty > orderedQty) dispatchedQty = orderedQty;

        if (!orderQtySum.has(oid)) orderQtySum.set(oid, { ordered: 0, dispatched: 0 });
        const o = orderQtySum.get(oid)!;
        o.ordered += orderedQty;
        o.dispatched += dispatchedQty;
      }
    });

    const slices: CategorySlice[] = Array.from(byCategory.entries())
      .map(([category, agg]) => ({ category, value: agg.value, qty: agg.qty }))
      .sort((a, b) => b.value - a.value);

    const itemRows: PartyItemRow[] = Array.from(byItem.entries())
      .map(([item, agg]) => ({
        item,
        category: agg.category || "Uncategorised",
        qty: agg.qty,
        value: agg.value,
        ordersCount: agg.orders.size,
      }))
      .sort((a, b) => b.value - a.value);

    let servedOrdered = 0;
    let servedDispatched = 0;
    orderQtySum.forEach((o) => {
      servedOrdered += o.ordered;
      servedDispatched += o.dispatched;
    });

    const fulfillmentPct = servedOrdered > 0 ? Math.round((servedDispatched / servedOrdered) * 100) : 0;
    const avgRealisation = qty > 0 ? Math.round(value / qty) : 0;

    setPartyTotals({
      qty,
      value,
      ordersServed: orderSet.size,
      fulfillmentPct,
      avgRealisation,
    });
    setPartyCategorySlices(slices);
    setPartyItems(itemRows);

    setPartyDetailLoading(false);
  }

  // ---------- EXPORTS ----------

  function downloadPartyCsvAll() {
    if (!partyAgg || partyAgg.length === 0) {
      alert("No party data to export.");
      return;
    }
    const header = ["Party", "SalesValue", "QtyPcs", "OrdersServed"];
    const rows = partyAgg.map((r) => [r.party_name, r.value, r.qty, r.ordersServed]);
    downloadCsv("tycoon-sales-by-party.csv", header, rows);
  }

  function downloadSelectedPartyItemsCsv() {
    if (!partyItems || partyItems.length === 0) {
      alert("No item data to export.");
      return;
    }
    const header = ["Item", "Category", "SalesValue", "QtyPcs", "OrdersCount"];
    const rows = partyItems.map((r) => [r.item, r.category, r.value, r.qty, r.ordersCount]);
    const fname = `tycoon-${(selectedPartyName || "party").toLowerCase().replace(/\s+/g, "-")}-items.csv`;
    downloadCsv(fname, header, rows);
  }

  // ---------- CHARTS ----------

  const topParties = useMemo(() => partyAgg.slice(0, 12), [partyAgg]);

  const partyBarSpec = useMemo(() => {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      background: "transparent",
      width: "container",
      height: 320,
      padding: { left: 10, right: 12, top: 6, bottom: 6 },
      data: { values: topParties },
      mark: { type: "bar", cornerRadiusEnd: 6, tooltip: true },
      encoding: {
        y: {
          field: "party_name",
          type: "ordinal",
          sort: "-x",
          title: null,
          axis: { labelColor: "#e5e5e5", tickColor: "#262626", domainColor: "#262626" },
        },
        x: {
          field: "value",
          type: "quantitative",
          title: "Sales value (₹)",
          axis: {
            labelColor: "#cfcfcf",
            titleColor: "#cfcfcf",
            gridColor: "#1f1f1f",
            domainColor: "#262626",
            tickColor: "#262626",
            format: "~s",
          },
        },
        color: { value: "#a855f7" },
        tooltip: [
          { field: "party_name", title: "Party" },
          { field: "value", title: "Sales (₹)", format: ",.0f" },
          { field: "qty", title: "Qty (pcs)" },
          { field: "ordersServed", title: "Orders served" },
        ],
      },
      config: { view: { stroke: "transparent" } },
    };
  }, [topParties]);

  const partyPieSpec = useMemo(() => {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      background: "transparent",
      width: "container",
      height: 260,
      data: { values: partyCategorySlices },
      mark: {
        type: "arc",
        outerRadius: 105,
        innerRadius: 0,
        stroke: "#111",
        strokeWidth: 1,
      },
      encoding: {
        theta: { field: "value", type: "quantitative" },
        color: {
          field: "category",
          type: "nominal",
          scale: { domain: CATEGORY_DOMAIN, range: CATEGORY_RANGE },
          legend: {
            title: "Category",
            labelColor: "#cfcfcf",
            titleColor: "#cfcfcf",
            orient: "right",
          },
        },
        tooltip: [
          { field: "category", title: "Category" },
          { field: "value", title: "Sales (₹)", format: ",.0f" },
          { field: "qty", title: "Qty (pcs)" },
        ],
      },
      config: { view: { stroke: "transparent" } },
    };
  }, [partyCategorySlices]);

  const rangeLabel = useMemo(() => {
    if (!dispatchFrom && !dispatchTo) return "All time";
    if (dispatchFrom && dispatchTo) return `${dispatchFrom} → ${dispatchTo}`;
    if (dispatchFrom && !dispatchTo) return `From ${dispatchFrom}`;
    if (!dispatchFrom && dispatchTo) return `Up to ${dispatchTo}`;
    return "All time";
  }, [dispatchFrom, dispatchTo]);

  // ---------- RENDER ----------

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 className="section-title">Sales</h1>
          <div className="section-subtitle" style={{ marginTop: 6 }}>
            Dispatch-based (factory-out) sales analytics · Tycoon only · excludes spares.
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>● Live from Supabase</div>
        </div>

        <button
          type="button"
          onClick={downloadPartyCsvAll}
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid #f5f5f5",
            background: "#f5f5f5",
            color: "#000",
            fontSize: 12,
            fontWeight: 700,
            height: 36,
            whiteSpace: "nowrap",
          }}
        >
          Download Party CSV
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          marginTop: 12,
          marginBottom: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ opacity: 0.8 }}>Quick range:</span>

          <button
            type="button"
            onClick={() => setQuickRangeDispatch("all")}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "transparent",
              color: "#f5f5f5",
              fontSize: 11,
            }}
          >
            All time
          </button>

          <button
            type="button"
            onClick={() => setQuickRangeDispatch("thisMonth")}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "transparent",
              color: "#f5f5f5",
              fontSize: 11,
            }}
          >
            This month
          </button>

          <button
            type="button"
            onClick={() => setQuickRangeDispatch("lastMonth")}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "transparent",
              color: "#f5f5f5",
              fontSize: 11,
            }}
          >
            Last month
          </button>

          <button
            type="button"
            onClick={() => setQuickRangeDispatch("last90")}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "transparent",
              color: "#f5f5f5",
              fontSize: 11,
            }}
          >
            Last 90 days
          </button>

          <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.65 }}>
            Range: <b style={{ opacity: 0.9 }}>{rangeLabel}</b>
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <span style={{ opacity: 0.8 }}>Filter by dispatch date:</span>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>From</span>
            <input
              type="date"
              value={dispatchFrom}
              onChange={(e) => setDispatchFrom(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #333",
                background: "#050505",
                color: "#f5f5f5",
                fontSize: 12,
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>To</span>
            <input
              type="date"
              value={dispatchTo}
              onChange={(e) => setDispatchTo(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #333",
                background: "#050505",
                color: "#f5f5f5",
                fontSize: 12,
              }}
            />
          </div>

          {(dispatchFrom || dispatchTo) && (
            <button
              type="button"
              onClick={() => {
                setDispatchFrom("");
                setDispatchTo("");
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
              Clear filter
            </button>
          )}
        </div>
      </div>

      {/* 1) PARTY BAR CHART (FULL WIDTH) */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-label">Sales by Party (Top 12)</div>
        <div className="card-meta">
          Dispatch-based (factory-out). Tycoon only. Excludes spares.
        </div>

        {partyAggLoading && <div style={{ fontSize: 12, marginTop: 8 }}>Loading…</div>}
        {partyAggError && (
          <div style={{ fontSize: 12, marginTop: 8, color: "#fbbf24" }}>{partyAggError}</div>
        )}

        {!partyAggLoading && !partyAggError && topParties.length === 0 && (
          <div style={{ fontSize: 12, marginTop: 8, opacity: 0.8 }}>
            No dispatch sales found in this range.
          </div>
        )}

        {!partyAggLoading && !partyAggError && topParties.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <VegaLiteChart spec={partyBarSpec} height={340} />
          </div>
        )}
      </div>

      {/* 2) PARTY LIST (FULL WIDTH) */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div className="card-label">Party List</div>
            <div className="card-meta">Click a party row to load its stats + item-wise sales below.</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 11, opacity: 0.65 }}>
              Selected:{" "}
              <b style={{ opacity: 0.95 }}>{selectedPartyName || "—"}</b>
            </div>
          </div>
        </div>

        <div className="table-wrapper" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "45%" }}>Party</th>
                <th>Sales (₹)</th>
                <th>Qty (pcs)</th>
                <th>Orders served</th>
              </tr>
            </thead>
            <tbody>
              {!partyAggLoading && partyAgg.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: 10, fontSize: 13 }}>
                    No party sales found in this range.
                  </td>
                </tr>
              )}

              {partyAgg.slice(0, 30).map((r) => {
                const active = r.party_id === selectedPartyId;
                return (
                  <tr
                    key={r.party_id}
                    onClick={() => {
                      setSelectedPartyId(r.party_id);
                      setSelectedPartyName(r.party_name);
                    }}
                    style={{
                      cursor: "pointer",
                      background: active ? "rgba(168, 85, 247, 0.12)" : "transparent",
                    }}
                  >
                    <td style={{ fontWeight: active ? 800 : 600 }}>{r.party_name}</td>
                    <td>₹ {Math.round(r.value).toLocaleString("en-IN")}</td>
                    <td>{Math.round(r.qty).toLocaleString("en-IN")}</td>
                    <td>{r.ordersServed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 8 }}>
          Showing top 30 parties by sales value. Export CSV for full list.
        </div>
      </div>

      {/* 3) PARTY STATS (FULL WIDTH) */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="card-label">
              Party Statistics:{" "}
              <span style={{ opacity: 0.95 }}>{selectedPartyName || "—"}</span>
            </div>
            <div className="card-meta">
              Dispatch-based · Tycoon only · excludes spares · pie excludes uncategorised · stable colors.
            </div>
          </div>

          <button
            type="button"
            onClick={downloadSelectedPartyItemsCsv}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid #f5f5f5",
              background: "#f5f5f5",
              color: "#000",
              fontSize: 12,
              fontWeight: 800,
              height: 36,
              whiteSpace: "nowrap",
            }}
          >
            Download Items CSV
          </button>
        </div>

        {partyDetailError && (
          <div style={{ fontSize: 12, marginTop: 8, color: "#fbbf24" }}>{partyDetailError}</div>
        )}

        {/* TOTAL SALES FIRST */}
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          Total sales (selected party):{" "}
          <b style={{ fontSize: 16, opacity: 0.95 }}>
            {partyDetailLoading ? "…" : `₹ ${partyTotals.value.toLocaleString("en-IN")}`}
          </b>
        </div>

        {/* KPIs + Pie (full width container, no wasted space) */}
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr",
            gap: 14,
            alignItems: "start",
          }}
        >
          {/* KPI grid */}
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div className="card" style={{ padding: 12 }}>
                <div className="card-label">Qty dispatched</div>
                <div className="card-value" style={{ fontSize: 24 }}>
                  {partyDetailLoading ? "…" : `${partyTotals.qty} pcs`}
                </div>
                <div className="card-meta">In dispatch range</div>
              </div>

              <div className="card" style={{ padding: 12 }}>
                <div className="card-label">Avg realisation / unit</div>
                <div className="card-value" style={{ fontSize: 24 }}>
                  {partyDetailLoading ? "…" : `₹ ${partyTotals.avgRealisation.toLocaleString("en-IN")}`}
                </div>
                <div className="card-meta">Value ÷ qty</div>
              </div>

              <div className="card" style={{ padding: 12 }}>
                <div className="card-label">Orders served</div>
                <div className="card-value" style={{ fontSize: 24 }}>
                  {partyDetailLoading ? "…" : partyTotals.ordersServed}
                </div>
                <div className="card-meta">Unique orders with dispatch</div>
              </div>

              <div className="card" style={{ padding: 12 }}>
                <div className="card-label">Fulfilment-to-date</div>
                <div className="card-value" style={{ fontSize: 24 }}>
                  {partyDetailLoading ? "…" : `${partyTotals.fulfillmentPct}%`}
                </div>
                <div className="card-meta">On served orders</div>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.65 }}>
              Fulfilment-to-date = (to-date dispatched ÷ ordered) across orders that had any dispatch in this range.
            </div>
          </div>

          {/* Pie */}
          <div>
            <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 0.3 }}>
              Category-wise sales (selected party)
              <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 400, marginTop: 2 }}>
                Slice size = ₹ value · excludes spares + uncategorised
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              {!partyDetailLoading && partyCategorySlices.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  No category sales (after excluding uncategorised) for this party in the selected range.
                </div>
              ) : (
                <VegaLiteChart spec={partyPieSpec} height={280} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4) ITEM-WISE SALES (FULL WIDTH) */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-label">Item-wise Sales (selected party)</div>
        <div className="card-meta">
          Dispatch-based (factory-out) · Tycoon only · excludes spares · includes uncategorised items.
        </div>

        {partyDetailLoading && <div style={{ fontSize: 12, marginTop: 8 }}>Loading…</div>}

        {!partyDetailLoading && partyItems.length === 0 && (
          <div style={{ fontSize: 12, marginTop: 8, opacity: 0.8 }}>
            No item sales found for this party in the selected range.
          </div>
        )}

        {!partyDetailLoading && partyItems.length > 0 && (
          <div className="table-wrapper" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "42%" }}>Item</th>
                  <th style={{ width: "18%" }}>Category</th>
                  <th>Sales (₹)</th>
                  <th>Qty (pcs)</th>
                  <th>Orders</th>
                </tr>
              </thead>
              <tbody>
                {partyItems.slice(0, 40).map((r) => (
                  <tr key={r.item}>
                    <td style={{ fontWeight: 800 }}>{r.item}</td>
                    <td style={{ opacity: 0.9 }}>{r.category}</td>
                    <td>₹ {Math.round(r.value).toLocaleString("en-IN")}</td>
                    <td>{Math.round(r.qty).toLocaleString("en-IN")}</td>
                    <td>{r.ordersCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 8 }}>
              Showing top 40 items by sales value.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
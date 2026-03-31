// app/sales/page.tsx
// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * SALES PAGE (Dispatch-based, factory-out) — FULL WIDTH SECTIONS (stacked)
 * 1) Customer bar chart (full width)
 * 2) Customer list table (full width)
 * 3) Customer statistics card (full width) + pie inside it (stable colors)
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

function clampDispatchedQty(ordered: any, raw: any) {
  const orderedNum = Number(ordered ?? 0);
  let dispatched = Number(raw ?? 0);
  if (Number.isNaN(dispatched) || dispatched < 0) dispatched = 0;
  if (!Number.isNaN(orderedNum) && dispatched > orderedNum) dispatched = orderedNum;
  return dispatched;
}

function isTycoonSalesItem(item: any) {
  return (item?.company || "") === "Tycoon" && !isSpareCategory(item?.category || "");
}

const QUERY_PAGE_SIZE = 1000;

async function fetchAllRows<T>(loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + QUERY_PAGE_SIZE - 1;
    const { data, error } = await loadPage(from, to);

    if (error) return { data: null, error };

    const page = data || [];
    rows.push(...page);

    if (page.length < QUERY_PAGE_SIZE) break;
    from += QUERY_PAGE_SIZE;
  }

  return { data: rows, error: null };
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

// Stable palette so colors don’t change when customer changes
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

type CustomerTrendPoint = {
  date: string;
  customer_id: string;
  customer_name: string;
  qty: number;
  value: number;
  product_breakdown: string;
};

type CustomerTrendSelectorSlot = {
  id: string;
  enabled: boolean;
  customer_id: string;
};

const CUSTOMER_TREND_SLOT_COUNT = 3;

function createEmptyCustomerTrendSlots(): CustomerTrendSelectorSlot[] {
  return Array.from({ length: CUSTOMER_TREND_SLOT_COUNT }, (_, index) => ({
    id: `custom-customer-${index}`,
    enabled: false,
    customer_id: "",
  }));
}

// ---------- PAGE ----------

export default function SalesPage() {
  // Dispatch date filter
  const [dispatchFrom, setDispatchFrom] = useState<string>("");
  const [dispatchTo, setDispatchTo] = useState<string>("");
  const [rangeReady, setRangeReady] = useState(false);

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
  const [customerTrendRows, setCustomerTrendRows] = useState<CustomerTrendPoint[]>([]);
  const [customerTrendLoading, setCustomerTrendLoading] = useState(true);
  const [customerTrendError, setCustomerTrendError] = useState<string | null>(null);
  const [hiddenTopTrendCustomers, setHiddenTopTrendCustomers] = useState<string[]>([]);
  const [customCustomerTrendSlots, setCustomCustomerTrendSlots] = useState<CustomerTrendSelectorSlot[]>(
    () => createEmptyCustomerTrendSlots()
  );

  // Default to this month (same behavior as your dashboard), but All-time must work once user clicks it.
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    setDispatchFrom(formatDateLocal(from));
    setDispatchTo(formatDateLocal(today));
    setRangeReady(true);
  }, []);

  useEffect(() => {
    if (!rangeReady) return;
    loadPartyAgg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchFrom, dispatchTo, rangeReady]);

  useEffect(() => {
    if (!rangeReady) return;
    loadCustomerTrends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchFrom, dispatchTo, rangeReady]);

  useEffect(() => {
    if (!rangeReady) return;
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
  }, [selectedPartyId, dispatchFrom, dispatchTo, partyAgg, rangeReady]);

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

    const isAllTime = !dispatchFrom && !dispatchTo;
    let data: any[] | null = null;
    let error: any = null;

    if (isAllTime) {
      const result = await fetchAllRows<any>((from, to) =>
        supabase
          .from("orders")
          .select(
            `
            id,
            party_id,
            parties:party_id (
              id,
              name
            ),
            order_lines (
              qty,
              dispatched_qty,
              dealer_rate_at_order,
              items (
                company,
                category
              )
            )
          `
          )
          .range(from, to)
      );

      data = result.data;
      error = result.error;
    } else {
      const result = await fetchAllRows<any>((from, to) => {
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
          )
          .range(from, to);

        if (dispatchFrom) q = q.gte("dispatched_at", dispatchFrom);
        if (dispatchTo) q = q.lte("dispatched_at", dispatchTo);

        return q;
      });

      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error("Error loading party agg", error);
      setPartyAgg([]);
      setPartyAggLoading(false);
      setPartyAggError("Could not load sales by customer.");
      return;
    }

    const byParty = new Map<
      string,
      { party_name: string; qty: number; value: number; orders: Set<string> }
    >();

    if (isAllTime) {
      (data || []).forEach((order: any) => {
        const party = safeFirst(order?.parties);
        const party_id = party?.id || order?.party_id;
        const party_name = party?.name || "Unknown party";
        if (!party_id) return;

        (order?.order_lines || []).forEach((line: any) => {
          const item = safeFirst(line?.items);
          if (!isTycoonSalesItem(item)) return;

          const dqty = clampDispatchedQty(line?.qty, line?.dispatched_qty);
          if (!dqty || dqty <= 0) return;

          const rate = Number(line?.dealer_rate_at_order ?? 0);
          const val = dqty * rate;

          if (!byParty.has(party_id)) {
            byParty.set(party_id, { party_name, qty: 0, value: 0, orders: new Set<string>() });
          }

          const agg = byParty.get(party_id)!;
          agg.qty += dqty;
          agg.value += val;
          if (order?.id) agg.orders.add(order.id);
        });
      });
    } else {
      (data || []).forEach((row: any) => {
        const dqty = Number(row?.dispatched_qty ?? 0);
        if (!dqty || dqty <= 0) return;

        const line = row?.order_lines;
        const item = safeFirst(line?.items);
        if (!isTycoonSalesItem(item)) return;

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
    }

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

    const isAllTime = !dispatchFrom && !dispatchTo;
    let data: any[] | null = null;
    let error: any = null;

    if (isAllTime) {
      const result = await fetchAllRows<any>((from, to) =>
        supabase
          .from("orders")
          .select(
            `
            id,
            order_lines (
              qty,
              dispatched_qty,
              dealer_rate_at_order,
              items (
                name,
                category,
                company
              )
            )
          `
          )
          .eq("party_id", selectedPartyId)
          .range(from, to)
      );

      data = result.data;
      error = result.error;
    } else {
      const result = await fetchAllRows<any>((from, to) => {
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
          )
          .range(from, to);

        if (dispatchFrom) q = q.gte("dispatched_at", dispatchFrom);
        if (dispatchTo) q = q.lte("dispatched_at", dispatchTo);

        return q;
      });

      data = result.data;
      error = result.error;
    }

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

    if (isAllTime) {
      (data || []).forEach((order: any) => {
        const oid = order?.id;

        (order?.order_lines || []).forEach((line: any) => {
          const item = safeFirst(line?.items);
          if (!isTycoonSalesItem(item)) return;

          const category = (item?.category || "").trim();
          const dqty = clampDispatchedQty(line?.qty, line?.dispatched_qty);
          if (!dqty || dqty <= 0) return;

          const itemName = (item?.name || "Unknown item").trim();
          const rate = Number(line?.dealer_rate_at_order ?? 0);
          const v = dqty * rate;

          qty += dqty;
          value += v;
          if (oid) orderSet.add(oid);

          if (!isUncategorised(category)) {
            if (!byCategory.has(category)) byCategory.set(category, { value: 0, qty: 0 });
            const c = byCategory.get(category)!;
            c.value += v;
            c.qty += dqty;
          }

          const catForItem = category && category.trim() !== "" ? category : "Uncategorised";
          if (!byItem.has(itemName)) {
            byItem.set(itemName, { category: catForItem, qty: 0, value: 0, orders: new Set<string>() });
          }
          const it = byItem.get(itemName)!;
          it.qty += dqty;
          it.value += v;
          if (oid) it.orders.add(oid);

          if (oid) {
            const orderedQty = Number(line?.qty ?? 0);
            if (!orderQtySum.has(oid)) orderQtySum.set(oid, { ordered: 0, dispatched: 0 });
            const o = orderQtySum.get(oid)!;
            o.ordered += orderedQty;
            o.dispatched += dqty;
          }
        });
      });
    } else {
      (data || []).forEach((row: any) => {
        const dqty = Number(row?.dispatched_qty ?? 0);
        if (!dqty || dqty <= 0) return;

        const line = row?.order_lines;
        const ord = safeFirst(line?.orders);
        if ((ord?.party_id || "") !== selectedPartyId) return;

        const item = safeFirst(line?.items);
        if (!isTycoonSalesItem(item)) return;

        const category = (item?.category || "").trim();
        const itemName = (item?.name || "Unknown item").trim();
        const rate = Number(line?.dealer_rate_at_order ?? 0);
        const v = dqty * rate;

        qty += dqty;
        value += v;
        if (line?.order_id) orderSet.add(line.order_id);

        if (!isUncategorised(category)) {
          if (!byCategory.has(category)) byCategory.set(category, { value: 0, qty: 0 });
          const c = byCategory.get(category)!;
          c.value += v;
          c.qty += dqty;
        }

        const catForItem = category && category.trim() !== "" ? category : "Uncategorised";
        if (!byItem.has(itemName)) {
          byItem.set(itemName, { category: catForItem, qty: 0, value: 0, orders: new Set<string>() });
        }
        const it = byItem.get(itemName)!;
        it.qty += dqty;
        it.value += v;
        if (line?.order_id) it.orders.add(line.order_id);

        const oid = line?.order_id;
        if (oid) {
          const orderedQty = Number(line?.qty ?? 0);
          const dispatchedQty = clampDispatchedQty(line?.qty, line?.dispatched_qty);

          if (!orderQtySum.has(oid)) orderQtySum.set(oid, { ordered: 0, dispatched: 0 });
          const o = orderQtySum.get(oid)!;
          o.ordered += orderedQty;
          o.dispatched += dispatchedQty;
        }
      });
    }

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

  async function loadCustomerTrends() {
    setCustomerTrendLoading(true);
    setCustomerTrendError(null);

    const result = await fetchAllRows<any>((from, to) => {
      let q = supabase
        .from("dispatch_events")
        .select(
          `
          id,
          dispatched_at,
          dispatched_qty,
          order_lines:order_line_id (
            dealer_rate_at_order,
            items (
              name,
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
        )
        .range(from, to);

      if (dispatchFrom) q = q.gte("dispatched_at", dispatchFrom);
      if (dispatchTo) q = q.lte("dispatched_at", dispatchTo);

      return q;
    });

    if (result.error) {
      console.error("Error loading customer trends", result.error);
      setCustomerTrendRows([]);
      setCustomerTrendError("Could not load customer trend chart.");
      setCustomerTrendLoading(false);
      return;
    }

    const byTrend = new Map<
      string,
      {
        date: string;
        customer_id: string;
        customer_name: string;
        qty: number;
        value: number;
        products: Map<string, number>;
      }
    >();

    (result.data || []).forEach((row: any) => {
      const dqty = Number(row?.dispatched_qty ?? 0);
      if (!dqty || dqty <= 0) return;

      const line = row?.order_lines;
      const item = safeFirst(line?.items);
      if (!isTycoonSalesItem(item)) return;

      const ord = safeFirst(line?.orders);
      const customer = safeFirst(ord?.parties);
      const customer_id = customer?.id || ord?.party_id || "";
      const customer_name = (customer?.name || "Unknown customer").trim();
      const productName = (item?.name || "Unknown item").trim();
      const date = String(row?.dispatched_at || "").slice(0, 10);

      if (!customer_id || !date) return;

      const trendKey = `${date}__${customer_id}`;
      if (!byTrend.has(trendKey)) {
        byTrend.set(trendKey, {
          date,
          customer_id,
          customer_name,
          qty: 0,
          value: 0,
          products: new Map<string, number>(),
        });
      }

      const trendAgg = byTrend.get(trendKey)!;
      trendAgg.qty += dqty;
      trendAgg.value += dqty * Number(line?.dealer_rate_at_order ?? 0);
      trendAgg.products.set(productName, (trendAgg.products.get(productName) || 0) + dqty);
    });

    const trends = Array.from(byTrend.values())
      .map((row) => ({
        date: row.date,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        qty: row.qty,
        value: row.value,
        product_breakdown: Array.from(row.products.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([productName, productQty]) => `${productName}: ${productQty}`)
          .join(" | "),
      }))
      .sort((a, b) =>
        a.date === b.date ? a.customer_name.localeCompare(b.customer_name) : a.date.localeCompare(b.date)
      );

    setCustomerTrendRows(trends);
    setCustomerTrendLoading(false);
  }

  // ---------- EXPORTS ----------

  function downloadPartyCsvAll() {
    if (!partyAgg || partyAgg.length === 0) {
      alert("No party data to export.");
      return;
    }
    const header = ["Customer", "SalesValue", "QtyPcs", "OrdersServed"];
    const rows = partyAgg.map((r) => [r.party_name, r.value, r.qty, r.ordersServed]);
    downloadCsv("tycoon-sales-by-customer.csv", header, rows);
  }

  function downloadSelectedPartyItemsCsv() {
    if (!partyItems || partyItems.length === 0) {
      alert("No item data to export.");
      return;
    }
    const header = ["Item", "Category", "SalesValue", "QtyPcs", "OrdersCount"];
    const rows = partyItems.map((r) => [r.item, r.category, r.value, r.qty, r.ordersCount]);
    const fname = `tycoon-${(selectedPartyName || "customer").toLowerCase().replace(/\s+/g, "-")}-items.csv`;
    downloadCsv(fname, header, rows);
  }

  // ---------- CHARTS ----------

  const topParties = useMemo(() => partyAgg.slice(0, 12), [partyAgg]);
  const customerTrendTotals = useMemo(() => {
    const byCustomer = new Map<string, { customer_id: string; customer_name: string; qty: number; value: number }>();

    customerTrendRows.forEach((row) => {
      if (!byCustomer.has(row.customer_id)) {
        byCustomer.set(row.customer_id, {
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          qty: 0,
          value: 0,
        });
      }

      const agg = byCustomer.get(row.customer_id)!;
      agg.qty += row.qty;
      agg.value += row.value;
    });

    return Array.from(byCustomer.values()).sort((a, b) => b.value - a.value);
  }, [customerTrendRows]);
  const topTrendCustomers = useMemo(
    () => customerTrendTotals.slice(0, 5).map((row) => row.customer_id),
    [customerTrendTotals]
  );
  const customerTrendOptions = useMemo(
    () => customerTrendTotals.map((row) => ({ customer_id: row.customer_id, customer_name: row.customer_name })),
    [customerTrendTotals]
  );
  const activeTrendCustomerIds = useMemo(() => {
    const selected = new Set<string>();

    topTrendCustomers.forEach((customerId) => {
      if (!hiddenTopTrendCustomers.includes(customerId)) {
        selected.add(customerId);
      }
    });

    customCustomerTrendSlots.forEach((slot) => {
      if (slot.enabled && slot.customer_id) {
        selected.add(slot.customer_id);
      }
    });

    return Array.from(selected);
  }, [customCustomerTrendSlots, hiddenTopTrendCustomers, topTrendCustomers]);
  const visibleCustomerTrends = useMemo(
    () => customerTrendRows.filter((row) => activeTrendCustomerIds.includes(row.customer_id)),
    [activeTrendCustomerIds, customerTrendRows]
  );

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
          { field: "party_name", title: "Customer" },
          { field: "value", title: "Sales (₹)", format: ",.0f" },
          { field: "qty", title: "Qty (pcs)" },
          { field: "ordersServed", title: "Orders served" },
        ],
      },
      config: { view: { stroke: "transparent" } },
    };
  }, [topParties]);

  const categoryCustomerSpec = useMemo(() => {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      background: "transparent",
      width: "container",
      height: 300,
      data: { values: partyCategorySlices },
      mark: {
        type: "arc",
        outerRadius: 120,
        stroke: "#111",
        strokeWidth: 1,
        tooltip: true,
      },
      encoding: {
        theta: {
          field: "value",
          type: "quantitative",
        },
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
        order: {
          field: "value",
          type: "quantitative",
          sort: "descending",
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

  const customerTrendSpec = useMemo(() => {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      background: "transparent",
      width: "container",
      height: 320,
      data: { values: visibleCustomerTrends },
      mark: { type: "line", point: true, strokeWidth: 3 },
      encoding: {
        x: {
          field: "date",
          type: "temporal",
          title: null,
          axis: {
            labelColor: "#cfcfcf",
            titleColor: "#cfcfcf",
            gridColor: "#1f1f1f",
            domainColor: "#262626",
            tickColor: "#262626",
            format: "%d %b",
          },
        },
        y: {
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
        color: {
          field: "customer_name",
          type: "nominal",
          legend: { labelColor: "#cfcfcf", titleColor: "#cfcfcf", title: "Selected customers" },
        },
        tooltip: [
          { field: "customer_name", title: "Customer" },
          { field: "date", type: "temporal", title: "Dispatch date" },
          { field: "value", title: "Sales (₹)", format: ",.0f" },
          { field: "qty", title: "Qty (pcs)" },
          { field: "product_breakdown", title: "Products (qty)" },
        ],
      },
      config: { view: { stroke: "transparent" } },
    };
  }, [visibleCustomerTrends]);

  useEffect(() => {
    setHiddenTopTrendCustomers((prev) => prev.filter((customerId) => topTrendCustomers.includes(customerId)));
  }, [topTrendCustomers]);

  useEffect(() => {
    setCustomCustomerTrendSlots((prev) =>
      prev.map((slot) =>
        !slot.customer_id || customerTrendOptions.some((option) => option.customer_id === slot.customer_id)
          ? slot
          : {
              ...slot,
              enabled: false,
              customer_id: "",
            }
      )
    );
  }, [customerTrendOptions]);

  function toggleTopTrendCustomer(customerId: string, enabled: boolean) {
    setHiddenTopTrendCustomers((prev) => {
      if (enabled) {
        return prev.filter((entry) => entry !== customerId);
      }
      return prev.includes(customerId) ? prev : [...prev, customerId];
    });
  }

  function updateCustomCustomerTrendSlot(slotId: string, updates: Partial<CustomerTrendSelectorSlot>) {
    setCustomCustomerTrendSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== slotId) return slot;
        const next = { ...slot, ...updates };
        if (!next.customer_id) {
          next.enabled = false;
        }
        return next;
      })
    );
  }

  function resetCustomerTrendSelection() {
    setHiddenTopTrendCustomers([]);
    setCustomCustomerTrendSlots(createEmptyCustomerTrendSlots());
  }

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
          <h1 className="section-title">Customer Sales</h1>
          <div className="section-subtitle" style={{ marginTop: 6 }}>
            Dispatch-based customer sales analytics · Tycoon only · excludes spares.
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
          Download Customer CSV
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

        {!dispatchFrom && !dispatchTo && (
          <div style={{ fontSize: 11, opacity: 0.68 }}>
            All time uses current dispatched quantities from orders, so older shipped lines still count even if they do not have dated dispatch events.
          </div>
        )}

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

      <div className="stacked-sections">
      {/* 1) CUSTOMER BAR CHART */}
      <div className="card stacked-card">
        <div className="card-label">Sales by Customer (Top 12)</div>
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
          <div className="chart-panel chart-panel-full">
            <VegaLiteChart spec={partyBarSpec} height={400} />
          </div>
        )}
      </div>

      {/* 2) CUSTOMER LIST */}
      <div className="card stacked-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div className="card-label">Customer List</div>
            <div className="card-meta">Click a customer row to load its stats + item-wise sales below.</div>
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
                <th style={{ width: "45%" }}>Customer</th>
                <th>Sales (₹)</th>
                <th>Qty (pcs)</th>
                <th>Orders served</th>
              </tr>
            </thead>
            <tbody>
              {!partyAggLoading && partyAgg.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: 10, fontSize: 13 }}>
                    No customer sales found in this range.
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
          Showing top 30 customers by sales value. Export CSV for full list.
        </div>
      </div>

      {/* 3) CUSTOMER TRENDS */}
      <div className="card stacked-card">
        <div className="card-label">Top Customers Over Time</div>
        <div className="card-meta">
          Daily sales trend. Top 5 customers by sales value are enabled by default, and you can remove them or add others below.
        </div>

        {customerTrendOptions.length > 0 && (
          <div className="selector-panel">
            <div className="selector-grid">
              {topTrendCustomers.map((customerId) => {
                const option = customerTrendOptions.find((entry) => entry.customer_id === customerId);
                const enabled = !hiddenTopTrendCustomers.includes(customerId);

                return (
                  <label key={customerId} className="selector-row">
                    <input
                      type="checkbox"
                      className="selector-checkbox"
                      checked={enabled}
                      onChange={(e) => toggleTopTrendCustomer(customerId, e.target.checked)}
                    />
                    <span className="selector-label">{option?.customer_name || "Unknown customer"}</span>
                  </label>
                );
              })}

              {customCustomerTrendSlots.map((slot, index) => (
                <div key={slot.id} className="selector-row">
                  <input
                    type="checkbox"
                    className="selector-checkbox"
                    checked={slot.enabled}
                    onChange={(e) =>
                      updateCustomCustomerTrendSlot(slot.id, {
                        enabled: e.target.checked && !!slot.customer_id,
                      })
                    }
                  />
                  <select
                    className="selector-select"
                    value={slot.customer_id}
                    onChange={(e) =>
                      updateCustomCustomerTrendSlot(slot.id, {
                        customer_id: e.target.value,
                        enabled: e.target.value ? slot.enabled || true : false,
                      })
                    }
                  >
                    <option value="">Add another customer #{index + 1}</option>
                    {customerTrendOptions.map((option) => (
                      <option key={option.customer_id} value={option.customer_id}>
                        {option.customer_name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="selector-actions">
              <div style={{ fontSize: 11, opacity: 0.68 }}>
                Selected: <b style={{ opacity: 0.95 }}>{activeTrendCustomerIds.length}</b>
              </div>

              <button
                type="button"
                onClick={resetCustomerTrendSelection}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #333",
                  background: "transparent",
                  color: "#f5f5f5",
                  fontSize: 11,
                }}
              >
                Reset to top 5
              </button>
            </div>
          </div>
        )}

        {customerTrendError && (
          <div style={{ fontSize: 12, marginTop: 8, color: "#fbbf24" }}>{customerTrendError}</div>
        )}

        {customerTrendLoading ? (
          <div style={{ fontSize: 12, marginTop: 10 }}>Loading…</div>
        ) : activeTrendCustomerIds.length === 0 ? (
          <div style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>Select at least one customer to view the trend chart.</div>
        ) : visibleCustomerTrends.length === 0 ? (
          <div style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>
            No dated customer trend data found in this range.
          </div>
        ) : (
          <div className="chart-panel chart-panel-full">
            <VegaLiteChart spec={customerTrendSpec} height={380} />
          </div>
        )}

        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 8 }}>
          Trend charts use dated dispatch events, so older dispatches without event dates will not appear here.
        </div>
      </div>

      {/* 4) CUSTOMER KPI SUMMARY */}
      <div className="card stacked-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="card-label">
              Customer Statistics:{" "}
              <span style={{ opacity: 0.95 }}>{selectedPartyName || "—"}</span>
            </div>
            <div className="card-meta">
              Dispatch-based · Tycoon only · excludes spares · pie excludes uncategorised.
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
          Total sales (selected customer):{" "}
          <b style={{ fontSize: 16, opacity: 0.95 }}>
            {partyDetailLoading ? "…" : `₹ ${partyTotals.value.toLocaleString("en-IN")}`}
          </b>
        </div>

        <div className="stats-grid-wide">
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

      {/* 5) CUSTOMER CATEGORY GRAPH */}
      <div className="card stacked-card">
        <div className="card-label">Category-wise Sales (selected customer)</div>
        <div className="card-meta">
          Slice size = ₹ value · excludes spares + uncategorised.
        </div>

        <div className="chart-panel chart-panel-full">
          {!partyDetailLoading && partyCategorySlices.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              No category sales (after excluding uncategorised) for this customer in the selected range.
            </div>
          ) : (
            <VegaLiteChart spec={categoryCustomerSpec} height={360} />
          )}
        </div>
      </div>

      {/* 6) ITEM-WISE SALES */}
      <div className="card stacked-card">
        <div className="card-label">Item-wise Sales (selected customer)</div>
        <div className="card-meta">
          Dispatch-based (factory-out) · Tycoon only · excludes spares · includes uncategorised items.
        </div>

        {partyDetailLoading && <div style={{ fontSize: 12, marginTop: 8 }}>Loading…</div>}

        {!partyDetailLoading && partyItems.length === 0 && (
          <div style={{ fontSize: 12, marginTop: 8, opacity: 0.8 }}>
            No item sales found for this customer in the selected range.
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
      </div>
    </>
  );
}

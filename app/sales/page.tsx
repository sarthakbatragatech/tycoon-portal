// app/sales/page.tsx
// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import useThemeMode from "@/app/_components/useThemeMode";
import VegaLiteChart from "@/components/VegaLiteChart";
import { supabase } from "@/lib/supabase";
import {
  ActionButton,
  MetricCard,
  PageHeader,
  ResponsiveTable,
  SalesFilters,
  SectionCard,
  StatusMessage,
} from "./_components/SalesView";

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
  avgRealisation: number;
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
  const themeMode = useThemeMode();
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 768
  );

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

  const chartTheme = useMemo(
    () =>
      themeMode === "light"
        ? {
            axisLabel: "#4f4f4f",
            axisStrong: "#1f1f1f",
            grid: "#ddd6ca",
            line: "#cfc6b8",
            pieStroke: "#f4f2ed",
          }
        : {
            axisLabel: "#cfcfcf",
            axisStrong: "#e5e5e5",
            grid: "#1f1f1f",
            line: "#262626",
            pieStroke: "#111111",
          },
    [themeMode]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const frameId = window.requestAnimationFrame(() => {
      setIsMobileViewport(mediaQuery.matches);
    });
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      window.cancelAnimationFrame(frameId);
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  // Default to the last 90 days so the page stays useful across month boundaries.
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setDate(from.getDate() - 89);
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
        avgRealisation: agg.qty > 0 ? Math.round(agg.value / agg.qty) : 0,
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
    const header = ["Item", "Category", "SalesValue", "QtyPcs", "AvgRealisation", "OrdersCount"];
    const rows = partyItems.map((r) => [r.item, r.category, r.value, r.qty, r.avgRealisation, r.ordersCount]);
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
          axis: {
            labelColor: chartTheme.axisStrong,
            tickColor: chartTheme.line,
            domainColor: chartTheme.line,
          },
        },
        x: {
          field: "value",
          type: "quantitative",
          title: "Sales value (₹)",
          axis: {
            labelColor: chartTheme.axisLabel,
            titleColor: chartTheme.axisLabel,
            gridColor: chartTheme.grid,
            domainColor: chartTheme.line,
            tickColor: chartTheme.line,
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
  }, [chartTheme, topParties]);

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
        stroke: chartTheme.pieStroke,
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
            labelColor: chartTheme.axisLabel,
            titleColor: chartTheme.axisLabel,
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
  }, [chartTheme, partyCategorySlices]);

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
            labelColor: chartTheme.axisLabel,
            titleColor: chartTheme.axisLabel,
            gridColor: chartTheme.grid,
            domainColor: chartTheme.line,
            tickColor: chartTheme.line,
            format: "%d %b",
            labelAngle: isMobileViewport ? -24 : 0,
            labelLimit: isMobileViewport ? 72 : 100,
          },
        },
        y: {
          field: "value",
          type: "quantitative",
          title: "Sales value (₹)",
          axis: {
            labelColor: chartTheme.axisLabel,
            titleColor: chartTheme.axisLabel,
            gridColor: chartTheme.grid,
            domainColor: chartTheme.line,
            tickColor: chartTheme.line,
            format: "~s",
          },
        },
        color: {
          field: "customer_name",
          type: "nominal",
          legend: isMobileViewport
            ? {
                orient: "bottom",
                direction: "vertical",
                columns: 1,
                title: null,
                labelColor: chartTheme.axisLabel,
                labelLimit: 220,
                labelFontSize: 11,
                symbolType: "circle",
                symbolSize: 110,
                rowPadding: 6,
                offset: 10,
              }
            : {
                labelColor: chartTheme.axisLabel,
                titleColor: chartTheme.axisLabel,
                title: "Selected customers",
              },
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
  }, [chartTheme, isMobileViewport, visibleCustomerTrends]);

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

  const customerColumns = [
    {
      key: "customer",
      header: "Customer",
      headerStyle: { width: "45%" },
      mobileLabel: "Customer",
      tdClassName: "table-cell-strong",
      render: (row: PartyAgg) => (
        <span className={row.party_id === selectedPartyId ? "table-primary-text active" : "table-primary-text"}>
          {row.party_name}
        </span>
      ),
    },
    {
      key: "sales",
      header: "Sales (₹)",
      mobileLabel: "Sales",
      render: (row: PartyAgg) => `₹ ${Math.round(row.value).toLocaleString("en-IN")}`,
    },
    {
      key: "qty",
      header: "Qty (pcs)",
      mobileLabel: "Qty",
      render: (row: PartyAgg) => Math.round(row.qty).toLocaleString("en-IN"),
    },
    {
      key: "ordersServed",
      header: "Orders served",
      mobileLabel: "Orders served",
      render: (row: PartyAgg) => row.ordersServed,
    },
  ];

  const itemColumns = [
    {
      key: "item",
      header: "Item",
      headerStyle: { width: "42%" },
      mobileLabel: "Item",
      tdClassName: "table-cell-strong",
      render: (row: PartyItemRow) => <span className="table-primary-text">{row.item}</span>,
    },
    {
      key: "category",
      header: "Category",
      mobileLabel: "Category",
      render: (row: PartyItemRow) => row.category,
    },
    {
      key: "sales",
      header: "Sales (₹)",
      mobileLabel: "Sales",
      render: (row: PartyItemRow) => `₹ ${Math.round(row.value).toLocaleString("en-IN")}`,
    },
    {
      key: "qty",
      header: "Qty (pcs)",
      mobileLabel: "Qty",
      render: (row: PartyItemRow) => Math.round(row.qty).toLocaleString("en-IN"),
    },
    {
      key: "avgRealisation",
      header: "Avg / Unit",
      mobileLabel: "Avg / Unit",
      render: (row: PartyItemRow) => `₹ ${Math.round(row.avgRealisation).toLocaleString("en-IN")}`,
    },
    {
      key: "ordersCount",
      header: "Orders",
      mobileLabel: "Orders",
      render: (row: PartyItemRow) => row.ordersCount,
    },
  ];

  // ---------- RENDER ----------

  return (
    <>
      <PageHeader
        title="Customer Sales"
        subtitle="Dispatch-based customer sales analytics · Tycoon only · excludes spares."
        note="Live from Supabase"
        action={
          <ActionButton variant="primary" onClick={downloadPartyCsvAll}>
            Download Customer CSV
          </ActionButton>
        }
      />

      <SalesFilters
        dispatchFrom={dispatchFrom}
        dispatchTo={dispatchTo}
        rangeLabel={rangeLabel}
        onQuickRange={setQuickRangeDispatch}
        onDispatchFromChange={setDispatchFrom}
        onDispatchToChange={setDispatchTo}
        onClearFilter={() => {
          setDispatchFrom("");
          setDispatchTo("");
        }}
      />

      <div className="stacked-sections">
        <SectionCard
          label="Sales by Customer (Top 12)"
          meta="Dispatch-based (factory-out). Tycoon only. Excludes spares."
        >
          {partyAggLoading ? <StatusMessage>Loading…</StatusMessage> : null}
          {partyAggError ? <StatusMessage tone="warning">{partyAggError}</StatusMessage> : null}

          {!partyAggLoading && !partyAggError && topParties.length === 0 ? (
            <StatusMessage>No dispatch sales found in this range.</StatusMessage>
          ) : null}

          {!partyAggLoading && !partyAggError && topParties.length > 0 ? (
            <div className="chart-panel chart-panel-full">
              <VegaLiteChart spec={partyBarSpec} height={400} showActions={!isMobileViewport} />
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          label="Customer List"
          meta="Click a customer row to load its stats + item-wise sales below."
          action={
            <div className="inline-meta-pill">
              Selected: <b>{selectedPartyName || "—"}</b>
            </div>
          }
          footer="Showing top 30 customers by sales value. Export CSV for the full list."
        >
          <ResponsiveTable
            columns={customerColumns}
            rows={partyAgg.slice(0, 30)}
            rowKey={(row) => row.party_id}
            emptyMessage="No customer sales found in this range."
            isRowActive={(row) => row.party_id === selectedPartyId}
            onRowClick={(row) => {
              setSelectedPartyId(row.party_id);
              setSelectedPartyName(row.party_name);
            }}
          />
        </SectionCard>

        <SectionCard
          label="Top Customers Over Time"
          meta="Daily sales trend. Top 5 customers by sales value are enabled by default, and you can remove them or add others below."
          footer="Trend charts use dated dispatch events, so older dispatches without event dates will not appear here."
        >
          {customerTrendOptions.length > 0 ? (
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
                        onChange={(event) => toggleTopTrendCustomer(customerId, event.target.checked)}
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
                      onChange={(event) =>
                        updateCustomCustomerTrendSlot(slot.id, {
                          enabled: event.target.checked && !!slot.customer_id,
                        })
                      }
                    />
                    <select
                      className="selector-select"
                      value={slot.customer_id}
                      onChange={(event) =>
                        updateCustomCustomerTrendSlot(slot.id, {
                          customer_id: event.target.value,
                          enabled: event.target.value ? slot.enabled || true : false,
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
                <div className="inline-meta-pill">
                  Selected: <b>{activeTrendCustomerIds.length}</b>
                </div>

                <ActionButton size="sm" variant="secondary" onClick={resetCustomerTrendSelection}>
                  Reset to top 5
                </ActionButton>
              </div>
            </div>
          ) : null}

          {customerTrendError ? <StatusMessage tone="warning">{customerTrendError}</StatusMessage> : null}

          {customerTrendLoading ? (
            <StatusMessage>Loading…</StatusMessage>
          ) : activeTrendCustomerIds.length === 0 ? (
            <StatusMessage>Select at least one customer to view the trend chart.</StatusMessage>
          ) : visibleCustomerTrends.length === 0 ? (
            <StatusMessage>No dated customer trend data found in this range.</StatusMessage>
          ) : (
            <div className="chart-panel chart-panel-full">
              <VegaLiteChart
                spec={customerTrendSpec}
                height={isMobileViewport ? 340 : 380}
                showActions={!isMobileViewport}
              />
            </div>
          )}
        </SectionCard>

        <SectionCard
          label={
            <>
              Customer Statistics: <span className="card-label-emphasis">{selectedPartyName || "—"}</span>
            </>
          }
          meta="Dispatch-based · Tycoon only · excludes spares · pie excludes uncategorised."
          action={
            <ActionButton variant="primary" onClick={downloadSelectedPartyItemsCsv}>
              Download Items CSV
            </ActionButton>
          }
          footer="Fulfilment-to-date = (to-date dispatched ÷ ordered) across orders that had any dispatch in this range."
        >
          {partyDetailError ? <StatusMessage tone="warning">{partyDetailError}</StatusMessage> : null}

          <div className="summary-total">
            Total sales (selected customer):{" "}
            <b>{partyDetailLoading ? "…" : `₹ ${partyTotals.value.toLocaleString("en-IN")}`}</b>
          </div>

          <div className="stats-grid-wide">
            <MetricCard
              label="Qty dispatched"
              value={partyDetailLoading ? "…" : `${partyTotals.qty} pcs`}
              meta="In dispatch range"
            />
            <MetricCard
              label="Avg realisation / unit"
              value={partyDetailLoading ? "…" : `₹ ${partyTotals.avgRealisation.toLocaleString("en-IN")}`}
              meta="Value ÷ qty"
            />
            <MetricCard
              label="Orders served"
              value={partyDetailLoading ? "…" : partyTotals.ordersServed}
              meta="Unique orders with dispatch"
            />
            <MetricCard
              label="Fulfilment-to-date"
              value={partyDetailLoading ? "…" : `${partyTotals.fulfillmentPct}%`}
              meta="On served orders"
            />
          </div>
        </SectionCard>

        <SectionCard
          label="Category-wise Sales (selected customer)"
          meta="Slice size = ₹ value · excludes spares + uncategorised."
        >
          <div className="chart-panel chart-panel-full">
            {!partyDetailLoading && partyCategorySlices.length === 0 ? (
              <StatusMessage>
                No category sales (after excluding uncategorised) for this customer in the selected
                range.
              </StatusMessage>
            ) : (
              <VegaLiteChart spec={categoryCustomerSpec} height={360} showActions={!isMobileViewport} />
            )}
          </div>
        </SectionCard>

        <SectionCard
          label="Item-wise Sales (selected customer)"
          meta="Dispatch-based (factory-out) · Tycoon only · excludes spares · includes uncategorised items."
          footer="Showing top 40 items by sales value."
        >
          {partyDetailLoading ? <StatusMessage>Loading…</StatusMessage> : null}

          {!partyDetailLoading && partyItems.length === 0 ? (
            <StatusMessage>No item sales found for this customer in the selected range.</StatusMessage>
          ) : null}

          {!partyDetailLoading && partyItems.length > 0 ? (
            <ResponsiveTable
              columns={itemColumns}
              rows={partyItems.slice(0, 40)}
              rowKey={(row) => row.item}
              emptyMessage="No item sales found for this customer in the selected range."
            />
          ) : null}
        </SectionCard>
      </div>
    </>
  );
}

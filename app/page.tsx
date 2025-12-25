// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

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
          {
            ...spec,
            height,
          },
          {
            actions: {
              export: true,
              source: false,
              editor: true,
            },
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
      if (view) {
        view.finalize?.();
      }
    };
  }, [spec, height]);

  return (
    <div ref={containerRef} style={{ width: "100%", minHeight: height + 30 }} />
  );
}

// ---------- HELPERS ----------

function normStr(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

function isSpareCategory(cat: any) {
  const c = normStr(cat);
  return c === "spare" || c === "spares";
}

function isUncategorised(cat: any) {
  const c = normStr(cat);
  return c === "uncategorised" || c === "uncategorized" || c === "";
}

function isExcludedDemandCategory(cat: any) {
  return isSpareCategory(cat) || isUncategorised(cat);
}

// ---------- SALES CHART (DISPATCH-EVENTS BASED) ----------

type SalesPoint = {
  date: string; // "2025-01-23"
  qty: number; // total pcs that day (Tycoon only)
  value: number; // total value that day (Tycoon only)
  items_breakdown: string; // "Everest: 10, Robo Car: 5"
};

function SalesChartCard({
  dispatchFrom,
  dispatchTo,
}: {
  dispatchFrom: string;
  dispatchTo: string;
}) {
  const [data, setData] = useState<SalesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchFrom, dispatchTo]);

  async function loadSales() {
    setLoading(true);
    setError(null);

    // Default: last 60 days if no dispatch date filter set
    const today = new Date();
    const defaultFrom = new Date();
    defaultFrom.setDate(today.getDate() - 59);

    const fromISO = dispatchFrom || defaultFrom.toISOString().slice(0, 10);
    const toISO = dispatchTo || today.toISOString().slice(0, 10);

    const { data, error } = await supabase
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
          )
        )
      `
      )
      .gte("dispatched_at", fromISO)
      .lte("dispatched_at", toISO)
      .order("dispatched_at", { ascending: true });

    if (error) {
      console.error("Error loading sales from dispatch_events", error);
      setError("Could not load sales data.");
      setData([]);
      setLoading(false);
      return;
    }

    // Group by date, Tycoon only, exclude spares, and build per-date item breakdown
    const grouped: Record<
      string,
      { qty: number; value: number; items: Record<string, number> }
    > = {};

    (data || []).forEach((row: any) => {
      const dateStr = row.dispatched_at;
      if (!dateStr) return;

      const qty = Number(row.dispatched_qty ?? 0);
      if (!qty || qty <= 0) return;

      const line = row.order_lines;
      const itemRel = line?.items;
      const item =
        itemRel && Array.isArray(itemRel) && itemRel.length > 0
          ? itemRel[0]
          : itemRel || null;

      if ((item?.company || "Unknown") !== "Tycoon") return;

      // Exclude spares
      if (isSpareCategory(item?.category)) return;

      const itemName = item?.name || "Unknown item";
      const rate = Number(line?.dealer_rate_at_order ?? 0);
      const val = qty * rate;

      if (!grouped[dateStr]) grouped[dateStr] = { qty: 0, value: 0, items: {} };
      grouped[dateStr].qty += qty;
      grouped[dateStr].value += val;
      grouped[dateStr].items[itemName] =
        (grouped[dateStr].items[itemName] ?? 0) + qty;
    });

    const points: SalesPoint[] = Object.entries(grouped)
      .map(([date, { qty, value, items }]) => {
        const breakdownParts = Object.entries(items)
          .sort((a, b) => b[1] - a[1])
          .map(([name, q]) => `${name}: ${q}`);
        return { date, qty, value, items_breakdown: breakdownParts.join(", ") };
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    setData(points);
    setLoading(false);
  }

  const spec: any = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height: 240,
    background: "transparent",
    padding: { left: 8, right: 8, top: 8, bottom: 4 },

    data: { values: data },

    encoding: {
      x: {
        field: "date",
        type: "temporal",
        title: null,
        axis: {
          format: "%d %b",
          labelColor: "#cfcfcf",
          titleColor: "#cfcfcf",
          labelAngle: 0,
          labelPadding: 10,
          tickColor: "#262626",
          domainColor: "#262626",
          grid: false,
        },
      },
    },

    layer: [
      {
        mark: {
          type: "bar",
          cornerRadiusEnd: 4,
          opacity: 0.85,
        },
        encoding: {
          y: {
            field: "value",
            type: "quantitative",
            title: "₹ Sales",
            axis: {
              labelColor: "#cfcfcf",
              titleColor: "#cfcfcf",
              tickColor: "#262626",
              domainColor: "#262626",
              grid: true,
              gridColor: "#1f1f1f",
              gridOpacity: 1,
              tickCount: 5,
            },
          },
          color: { value: "#a855f7" },
          tooltip: [
            { field: "date", type: "temporal", title: "Dispatch date" },
            { field: "value", type: "quantitative", title: "Sales (₹)", format: ",.0f" },
            { field: "qty", type: "quantitative", title: "Pcs" },
            { field: "items_breakdown", type: "nominal", title: "Items (pcs)" },
          ],
        },
      },
      {
        mark: {
          type: "line",
          strokeWidth: 3,
          point: { filled: true, size: 70 },
        },
        encoding: {
          y: {
            field: "qty",
            type: "quantitative",
            title: "Pcs",
            axis: {
              orient: "right",
              labelColor: "#cfcfcf",
              titleColor: "#cfcfcf",
              tickColor: "#262626",
              domainColor: "#262626",
              grid: false,
              tickCount: 5,
            },
          },
          color: { value: "#f5f5f5" },
        },
      },
    ],

    resolve: { scale: { y: "independent" } },

    config: {
      view: { stroke: "transparent" },
      legend: { labelColor: "#cfcfcf", titleColor: "#cfcfcf" },
      text: { color: "#e5e5e5" },
    },
  };

  return (
    <div className="card">
      <div className="card-label">Dispatch-based sales (Tycoon)</div>
      <div className="card-meta" style={{ fontSize: 11, opacity: 0.7 }}>
        Sales made in period selected under dispatch date filter.
      </div>

      {loading && <div style={{ fontSize: 12, marginTop: 8 }}>Loading…</div>}

      {error && (
        <div style={{ fontSize: 12, marginTop: 8, color: "#fbbf24" }}>
          {error}
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.8 }}>
          No Tycoon dispatch events in this range (excluding spares).
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <VegaLiteChart spec={spec} height={240} />
        </div>
      )}
    </div>
  );
}

// ---------- TYPES ----------

type OrderWithLines = {
  id: string;
  order_date: string;
  status: string;
  total_qty: number | null;
  total_value: number | null;
  order_lines: {
    qty: number | null;
    dispatched_qty: number | null | string;
    dealer_rate_at_order: number | null;
    line_total: number | null;
    items:
      | {
          name: string | null;
          category: string | null;
          company: string | null;
        }
      | any;
  }[];
};

const PRODUCTION_ACTIVE_STATUSES = [
  "pending",
  "submitted",
  "in_production",
  "packed",
  "partially_dispatched",
];

// ---------- DASHBOARD PAGE ----------

export default function DashboardPage() {
  const [orders, setOrders] = useState<OrderWithLines[]>([]);
  const [loading, setLoading] = useState(true);

  // SALES filter (dispatch date)
  const [dispatchFrom, setDispatchFrom] = useState<string>("");
  const [dispatchTo, setDispatchTo] = useState<string>("");

  // DEMAND filter (order date)
  const [orderFrom, setOrderFrom] = useState<string>("");
  const [orderTo, setOrderTo] = useState<string>("");

  // Backlog table controls
  const [backlogSortBy, setBacklogSortBy] = useState<
    "pending" | "pendingPercent" | "ordered"
  >("pending");
  const [backlogShowAll, setBacklogShowAll] = useState(false);

  // Sales totals (dispatch-events based)
  const [salesTotals, setSalesTotals] = useState({
    qty: 0,
    value: 0,
    ordersServed: 0,
    loading: true,
  });

  // NEW: Sales table data (dispatch-events based)
  const [salesTable, setSalesTable] = useState<{
    loading: boolean;
    itemRows: any[];
    catRows: any[];
  }>({
    loading: true,
    itemRows: [],
    catRows: [],
  });

  // Sales table controls
  const [salesItemSortBy, setSalesItemSortBy] = useState<
    "qty" | "value" | "name"
  >("value");
  const [salesItemShowAll, setSalesItemShowAll] = useState(false);

  const [salesCatSortBy, setSalesCatSortBy] = useState<"qty" | "value" | "name">(
    "value"
  );
  const [salesCatShowAll, setSalesCatShowAll] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSalesTotals();
    loadSalesTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchFrom, dispatchTo]);

  async function loadData() {
    setLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_date,
        status,
        total_qty,
        total_value,
        order_lines (
          qty,
          dispatched_qty,
          dealer_rate_at_order,
          line_total,
          items (
            name,
            category,
            company
          )
        )
      `
      )
      .order("order_date", { ascending: false });

    if (error) {
      console.error("Error loading dashboard data", error);
      setOrders([]);
    } else {
      setOrders((data || []) as any);
    }

    setLoading(false);
  }

  async function loadSalesTotals() {
    setSalesTotals((s) => ({ ...s, loading: true }));

    let q = supabase
      .from("dispatch_events")
      .select(
        `
        dispatched_at,
        dispatched_qty,
        order_lines:order_line_id (
          order_id,
          dealer_rate_at_order,
          items (
            company,
            category
          )
        )
      `
      );

    if (dispatchFrom) q = q.gte("dispatched_at", dispatchFrom);
    if (dispatchTo) q = q.lte("dispatched_at", dispatchTo);

    const { data, error } = await q;

    if (error) {
      console.error("Error loading sales totals", error);
      setSalesTotals({ qty: 0, value: 0, ordersServed: 0, loading: false });
      return;
    }

    let qty = 0;
    let value = 0;
    const orderSet = new Set<string>();

    (data || []).forEach((row: any) => {
      const dqty = Number(row.dispatched_qty ?? 0);
      if (!dqty || dqty <= 0) return;

      const line = row.order_lines;
      const itemRel = line?.items;
      const item =
        Array.isArray(itemRel) && itemRel.length > 0
          ? itemRel[0]
          : itemRel || null;

      if (item?.company !== "Tycoon") return;

      if (isSpareCategory(item?.category)) return;

      qty += dqty;

      const rate = Number(line?.dealer_rate_at_order ?? 0);
      value += dqty * rate;

      if (line?.order_id) orderSet.add(line.order_id);
    });

    setSalesTotals({ qty, value, ordersServed: orderSet.size, loading: false });
  }

  async function loadSalesTable() {
    setSalesTable((s) => ({ ...s, loading: true }));

    let q = supabase
      .from("dispatch_events")
      .select(
        `
        dispatched_at,
        dispatched_qty,
        order_lines:order_line_id (
          dealer_rate_at_order,
          items (
            name,
            company,
            category
          )
        )
      `
      );

    if (dispatchFrom) q = q.gte("dispatched_at", dispatchFrom);
    if (dispatchTo) q = q.lte("dispatched_at", dispatchTo);

    const { data, error } = await q;

    if (error) {
      console.error("Error loading sales table", error);
      setSalesTable({ loading: false, itemRows: [], catRows: [] });
      return;
    }

    const byItem = new Map<
      string,
      { item: string; category: string; qty: number; value: number }
    >();

    const byCat = new Map<string, { category: string; qty: number; value: number }>();

    (data || []).forEach((row: any) => {
      const dqty = Number(row.dispatched_qty ?? 0);
      if (!dqty || dqty <= 0) return;

      const line = row.order_lines;
      const itemRel = line?.items;
      const item =
        Array.isArray(itemRel) && itemRel.length > 0
          ? itemRel[0]
          : itemRel || null;

      if ((item?.company || "Unknown") !== "Tycoon") return;

      if (isSpareCategory(item?.category)) return;

      const itemName = item?.name || "Unknown item";
      const category = item?.category || "Uncategorised";

      const rate = Number(line?.dealer_rate_at_order ?? 0);
      const v = dqty * rate;

      if (!byItem.has(itemName)) {
        byItem.set(itemName, { item: itemName, category, qty: 0, value: 0 });
      }
      const it = byItem.get(itemName)!;
      it.qty += dqty;
      it.value += v;

      const catKey = category;
      if (!byCat.has(catKey)) byCat.set(catKey, { category: catKey, qty: 0, value: 0 });
      const ct = byCat.get(catKey)!;
      ct.qty += dqty;
      ct.value += v;
    });

    const itemRows = Array.from(byItem.values());
    const catRows = Array.from(byCat.values());

    setSalesTable({ loading: false, itemRows, catRows });
  }

  function formatDateLocal(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function setQuickRangeDispatch(
    mode: "all" | "thisMonth" | "lastMonth" | "last90"
  ) {
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
      const lastMonthStart = new Date(
        lastMonthEnd.getFullYear(),
        lastMonthEnd.getMonth(),
        1
      );
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

  function setQuickRangeOrder(
    mode: "all" | "thisMonth" | "lastMonth" | "last90"
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (mode === "all") {
      setOrderFrom("");
      setOrderTo("");
      return;
    }

    if (mode === "thisMonth") {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      setOrderFrom(formatDateLocal(from));
      setOrderTo(formatDateLocal(today));
      return;
    }

    if (mode === "lastMonth") {
      const year = today.getFullYear();
      const month = today.getMonth();
      const firstThisMonth = new Date(year, month, 1);
      const lastMonthEnd = new Date(firstThisMonth.getTime() - 1);
      const lastMonthStart = new Date(
        lastMonthEnd.getFullYear(),
        lastMonthEnd.getMonth(),
        1
      );
      setOrderFrom(formatDateLocal(lastMonthStart));
      setOrderTo(formatDateLocal(lastMonthEnd));
      return;
    }

    if (mode === "last90") {
      const from = new Date(today);
      from.setDate(from.getDate() - 89);
      setOrderFrom(formatDateLocal(from));
      setOrderTo(formatDateLocal(today));
      return;
    }
  }

  // ---------- DEMAND/BACKLOG DERIVED STATS (ORDER-DATE BASED) ----------

  const {
    totalOrders,
    totalQty,
    totalValue,
    itemDemandArray,
    itemPendingArray,
    categoryDemandArray,
    orderFulfillmentArray,
    backlogItemsRaw,
  } = useMemo(() => {
    const result = {
      totalOrders: 0,
      totalQty: 0,
      totalValue: 0,
      itemDemandArray: [] as any[],
      itemPendingArray: [] as any[],
      categoryDemandArray: [] as any[],
      orderFulfillmentArray: [] as any[],
      backlogItemsRaw: [] as any[],
    };

    if (!orders || orders.length === 0) return result;

    // Filter by ORDER DATE (demand section)
    let filteredOrders = orders;

    const fromDate = orderFrom ? new Date(orderFrom) : null;
    const toDate = orderTo ? new Date(orderTo) : null;

    if (fromDate || toDate) {
      filteredOrders = orders.filter((o) => {
        if (!o.order_date) return false;
        const od = new Date(o.order_date);
        if (Number.isNaN(od.getTime())) return false;

        if (fromDate && od < fromDate) return false;
        if (toDate) {
          const endOfTo = new Date(toDate);
          endOfTo.setHours(23, 59, 59, 999);
          if (od > endOfTo) return false;
        }
        return true;
      });
    }

    if (filteredOrders.length === 0) return result;

    result.totalOrders = filteredOrders.length;

    const allLines: {
      itemName: string;
      category: string;
      ordered: number;
      dispatched: number;
      pending: number;
      company: string;
    }[] = [];

    const allTycoonLines: typeof allLines = [];

    let grandQty = 0;
    let grandValue = 0;

    for (const o of filteredOrders) {
      const isProductionActive = PRODUCTION_ACTIVE_STATUSES.includes(o.status);
      const lines = o.order_lines || [];

      for (const l of lines) {
        const itemRel = l.items;
        const item =
          Array.isArray(itemRel) && itemRel.length > 0
            ? itemRel[0]
            : itemRel || null;

        const name = (item?.name || "Unknown item") as string;
        const category = (item?.category || "Uncategorised") as string;
        const company = (item?.company || "Unknown") as string;

        const ordered = l.qty ?? 0;

        const raw =
          l.dispatched_qty === "" || l.dispatched_qty == null
            ? 0
            : Number(l.dispatched_qty);
        let dispatched = Number.isNaN(raw) ? 0 : raw;
        if (dispatched < 0) dispatched = 0;
        if (dispatched > ordered) dispatched = ordered;

        const pendingRaw = Math.max(ordered - dispatched, 0);
        const pending = isProductionActive ? pendingRaw : 0;

        const lineBase = {
          itemName: name,
          category,
          ordered,
          dispatched,
          pending,
          company,
        };

        allLines.push(lineBase);

        if (company === "Tycoon") {
          allTycoonLines.push(lineBase);

          // Demand totals should also respect exclusions
          if (!isExcludedDemandCategory(category)) {
            grandQty += ordered;
            const lineTotal =
              typeof l.line_total === "number"
                ? l.line_total
                : (l.dealer_rate_at_order ?? 0) * ordered;
            grandValue += lineTotal;
          }
        }
      }
    }

    result.totalQty = grandQty;
    result.totalValue = grandValue;

    // ---- ITEM DEMAND (TYCOON ONLY) ----
    const byItemTycoon = new Map<
      string,
      {
        ordered: number;
        dispatched: number;
        pending: number;
        category: string;
        company: string;
      }
    >();

    for (const l of allTycoonLines) {
      const catKey =
        l.category && l.category.trim() !== ""
          ? l.category
          : "Uncategorised";

      // EXCLUDE spares + uncategorised from demand charts
      if (isExcludedDemandCategory(catKey)) continue;

      if (!byItemTycoon.has(l.itemName)) {
        byItemTycoon.set(l.itemName, {
          ordered: 0,
          dispatched: 0,
          pending: 0,
          category: catKey,
          company: l.company,
        });
      }

      const agg = byItemTycoon.get(l.itemName)!;
      agg.ordered += l.ordered;
      agg.dispatched += l.dispatched;
      agg.pending += l.pending;
    }

    const itemArrayTycoon = Array.from(byItemTycoon.entries()).map(
      ([item, agg]) => ({
        item,
        ordered: agg.ordered,
        dispatched: agg.dispatched,
        pending: agg.pending,
        category: agg.category,
        company: agg.company,
      })
    );

    result.itemDemandArray = itemArrayTycoon
      .filter((d) => d.ordered > 0)
      .sort((a, b) => b.ordered - a.ordered)
      .slice(0, 12);

    // ---- BACKLOG (ALL COMPANIES) ----
    const byItemAll = new Map<
      string,
      { ordered: number; dispatched: number; pending: number; category: string }
    >();

    for (const l of allLines) {
      const catKey =
        l.category && l.category.trim() !== ""
          ? l.category
          : "Uncategorised";

      if (!byItemAll.has(l.itemName)) {
        byItemAll.set(l.itemName, {
          ordered: 0,
          dispatched: 0,
          pending: 0,
          category: catKey,
        });
      }

      const agg = byItemAll.get(l.itemName)!;
      agg.ordered += l.ordered;
      agg.dispatched += l.dispatched;
      agg.pending += l.pending;
    }

    const itemArrayAll = Array.from(byItemAll.entries()).map(([item, agg]) => ({
      item,
      ordered: agg.ordered,
      dispatched: agg.dispatched,
      pending: agg.pending,
      category: agg.category,
    }));

    const backlogItemsRaw = itemArrayAll
      .filter((d) => d.pending > 0)
      .map((d) => ({
        item: d.item,
        pending: d.pending,
        ordered: d.ordered,
        pendingPercent:
          d.ordered > 0 ? Math.round((d.pending / d.ordered) * 100) : 0,
      }));

    result.backlogItemsRaw = backlogItemsRaw;

    const backlogSortedForChart = [...backlogItemsRaw].sort(
      (a, b) => b.pending - a.pending
    );
    result.itemPendingArray = backlogSortedForChart.slice(0, 12);

    // ---- CATEGORY DEMAND (ALL COMPANIES) ----
    const byCat = new Map<
      string,
      { ordered: number; dispatched: number; pending: number }
    >();

    for (const l of allLines) {
      const catKey =
        l.category && l.category.trim() !== ""
          ? l.category
          : "Uncategorised";

      // EXCLUDE spares + uncategorised from demand charts
      if (isExcludedDemandCategory(catKey)) continue;

      if (!byCat.has(catKey)) byCat.set(catKey, { ordered: 0, dispatched: 0, pending: 0 });

      const agg = byCat.get(catKey)!;
      agg.ordered += l.ordered;
      agg.dispatched += l.dispatched;
      agg.pending += l.pending;
    }

    result.categoryDemandArray = Array.from(byCat.entries())
      .map(([category, agg]) => ({
        category,
        ordered: agg.ordered,
        dispatched: agg.dispatched,
        pending: agg.pending,
      }))
      .filter((d) => d.ordered > 0)
      .sort((a, b) => b.ordered - a.ordered);

    // ---- Per-order fulfilment (all companies) ----
    result.orderFulfillmentArray = filteredOrders.map((o) => {
      const lines = o.order_lines || [];
      const totalOrdered = lines.reduce((sum, l) => sum + (l.qty ?? 0), 0);
      const totalDispatched = lines.reduce((sum, l) => {
        const ordered = l.qty ?? 0;
        const raw =
          l.dispatched_qty === "" || l.dispatched_qty == null
            ? 0
            : Number(l.dispatched_qty);
        let d = Number.isNaN(raw) ? 0 : raw;
        if (d < 0) d = 0;
        if (d > ordered) d = ordered;
        return sum + d;
      }, 0);

      const percent =
        totalOrdered > 0 ? Math.round((totalDispatched / totalOrdered) * 100) : 0;

      let band = "0–25%";
      if (percent >= 75 && percent < 100) band = "75–99%";
      else if (percent >= 25 && percent < 75) band = "25–75%";
      else if (percent === 100) band = "100%";

      return {
        id: o.id,
        order_date: o.order_date,
        status: o.status,
        totalOrdered,
        totalDispatched,
        percent,
        band,
      };
    });

    return result;
  }, [orders, orderFrom, orderTo]);

  // Backlog rows with sorting + top/all
  const backlogRows = useMemo(() => {
    let rows = [...backlogItemsRaw];

    rows.sort((a, b) => {
      if (backlogSortBy === "pending") return b.pending - a.pending;
      if (backlogSortBy === "pendingPercent")
        return (b.pendingPercent ?? 0) - (a.pendingPercent ?? 0);
      return b.ordered - a.ordered;
    });

    if (!backlogShowAll) rows = rows.slice(0, 8);
    return rows;
  }, [backlogItemsRaw, backlogSortBy, backlogShowAll]);

  function downloadBacklogCsv() {
    if (!backlogRows || backlogRows.length === 0) {
      alert("No backlog data to export.");
      return;
    }

    const header = "Item,PendingQty,PendingPercent,TotalOrdered\n";
    const lines = backlogRows
      .map((row) =>
        [
          `"${row.item.replace(/"/g, '""')}"`,
          row.pending,
          row.pendingPercent ?? 0,
          row.ordered,
        ].join(",")
      )
      .join("\n");

    const csv = header + lines;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "tycoon-backlog.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- SALES TABLE (dispatch-based) derived rows + sorting ----------

  const salesItemRows = useMemo(() => {
    let rows = [...(salesTable.itemRows || [])];

    rows.sort((a, b) => {
      if (salesItemSortBy === "qty") return (b.qty ?? 0) - (a.qty ?? 0);
      if (salesItemSortBy === "value") return (b.value ?? 0) - (a.value ?? 0);
      return String(a.item ?? "").localeCompare(String(b.item ?? ""));
    });

    if (!salesItemShowAll) rows = rows.slice(0, 12);
    return rows;
  }, [salesTable.itemRows, salesItemSortBy, salesItemShowAll]);

  const salesCatRows = useMemo(() => {
    let rows = [...(salesTable.catRows || [])];

    rows.sort((a, b) => {
      if (salesCatSortBy === "qty") return (b.qty ?? 0) - (a.qty ?? 0);
      if (salesCatSortBy === "value") return (b.value ?? 0) - (a.value ?? 0);
      return String(a.category ?? "").localeCompare(String(b.category ?? ""));
    });

    if (!salesCatShowAll) rows = rows.slice(0, 10);
    return rows;
  }, [salesTable.catRows, salesCatSortBy, salesCatShowAll]);

  function downloadSalesItemsCsv() {
    const rows = salesTable.itemRows || [];
    if (!rows.length) {
      alert("No sales item data to export.");
      return;
    }
    const header = "Item,Category,Qty,Value\n";
    const lines = rows
      .map((r) =>
        [
          `"${String(r.item ?? "").replace(/"/g, '""')}"`,
          `"${String(r.category ?? "").replace(/"/g, '""')}"`,
          r.qty ?? 0,
          r.value ?? 0,
        ].join(",")
      )
      .join("\n");

    const csv = header + lines;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tycoon-sales-items.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadSalesCategoriesCsv() {
    const rows = salesTable.catRows || [];
    if (!rows.length) {
      alert("No sales category data to export.");
      return;
    }
    const header = "Category,Qty,Value\n";
    const lines = rows
      .map((r) =>
        [
          `"${String(r.category ?? "").replace(/"/g, '""')}"`,
          r.qty ?? 0,
          r.value ?? 0,
        ].join(",")
      )
      .join("\n");

    const csv = header + lines;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tycoon-sales-categories.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- VEGA-LITE SPECS (DEMAND/BACKLOG SECTION) ----------

  // --- Item demand stacked (Tycoon) ---
  const itemDemandSpec = useMemo(() => {
    const stackedValues = (itemDemandArray || []).flatMap((d) => [
      {
        item: d.item,
        metric: "Dispatched",
        qty: d.dispatched ?? 0,
        ordered: d.ordered ?? 0,
        pending: d.pending ?? 0,
        dispatched: d.dispatched ?? 0,
      },
      {
        item: d.item,
        metric: "Pending",
        qty: d.pending ?? 0,
        ordered: d.ordered ?? 0,
        pending: d.pending ?? 0,
        dispatched: d.dispatched ?? 0,
      },
    ]);

    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      description: "Top Tycoon items by ordered qty split into dispatched vs pending",
      background: "transparent",
      width: "container",
      data: { values: stackedValues },
      mark: { type: "bar", cornerRadiusEnd: 4 },
      encoding: {
        y: {
          field: "item",
          type: "ordinal",
          sort: { op: "sum", field: "qty", order: "descending" },
          title: null,
        },
        x: {
          field: "qty",
          type: "quantitative",
          stack: "zero",
          title: "Ordered qty split (pcs, Tycoon)",
        },
        color: {
          field: "metric",
          type: "nominal",
          scale: {
            domain: ["Dispatched", "Pending"],
            range: ["#f5f5f5", "rgba(245,245,245,0.35)"],
          },
          legend: {
            title: null,
            orient: "top",
            labelColor: "#e5e5e5",
          },
        },
        tooltip: [
          { field: "item", title: "Item" },
          { field: "ordered", title: "Ordered (Tycoon)" },
          { field: "dispatched", title: "Dispatched (Tycoon)" },
          { field: "pending", title: "Pending (Tycoon)" },
        ],
      },
      config: {
        view: { stroke: "transparent" },
        axis: {
          labelColor: "#e5e5e5",
          titleColor: "#e5e5e5",
          gridColor: "#262626",
        },
      },
    };
  }, [itemDemandArray]);

  // --- Category demand stacked (all companies) ---
  const categoryDemandSpec = useMemo(() => {
    const stackedValues = (categoryDemandArray || []).flatMap((d) => [
      {
        category: d.category,
        metric: "Dispatched",
        qty: d.dispatched ?? 0,
        ordered: d.ordered ?? 0,
        pending: d.pending ?? 0,
        dispatched: d.dispatched ?? 0,
      },
      {
        category: d.category,
        metric: "Pending",
        qty: d.pending ?? 0,
        ordered: d.ordered ?? 0,
        pending: d.pending ?? 0,
        dispatched: d.dispatched ?? 0,
      },
    ]);

    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      description: "Demand by category split into dispatched vs pending (all companies)",
      background: "transparent",
      width: "container",
      data: { values: stackedValues },
      mark: { type: "bar", cornerRadiusEnd: 2 },
      encoding: {
        x: {
          field: "category",
          type: "ordinal",
          sort: { op: "sum", field: "qty", order: "descending" },
          title: null,
        },
        y: {
          field: "qty",
          type: "quantitative",
          stack: "zero",
          title: "Ordered qty split (pcs, all companies)",
        },
        color: {
          field: "metric",
          type: "nominal",
        scale: {
          domain: ["Pending", "Dispatched"],
          range: ["rgba(168,85,247,0.35)", "#a855f7"],
        },
          legend: {
            title: null,
            orient: "top",
            labelColor: "#e5e5e5",
          },
        },
        tooltip: [
          { field: "category", title: "Category" },
          { field: "ordered", title: "Ordered" },
          { field: "dispatched", title: "Dispatched" },
          { field: "pending", title: "Pending" },
        ],
      },
      config: {
        view: { stroke: "transparent" },
        axis: {
          labelColor: "#e5e5e5",
          titleColor: "#e5e5e5",
          gridColor: "#262626",
        },
      },
    };
  }, [categoryDemandArray]);

  const pendingItemsSpec = useMemo(
    () => ({
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      description: "Top pending items (all companies, order-date based)",
      background: "transparent",
      width: "container",
      data: { values: itemPendingArray },
      mark: { type: "bar", tooltip: true, cornerRadiusEnd: 4 },
      encoding: {
        y: { field: "item", type: "ordinal", sort: "-x", title: null },
        x: { field: "pending", type: "quantitative", title: "Pending qty (pcs)" },
        color: { value: "#f97316" },
        tooltip: [
          { field: "item", title: "Item" },
          { field: "pending", title: "Pending pcs" },
          { field: "ordered", title: "Total ordered" },
        ],
      },
      config: {
        view: { stroke: "transparent" },
        axis: { labelColor: "#e5e5e5", titleColor: "#e5e5e5", gridColor: "#262626" },
      },
    }),
    [itemPendingArray]
  );

  const fulfillmentBands = useMemo(() => {
    const bands = ["0–25%", "25–75%", "75–99%", "100%"];
    return bands.map((b) => ({
      band: b,
      count: orderFulfillmentArray.filter((o) => o.band === b).length,
    }));
  }, [orderFulfillmentArray]);

  const fulfillmentSpec = useMemo(
    () => ({
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      description: "Orders by fulfilment band (order-date based)",
      background: "transparent",
      width: "container",
      data: { values: fulfillmentBands },
      mark: { type: "bar", tooltip: true },
      encoding: {
        x: {
          field: "band",
          type: "ordinal",
          title: "Fulfilment band",
          sort: ["0–25%", "25–75%", "75–99%", "100%"],
        },
        y: { field: "count", type: "quantitative", title: "Orders" },
        color: {
          field: "band",
          type: "nominal",
          scale: {
            domain: ["0–25%", "25–75%", "75–99%", "100%"],
            range: ["#ef4444", "#f59e0b", "#22c55e", "#38bdf8"],
          },
          legend: null,
        },
        tooltip: [
          { field: "band", title: "Band" },
          { field: "count", title: "Orders" },
        ],
      },
      config: {
        view: { stroke: "transparent" },
        axis: { labelColor: "#e5e5e5", titleColor: "#e5e5e5", gridColor: "#262626" },
      },
    }),
    [fulfillmentBands]
  );

  const hasDemandData = totalOrders > 0;

  // ---------- RENDER ----------

  return (
    <>
      <h1 className="section-title">Tycoon Dashboard</h1>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 12 }}>
        ● Live from Supabase
      </div>

      {/* ===================== SALES (DISPATCH-DATE) ===================== */}
      <div style={{ marginBottom: 10, opacity: 0.85 }}>
        <div style={{ fontSize: 14, letterSpacing: 0.3, fontWeight: 700 }}>
          Sales (Factory-out · Dispatch-based)
        </div>
        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>
          These KPIs show what exited the factory in the selected dispatch date range (Tycoon only).
        </div>
      </div>

      {/* DISPATCH DATE FILTERS */}
      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ opacity: 0.8 }}>Quick range (dispatch):</span>

          <button type="button" onClick={() => setQuickRangeDispatch("all")}
            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #333", background: "transparent", color: "#f5f5f5", fontSize: 11 }}>
            All time
          </button>

          <button type="button" onClick={() => setQuickRangeDispatch("thisMonth")}
            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #333", background: "transparent", color: "#f5f5f5", fontSize: 11 }}>
            This month
          </button>

          <button type="button" onClick={() => setQuickRangeDispatch("lastMonth")}
            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #333", background: "transparent", color: "#f5f5f5", fontSize: 11 }}>
            Last month
          </button>

          <button type="button" onClick={() => setQuickRangeDispatch("last90")}
            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #333", background: "transparent", color: "#f5f5f5", fontSize: 11 }}>
            Last 90 days
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <span style={{ opacity: 0.8 }}>Filter by dispatch date:</span>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>From</span>
            <input type="date" value={dispatchFrom} onChange={(e) => setDispatchFrom(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #333", background: "#050505", color: "#f5f5f5", fontSize: 12 }} />
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>To</span>
            <input type="date" value={dispatchTo} onChange={(e) => setDispatchTo(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #333", background: "#050505", color: "#f5f5f5", fontSize: 12 }} />
          </div>

          {(dispatchFrom || dispatchTo) && (
            <button type="button" onClick={() => { setDispatchFrom(""); setDispatchTo(""); }}
              style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #333", background: "transparent", color: "#f5f5f5", fontSize: 11 }}>
              Clear filter
            </button>
          )}

          <button type="button" onClick={() => { setOrderFrom(dispatchFrom); setOrderTo(dispatchTo); }}
            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #333", background: "transparent", color: "#f5f5f5", fontSize: 11 }}>
            Copy to demand range
          </button>
        </div>
      </div>

      {/* SALES SUMMARY CARDS */}
      <div className="card-grid" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-label">Qty Dispatched (Tycoon)</div>
          <div className="card-value">{salesTotals.loading ? "…" : `${salesTotals.qty} pcs`}</div>
          <div className="card-meta">Dispatch date range</div>
        </div>

        <div className="card">
          <div className="card-label">Sales Value (Tycoon)</div>
          <div className="card-value">
            {salesTotals.loading ? "…" : `₹ ${salesTotals.value.toLocaleString("en-IN")}`}
          </div>
          <div className="card-meta">Qty × dealer rate at order</div>
        </div>

        <div className="card">
          <div className="card-label">Orders Served</div>
          <div className="card-value">{salesTotals.loading ? "…" : salesTotals.ordersServed}</div>
          <div className="card-meta">Unique orders with dispatch in range</div>
        </div>

        <div className="card">
          <div className="card-label">Avg Realisation / Unit</div>
          <div className="card-value">
            {salesTotals.loading
              ? "…"
              : `₹ ${Math.round((salesTotals.value || 0) / Math.max(salesTotals.qty || 0, 1)).toLocaleString("en-IN")}`}
          </div>
          <div className="card-meta">Sales value ÷ qty dispatched</div>
        </div>
      </div>

      {/* SALES CHART */}
      <div className="card-grid" style={{ marginBottom: 18 }}>
        <SalesChartCard dispatchFrom={dispatchFrom} dispatchTo={dispatchTo} />
      </div>

      {/* SALES TABLES */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-label">Sales Tables · Dispatch-based (Tycoon)</div>
        <div className="card-meta">
          Item-wise and category-wise sales in the selected dispatch date range. Excludes spares.
        </div>

        {salesTable.loading ? (
          <div style={{ fontSize: 12, marginTop: 10 }}>Loading…</div>
        ) : (
          <>
            {/* CATEGORY TABLE */}
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Category-wise Sales</div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { key: "value", label: "Sort by value" },
                  { key: "qty", label: "Sort by qty" },
                  { key: "name", label: "Sort by name" },
                ].map((opt) => {
                  const active = salesCatSortBy === (opt.key as any);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSalesCatSortBy(opt.key as any)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid #333",
                        background: active ? "#f5f5f5" : "transparent",
                        color: active ? "#000" : "#f5f5f5",
                        fontSize: 11,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setSalesCatShowAll((v) => !v)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #333",
                    background: "transparent",
                    color: "#f5f5f5",
                    fontSize: 11,
                  }}
                >
                  {salesCatShowAll ? "Show top" : "Show all"}
                </button>

                <button
                  type="button"
                  onClick={downloadSalesCategoriesCsv}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #f5f5f5",
                    background: "#f5f5f5",
                    color: "#000",
                    fontSize: 11,
                  }}
                >
                  Download CSV
                </button>
              </div>
            </div>

            <div className="table-wrapper" style={{ marginTop: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "45%" }}>Category</th>
                    <th>Qty</th>
                    <th>Value</th>
                    <th>Avg / unit</th>
                  </tr>
                </thead>
                <tbody>
                  {salesCatRows.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", padding: 10, fontSize: 13 }}>
                        No sales data in this dispatch range.
                      </td>
                    </tr>
                  )}

                  {salesCatRows.map((r) => {
                    const avg = Math.round((r.value || 0) / Math.max(r.qty || 0, 1));
                    return (
                      <tr key={r.category}>
                        <td>{r.category}</td>
                        <td>{r.qty} pcs</td>
                        <td>₹ {(r.value || 0).toLocaleString("en-IN")}</td>
                        <td>₹ {avg.toLocaleString("en-IN")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ITEM TABLE */}
            <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Item-wise Sales</div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { key: "value", label: "Sort by value" },
                  { key: "qty", label: "Sort by qty" },
                  { key: "name", label: "Sort by name" },
                ].map((opt) => {
                  const active = salesItemSortBy === (opt.key as any);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSalesItemSortBy(opt.key as any)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid #333",
                        background: active ? "#f5f5f5" : "transparent",
                        color: active ? "#000" : "#f5f5f5",
                        fontSize: 11,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setSalesItemShowAll((v) => !v)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #333",
                    background: "transparent",
                    color: "#f5f5f5",
                    fontSize: 11,
                  }}
                >
                  {salesItemShowAll ? "Show top" : "Show all"}
                </button>

                <button
                  type="button"
                  onClick={downloadSalesItemsCsv}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #f5f5f5",
                    background: "#f5f5f5",
                    color: "#000",
                    fontSize: 11,
                  }}
                >
                  Download CSV
                </button>
              </div>
            </div>

            <div className="table-wrapper" style={{ marginTop: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "38%" }}>Item</th>
                    <th style={{ width: "20%" }}>Category</th>
                    <th>Qty</th>
                    <th>Value</th>
                    <th>Avg / unit</th>
                  </tr>
                </thead>
                <tbody>
                  {salesItemRows.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: 10, fontSize: 13 }}>
                        No sales data in this dispatch range.
                      </td>
                    </tr>
                  )}

                  {salesItemRows.map((r) => {
                    const avg = Math.round((r.value || 0) / Math.max(r.qty || 0, 1));
                    return (
                      <tr key={r.item}>
                        <td>{r.item}</td>
                        <td style={{ opacity: 0.85 }}>{r.category}</td>
                        <td>{r.qty} pcs</td>
                        <td>₹ {(r.value || 0).toLocaleString("en-IN")}</td>
                        <td>₹ {avg.toLocaleString("en-IN")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ===================== DEMAND & BACKLOG (ORDER-DATE) ===================== */}
      <div style={{ margin: "22px 0 10px", opacity: 0.85 }}>
        <div style={{ fontSize: 14, letterSpacing: 0.3, fontWeight: 700 }}>
          Demand & Backlog (Order-based)
        </div>
        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>
          Used for production planning. These charts are filtered by order date, not dispatch date.
        </div>
      </div>

      {/* ORDER DATE FILTERS */}
      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ opacity: 0.8 }}>Quick range (order):</span>

          <button type="button" onClick={() => setQuickRangeOrder("all")}
            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #333", background: "transparent", color: "#f5f5f5", fontSize: 11 }}>
            All time
          </button>

          <button type="button" onClick={() => setQuickRangeOrder("thisMonth")}
            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #333", background: "transparent", color: "#f5f5f5", fontSize: 11 }}>
            This month
          </button>

          <button type="button" onClick={() => setQuickRangeOrder("lastMonth")}
            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #333", background: "transparent", color: "#f5f5f5", fontSize: 11 }}>
            Last month
          </button>

          <button type="button" onClick={() => setQuickRangeOrder("last90")}
            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #333", background: "transparent", color: "#f5f5f5", fontSize: 11 }}>
            Last 90 days
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <span style={{ opacity: 0.8 }}>Filter by order date:</span>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>From</span>
            <input type="date" value={orderFrom} onChange={(e) => setOrderFrom(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #333", background: "#050505", color: "#f5f5f5", fontSize: 12 }} />
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>To</span>
            <input type="date" value={orderTo} onChange={(e) => setOrderTo(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #333", background: "#050505", color: "#f5f5f5", fontSize: 12 }} />
          </div>

          {(orderFrom || orderTo) && (
            <button type="button" onClick={() => { setOrderFrom(""); setOrderTo(""); }}
              style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #333", background: "transparent", color: "#f5f5f5", fontSize: 11 }}>
              Clear filter
            </button>
          )}
        </div>
      </div>

      {/* DEMAND SUMMARY CARDS */}
      <div className="card-grid" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-label">Orders Punched</div>
          <div className="card-value">{totalOrders}</div>
          <div className="card-meta">All parties · all statuses · all companies</div>
        </div>

        <div className="card">
          <div className="card-label">Qty Ordered (Tycoon)</div>
          <div className="card-value">{totalQty} pcs</div>
          <div className="card-meta">Excludes spares + uncategorised (demand)</div>
        </div>

        <div className="card">
          <div className="card-label">Order Value (Tycoon)</div>
          <div className="card-value">₹ {totalValue.toLocaleString("en-IN")}</div>
          <div className="card-meta">Excludes spares + uncategorised (demand)</div>
        </div>

        <div className="card">
          <div className="card-label">Data Freshness</div>
          <div className="card-value">{loading ? "Refreshing…" : "Live from Supabase"}</div>
          <div className="card-meta">Reload page to refresh</div>
        </div>
      </div>

      {!hasDemandData && !loading && (
        <div className="card">
          <div className="card-label">No demand data in this order-date range</div>
          <div style={{ fontSize: 13, color: "#ddd" }}>
            Try expanding the order date range or punching some orders.
          </div>
        </div>
      )}

      {hasDemandData && (
        <>
          {/* ROW 1: Item demand + Category demand */}
          <div className="card-grid" style={{ marginBottom: 18, gridTemplateColumns: "1.4fr 1fr" }}>
            <div className="card">
              <div className="card-label">Top Tycoon Items — Ordered vs Dispatched</div>
              <div className="card-meta">Stacked bars: Dispatched + Pending (excludes spares + uncategorised).</div>
              <div style={{ marginTop: 10 }}>
                <VegaLiteChart spec={itemDemandSpec} height={320} />
              </div>
            </div>

            <div className="card">
              <div className="card-label">Demand by Category — Ordered vs Dispatched</div>
              <div className="card-meta">
                Stacked bars: Dispatched + Pending (excludes spares + uncategorised). If noisy we’ll revert.
              </div>
              <div style={{ marginTop: 10 }}>
                <VegaLiteChart spec={categoryDemandSpec} height={320} />
              </div>
            </div>
          </div>

          {/* ROW 2: Pending items + fulfilment bands */}
          <div className="card-grid" style={{ marginBottom: 18, gridTemplateColumns: "1.4fr 1fr" }}>
            <div className="card">
              <div className="card-label">Backlog · Top Pending Items (all companies)</div>
              <div className="card-meta">Focus production on big orange bars first.</div>
              <div style={{ marginTop: 10 }}>
                <VegaLiteChart spec={pendingItemsSpec} height={320} />
              </div>
            </div>

            <div className="card">
              <div className="card-label">Order Fulfilment Bands</div>
              <div className="card-meta">How many orders are almost done vs just started.</div>
              <div style={{ marginTop: 10 }}>
                <VegaLiteChart spec={fulfillmentSpec} height={260} />
              </div>
            </div>
          </div>

          {/* ROW 3: Backlog table */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-label">Backlog Table · Pending by Item</div>
            <div className="card-meta">
              Same data as the backlog chart (all companies), with sorting, filters & export.
            </div>

            {/* Controls */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 8,
                fontSize: 11,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>Sort by:</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { key: "pending", label: "Pending qty" },
                    { key: "pendingPercent", label: "Pending %" },
                    { key: "ordered", label: "Total ordered" },
                  ].map((opt) => {
                    const active = backlogSortBy === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setBacklogSortBy(opt.key as any)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: "1px solid #333",
                          background: active ? "#f5f5f5" : "transparent",
                          color: active ? "#000" : "#f5f5f5",
                          fontSize: 11,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => setBacklogShowAll((v) => !v)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #333",
                    background: "transparent",
                    color: "#f5f5f5",
                    fontSize: 11,
                  }}
                >
                  {backlogShowAll ? "Show top 8" : "Show all items"}
                </button>

                <button
                  type="button"
                  onClick={downloadBacklogCsv}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #f5f5f5",
                    background: "#f5f5f5",
                    color: "#000",
                    fontSize: 11,
                  }}
                >
                  Download CSV
                </button>
              </div>
            </div>

            <div className="table-wrapper" style={{ marginTop: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "45%" }}>Item</th>
                    <th>Pending qty</th>
                    <th>Pending %</th>
                    <th>Total ordered</th>
                  </tr>
                </thead>
                <tbody>
                  {backlogItemsRaw.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", padding: 10, fontSize: 13 }}>
                        No pending backlog · everything is fully dispatched.
                      </td>
                    </tr>
                  )}

                  {backlogRows.map((row) => {
                    const pct = row.pendingPercent ?? 0;
                    const barWidth = Math.max(4, Math.min(pct, 100));
                    const color = pct >= 75 ? "#ef4444" : pct >= 40 ? "#f59e0b" : "#22c55e";

                    return (
                      <tr key={row.item}>
                        <td>{row.item}</td>
                        <td>{row.pending} pcs</td>
                        <td>
                          <div
                            style={{
                              position: "relative",
                              width: "100%",
                              background: "#050505",
                              borderRadius: 999,
                              overflow: "hidden",
                              height: 16,
                              border: "1px solid #222",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${barWidth}%`,
                                background: color,
                              }}
                            />
                            <div
                              style={{
                                position: "relative",
                                fontSize: 11,
                                textAlign: "center",
                                fontWeight: 600,
                                color: "#f9fafb",
                                lineHeight: "16px",
                              }}
                            >
                              {pct}%
                            </div>
                          </div>
                        </td>
                        <td>{row.ordered} pcs</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
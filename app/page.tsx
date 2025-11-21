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
    <div
      ref={containerRef}
      style={{ width: "100%", minHeight: height + 30 }}
    />
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
    items: { name: string | null; category: string | null } | any;
  }[];
};

const PRODUCTION_ACTIVE_STATUSES = [
  "pending",
  "submitted",
  "in_production",
  "packed",
  "partially_dispatched",
  // NOTE: intentionally NOT including 'dispatched', 'cancelled', 'draft'
];

// ---------- DASHBOARD PAGE ----------

export default function DashboardPage() {
  const [orders, setOrders] = useState<OrderWithLines[]>([]);
  const [loading, setLoading] = useState(true);

  // Date filter (YYYY-MM-DD)
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Backlog table controls
  const [backlogSortBy, setBacklogSortBy] = useState<
    "pending" | "pendingPercent" | "ordered"
  >("pending");
  const [backlogShowAll, setBacklogShowAll] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

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
            category
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

  function formatDateLocal(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function setQuickRange(
    mode: "all" | "thisMonth" | "lastMonth" | "last90"
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (mode === "all") {
      setDateFrom("");
      setDateTo("");
      return;
    }

    if (mode === "thisMonth") {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFrom(formatDateLocal(from));
      setDateTo(formatDateLocal(today));
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
      setDateFrom(formatDateLocal(lastMonthStart));
      setDateTo(formatDateLocal(lastMonthEnd));
      return;
    }

    if (mode === "last90") {
      const from = new Date(today);
      from.setDate(from.getDate() - 89);
      setDateFrom(formatDateLocal(from));
      setDateTo(formatDateLocal(today));
      return;
    }
  }

  // ---------- DERIVED STATS (RESPECT DATE RANGE) ----------

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

    // Filter by date
    let filteredOrders = orders;

    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo) : null;

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

    if (filteredOrders.length === 0) {
      return result;
    }

    result.totalOrders = filteredOrders.length;

    // 👇 Compute totalQty & totalValue from order_lines (line_total / rate * qty)
    let grandQty = 0;
    let grandValue = 0;

    for (const o of filteredOrders) {
      const lines = o.order_lines || [];

      const orderQty = lines.reduce((sum, l) => sum + (l.qty ?? 0), 0);

      const orderValue = lines.reduce((sum, l) => {
        const qty = l.qty ?? 0;
        const lineTotal =
          typeof l.line_total === "number"
            ? l.line_total
            : (l.dealer_rate_at_order ?? 0) * qty;
        return sum + lineTotal;
      }, 0);

      grandQty += orderQty;
      grandValue += orderValue;
    }

    result.totalQty = grandQty;
    result.totalValue = grandValue;

    const allLines: {
      itemName: string;
      category: string;
      ordered: number;
      dispatched: number;
      pending: number;
    }[] = [];

    for (const o of filteredOrders) {
      const isProductionActive = PRODUCTION_ACTIVE_STATUSES.includes(
        o.status
      );
      const lines = o.order_lines || [];
      for (const l of lines) {
        const item =
          Array.isArray(l.items) && l.items.length > 0
            ? l.items[0]
            : l.items;

        const name = (item?.name || "Unknown item") as string;
        const category = (item?.category || "Uncategorised") as string;

        const ordered = l.qty ?? 0;

        const raw =
          l.dispatched_qty === "" || l.dispatched_qty == null
            ? 0
            : Number(l.dispatched_qty);
        let dispatched = Number.isNaN(raw) ? 0 : raw;
        if (dispatched < 0) dispatched = 0;
        if (dispatched > ordered) dispatched = ordered;

        // 👇 compute raw pending first
        const pendingRaw = Math.max(ordered - dispatched, 0);

        // 👇 then zero it out for closed statuses
        const pending = isProductionActive ? pendingRaw : 0;

        allLines.push({
          itemName: name,
          category,
          ordered,
          dispatched,
          pending,
        });
      }
    }

    const byItem = new Map<
      string,
      {
        ordered: number;
        dispatched: number;
        pending: number;
        category: string;
      }
    >();

    for (const l of allLines) {
      const catKey =
        l.category && l.category.trim() !== ""
          ? l.category
          : "Uncategorised";

      if (!byItem.has(l.itemName)) {
        byItem.set(l.itemName, {
          ordered: 0,
          dispatched: 0,
          pending: 0,
          category: catKey,
        });
      }

      const agg = byItem.get(l.itemName)!;
      agg.ordered += l.ordered;
      agg.dispatched += l.dispatched;
      agg.pending += l.pending;

      if (agg.category === "Uncategorised" && catKey !== "Uncategorised") {
        agg.category = catKey;
      }
    }

    const itemArray = Array.from(byItem.entries()).map(
      ([item, agg]) => ({
        item,
        ordered: agg.ordered,
        dispatched: agg.dispatched,
        pending: agg.pending,
        category: agg.category,
      })
    );

    // Top 12 by ordered for chart
    result.itemDemandArray = itemArray
      .filter((d) => d.ordered > 0)
      .sort((a, b) => b.ordered - a.ordered)
      .slice(0, 12);

    // Full backlog list
    const backlogItemsRaw = itemArray
      .filter((d) => d.pending > 0)
      .map((d) => ({
        item: d.item,
        pending: d.pending,
        ordered: d.ordered,
        pendingPercent:
          d.ordered > 0
            ? Math.round((d.pending / d.ordered) * 100)
            : 0,
      }));

    result.backlogItemsRaw = backlogItemsRaw;

    // Top 12 pending for chart
    const backlogSortedForChart = [...backlogItemsRaw].sort(
      (a, b) => b.pending - a.pending
    );
    result.itemPendingArray = backlogSortedForChart.slice(0, 12);

    // Aggregate by category
    const byCat = new Map<
      string,
      { ordered: number; dispatched: number; pending: number }
    >();

    for (const l of allLines) {
      const catKey =
        l.category && l.category.trim() !== ""
          ? l.category
          : "Uncategorised";
      if (!byCat.has(catKey)) {
        byCat.set(catKey, {
          ordered: 0,
          dispatched: 0,
          pending: 0,
        });
      }
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

    // Per-order fulfilment
    result.orderFulfillmentArray = filteredOrders.map((o) => {
      const lines = o.order_lines || [];
      const totalOrdered = lines.reduce(
        (sum, l) => sum + (l.qty ?? 0),
        0
      );
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
        totalOrdered > 0
          ? Math.round((totalDispatched / totalOrdered) * 100)
          : 0;

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
  }, [orders, dateFrom, dateTo]);

  // Backlog rows with sorting + top/all
  const backlogRows = useMemo(() => {
    let rows = [...backlogItemsRaw];

    rows.sort((a, b) => {
      if (backlogSortBy === "pending") {
        return b.pending - a.pending;
      } else if (backlogSortBy === "pendingPercent") {
        return (b.pendingPercent ?? 0) - (a.pendingPercent ?? 0);
      } else {
        return b.ordered - a.ordered;
      }
    });

    if (!backlogShowAll) {
      rows = rows.slice(0, 8);
    }

    return rows;
  }, [backlogItemsRaw, backlogSortBy, backlogShowAll]);

  // CSV export
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
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "tycoon-backlog.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- VEGA-LITE SPECS ----------

  const itemDemandSpec = useMemo(
    () => ({
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      description: "Top items by ordered quantity",
      background: "transparent",
      width: "container",
      data: { values: itemDemandArray },
      mark: { type: "bar", tooltip: true, cornerRadiusEnd: 4 },
      encoding: {
        y: {
          field: "item",
          type: "ordinal",
          sort: "-x",
          title: null,
        },
        x: {
          field: "ordered",
          type: "quantitative",
          title: "Ordered qty (pcs)",
        },
        color: {
          value: "#f5f5f5",
        },
        tooltip: [
          { field: "item", title: "Item" },
          { field: "ordered", title: "Ordered pcs" },
          { field: "dispatched", title: "Dispatched pcs" },
          { field: "pending", title: "Pending pcs" },
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
    }),
    [itemDemandArray]
  );

  const categoryDemandSpec = useMemo(
    () => ({
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      description: "Demand by category",
      background: "transparent",
      width: "container",
      data: { values: categoryDemandArray },
      mark: { type: "bar", tooltip: true, cornerRadiusEnd: 2 },
      encoding: {
        x: {
          field: "category",
          type: "ordinal",
          sort: "-y",
          title: null,
        },
        y: {
          field: "ordered",
          type: "quantitative",
          title: "Ordered qty (pcs)",
        },
        color: {
          value: "#a855f7",
        },
        tooltip: [
          { field: "category", title: "Category" },
          { field: "ordered", title: "Ordered pcs" },
          { field: "dispatched", title: "Dispatched pcs" },
          { field: "pending", title: "Pending pcs" },
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
    }),
    [categoryDemandArray]
  );

  const pendingItemsSpec = useMemo(
    () => ({
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      description: "Top pending items",
      background: "transparent",
      width: "container",
      data: { values: itemPendingArray },
      mark: { type: "bar", tooltip: true, cornerRadiusEnd: 4 },
      encoding: {
        y: {
          field: "item",
          type: "ordinal",
          sort: "-x",
          title: null,
        },
        x: {
          field: "pending",
          type: "quantitative",
          title: "Pending qty (pcs)",
        },
        color: {
          value: "#f97316",
        },
        tooltip: [
          { field: "item", title: "Item" },
          { field: "pending", title: "Pending pcs" },
          { field: "ordered", title: "Total ordered" },
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
      description: "Orders by fulfilment band",
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
        y: {
          field: "count",
          type: "quantitative",
          title: "Orders",
        },
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
        axis: {
          labelColor: "#e5e5e5",
          titleColor: "#e5e5e5",
          gridColor: "#262626",
        },
      },
    }),
    [fulfillmentBands]
  );

  const hasData = totalOrders > 0;

  // ---------- RENDER ----------

  return (
    <>
      <h1 className="section-title">Tycoon Dashboard</h1>
      <p className="section-subtitle">
        Live snapshot of demand, backlog and fulfilment across all Tycoon orders.
      </p>

      {/* DATE FILTERS */}
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 12,
        }}
      >
        {/* Quick selectors */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            alignItems: "center",
          }}
        >
          <span style={{ opacity: 0.8 }}>Quick range:</span>

          <button
            type="button"
            onClick={() => setQuickRange("all")}
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
            onClick={() => setQuickRange("thisMonth")}
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
            onClick={() => setQuickRange("lastMonth")}
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
            onClick={() => setQuickRange("last90")}
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
        </div>

        {/* Manual From/To inputs */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span style={{ opacity: 0.8 }}>Filter by order date:</span>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
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
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
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

          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
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

      {/* SUMMARY CARDS */}
      <div className="card-grid" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-label">Total Orders</div>
          <div className="card-value">{totalOrders}</div>
          <div className="card-meta">
            All parties · all statuses
          </div>
        </div>

        <div className="card">
          <div className="card-label">Total Qty Ordered</div>
          <div className="card-value">{totalQty} pcs</div>
          <div className="card-meta">Sum of all order lines</div>
        </div>

        <div className="card">
          <div className="card-label">Total Order Value</div>
          <div className="card-value">
            ₹ {totalValue.toLocaleString("en-IN")}
          </div>
          <div className="card-meta">Calculated from line totals</div>
        </div>

        <div className="card">
          <div className="card-label">Data Freshness</div>
          <div className="card-value">
            {loading ? "Refreshing…" : "Live from Supabase"}
          </div>
          <div className="card-meta">Reload page to refresh</div>
        </div>
      </div>

      {!hasData && !loading && (
        <div className="card">
          <div className="card-label">No data in this range</div>
          <div style={{ fontSize: 13, color: "#ddd" }}>
            Try expanding the date range or punching some orders.
          </div>
        </div>
      )}

      {hasData && (
        <>
          {/* ROW 1: Item demand + Category demand */}
          <div
            className="card-grid"
            style={{ marginBottom: 18, gridTemplateColumns: "1.4fr 1fr" }}
          >
            <div className="card">
              <div className="card-label">Top Items by Demand</div>
              <div className="card-meta">
                Hover bars · menu → export PNG/SVG.
              </div>
              <div style={{ marginTop: 10 }}>
                <VegaLiteChart spec={itemDemandSpec} height={320} />
              </div>
            </div>

            <div className="card">
              <div className="card-label">Demand by Category</div>
              <div className="card-meta">
                Uses your item categories (jeep, medium jeep, bike, etc.).
              </div>
              <div style={{ marginTop: 10 }}>
                <VegaLiteChart spec={categoryDemandSpec} height={320} />
              </div>
            </div>
          </div>

          {/* ROW 2: Pending items + fulfilment bands */}
          <div
            className="card-grid"
            style={{ marginBottom: 18, gridTemplateColumns: "1.4fr 1fr" }}
          >
            <div className="card">
              <div className="card-label">Backlog · Top Pending Items</div>
              <div className="card-meta">
                Focus production on big orange bars first.
              </div>
              <div style={{ marginTop: 10 }}>
                <VegaLiteChart spec={pendingItemsSpec} height={320} />
              </div>
            </div>

            <div className="card">
              <div className="card-label">Order Fulfilment Bands</div>
              <div className="card-meta">
                How many orders are almost done vs just started.
              </div>
              <div style={{ marginTop: 10 }}>
                <VegaLiteChart spec={fulfillmentSpec} height={260} />
              </div>
            </div>
          </div>

          {/* ROW 3: Backlog table */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-label">Backlog Table · Pending by Item</div>
            <div className="card-meta">
              Same data as the backlog chart, with sorting, filters & export.
            </div>

            {/* Controls: sort + show all + CSV */}
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
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
                        onClick={() =>
                          setBacklogSortBy(opt.key as any)
                        }
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
                      <td
                        colSpan={4}
                        style={{
                          textAlign: "center",
                          padding: 10,
                          fontSize: 13,
                        }}
                      >
                        No pending backlog · everything is fully dispatched.
                      </td>
                    </tr>
                  )}

                  {backlogRows.map((row) => {
                    const pct = row.pendingPercent ?? 0;
                    const barWidth = Math.max(
                      4,
                      Math.min(pct, 100)
                    );
                    const color =
                      pct >= 75
                        ? "#ef4444"
                        : pct >= 40
                        ? "#f59e0b"
                        : "#22c55e";

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
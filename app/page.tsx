// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import VegaLiteChart from "@/components/VegaLiteChart";

type OrderWithLines = {
  id: string;
  order_date: string;
  status: string;
  total_qty: number | null;
  total_value: number | null;
  order_lines: {
    qty: number | null;
    dispatched_qty: number | null | string;
    items: { name: string | null; category: string | null } | any;
  }[];
};

export default function DashboardPage() {
  const [orders, setOrders] = useState<OrderWithLines[]>([]);
  const [loading, setLoading] = useState(true);

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

  // ---------- DERIVED STATS ----------

  const {
    totalOrders,
    totalQty,
    totalValue,
    itemDemandArray,
    itemPendingArray,
    categoryDemandArray,
    orderFulfillmentArray,
    backlogTopItems,
  } = useMemo(() => {
    const result = {
      totalOrders: 0,
      totalQty: 0,
      totalValue: 0,
      itemDemandArray: [] as any[],
      itemPendingArray: [] as any[],
      categoryDemandArray: [] as any[],
      orderFulfillmentArray: [] as any[],
      backlogTopItems: [] as any[],
    };

    if (!orders || orders.length === 0) return result;

    result.totalOrders = orders.length;
    result.totalQty = orders.reduce(
      (sum, o) => sum + (o.total_qty ?? 0),
      0
    );
    result.totalValue = orders.reduce(
      (sum, o) => sum + Number(o.total_value ?? 0),
      0
    );

    // Flatten all lines
    const allLines: {
      itemName: string;
      category: string;
      ordered: number;
      dispatched: number;
      pending: number;
    }[] = [];

    for (const o of orders) {
      const lines = o.order_lines || [];
      for (const l of lines) {
        const item =
          Array.isArray(l.items) && l.items.length > 0
            ? l.items[0]
            : l.items;

        const name =
          (item?.name || "Unknown item") as string;
        const category =
          (item?.category || "Uncategorised") as string;

        const ordered = l.qty ?? 0;

        const raw =
          l.dispatched_qty === "" || l.dispatched_qty == null
            ? 0
            : Number(l.dispatched_qty);
        let dispatched = Number.isNaN(raw) ? 0 : raw;
        if (dispatched < 0) dispatched = 0;
        if (dispatched > ordered) dispatched = ordered;

        const pending = Math.max(ordered - dispatched, 0);

        allLines.push({ itemName: name, category, ordered, dispatched, pending });
      }
    }

    // Aggregate by item
    const byItem = new Map<
      string,
      { ordered: number; dispatched: number; pending: number }
    >();
    for (const l of allLines) {
      if (!byItem.has(l.itemName)) {
        byItem.set(l.itemName, {
          ordered: 0,
          dispatched: 0,
          pending: 0,
        });
      }
      const agg = byItem.get(l.itemName)!;
      agg.ordered += l.ordered;
      agg.dispatched += l.dispatched;
      agg.pending += l.pending;
    }

    const itemArray = Array.from(byItem.entries()).map(
      ([item, agg]) => ({
        item,
        ordered: agg.ordered,
        dispatched: agg.dispatched,
        pending: agg.pending,
      })
    );

    // Top 12 by ordered
    result.itemDemandArray = itemArray
      .filter((d) => d.ordered > 0)
      .sort((a, b) => b.ordered - a.ordered)
      .slice(0, 12);

    // Top 12 by pending
    result.itemPendingArray = itemArray
      .filter((d) => d.pending > 0)
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 12);

    result.backlogTopItems = result.itemPendingArray
      .slice(0, 8)
      .map((d) => ({
        item: d.item,
        pending: d.pending,
        ordered: d.ordered,
        pendingPercent:
          d.ordered > 0
            ? Math.round((d.pending / d.ordered) * 100)
            : 0,
      }));

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
    result.orderFulfillmentArray = orders.map((o) => {
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
  }, [orders]);

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
          value: "#f5f5f5", // light bar on dark bg
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
          value: "#a855f7", // accent color
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
          value: "#f97316", // orange backlog
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

  // ---------- RENDER ----------

  const hasData = orders.length > 0;

  return (
    <>
      <h1 className="section-title">Tycoon Dashboard</h1>
      <p className="section-subtitle">
        Live snapshot of demand, backlog and fulfilment across all Tycoon orders.
      </p>

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
          <div className="card-meta">From all orders</div>
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
          <div className="card-label">No data yet</div>
          <div style={{ fontSize: 13, color: "#ddd" }}>
            Punch some orders first, then come back here to see demand and fulfilment charts.
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
                Hover bars · right-click menu → export PNG/SVG.
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
              Same data as the backlog chart, but in table form for exact planning.
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
                  {backlogTopItems.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
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

                  {backlogTopItems.map((row) => {
                    const pct = row.pendingPercent ?? 0;
                    const isHigh = pct >= 50 && row.pending > 0;

                    return (
                      <tr key={row.item}>
                        <td>{row.item}</td>
                        <td>{row.pending} pcs</td>
                        <td
                          style={{
                            color: isHigh ? "#ef4444" : "#e5e5e5",
                            fontWeight: isHigh ? 600 : 400,
                          }}
                        >
                          {pct}%
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
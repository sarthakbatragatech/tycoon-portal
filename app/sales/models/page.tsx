// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import useThemeMode from "@/app/_components/useThemeMode";
import VegaLiteChart from "@/components/VegaLiteChart";
import { supabase } from "@/lib/supabase";

function isSpareCategory(cat: string) {
  const c = (cat || "").trim().toLowerCase();
  return c === "spare" || c === "spares" || c === "spare parts" || c === "spare part";
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

type ModelRow = {
  model: string;
  category: string;
  qty: number;
  value: number;
  ordersCount: number;
  customersCount: number;
  avgRealisation: number;
};

type TrendPoint = {
  date: string;
  model: string;
  qty: number;
  value: number;
  customer_breakdown: string;
};

type CategoryRow = {
  category: string;
  qty: number;
  value: number;
};

type TrendSelectorSlot = {
  id: string;
  enabled: boolean;
  model: string;
};

const CUSTOM_TREND_SLOT_COUNT = 3;

function createEmptyTrendSlots(): TrendSelectorSlot[] {
  return Array.from({ length: CUSTOM_TREND_SLOT_COUNT }, (_, index) => ({
    id: `custom-model-${index}`,
    enabled: false,
    model: "",
  }));
}

export default function ModelSalesPage() {
  const themeMode = useThemeMode();
  const [dispatchFrom, setDispatchFrom] = useState("");
  const [dispatchTo, setDispatchTo] = useState("");
  const [rangeReady, setRangeReady] = useState(false);

  const [modelRows, setModelRows] = useState<ModelRow[]>([]);
  const [trendRows, setTrendRows] = useState<TrendPoint[]>([]);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenTopTrendModels, setHiddenTopTrendModels] = useState<string[]>([]);
  const [customTrendSlots, setCustomTrendSlots] = useState<TrendSelectorSlot[]>(() => createEmptyTrendSlots());

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
    loadModelAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchFrom, dispatchTo, rangeReady]);

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
    }
  }

  async function loadModelAnalytics() {
    setLoading(true);
    setError(null);

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
              name,
              category,
              company
            ),
            orders:order_id (
              party_id,
              parties:party_id (
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
      console.error("Error loading model analytics", result.error);
      setModelRows([]);
      setTrendRows([]);
      setCategoryRows([]);
      setError("Could not load model analytics.");
      setLoading(false);
      return;
    }

    const byModel = new Map<
      string,
      {
        model: string;
        category: string;
        qty: number;
        value: number;
        orders: Set<string>;
        customers: Set<string>;
      }
    >();

    const byCategory = new Map<string, { category: string; qty: number; value: number }>();
    const byTrend = new Map<
      string,
      {
        date: string;
        model: string;
        qty: number;
        value: number;
        customers: Map<string, number>;
      }
    >();

    (result.data || []).forEach((row: any) => {
      const qty = Number(row?.dispatched_qty ?? 0);
      if (!qty || qty <= 0) return;

      const line = row?.order_lines;
      const item = safeFirst(line?.items);
      if ((item?.company || "") !== "Tycoon") return;

      const category = (item?.category || "").trim();
      if (isSpareCategory(category)) return;

      const model = (item?.name || "Unknown model").trim();
      const order = safeFirst(line?.orders);
      const customer = safeFirst(order?.parties);
      const orderId = line?.order_id;
      const customerId = order?.party_id || "";
      const customerName = (customer?.name || "Unknown customer").trim();
      const value = qty * Number(line?.dealer_rate_at_order ?? 0);
      const categoryKey = category || "Uncategorised";

      if (!byModel.has(model)) {
        byModel.set(model, {
          model,
          category: categoryKey,
          qty: 0,
          value: 0,
          orders: new Set<string>(),
          customers: new Set<string>(),
        });
      }

      const modelAgg = byModel.get(model)!;
      modelAgg.qty += qty;
      modelAgg.value += value;
      if (orderId) modelAgg.orders.add(orderId);
      if (customerId) modelAgg.customers.add(customerId);

      if (!byCategory.has(categoryKey)) {
        byCategory.set(categoryKey, { category: categoryKey, qty: 0, value: 0 });
      }
      const categoryAgg = byCategory.get(categoryKey)!;
      categoryAgg.qty += qty;
      categoryAgg.value += value;

      const date = String(row?.dispatched_at || "").slice(0, 10);
      if (!date) return;

      const trendKey = `${date}__${model}`;
      if (!byTrend.has(trendKey)) {
        byTrend.set(trendKey, {
          date,
          model,
          qty: 0,
          value: 0,
          customers: new Map<string, number>(),
        });
      }
      const trendAgg = byTrend.get(trendKey)!;
      trendAgg.qty += qty;
      trendAgg.value += value;
      trendAgg.customers.set(customerName, (trendAgg.customers.get(customerName) || 0) + qty);
    });

    const models = Array.from(byModel.values())
      .map((row) => ({
        model: row.model,
        category: row.category,
        qty: row.qty,
        value: row.value,
        ordersCount: row.orders.size,
        customersCount: row.customers.size,
        avgRealisation: row.qty > 0 ? Math.round(row.value / row.qty) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    const categories = Array.from(byCategory.values()).sort((a, b) => b.value - a.value);
    const trends = Array.from(byTrend.values())
      .map((row) => ({
        date: row.date,
        model: row.model,
        qty: row.qty,
        value: row.value,
        customer_breakdown: Array.from(row.customers.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([customerName, customerQty]) => `${customerName}: ${customerQty}`)
          .join(" | "),
      }))
      .sort((a, b) =>
        a.date === b.date ? a.model.localeCompare(b.model) : a.date.localeCompare(b.date)
      );

    setModelRows(models);
    setCategoryRows(categories);
    setTrendRows(trends);
    setLoading(false);
  }

  function downloadModelsCsv() {
    if (!modelRows.length) {
      alert("No model data to export.");
      return;
    }

    downloadCsv(
      "tycoon-model-sales.csv",
      ["Model", "Category", "Revenue", "QtyPcs", "Orders", "Customers", "AvgRealisation"],
      modelRows.map((row) => [
        row.model,
        row.category,
        row.value,
        row.qty,
        row.ordersCount,
        row.customersCount,
        row.avgRealisation,
      ])
    );
  }

  const totals = useMemo(() => {
    const qty = modelRows.reduce((sum, row) => sum + row.qty, 0);
    const value = modelRows.reduce((sum, row) => sum + row.value, 0);
    return {
      qty,
      value,
      models: modelRows.length,
      avgRealisation: qty > 0 ? Math.round(value / qty) : 0,
    };
  }, [modelRows]);

  const topByQty = useMemo(() => [...modelRows].sort((a, b) => b.qty - a.qty).slice(0, 12), [modelRows]);
  const topByRevenue = useMemo(() => [...modelRows].sort((a, b) => b.value - a.value).slice(0, 12), [modelRows]);
  const topTrendModels = useMemo(() => topByQty.slice(0, 5).map((row) => row.model), [topByQty]);
  const trendModelOptions = useMemo(() => modelRows.map((row) => row.model), [modelRows]);
  const activeTrendModels = useMemo(() => {
    const selected = new Set<string>();

    topTrendModels.forEach((model) => {
      if (!hiddenTopTrendModels.includes(model)) {
        selected.add(model);
      }
    });

    customTrendSlots.forEach((slot) => {
      if (slot.enabled && slot.model) {
        selected.add(slot.model);
      }
    });

    return Array.from(selected);
  }, [customTrendSlots, hiddenTopTrendModels, topTrendModels]);
  const visibleTrends = useMemo(
    () => trendRows.filter((row) => activeTrendModels.includes(row.model)),
    [activeTrendModels, trendRows]
  );

  useEffect(() => {
    setHiddenTopTrendModels((prev) => prev.filter((model) => topTrendModels.includes(model)));
  }, [topTrendModels]);

  useEffect(() => {
    setCustomTrendSlots((prev) =>
      prev.map((slot) =>
        !slot.model || trendModelOptions.includes(slot.model)
          ? slot
          : {
              ...slot,
              enabled: false,
              model: "",
            }
      )
    );
  }, [trendModelOptions]);

  const rangeLabel = useMemo(() => {
    if (!dispatchFrom && !dispatchTo) return "All time";
    if (dispatchFrom && dispatchTo) return `${dispatchFrom} → ${dispatchTo}`;
    if (dispatchFrom && !dispatchTo) return `From ${dispatchFrom}`;
    if (!dispatchFrom && dispatchTo) return `Up to ${dispatchTo}`;
    return "All time";
  }, [dispatchFrom, dispatchTo]);

  const topQtySpec = useMemo(() => {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      background: "transparent",
      width: "container",
      height: 320,
      data: { values: topByQty },
      mark: { type: "bar", cornerRadiusEnd: 6, tooltip: true },
      encoding: {
        y: {
          field: "model",
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
          field: "qty",
          type: "quantitative",
          title: "Qty (pcs)",
          axis: {
            labelColor: chartTheme.axisLabel,
            titleColor: chartTheme.axisLabel,
            gridColor: chartTheme.grid,
            domainColor: chartTheme.line,
            tickColor: chartTheme.line,
          },
        },
        color: { value: "#38bdf8" },
        tooltip: [
          { field: "model", title: "Model" },
          { field: "qty", title: "Qty (pcs)" },
          { field: "value", title: "Revenue (₹)", format: ",.0f" },
          { field: "customersCount", title: "Customers" },
        ],
      },
      config: { view: { stroke: "transparent" } },
    };
  }, [chartTheme, topByQty]);

  const topRevenueSpec = useMemo(() => {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      background: "transparent",
      width: "container",
      height: 320,
      data: { values: topByRevenue },
      mark: { type: "bar", cornerRadiusEnd: 6, tooltip: true },
      encoding: {
        y: {
          field: "model",
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
          title: "Revenue (₹)",
          axis: {
            labelColor: chartTheme.axisLabel,
            titleColor: chartTheme.axisLabel,
            gridColor: chartTheme.grid,
            domainColor: chartTheme.line,
            tickColor: chartTheme.line,
            format: "~s",
          },
        },
        color: { value: "#f59e0b" },
        tooltip: [
          { field: "model", title: "Model" },
          { field: "value", title: "Revenue (₹)", format: ",.0f" },
          { field: "qty", title: "Qty (pcs)" },
          { field: "avgRealisation", title: "Avg realisation / unit", format: ",.0f" },
        ],
      },
      config: { view: { stroke: "transparent" } },
    };
  }, [chartTheme, topByRevenue]);

  const modelTrendSpec = useMemo(() => {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      background: "transparent",
      width: "container",
      height: 320,
      data: { values: visibleTrends },
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
          },
        },
        y: {
          field: "qty",
          type: "quantitative",
          title: "Qty (pcs)",
          axis: {
            labelColor: chartTheme.axisLabel,
            titleColor: chartTheme.axisLabel,
            gridColor: chartTheme.grid,
            domainColor: chartTheme.line,
            tickColor: chartTheme.line,
          },
        },
        color: {
          field: "model",
          type: "nominal",
          legend: {
            labelColor: chartTheme.axisLabel,
            titleColor: chartTheme.axisLabel,
            title: "Selected models",
          },
        },
        tooltip: [
          { field: "model", title: "Model" },
          { field: "date", type: "temporal", title: "Dispatch date" },
          { field: "qty", title: "Qty (pcs)" },
          { field: "value", title: "Revenue (₹)", format: ",.0f" },
          { field: "customer_breakdown", title: "Customers (qty)" },
        ],
      },
      config: { view: { stroke: "transparent" } },
    };
  }, [chartTheme, visibleTrends]);

  const categoryRevenueSpec = useMemo(() => {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      background: "transparent",
      width: "container",
      height: 300,
      data: { values: categoryRows.slice(0, 10) },
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
          legend: {
            title: "Category",
            labelColor: chartTheme.axisLabel,
            titleColor: chartTheme.axisLabel,
            orient: "right",
          },
          scale: { scheme: "tableau10" },
        },
        order: {
          field: "value",
          type: "quantitative",
          sort: "descending",
        },
        tooltip: [
          { field: "category", title: "Category" },
          { field: "value", title: "Revenue (₹)", format: ",.0f" },
          { field: "qty", title: "Qty (pcs)" },
        ],
      },
      config: { view: { stroke: "transparent" } },
    };
  }, [categoryRows, chartTheme]);

  function toggleTopTrendModel(model: string, enabled: boolean) {
    setHiddenTopTrendModels((prev) => {
      if (enabled) {
        return prev.filter((entry) => entry !== model);
      }
      return prev.includes(model) ? prev : [...prev, model];
    });
  }

  function updateCustomTrendSlot(slotId: string, updates: Partial<TrendSelectorSlot>) {
    setCustomTrendSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== slotId) return slot;
        const next = { ...slot, ...updates };
        if (!next.model) {
          next.enabled = false;
        }
        return next;
      })
    );
  }

  function resetTrendSelection() {
    setHiddenTopTrendModels([]);
    setCustomTrendSlots(createEmptyTrendSlots());
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 className="section-title">Model Analysis</h1>
          <div className="section-subtitle" style={{ marginTop: 6 }}>
            Dispatch-based model analytics · Tycoon only · excludes spares.
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>● Live from Supabase</div>
        </div>

        <button
          type="button"
          onClick={downloadModelsCsv}
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid var(--text-primary)",
            background: "var(--text-primary)",
            color: "var(--nav-active-text)",
            fontSize: 12,
            fontWeight: 700,
            height: 36,
            whiteSpace: "nowrap",
          }}
        >
          Download Models CSV
        </button>
      </div>

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
              border: "1px solid var(--input-border)",
              background: "transparent",
              color: "var(--text-primary)",
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
              border: "1px solid var(--input-border)",
              background: "transparent",
              color: "var(--text-primary)",
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
              border: "1px solid var(--input-border)",
              background: "transparent",
              color: "var(--text-primary)",
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
              border: "1px solid var(--input-border)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 11,
            }}
          >
            Last 90 days
          </button>

          <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.65 }}>
            Range: <b style={{ opacity: 0.9 }}>{rangeLabel}</b>
          </span>
        </div>

        <div style={{ fontSize: 11, opacity: 0.68 }}>
          Trend charts are based on dated dispatch events, so they focus on actual dispatch timing.
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
                border: "1px solid var(--input-border)",
                background: "var(--surface-plain)",
                color: "var(--text-primary)",
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
                border: "1px solid var(--input-border)",
                background: "var(--surface-plain)",
                color: "var(--text-primary)",
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
                border: "1px solid var(--input-border)",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 11,
              }}
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      <div className="card-grid" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-label">Qty Dispatched</div>
          <div className="card-value">{loading ? "…" : `${totals.qty} pcs`}</div>
          <div className="card-meta">Across all Tycoon models in range</div>
        </div>

        <div className="card">
          <div className="card-label">Revenue</div>
          <div className="card-value">{loading ? "…" : `₹ ${totals.value.toLocaleString("en-IN")}`}</div>
          <div className="card-meta">Dispatch qty × dealer rate</div>
        </div>

        <div className="card">
          <div className="card-label">Models Sold</div>
          <div className="card-value">{loading ? "…" : totals.models}</div>
          <div className="card-meta">Unique models with dispatch in range</div>
        </div>

        <div className="card">
          <div className="card-label">Avg Realisation / Unit</div>
          <div className="card-value">{loading ? "…" : `₹ ${totals.avgRealisation.toLocaleString("en-IN")}`}</div>
          <div className="card-meta">Revenue ÷ qty dispatched</div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-label">Error</div>
          <div style={{ fontSize: 13, color: "#fbbf24" }}>{error}</div>
        </div>
      )}

      {!error && (
        <>
          <div className="stacked-sections">
            <div className="card stacked-card">
              <div className="card-label">Top Selling Models by Quantity</div>
              <div className="card-meta">Which models are moving the most units in the selected range.</div>
              {loading ? (
                <div style={{ fontSize: 12, marginTop: 10 }}>Loading…</div>
              ) : topByQty.length === 0 ? (
                <div style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>No model dispatches found in this range.</div>
              ) : (
                <div className="chart-panel chart-panel-full">
                  <VegaLiteChart spec={topQtySpec} height={420} />
                </div>
              )}
            </div>

            <div className="card stacked-card">
              <div className="card-label">Top Selling Models by Revenue</div>
              <div className="card-meta">Which models are contributing the most revenue.</div>
              {loading ? (
                <div style={{ fontSize: 12, marginTop: 10 }}>Loading…</div>
              ) : topByRevenue.length === 0 ? (
                <div style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>No model revenue found in this range.</div>
              ) : (
                <div className="chart-panel chart-panel-full">
                  <VegaLiteChart spec={topRevenueSpec} height={420} />
                </div>
              )}
            </div>

            <div className="card stacked-card">
              <div className="card-label">Model Trends Over Time</div>
              <div className="card-meta">
                Daily quantity trend. Top 5 models by quantity are enabled by default, and you can remove them or add other models below.
              </div>

              {trendModelOptions.length > 0 && (
                <div className="selector-panel">
                  <div className="selector-grid">
                    {topTrendModels.map((model) => {
                      const enabled = !hiddenTopTrendModels.includes(model);
                      return (
                        <label key={model} className="selector-row">
                          <input
                            type="checkbox"
                            className="selector-checkbox"
                            checked={enabled}
                            onChange={(e) => toggleTopTrendModel(model, e.target.checked)}
                          />
                          <span className="selector-label">{model}</span>
                        </label>
                      );
                    })}

                    {customTrendSlots.map((slot, index) => (
                      <div key={slot.id} className="selector-row">
                        <input
                          type="checkbox"
                          className="selector-checkbox"
                          checked={slot.enabled}
                          onChange={(e) =>
                            updateCustomTrendSlot(slot.id, {
                              enabled: e.target.checked && !!slot.model,
                            })
                          }
                        />
                        <select
                          className="selector-select"
                          value={slot.model}
                          onChange={(e) =>
                            updateCustomTrendSlot(slot.id, {
                              model: e.target.value,
                              enabled: e.target.value ? slot.enabled || true : false,
                            })
                          }
                        >
                          <option value="">Add another model #{index + 1}</option>
                          {trendModelOptions.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="selector-actions">
                    <div style={{ fontSize: 11, opacity: 0.68 }}>
                      Selected: <b style={{ opacity: 0.95 }}>{activeTrendModels.length}</b>
                    </div>

                    <button
                      type="button"
                      onClick={resetTrendSelection}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--input-border)",
                        background: "transparent",
                        color: "var(--text-primary)",
                        fontSize: 11,
                      }}
                    >
                      Reset to top 5
                    </button>
                  </div>
                </div>
              )}

              {loading ? (
                <div style={{ fontSize: 12, marginTop: 10 }}>Loading…</div>
              ) : activeTrendModels.length === 0 ? (
                <div style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>Select at least one model to view the trend chart.</div>
              ) : visibleTrends.length === 0 ? (
                <div style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>No dated trend data found in this range.</div>
              ) : (
                <div className="chart-panel chart-panel-full">
                  <VegaLiteChart spec={modelTrendSpec} height={380} />
                </div>
              )}
            </div>

            <div className="card stacked-card">
              <div className="card-label">Revenue by Category</div>
              <div className="card-meta">A quick read on which product categories are driving value.</div>
              {loading ? (
                <div style={{ fontSize: 12, marginTop: 10 }}>Loading…</div>
              ) : categoryRows.length === 0 ? (
                <div style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>No category sales found in this range.</div>
              ) : (
                <div className="chart-panel chart-panel-full">
                  <VegaLiteChart spec={categoryRevenueSpec} height={340} />
                </div>
              )}
            </div>

            <div className="card stacked-card">
              <div className="card-label">Model Performance Table</div>
              <div className="card-meta">
                Use this to compare quantity, revenue, customer spread, and realised value per unit.
              </div>

              {loading ? (
                <div style={{ fontSize: 12, marginTop: 10 }}>Loading…</div>
              ) : modelRows.length === 0 ? (
                <div style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>No model sales found in this range.</div>
              ) : (
                <div className="table-wrapper" style={{ marginTop: 10 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: "28%" }}>Model</th>
                        <th style={{ width: "16%" }}>Category</th>
                        <th>Revenue (₹)</th>
                        <th>Qty (pcs)</th>
                        <th>Customers</th>
                        <th>Orders</th>
                        <th>Avg Realisation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelRows.slice(0, 40).map((row) => (
                        <tr key={row.model}>
                          <td style={{ fontWeight: 800 }}>{row.model}</td>
                          <td>{row.category}</td>
                          <td>₹ {Math.round(row.value).toLocaleString("en-IN")}</td>
                          <td>{row.qty.toLocaleString("en-IN")}</td>
                          <td>{row.customersCount}</td>
                          <td>{row.ordersCount}</td>
                          <td>₹ {row.avgRealisation.toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

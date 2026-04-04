// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/app/_components/AuthProvider";
import useThemeMode from "@/app/_components/useThemeMode";
import { supabase } from "@/lib/supabase";
import { getStatusColor, getStatusLabel } from "@/lib/constants/status";

type RawOrder = {
  id: string;
  order_code: string | null;
  order_date: string | null;
  expected_dispatch_date: string | null;
  status: string | null;
  remarks: string | null;
  total_value: number | null;
  parties?: any;
  order_lines?: any[];
};

type ViewerDispatchOrder = {
  id: string;
  order_code: string | null;
  order_date: string | null;
  expected_dispatch_date: string | null;
  status: string | null;
  remarks: string | null;
  party_name: string | null;
  city: string | null;
  ordered_qty: number | null;
  dispatched_qty: number | null;
  pending_qty: number | null;
  pending_lines: number | null;
  fulfillment_pct: number | null;
  items?: PlanningItem[];
};

type PlanningItem = {
  name: string;
  category: string;
  ordered: number;
  dispatched: number;
  pending: number;
};

type PlanningOrder = {
  id: string;
  orderCode: string;
  partyName: string;
  city: string;
  orderDate: string | null;
  orderDateLabel: string;
  expectedDispatchDate: string | null;
  expectedDispatchLabel: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  remarks: string;
  totalValue: number;
  orderedQty: number;
  dispatchedQty: number;
  pendingQty: number;
  pendingLines: number;
  urgencyBucket: "overdue" | "today" | "week" | "later" | "unscheduled";
  urgencyLabel: string;
  urgencySort: number;
  overdueDays: number;
  fulfillmentPct: number;
  items: PlanningItem[];
};

const ACTIVE_STATUSES = [
  "submitted",
  "pending",
  "in_production",
  "packed",
  "partially_dispatched",
];

const BUCKET_META = {
  overdue: {
    title: "Overdue",
    subtitle: "Past expected dispatch date",
    border: "#ef4444",
    bg: "rgba(239, 68, 68, 0.08)",
  },
  today: {
    title: "Today",
    subtitle: "Expected today",
    border: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.08)",
  },
  week: {
    title: "Next 7 Days",
    subtitle: "Due soon",
    border: "#38bdf8",
    bg: "rgba(56, 189, 248, 0.08)",
  },
  later: {
    title: "Later",
    subtitle: "Planned beyond 7 days",
    border: "#22c55e",
    bg: "rgba(34, 197, 94, 0.08)",
  },
  unscheduled: {
    title: "No Date",
    subtitle: "Needs dispatch planning",
    border: "#a855f7",
    bg: "rgba(168, 85, 247, 0.08)",
  },
} as const;

function safeFirst(rel: any) {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

function safeNumber(v: any) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function formatDateLabel(dateStr?: string | null) {
  if (!dateStr) return "No date";
  const d = parseISODateLocal(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function parseISODateLocal(dateStr?: string | null) {
  if (!dateStr) return new Date("");
  const [year, month, day] = String(dateStr).split("-").map(Number);
  if (!year || !month || !day) return new Date(dateStr);
  return new Date(year, month - 1, day);
}

function formatDateISO(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function getFirstWorkingDateOfMonth(date: Date) {
  const probe = new Date(date.getFullYear(), date.getMonth(), 1);
  while (probe.getDay() === 0) {
    probe.setDate(probe.getDate() + 1);
  }
  return probe;
}

function getTodayLocal() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getUrgencyMeta(expectedDispatchDate?: string | null) {
  if (!expectedDispatchDate) {
    return { bucket: "unscheduled" as const, label: "No expected dispatch date", sort: 4, overdueDays: 0 };
  }

  const today = getTodayLocal();
  const target = parseISODateLocal(expectedDispatchDate);
  if (Number.isNaN(target.getTime())) {
    return { bucket: "unscheduled" as const, label: "No expected dispatch date", sort: 4, overdueDays: 0 };
  }

  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return {
      bucket: "overdue" as const,
      label: `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`,
      sort: 0,
      overdueDays: Math.abs(diffDays),
    };
  }

  if (diffDays === 0) {
    return { bucket: "today" as const, label: "Due today", sort: 1, overdueDays: 0 };
  }

  if (diffDays <= 7) {
    return {
      bucket: "week" as const,
      label: `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`,
      sort: 2,
      overdueDays: 0,
    };
  }

  return {
    bucket: "later" as const,
    label: `Due in ${diffDays} days`,
    sort: 3,
    overdueDays: 0,
  };
}

export default function DispatchPlanningPage() {
  const auth = useAuthContext();
  const themeMode = useThemeMode();
  const isViewOnly = auth?.role !== "admin";
  const today = getTodayLocal();
  const todayISO = formatDateISO(today);
  const [orders, setOrders] = useState<PlanningOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"urgency" | "pending" | "value">("urgency");
  const [viewMode, setViewMode] = useState<"agenda" | "calendar" | "board">("calendar");
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 768
  );
  const [calendarMonth, setCalendarMonth] = useState(() => formatMonthKey(today));
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const [movingOrderId, setMovingOrderId] = useState<string | null>(null);

  const uiTheme = useMemo(
    () =>
      themeMode === "light"
        ? {
            cardBg: "rgba(255, 252, 246, 0.96)",
            cardSoftBg: "rgba(255, 248, 240, 0.86)",
            remarkBg: "rgba(23, 23, 23, 0.05)",
            dashedBorder: "1px dashed rgba(23,23,23,0.12)",
            dayCellBg: "rgba(255, 252, 246, 0.95)",
            dayCellTodayBg: "rgba(23, 23, 23, 0.05)",
            dayCellWeekendBg: "rgba(23, 23, 23, 0.035)",
            dayCellMutedBg: "rgba(23, 23, 23, 0.02)",
            laneFade: "rgba(255, 252, 246, 0.96)",
          }
        : {
            cardBg: "rgba(5, 5, 5, 0.92)",
            cardSoftBg: "rgba(255,255,255,0.04)",
            remarkBg: "rgba(255,255,255,0.04)",
            dashedBorder: "1px dashed rgba(255,255,255,0.06)",
            dayCellBg: "rgba(5, 5, 5, 0.82)",
            dayCellTodayBg: "rgba(245,245,245,0.06)",
            dayCellWeekendBg: "rgba(255,255,255,0.03)",
            dayCellMutedBg: "rgba(255,255,255,0.02)",
            laneFade: "rgba(5, 5, 5, 0.96)",
          },
    [themeMode]
  );

  function mapViewerOrders(rows: ViewerDispatchOrder[]) {
    return (rows || [])
      .map((order) => {
        const urgency = getUrgencyMeta(order.expected_dispatch_date);
        const items = Array.isArray(order.items)
          ? order.items.map((item) => ({
              name: item.name,
              category: item.category,
              ordered: safeNumber(item.ordered),
              dispatched: safeNumber(item.dispatched),
              pending: safeNumber(item.pending),
            }))
          : [];

        return {
          id: order.id,
          orderCode: order.order_code || order.id.slice(0, 8),
          partyName: order.party_name || "Unknown customer",
          city: order.city || "",
          orderDate: order.order_date,
          orderDateLabel: formatDateLabel(order.order_date),
          expectedDispatchDate: order.expected_dispatch_date,
          expectedDispatchLabel: formatDateLabel(order.expected_dispatch_date),
          status: order.status || "pending",
          statusLabel: getStatusLabel(order.status),
          statusColor: getStatusColor(order.status),
          remarks: (order.remarks || "").trim(),
          totalValue: 0,
          orderedQty: safeNumber(order.ordered_qty),
          dispatchedQty: safeNumber(order.dispatched_qty),
          pendingQty: safeNumber(order.pending_qty),
          pendingLines: safeNumber(order.pending_lines),
          urgencyBucket: urgency.bucket,
          urgencyLabel: urgency.label,
          urgencySort: urgency.sort,
          overdueDays: urgency.overdueDays,
          fulfillmentPct: safeNumber(order.fulfillment_pct),
          items,
        } satisfies PlanningOrder;
      })
      .filter((order) => order.pendingQty > 0);
  }

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

  useEffect(() => {
    setViewMode((current) => {
      if (isMobileViewport && current === "calendar") return "agenda";
      if (!isMobileViewport && current === "agenda") return "calendar";
      return current;
    });
  }, [isMobileViewport]);

  async function loadPlanningOrders() {
    setLoading(true);
    setError(null);

    if (isViewOnly) {
      const { data, error } = await supabase.rpc("viewer_dispatch_orders");

      if (error) {
        console.error("Error loading viewer dispatch planning board", error);
        setOrders([]);
        setError("Could not load dispatch planning data.");
        setLoading(false);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      setOrders(mapViewerOrders(rows as ViewerDispatchOrder[]));
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_code,
        order_date,
        expected_dispatch_date,
        status,
        remarks,
        total_value,
        parties (
          name,
          city
        ),
        order_lines (
          qty,
          dispatched_qty,
          dealer_rate_at_order,
          items (
            name,
            category
          )
        )
      `
      )
      .in("status", ACTIVE_STATUSES)
      .order("expected_dispatch_date", { ascending: true, nullsFirst: false })
      .order("order_date", { ascending: true });

    if (error) {
      console.error("Error loading dispatch planning board", error);
      setOrders([]);
      setError("Could not load dispatch planning data.");
      setLoading(false);
      return;
    }

    const mapped = ((data || []) as RawOrder[])
      .map((order) => {
        const party = safeFirst(order.parties);
        const items: PlanningItem[] = (order.order_lines || [])
          .map((line: any) => {
            const item = safeFirst(line?.items);
            const ordered = safeNumber(line?.qty);
            let dispatched = safeNumber(line?.dispatched_qty);
            if (dispatched < 0) dispatched = 0;
            if (dispatched > ordered) dispatched = ordered;
            const pending = Math.max(ordered - dispatched, 0);

            return {
              name: (item?.name || "Unknown item").trim(),
              category: (item?.category || "Uncategorised").trim() || "Uncategorised",
              ordered,
              dispatched,
              pending,
            };
          })
          .filter((line) => line.pending > 0)
          .sort((a, b) => b.pending - a.pending);

        const orderedQty = items.reduce((sum, line) => sum + line.ordered, 0);
        const dispatchedQty = items.reduce((sum, line) => sum + line.dispatched, 0);
        const pendingQty = items.reduce((sum, line) => sum + line.pending, 0);
        const urgency = getUrgencyMeta(order.expected_dispatch_date);
        const totalValue =
          safeNumber(order.total_value) ||
          (order.order_lines || []).reduce((sum: number, line: any) => {
            const qty = safeNumber(line?.qty);
            return sum + qty * safeNumber(line?.dealer_rate_at_order);
          }, 0);

        return {
          id: order.id,
          orderCode: order.order_code || order.id.slice(0, 8),
          partyName: party?.name || "Unknown customer",
          city: party?.city || "",
          orderDate: order.order_date,
          orderDateLabel: formatDateLabel(order.order_date),
          expectedDispatchDate: order.expected_dispatch_date,
          expectedDispatchLabel: formatDateLabel(order.expected_dispatch_date),
          status: order.status || "pending",
          statusLabel: getStatusLabel(order.status),
          statusColor: getStatusColor(order.status),
          remarks: (order.remarks || "").trim(),
          totalValue,
          orderedQty,
          dispatchedQty,
          pendingQty,
          pendingLines: items.length,
          urgencyBucket: urgency.bucket,
          urgencyLabel: urgency.label,
          urgencySort: urgency.sort,
          overdueDays: urgency.overdueDays,
          fulfillmentPct: orderedQty > 0 ? Math.round((dispatchedQty / orderedQty) * 100) : 0,
          items,
        } satisfies PlanningOrder;
      })
      .filter((order) => order.pendingQty > 0);

    setOrders(mapped);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadPlanningOrders();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isViewOnly]);

  useEffect(() => {
    if (!isViewOnly) return;
    if (sortBy === "value") {
      setSortBy("urgency");
    }
  }, [isViewOnly, sortBy]);

  useEffect(() => {
    if (!draggingOrderId) return;

    let frameId = 0;
    let scrollDelta = 0;
    const edgeThreshold = 140;
    const maxStep = 22;

    const stopAutoScroll = () => {
      scrollDelta = 0;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }
    };

    const tick = () => {
      if (!scrollDelta) {
        frameId = 0;
        return;
      }

      window.scrollBy({ top: scrollDelta, behavior: "auto" });
      frameId = window.requestAnimationFrame(tick);
    };

    const handleDragOver = (event: DragEvent) => {
      const viewportHeight = window.innerHeight;
      let nextDelta = 0;

      if (event.clientY < edgeThreshold) {
        const ratio = (edgeThreshold - event.clientY) / edgeThreshold;
        nextDelta = -Math.ceil(ratio * maxStep);
      } else if (event.clientY > viewportHeight - edgeThreshold) {
        const ratio = (event.clientY - (viewportHeight - edgeThreshold)) / edgeThreshold;
        nextDelta = Math.ceil(ratio * maxStep);
      }

      scrollDelta = nextDelta;

      if (scrollDelta && !frameId) {
        frameId = window.requestAnimationFrame(tick);
      } else if (!scrollDelta && frameId) {
        stopAutoScroll();
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", stopAutoScroll);
    window.addEventListener("dragend", stopAutoScroll);

    return () => {
      stopAutoScroll();
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", stopAutoScroll);
      window.removeEventListener("dragend", stopAutoScroll);
    };
  }, [draggingOrderId]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    const rows = orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (bucketFilter !== "all" && order.urgencyBucket !== bucketFilter) return false;

      if (!query) return true;

      const haystack = [
        order.orderCode,
        order.partyName,
        order.city,
        order.statusLabel,
        ...order.items.map((item) => item.name),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });

    rows.sort((a, b) => {
      if (sortBy === "pending") return b.pendingQty - a.pendingQty || a.urgencySort - b.urgencySort;
      if (sortBy === "value") return b.totalValue - a.totalValue || a.urgencySort - b.urgencySort;

      if (a.urgencySort !== b.urgencySort) return a.urgencySort - b.urgencySort;
      if (a.expectedDispatchDate && b.expectedDispatchDate) {
        return a.expectedDispatchDate.localeCompare(b.expectedDispatchDate);
      }
      if (a.expectedDispatchDate) return -1;
      if (b.expectedDispatchDate) return 1;
      return b.pendingQty - a.pendingQty;
    });

    return rows;
  }, [bucketFilter, orders, search, sortBy, statusFilter]);

  const summary = useMemo(() => {
    return {
      orders: filteredOrders.length,
      pendingQty: filteredOrders.reduce((sum, order) => sum + order.pendingQty, 0),
      overdueOrders: filteredOrders.filter((order) => order.urgencyBucket === "overdue").length,
      dueThisWeek: filteredOrders.filter(
        (order) => order.urgencyBucket === "today" || order.urgencyBucket === "week"
      ).length,
    };
  }, [filteredOrders]);

  const grouped = useMemo(() => {
    const initial: Record<PlanningOrder["urgencyBucket"], PlanningOrder[]> = {
      overdue: [],
      today: [],
      week: [],
      later: [],
      unscheduled: [],
    };

    filteredOrders.forEach((order) => {
      initial[order.urgencyBucket].push(order);
    });

    return initial;
  }, [filteredOrders]);

  const statusOptions = [
    { value: "all", label: "All active statuses" },
    ...ACTIVE_STATUSES.map((status) => ({
      value: status,
      label: getStatusLabel(status),
    })),
  ];

  const scheduledByDate = useMemo(() => {
    const map = new Map<string, PlanningOrder[]>();

    filteredOrders.forEach((order) => {
      if (!order.expectedDispatchDate) return;
      if (!map.has(order.expectedDispatchDate)) {
        map.set(order.expectedDispatchDate, []);
      }
      map.get(order.expectedDispatchDate)!.push(order);
    });

    map.forEach((rows) => {
      rows.sort((a, b) => b.pendingQty - a.pendingQty || a.partyName.localeCompare(b.partyName));
    });

    return map;
  }, [filteredOrders]);

  const unscheduledOrders = useMemo(
    () => filteredOrders.filter((order) => order.urgencyBucket === "unscheduled"),
    [filteredOrders]
  );

  const overdueOrders = useMemo(
    () => filteredOrders.filter((order) => order.urgencyBucket === "overdue"),
    [filteredOrders]
  );

  const calendarMonthDate = useMemo(() => parseISODateLocal(calendarMonth), [calendarMonth]);

  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth(), 1);
    const daysInMonth = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() + 1, 0).getDate();
    const monthDates = Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(firstOfMonth);
      date.setDate(index + 1);
      return date;
    }).filter((date) => date.getDay() !== 0);

    const firstVisibleDate = monthDates[0] || firstOfMonth;
    const firstDayIndex = Math.max(firstVisibleDate.getDay() - 1, 0);
    const trailingDays = (6 - ((firstDayIndex + monthDates.length) % 6)) % 6;

    const leadingCells = Array.from({ length: firstDayIndex }, (_, index) => ({
      iso: `blank-start-${index}`,
      date: null,
      dayOfMonth: null,
      inMonth: false,
      isToday: false,
      isWeekend: false,
      isPlaceholder: true,
      orders: [],
      pendingQty: 0,
      totalValue: 0,
    }));

    const monthCells = monthDates.map((date) => {
      const iso = formatDateISO(date);
      const rows = scheduledByDate.get(iso) || [];
      const pendingQty = rows.reduce((sum, order) => sum + order.pendingQty, 0);
      const totalValue = rows.reduce((sum, order) => sum + order.totalValue, 0);
      const isWeekend = date.getDay() === 6;

      return {
        iso,
        date,
        dayOfMonth: date.getDate(),
        inMonth: true,
        isToday: iso === todayISO,
        isWeekend,
        isPlaceholder: false,
        orders: rows,
        pendingQty,
        totalValue,
      };
    });

    const trailingCells = Array.from({ length: trailingDays }, (_, index) => ({
      iso: `blank-end-${index}`,
      date: null,
      dayOfMonth: null,
      inMonth: false,
      isToday: false,
      isWeekend: false,
      isPlaceholder: true,
      orders: [],
      pendingQty: 0,
      totalValue: 0,
    }));

    return [...leadingCells, ...monthCells, ...trailingCells];
  }, [calendarMonthDate, scheduledByDate, todayISO]);

  const activeSelectedDate = useMemo(() => {
    const selected = parseISODateLocal(selectedDate);
    const sameMonth =
      !Number.isNaN(selected.getTime()) &&
      selected.getFullYear() === calendarMonthDate.getFullYear() &&
      selected.getMonth() === calendarMonthDate.getMonth() &&
      selected.getDay() !== 0;

    if (sameMonth) return selectedDate;

    const todayDate = parseISODateLocal(todayISO);
    if (
      todayDate.getFullYear() === calendarMonthDate.getFullYear() &&
      todayDate.getMonth() === calendarMonthDate.getMonth() &&
      todayDate.getDay() !== 0
    ) {
      return todayISO;
    }

    return formatDateISO(getFirstWorkingDateOfMonth(calendarMonthDate));
  }, [calendarMonthDate, selectedDate, todayISO]);

  const selectedDayOrders = useMemo(
    () => scheduledByDate.get(activeSelectedDate) || [],
    [activeSelectedDate, scheduledByDate]
  );

  const selectedDaySummary = useMemo(() => {
    return {
      orders: selectedDayOrders.length,
      pendingQty: selectedDayOrders.reduce((sum, order) => sum + order.pendingQty, 0),
      totalValue: selectedDayOrders.reduce((sum, order) => sum + order.totalValue, 0),
    };
  }, [selectedDayOrders]);

  const isAgendaView = isMobileViewport && viewMode === "agenda";

  async function moveOrderToDate(orderId: string, nextDate: string) {
    if (isViewOnly) return;

    const order = orders.find((entry) => entry.id === orderId);
    if (!order || movingOrderId) return;
    if (order.expectedDispatchDate === nextDate) {
      setDraggingOrderId(null);
      setDropTargetDate(null);
      return;
    }

    setMovingOrderId(orderId);

    const previousDateLabel = order.expectedDispatchLabel;
    const nextDateLabel = formatDateLabel(nextDate);
    const nextUrgency = getUrgencyMeta(nextDate);

    const { error: updateError } = await supabase
      .from("orders")
      .update({ expected_dispatch_date: nextDate })
      .eq("id", orderId);

    if (updateError) {
      console.error("Error updating dispatch plan date", updateError);
      alert(`Could not move order: ${updateError.message}`);
      setMovingOrderId(null);
      setDraggingOrderId(null);
      setDropTargetDate(null);
      return;
    }

    const message = `Dispatch plan moved: ${previousDateLabel} → ${nextDateLabel}.`;

    await supabase.from("order_logs").insert([{ order_id: orderId, message }]);

    setOrders((prev) =>
      prev.map((entry) =>
        entry.id !== orderId
          ? entry
          : {
              ...entry,
              expectedDispatchDate: nextDate,
              expectedDispatchLabel: nextDateLabel,
              urgencyBucket: nextUrgency.bucket,
              urgencyLabel: nextUrgency.label,
              urgencySort: nextUrgency.sort,
              overdueDays: nextUrgency.overdueDays,
            }
      )
    );

    setSelectedDate(nextDate);
    setCalendarMonth(formatMonthKey(parseISODateLocal(nextDate)));
    setMovingOrderId(null);
    setDraggingOrderId(null);
    setDropTargetDate(null);
  }

  function handleDragStart(orderId: string) {
    if (isViewOnly) return;
    setDraggingOrderId(orderId);
  }

  function handleDragEnd() {
    if (isViewOnly) return;
    setDraggingOrderId(null);
    setDropTargetDate(null);
  }

  function goToMonth(offset: number) {
    setCalendarMonth(formatMonthKey(addMonths(calendarMonthDate, offset)));
  }

  function jumpToToday() {
    setCalendarMonth(formatMonthKey(today));
    setSelectedDate(todayISO);
  }

  function shiftSelectedDate(offset: number) {
    const base = parseISODateLocal(activeSelectedDate || todayISO);
    if (Number.isNaN(base.getTime())) return;

    const nextDate = addDays(base, offset);
    const nextISO = formatDateISO(nextDate);
    setSelectedDate(nextISO);
    setCalendarMonth(formatMonthKey(nextDate));
  }

  function renderCompactOrderCard(order: PlanningOrder, tone: "dark" | "soft" = "dark") {
    return (
      <div
        key={order.id}
        draggable={!isViewOnly}
        onDragStart={isViewOnly ? undefined : () => handleDragStart(order.id)}
        onDragEnd={isViewOnly ? undefined : handleDragEnd}
        onClick={() => {
          if (order.expectedDispatchDate) {
            setSelectedDate(order.expectedDispatchDate);
            setCalendarMonth(formatMonthKey(parseISODateLocal(order.expectedDispatchDate)));
          }
        }}
        style={{
          borderRadius: 12,
          border: "1px solid var(--surface-border)",
          background: tone === "soft" ? uiTheme.cardSoftBg : uiTheme.cardBg,
          padding: "8px 10px",
          cursor: isViewOnly ? "pointer" : "grab",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1.25,
              whiteSpace: "normal",
              overflowWrap: "anywhere",
            }}
          >
            {order.partyName}
          </div>
          <div
            style={{
              fontSize: 10,
              opacity: 0.7,
              marginTop: 4,
              fontWeight: 600,
            }}
          >
            {order.pendingQty} pcs
          </div>
        </div>
      </div>
    );
  }

  function renderFullOrderCard(order: PlanningOrder) {
    const leadItem = order.items[0]?.name || "Pending items";
    const extraItems = Math.max(order.items.length - 1, 0);

    return (
      <div
        key={order.id}
        draggable={!isViewOnly}
        onDragStart={isViewOnly ? undefined : () => handleDragStart(order.id)}
        onDragEnd={isViewOnly ? undefined : handleDragEnd}
        className="dispatch-order-card"
        style={{
          borderRadius: 14,
          border: "1px solid var(--surface-border)",
          background: uiTheme.cardBg,
          padding: 12,
        }}
      >
        <div className="dispatch-order-card-header">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{order.partyName}</div>
            <div
              style={{
                fontSize: 11,
                opacity: 0.65,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {order.city ? `${order.city} · ` : ""}
              {leadItem}
              {extraItems > 0 ? ` +${extraItems}` : ""}
            </div>
          </div>

          <div
            style={{
              borderRadius: 999,
              padding: "4px 8px",
              border: `1px solid ${order.statusColor}`,
              color: order.statusColor,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              whiteSpace: "nowrap",
            }}
          >
            {order.statusLabel}
          </div>
        </div>

        <div className="dispatch-order-card-meta-grid">
          <div>
            <div style={{ opacity: 0.6, marginBottom: 2 }}>Expected</div>
            <div>{order.expectedDispatchLabel}</div>
          </div>
          <div>
            <div style={{ opacity: 0.6, marginBottom: 2 }}>Order date</div>
            <div>{order.orderDateLabel}</div>
          </div>
          <div>
            <div style={{ opacity: 0.6, marginBottom: 2 }}>Pending</div>
            <div style={{ fontWeight: 700 }}>{order.pendingQty.toLocaleString("en-IN")} pcs</div>
          </div>
          <div>
            <div style={{ opacity: 0.6, marginBottom: 2 }}>Fulfilment</div>
            <div>{order.fulfillmentPct}%</div>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.78 }}>{order.urgencyLabel}</div>

        <div style={{ marginTop: 10 }}>
          <div className="card-label" style={{ marginBottom: 8 }}>
            Top Pending Items
          </div>
          <div className="dispatch-order-card-items">
            {order.items.slice(0, 3).map((item) => (
              <div
                key={`${order.id}-${item.name}`}
                className="dispatch-order-card-item"
              >
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.name}
                </span>
                <span style={{ whiteSpace: "nowrap" }}>{item.pending} pcs</span>
              </div>
            ))}
          </div>
        </div>

        {order.remarks && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              borderRadius: 10,
              background: uiTheme.remarkBg,
              fontSize: 11,
              opacity: 0.85,
            }}
          >
            {order.remarks}
          </div>
        )}

        <div className="dispatch-order-card-footer">
          <div style={{ fontSize: 11, opacity: 0.65 }}>
            {isViewOnly ? (
              <>
                {order.pendingLines} pending line
                {order.pendingLines === 1 ? "" : "s"}
              </>
            ) : (
              <>
                ₹ {Math.round(order.totalValue).toLocaleString("en-IN")} · {order.pendingLines} pending line
                {order.pendingLines === 1 ? "" : "s"}
              </>
            )}
          </div>

          <Link
            href={`/orders/${order.id}`}
            className="dispatch-order-card-link"
            style={{
              background: "transparent",
            }}
          >
            Open order
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="section-title">Dispatch Planning</h1>
          <div className="section-subtitle page-header-subtitle">
            Pending orders grouped by expected dispatch date so the team can plan today, this week, and what is slipping.
          </div>
          <div className="page-header-note">Live from Supabase</div>
        </div>

        <div className="page-header-actions">
          <button
            type="button"
            onClick={loadPlanningOrders}
            className="action-button primary"
          >
            Refresh Board
          </button>
        </div>
      </div>

      <div className="card-grid" style={{ marginBottom: 18, marginTop: 14 }}>
        <div className="card">
          <div className="card-label">Orders To Plan</div>
          <div className="card-value">{loading ? "…" : summary.orders}</div>
          <div className="card-meta">Active orders with pending qty</div>
        </div>

        <div className="card">
          <div className="card-label">Pending Qty</div>
          <div className="card-value">{loading ? "…" : `${summary.pendingQty.toLocaleString("en-IN")} pcs`}</div>
          <div className="card-meta">Undispatched units still open</div>
        </div>

        <div className="card">
          <div className="card-label">Overdue Orders</div>
          <div className="card-value">{loading ? "…" : summary.overdueOrders}</div>
          <div className="card-meta">Expected date already missed</div>
        </div>

        <div className="card">
          <div className="card-label">Due This Week</div>
          <div className="card-value">{loading ? "…" : summary.dueThisWeek}</div>
          <div className="card-meta">Today + next 7 days</div>
        </div>
      </div>

      <div
        className="card responsive-control-grid dispatch-controls"
        style={{
          marginBottom: 18,
        }}
      >
        <div>
          <div className="card-label">Search</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, order code, or item"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--input-border)",
              background: "var(--surface-plain)",
              color: "var(--text-primary)",
              fontSize: 13,
            }}
          />
        </div>

        <div>
          <div className="card-label">View</div>
          <div className="inline-actions-row">
            {(isMobileViewport
              ? [
                  { value: "agenda", label: "Agenda" },
                  { value: "calendar", label: "Calendar" },
                  { value: "board", label: "Board" },
                ]
              : [
                  { value: "calendar", label: "Calendar" },
                  { value: "board", label: "Board" },
                ]
            ).map((option) => {
              const active = viewMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setViewMode(option.value as "agenda" | "calendar" | "board")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: active ? "1px solid var(--text-primary)" : "1px solid var(--input-border)",
                    background: active ? "var(--text-primary)" : "var(--surface-plain)",
                    color: active ? "var(--nav-active-text)" : "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="card-label">Status</div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--input-border)",
              background: "var(--surface-plain)",
              color: "var(--text-primary)",
              fontSize: 13,
            }}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="card-label">Lane</div>
          <select
            value={bucketFilter}
            onChange={(e) => setBucketFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--input-border)",
              background: "var(--surface-plain)",
              color: "var(--text-primary)",
              fontSize: 13,
            }}
          >
            <option value="all">All lanes</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="week">Next 7 days</option>
            <option value="later">Later</option>
            <option value="unscheduled">No date</option>
          </select>
        </div>

        <div>
          <div className="card-label">Sort</div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "urgency" | "pending" | "value")}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--input-border)",
              background: "var(--surface-plain)",
              color: "var(--text-primary)",
              fontSize: 13,
            }}
          >
            <option value="urgency">Urgency</option>
            <option value="pending">Pending qty</option>
            {!isViewOnly && <option value="value">Order value</option>}
          </select>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-label">Error</div>
          <div style={{ color: "#fbbf24", fontSize: 13 }}>{error}</div>
        </div>
      )}

      {loading ? (
        <div className="card">
          <div className="card-label">Loading</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Building dispatch board…</div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="card">
          <div className="card-label">No Orders</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            No active pending orders matched the current filters.
          </div>
        </div>
      ) : isAgendaView ? (
        <div className="stacked-sections">
          <div className="card">
            <div className="card-label">Planning Agenda</div>
            <div className="card-meta">
              Mobile view focuses on one working day at a time so planning stays readable without sideways scrolling.
            </div>

            <div className="dispatch-agenda-controls">
              <div className="dispatch-agenda-nav">
                <button
                  type="button"
                  onClick={() => shiftSelectedDate(-1)}
                  className="action-button small secondary"
                >
                  Previous day
                </button>
                <button
                  type="button"
                  onClick={() => shiftSelectedDate(1)}
                  className="action-button small secondary"
                >
                  Next day
                </button>
                <button
                  type="button"
                  onClick={jumpToToday}
                  className="action-button small secondary"
                >
                  Today
                </button>
              </div>

              <label className="dispatch-agenda-date-picker">
                <span className="card-meta" style={{ opacity: 0.85 }}>Jump to date</span>
                <input
                  type="date"
                  value={activeSelectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setCalendarMonth(formatMonthKey(parseISODateLocal(e.target.value)));
                  }}
                  className="compact-input"
                />
              </label>
            </div>
          </div>

          <div className="card">
            <div className="card-label">Selected Day</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{formatDateLabel(activeSelectedDate)}</div>
            <div className="card-meta" style={{ marginTop: 4 }}>
              {selectedDaySummary.orders} orders · {selectedDaySummary.pendingQty.toLocaleString("en-IN")} pcs pending
              {!isViewOnly && (
                <>
                  {" "}· ₹ {Math.round(selectedDaySummary.totalValue).toLocaleString("en-IN")}
                </>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {selectedDayOrders.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.68 }}>
                  {isViewOnly ? "No orders planned for this date." : "No orders planned for this date. Use the Board view to place unscheduled orders."}
                </div>
              ) : (
                selectedDayOrders.map((order) => renderFullOrderCard(order))
              )}
            </div>
          </div>

            <div className="card" style={{ borderColor: BUCKET_META.unscheduled.border }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div>
                  <div className="card-label">Unscheduled</div>
                <div className="card-meta">
                  {isViewOnly ? "Pending orders without a dispatch date." : "Switch to Board view to drag these onto a date."}
                </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{unscheduledOrders.length}</div>
              </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {unscheduledOrders.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.65 }}>No unscheduled pending orders.</div>
              ) : (
                unscheduledOrders.slice(0, 10).map((order) => renderCompactOrderCard(order, "soft"))
              )}
            </div>
          </div>

          <div className="card" style={{ borderColor: BUCKET_META.overdue.border }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div>
                <div className="card-label">Overdue Watchlist</div>
                <div className="card-meta">Most urgent orders to pull forward.</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{overdueOrders.length}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {overdueOrders.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.65 }}>Nothing overdue right now.</div>
              ) : (
                overdueOrders.slice(0, 10).map((order) => renderCompactOrderCard(order, "soft"))
              )}
            </div>
          </div>
        </div>
      ) : viewMode === "calendar" ? (
        <div className="responsive-two-panel">
          <div className="card" style={{ padding: 12 }}>
            <div className="dispatch-calendar-header">
              <div>
                <div className="card-label" style={{ color: "var(--text-primary)" }}>
                  Monthly Calendar
                </div>
                <div className="card-meta">
                  {isViewOnly ? "Read-only calendar of pending dispatch orders." : "Drag order cards onto a date to reschedule them."}
                </div>
              </div>

              <div className="dispatch-calendar-actions">
                <button
                  type="button"
                  onClick={() => goToMonth(-1)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--input-border)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 11,
                  }}
                >
                  Prev
                </button>
                <div className="dispatch-calendar-month-label">
                  {formatMonthLabel(calendarMonthDate)}
                </div>
                <button
                  type="button"
                  onClick={() => goToMonth(1)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--input-border)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 11,
                  }}
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={jumpToToday}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--input-border)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 11,
                  }}
                >
                  Today
                </button>
              </div>
            </div>

            <div className="calendar-scroll-area">
              <div
                className="calendar-grid-min"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div
                    key={day}
                    style={{
                      padding: "8px 10px",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      color: "var(--text-muted)",
                    }}
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div
                className="calendar-grid-min"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {calendarDays.map((day) => {
                if (day.isPlaceholder) {
                  return (
                    <div
                      key={day.iso}
                      style={{
                        minHeight: 132,
                        borderRadius: 14,
                        border: uiTheme.dashedBorder,
                        background: "transparent",
                      }}
                    />
                  );
                }

                const isSelected = day.iso === activeSelectedDate;
                const isDropTarget = day.iso === dropTargetDate;
                return (
                  <div
                    key={day.iso}
                    onClick={() => setSelectedDate(day.iso)}
                    onDragOver={
                      isViewOnly
                        ? undefined
                        : (e) => {
                            e.preventDefault();
                            setDropTargetDate(day.iso);
                          }
                    }
                    onDragLeave={
                      isViewOnly
                        ? undefined
                        : () => {
                            if (dropTargetDate === day.iso) setDropTargetDate(null);
                          }
                    }
                    onDrop={
                      isViewOnly
                        ? undefined
                        : (e) => {
                            e.preventDefault();
                            if (draggingOrderId) {
                              moveOrderToDate(draggingOrderId, day.iso);
                            }
                          }
                    }
                    style={{
                      minHeight: 132,
                      borderRadius: 14,
                      border: isDropTarget
                        ? "1px solid #38bdf8"
                        : isSelected
                        ? "1px solid var(--text-primary)"
                        : "1px solid var(--surface-border)",
                      background: !day.inMonth
                        ? uiTheme.dayCellMutedBg
                        : day.isToday
                        ? uiTheme.dayCellTodayBg
                        : day.isWeekend
                        ? uiTheme.dayCellWeekendBg
                        : uiTheme.dayCellBg,
                      padding: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, opacity: day.inMonth ? 1 : 0.45 }}>
                        {day.dayOfMonth}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, opacity: 0.62 }}>{day.orders.length} orders</div>
                        <div style={{ fontSize: 10, fontWeight: 700 }}>{day.pendingQty} pcs</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
                      {day.orders.slice(0, 3).map((order) => renderCompactOrderCard(order))}
                      {day.orders.length > 3 && (
                        <div style={{ fontSize: 10, opacity: 0.6 }}>+ {day.orders.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          </div>

          <div className="responsive-sidebar-stack">
            <div className="card">
              <div className="card-label">Selected Day</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{formatDateLabel(activeSelectedDate)}</div>
              <div className="card-meta" style={{ marginTop: 4 }}>
                {selectedDaySummary.orders} orders · {selectedDaySummary.pendingQty.toLocaleString("en-IN")} pcs pending
                {!isViewOnly && (
                  <>
                    {" "}· ₹ {Math.round(selectedDaySummary.totalValue).toLocaleString("en-IN")}
                  </>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                {selectedDayOrders.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.68 }}>
                    {isViewOnly ? "No orders planned for this date." : "No orders planned for this date. Drop a card here to schedule it."}
                  </div>
                ) : (
                  selectedDayOrders.map((order) => renderFullOrderCard(order))
                )}
              </div>
            </div>

            <div className="card" style={{ borderColor: BUCKET_META.unscheduled.border }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div>
                  <div className="card-label">Unscheduled</div>
                  <div className="card-meta">
                    {isViewOnly ? "Pending orders without a dispatch date." : "Drag these onto any date."}
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{unscheduledOrders.length}</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {unscheduledOrders.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.65 }}>No unscheduled pending orders.</div>
                ) : (
                  unscheduledOrders.slice(0, 10).map((order) => renderCompactOrderCard(order, "soft"))
                )}
              </div>
            </div>

            <div className="card" style={{ borderColor: BUCKET_META.overdue.border }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div>
                  <div className="card-label">Overdue Watchlist</div>
                  <div className="card-meta">Most urgent orders to pull forward.</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{overdueOrders.length}</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {overdueOrders.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.65 }}>Nothing overdue right now.</div>
                ) : (
                  overdueOrders.slice(0, 10).map((order) => renderCompactOrderCard(order, "soft"))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="dispatch-board-grid">
          {(Object.keys(BUCKET_META) as PlanningOrder["urgencyBucket"][]).map((bucket) => {
            const config = BUCKET_META[bucket];
            const rows = grouped[bucket];

            return (
              <div
                key={bucket}
                className="card"
                style={{
                  padding: 12,
                  borderColor: config.border,
                  background: `linear-gradient(180deg, ${config.bg} 0%, ${uiTheme.laneFade} 24%)`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <div className="card-label" style={{ color: "var(--text-primary)" }}>
                      {config.title}
                    </div>
                    <div className="card-meta">{config.subtitle}</div>
                  </div>
                  <div
                    style={{
                      minWidth: 28,
                      height: 28,
                      borderRadius: 999,
                      border: `1px solid ${config.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {rows.length}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                  {rows.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.65 }}>Nothing in this lane.</div>
                  ) : (
                    rows.map((order) => renderFullOrderCard(order))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

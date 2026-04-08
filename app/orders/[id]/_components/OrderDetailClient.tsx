// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/constants/status";
import { getTodayISO } from "@/lib/utils/date";

import OrderDetailView from "./OrderDetailView";
import { exportOrderPdf } from "@/lib/features/order-export/pdf";
import { buildOrderWhatsAppText, openWhatsAppShare } from "@/lib/features/order-export/whatsapp";

export default function OrderDetailClient() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<any | null>(null);
  const [originalLines, setOriginalLines] = useState<any[]>([]);
  const [originalStatus, setOriginalStatus] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [dispatchEvents, setDispatchEvents] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  const [orderRemarks, setOrderRemarks] = useState("");
  const [savingRemarks, setSavingRemarks] = useState(false);

  const [savingDispatch, setSavingDispatch] = useState(false);

  const [savingStatus, setSavingStatus] = useState(false);

  const [expectedDispatch, setExpectedDispatch] = useState("");
  const [savingExpectedDate, setSavingExpectedDate] = useState(false);

  const [dispatchDate, setDispatchDate] = useState(getTodayISO());
  const [dispatchedToday, setDispatchedToday] = useState<Record<string, string>>({});
  const [undoingDispatchEventId, setUndoingDispatchEventId] = useState<string | null>(null);

  // Add new line
  const [items, setItems] = useState<any[]>([]);
  const [addingLine, setAddingLine] = useState(false);
  const [newLineItemId, setNewLineItemId] = useState("");
  const [newLineQty, setNewLineQty] = useState("");
  const [newLineRate, setNewLineRate] = useState("");
  const [newLineNote, setNewLineNote] = useState("");
  const [savingNewLine, setSavingNewLine] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadOrder(), loadItems(), loadLogs(), loadDispatchEvents()]);
    setLoading(false);
  }

  async function loadOrder() {
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
        total_qty,
        total_value,
        parties ( name, city ),
        order_lines (
          id,
          qty,
          dispatched_qty,
          dealer_rate_at_order,
          line_total,
          line_remarks,
          items ( name, category )
        )
      `
      )
      .eq("id", orderId)
      .single();

    if (error) {
      console.error("Error loading order", error);
      setOrder(null);
      return;
    }

    setOrder(data);
    setExpectedDispatch(data?.expected_dispatch_date || "");
    setOriginalLines(data?.order_lines || []);
    setOriginalStatus(data?.status || null);
    setOrderRemarks(data?.remarks ?? "");

    const initial: Record<string, string> = {};
    (data?.order_lines || []).forEach((l: any) => (initial[l.id] = ""));
    setDispatchedToday(initial);
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
      return;
    }
    setItems(data || []);
  }

  async function loadLogs() {
    const { data, error } = await supabase
      .from("order_logs")
      .select("id, message, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error loading logs", error);
      setLogs([]);
      return;
    }
    setLogs(data || []);
  }

  async function loadDispatchEvents() {
    const { data, error } = await supabase
      .from("dispatch_events")
      .select("id, order_line_id, dispatched_qty, dispatched_at, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading dispatch events", error);
      setDispatchEvents([]);
      return;
    }
    setDispatchEvents(data || []);
  }

  // ---------- helpers ----------
  function getItemName(line: any) {
    const itemRel = line?.items;
    const item =
      itemRel && Array.isArray(itemRel) && itemRel.length > 0 ? itemRel[0] : itemRel || null;
    return item?.name || "Unknown item";
  }

  function safeNumber(v: any) {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }

  function sanitizeRateInput(value: any) {
    const raw = String(value ?? "").replace(/[^\d.]/g, "");
    const firstDotIndex = raw.indexOf(".");
    if (firstDotIndex < 0) return raw;

    return (
      raw.slice(0, firstDotIndex + 1) +
      raw.slice(firstDotIndex + 1).replace(/\./g, "")
    );
  }

  function formatRateLabel(value: any) {
    return `₹ ${safeNumber(value).toLocaleString("en-IN")}`;
  }

  function calculateLineTotal(qty: any, rate: any) {
    return safeNumber(qty) * safeNumber(rate);
  }

  function buildOrderHeaderTotals(nextLines: any[]) {
    return (Array.isArray(nextLines) ? nextLines : []).reduce(
      (acc, line) => {
        const qty = safeNumber(line?.qty);
        const lineTotal =
          typeof line?.line_total === "number"
            ? line.line_total
            : calculateLineTotal(qty, line?.dealer_rate_at_order);

        acc.total_qty += qty;
        acc.total_value += safeNumber(lineTotal);
        return acc;
      },
      { total_qty: 0, total_value: 0 }
    );
  }

  async function syncOrderHeaderTotals(nextLines: any[]) {
    if (!order?.id) return null;

    const totals = buildOrderHeaderTotals(nextLines);
    const { error } = await supabase
      .from("orders")
      .update(totals)
      .eq("id", order.id);

    if (error) {
      console.error("Error syncing order header totals", error);
      return error.message;
    }

    setOrder((prev: any) => (prev ? { ...prev, ...totals } : prev));
    return null;
  }

  function getLineStats(line: any) {
    const ordered = safeNumber(line?.qty) || 0;

    let dispatched = safeNumber(line?.dispatched_qty);
    if (dispatched < 0) dispatched = 0;
    if (dispatched > ordered) dispatched = ordered;

    const pending = Math.max(ordered - dispatched, 0);
    return { ordered, dispatched, pending };
  }

  function deriveDispatchStatus(nextLines: any[], currentStatus: string) {
    const lines = Array.isArray(nextLines) ? nextLines : [];

    const totalOrdered = lines.reduce((sum: number, line: any) => {
      return sum + safeNumber(line?.qty);
    }, 0);

    const totalDispatched = lines.reduce((sum: number, line: any) => {
      const ordered = safeNumber(line?.qty);
      let dispatched = safeNumber(line?.dispatched_qty);
      if (dispatched < 0) dispatched = 0;
      if (dispatched > ordered) dispatched = ordered;
      return sum + dispatched;
    }, 0);

    if (totalOrdered > 0 && totalDispatched >= totalOrdered) {
      return "dispatched";
    }

    if (totalDispatched > 0) {
      return ["submitted", "pending", "in_production", "packed", "partially_dispatched", "dispatched"].includes(
        currentStatus || "pending"
      )
        ? "partially_dispatched"
        : currentStatus || "pending";
    }

    if (["partially_dispatched", "dispatched"].includes(currentStatus || "")) {
      return "pending";
    }

    return currentStatus || "pending";
  }

  function formatDispatchLogDate(value: string) {
    if (!value) return "Unknown date";
    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  }

  // ---------- UI handlers ----------
  function handleDispatchedTodayChange(lineId: string, value: string) {
    if (!order) return;

    const cleaned = String(value ?? "").replace(/[^\d]/g, "");
    if (cleaned === "") {
      setDispatchedToday((prev) => ({ ...prev, [lineId]: "" }));
      return;
    }

    let num = parseInt(cleaned, 10);
    if (Number.isNaN(num) || num < 0) num = 0;

    const line = (order.order_lines || []).find((l: any) => l.id === lineId);
    if (line) {
      const { pending } = getLineStats(line);
      if (num > pending) num = pending;
    }

    setDispatchedToday((prev) => ({ ...prev, [lineId]: String(num) }));
  }

  function handleNoteChange(lineId: string, value: string) {
    if (!order) return;
    setOrder({
      ...order,
      order_lines: (order.order_lines || []).map((l: any) =>
        l.id === lineId ? { ...l, line_remarks: value } : l
      ),
    });
  }

  function handleRateChange(lineId: string, value: string) {
    const cleaned = sanitizeRateInput(value);

    setOrder((prev: any) => {
      if (!prev) return prev;

      return {
        ...prev,
        order_lines: (prev.order_lines || []).map((l: any) =>
          l.id === lineId
            ? {
                ...l,
                dealer_rate_at_order: cleaned,
                line_total: cleaned === "" ? 0 : calculateLineTotal(l.qty, cleaned),
              }
            : l
        ),
      };
    });
  }

  function handleStatusChange(value: string) {
    if (!order) return;
    setOrder({ ...order, status: value });
  }

  function handleNewLineQtyChange(value: string) {
    if (value.trim() === "") return setNewLineQty("");
    const cleaned = value.replace(/[^\d]/g, "");
    if (cleaned === "") return setNewLineQty("");
    const num = parseInt(cleaned, 10);
    if (Number.isNaN(num) || num <= 0) return setNewLineQty("");
    setNewLineQty(String(num));
  }

  function handleNewLineItemChange(value: string) {
    setNewLineItemId(value);

    const item = items.find((i) => i.id === value);
    const defaultRate =
      item?.dealer_rate !== null && item?.dealer_rate !== undefined
        ? String(item.dealer_rate)
        : "";

    setNewLineRate(defaultRate);
  }

  function handleNewLineRateChange(value: string) {
    setNewLineRate(sanitizeRateInput(value));
  }

  // ---------- save: remarks ----------
  async function saveRemarks() {
    if (!order) return;
    setSavingRemarks(true);

    try {
      const trimmed = orderRemarks.trim() === "" ? null : orderRemarks.trim();

      const { error } = await supabase.from("orders").update({ remarks: trimmed }).eq("id", order.id);

      if (error) {
        console.error(error);
        alert("Error updating remarks: " + error.message);
        return;
      }

      setOrder({ ...order, remarks: trimmed });
      alert("Remarks updated.");
    } finally {
      setSavingRemarks(false);
    }
  }

  // ---------- save: expected dispatch ----------
  async function saveExpectedDispatchDate() {
    if (!order) return;
    setSavingExpectedDate(true);

    try {
      const value = expectedDispatch && expectedDispatch.trim() !== "" ? expectedDispatch : null;

      const { error } = await supabase
        .from("orders")
        .update({ expected_dispatch_date: value })
        .eq("id", order.id);

      if (error) {
        console.error(error);
        alert("Error updating expected dispatch date: " + error.message);
        return;
      }

      setOrder({ ...order, expected_dispatch_date: value });
      alert("Expected dispatch date updated.");
    } finally {
      setSavingExpectedDate(false);
    }
  }

  // ---------- save: status ----------
  async function saveStatus() {
    if (!order) return;
    setSavingStatus(true);

    try {
      const newStatus = order.status || "pending";
      const prevStatus = originalStatus || "pending";

      const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", order.id);

      if (error) {
        console.error(error);
        alert("Error updating status: " + error.message);
        return;
      }

      if (newStatus !== prevStatus) {
        await supabase.from("order_logs").insert([
          { order_id: order.id, message: `Status changed: ${prevStatus} → ${newStatus}` },
        ]);
      }

      await loadOrder();
      await loadLogs();
      alert("Order status updated.");
    } finally {
      setSavingStatus(false);
    }
  }

  // ---------- save: dispatch + notes ----------
  async function saveDispatchAndNotes() {
    if (!order) return;
    if (!dispatchDate) return alert("Please choose a dispatch date.");

    setSavingDispatch(true);

    try {
      const lines = order.order_lines || [];

      const logsToInsert: { order_id: string; message: string }[] = [];
      const dispatchEventsToInsert: {
        order_id: string;
        order_line_id: string;
        dispatched_qty: number;
        dispatched_at: string;
      }[] = [];

      const lineUpdates: {
        id: string;
        dispatched_qty: number;
        dealer_rate_at_order: number;
        line_total: number;
        line_remarks: string | null;
      }[] = [];

      for (const l of lines) {
        const lineId = l.id as string;
        const itemName = getItemName(l);

        const { ordered, dispatched: dispatchedSoFar, pending } = getLineStats(l);

        const deltaRaw = dispatchedToday[lineId] === undefined ? "" : String(dispatchedToday[lineId]).trim();
        const deltaClean = deltaRaw.replace(/[^\d]/g, "");
        let delta = deltaClean === "" ? 0 : parseInt(deltaClean, 10);
        if (Number.isNaN(delta) || delta < 0) delta = 0;

        if (delta > pending) {
          alert(`Line "${itemName}": dispatching ${delta} pcs exceeds pending ${pending} pcs.`);
          return;
        }

        const newTotalDispatched = dispatchedSoFar + delta;

        const newNoteStr = typeof l.line_remarks === "string" ? l.line_remarks.trim() : "";
        const newNote = newNoteStr === "" ? null : newNoteStr;

        const rateRaw = sanitizeRateInput(l?.dealer_rate_at_order ?? "");
        if (rateRaw === "") {
          alert(`Line "${itemName}": please enter a rate before saving.`);
          return;
        }

        const rateNum = Number(rateRaw);
        if (Number.isNaN(rateNum) || rateNum < 0) {
          alert(`Line "${itemName}": please enter a valid rate.`);
          return;
        }

        const nextLineTotal = calculateLineTotal(ordered, rateNum);

        const orig = originalLines.find((ol: any) => ol.id === lineId) || {};
        const origDisp = safeNumber(orig.dispatched_qty);
        const origRate = safeNumber(orig.dealer_rate_at_order);
        const origNoteStr = typeof orig.line_remarks === "string" ? orig.line_remarks.trim() : "";
        const origNote = origNoteStr === "" ? null : origNoteStr;

        if (delta > 0) {
          dispatchEventsToInsert.push({
            order_id: order.id,
            order_line_id: lineId,
            dispatched_qty: delta,
            dispatched_at: dispatchDate,
          });

          const msgDate = new Date(dispatchDate).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "2-digit",
          });

          logsToInsert.push({
            order_id: order.id,
            message: `Dispatched ${delta} pcs of ${itemName} on ${msgDate}.`,
          });
        }

        const dispatchChanged = newTotalDispatched !== origDisp;
        const rateChanged = rateNum !== origRate;
        const noteChanged = (origNote || null) !== (newNote || null);

        if (dispatchChanged || noteChanged || rateChanged) {
          lineUpdates.push({
            id: lineId,
            dispatched_qty: newTotalDispatched,
            dealer_rate_at_order: rateNum,
            line_total: nextLineTotal,
            line_remarks: newNote,
          });

          if (rateChanged) {
            logsToInsert.push({
              order_id: order.id,
              message: `Updated rate for ${itemName}: ${formatRateLabel(origRate)} → ${formatRateLabel(rateNum)}`,
            });
          }

          if (noteChanged) {
            logsToInsert.push({
              order_id: order.id,
              message: `Updated note for ${itemName}: "${origNote || "-"}" → "${newNote || "-"}"`,
            });
          }
        }

      }

      if (dispatchEventsToInsert.length > 0) {
        const { error } = await supabase.from("dispatch_events").insert(dispatchEventsToInsert);
        if (error) {
          console.error(error);
          alert("Error saving dispatch events: " + error.message);
          return;
        }
      }

      for (const u of lineUpdates) {
        const { error } = await supabase
          .from("order_lines")
          .update({
            dispatched_qty: u.dispatched_qty,
            dealer_rate_at_order: u.dealer_rate_at_order,
            line_total: u.line_total,
            line_remarks: u.line_remarks,
          })
          .eq("id", u.id);

        if (error) {
          console.error(error);
          alert("Error updating lines: " + error.message);
          return;
        }
      }

      // auto status update
      const prevStatus = originalStatus || order.status || "pending";
      const nextLines = lines.map((line: any) => {
        const updated = lineUpdates.find((candidate) => candidate.id === line.id);
        return updated
          ? {
              ...line,
              dispatched_qty: updated.dispatched_qty,
            }
          : line;
      });
      const newStatus = deriveDispatchStatus(nextLines, order.status || "pending");

      if (newStatus !== order.status) {
        const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", order.id);
        if (error) {
          console.error(error);
          alert("Error updating order status: " + error.message);
          return;
        }
        logsToInsert.push({ order_id: order.id, message: `Status changed: ${prevStatus} → ${newStatus}` });
      }

      if (logsToInsert.length > 0) {
        await supabase.from("order_logs").insert(logsToInsert);
      }

      const totalsSyncError = await syncOrderHeaderTotals(lines);

      if (totalsSyncError) {
        alert(`Rates, dispatch, and notes were saved, but order totals could not be refreshed: ${totalsSyncError}`);
      } else {
        alert("Rates, dispatch, and notes updated.");
      }

      await loadOrder();
      await loadLogs();
      await loadDispatchEvents();

      // reset dispatchedToday
      const reset: Record<string, string> = {};
      (order.order_lines || []).forEach((l: any) => (reset[l.id] = ""));
      setDispatchedToday(reset);
    } finally {
      setSavingDispatch(false);
    }
  }

  // ---------- delete line ----------
  async function deleteLine(line: any) {
    if (!order) return;
    if (!confirm("Remove this item from the order?")) return;

    const itemName = getItemName(line);
    const qty = safeNumber(line.qty);

    const { error } = await supabase.from("order_lines").delete().eq("id", line.id);
    if (error) {
      console.error(error);
      alert("Could not delete line: " + error.message);
      return;
    }

    await supabase.from("order_logs").insert([
      { order_id: order.id, message: `Deleted line item: ${itemName} (${qty} pcs)` },
    ]);

    const totalsSyncError = await syncOrderHeaderTotals(
      (order.order_lines || []).filter((existingLine: any) => existingLine.id !== line.id)
    );

    if (totalsSyncError) {
      alert(`Line deleted, but order totals could not be refreshed: ${totalsSyncError}`);
    }

    await loadOrder();
    await loadLogs();
    await loadDispatchEvents();
  }

  async function undoDispatchEvent(eventId: string) {
    if (!order) return;

    const event = (dispatchEvents || []).find((entry: any) => entry.id === eventId);
    if (!event) return;

    const line = (order.order_lines || []).find((entry: any) => entry.id === event.order_line_id);
    if (!line) {
      alert("Could not find the order line for this dispatch entry.");
      return;
    }

    const itemName = getItemName(line);
    const qty = safeNumber(event.dispatched_qty);
    const dispatchDateLabel = formatDispatchLogDate(event.dispatched_at);

    if (!confirm(`Undo dispatch of ${qty} pcs for ${itemName} on ${dispatchDateLabel}?`)) return;

    setUndoingDispatchEventId(eventId);

    try {
      const remainingEvents = (dispatchEvents || []).filter((entry: any) => entry.id !== eventId);
      const remainingQty = remainingEvents
        .filter((entry: any) => entry.order_line_id === event.order_line_id)
        .reduce((sum: number, entry: any) => sum + safeNumber(entry.dispatched_qty), 0);

      const { error: deleteError } = await supabase.from("dispatch_events").delete().eq("id", eventId);
      if (deleteError) {
        console.error(deleteError);
        alert("Could not undo dispatch entry: " + deleteError.message);
        return;
      }

      const nextDispatchedQty = Math.min(safeNumber(line.qty), Math.max(remainingQty, 0));

      const { error: lineError } = await supabase
        .from("order_lines")
        .update({ dispatched_qty: nextDispatchedQty })
        .eq("id", event.order_line_id);

      if (lineError) {
        console.error(lineError);
        alert("Dispatch entry was removed, but the line total could not be refreshed: " + lineError.message);
        return;
      }

      const nextLines = (order.order_lines || []).map((entry: any) =>
        entry.id === event.order_line_id ? { ...entry, dispatched_qty: nextDispatchedQty } : entry
      );

      const prevStatus = order.status || "pending";
      const nextStatus = deriveDispatchStatus(nextLines, prevStatus);

      if (nextStatus !== prevStatus) {
        const { error: statusError } = await supabase
          .from("orders")
          .update({ status: nextStatus })
          .eq("id", order.id);

        if (statusError) {
          console.error(statusError);
          alert("Dispatch entry was removed, but the order status could not be updated: " + statusError.message);
          return;
        }
      }

      const logsToInsert = [
        {
          order_id: order.id,
          message: `Undid dispatch entry: ${qty} pcs of ${itemName} dated ${dispatchDateLabel}.`,
        },
      ];

      if (nextStatus !== prevStatus) {
        logsToInsert.push({
          order_id: order.id,
          message: `Status changed: ${prevStatus} → ${nextStatus}`,
        });
      }

      await supabase.from("order_logs").insert(logsToInsert);

      alert("Dispatch entry undone.");
      await loadOrder();
      await loadLogs();
      await loadDispatchEvents();
    } finally {
      setUndoingDispatchEventId(null);
    }
  }

  // ---------- add new line ----------
  async function addNewLine() {
    if (!order) return;

    if (!newLineItemId) return alert("Select an item for the new line.");
    if (!newLineQty) return alert("Enter quantity for the new line.");
    if (!newLineRate) return alert("Enter a rate for the new line.");

    const qty = parseInt(newLineQty, 10);
    if (!qty || qty <= 0) return alert("Quantity must be greater than zero.");

    const rate = Number(newLineRate);
    if (Number.isNaN(rate) || rate < 0) {
      return alert("Please enter a valid rate for the new line.");
    }

    const item = items.find((i) => i.id === newLineItemId);
    const lineTotal = rate * qty;
    const note = newLineNote.trim() || null;

    setSavingNewLine(true);
    try {
      const { error } = await supabase.from("order_lines").insert([
        {
          order_id: order.id,
          item_id: newLineItemId,
          qty,
          dispatched_qty: 0,
          dealer_rate_at_order: rate,
          line_total: lineTotal,
          line_remarks: note,
        },
      ]);

      if (error) {
        console.error(error);
        alert("Error adding line: " + error.message);
        return;
      }

      const itemName = item?.name || "Unknown item";
      const msgBase = `Added line item: ${itemName} (${qty} pcs)`;
      const message = note ? `${msgBase}, Note: "${note}"` : msgBase;

      await supabase.from("order_logs").insert([{ order_id: order.id, message }]);

      setAddingLine(false);
      setNewLineItemId("");
      setNewLineQty("");
      setNewLineRate("");
      setNewLineNote("");

      const totalsSyncError = await syncOrderHeaderTotals([
        ...(order.order_lines || []),
        {
          qty,
          dealer_rate_at_order: rate,
          line_total: lineTotal,
        },
      ]);

      if (totalsSyncError) {
        alert(`Line added, but order totals could not be refreshed: ${totalsSyncError}`);
      }

      await loadOrder();
      await loadLogs();
      await loadDispatchEvents();
    } finally {
      setSavingNewLine(false);
    }
  }

  // ---------- computed values for view ----------
  const lines = order?.order_lines || [];

  const party =
    order && Array.isArray(order?.parties) && order.parties.length > 0 ? order.parties[0] : order?.parties;

  const totals = useMemo(() => {
    const totalOrdered = (lines || []).reduce((sum: number, l: any) => sum + (safeNumber(l.qty) || 0), 0);

    const totalDispatched = (lines || []).reduce((sum: number, l: any) => {
      const ordered = safeNumber(l.qty);
      let d = safeNumber(l.dispatched_qty);
      if (d < 0) d = 0;
      if (d > ordered) d = ordered;
      return sum + d;
    }, 0);

    const fulfillmentPercent = totalOrdered > 0 ? Math.round((totalDispatched / totalOrdered) * 100) : 0;

    const totalValueFromLines = (lines || []).reduce((sum: number, l: any) => {
      const qty = safeNumber(l.qty);
      const lt = typeof l.line_total === "number" ? l.line_total : safeNumber(l.dealer_rate_at_order) * qty;
      return sum + (safeNumber(lt) || 0);
    }, 0);

    return { totalOrdered, totalDispatched, fulfillmentPercent, totalValueFromLines };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, order?.order_lines]);

  const pendingLines = useMemo(() => {
    return (lines || []).filter((l: any) => {
      const { pending } = getLineStats(l);
      return pending > 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, order?.order_lines]);

  const fullyDispatchedLines = useMemo(() => {
    return (lines || []).filter((l: any) => {
      const { ordered, dispatched, pending } = getLineStats(l);
      return ordered > 0 && dispatched === ordered && pending === 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, order?.order_lines]);

  const dispatchMeta = useMemo(() => {
    const dispatchDatesSet = new Set<string>();
    const lineLastDispatch: Record<string, string> = {};

    (dispatchEvents || []).forEach((ev: any) => {
      if (!ev?.dispatched_at) return;
      const dateOnly = String(ev.dispatched_at).slice(0, 10);
      dispatchDatesSet.add(dateOnly);

      const existing = lineLastDispatch[ev.order_line_id];
      if (!existing) lineLastDispatch[ev.order_line_id] = ev.dispatched_at;
      else if (new Date(ev.dispatched_at).getTime() > new Date(existing).getTime()) lineLastDispatch[ev.order_line_id] =
        ev.dispatched_at;
    });

    const dispatchDates = Array.from(dispatchDatesSet).sort();

    let dispatchSummaryLabel = "Dispatch dates: Not set";
    if (dispatchDates.length === 1) dispatchSummaryLabel = `Dispatch date: ${dispatchDates[0]}`;
    else if (dispatchDates.length > 1 && dispatchDates.length <= 3) dispatchSummaryLabel = `Dispatch dates: ${dispatchDates.join(", ")}`;
    else if (dispatchDates.length > 3)
      dispatchSummaryLabel = `Dispatch dates: ${dispatchDates[0]} – ${dispatchDates[dispatchDates.length - 1]} (${dispatchDates.length} batches)`;

    return { dispatchDates, dispatchSummaryLabel, lineLastDispatch };
  }, [dispatchEvents]);

  const statusColor = STATUS_COLORS[(order?.status || "pending") as string] || "#4b5563";

  // ---------- export + whatsapp ----------
  async function exportPDF() {
    if (!order) return;
    try {
      await exportOrderPdf({ order, elementId: "order-export-print" });
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("PDF export failed. Check console for details.");
    }
  }

  function shareOnWhatsApp() {
    if (!order) return;
    const message = buildOrderWhatsAppText({
      order,
      lines,
      party,
      fulfillmentPercent: totals.fulfillmentPercent,
      totalDispatched: totals.totalDispatched,
      totalOrdered: totals.totalOrdered,
    });
    openWhatsAppShare(message);
  }

  // ---------- render ----------
  if (loading) {
    return (
      <>
        <h1 className="section-title">Order Detail</h1>
        <p className="section-subtitle">Loading order…</p>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <h1 className="section-title">Order Detail</h1>
        <p className="section-subtitle">Order not found.</p>
        <button className="pill-button" type="button" onClick={() => router.push("/orders")}>
          Back to orders
        </button>
      </>
    );
  }

  const statusLabel = STATUS_LABELS[order.status] ?? order.status ?? "Pending";
  const displayCode = order?.order_code || order?.id;

  return (
    <OrderDetailView
      router={router}
      order={order}
      party={party}
      lines={lines}
      logs={logs}
      statusLabel={statusLabel}
      displayCode={displayCode}
      statusColor={statusColor}
      // totals
      totalOrdered={totals.totalOrdered}
      totalDispatched={totals.totalDispatched}
      fulfillmentPercent={totals.fulfillmentPercent}
      totalValueFromLines={totals.totalValueFromLines}
      // split tables
      pendingLines={pendingLines}
      fullyDispatchedLines={fullyDispatchedLines}
      // dispatch meta
      dispatchSummaryLabel={dispatchMeta.dispatchSummaryLabel}
      lineLastDispatch={dispatchMeta.lineLastDispatch}
      // remarks
      orderRemarks={orderRemarks}
      setOrderRemarks={setOrderRemarks}
      savingRemarks={savingRemarks}
      saveRemarks={saveRemarks}
      // status
      savingStatus={savingStatus}
      handleStatusChange={handleStatusChange}
      saveStatus={saveStatus}
      // expected date
      expectedDispatch={expectedDispatch}
      setExpectedDispatch={setExpectedDispatch}
      savingExpectedDate={savingExpectedDate}
      saveExpectedDispatchDate={saveExpectedDispatchDate}
      // dispatch inputs
      dispatchDate={dispatchDate}
      setDispatchDate={setDispatchDate}
      dispatchedToday={dispatchedToday}
      handleDispatchedTodayChange={handleDispatchedTodayChange}
      handleNoteChange={handleNoteChange}
      handleRateChange={handleRateChange}
      undoingDispatchEventId={undoingDispatchEventId}
      undoDispatchEvent={undoDispatchEvent}
      savingDispatch={savingDispatch}
      saveDispatchAndNotes={saveDispatchAndNotes}
      // delete
      deleteLine={deleteLine}
      // add line
      items={items}
      addingLine={addingLine}
      setAddingLine={setAddingLine}
      newLineItemId={newLineItemId}
      setNewLineItemId={setNewLineItemId}
      newLineRate={newLineRate}
      setNewLineRate={setNewLineRate}
      newLineQty={newLineQty}
      setNewLineQty={setNewLineQty}
      newLineNote={newLineNote}
      dispatchEvents={dispatchEvents}
      setNewLineNote={setNewLineNote}
      savingNewLine={savingNewLine}
      handleNewLineItemChange={handleNewLineItemChange}
      handleNewLineQtyChange={handleNewLineQtyChange}
      handleNewLineRateChange={handleNewLineRateChange}
      addNewLine={addNewLine}
      // actions
      exportPDF={exportPDF}
      shareOnWhatsApp={shareOnWhatsApp}
      readOnly={false}
      canSeeFinancials
    />
  );
}

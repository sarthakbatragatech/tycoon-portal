// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/constants/status";
import { supabase } from "@/lib/supabase";
import OrderDetailView from "./OrderDetailView";

export default function ViewerOrderDetailClient() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;
  const [payload, setPayload] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function loadOrder() {
    setLoading(true);
    const { data, error } = await supabase.rpc("viewer_order_detail", {
      p_order_id: orderId,
    });

    if (error) {
      console.error("Error loading viewer order detail", error);
      setPayload(null);
      setLoading(false);
      return;
    }

    setPayload(data || null);
    setLoading(false);
  }

  if (loading) {
    return (
      <>
        <h1 className="section-title">Order Detail</h1>
        <p className="section-subtitle">Loading order…</p>
      </>
    );
  }

  const safePayload = payload || null;
  const orderHeader = safePayload?.order || null;
  const lines = Array.isArray(safePayload?.lines)
    ? safePayload.lines.map((line: any) => ({
        id: line.id,
        qty: Number(line.qty ?? 0),
        dispatched_qty: Number(line.dispatched_qty ?? 0),
        line_remarks: line.line_remarks ?? "",
        items: {
          name: line.item_name ?? "Unknown item",
          category: line.category ?? "Uncategorised",
        },
      }))
    : [];

  const order = orderHeader
    ? {
        id: orderHeader.id,
        order_code: orderHeader.order_code,
        order_date: orderHeader.order_date,
        expected_dispatch_date: orderHeader.expected_dispatch_date,
        status: orderHeader.status,
        remarks: orderHeader.remarks,
        parties: {
          name: orderHeader.party_name,
          city: orderHeader.city,
        },
        order_lines: lines,
      }
    : null;

  const statusColor = STATUS_COLORS[(order?.status || "pending") as string] || "#4b5563";
  const statusLabel = STATUS_LABELS[order?.status] ?? order?.status ?? "Pending";
  const displayCode = order?.order_code || order?.id;

  return (
    <OrderDetailView
      router={router}
      order={order}
      party={order?.parties || null}
      lines={lines}
      logs={Array.isArray(safePayload?.logs) ? safePayload.logs : []}
      statusLabel={statusLabel}
      displayCode={displayCode}
      statusColor={statusColor}
      totalOrdered={orderHeader?.total_ordered ?? 0}
      totalDispatched={orderHeader?.total_dispatched ?? 0}
      fulfillmentPercent={orderHeader?.fulfillment_pct ?? 0}
      totalValueFromLines={0}
      pendingLines={lines.filter((line: any) => Number(line.qty ?? 0) > Number(line.dispatched_qty ?? 0))}
      fullyDispatchedLines={lines.filter((line: any) => Number(line.qty ?? 0) <= Number(line.dispatched_qty ?? 0))}
      dispatchSummaryLabel="View-only access"
      lineLastDispatch={{}}
      orderRemarks={orderHeader?.remarks ?? ""}
      setOrderRemarks={() => {}}
      savingRemarks={false}
      saveRemarks={() => {}}
      savingStatus={false}
      handleStatusChange={() => {}}
      saveStatus={() => {}}
      expectedDispatch={orderHeader?.expected_dispatch_date ?? ""}
      setExpectedDispatch={() => {}}
      savingExpectedDate={false}
      saveExpectedDispatchDate={() => {}}
      dispatchDate=""
      setDispatchDate={() => {}}
      dispatchedToday={{}}
      handleDispatchedTodayChange={() => {}}
      handleNoteChange={() => {}}
      savingDispatch={false}
      saveDispatchAndNotes={() => {}}
      deleteLine={() => {}}
      items={[]}
      addingLine={false}
      setAddingLine={() => {}}
      newLineItemId=""
      setNewLineItemId={() => {}}
      newLineQty=""
      setNewLineQty={() => {}}
      newLineNote=""
      dispatchEvents={Array.isArray(safePayload?.dispatch_events) ? safePayload.dispatch_events : []}
      setNewLineNote={() => {}}
      savingNewLine={false}
      handleNewLineQtyChange={() => {}}
      addNewLine={() => {}}
      exportPDF={() => {}}
      shareOnWhatsApp={() => {}}
      readOnly
      canSeeFinancials={false}
    />
  );
}

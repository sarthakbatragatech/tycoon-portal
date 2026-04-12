import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/server";
import {
  STATUS_LABELS,
  VIEWER_EDITABLE_ORDER_STATUSES,
  VIEWER_STATUS_OPTIONS,
  type OrderStatus,
} from "@/lib/constants/status";

const VIEWER_TARGET_STATUSES = new Set(VIEWER_STATUS_OPTIONS.map((option) => option.value));
const VIEWER_CURRENT_STATUSES = new Set(VIEWER_EDITABLE_ORDER_STATUSES);

function getViewerTargetStatus(value: unknown): OrderStatus | null {
  return typeof value === "string" && VIEWER_TARGET_STATUSES.has(value as OrderStatus)
    ? (value as OrderStatus)
    : null;
}

export async function POST(request: Request) {
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  if (auth.role !== "viewer") {
    return NextResponse.json({ error: "Only viewer accounts can use this route." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const orderId = String(body?.orderId || "").trim();
  const nextStatus = getViewerTargetStatus(body?.status);

  if (!orderId) {
    return NextResponse.json({ error: "Order id is required." }, { status: 400 });
  }

  if (!nextStatus) {
    return NextResponse.json(
      { error: "Viewer accounts can only set status to In production or Packed." },
      { status: 400 }
    );
  }

  const sessionClient = await createClient();
  const { data: visibleOrderPayload, error: visibleOrderError } = await sessionClient.rpc("viewer_order_detail", {
    p_order_id: orderId,
  });

  if (visibleOrderError) {
    return NextResponse.json({ error: visibleOrderError.message }, { status: 500 });
  }

  const visibleOrder = visibleOrderPayload?.order ?? null;
  if (!visibleOrder) {
    return NextResponse.json({ error: "This order is not available to the current viewer." }, { status: 404 });
  }

  const currentStatus = String(visibleOrder.status || "pending") as OrderStatus;

  if (!VIEWER_CURRENT_STATUSES.has(currentStatus)) {
    return NextResponse.json(
      { error: "This order status can only be changed by an admin now." },
      { status: 403 }
    );
  }

  if (currentStatus === nextStatus) {
    return NextResponse.json({
      ok: true,
      status: nextStatus,
      statusLabel: STATUS_LABELS[nextStatus] ?? nextStatus,
    });
  }

  const adminClient = createAdminClient();
  const { error: updateError } = await adminClient.from("orders").update({ status: nextStatus }).eq("id", orderId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const previousStatusLabel = STATUS_LABELS[currentStatus] ?? currentStatus;
  const nextStatusLabel = STATUS_LABELS[nextStatus] ?? nextStatus;

  const { error: logError } = await adminClient.from("order_logs").insert([
    {
      order_id: orderId,
      message: `Status changed: ${previousStatusLabel} -> ${nextStatusLabel} by ${auth.username}.`,
    },
  ]);

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    statusLabel: nextStatusLabel,
  });
}

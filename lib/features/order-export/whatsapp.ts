// lib/features/order-export/whatsapp.ts
// @ts-nocheck

import { STATUS_LABELS } from "@/lib/constants/status";

function getItemFromRel(itemRel: any) {
  return itemRel && Array.isArray(itemRel) && itemRel.length > 0
    ? itemRel[0]
    : itemRel || null;
}

function safeNumber(v: any) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function clampDispatched(ordered: number, raw: any) {
  let dispatched = safeNumber(raw);
  if (dispatched < 0) dispatched = 0;
  if (dispatched > ordered) dispatched = ordered;
  return dispatched;
}

/**
 * Build WhatsApp summary message text (markdown style).
 */
export function buildOrderWhatsAppText(args: {
  order: any;
  lines: any[];
  party: any;
  totalOrdered: number;
  totalDispatched: number;
  fulfillmentPercent: number;
}) {
  const { order, lines, party, totalOrdered, totalDispatched, fulfillmentPercent } = args;

  if (!order) return "";

  const statusLabel =
    STATUS_LABELS[order?.status] ?? order?.status ?? "";

  const displayCode = order?.order_code || order?.id || "—";

  const partyName = party?.name ?? "Unknown party";
  const partyCity = party?.city ? ` (${party.city})` : "";

  const orderDateText = order?.order_date
    ? new Date(order.order_date).toLocaleDateString("en-IN")
    : "Not set";

  const expectedText = order?.expected_dispatch_date
    ? new Date(order.expected_dispatch_date).toLocaleDateString("en-IN")
    : "Not set";

  let text = `*TYCOON ORDER SUMMARY*\n`;
  text += `----------------------------------\n`;
  text += `*Order:* ${displayCode}\n`;
  text += `*Party:* ${partyName}${partyCity}\n`;
  text += `*Order Date:* ${orderDateText}\n`;
  text += `*Expected Dispatch:* ${expectedText}\n`;
  text += `*Status:* ${statusLabel}\n`;
  text += `*Fulfilment:* ${totalDispatched}/${totalOrdered} pcs (${fulfillmentPercent}%)\n`;
  text += `----------------------------------\n\n`;

  text += `*ITEM DETAILS*\n`;

  (lines || []).forEach((l: any) => {
    const item = getItemFromRel(l?.items);
    const name = item?.name ?? "Unknown item";

    const ordered = safeNumber(l?.qty);
    const dispatched = clampDispatched(ordered, l?.dispatched_qty);
    const pending = Math.max(ordered - dispatched, 0);

    const notes =
      typeof l?.line_remarks === "string" && l.line_remarks.trim() !== ""
        ? l.line_remarks.trim()
        : null;

    text += `• *${name}*\n`;
    text += `  - Ordered: ${ordered} pcs\n`;
    text += `  - Dispatched: ${dispatched} pcs\n`;
    text += `  - Pending: ${pending} pcs\n`;
    if (notes) text += `  - Notes: _${notes}_\n`;
    text += `\n`;
  });

  if (order?.remarks && String(order.remarks).trim() !== "") {
    text += `----------------------------------\n`;
    text += `*Order Remarks:*\n${String(order.remarks).trim()}\n\n`;
  }

  text += `_Sent via Tycoon Order Portal_`;

  return text;
}

/**
 * Open WhatsApp share link in a new tab.
 */
export function openWhatsAppShare(text: string) {
  if (!text) return;
  const encoded = encodeURIComponent(text);
  const url = `https://api.whatsapp.com/send?text=${encoded}`;
  window.open(url, "_blank");
}
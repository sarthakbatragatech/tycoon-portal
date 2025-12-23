// lib/features/order-export/pdf.ts
// @ts-nocheck
"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/* ----------------------------- helpers ----------------------------- */

function sanitizeFilePart(input: any) {
  return String(input ?? "")
    .trim()
    .replace(/\s+/g, "_")           // spaces → _
    .replace(/[^a-zA-Z0-9_-]/g, ""); // remove unsafe chars
}

async function waitForImages(container: HTMLElement) {
  const imgs = Array.from(container.querySelectorAll("img")) as HTMLImageElement[];
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
}

function hideLikelyPageNumbers(root: HTMLElement) {
  const nodes = Array.from(root.querySelectorAll("*")) as HTMLElement[];
  for (const el of nodes) {
    const t = (el.textContent || "").trim();
    if (!t) continue;
    if (/^page\s*\d+(\s*of\s*\d+)?$/i.test(t)) {
      el.style.display = "none";
    }
  }
}

/* ----------------------------- types ----------------------------- */

type ExportOptions = {
  elementId: string;
  filename: string;
  scale?: number;

  // Margins (points). 72pt = 1 inch
  marginLeftPt?: number;
  marginRightPt?: number;
  marginTopPt?: number;
  marginBottomPt?: number;

  // small overlap between pages to avoid "cut" rows
  overlapPx?: number;
};

/* ------------------------ core pdf export ------------------------ */

export async function exportElementToPdf({
  elementId,
  filename,
  scale = 2,

  marginLeftPt = 24,
  marginRightPt = 24,
  marginTopPt = 14,
  marginBottomPt = 24,

  overlapPx = 18,
}: ExportOptions) {
  const element = document.getElementById(elementId) as HTMLElement | null;
  if (!element) throw new Error(`Element not found: ${elementId}`);

  await waitForImages(element);

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,

    onclone: (doc) => {
      const cloned = doc.getElementById(elementId) as HTMLElement | null;
      if (!cloned) return;

      cloned.style.opacity = "1";
      cloned.style.pointerEvents = "none";
      cloned.style.visibility = "visible";
      cloned.style.position = "absolute";
      cloned.style.left = "0";
      cloned.style.top = "0";
      cloned.style.transform = "none";
      cloned.style.zIndex = "9999";
      cloned.style.background = "#ffffff";

      const all = Array.from(cloned.querySelectorAll("*")) as HTMLElement[];
      all.forEach((el) => {
        const style = (el as any).style;
        if (style?.filter) style.filter = "none";
      });

      hideLikelyPageNumbers(cloned);
    },
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const usableWidth = pageWidth - marginLeftPt - marginRightPt;
  const usableHeight = pageHeight - marginTopPt - marginBottomPt;

  const pxPerPt = canvas.width / usableWidth;
  const sliceHeightPx = Math.floor(usableHeight * pxPerPt);
  const stepPx = Math.max(1, sliceHeightPx - Math.max(0, overlapPx));

  const totalPages = Math.max(1, Math.ceil((canvas.height - overlapPx) / stepPx));

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    if (pageIndex > 0) pdf.addPage();

    const yPx = pageIndex * stepPx;
    const currentSlicePx = Math.min(sliceHeightPx, canvas.height - yPx);

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = currentSlicePx;

    const ctx = pageCanvas.getContext("2d");
    if (!ctx) continue;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    ctx.drawImage(
      canvas,
      0,
      yPx,
      canvas.width,
      currentSlicePx,
      0,
      0,
      canvas.width,
      currentSlicePx
    );

    const imgData = pageCanvas.toDataURL("image/png");
    const imgW = usableWidth;
    const imgH = currentSlicePx / pxPerPt;

    pdf.addImage(imgData, "PNG", marginLeftPt, marginTopPt, imgW, imgH);

    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(
      `Page ${pageIndex + 1} of ${totalPages}`,
      pageWidth - marginRightPt,
      pageHeight - 10,
      { align: "right" }
    );
  }

  pdf.save(filename);
}

/* ----------------------- order-specific export ----------------------- */

export async function exportOrderPdf({
  order,
  elementId,
}: {
  order: any;
  elementId: string;
}) {
  const orderCode = order?.order_code || order?.id || "order";

  const partyRaw =
    order?.party_name ||
    order?.party ||
    order?.customer_name ||
    order?.customer ||
    order?.stakeholder_name ||
    order?.stakeholder?.name ||
    "Unknown Party";

  const party = sanitizeFilePart(partyRaw) || "Unknown_Party";
  const code = sanitizeFilePart(orderCode);

  await exportElementToPdf({
    elementId,
    filename: `${party}_${code}.pdf`,
    scale: 2,
    marginLeftPt: 24,
    marginRightPt: 24,
    marginTopPt: 12,
    marginBottomPt: 22,
    overlapPx: 18,
  });
}
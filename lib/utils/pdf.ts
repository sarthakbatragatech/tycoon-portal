// @ts-nocheck

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

type ExportOptions = {
  elementId: string;
  filename: string;
  /** Render scale for sharper output (default: 2). */
  scale?: number;
};

/**
 * Export a DOM element to a multi-page A4 PDF (portrait).
 *
 * Client-only utility: call from a client component.
 */
export async function exportElementToPdf({
  elementId,
  filename,
  scale = 2,
}: ExportOptions) {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`exportElementToPdf: element not found: ${elementId}`);
  }

  // Render to canvas
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");

  // A4 portrait in points
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Fit image to page width
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}

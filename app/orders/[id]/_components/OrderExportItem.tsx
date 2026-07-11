"use client";

import { resolveOrderItemThumbnail } from "@/lib/features/order-export/item-thumbnail";

type OrderExportItemProps = {
  item?: {
    name?: string | null;
    category?: string | null;
  } | null;
};

export function OrderExportItem({ item }: OrderExportItemProps) {
  const name = item?.name || "Unknown item";
  const thumbnail = resolveOrderItemThumbnail(item);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      {/* A native image preserves the catalogue URL and CORS data for html2canvas. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnail.src}
        alt=""
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
        onError={(event) => {
          const image = event.currentTarget;
          if (!image.src.endsWith("/Tycoon_Logo.JPG")) image.src = "/Tycoon_Logo.JPG";
        }}
        style={{
          width: 44,
          height: 34,
          flex: "0 0 44px",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          background: "#ffffff",
          objectFit: "contain",
        }}
      />
      <div style={{ minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" }}>
        <div style={{ fontWeight: 800, lineHeight: 1.2 }}>{name}</div>
        {thumbnail.representative && (
          <div style={{ marginTop: 2, color: "#6b7280", fontSize: 8, lineHeight: 1.1 }}>
            Closest catalogue image
          </div>
        )}
      </div>
    </div>
  );
}

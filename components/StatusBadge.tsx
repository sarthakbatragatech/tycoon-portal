// @ts-nocheck
"use client";

import { getStatusColor, getStatusLabel } from "@/lib/constants/status";

export default function StatusBadge({ status }: { status: string | null }) {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);

  return (
    <span
      style={{
        backgroundColor: color,
        color: "white",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

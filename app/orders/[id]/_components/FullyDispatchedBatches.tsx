// FullyDispatchedBatches.tsx
// @ts-nocheck
"use client";

export default function FullyDispatchedBatches({
  fullyDispatchedLines = [],
  dispatchEvents = [],
  getItemFromRel,
  getLineStats,
  formatDateShort,
  variant = "screen", // "screen" | "print"
}: any) {
  const isPrint = variant === "print";

  const safeLines = Array.isArray(fullyDispatchedLines)
    ? fullyDispatchedLines
    : [];
  const safeEvents = Array.isArray(dispatchEvents) ? dispatchEvents : [];

  // Build last-dispatch timestamp per line from dispatch_events
  const lineLastDispatch: Record<string, string> = {};
  for (const ev of safeEvents) {
    const lineId = ev?.order_line_id;
    const at = ev?.dispatched_at;
    if (!lineId || !at) continue;

    const prev = lineLastDispatch[lineId];
    if (!prev) lineLastDispatch[lineId] = at;
    else if (new Date(at).getTime() > new Date(prev).getTime()) {
      lineLastDispatch[lineId] = at;
    }
  }

  // Group fully-dispatched lines by LAST dispatch date (date-only)
  const groups: Record<string, any[]> = {};
  for (const l of safeLines) {
    const lastAt = lineLastDispatch[l.id] || "";
    const dateOnly = lastAt ? String(lastAt).slice(0, 10) : "Not set";
    if (!groups[dateOnly]) groups[dateOnly] = [];
    groups[dateOnly].push(l);
  }

  // Sort groups: most recent first, "Not set" last
  const batchKeys = Object.keys(groups).sort((a, b) => {
    if (a === "Not set") return 1;
    if (b === "Not set") return -1;
    return b.localeCompare(a);
  });

  if (!batchKeys.length) return null;

  const cardStyle: any = isPrint
    ? {
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#ffffff",
        overflow: "hidden",

        // ✅ try hard to prevent batch card splitting across pages
        breakInside: "avoid",
        pageBreakInside: "avoid",
        WebkitColumnBreakInside: "avoid",
      }
    : {
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14,
        background: "rgba(255,255,255,0.02)",
        overflow: "hidden",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.04) inset",
      };

  const headerStyle: any = isPrint
    ? {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 10px",
        background: "#f3f4f6",
        borderBottom: "1px solid #e5e7eb",
        fontWeight: 900,
        letterSpacing: 0.55,
        textTransform: "uppercase",
        fontSize: 10.5,
        color: "#111827",
      }
    : {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        background: "rgba(255,255,255,0.03)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        fontWeight: 900,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        fontSize: 11,
        color: "rgba(255,255,255,0.9)",
      };

  const tableStyle: any = {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  };

  const thBase: any = isPrint
    ? {
        padding: "8px 10px",
        fontSize: 9.5,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: 0.55,
        color: "#374151",
        borderBottom: "1px solid #e5e7eb",
        background: "#fafafa",
        whiteSpace: "nowrap",
      }
    : {
        padding: "10px 12px",
        fontSize: 10,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        color: "rgba(255,255,255,0.65)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
        whiteSpace: "nowrap",
      };

  const thLeft: any = { ...thBase, textAlign: "left" };
  const thCenter: any = { ...thBase, textAlign: "center" };

  const tdBase: any = isPrint
    ? {
        padding: "8px 10px",
        fontSize: 10.5,
        color: "#111827",
        borderBottom: "1px solid #e5e7eb",
        verticalAlign: "middle",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }
    : {
        padding: "10px 12px",
        fontSize: 12,
        color: "rgba(255,255,255,0.88)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        verticalAlign: "middle",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      };

  const tdLeft: any = { ...tdBase, textAlign: "left" };
  const tdCenter: any = { ...tdBase, textAlign: "center" };

  return (
    <div style={{ marginTop: 6 }}>
      {/* ✅ Avoid duplicate heading in PRINT (you already have a print heading in OrderDetailView) */}
      {!isPrint && (
        <div
          style={{
            marginTop: 6,
            marginBottom: 8,
            fontSize: 11,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: 0.08,
            opacity: 0.9,
          }}
        >
          Fully dispatched items (by batch)
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: isPrint ? 10 : 12 }}>
        {batchKeys.map((dateOnly) => {
          const lines = groups[dateOnly] || [];

          const totalPcs = lines.reduce((sum: number, l: any) => {
            const { dispatched } = getLineStats(l);
            return sum + (Number(dispatched) || 0);
          }, 0);

          const label =
            dateOnly === "Not set"
              ? "Dispatch date: Not set"
              : `Dispatch date: ${formatDateShort(dateOnly)}`;

          return (
            <div key={dateOnly} style={cardStyle}>
              <div style={headerStyle}>
                <span>{label}</span>
                <span>{totalPcs} pcs</span>
              </div>

              <div style={{ width: "100%", overflowX: "hidden" }}>
                <table style={tableStyle}>
                  <colgroup>
                    <col style={{ width: "34%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "24%" }} />
                  </colgroup>

                  <thead>
                    <tr>
                      <th style={thLeft}>Item</th>
                      <th style={thCenter}>Dispatched</th>
                      <th style={thCenter}>Ordered</th>
                      <th style={thCenter}>Pending</th>
                      <th style={thLeft}>Notes</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map((l: any) => {
                      const item = getItemFromRel(l);
                      const { ordered, dispatched, pending } = getLineStats(l);
                      const note =
                        typeof l?.line_remarks === "string" && l.line_remarks.trim()
                          ? l.line_remarks.trim()
                          : "—";

                      return (
                        <tr key={l.id}>
                          <td style={tdLeft}>{item?.name ?? "Unknown item"}</td>
                          <td style={tdCenter}>{dispatched} pcs</td>
                          <td style={tdCenter}>{ordered} pcs</td>
                          <td style={tdCenter}>{pending} pcs</td>
                          <td style={{ ...tdLeft, whiteSpace: "normal" }}>{note}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
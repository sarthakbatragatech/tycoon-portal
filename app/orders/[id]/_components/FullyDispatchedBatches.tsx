// FullyDispatchedBatches.tsx
// @ts-nocheck
"use client";

import useThemeMode from "@/app/_components/useThemeMode";

export default function FullyDispatchedBatches({
  fullyDispatchedLines = [],
  dispatchEvents = [],
  getItemFromRel,
  getLineStats,
  formatDateShort,
  showFinancials = true,
  readOnly = true,
  handleRateChange,
  variant = "screen", // "screen" | "print"
}: any) {
  const isPrint = variant === "print";
  const themeMode = useThemeMode();
  const isLight = themeMode === "light";
  const showRateColumn = showFinancials !== false;
  const canEditRates =
    !isPrint && !readOnly && showRateColumn && typeof handleRateChange === "function";

  const safeLines = Array.isArray(fullyDispatchedLines)
    ? fullyDispatchedLines
    : [];
  const safeEvents = Array.isArray(dispatchEvents) ? dispatchEvents : [];

  const screenBorder = isLight ? "rgba(23,23,23,0.08)" : "rgba(255,255,255,0.10)";
  const screenSurface = isLight ? "rgba(255,255,255,0.52)" : "rgba(255,255,255,0.02)";
  const screenRaised = isLight ? "rgba(23,23,23,0.035)" : "rgba(255,255,255,0.03)";
  const screenRule = isLight ? "rgba(23,23,23,0.07)" : "rgba(255,255,255,0.08)";
  const screenPrimaryText = isLight ? "rgba(23,23,23,0.92)" : "rgba(255,255,255,0.88)";
  const screenSecondaryText = isLight ? "rgba(23,23,23,0.62)" : "rgba(255,255,255,0.65)";
  const screenShadow = isLight
    ? "0 18px 36px rgba(128, 113, 92, 0.08)"
    : "0 0 0 1px rgba(255,255,255,0.04) inset";

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
        border: `1px solid ${screenBorder}`,
        borderRadius: 14,
        background: screenSurface,
        overflow: "hidden",
        boxShadow: screenShadow,
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
        background: screenRaised,
        borderBottom: `1px solid ${screenRule}`,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontSize: 11,
        color: screenPrimaryText,
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
        fontSize: 10.5,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: screenSecondaryText,
        borderBottom: `1px solid ${screenRule}`,
        background: screenRaised,
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
        color: screenPrimaryText,
        borderBottom: `1px solid ${screenRule}`,
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
            fontSize: 12,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: screenPrimaryText,
            opacity: isLight ? 0.86 : 0.9,
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
                <table
                  className={isPrint ? "table" : "table table-mobile-cards"}
                  style={tableStyle}
                >
                  <colgroup>
                    <col style={{ width: showRateColumn ? "28%" : "34%" }} />
                    {showRateColumn && <col style={{ width: "14%" }} />}
                    <col style={{ width: showRateColumn ? "12%" : "14%" }} />
                    <col style={{ width: showRateColumn ? "12%" : "14%" }} />
                    <col style={{ width: showRateColumn ? "12%" : "14%" }} />
                    <col style={{ width: showRateColumn ? "22%" : "24%" }} />
                  </colgroup>

                  <thead>
                    <tr>
                      <th style={thLeft}>Item</th>
                      {showRateColumn && <th style={thCenter}>Rate</th>}
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
                      const rate = Number(l?.dealer_rate_at_order) || 0;
                      const note =
                        typeof l?.line_remarks === "string" && l.line_remarks.trim()
                          ? l.line_remarks.trim()
                          : "—";

                      return (
                        <tr key={l.id}>
                          <td data-label="Item" style={tdLeft}>{item?.name ?? "Unknown item"}</td>
                          {showRateColumn && (
                            <td data-label="Rate" style={tdCenter}>
                              {canEditRates ? (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 6,
                                  }}
                                >
                                  <span style={{ opacity: isLight ? 0.68 : 0.74 }}>₹</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={String(l?.dealer_rate_at_order ?? "")}
                                    onChange={(e) =>
                                      handleRateChange?.(l.id, e.target.value)
                                    }
                                    style={{
                                      width: 84,
                                      textAlign: "right",
                                      padding: "6px 10px",
                                      borderRadius: 999,
                                      border: `1px solid ${isLight ? "rgba(23,23,23,0.16)" : "rgba(255,255,255,0.16)"}`,
                                      background: isLight ? "#ffffff" : "rgba(2,6,23,0.82)",
                                      color: isLight ? "#171717" : "#f5f5f5",
                                      fontSize: 12,
                                    }}
                                  />
                                </div>
                              ) : (
                                `₹ ${rate.toLocaleString("en-IN")}`
                              )}
                            </td>
                          )}
                          <td data-label="Dispatched" style={tdCenter}>{dispatched} pcs</td>
                          <td data-label="Ordered" style={tdCenter}>{ordered} pcs</td>
                          <td data-label="Pending" style={tdCenter}>{pending} pcs</td>
                          <td data-label="Notes" style={{ ...tdLeft, whiteSpace: "normal" }}>{note}</td>
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

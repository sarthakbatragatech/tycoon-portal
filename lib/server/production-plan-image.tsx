import "server-only";

import { ImageResponse } from "next/og";
import {
  type ProductionPlanHierarchyCategoryRow,
  type ProductionPlanSnapshot,
} from "@/lib/server/production-plan";
import { splitProductionPlanHierarchyIntoColumns } from "@/lib/features/production-plan/hierarchy";

const IMAGE_WIDTH = 1600;
const DEFAULT_MIN_HEIGHT = 1100;
const WHATSAPP_MIN_HEIGHT = 900;

export type ProductionPlanImageVariant = "default" | "whatsapp-template";
export type ProductionPlanWhatsappLayout = "inline" | "sidebar" | "grid";

export function resolveProductionPlanWhatsappLayout(
  value: unknown
): ProductionPlanWhatsappLayout {
  if (value === "sidebar" || value === "grid") return value;
  return "sidebar";
}

function formatCount(value: number) {
  return Number(value ?? 0).toLocaleString("en-IN");
}

function estimateCategoryHeight(
  category: ProductionPlanHierarchyCategoryRow,
  compact: boolean
) {
  const categoryHeader = compact ? 56 : 68;
  const familyHeader = compact ? 44 : 50;
  const subfamilyHeader = compact ? 36 : 43;
  const itemHeight = compact ? 36 : 41;
  const sectionSpacing = compact ? 16 : 20;

  return (
    categoryHeader +
    category.families.reduce(
      (familySum, family) =>
        familySum +
        familyHeader +
        family.items.length * itemHeight +
        (family.items.length > 0 ? 12 : 0) +
        family.subfamilies.reduce(
          (subfamilySum, subfamily) =>
            subfamilySum + subfamilyHeader + subfamily.items.length * itemHeight + 12,
          0
        ) +
        sectionSpacing,
      0
    ) +
    18
  );
}

function estimateImageHeight(
  snapshot: ProductionPlanSnapshot,
  compact: boolean,
  columnCount: number
) {
  const columns = splitProductionPlanHierarchyIntoColumns(
    snapshot.hierarchyRows,
    columnCount
  );
  const tallestColumn = Math.max(
    ...columns.map((column) =>
      column.reduce(
        (sum, category) => sum + estimateCategoryHeight(category, compact) + 16,
        0
      )
    ),
    0
  );
  const headerHeight = compact ? 165 : 190;
  const footerHeight = compact ? 50 : 60;
  const verticalPadding = compact ? 68 : 92;
  const renderingSafety = compact ? 120 : 210;
  const minimum = compact ? WHATSAPP_MIN_HEIGHT : DEFAULT_MIN_HEIGHT;

  return Math.max(
    minimum,
    verticalPadding + headerHeight + tallestColumn + footerHeight + renderingSafety
  );
}

function Metric({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        flex: 1,
        minWidth: 0,
        padding: compact ? "12px 16px" : "16px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          marginBottom: 6,
          color: "#7c5c2f",
          fontSize: compact ? 9 : 11,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          color: "#1f1c17",
          fontSize: compact ? 22 : 28,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PlanHeader({
  snapshot,
  compact,
}: {
  snapshot: ProductionPlanSnapshot;
  compact: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-between",
        gap: compact ? 14 : 20,
        marginBottom: compact ? 18 : 24,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flex: 1.05,
          minWidth: 0,
          padding: compact ? "18px 22px" : "24px 28px",
          border: "1px solid rgba(124, 92, 47, 0.14)",
          borderRadius: compact ? 22 : 28,
          background: "rgba(255, 251, 244, 0.82)",
        }}
      >
        <div
          style={{
            display: "flex",
            marginBottom: compact ? 7 : 10,
            color: "#7c5c2f",
            fontSize: compact ? 10 : 13,
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Tycoon Production Planning
        </div>
        <div
          style={{
            display: "flex",
            color: "#1f1c17",
            fontSize: compact ? 34 : 46,
            fontWeight: 900,
            letterSpacing: "-0.045em",
            lineHeight: 1,
          }}
        >
          Production Build Plan
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          flex: 1.35,
          minWidth: 0,
          border: "1px solid rgba(124, 92, 47, 0.12)",
          borderRadius: compact ? 22 : 28,
          background: "rgba(255, 251, 244, 0.86)",
        }}
      >
        <Metric label="Date" value={snapshot.dateLabel} compact={compact} />
        <div
          style={{
            display: "flex",
            width: 1,
            alignSelf: "stretch",
            background: "rgba(124, 92, 47, 0.13)",
          }}
        />
        <Metric
          label="Pending Qty"
          value={`${formatCount(snapshot.totalPending)} pcs`}
          compact={compact}
        />
        <div
          style={{
            display: "flex",
            width: 1,
            alignSelf: "stretch",
            background: "rgba(124, 92, 47, 0.13)",
          }}
        />
        <Metric
          label="Active Orders"
          value={formatCount(snapshot.activeOrderCount)}
          compact={compact}
        />
        <div
          style={{
            display: "flex",
            width: 1,
            alignSelf: "stretch",
            background: "rgba(124, 92, 47, 0.13)",
          }}
        />
        <Metric label="Active Items" value={formatCount(snapshot.itemCount)} compact={compact} />
      </div>
    </div>
  );
}

function Quantity({
  value,
  tone,
  compact,
}: {
  value: number;
  tone: "category" | "family" | "subfamily" | "item";
  compact: boolean;
}) {
  const isCategory = tone === "category";
  const isItem = tone === "item";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: isItem ? "flex-end" : "center",
        minWidth: compact ? (isItem ? 76 : 102) : isItem ? 88 : 118,
        padding: isCategory ? (compact ? "7px 10px" : "9px 13px") : 0,
        border: isCategory ? "1px solid rgba(255, 250, 240, 0.2)" : "none",
        borderRadius: isCategory ? 999 : 0,
        background: isCategory ? "rgba(255, 250, 240, 0.12)" : "transparent",
        color: isCategory ? "#fffaf0" : "#264734",
        fontSize: compact ? (isItem ? 13 : 15) : isItem ? 15 : 17,
        fontWeight: 900,
        letterSpacing: "-0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {formatCount(value)} pcs
    </div>
  );
}

function ItemStats({
  pending,
  activeOrderCount,
  activeOrderTotal,
  compact,
}: {
  pending: number;
  activeOrderCount: number;
  activeOrderTotal: number;
  compact: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: compact ? 6 : 8,
        flexShrink: 0,
      }}
    >
      <Quantity value={pending} tone="item" compact={compact} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: compact ? 76 : 92,
          padding: compact ? "4px 7px" : "5px 9px",
          border: "1px solid rgba(38, 71, 52, 0.16)",
          borderRadius: 999,
          background: "rgba(38, 71, 52, 0.08)",
          color: "#264734",
          fontSize: compact ? 10 : 12,
          fontWeight: 900,
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
        }}
      >
        {formatCount(activeOrderCount)}/{formatCount(activeOrderTotal)} orders
      </div>
    </div>
  );
}

function HierarchyCategory({
  category,
  compact,
  familyLabel,
  activeOrderTotal,
}: {
  category: ProductionPlanHierarchyCategoryRow;
  compact: boolean;
  familyLabel: string;
  activeOrderTotal: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid rgba(38, 71, 52, 0.18)",
        borderRadius: compact ? 20 : 24,
        background: "rgba(255, 252, 247, 0.84)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          padding: compact ? "13px 16px" : "17px 20px",
          background: "#264734",
          color: "#fffaf0",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              marginBottom: 3,
              color: "rgba(255, 250, 240, 0.68)",
              fontSize: compact ? 8 : 9,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Category
          </div>
          <div
            style={{
              display: "flex",
              fontSize: compact ? 20 : 24,
              fontWeight: 900,
              lineHeight: 1.05,
            }}
          >
            {category.category}
          </div>
        </div>
        <Quantity value={category.pending} tone="category" compact={compact} />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: compact ? 9 : 12,
          padding: compact ? 10 : 14,
        }}
      >
        {category.families.map((family) => (
          <div
            key={`${category.category}-${family.family}`}
            style={{
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              border: "1px solid rgba(124, 92, 47, 0.14)",
              borderRadius: compact ? 15 : 18,
              background: "rgba(255, 255, 255, 0.84)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: compact ? "9px 12px" : "12px 15px",
                background: "#ead8b7",
                color: "#2b251c",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    marginBottom: 2,
                    color: "#7c5c2f",
                    fontSize: compact ? 7 : 8,
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  {familyLabel}
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: compact ? 16 : 19,
                    fontWeight: 900,
                    lineHeight: 1.05,
                  }}
                >
                  {family.family}
                </div>
              </div>
              <Quantity value={family.pending} tone="family" compact={compact} />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: compact ? 7 : 9,
                padding: compact ? 8 : 10,
              }}
            >
              {family.items.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    overflow: "hidden",
                    borderRadius: compact ? 9 : 11,
                    background: "rgba(124, 92, 47, 0.1)",
                  }}
                >
                  {family.items.map((item) => (
                    <div
                      key={item.item}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: compact ? "8px 10px" : "10px 12px",
                        background: "rgba(255, 255, 255, 0.94)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flex: 1,
                          minWidth: 0,
                          color: "#2b251c",
                          fontSize: compact ? 13 : 16,
                          fontWeight: 750,
                          lineHeight: 1.2,
                        }}
                      >
                        {item.label}
                      </div>
                      <ItemStats
                        pending={item.pending}
                        activeOrderCount={item.activeOrderCount}
                        activeOrderTotal={activeOrderTotal}
                        compact={compact}
                      />
                    </div>
                  ))}
                </div>
              )}

              {family.subfamilies.map((subfamily) => (
                <div
                  key={`${category.category}-${family.family}-${subfamily.subfamily}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    border: "1px solid rgba(124, 92, 47, 0.1)",
                    borderLeft: "5px solid #c57b38",
                    borderRadius: compact ? 12 : 14,
                    background: "#fbf6ed",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: compact ? "7px 10px" : "10px 12px 8px",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          color: "#9a6837",
                          fontSize: compact ? 7 : 8,
                          fontWeight: 900,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                        }}
                      >
                        Shared platform
                      </div>
                      <div
                        style={{
                          display: "flex",
                          color: "#2b251c",
                          fontSize: compact ? 14 : 17,
                          fontWeight: 850,
                        }}
                      >
                        {subfamily.subfamily}
                      </div>
                    </div>
                    <Quantity value={subfamily.pending} tone="subfamily" compact={compact} />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      margin: compact ? "0 6px 6px" : "0 8px 8px",
                      overflow: "hidden",
                      borderRadius: compact ? 8 : 10,
                      background: "rgba(124, 92, 47, 0.1)",
                    }}
                  >
                    {subfamily.items.map((item) => (
                      <div
                        key={item.item}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: compact ? "7px 9px" : "9px 11px",
                          background: "rgba(255, 255, 255, 0.94)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flex: 1,
                            minWidth: 0,
                            color: "#2b251c",
                            fontSize: compact ? 13 : 15,
                            fontWeight: 700,
                            lineHeight: 1.2,
                          }}
                        >
                          {item.label}
                        </div>
                        <ItemStats
                          pending={item.pending}
                          activeOrderCount={item.activeOrderCount}
                          activeOrderTotal={activeOrderTotal}
                          compact={compact}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductionPlanHierarchyBoard({
  snapshot,
  compact,
  columnCount,
}: {
  snapshot: ProductionPlanSnapshot;
  compact: boolean;
  columnCount: number;
}) {
  const columns = splitProductionPlanHierarchyIntoColumns(
    snapshot.hierarchyRows,
    columnCount
  );
  const familyLabel =
    snapshot.familySource === "inventory" ? "BOM family" : "Family (estimated)";

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: compact ? 10 : 14,
          padding: "0 4px",
          color: "#7c5c2f",
          fontSize: compact ? 9 : 11,
          fontWeight: 900,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
        }}
      >
        <div style={{ display: "flex" }}>Build hierarchy</div>
        <div style={{ display: "flex" }}>All quantities pending</div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: compact ? 12 : 18,
          minWidth: 0,
        }}
      >
        {columns.map((column, columnIndex) => (
          <div
            key={`hierarchy-column-${columnIndex}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: compact ? 12 : 18,
              flex: 1,
              minWidth: 0,
            }}
          >
            {column.map((category) => (
              <HierarchyCategory
                key={category.category}
                category={category}
                compact={compact}
                familyLabel={familyLabel}
                activeOrderTotal={snapshot.activeOrderCount}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductionPlanImage({
  snapshot,
  compact,
  columnCount,
}: {
  snapshot: ProductionPlanSnapshot;
  compact: boolean;
  columnCount: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: compact ? 34 : 46,
        background: "linear-gradient(180deg, #f7f0e4 0%, #f1e6d5 54%, #ecdec9 100%)",
        color: "#1f1c17",
        fontFamily: '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <PlanHeader snapshot={snapshot} compact={compact} />
      <ProductionPlanHierarchyBoard
        snapshot={snapshot}
        compact={compact}
        columnCount={columnCount}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 18,
          marginTop: compact ? 16 : 22,
          padding: "0 4px",
          color: "#6f624f",
          fontSize: compact ? 10 : 13,
        }}
      >
        <div style={{ display: "flex" }}>Generated from the Tycoon Portal backlog view.</div>
        <div style={{ display: "flex" }}>
          {snapshot.familySource === "inventory"
            ? "BOM families synced from inventory"
            : "Family grouping estimated from item names"}
        </div>
      </div>
    </div>
  );
}

export function createProductionPlanImageResponse(
  snapshot: ProductionPlanSnapshot,
  variant: ProductionPlanImageVariant = "default",
  whatsappLayout: ProductionPlanWhatsappLayout = "sidebar"
) {
  const compact = variant === "whatsapp-template";
  const columnCount =
    compact && whatsappLayout === "grid" && snapshot.hierarchyRows.length >= 6 ? 3 : 2;
  const height = estimateImageHeight(snapshot, compact, columnCount);

  return new ImageResponse(
    <ProductionPlanImage
      snapshot={snapshot}
      compact={compact}
      columnCount={columnCount}
    />,
    {
      width: IMAGE_WIDTH,
      height,
    }
  );
}

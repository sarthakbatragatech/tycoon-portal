import "server-only";

import { ImageResponse } from "next/og";
import {
  type ProductionPlanCategoryRow,
  type ProductionPlanFamilyRow,
  type ProductionPlanRow,
  type ProductionPlanSnapshot,
  splitRowsIntoColumns,
} from "@/lib/server/production-plan";

const DEFAULT_IMAGE_WIDTH = 1600;
const TEMPLATE_IMAGE_WIDTH = 1600;
const TEMPLATE_IMAGE_MIN_HEIGHT = 900;

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

function getItemColumns(rows: ProductionPlanRow[]) {
  const columnCount = rows.length > 40 ? 3 : rows.length > 18 ? 2 : 1;
  return splitRowsIntoColumns(rows, columnCount);
}

function getTemplateItemColumns(rows: ProductionPlanRow[]) {
  const columnCount = rows.length > 6 ? 2 : 1;
  return splitRowsIntoColumns(rows, columnCount);
}

function getSummaryColumns<T>(rows: T[]) {
  const columnCount = rows.length > 8 ? 2 : 1;
  return splitRowsIntoColumns(rows, columnCount);
}

function getTemplateSummaryColumns<T>(rows: T[]) {
  const columnCount = rows.length > 8 ? 2 : 1;
  return splitRowsIntoColumns(rows, columnCount);
}

function getWhatsappTemplateItemRows(rows: ProductionPlanRow[]) {
  return rows;
}

function getWhatsappTemplateItemOverflow(rows: ProductionPlanRow[]) {
  return {
    hiddenCount: 0,
    hiddenPending: 0,
  };
}

function getWhatsappTemplateCategoryRows(rows: ProductionPlanCategoryRow[]) {
  return rows;
}

function getWhatsappTemplateFamilyRows(rows: ProductionPlanFamilyRow[]) {
  return rows;
}

function getWhatsappItemColumns(
  rows: ProductionPlanRow[],
  layout: ProductionPlanWhatsappLayout
) {
  const columnCount =
    layout === "grid" ? (rows.length > 12 ? 3 : 2) : 2;
  return splitRowsIntoColumns(rows, columnCount);
}

function estimateWhatsappBlockHeight(
  rowsPerColumn: number,
  kind: "model" | "summary"
) {
  if (kind === "model") {
    return 86 + rowsPerColumn * 58;
  }

  return 82 + rowsPerColumn * 54;
}

function estimateHeight(snapshot: ProductionPlanSnapshot) {
  const itemColumns = getItemColumns(snapshot.itemRows);
  const categoryColumns = getSummaryColumns(snapshot.categoryRows);
  const familyColumns = getSummaryColumns(snapshot.familyRows);

  const itemRowsPerColumn = Math.max(...itemColumns.map((column) => column.length), 0);
  const lowerRowsPerColumn = Math.max(
    ...categoryColumns.map((column) => column.length),
    ...familyColumns.map((column) => column.length),
    0
  );

  const itemSectionHeight = 150 + itemRowsPerColumn * 72;
  const lowerSectionHeight = 170 + lowerRowsPerColumn * 64;

  return Math.max(1380, 430 + itemSectionHeight + lowerSectionHeight);
}

function estimateWhatsappTemplateHeight(
  snapshot: ProductionPlanSnapshot,
  layout: ProductionPlanWhatsappLayout
) {
  const visibleItemRows = getWhatsappTemplateItemRows(snapshot.itemRows);
  const itemOverflow = getWhatsappTemplateItemOverflow(snapshot.itemRows);
  const visibleCategoryRows = getWhatsappTemplateCategoryRows(snapshot.categoryRows);
  const visibleFamilyRows = getWhatsappTemplateFamilyRows(snapshot.familyRows);
  const itemColumns = getWhatsappItemColumns(visibleItemRows, layout);
  const categoryColumns =
    layout === "sidebar"
      ? splitRowsIntoColumns(visibleCategoryRows, 1)
      : getTemplateSummaryColumns(visibleCategoryRows);
  const familyColumns =
    layout === "sidebar"
      ? splitRowsIntoColumns(visibleFamilyRows, 1)
      : getTemplateSummaryColumns(visibleFamilyRows);

  const itemRowsPerColumn = Math.max(...itemColumns.map((column) => column.length), 0);
  const categoryRowsPerColumn = Math.max(
    ...categoryColumns.map((column) => column.length),
    0
  );
  const familyRowsPerColumn = Math.max(
    ...familyColumns.map((column) => column.length),
    0
  );
  const lowerRowsPerColumn = Math.max(
    ...categoryColumns.map((column) => column.length),
    ...familyColumns.map((column) => column.length),
    0
  );

  const topSectionHeight = layout === "sidebar" ? 132 : 158;
  const itemSectionHeight =
    estimateWhatsappBlockHeight(itemRowsPerColumn, "model") +
    (itemOverflow.hiddenCount > 0 ? 28 : 0);
  const lowerSectionHeight = estimateWhatsappBlockHeight(lowerRowsPerColumn, "summary");

  if (layout === "sidebar") {
    const sidebarHeight =
      estimateWhatsappBlockHeight(categoryRowsPerColumn, "summary") +
      estimateWhatsappBlockHeight(familyRowsPerColumn, "summary") +
      16;

    return Math.max(
      TEMPLATE_IMAGE_MIN_HEIGHT,
      92 + topSectionHeight + Math.max(itemSectionHeight, sidebarHeight) + 16
    );
  }

  return Math.max(TEMPLATE_IMAGE_MIN_HEIGHT, 104 + topSectionHeight + itemSectionHeight + lowerSectionHeight);
}

function SectionHeader({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "22px 24px",
        borderRadius: 26,
        border: "1px solid rgba(124, 92, 47, 0.14)",
        background: "rgba(255, 251, 244, 0.82)",
        minWidth: 0,
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#7c5c2f",
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          color: "#1f1c17",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CompactMetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "16px 18px",
        borderRadius: 22,
        border: "1px solid rgba(124, 92, 47, 0.12)",
        background: "rgba(255, 251, 244, 0.86)",
        minWidth: 0,
        flex: 1,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#7c5c2f",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 34,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          color: "#1f1c17",
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CompactMetricStripValue({
  label,
  value,
  flex,
  valueSize,
}: {
  label: string;
  value: string;
  flex: number;
  valueSize: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 6,
        flex,
        minWidth: 0,
        padding: "0 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#7c5c2f",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: valueSize,
          fontWeight: 900,
          letterSpacing: "-0.035em",
          lineHeight: 1,
          color: "#1f1c17",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CompactItemCard({
  title,
  badge,
}: {
  title: string;
  badge: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 18,
        border: "1px solid rgba(124, 92, 47, 0.08)",
        background: "rgba(255, 255, 255, 0.86)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          fontSize: 17,
          fontWeight: 700,
          lineHeight: 1.2,
          color: "#1f1c17",
          whiteSpace: "normal",
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 110,
          padding: "0 0 0 12px",
          color: "#1f1c17",
          fontSize: 18,
          fontWeight: 900,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {badge}
      </div>
    </div>
  );
}

function CompactSummaryListCard<T>({
  title,
  rows,
  getLabel,
  getValue,
}: {
  title: string;
  rows: T[][];
  getLabel: (row: T) => string;
  getValue: (row: T) => string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
        padding: 20,
        borderRadius: 24,
        border: "1px solid rgba(124, 92, 47, 0.12)",
        background: "rgba(255, 252, 247, 0.8)",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#7c5c2f",
          marginBottom: 10,
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          minWidth: 0,
        }}
      >
        {rows.map((column, columnIndex) => (
          <div
            key={`${title}-${columnIndex}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              flex: 1,
              minWidth: 0,
            }}
          >
            {column.map((row, rowIndex) => (
              <div
                key={`${title}-${columnIndex}-${rowIndex}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 16,
                  border: "1px solid rgba(124, 92, 47, 0.08)",
                  background: "rgba(255, 255, 255, 0.88)",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    minWidth: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    color: "#1f1c17",
                    whiteSpace: "normal",
                  }}
                >
                  {getLabel(row)}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 104,
                    padding: "0 0 0 12px",
                    color: "#1f1c17",
                    fontSize: 17,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {getValue(row)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemCard({
  title,
  badge,
}: {
  title: string;
  badge: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 18,
        padding: "16px 18px",
        borderRadius: 18,
        border: "1px solid rgba(124, 92, 47, 0.1)",
        background: "rgba(255, 255, 255, 0.82)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flex: 1,
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.3,
          color: "#1f1c17",
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 126,
          padding: "11px 16px",
          borderRadius: 999,
          background: "#264734",
          color: "#f9f4ea",
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        {badge}
      </div>
    </div>
  );
}

function SummaryListCard<T>({
  title,
  rows,
  getLabel,
  getValue,
}: {
  title: string;
  rows: T[][];
  getLabel: (row: T) => string;
  getValue: (row: T) => string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
        padding: 20,
        borderRadius: 26,
        border: "1px solid rgba(124, 92, 47, 0.12)",
        background: "rgba(255, 252, 247, 0.76)",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#7c5c2f",
          marginBottom: 14,
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: "flex",
          gap: 14,
          minWidth: 0,
        }}
      >
        {rows.map((column, columnIndex) => (
          <div
            key={`${title}-${columnIndex}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flex: 1,
              minWidth: 0,
            }}
          >
            {column.map((row, rowIndex) => (
              <div
                key={`${title}-${columnIndex}-${rowIndex}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 18,
                  border: "1px solid rgba(124, 92, 47, 0.08)",
                  background: "rgba(255, 255, 255, 0.82)",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    minWidth: 0,
                    fontSize: 20,
                    fontWeight: 600,
                    lineHeight: 1.25,
                    color: "#1f1c17",
                  }}
                >
                  {getLabel(row)}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 118,
                    padding: "10px 14px",
                    borderRadius: 999,
                    background: "#264734",
                    color: "#f9f4ea",
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {getValue(row)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductionPlanImage({ snapshot }: { snapshot: ProductionPlanSnapshot }) {
  const itemColumns = getItemColumns(snapshot.itemRows);
  const categoryColumns = getSummaryColumns(snapshot.categoryRows);
  const familyColumns = getSummaryColumns(snapshot.familyRows);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 46,
        background: "linear-gradient(180deg, #f7f0e4 0%, #f1e6d5 54%, #ecdec9 100%)",
        color: "#1f1c17",
        fontFamily:
          '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 24,
          marginBottom: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: 960,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#7c5c2f",
              marginBottom: 12,
            }}
          >
            Tycoon Production Planning
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 50,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: "-0.045em",
            }}
          >
            Pending by Item
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 18,
              color: "#6f624f",
            }}
          >
            Generated from the Tycoon Portal backlog view.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "18px 22px",
            minWidth: 300,
            borderRadius: 24,
            border: "1px solid rgba(124, 92, 47, 0.16)",
            background: "rgba(255, 251, 244, 0.82)",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#7c5c2f",
              marginBottom: 8,
            }}
          >
            Date
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 800,
              lineHeight: 1.2,
            }}
          >
            {snapshot.dateLabel}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 6,
              fontSize: 14,
              color: "#6f624f",
            }}
          >
            IST
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 26,
        }}
      >
        <SectionHeader
          label="Pending Quantity"
          value={`${formatCount(snapshot.totalPending)} pcs`}
        />
        <SectionHeader
          label="Active Items"
          value={formatCount(snapshot.itemCount)}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 18,
          marginBottom: 22,
          alignItems: "stretch",
          minWidth: 0,
        }}
      >
        {itemColumns.map((column, columnIndex) => (
          <div
            key={`items-${columnIndex}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flex: 1,
              minWidth: 0,
              padding: 18,
              borderRadius: 26,
              border: "1px solid rgba(124, 92, 47, 0.12)",
              background: "rgba(255, 252, 247, 0.76)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "0 8px 10px",
                borderBottom: "1px solid rgba(124, 92, 47, 0.18)",
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#7c5c2f",
              }}
            >
              <div style={{ display: "flex" }}>Item</div>
              <div style={{ display: "flex" }}>Pending</div>
            </div>

            {column.map((row) => (
              <ItemCard
                key={`${columnIndex}-${row.item}`}
                title={row.item}
                badge={`${formatCount(row.pending)} pcs`}
              />
            ))}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 18,
          minWidth: 0,
        }}
      >
        <SummaryListCard<ProductionPlanCategoryRow>
          title="Category"
          rows={categoryColumns}
          getLabel={(row) => row.category}
          getValue={(row) => `${formatCount(row.pending)} pcs`}
        />
        <SummaryListCard<ProductionPlanFamilyRow>
          title={
            snapshot.familySource === "inventory" ? "BOM Family" : "BOM Family (fallback)"
          }
          rows={familyColumns}
          getLabel={(row) => row.family}
          getValue={(row) => `${formatCount(row.pending)} pcs`}
        />
      </div>
    </div>
  );
}

function WhatsappHeader({
  snapshot,
  layout,
}: {
  snapshot: ProductionPlanSnapshot;
  layout: ProductionPlanWhatsappLayout;
}) {
  if (layout === "sidebar") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "stretch",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1.55,
            padding: "16px 20px",
            borderRadius: 24,
            border: "1px solid rgba(124, 92, 47, 0.14)",
            background: "rgba(255, 251, 244, 0.82)",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#7c5c2f",
              marginBottom: 8,
            }}
          >
            Tycoon Production Planning
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            Production Plan Snapshot
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            flex: 1.05,
            padding: "12px 0",
            borderRadius: 24,
            border: "1px solid rgba(124, 92, 47, 0.12)",
            background: "rgba(255, 251, 244, 0.86)",
            minWidth: 0,
          }}
        >
          <CompactMetricStripValue
            label="Date"
            value={snapshot.dateLabel}
            flex={1.12}
            valueSize={24}
          />
          <div
            style={{
              display: "flex",
              width: 1,
              alignSelf: "stretch",
              background: "rgba(124, 92, 47, 0.12)",
            }}
          />
          <CompactMetricStripValue
            label="Pending Qty"
            value={`${formatCount(snapshot.totalPending)} pcs`}
            flex={1}
            valueSize={24}
          />
          <div
            style={{
              display: "flex",
              width: 1,
              alignSelf: "stretch",
              background: "rgba(124, 92, 47, 0.12)",
            }}
          />
          <CompactMetricStripValue
            label="Active Items"
            value={formatCount(snapshot.itemCount)}
            flex={0.74}
            valueSize={24}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "stretch",
        gap: 16,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1.4,
          padding: "20px 22px",
          borderRadius: 24,
          border: "1px solid rgba(124, 92, 47, 0.14)",
          background: "rgba(255, 251, 244, 0.82)",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#7c5c2f",
            marginBottom: 10,
          }}
        >
          Tycoon Production Planning
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          Production Plan Snapshot
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          gap: 12,
          minWidth: 0,
        }}
      >
        <CompactMetricCard label="Date" value={snapshot.dateLabel} />
        <CompactMetricCard
          label="Pending Qty"
          value={`${formatCount(snapshot.totalPending)} pcs`}
        />
        <CompactMetricCard label="Active Items" value={formatCount(snapshot.itemCount)} />
      </div>
    </div>
  );
}

function WhatsappInlineRow({
  label,
  value,
  tone = "model",
}: {
  label: string;
  value: string;
  tone?: "model" | "summary" | "summary-compact";
}) {
  const isModel = tone === "model";
  const isCompactSummary = tone === "summary-compact";
  const labelFontSize = isModel ? 18 : isCompactSummary ? 15 : 16;
  const valueFontSize = isModel ? 22 : isCompactSummary ? 18 : 19;
  const gap = isModel ? 10 : isCompactSummary ? 8 : 10;
  const padding = isModel ? "12px 14px" : isCompactSummary ? "10px 14px" : "12px 14px";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap,
        flexWrap: isModel ? "wrap" : "nowrap",
        padding,
        borderRadius: 16,
        border: "1px solid rgba(124, 92, 47, 0.08)",
        background: "rgba(255, 255, 255, 0.88)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: labelFontSize,
          fontWeight: 700,
          lineHeight: 1.18,
          color: "#1f1c17",
          whiteSpace: isCompactSummary ? "nowrap" : "normal",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: valueFontSize,
          fontWeight: 900,
          lineHeight: 1.05,
          color: "#1f1c17",
          whiteSpace: "nowrap",
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function WhatsappSection<T>({
  title,
  rows,
  getLabel,
  getValue,
  columnCount,
  tone = "model",
  flex = 1,
}: {
  title: string;
  rows: T[];
  getLabel: (row: T) => string;
  getValue: (row: T) => string;
  columnCount: number;
  tone?: "model" | "summary" | "summary-compact";
  flex?: number;
}) {
  const columns = splitRowsIntoColumns(rows, columnCount);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex,
        padding: "22px 18px 18px",
        borderRadius: 22,
        border: "1px solid rgba(124, 92, 47, 0.12)",
        background: "rgba(255, 252, 247, 0.8)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          minHeight: 18,
          paddingTop: 2,
          paddingBottom: 2,
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          lineHeight: 1.3,
          color: "#7c5c2f",
          marginBottom: 12,
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          minWidth: 0,
        }}
      >
        {columns.map((column, columnIndex) => (
          <div
            key={`${title}-${columnIndex}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              flex: 1,
              minWidth: 0,
            }}
          >
            {column.map((row, rowIndex) => (
              <WhatsappInlineRow
                key={`${title}-${columnIndex}-${rowIndex}`}
                label={getLabel(row)}
                value={getValue(row)}
                tone={tone}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function WhatsappTemplateProductionPlanImage({
  snapshot,
  layout,
}: {
  snapshot: ProductionPlanSnapshot;
  layout: ProductionPlanWhatsappLayout;
}) {
  const visibleItemRows = getWhatsappTemplateItemRows(snapshot.itemRows);
  const itemOverflow = getWhatsappTemplateItemOverflow(snapshot.itemRows);
  const visibleCategoryRows = getWhatsappTemplateCategoryRows(snapshot.categoryRows);
  const visibleFamilyRows = getWhatsappTemplateFamilyRows(snapshot.familyRows);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 40,
        background: "linear-gradient(180deg, #f7f0e4 0%, #f1e6d5 54%, #ecdec9 100%)",
        color: "#1f1c17",
        fontFamily:
          '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <WhatsappHeader snapshot={snapshot} layout={layout} />

      {layout === "sidebar" ? (
        <div
          style={{
            display: "flex",
            gap: 16,
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <WhatsappSection<ProductionPlanRow>
            title="Model"
            rows={visibleItemRows}
            getLabel={(row) => row.item}
            getValue={(row) => `${formatCount(row.pending)} pcs`}
            columnCount={2}
            tone="model"
            flex={1.6}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              flex: 1,
              minWidth: 0,
            }}
          >
            <WhatsappSection<ProductionPlanCategoryRow>
              title="Category"
              rows={visibleCategoryRows}
              getLabel={(row) => row.category}
              getValue={(row) => `${formatCount(row.pending)} pcs`}
              columnCount={1}
              tone="summary-compact"
            />
            <WhatsappSection<ProductionPlanFamilyRow>
              title={
                snapshot.familySource === "inventory" ? "BOM Family" : "BOM Family (fallback)"
              }
              rows={visibleFamilyRows}
              getLabel={(row) => row.family}
              getValue={(row) => `${formatCount(row.pending)} pcs`}
              columnCount={1}
              tone="summary-compact"
            />
          </div>
        </div>
      ) : layout === "grid" ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minHeight: 0,
          }}
        >
          <WhatsappSection<ProductionPlanRow>
            title="Model"
            rows={visibleItemRows}
            getLabel={(row) => row.item}
            getValue={(row) => `${formatCount(row.pending)} pcs`}
            columnCount={visibleItemRows.length > 12 ? 3 : 2}
            tone="model"
          />

          <div
            style={{
              display: "flex",
              gap: 16,
              minWidth: 0,
            }}
          >
            <WhatsappSection<ProductionPlanCategoryRow>
              title="Category"
              rows={visibleCategoryRows}
              getLabel={(row) => row.category}
              getValue={(row) => `${formatCount(row.pending)} pcs`}
              columnCount={visibleCategoryRows.length > 8 ? 2 : 1}
              tone="summary"
            />
            <WhatsappSection<ProductionPlanFamilyRow>
              title={
                snapshot.familySource === "inventory" ? "BOM Family" : "BOM Family (fallback)"
              }
              rows={visibleFamilyRows}
              getLabel={(row) => row.family}
              getValue={(row) => `${formatCount(row.pending)} pcs`}
              columnCount={visibleFamilyRows.length > 8 ? 2 : 1}
              tone="summary"
            />
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minHeight: 0,
          }}
        >
          <WhatsappSection<ProductionPlanRow>
            title="Model"
            rows={visibleItemRows}
            getLabel={(row) => row.item}
            getValue={(row) => `${formatCount(row.pending)} pcs`}
            columnCount={2}
            tone="model"
          />

          <div
            style={{
              display: "flex",
              gap: 16,
              minWidth: 0,
            }}
          >
            <WhatsappSection<ProductionPlanCategoryRow>
              title="Category"
              rows={visibleCategoryRows}
              getLabel={(row) => row.category}
              getValue={(row) => `${formatCount(row.pending)} pcs`}
              columnCount={1}
              tone="summary"
            />
            <WhatsappSection<ProductionPlanFamilyRow>
              title={
                snapshot.familySource === "inventory" ? "BOM Family" : "BOM Family (fallback)"
              }
              rows={visibleFamilyRows}
              getLabel={(row) => row.family}
              getValue={(row) => `${formatCount(row.pending)} pcs`}
              columnCount={1}
              tone="summary"
            />
          </div>
        </div>
      )}

      {itemOverflow.hiddenCount > 0 && (
        <div
          style={{
            display: "flex",
            marginTop: 12,
            padding: "0 6px",
            fontSize: 13,
            fontWeight: 700,
            color: "#6f624f",
          }}
        >
          {`+${itemOverflow.hiddenCount} more items • ${formatCount(
            itemOverflow.hiddenPending
          )} pcs pending in the portal`}
        </div>
      )}
    </div>
  );
}

export function createProductionPlanImageResponse(
  snapshot: ProductionPlanSnapshot,
  variant: ProductionPlanImageVariant = "default",
  whatsappLayout: ProductionPlanWhatsappLayout = "sidebar"
) {
  if (variant === "whatsapp-template") {
    return new ImageResponse(
      <WhatsappTemplateProductionPlanImage
        snapshot={snapshot}
        layout={whatsappLayout}
      />,
      {
      width: TEMPLATE_IMAGE_WIDTH,
        height: estimateWhatsappTemplateHeight(snapshot, whatsappLayout),
      }
    );
  }

  return new ImageResponse(<ProductionPlanImage snapshot={snapshot} />, {
    width: DEFAULT_IMAGE_WIDTH,
    height: estimateHeight(snapshot),
  });
}

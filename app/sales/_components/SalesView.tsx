"use client";

import type {
  ButtonHTMLAttributes,
  CSSProperties,
  KeyboardEvent,
  ReactNode,
} from "react";

const QUICK_RANGE_OPTIONS = [
  { key: "all", label: "All time" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "last90", label: "Last 90 days" },
];

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ActionButton({
  children,
  className,
  onClick,
  size = "md",
  type = "button",
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={joinClassNames(
        "action-button",
        variant === "primary" ? "primary" : "secondary",
        size === "sm" ? "small" : "",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function PageHeader({
  action,
  note,
  subtitle,
  title,
}: {
  action?: ReactNode;
  note?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        <h1 className="section-title">{title}</h1>
        {subtitle ? <div className="section-subtitle page-header-subtitle">{subtitle}</div> : null}
        {note ? <div className="page-header-note">{note}</div> : null}
      </div>

      {action ? <div className="page-header-actions">{action}</div> : null}
    </div>
  );
}

export function SalesFilters({
  dispatchFrom,
  dispatchTo,
  onClearFilter,
  onDispatchFromChange,
  onDispatchToChange,
  onQuickRange,
  rangeLabel,
}: {
  dispatchFrom: string;
  dispatchTo: string;
  onClearFilter: () => void;
  onDispatchFromChange: (value: string) => void;
  onDispatchToChange: (value: string) => void;
  onQuickRange: (value: string) => void;
  rangeLabel: string;
}) {
  const hasDateFilter = Boolean(dispatchFrom || dispatchTo);

  return (
    <section className="filters-panel" aria-label="Sales filters">
      <div className="filters-row">
        <div className="filters-row-heading">Quick range</div>

        <div className="filter-pill-group">
          {QUICK_RANGE_OPTIONS.map((option) => (
            <ActionButton
              key={option.key}
              size="sm"
              variant="secondary"
              onClick={() => onQuickRange(option.key)}
            >
              {option.label}
            </ActionButton>
          ))}
        </div>

        <div className="filter-summary">
          Range: <b>{rangeLabel}</b>
        </div>
      </div>

      {!hasDateFilter ? (
        <div className="filter-helper">
          All time uses current dispatched quantities from orders, so older shipped lines still count
          even if they do not have dated dispatch events.
        </div>
      ) : null}

      <div className="filters-row filters-row-fields">
        <div className="filters-row-heading">Filter by dispatch date</div>

        <div className="filter-field-group">
          <label className="compact-field">
            <span>From</span>
            <input
              type="date"
              value={dispatchFrom}
              onChange={(event) => onDispatchFromChange(event.target.value)}
              className="compact-input"
            />
          </label>

          <label className="compact-field">
            <span>To</span>
            <input
              type="date"
              value={dispatchTo}
              onChange={(event) => onDispatchToChange(event.target.value)}
              className="compact-input"
            />
          </label>
        </div>

        {hasDateFilter ? (
          <ActionButton size="sm" variant="secondary" onClick={onClearFilter}>
            Clear filter
          </ActionButton>
        ) : null}
      </div>
    </section>
  );
}

export function SectionCard({
  action,
  children,
  className,
  footer,
  label,
  meta,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  label?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className={joinClassNames("card", "stacked-card", className)}>
      {label || meta || action ? (
        <div className="section-card-header">
          <div className="section-card-copy">
            {label ? <div className="card-label">{label}</div> : null}
            {meta ? <div className="card-meta">{meta}</div> : null}
          </div>

          {action ? <div className="section-card-actions">{action}</div> : null}
        </div>
      ) : null}

      {children}

      {footer ? <div className="section-card-footer">{footer}</div> : null}
    </section>
  );
}

export function StatusMessage({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "warning";
}) {
  return <div className={joinClassNames("status-message", tone === "warning" ? "warning" : "")}>{children}</div>;
}

export function MetricCard({
  label,
  meta,
  value,
}: {
  label: ReactNode;
  meta?: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="card metric-card">
      <div className="card-label">{label}</div>
      <div className="card-value metric-card-value">{value}</div>
      {meta ? <div className="card-meta">{meta}</div> : null}
    </div>
  );
}

type TableColumn<T> = {
  key: string;
  header: string;
  headerStyle?: CSSProperties;
  mobileLabel?: string;
  render: (row: T) => ReactNode;
  tdClassName?: string;
};

type ResponsiveTableProps<T> = {
  columns: TableColumn<T>[];
  emptyMessage: ReactNode;
  isRowActive?: (row: T) => boolean;
  onRowClick?: (row: T) => void;
  rows: T[];
  rowKey: (row: T) => string;
};

function handleRowKeyDown<T>(
  event: KeyboardEvent<HTMLTableRowElement>,
  onRowClick: ((row: T) => void) | undefined,
  row: T
) {
  if (!onRowClick) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onRowClick(row);
  }
}

export function ResponsiveTable<T>({
  columns,
  emptyMessage,
  isRowActive,
  onRowClick,
  rows,
  rowKey,
}: ResponsiveTableProps<T>) {
  return (
    <div className="table-wrapper table-wrapper-spacious">
      <table className="table table-mobile-cards">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={column.headerStyle}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty-cell">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const interactive = Boolean(onRowClick);
              const active = isRowActive?.(row);

              return (
                <tr
                  key={rowKey(row)}
                  className={joinClassNames(
                    interactive ? "table-row-interactive" : "",
                    active ? "table-row-active" : ""
                  )}
                  onClick={interactive ? () => onRowClick?.(row) : undefined}
                  onKeyDown={(event) => handleRowKeyDown(event, onRowClick, row)}
                  role={interactive ? "button" : undefined}
                  tabIndex={interactive ? 0 : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-label={column.mobileLabel || column.header}
                      className={column.tdClassName}
                    >
                      <div className="table-cell-value">{column.render(row)}</div>
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

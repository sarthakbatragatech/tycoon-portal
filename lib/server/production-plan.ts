import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export const PRODUCTION_ACTIVE_STATUSES = [
  "pending",
  "submitted",
  "in_production",
  "packed",
  "partially_dispatched",
] as const;

export type ProductionPlanInputRow = {
  item?: string;
  pending?: number;
};

export type ProductionPlanRow = {
  item: string;
  pending: number;
  category: string;
};

export type ProductionPlanCategoryRow = {
  category: string;
  pending: number;
};

export type ProductionPlanFamilyRow = {
  family: string;
  pending: number;
};

export type ProductionPlanSnapshot = {
  generatedAtIso: string;
  dateLabel: string;
  fileDatePart: string;
  totalPending: number;
  itemCount: number;
  itemRows: ProductionPlanRow[];
  categoryRows: ProductionPlanCategoryRow[];
  familyRows: ProductionPlanFamilyRow[];
  familySource: "inventory" | "fallback";
};

type MainOrderRow = {
  status: string | null;
  order_lines:
    | {
        qty: number | null;
        dispatched_qty: number | null | string;
        items:
          | {
              name: string | null;
              category: string | null;
              company: string | null;
            }
          | {
              name: string | null;
              category: string | null;
              company: string | null;
            }[]
          | null;
      }[]
    | null;
};

type BomModelRow = {
  id: string;
  fg_name: string | null;
  fg_sku: string | null;
};

type BomVersionRow = {
  id: string;
  bom_model_id: string;
  version_no: number | null;
  effective_from: string | null;
  created_at: string | null;
};

type BomLineRow = {
  bom_version_id: string | null;
  items?: { family?: string | null } | { family?: string | null }[] | null;
};

const IST_LABEL_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const IST_FILE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export class InventoryPortalConfigError extends Error {
  constructor(message = "Inventory portal credentials are not configured.") {
    super(message);
    this.name = "InventoryPortalConfigError";
  }
}

function safeFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function normalizeItemKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isSpareCategory(category: unknown) {
  const value = String(category ?? "").trim().toLowerCase();
  return (
    value === "spare" ||
    value === "spares" ||
    value === "spare parts" ||
    value === "spare part"
  );
}

function formatCategoryLabel(category: unknown) {
  const value = String(category ?? "").trim();
  if (!value) return "Uncategorised";

  return value
    .split(/\s+/)
    .map((part) =>
      part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : part
    )
    .join(" ");
}

function inferFamilyLabel(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Unknown";

  const familyMatch = raw.toUpperCase().match(/^FR-[A-Z0-9]+/);
  if (familyMatch) return familyMatch[0];

  const firstToken = raw.split(/\s+/)[0];
  return firstToken || raw;
}

export function getBomFamilyLabel(itemName: unknown) {
  const value = String(itemName ?? "").trim();
  if (!value) return "Unknown";

  const modelPrefix = value.match(/^[A-Za-z]+-[A-Za-z0-9]+/);
  if (modelPrefix) return modelPrefix[0];

  return value.split(/\s+/)[0] || value;
}

export function formatIstDateLabel(date: Date = new Date()) {
  return IST_LABEL_FORMATTER.format(date);
}

export function formatIstDateFilePart(date: Date = new Date()) {
  const parts = IST_FILE_FORMATTER.formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "00";

  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function splitRowsIntoColumns<T>(rows: T[], columnCount: number) {
  if (!rows.length) return [] as T[][];

  const size = Math.ceil(rows.length / columnCount);
  return Array.from({ length: columnCount }, (_, index) =>
    rows.slice(index * size, (index + 1) * size)
  ).filter((column) => column.length > 0);
}

export function normalizeProductionPlanRows(input: unknown): ProductionPlanRow[] {
  const rows = Array.isArray(input) ? input : [];

  return rows
    .map((row) => {
      const item = String((row as ProductionPlanInputRow)?.item ?? "").trim();
      const pending = Number((row as ProductionPlanInputRow)?.pending ?? 0) || 0;

      return {
        item,
        pending,
        category: "Uncategorised",
      };
    })
    .filter((row) => row.item !== "" && row.pending > 0);
}

function chooseLatestVersion(current: BomVersionRow | null, candidate: BomVersionRow) {
  if (!current) return candidate;

  const currentEffective = current.effective_from ? new Date(current.effective_from).getTime() : -Infinity;
  const candidateEffective = candidate.effective_from ? new Date(candidate.effective_from).getTime() : -Infinity;
  if (candidateEffective !== currentEffective) {
    return candidateEffective > currentEffective ? candidate : current;
  }

  const currentVersion = Number(current.version_no ?? 0);
  const candidateVersion = Number(candidate.version_no ?? 0);
  if (candidateVersion !== currentVersion) {
    return candidateVersion > currentVersion ? candidate : current;
  }

  const currentCreated = current.created_at ? new Date(current.created_at).getTime() : -Infinity;
  const candidateCreated = candidate.created_at ? new Date(candidate.created_at).getTime() : -Infinity;
  return candidateCreated > currentCreated ? candidate : current;
}

export function buildProductionPlanCategoryRows(rows: ProductionPlanRow[]) {
  const byCategory = new Map<string, ProductionPlanCategoryRow>();

  for (const row of rows) {
    const category = formatCategoryLabel(row.category);
    if (!byCategory.has(category)) {
      byCategory.set(category, {
        category,
        pending: 0,
      });
    }

    const aggregate = byCategory.get(category)!;
    aggregate.pending += Number(row.pending ?? 0);
  }

  return Array.from(byCategory.values()).sort((a, b) => {
    if (b.pending !== a.pending) return b.pending - a.pending;
    return a.category.localeCompare(b.category);
  });
}

export function buildFallbackProductionPlanFamilyRows(rows: ProductionPlanRow[]) {
  const byFamily = new Map<string, ProductionPlanFamilyRow>();

  for (const row of rows) {
    const family = getBomFamilyLabel(row.item);
    if (!byFamily.has(family)) {
      byFamily.set(family, {
        family,
        pending: 0,
      });
    }

    const aggregate = byFamily.get(family)!;
    aggregate.pending += Number(row.pending ?? 0);
  }

  return Array.from(byFamily.values()).sort((a, b) => {
    if (b.pending !== a.pending) return b.pending - a.pending;
    return a.family.localeCompare(b.family);
  });
}

export async function loadTycoonProductionPlanRows() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select(
      `
      status,
      order_lines (
        qty,
        dispatched_qty,
        items (
          name,
          category,
          company
        )
      )
    `
    )
    .in("status", [...PRODUCTION_ACTIVE_STATUSES]);

  if (error) {
    throw new Error(`Could not load order data for the production plan: ${error.message}`);
  }

  const byItem = new Map<string, ProductionPlanRow>();

  for (const order of (data || []) as MainOrderRow[]) {
    const lines = Array.isArray(order?.order_lines) ? order.order_lines : [];

    for (const line of lines) {
      const item = safeFirst(line?.items);
      if ((item?.company || "") !== "Tycoon") continue;

      const category = String(item?.category ?? "").trim() || "Uncategorised";
      if (isSpareCategory(category)) continue;

      const ordered = Number(line?.qty ?? 0) || 0;
      if (ordered <= 0) continue;

      const rawDispatched =
        line?.dispatched_qty === "" || line?.dispatched_qty == null
          ? 0
          : Number(line.dispatched_qty);

      let dispatched = Number.isNaN(rawDispatched) ? 0 : rawDispatched;
      if (dispatched < 0) dispatched = 0;
      if (dispatched > ordered) dispatched = ordered;

      const pending = Math.max(ordered - dispatched, 0);
      if (pending <= 0) continue;

      const itemName = String(item?.name ?? "").trim() || "Unknown item";

      if (!byItem.has(itemName)) {
        byItem.set(itemName, {
          item: itemName,
          pending: 0,
          category,
        });
      }

      const aggregate = byItem.get(itemName)!;
      aggregate.pending += pending;
    }
  }

  return Array.from(byItem.values()).sort((a, b) => {
    if (b.pending !== a.pending) return b.pending - a.pending;
    return a.item.localeCompare(b.item);
  });
}

export async function resolveProductionPlanFamilyRows(inputRows: ProductionPlanInputRow[]) {
  const rows = normalizeProductionPlanRows(inputRows);
  if (!rows.length) return [] as ProductionPlanFamilyRow[];

  const url = process.env.INVENTORY_PORTAL_SUPABASE_URL;
  const secret = process.env.INVENTORY_PORTAL_SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new InventoryPortalConfigError();
  }

  const inventory = createClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: bomModels, error: bomModelsError } = await inventory
    .from("bom_models")
    .select("id, fg_name, fg_sku");

  if (bomModelsError) {
    throw new Error("Could not load BOM models from inventory portal.");
  }

  const modelByName = new Map<string, BomModelRow>();
  for (const model of (bomModels || []) as BomModelRow[]) {
    const key = normalizeItemKey(model?.fg_name);
    if (key && !modelByName.has(key)) {
      modelByName.set(key, model);
    }
  }

  const matchedModels = rows
    .map((row) => modelByName.get(normalizeItemKey(row.item)))
    .filter((model): model is BomModelRow => Boolean(model));

  const latestVersionByModelId = new Map<string, BomVersionRow>();

  if (matchedModels.length) {
    const modelIds = Array.from(new Set(matchedModels.map((model) => model.id)));

    const { data: bomVersions, error: bomVersionsError } = await inventory
      .from("bom_versions")
      .select("id, bom_model_id, version_no, effective_from, created_at")
      .in("bom_model_id", modelIds);

    if (bomVersionsError) {
      throw new Error("Could not load BOM versions from inventory portal.");
    }

    for (const version of (bomVersions || []) as BomVersionRow[]) {
      const current = latestVersionByModelId.get(version.bom_model_id) ?? null;
      latestVersionByModelId.set(
        version.bom_model_id,
        chooseLatestVersion(current, version)
      );
    }
  }

  const versionIds = Array.from(latestVersionByModelId.values())
    .map((version) => version?.id)
    .filter((value): value is string => Boolean(value));

  const familyCountsByVersionId = new Map<string, Map<string, number>>();

  if (versionIds.length) {
    const { data: bomLines, error: bomLinesError } = await inventory
      .from("bom_lines")
      .select(
        `
        bom_version_id,
        items:component_item_id (
          family
        )
      `
      )
      .in("bom_version_id", versionIds);

    if (bomLinesError) {
      throw new Error("Could not load BOM lines from inventory portal.");
    }

    for (const line of (bomLines || []) as BomLineRow[]) {
      const versionId = String(line?.bom_version_id ?? "");
      if (!versionId) continue;

      const item = safeFirst(line?.items);
      const family = String(item?.family ?? "").trim();
      if (!family) continue;

      if (!familyCountsByVersionId.has(versionId)) {
        familyCountsByVersionId.set(versionId, new Map<string, number>());
      }

      const counts = familyCountsByVersionId.get(versionId)!;
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
  }

  const familyByModelName = new Map<string, string>();

  for (const model of matchedModels) {
    const normalizedName = normalizeItemKey(model?.fg_name);
    const latestVersion = latestVersionByModelId.get(model.id);
    const counts = latestVersion ? familyCountsByVersionId.get(latestVersion.id) : null;

    let dominantFamily = "";
    let dominantCount = -1;

    counts?.forEach((count, family) => {
      if (count > dominantCount) {
        dominantFamily = family;
        dominantCount = count;
      }
    });

    familyByModelName.set(
      normalizedName,
      dominantFamily || inferFamilyLabel(model?.fg_sku || model?.fg_name)
    );
  }

  const byFamily = new Map<string, ProductionPlanFamilyRow>();

  for (const row of rows) {
    const key = normalizeItemKey(row.item);
    const family = familyByModelName.get(key) || inferFamilyLabel(row.item);

    if (!byFamily.has(family)) {
      byFamily.set(family, { family, pending: 0 });
    }

    const aggregate = byFamily.get(family)!;
    aggregate.pending += row.pending;
  }

  return Array.from(byFamily.values()).sort((a, b) => {
    if (b.pending !== a.pending) return b.pending - a.pending;
    return a.family.localeCompare(b.family);
  });
}

export async function loadProductionPlanSnapshot(): Promise<ProductionPlanSnapshot> {
  const generatedAt = new Date();
  const itemRows = await loadTycoonProductionPlanRows();
  const fallbackFamilyRows = buildFallbackProductionPlanFamilyRows(itemRows);

  let familyRows = fallbackFamilyRows;
  let familySource: ProductionPlanSnapshot["familySource"] = "fallback";

  try {
    const resolvedFamilyRows = await resolveProductionPlanFamilyRows(itemRows);
    if (resolvedFamilyRows.length > 0) {
      familyRows = resolvedFamilyRows;
      familySource = "inventory";
    }
  } catch (error) {
    console.warn(
      "Falling back to item-name production plan families for automation.",
      error
    );
  }

  return {
    generatedAtIso: generatedAt.toISOString(),
    dateLabel: formatIstDateLabel(generatedAt),
    fileDatePart: formatIstDateFilePart(generatedAt),
    totalPending: itemRows.reduce((sum, row) => sum + row.pending, 0),
    itemCount: itemRows.length,
    itemRows,
    categoryRows: buildProductionPlanCategoryRows(itemRows),
    familyRows,
    familySource,
  };
}

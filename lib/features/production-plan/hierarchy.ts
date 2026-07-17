export type ProductionPlanHierarchyInputRow = {
  item: string;
  pending: number;
  category?: string | null;
  activeOrderCount?: number;
};

export type ProductionPlanItemFamilyRow = {
  item: string;
  family: string;
};

export type ProductionPlanHierarchyItemRow = {
  item: string;
  label: string;
  pending: number;
  activeOrderCount: number;
};

export type ProductionPlanHierarchySubfamilyRow = {
  subfamily: string;
  pending: number;
  items: ProductionPlanHierarchyItemRow[];
};

export type ProductionPlanHierarchyFamilyRow = {
  family: string;
  pending: number;
  items: ProductionPlanHierarchyItemRow[];
  subfamilies: ProductionPlanHierarchySubfamilyRow[];
};

export type ProductionPlanHierarchyCategoryRow = {
  category: string;
  pending: number;
  families: ProductionPlanHierarchyFamilyRow[];
};

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function formatProductionPlanCategoryLabel(value: unknown) {
  const category = String(value ?? "").trim();
  if (!category) return "Uncategorised";

  return category
    .split(/\s+/)
    .map((part) =>
      part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : part
    )
    .join(" ");
}

export function getFallbackProductionPlanFamilyLabel(itemName: unknown) {
  const item = String(itemName ?? "").trim();
  if (!item) return "Unknown";

  const modelPrefix = item.match(/^[A-Za-z]+-[A-Za-z0-9]+/);
  if (modelPrefix) return modelPrefix[0].toUpperCase();

  return item.split(/\s+/)[0] || item;
}

export function getProductionPlanSubfamilyLabel(itemName: unknown) {
  const item = String(itemName ?? "").trim();
  if (!item) return "Other";

  // These models share the same wheel, frame and box platform across finishes.
  if (/^FR-(?:728|788)(?:\s|$)/i.test(item)) return "728 / 788";

  const modelMatch = item.match(/^([A-Za-z]+)-([A-Za-z0-9]+)/);
  if (!modelMatch) return item.split(/\s+/)[0] || item;

  const manufacturer = modelMatch[1].toUpperCase();
  const model = modelMatch[2];

  if (/^\d+$/.test(model)) return model;

  const readableModel = `${model.charAt(0).toUpperCase()}${model.slice(1).toLowerCase()}`;
  return manufacturer === "FR" ? readableModel : `${manufacturer}-${readableModel}`;
}

export function getProductionPlanFamilyLabel(
  itemName: unknown,
  resolvedFamily: unknown
) {
  const item = String(itemName ?? "").trim();

  if (/^FR-AVENGER(?:\s|$)/i.test(item)) return "FR-009/Avenger";
  if (/^FR-CRUZER(?:\s|$)/i.test(item)) return "FR-Cruzer";
  if (/^FR-EVEREST(?:\s|$)/i.test(item)) return "Everest";
  if (/^FR-900(?:\s|$)/i.test(item)) return "900";
  if (/^FR-1188(?:\s|$)/i.test(item)) return "FR-1188/Smile";
  if (/^FR-2188(?:\s|$)/i.test(item)) return "FR-2188";
  if (/^FR-502(?:\s|$)/i.test(item)) return "BH";

  return String(resolvedFamily ?? "").trim() ||
    getFallbackProductionPlanFamilyLabel(item);
}

export function formatProductionPlanItemLabel(itemName: unknown) {
  const item = String(itemName ?? "").trim();

  if (/^FR-AVENGER\s+LIMITED\s+EDITION\s+RC$/i.test(item)) {
    return "Avenger LE RC";
  }
  if (/^FR-AVENGER\s+LIMITED\s+EDITION$/i.test(item)) {
    return "Avenger LE";
  }
  if (/^FR-AVENGER\s+(?:H\/?R|HR)$/i.test(item)) {
    return "Avenger H/R (Handrace)";
  }
  if (/^FR-AVENGER\s+RC$/i.test(item)) return "Avenger RC";
  if (/^FR-AVENGER$/i.test(item)) return "Avenger";

  return item;
}

export function productionPlanFamilyHasSubfamilies(family: unknown) {
  return !new Set([
    "FR-009/Avenger",
    "FR-Cruzer",
    "Everest",
    "900",
    "FR-1188/Smile",
    "FR-2188",
  ]).has(String(family ?? "").trim());
}

function sortProductionPlanFamilyItems(
  family: string,
  items: ProductionPlanHierarchyItemRow[]
) {
  if (family === "FR-009/Avenger") {
    const avengerOrder = [
      /^FR-AVENGER$/i,
      /^FR-AVENGER\s+LIMITED\s+EDITION$/i,
      /^FR-AVENGER\s+RC$/i,
      /^FR-AVENGER\s+LIMITED\s+EDITION\s+RC$/i,
      /^FR-AVENGER\s+(?:H\/?R|HR)$/i,
    ];

    return items.sort((a, b) => {
      const aRank = avengerOrder.findIndex((pattern) => pattern.test(a.item));
      const bRank = avengerOrder.findIndex((pattern) => pattern.test(b.item));
      const safeARank = aRank === -1 ? avengerOrder.length : aRank;
      const safeBRank = bRank === -1 ? avengerOrder.length : bRank;

      if (safeARank !== safeBRank) return safeARank - safeBRank;
      return a.label.localeCompare(b.label);
    });
  }

  return items.sort((a, b) => {
    if (b.pending !== a.pending) return b.pending - a.pending;
    return a.label.localeCompare(b.label);
  });
}

export function buildFallbackProductionPlanItemFamilyRows(
  rows: ProductionPlanHierarchyInputRow[]
): ProductionPlanItemFamilyRow[] {
  return rows.map((row) => ({
    item: row.item,
    family: getFallbackProductionPlanFamilyLabel(row.item),
  }));
}

export function buildProductionPlanFamilyRows(
  rows: ProductionPlanHierarchyInputRow[],
  itemFamilyRows: ProductionPlanItemFamilyRow[]
) {
  const familyByItem = new Map(
    itemFamilyRows.map((row) => [normalizeKey(row.item), row.family] as const)
  );
  const byFamily = new Map<string, { family: string; pending: number }>();

  for (const row of rows) {
    const family = getProductionPlanFamilyLabel(
      row.item,
      familyByItem.get(normalizeKey(row.item))
    );

    if (!byFamily.has(family)) {
      byFamily.set(family, { family, pending: 0 });
    }

    byFamily.get(family)!.pending += Number(row.pending ?? 0);
  }

  return Array.from(byFamily.values()).sort((a, b) => {
    if (b.pending !== a.pending) return b.pending - a.pending;
    return a.family.localeCompare(b.family);
  });
}

export function buildProductionPlanHierarchy(
  rows: ProductionPlanHierarchyInputRow[],
  itemFamilyRows: ProductionPlanItemFamilyRow[]
): ProductionPlanHierarchyCategoryRow[] {
  const familyByItem = new Map(
    itemFamilyRows.map((row) => [normalizeKey(row.item), row.family] as const)
  );
  const categories = new Map<
    string,
    {
      category: string;
      pending: number;
      families: Map<
        string,
        {
          family: string;
          pending: number;
          items: ProductionPlanHierarchyItemRow[];
          subfamilies: Map<
            string,
            {
              subfamily: string;
              pending: number;
              items: ProductionPlanHierarchyItemRow[];
            }
          >;
        }
      >;
    }
  >();

  for (const row of rows) {
    const pending = Number(row.pending ?? 0);
    if (!row.item || pending <= 0) continue;

    const category = formatProductionPlanCategoryLabel(row.category);
    const family = getProductionPlanFamilyLabel(
      row.item,
      familyByItem.get(normalizeKey(row.item))
    );
    const subfamily = getProductionPlanSubfamilyLabel(row.item);
    const itemRow = {
      item: row.item,
      label: formatProductionPlanItemLabel(row.item),
      pending,
      activeOrderCount: Math.max(0, Number(row.activeOrderCount ?? 0) || 0),
    };

    if (!categories.has(category)) {
      categories.set(category, {
        category,
        pending: 0,
        families: new Map(),
      });
    }

    const categoryGroup = categories.get(category)!;
    categoryGroup.pending += pending;

    if (!categoryGroup.families.has(family)) {
      categoryGroup.families.set(family, {
        family,
        pending: 0,
        items: [],
        subfamilies: new Map(),
      });
    }

    const familyGroup = categoryGroup.families.get(family)!;
    familyGroup.pending += pending;

    if (!productionPlanFamilyHasSubfamilies(family)) {
      familyGroup.items.push(itemRow);
      continue;
    }

    if (!familyGroup.subfamilies.has(subfamily)) {
      familyGroup.subfamilies.set(subfamily, {
        subfamily,
        pending: 0,
        items: [],
      });
    }

    const subfamilyGroup = familyGroup.subfamilies.get(subfamily)!;
    subfamilyGroup.pending += pending;
    subfamilyGroup.items.push(itemRow);
  }

  const byPendingThenLabel = <T extends { pending: number }>(
    label: (row: T) => string
  ) => (a: T, b: T) => {
    if (b.pending !== a.pending) return b.pending - a.pending;
    return label(a).localeCompare(label(b));
  };

  return Array.from(categories.values())
    .map((category) => ({
      category: category.category,
      pending: category.pending,
      families: Array.from(category.families.values())
        .map((family) => ({
          family: family.family,
          pending: family.pending,
          items: sortProductionPlanFamilyItems(family.family, family.items),
          subfamilies: Array.from(family.subfamilies.values())
            .map((subfamily) => ({
              subfamily: subfamily.subfamily,
              pending: subfamily.pending,
              items: subfamily.items.sort(
                byPendingThenLabel((item) => item.item)
              ),
            }))
            .sort(byPendingThenLabel((subfamily) => subfamily.subfamily)),
        }))
        .sort(byPendingThenLabel((family) => family.family)),
    }))
    .sort(byPendingThenLabel((category) => category.category));
}

export function getProductionPlanHierarchyWeight(
  category: ProductionPlanHierarchyCategoryRow
) {
  const familyCount = category.families.length;
  const subfamilyCount = category.families.reduce(
    (sum, family) => sum + family.subfamilies.length,
    0
  );
  const itemCount = category.families.reduce(
    (sum, family) =>
      sum +
      family.items.length +
      family.subfamilies.reduce(
        (subfamilySum, subfamily) => subfamilySum + subfamily.items.length,
        0
      ),
    0
  );

  return 2.4 + familyCount * 1.25 + subfamilyCount * 0.9 + itemCount;
}

export function splitProductionPlanHierarchyIntoColumns(
  rows: ProductionPlanHierarchyCategoryRow[],
  columnCount: number
) {
  if (!rows.length || columnCount <= 0) return [] as ProductionPlanHierarchyCategoryRow[][];

  const columns = Array.from({ length: columnCount }, () => ({
    weight: 0,
    rows: [] as ProductionPlanHierarchyCategoryRow[],
  }));

  for (const row of rows) {
    const target = columns.reduce((lightest, column) =>
      column.weight < lightest.weight ? column : lightest
    );
    target.rows.push(row);
    target.weight += getProductionPlanHierarchyWeight(row);
  }

  return columns.map((column) => column.rows).filter((column) => column.length > 0);
}

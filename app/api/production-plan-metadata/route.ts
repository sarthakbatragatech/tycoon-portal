import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ProductionPlanRow = {
  item?: string;
  pending?: number;
};

type NormalizedPlanRow = {
  item: string;
  pending: number;
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

function normalizeItemKey(value: any) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function inferFamilyLabel(value: any) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Unknown";

  const familyMatch = raw.toUpperCase().match(/^FR-[A-Z0-9]+/);
  if (familyMatch) return familyMatch[0];

  const firstToken = raw.split(/\s+/)[0];
  return firstToken || raw;
}

function safeFirst(rel: any) {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

function chooseLatestVersion(current: any, candidate: any) {
  if (!current) return candidate;

  const currentEffective = current?.effective_from ? new Date(current.effective_from).getTime() : -Infinity;
  const candidateEffective = candidate?.effective_from ? new Date(candidate.effective_from).getTime() : -Infinity;
  if (candidateEffective !== currentEffective) {
    return candidateEffective > currentEffective ? candidate : current;
  }

  const currentVersion = Number(current?.version_no ?? 0);
  const candidateVersion = Number(candidate?.version_no ?? 0);
  if (candidateVersion !== currentVersion) {
    return candidateVersion > currentVersion ? candidate : current;
  }

  const currentCreated = current?.created_at ? new Date(current.created_at).getTime() : -Infinity;
  const candidateCreated = candidate?.created_at ? new Date(candidate.created_at).getTime() : -Infinity;
  return candidateCreated > currentCreated ? candidate : current;
}

export async function POST(request: Request) {
  const url = process.env.INVENTORY_PORTAL_SUPABASE_URL;
  const secret = process.env.INVENTORY_PORTAL_SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    return NextResponse.json(
      { error: "Inventory portal credentials are not configured." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const incomingRows = Array.isArray(body?.rows) ? body.rows : [];

  const rows: NormalizedPlanRow[] = incomingRows
    .map((row: ProductionPlanRow) => ({
      item: String(row?.item ?? "").trim(),
      pending: Number(row?.pending ?? 0) || 0,
    }))
    .filter((row: NormalizedPlanRow) => row.item !== "" && row.pending > 0);

  if (!rows.length) {
    return NextResponse.json({ familyRows: [] });
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
    return NextResponse.json(
      { error: "Could not load BOM models from inventory portal." },
      { status: 502 }
    );
  }

  const modelByName = new Map<string, BomModelRow>();
  for (const model of (bomModels || []) as BomModelRow[]) {
    const key = normalizeItemKey(model?.fg_name);
    if (key && !modelByName.has(key)) {
      modelByName.set(key, model);
    }
  }

  const matchedModels: BomModelRow[] = rows
    .map((row) => modelByName.get(normalizeItemKey(row.item)))
    .filter((model): model is BomModelRow => Boolean(model));

  const latestVersionByModelId = new Map<string, BomVersionRow>();

  if (matchedModels.length) {
    const modelIds = Array.from(new Set(matchedModels.map((model) => model.id)));

    const { data: bomVersions, error: bomVersionsError } = await inventory
      .from("bom_versions")
      .select("id, bom_model_id, version_no, effective_from, created_at")
      .in("bom_model_id", modelIds);

    if (!bomVersionsError) {
      for (const version of (bomVersions || []) as BomVersionRow[]) {
        const current = latestVersionByModelId.get(version.bom_model_id);
        latestVersionByModelId.set(
          version.bom_model_id,
          chooseLatestVersion(current, version)
        );
      }
    }
  }

  const versionIds = Array.from(latestVersionByModelId.values())
    .map((version) => version?.id)
    .filter(Boolean);

  const familyCountsByVersionId = new Map<string, Map<string, number>>();

  if (versionIds.length) {
    const { data: bomLines } = await inventory
      .from("bom_lines")
      .select(`
        bom_version_id,
        items:component_item_id (
          family
        )
      `)
      .in("bom_version_id", versionIds);

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

    if (counts) {
      counts.forEach((count, family) => {
        if (count > dominantCount) {
          dominantFamily = family;
          dominantCount = count;
        }
      });
    }

    familyByModelName.set(
      normalizedName,
      dominantFamily || inferFamilyLabel(model?.fg_sku || model?.fg_name)
    );
  }

  const byFamily = new Map<string, { family: string; pending: number }>();

  for (const row of rows) {
    const key = normalizeItemKey(row.item);
    const family = familyByModelName.get(key) || inferFamilyLabel(row.item);

    if (!byFamily.has(family)) {
      byFamily.set(family, { family, pending: 0 });
    }

    const aggregate = byFamily.get(family)!;
    aggregate.pending += row.pending;
  }

  const familyRows = Array.from(byFamily.values()).sort((a, b) => {
    if (b.pending !== a.pending) return b.pending - a.pending;
    return String(a.family).localeCompare(String(b.family));
  });

  return NextResponse.json({ familyRows });
}

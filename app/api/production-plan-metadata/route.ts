import { NextResponse } from "next/server";
import {
  InventoryPortalConfigError,
  normalizeProductionPlanRows,
  resolveProductionPlanItemFamilyRows,
} from "@/lib/server/production-plan";
import { buildProductionPlanFamilyRows } from "@/lib/features/production-plan/hierarchy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const rows = normalizeProductionPlanRows(body?.rows);

  if (!rows.length) {
    return NextResponse.json({ familyRows: [], itemFamilyRows: [] });
  }

  try {
    const itemFamilyRows = await resolveProductionPlanItemFamilyRows(rows);
    const familyRows = buildProductionPlanFamilyRows(rows, itemFamilyRows);
    return NextResponse.json({ familyRows, itemFamilyRows });
  } catch (error) {
    if (error instanceof InventoryPortalConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("Error loading production plan metadata", error);
    return NextResponse.json(
      { error: "Could not load BOM data from inventory portal." },
      { status: 502 }
    );
  }
}

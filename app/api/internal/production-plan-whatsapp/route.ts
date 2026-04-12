import { NextRequest, NextResponse } from "next/server";
import {
  resolveProductionPlanWhatsAppSlot,
  sendProductionPlanWhatsApp,
} from "@/lib/server/production-plan-whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isAuthorized(request: NextRequest) {
  const expectedSecret = getRequiredEnv("PRODUCTION_PLAN_AUTOMATION_SECRET");
  if (!expectedSecret) {
    return {
      ok: false as const,
      status: 503,
      error: "PRODUCTION_PLAN_AUTOMATION_SECRET is not configured.",
    };
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = request.headers.get("x-automation-secret")?.trim();
  const providedSecret = bearer || headerSecret || "";

  if (providedSecret !== expectedSecret) {
    return {
      ok: false as const,
      status: 401,
      error: "Unauthorized automation request.",
    };
  }

  return {
    ok: true as const,
  };
}

export async function POST(request: NextRequest) {
  const authCheck = isAuthorized(request);
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  const body = await request.json().catch(() => ({}));
  const result = await sendProductionPlanWhatsApp({
    slot: resolveProductionPlanWhatsAppSlot(body?.slot),
    dryRun: Boolean(body?.dryRun),
  });

  return NextResponse.json(result.body, { status: result.status });
}

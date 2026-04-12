import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/server";
import { sendProductionPlanWhatsApp } from "@/lib/server/production-plan-whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  if (auth.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can send the production plan to WhatsApp." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const result = await sendProductionPlanWhatsApp({
    slot: "manual",
    dryRun: Boolean(body?.dryRun),
  });

  return NextResponse.json(result.body, { status: result.status });
}

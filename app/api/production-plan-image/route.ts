import { NextRequest, NextResponse } from "next/server";
import { loadProductionPlanSnapshot } from "@/lib/server/production-plan";
import { createProductionPlanImageResponse } from "@/lib/server/production-plan-image";

export const dynamic = "force-dynamic";

function hasValidToken(request: NextRequest) {
  const expectedToken = process.env.PRODUCTION_PLAN_IMAGE_TOKEN;
  if (!expectedToken) {
    return {
      ok: false as const,
      status: 503,
      error: "PRODUCTION_PLAN_IMAGE_TOKEN is not configured.",
    };
  }

  const token = request.nextUrl.searchParams.get("token");
  if (token !== expectedToken) {
    return {
      ok: false as const,
      status: 401,
      error: "Unauthorized image request.",
    };
  }

  return {
    ok: true as const,
  };
}

export async function GET(request: NextRequest) {
  const tokenCheck = hasValidToken(request);
  if (!tokenCheck.ok) {
    return NextResponse.json({ error: tokenCheck.error }, { status: tokenCheck.status });
  }

  try {
    const snapshot = await loadProductionPlanSnapshot();
    const response = createProductionPlanImageResponse(snapshot);
    response.headers.set(
      "Cache-Control",
      "public, max-age=60, s-maxage=60, stale-while-revalidate=300"
    );
    return response;
  } catch (error) {
    console.error("Error generating production plan image", error);
    return NextResponse.json(
      { error: "Could not generate the production plan image." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProductionPlanSnapshot } from "@/lib/server/production-plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DeliverySlot = "morning" | "evening" | "manual";

type DeliveryStatus = "sent" | "failed" | "dry_run";

function getSlotLabel(slot: DeliverySlot) {
  if (slot === "morning") return "Morning";
  if (slot === "evening") return "Evening";
  return "Manual";
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function resolveSlot(value: unknown): DeliverySlot {
  return value === "morning" || value === "evening" ? value : "manual";
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

async function insertDeliveryLog(payload: {
  slot: DeliverySlot;
  status: DeliveryStatus;
  recipient: string | null;
  imageUrl: string | null;
  messageId?: string | null;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .schema("automation")
      .from("production_plan_whatsapp_runs")
      .insert({
        slot: payload.slot,
        status: payload.status,
        recipient: payload.recipient,
        image_url: payload.imageUrl,
        message_id: payload.messageId ?? null,
        request_payload: payload.requestPayload ?? null,
        response_payload: payload.responsePayload ?? null,
        error_message: payload.errorMessage ?? null,
      });

    if (error) {
      console.warn("Could not write production plan WhatsApp log", error);
    }
  } catch (error) {
    console.warn("Could not persist production plan WhatsApp log", error);
  }
}

function buildImageUrl(snapshotIso: string) {
  const appBaseUrl = getRequiredEnv("APP_BASE_URL");
  const imageToken = getRequiredEnv("PRODUCTION_PLAN_IMAGE_TOKEN");

  if (!appBaseUrl || !imageToken) {
    return {
      ok: false as const,
      error: "APP_BASE_URL or PRODUCTION_PLAN_IMAGE_TOKEN is not configured.",
    };
  }

  const imageUrl = new URL("/api/production-plan-image", appBaseUrl);
  imageUrl.searchParams.set("token", imageToken);
  imageUrl.searchParams.set("ts", snapshotIso);

  return {
    ok: true as const,
    imageUrl: imageUrl.toString(),
  };
}

function buildCaption(slot: DeliverySlot, snapshot: Awaited<ReturnType<typeof loadProductionPlanSnapshot>>) {
  return [
    `Tycoon production plan`,
    `${getSlotLabel(slot)} update • ${snapshot.dateLabel}`,
    `${snapshot.itemCount.toLocaleString("en-IN")} active items • ${snapshot.totalPending.toLocaleString("en-IN")} pcs pending`,
  ].join("\n");
}

function buildTemplatePayload(args: {
  recipient: string;
  imageUrl: string;
  templateName: string;
  templateLanguage: string;
}) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: args.recipient,
    type: "template",
    template: {
      name: args.templateName,
      language: {
        code: args.templateLanguage,
      },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "image",
              image: {
                link: args.imageUrl,
              },
            },
          ],
        },
      ],
    },
  };
}

function buildImagePayload(args: {
  recipient: string;
  imageUrl: string;
  caption: string;
}) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: args.recipient,
    type: "image",
    image: {
      link: args.imageUrl,
      caption: args.caption,
    },
  };
}

export async function POST(request: NextRequest) {
  const authCheck = isAuthorized(request);
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  const body = await request.json().catch(() => ({}));
  const slot = resolveSlot(body?.slot);
  const dryRun = Boolean(body?.dryRun);

  const snapshot = await loadProductionPlanSnapshot();
  const imageResult = buildImageUrl(snapshot.generatedAtIso);

  if (!imageResult.ok) {
    await insertDeliveryLog({
      slot,
      status: "failed",
      recipient: null,
      imageUrl: null,
      errorMessage: imageResult.error,
    });
    return NextResponse.json({ error: imageResult.error }, { status: 503 });
  }

  const recipient = getRequiredEnv("WHATSAPP_RECIPIENT");
  const phoneNumberId = getRequiredEnv("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = getRequiredEnv("WHATSAPP_ACCESS_TOKEN");
  const graphVersion = getRequiredEnv("WHATSAPP_GRAPH_API_VERSION");
  const templateName = getRequiredEnv("WHATSAPP_PRODUCTION_PLAN_TEMPLATE_NAME");
  const templateLanguage = getRequiredEnv("WHATSAPP_PRODUCTION_PLAN_TEMPLATE_LANG") || "en";

  if (!recipient || !phoneNumberId || !accessToken || !graphVersion) {
    const errorMessage =
      "WHATSAPP_RECIPIENT, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, and WHATSAPP_GRAPH_API_VERSION are required.";

    await insertDeliveryLog({
      slot,
      status: "failed",
      recipient: recipient ?? null,
      imageUrl: imageResult.imageUrl,
      errorMessage,
    });

    return NextResponse.json({ error: errorMessage }, { status: 503 });
  }

  const requestPayload = templateName
    ? buildTemplatePayload({
        recipient,
        imageUrl: imageResult.imageUrl,
        templateName,
        templateLanguage,
      })
    : buildImagePayload({
        recipient,
        imageUrl: imageResult.imageUrl,
        caption: buildCaption(slot, snapshot),
      });

  if (dryRun) {
    await insertDeliveryLog({
      slot,
      status: "dry_run",
      recipient,
      imageUrl: imageResult.imageUrl,
      requestPayload,
      responsePayload: {
        familySource: snapshot.familySource,
        itemCount: snapshot.itemCount,
        totalPending: snapshot.totalPending,
      },
    });

    return NextResponse.json({
      ok: true,
      dryRun: true,
      slot,
      imageUrl: imageResult.imageUrl,
      requestPayload,
      snapshot: {
        dateLabel: snapshot.dateLabel,
        familySource: snapshot.familySource,
        itemCount: snapshot.itemCount,
        totalPending: snapshot.totalPending,
      },
    });
  }

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
      cache: "no-store",
    }
  );

  const responseText = await response.text();
  let responsePayload: Record<string, unknown> | null = null;

  try {
    responsePayload = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    responsePayload = responseText ? { raw: responseText } : null;
  }

  if (!response.ok) {
    const errorMessage =
      typeof responsePayload?.error === "object"
        ? JSON.stringify(responsePayload.error)
        : `WhatsApp delivery failed with status ${response.status}.`;

    await insertDeliveryLog({
      slot,
      status: "failed",
      recipient,
      imageUrl: imageResult.imageUrl,
      requestPayload,
      responsePayload,
      errorMessage,
    });

    return NextResponse.json(
      {
        error: errorMessage,
        providerResponse: responsePayload,
      },
      { status: 502 }
    );
  }

  const messages = Array.isArray(responsePayload?.messages)
    ? (responsePayload?.messages as { id?: string }[])
    : [];
  const messageId = messages[0]?.id ?? null;

  await insertDeliveryLog({
    slot,
    status: "sent",
    recipient,
    imageUrl: imageResult.imageUrl,
    messageId,
    requestPayload,
    responsePayload,
  });

  return NextResponse.json({
    ok: true,
    slot,
    messageId,
    imageUrl: imageResult.imageUrl,
    providerResponse: responsePayload,
  });
}

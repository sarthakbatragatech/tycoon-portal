import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadProductionPlanSnapshot } from "@/lib/server/production-plan";

export type ProductionPlanWhatsAppSlot = "morning" | "evening" | "manual";

type DeliveryStatus = "sent" | "failed" | "dry_run";

type DeliveryImageVariant = "default" | "whatsapp-template";

export type SendProductionPlanWhatsAppResult = {
  status: number;
  body: Record<string, unknown>;
};

function getSlotLabel(slot: ProductionPlanWhatsAppSlot) {
  if (slot === "morning") return "Morning";
  if (slot === "evening") return "Evening";
  return "Manual";
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function resolveProductionPlanWhatsAppSlot(
  value: unknown
): ProductionPlanWhatsAppSlot {
  return value === "morning" || value === "evening" ? value : "manual";
}

async function insertDeliveryLog(payload: {
  slot: ProductionPlanWhatsAppSlot;
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

function buildImageUrl(snapshotIso: string, variant: DeliveryImageVariant) {
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
  if (variant === "whatsapp-template") {
    imageUrl.searchParams.set("variant", "whatsapp-template");
  }

  return {
    ok: true as const,
    imageUrl: imageUrl.toString(),
  };
}

function buildCaption(
  slot: ProductionPlanWhatsAppSlot,
  snapshot: Awaited<ReturnType<typeof loadProductionPlanSnapshot>>
) {
  return [
    "Tycoon production plan",
    `${getSlotLabel(slot)} update • ${snapshot.dateLabel}`,
    `${snapshot.itemCount.toLocaleString("en-IN")} active items • ${snapshot.totalPending.toLocaleString(
      "en-IN"
    )} pcs pending`,
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

export async function sendProductionPlanWhatsApp(args?: {
  slot?: ProductionPlanWhatsAppSlot;
  dryRun?: boolean;
}): Promise<SendProductionPlanWhatsAppResult> {
  const slot = args?.slot ?? "manual";
  const dryRun = Boolean(args?.dryRun);

  const snapshot = await loadProductionPlanSnapshot();

  const recipient = getRequiredEnv("WHATSAPP_RECIPIENT");
  const phoneNumberId = getRequiredEnv("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = getRequiredEnv("WHATSAPP_ACCESS_TOKEN");
  const graphVersion = getRequiredEnv("WHATSAPP_GRAPH_API_VERSION");
  const templateName = getRequiredEnv("WHATSAPP_PRODUCTION_PLAN_TEMPLATE_NAME");
  const templateLanguage = getRequiredEnv("WHATSAPP_PRODUCTION_PLAN_TEMPLATE_LANG") || "en";
  const imageVariant: DeliveryImageVariant = templateName
    ? "whatsapp-template"
    : "default";
  const imageResult = buildImageUrl(snapshot.generatedAtIso, imageVariant);

  if (!imageResult.ok) {
    await insertDeliveryLog({
      slot,
      status: "failed",
      recipient: null,
      imageUrl: null,
      errorMessage: imageResult.error,
    });

    return {
      status: 503,
      body: { error: imageResult.error },
    };
  }

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

    return {
      status: 503,
      body: { error: errorMessage },
    };
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

  const snapshotSummary = {
    dateLabel: snapshot.dateLabel,
    familySource: snapshot.familySource,
    itemCount: snapshot.itemCount,
    totalPending: snapshot.totalPending,
  };

  if (dryRun) {
    await insertDeliveryLog({
      slot,
      status: "dry_run",
      recipient,
      imageUrl: imageResult.imageUrl,
      requestPayload,
      responsePayload: snapshotSummary,
    });

    return {
      status: 200,
      body: {
        ok: true,
        dryRun: true,
        slot,
        imageUrl: imageResult.imageUrl,
        requestPayload,
        snapshot: snapshotSummary,
      },
    };
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

    return {
      status: 502,
      body: {
        error: errorMessage,
        providerResponse: responsePayload,
      },
    };
  }

  const messages = Array.isArray(responsePayload?.messages)
    ? (responsePayload.messages as { id?: string }[])
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

  return {
    status: 200,
    body: {
      ok: true,
      slot,
      messageId,
      imageUrl: imageResult.imageUrl,
      snapshot: snapshotSummary,
      providerResponse: responsePayload,
    },
  };
}

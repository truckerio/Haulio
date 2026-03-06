import crypto from "crypto";
import {
  prisma,
  Prisma,
  ShipmentWebhookDeliveryStatus,
  ShipmentWebhookEventType,
} from "@truckerio/db";

export const SHIPMENT_WEBHOOK_VERSION_V1 = "v1";

export const SHIPMENT_WEBHOOK_SUPPORTED_EVENTS: readonly ShipmentWebhookEventType[] = [
  ShipmentWebhookEventType.SHIPMENT_CREATED,
  ShipmentWebhookEventType.SHIPMENT_EXECUTION_UPDATED,
  ShipmentWebhookEventType.SHIPMENT_COMMERCIAL_UPDATED,
  ShipmentWebhookEventType.SHIPMENT_HANDOFF_QUEUED,
  ShipmentWebhookEventType.SHIPMENT_SPLIT,
  ShipmentWebhookEventType.SHIPMENT_MERGED,
  ShipmentWebhookEventType.SHIPMENT_TEST,
];

export type ShipmentWebhookPayloadV1 = {
  version: typeof SHIPMENT_WEBHOOK_VERSION_V1;
  eventId: string;
  eventType: ShipmentWebhookEventType;
  occurredAt: string;
  orgId: string;
  shipment: {
    id: string;
    loadId: string;
    tripId: string | null;
    loadNumber?: string | null;
    tripNumber?: string | null;
    movementMode?: string | null;
  };
  actor: {
    userId: string | null;
    role: string | null;
  };
  authority: {
    execution: "TRIP";
    commercial: "LOAD";
  };
  changes?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
};

type ShipmentWebhookDbClient = Pick<Prisma.TransactionClient, "shipmentWebhookSubscription" | "shipmentWebhookDelivery" | "orgSettings"> &
  Pick<typeof prisma, "shipmentWebhookSubscription" | "shipmentWebhookDelivery" | "orgSettings">;

export function normalizeShipmentWebhookEventTypes(
  input: Array<ShipmentWebhookEventType | string> | null | undefined
): ShipmentWebhookEventType[] {
  if (!Array.isArray(input)) return [];
  const accepted = new Set(SHIPMENT_WEBHOOK_SUPPORTED_EVENTS);
  const normalized = input
    .map((value) => String(value).trim().toUpperCase())
    .filter((value): value is ShipmentWebhookEventType => accepted.has(value as ShipmentWebhookEventType));
  return Array.from(new Set(normalized));
}

export function buildShipmentWebhookPayloadV1(params: {
  eventId: string;
  eventType: ShipmentWebhookEventType;
  orgId: string;
  loadId: string;
  tripId: string | null;
  loadNumber?: string | null;
  tripNumber?: string | null;
  movementMode?: string | null;
  occurredAt?: Date;
  actor?: { userId?: string | null; role?: string | null };
  changes?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
}): ShipmentWebhookPayloadV1 {
  return {
    version: SHIPMENT_WEBHOOK_VERSION_V1,
    eventId: params.eventId,
    eventType: params.eventType,
    occurredAt: (params.occurredAt ?? new Date()).toISOString(),
    orgId: params.orgId,
    shipment: {
      id: params.loadId,
      loadId: params.loadId,
      tripId: params.tripId,
      loadNumber: params.loadNumber ?? null,
      tripNumber: params.tripNumber ?? null,
      movementMode: params.movementMode ?? null,
    },
    actor: {
      userId: params.actor?.userId ?? null,
      role: params.actor?.role ?? null,
    },
    authority: {
      execution: "TRIP",
      commercial: "LOAD",
    },
    changes: params.changes ?? null,
    metadata: params.metadata ?? null,
  };
}

export function signShipmentWebhookPayload(secret: string, payloadText: string) {
  return `sha256=${crypto.createHmac("sha256", secret).update(payloadText).digest("hex")}`;
}

export function nextShipmentWebhookBackoffMinutes(attemptCount: number) {
  const exp = Math.min(6, Math.max(1, attemptCount));
  return Math.min(60, 2 ** exp);
}

export async function enqueueShipmentWebhookEvent(
  db: ShipmentWebhookDbClient,
  params: {
    orgId: string;
    eventId: string;
    eventType: ShipmentWebhookEventType;
    payload: Prisma.InputJsonValue;
  }
) {
  const settings = await db.orgSettings.findFirst({
    where: { orgId: params.orgId },
    select: {
      shipmentWebhooksEnabled: true,
      shipmentWebhooksVersion: true,
    },
  });
  if (!settings?.shipmentWebhooksEnabled) {
    return { queued: 0, subscriptions: 0, skipped: "webhooks-disabled" as const };
  }

  const version = settings.shipmentWebhooksVersion || SHIPMENT_WEBHOOK_VERSION_V1;
  if (version !== SHIPMENT_WEBHOOK_VERSION_V1) {
    return { queued: 0, subscriptions: 0, skipped: "unsupported-version" as const };
  }

  const subscriptions = await db.shipmentWebhookSubscription.findMany({
    where: {
      orgId: params.orgId,
      enabled: true,
      version,
      OR: [{ eventTypes: { isEmpty: true } }, { eventTypes: { has: params.eventType } }],
    },
    select: { id: true },
  });

  if (subscriptions.length === 0) {
    return { queued: 0, subscriptions: 0, skipped: "no-subscriptions" as const };
  }

  const result = await db.shipmentWebhookDelivery.createMany({
    data: subscriptions.map((subscription) => ({
      orgId: params.orgId,
      subscriptionId: subscription.id,
      eventId: params.eventId,
      eventType: params.eventType,
      eventVersion: SHIPMENT_WEBHOOK_VERSION_V1,
      payload: params.payload,
      status: ShipmentWebhookDeliveryStatus.PENDING,
      nextAttemptAt: new Date(),
      attemptCount: 0,
    })),
    skipDuplicates: true,
  });

  return {
    queued: result.count,
    subscriptions: subscriptions.length,
    skipped: null,
  };
}

type ProjectionLagSample = {
  status: ShipmentWebhookDeliveryStatus;
  createdAt: Date;
  deliveredAt: Date | null;
};

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[index] ?? 0;
}

export function computeShipmentProjectionLagMetrics(params: {
  deliveries: ProjectionLagSample[];
  thresholdSeconds: number;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const pending = params.deliveries.filter(
    (row) => row.status === ShipmentWebhookDeliveryStatus.PENDING || row.status === ShipmentWebhookDeliveryStatus.PROCESSING
  );
  const failed = params.deliveries.filter((row) => row.status === ShipmentWebhookDeliveryStatus.FAILED);
  const deliveredLagSeconds = params.deliveries
    .filter((row): row is ProjectionLagSample & { deliveredAt: Date } => row.status === ShipmentWebhookDeliveryStatus.DELIVERED && Boolean(row.deliveredAt))
    .map((row) => Math.max(0, Math.round((row.deliveredAt.getTime() - row.createdAt.getTime()) / 1000)));

  const oldestPendingSeconds = pending.length
    ? Math.max(...pending.map((row) => Math.max(0, Math.round((now.getTime() - row.createdAt.getTime()) / 1000))))
    : 0;

  return {
    thresholdSeconds: params.thresholdSeconds,
    pendingCount: pending.length,
    failedCount: failed.length,
    deliveredCount: deliveredLagSeconds.length,
    oldestPendingSeconds,
    p50DeliveryLagSeconds: percentile(deliveredLagSeconds, 50),
    p95DeliveryLagSeconds: percentile(deliveredLagSeconds, 95),
    alert: oldestPendingSeconds > params.thresholdSeconds || failed.length > 0,
  };
}

import assert from "node:assert/strict";
import { ShipmentWebhookDeliveryStatus, ShipmentWebhookEventType } from "@truckerio/db";
import {
  SHIPMENT_WEBHOOK_VERSION_V1,
  buildShipmentWebhookPayloadV1,
  computeShipmentProjectionLagMetrics,
  normalizeShipmentWebhookEventTypes,
  signShipmentWebhookPayload,
} from "./shipment-webhooks";

const normalized = normalizeShipmentWebhookEventTypes([
  "shipment_created",
  ShipmentWebhookEventType.SHIPMENT_MERGED,
  "nope",
  "SHIPMENT_CREATED",
]);
assert.deepEqual(normalized, [ShipmentWebhookEventType.SHIPMENT_CREATED, ShipmentWebhookEventType.SHIPMENT_MERGED]);

const payload = buildShipmentWebhookPayloadV1({
  eventId: "evt_123",
  eventType: ShipmentWebhookEventType.SHIPMENT_EXECUTION_UPDATED,
  orgId: "org_1",
  loadId: "load_1",
  tripId: "trip_1",
  loadNumber: "LD-1",
  tripNumber: "TR-1",
  actor: { userId: "user_1", role: "DISPATCHER" },
  metadata: { reasonCode: "ops" },
});
assert.equal(payload.version, SHIPMENT_WEBHOOK_VERSION_V1);
assert.equal(payload.shipment.loadId, "load_1");
assert.equal(payload.authority.execution, "TRIP");

const signature = signShipmentWebhookPayload("secret", JSON.stringify(payload));
assert.equal(signature.startsWith("sha256="), true);
assert.equal(signature.length > 20, true);

const metrics = computeShipmentProjectionLagMetrics({
  thresholdSeconds: 120,
  now: new Date("2026-03-04T00:05:00.000Z"),
  deliveries: [
    {
      status: ShipmentWebhookDeliveryStatus.PENDING,
      createdAt: new Date("2026-03-04T00:00:00.000Z"),
      deliveredAt: null,
    },
    {
      status: ShipmentWebhookDeliveryStatus.DELIVERED,
      createdAt: new Date("2026-03-03T23:59:00.000Z"),
      deliveredAt: new Date("2026-03-04T00:00:00.000Z"),
    },
  ],
});
assert.equal(metrics.pendingCount, 1);
assert.equal(metrics.deliveredCount, 1);
assert.equal(metrics.oldestPendingSeconds, 300);
assert.equal(metrics.alert, true);

console.log("shipment webhooks tests passed");

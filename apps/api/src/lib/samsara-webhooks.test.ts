import assert from "node:assert/strict";
import crypto from "crypto";
import {
  extractSamsaraLocationEvents,
  extractSamsaraWebhookEventIdentity,
  verifySamsaraWebhookSignature,
} from "./samsara-webhooks";

const payload = {
  eventId: "evt_123",
  eventType: "VehicleLocationUpdated",
  data: [
    {
      id: "evt_detail_1",
      vehicleId: "veh_1",
      location: {
        latitude: 32.7785,
        longitude: -96.7956,
        timestamp: "2026-03-05T21:00:00.000Z",
        speedMilesPerHour: 54.2,
      },
    },
  ],
};

const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
const timestamp = "1700000000";
const secret = "test-signing-secret";
const signature = crypto
  .createHmac("sha256", secret)
  .update(Buffer.concat([Buffer.from(`v1:${timestamp}:`, "utf8"), rawBody]))
  .digest("hex");

assert.equal(
  verifySamsaraWebhookSignature({
    signatureHeader: `v1=${signature}`,
    timestampHeader: timestamp,
    secret,
    rawBody,
  }),
  true
);

assert.equal(
  verifySamsaraWebhookSignature({
    signatureHeader: `v1=${signature.slice(0, 60)}bad`,
    timestampHeader: timestamp,
    secret,
    rawBody,
  }),
  false
);

const identity = extractSamsaraWebhookEventIdentity(payload);
assert.equal(identity.eventId, "evt_123");
assert.equal(identity.eventType, "VehicleLocationUpdated");

const events = extractSamsaraLocationEvents(payload);
assert.equal(events.length, 1);
assert.equal(events[0]?.externalVehicleId, "veh_1");
assert.equal(events[0]?.lat, 32.7785);
assert.equal(events[0]?.lng, -96.7956);
assert.equal(events[0]?.eventType, "VehicleLocationUpdated");

console.log("samsara webhook helpers tests passed");

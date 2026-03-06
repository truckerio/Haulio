import crypto from "crypto";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSignature(header: string | null | undefined) {
  if (!header) return null;
  const raw = header.trim();
  if (!raw) return null;
  const parts = raw.split(",").map((piece) => piece.trim());
  const v1Part = parts.find((piece) => piece.toLowerCase().startsWith("v1="));
  if (v1Part) return v1Part.slice(3).trim();
  if (/^[a-fA-F0-9]{64}$/.test(raw)) return raw;
  return null;
}

export function verifySamsaraWebhookSignature(params: {
  signatureHeader: string | null | undefined;
  timestampHeader: string | null | undefined;
  secret: string;
  rawBody: Buffer;
}) {
  const signature = normalizeSignature(params.signatureHeader);
  const timestamp = asString(params.timestampHeader);
  if (!signature || !timestamp) return false;

  const toSign = Buffer.concat([
    Buffer.from(`v1:${timestamp}:`, "utf8"),
    params.rawBody,
  ]);
  const expected = crypto.createHmac("sha256", params.secret).update(toSign).digest("hex");
  const provided = signature.toLowerCase();
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export type SamsaraWebhookLocationEvent = {
  eventId: string | null;
  eventType: string | null;
  externalVehicleId: string;
  lat: number;
  lng: number;
  capturedAt: Date;
  speedMph: number | null;
  heading: number | null;
};

function toDateCandidate(value: unknown) {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function readLocationRecord(source: JsonObject, fallbackType: string | null): SamsaraWebhookLocationEvent | null {
  const vehicleObj = asObject(source.vehicle) ?? asObject(source.asset);
  const locationObj =
    asObject(source.location) ??
    asObject(source.gps) ??
    asObject(source.position) ??
    asObject(source.currentLocation) ??
    asObject(asObject(source.value)?.location);

  const externalVehicleId =
    asString(source.vehicleId) ??
    asString(source.assetId) ??
    asString(vehicleObj?.id) ??
    asString(vehicleObj?.uuid) ??
    asString(vehicleObj?.vehicleId);
  if (!externalVehicleId || !locationObj) return null;

  const lat =
    asNumber(locationObj.latitude) ??
    asNumber(locationObj.lat) ??
    asNumber(locationObj.latitudeDegrees);
  const lng =
    asNumber(locationObj.longitude) ??
    asNumber(locationObj.lng) ??
    asNumber(locationObj.longitudeDegrees);
  if (lat === null || lng === null) return null;

  const capturedAt =
    toDateCandidate(locationObj.time) ??
    toDateCandidate(locationObj.timestamp) ??
    toDateCandidate(source.occurredAt) ??
    toDateCandidate(source.eventTime) ??
    new Date();

  return {
    eventId: asString(source.id) ?? asString(source.eventId),
    eventType: asString(source.eventType) ?? asString(source.type) ?? fallbackType,
    externalVehicleId,
    lat,
    lng,
    capturedAt,
    speedMph:
      asNumber(locationObj.speedMilesPerHour) ??
      asNumber(locationObj.speed) ??
      asNumber(locationObj.speedMph),
    heading: asNumber(locationObj.heading) ?? asNumber(locationObj.course),
  };
}

export function extractSamsaraLocationEvents(payload: unknown): SamsaraWebhookLocationEvent[] {
  const root = asObject(payload);
  if (!root) return [];
  const eventType = asString(root.eventType) ?? asString(root.type);
  const candidates = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.events)
      ? root.events
      : [root];
  return candidates
    .map((entry) => {
      const obj = asObject(entry);
      if (!obj) return null;
      return readLocationRecord(obj, eventType);
    })
    .filter((entry): entry is SamsaraWebhookLocationEvent => Boolean(entry));
}

export function extractSamsaraWebhookEventIdentity(payload: unknown) {
  const root = asObject(payload);
  if (!root) return { eventId: null, eventType: null };
  return {
    eventId: asString(root.eventId) ?? asString(root.id),
    eventType: asString(root.eventType) ?? asString(root.type),
  };
}

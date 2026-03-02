"use client";

export type UiTelemetryEventName =
  | "page_view"
  | "task_start"
  | "task_complete"
  | "task_error"
  | "misclick"
  | "backtrack"
  | "help_needed"
  | "restricted_hidden";

type UiTelemetryPrimitive = string | number | boolean | null;

export type UiTelemetryMeta = Record<string, UiTelemetryPrimitive>;

export type UiTelemetryEvent = {
  id: string;
  name: UiTelemetryEventName;
  ts: string;
  meta: UiTelemetryMeta;
};

const UI_TELEMETRY_STORAGE_KEY = "haulio:ui-telemetry:v1";
const UI_TELEMETRY_MAX_EVENTS = 250;

function normalizePrimitive(value: unknown): UiTelemetryPrimitive | null {
  if (value === null) return null;
  if (value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return null;
}

export function sanitizeUiTelemetryMeta(input?: Record<string, unknown>): UiTelemetryMeta {
  if (!input) return {};
  const output: UiTelemetryMeta = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!key) continue;
    output[key] = normalizePrimitive(raw);
  }
  return output;
}

export function buildUiTelemetryEvent(
  name: UiTelemetryEventName,
  meta?: Record<string, unknown>,
  now: Date = new Date()
): UiTelemetryEvent {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `${now.getTime()}-${randomSuffix}`,
    name,
    ts: now.toISOString(),
    meta: sanitizeUiTelemetryMeta(meta),
  };
}

export function enqueueUiTelemetryEvent(queue: UiTelemetryEvent[], event: UiTelemetryEvent): UiTelemetryEvent[] {
  if (queue.length >= UI_TELEMETRY_MAX_EVENTS) {
    return [...queue.slice(-(UI_TELEMETRY_MAX_EVENTS - 1)), event];
  }
  return [...queue, event];
}

export function parseUiTelemetryQueue(raw: string | null): UiTelemetryEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .filter((item) => typeof item.id === "string" && typeof item.name === "string" && typeof item.ts === "string")
      .map((item) => ({
        id: item.id as string,
        name: item.name as UiTelemetryEventName,
        ts: item.ts as string,
        meta: sanitizeUiTelemetryMeta(item.meta as Record<string, unknown> | undefined),
      }));
  } catch {
    return [];
  }
}

export function serializeUiTelemetryQueue(queue: UiTelemetryEvent[]): string {
  return JSON.stringify(queue);
}

function hasBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readUiTelemetryQueue(): UiTelemetryEvent[] {
  if (!hasBrowserStorage()) return [];
  return parseUiTelemetryQueue(window.localStorage.getItem(UI_TELEMETRY_STORAGE_KEY));
}

export function writeUiTelemetryQueue(queue: UiTelemetryEvent[]) {
  if (!hasBrowserStorage()) return;
  window.localStorage.setItem(UI_TELEMETRY_STORAGE_KEY, serializeUiTelemetryQueue(queue));
}

export function clearUiTelemetryQueue() {
  if (!hasBrowserStorage()) return;
  window.localStorage.removeItem(UI_TELEMETRY_STORAGE_KEY);
}

export function recordUiTelemetryEvent(name: UiTelemetryEventName, meta?: Record<string, unknown>) {
  if (!hasBrowserStorage()) return;
  const queue = readUiTelemetryQueue();
  const next = enqueueUiTelemetryEvent(queue, buildUiTelemetryEvent(name, meta));
  writeUiTelemetryQueue(next);
}

export function getUiTelemetrySnapshot() {
  return {
    storageKey: UI_TELEMETRY_STORAGE_KEY,
    eventCount: readUiTelemetryQueue().length,
    events: readUiTelemetryQueue(),
  };
}


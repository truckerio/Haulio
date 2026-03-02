import assert from "node:assert/strict";
import {
  buildUiTelemetryEvent,
  enqueueUiTelemetryEvent,
  parseUiTelemetryQueue,
  sanitizeUiTelemetryMeta,
  serializeUiTelemetryQueue,
} from "./ui-telemetry";

const now = new Date("2026-03-02T12:00:00.000Z");

const meta = sanitizeUiTelemetryMeta({
  role: "DISPATCHER",
  clicks: 3,
  blocked: false,
  empty: null,
  dropped: { nested: true },
});

assert.equal(meta.role, "DISPATCHER");
assert.equal(meta.clicks, 3);
assert.equal(meta.blocked, false);
assert.equal(meta.empty, null);
assert.equal(meta.dropped, null);

const event = buildUiTelemetryEvent("page_view", { path: "/dispatch", role: "DISPATCHER" }, now);
assert.equal(event.name, "page_view");
assert.equal(event.ts, "2026-03-02T12:00:00.000Z");
assert.equal(event.meta.path, "/dispatch");

const queue = enqueueUiTelemetryEvent([], event);
const serialized = serializeUiTelemetryQueue(queue);
const parsed = parseUiTelemetryQueue(serialized);
assert.equal(parsed.length, 1);
assert.equal(parsed[0]?.id, event.id);
assert.equal(parsed[0]?.meta.path, "/dispatch");

assert.deepEqual(parseUiTelemetryQueue("[]"), []);
assert.deepEqual(parseUiTelemetryQueue("not-json"), []);

console.log("ui telemetry tests passed");


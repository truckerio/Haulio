import assert from "node:assert/strict";
import { buildUnifiedTimeline, type UnifiedTimelineEntry } from "./timeline";

const base = (id: string, kind: UnifiedTimelineEntry["kind"], timestamp: string): UnifiedTimelineEntry => ({
  id,
  kind,
  timestamp: new Date(timestamp),
  actor: null,
  payload: {},
  type: kind,
  message: id,
  time: new Date(timestamp),
});

const timeline = buildUnifiedTimeline({
  notes: [base("note:2", "NOTE", "2026-02-26T10:00:00.000Z"), base("note:1", "NOTE", "2026-02-26T10:00:00.000Z")],
  systemEvents: [base("event:1", "SYSTEM_EVENT", "2026-02-26T10:01:00.000Z")],
  exceptions: [base("exception:1", "EXCEPTION", "2026-02-26T10:00:30.000Z")],
  documentEvents: [base("doc:1", "DOCUMENT_EVENT", "2026-02-26T09:59:00.000Z")],
});

assert.deepStrictEqual(
  timeline.map((item) => item.id),
  ["event:1", "exception:1", "note:2", "note:1", "doc:1"]
);

console.log("timeline tests passed");

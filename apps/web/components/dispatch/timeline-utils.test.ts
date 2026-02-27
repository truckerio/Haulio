import assert from "node:assert/strict";
import { splitPinnedTimeline } from "./timeline-utils";

const sample = [
  { id: "1", kind: "SYSTEM_EVENT", message: "Load created" },
  { id: "2", kind: "NOTE", payload: { pinned: true, body: "Pinned A" } },
  { id: "3", kind: "DOCUMENT_EVENT", message: "POD uploaded" },
  { id: "4", kind: "NOTE", payload: { pinned: false, body: "Regular note" } },
  { id: "5", kind: "NOTE", payload: { pinned: true, body: "Pinned B" } },
];

const { pinnedNotes, timelineEvents } = splitPinnedTimeline(sample);

assert.deepEqual(
  pinnedNotes.map((item) => item.id),
  ["2", "5"]
);

assert.deepEqual(
  timelineEvents.map((item) => item.id),
  ["1", "3", "4"]
);

console.log("dispatch timeline utils tests passed");

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const tripPagePath = path.resolve(process.cwd(), "app/trips/[id]/page.tsx");
const tripPage = fs.readFileSync(tripPagePath, "utf8");

assert.ok(
  tripPage.includes("xl:grid-cols-[1.25fr_1.4fr_1fr]"),
  "Trip detail must use a 3-column cockpit grid"
);
assert.ok(
  tripPage.includes("SectionHeader title=\"Stops & appointments\"") || tripPage.includes("text-sm font-semibold text-ink\">Stops & appointments"),
  "Trip cockpit must keep stops and appointments always visible"
);
assert.ok(
  tripPage.includes("text-sm font-semibold text-ink\">Notes"),
  "Trip cockpit must keep notes always visible"
);
assert.ok(
  tripPage.includes("text-sm font-semibold text-ink\">Recent activity"),
  "Trip cockpit center column must include activity timeline preview"
);
assert.ok(
  tripPage.includes("text-sm font-semibold text-ink\">Command rail"),
  "Trip cockpit right column must expose command rail"
);
assert.ok(
  tripPage.includes("Execution updates are managed in"),
  "Trip command rail must state execution/commercial authority split"
);
const executionBlockersIndex = tripPage.indexOf("text-sm font-semibold text-ink\">Execution blockers");
const docsHandoffIndex = tripPage.indexOf("text-sm font-semibold text-ink\">Docs handoff");
const commercialSnapshotIndex = tripPage.indexOf("text-sm font-semibold text-ink\">Commercial snapshot (read-only)");
assert.equal(executionBlockersIndex > -1, true, "Trip cockpit must include execution blockers card");
assert.equal(docsHandoffIndex > -1, true, "Trip cockpit must include docs handoff card");
assert.equal(commercialSnapshotIndex > -1, true, "Trip cockpit must include commercial snapshot card");
assert.equal(
  executionBlockersIndex < docsHandoffIndex && docsHandoffIndex < commercialSnapshotIndex,
  true,
  "Trip cockpit right rail must keep execution -> docs -> commercial card order"
);
assert.ok(
  tripPage.includes("text-sm font-semibold text-ink\">Loads in trip"),
  "Trip cockpit must keep nested loads panel inside trip authority context"
);
assert.ok(
  tripPage.includes("{canCreateNotes ? ("),
  "Trip notes composer must be capability gated"
);
assert.ok(
  tripPage.includes("Restricted: you cannot create trip notes."),
  "Trip notes must fail closed with restricted label"
);
assert.ok(
  tripPage.includes("Collapse all") && tripPage.includes("Expand first"),
  "Trip loads panel must support collapse/expand controls"
);

console.log("trip cockpit layout tests passed");

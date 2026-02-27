import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const tripPage = fs.readFileSync(path.resolve(process.cwd(), "app/trips/[id]/page.tsx"), "utf8");

assert.ok(tripPage.includes("Collapse all"), "Trip loads panel must expose a collapse-all control");
assert.ok(tripPage.includes("Expand first"), "Trip loads panel must expose an expand-first control");
assert.ok(
  tripPage.includes("onClick={() => setExpandedLoadId(null)}"),
  "Collapse-all control must reset expanded load selection"
);
assert.ok(
  tripPage.includes("onClick={() => setExpandedLoadId(trip.loads[0]?.load.id ?? null)}"),
  "Expand-first control must select first load in trip order"
);
assert.ok(
  tripPage.includes("{group.label} · {group.loads.length} loads · {group.pallets} pallets · {group.weightLbs} lbs"),
  "Grouped load header must show load count, pallet total, and weight total"
);

console.log("trip loads panel contract tests passed");


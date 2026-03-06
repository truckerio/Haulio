import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const tripsWorkspace = fs.readFileSync(
  path.resolve(process.cwd(), "components/dispatch/TripsWorkspace.tsx"),
  "utf8"
);

assert.ok(
  tripsWorkspace.includes('apiFetch<') && tripsWorkspace.includes('"/dispatch/trips-workspace"'),
  "trips workspace must fetch persisted workspace preferences from dispatch trips-workspace endpoint"
);
assert.ok(
  tripsWorkspace.includes('apiFetch("/dispatch/trips-workspace", {') &&
    tripsWorkspace.includes('method: "PUT"'),
  "trips workspace must persist workspace preferences through dispatch trips-workspace endpoint"
);
assert.ok(
  tripsWorkspace.includes("workspacePrefsHydrated"),
  "trips workspace must gate persistence until initial preferences are loaded"
);
assert.ok(
  tripsWorkspace.includes("Layout saved"),
  "trips workspace must provide explicit save feedback for persisted grid preferences"
);

console.log("trips workspace persistence tests passed");

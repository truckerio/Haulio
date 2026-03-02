import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const tripsWorkspace = fs.readFileSync(path.resolve(process.cwd(), "components/dispatch/TripsWorkspace.tsx"), "utf8");

assert.ok(
  tripsWorkspace.includes("setRoleCapabilities(nextCaps);"),
  "trips workspace must hydrate role capabilities from auth/me"
);
assert.ok(
  tripsWorkspace.includes("const canMutateTripExecution = roleCapabilities.canDispatchExecution;"),
  "trips workspace must derive mutation permissions from capability map"
);
assert.ok(
  tripsWorkspace.includes("Read-only trip visibility for investigation and escalation."),
  "trips workspace must show read-only subtitle for safety/support roles"
);
assert.ok(
  tripsWorkspace.includes("{canMutateTripExecution ? (") && tripsWorkspace.includes("New trip"),
  "trips workspace must gate new-trip controls by capability"
);
assert.ok(
  tripsWorkspace.includes('disabled={!canMutateTripExecution}'),
  "trips workspace must disable mutation form controls when role is read-only"
);
assert.ok(
  tripsWorkspace.includes("Restricted: assignment mutations are disabled for this role."),
  "trips workspace must show restricted guidance in assignment tab for read-only roles"
);

console.log("trips role workbench tests passed");

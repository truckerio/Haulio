import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const tripsWorkspace = fs.readFileSync(
  path.resolve(process.cwd(), "components/dispatch/TripsWorkspace.tsx"),
  "utf8"
);

assert.ok(
  tripsWorkspace.includes("function buildTripsRoleDefaults("),
  "trips workspace must define role-based default layout profiles"
);
assert.ok(
  tripsWorkspace.includes("buildTripsRoleDefaults(roleCapabilities.canonicalRole)"),
  "trips workspace must derive defaults from canonical role capabilities"
);
assert.ok(
  tripsWorkspace.includes("Reset to role default"),
  "trips workspace must provide a direct reset action to role defaults"
);
assert.ok(
  tripsWorkspace.includes("useRoleDefaults = !payload.updatedAt"),
  "trips workspace must apply role defaults when no persisted preferences exist"
);
assert.ok(
  tripsWorkspace.includes("Field catalog") &&
    tripsWorkspace.includes("Search fields") &&
    tripsWorkspace.includes("Locked"),
  "trips workspace grid setup must expose searchable field catalog with locked indicators"
);

console.log("trips role defaults contract tests passed");

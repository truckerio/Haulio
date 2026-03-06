import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const tripsPage = fs.readFileSync(path.resolve(process.cwd(), "app/trips/page.tsx"), "utf8");

assert.ok(
  tripsPage.includes("function buildDispatchTripsPath(searchParams: Readonly<URLSearchParams> | null)"),
  "trips route must include compatibility helper that maps legacy params into dispatch workspace query"
);
assert.ok(
  tripsPage.includes("if (returnToPath?.startsWith(\"/dispatch\"))"),
  "trips compatibility helper must only reuse returnTo when it targets dispatch"
);
assert.ok(
  tripsPage.includes('params.set("workspace", "trips");'),
  "trips compatibility route must force dispatch trips workspace"
);
assert.ok(
  tripsPage.includes("router.replace(targetPath);"),
  "trips compatibility route must redirect into dispatch workbench"
);
assert.ok(
  tripsPage.includes("This route now lives in Dispatch Workbench"),
  "trips compatibility route should communicate dispatch consolidation intent during redirect"
);

console.log("trips dispatch return contract tests passed");

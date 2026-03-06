import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const loadsPage = fs.readFileSync(path.resolve(process.cwd(), "app/loads/page.tsx"), "utf8");

assert.ok(
  loadsPage.includes("buildDispatchLoadsPath(searchParams)"),
  "phase14 loads compatibility route must normalize legacy params into dispatch workspace state"
);
assert.ok(
  loadsPage.includes('params.set(\"workspace\", \"loads\");'),
  "phase14 loads compatibility route must keep loads workspace targeting explicit"
);
assert.ok(
  loadsPage.includes('params.set(\"createLoad\", \"1\");'),
  "phase14 loads compatibility route must preserve create intent for dispatch modal open"
);
assert.ok(
  loadsPage.includes("Redirecting to Dispatch…"),
  "phase14 loads compatibility route should expose explicit redirect-state feedback"
);
assert.ok(
  loadsPage.includes("router.replace(targetPath);"),
  "phase14 loads compatibility route must perform redirect to dispatch workbench"
);

console.log("loads phase14 read-heavy contract tests passed");

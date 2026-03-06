import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const loadsPage = fs.readFileSync(path.resolve(process.cwd(), "app/loads/page.tsx"), "utf8");

assert.ok(
  loadsPage.includes("function buildDispatchLoadsPath(searchParams: Readonly<URLSearchParams> | null)"),
  "loads route must include compatibility helper that maps legacy params into dispatch workspace query"
);
assert.ok(
  loadsPage.includes("if (returnToPath?.startsWith(\"/dispatch\"))"),
  "loads compatibility helper must only reuse returnTo when it targets dispatch"
);
assert.ok(
  loadsPage.includes('params.set(\"workspace\", \"loads\");'),
  "loads compatibility route must force dispatch loads workspace"
);
assert.ok(
  loadsPage.includes('params.set(\"createLoad\", \"1\");'),
  "loads compatibility route must map legacy create flag to dispatch create-load modal state"
);
assert.ok(
  loadsPage.includes("router.replace(targetPath);"),
  "loads compatibility route must redirect into dispatch workbench"
);

console.log("loads dispatch return contract tests passed");

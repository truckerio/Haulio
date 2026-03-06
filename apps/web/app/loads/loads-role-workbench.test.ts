import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const loadsPage = fs.readFileSync(path.resolve(process.cwd(), "app/loads/page.tsx"), "utf8");

assert.ok(
  loadsPage.includes("function buildDispatchLoadsPath(searchParams: Readonly<URLSearchParams> | null)"),
  "loads route must keep a compatibility mapper into dispatch workbench"
);
assert.ok(
  loadsPage.includes('params.set(\"workspace\", \"loads\");'),
  "loads compatibility route must preserve dispatch loads lens workspace"
);
assert.ok(
  loadsPage.includes("if (params.get(\"create\") === \"1\")"),
  "loads compatibility route must carry legacy create intent to dispatch create-load modal"
);
assert.ok(
  loadsPage.includes("router.replace(targetPath);"),
  "loads compatibility route must redirect users to dispatch workbench"
);
assert.ok(
  loadsPage.includes("This route now lives in Dispatch Workbench"),
  "loads compatibility route should communicate dispatch consolidation intent during redirect"
);

console.log("loads role workbench tests passed");

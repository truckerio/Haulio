import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const teamsPage = fs.readFileSync(path.resolve(process.cwd(), "app/teams/page.tsx"), "utf8");

assert.ok(
  teamsPage.includes("function buildDispatchTeamsPath(searchParams: Readonly<URLSearchParams> | null)"),
  "teams route must include compatibility helper that maps legacy params into dispatch workspace query"
);
assert.ok(
  teamsPage.includes("if (returnToPath?.startsWith(\"/dispatch\"))"),
  "teams compatibility helper must only reuse returnTo when it targets dispatch"
);
assert.ok(
  teamsPage.includes('params.set("workspace", "loads");'),
  "teams compatibility route must force dispatch loads workspace"
);
assert.ok(
  teamsPage.includes("router.replace(targetPath);"),
  "teams compatibility route must redirect into dispatch workbench"
);
assert.ok(
  teamsPage.includes("This route now lives in Dispatch Workbench"),
  "teams compatibility route should communicate dispatch consolidation intent during redirect"
);

console.log("teams dispatch return contract tests passed");

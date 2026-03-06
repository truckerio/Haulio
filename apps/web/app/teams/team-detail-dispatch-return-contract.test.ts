import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const teamDetailPage = fs.readFileSync(path.resolve(process.cwd(), "app/teams/[teamId]/page.tsx"), "utf8");

assert.ok(
  teamDetailPage.includes("function buildDispatchTeamPath(teamId: string, searchParams: Readonly<URLSearchParams> | null)"),
  "team detail route must include compatibility helper that maps params into dispatch workspace query"
);
assert.ok(
  teamDetailPage.includes('params.set("workspace", "loads");'),
  "team detail compatibility route must force dispatch loads workspace"
);
assert.ok(
  teamDetailPage.includes('params.set("teamId", teamId);'),
  "team detail compatibility route must carry teamId into dispatch query"
);
assert.ok(
  teamDetailPage.includes("router.replace(targetPath);"),
  "team detail compatibility route must redirect into dispatch workbench"
);
assert.ok(
  teamDetailPage.includes("This route now lives in Dispatch Workbench"),
  "team detail compatibility route should communicate dispatch consolidation intent during redirect"
);

console.log("team detail dispatch return contract tests passed");

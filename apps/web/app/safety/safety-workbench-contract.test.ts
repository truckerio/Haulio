import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const safetyPage = fs.readFileSync(path.resolve(process.cwd(), "app/safety/page.tsx"), "utf8");
const workbench = fs.readFileSync(path.resolve(process.cwd(), "components/workbench/read-only-ops-workbench.tsx"), "utf8");

assert.ok(
  safetyPage.includes('hideHeader hideTopActivityTrigger'),
  "safety page should render a compact header card inside AppShell"
);
assert.ok(
  safetyPage.includes('<ReadOnlyOpsWorkbench kind="safety" />'),
  "safety page must mount safety read-only workbench"
);
assert.ok(
  workbench.includes('capabilities.canonicalRole === config.role || capabilities.canonicalRole === "ADMIN"'),
  "workbench must fail closed and only allow assigned role or admin"
);
assert.ok(
  workbench.includes("Mutation controls are hidden for this role."),
  "workbench must communicate read-only restrictions"
);
assert.ok(
  workbench.includes('primaryChip: "tracking-off"') &&
    workbench.includes('secondaryChip: "missing-pod"') &&
    workbench.includes("/tasks/inbox?tab="),
  "workbench must load operational queues and role task inbox"
);

console.log("safety workbench contract tests passed");

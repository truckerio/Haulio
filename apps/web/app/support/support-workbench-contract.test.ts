import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const supportPage = fs.readFileSync(path.resolve(process.cwd(), "app/support/page.tsx"), "utf8");
const workbench = fs.readFileSync(path.resolve(process.cwd(), "components/workbench/read-only-ops-workbench.tsx"), "utf8");

assert.ok(
  supportPage.includes('hideHeader hideTopActivityTrigger'),
  "support page should render a compact header card inside AppShell"
);
assert.ok(
  supportPage.includes('<ReadOnlyOpsWorkbench kind="support" />'),
  "support page must mount support read-only workbench"
);
assert.ok(
  workbench.includes('support: {'),
  "workbench config must include support role variant"
);
assert.ok(
  workbench.includes('primaryChip: "delivered-unbilled"') && workbench.includes('secondaryChip: "active"'),
  "support workbench should use troubleshooting queue slices"
);
assert.ok(
  workbench.includes("TaskTable") && workbench.includes("TripTable"),
  "support workbench must provide troubleshooting context panels"
);

console.log("support workbench contract tests passed");

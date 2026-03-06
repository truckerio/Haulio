import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dispatchPage = fs.readFileSync(path.resolve(process.cwd(), "app/dispatch/page.tsx"), "utf8");

assert.ok(
  dispatchPage.includes('const canCreateLoad = capabilities.canEditLoad || capabilities.canDispatchExecution;'),
  "dispatch workbench must derive load-create capability from canonical capability map"
);
assert.ok(
  dispatchPage.includes('workspace === "loads" && canCreateLoad'),
  "dispatch workbench must only show create-load action in loads lens when capability is present"
);
assert.ok(
  dispatchPage.includes("const openCreateLoadDrawer = useCallback(() => {"),
  "dispatch workbench must expose create-load drawer entrypoint"
);
assert.ok(
  dispatchPage.includes('params.set("createLoad", "1");'),
  "dispatch create-load flow must preserve deep-link modal state in query params"
);
assert.ok(
  dispatchPage.includes("Create load"),
  "dispatch workbench loads lens must expose create-load action label"
);
assert.ok(
  dispatchPage.includes('variant={activeRibbonMenu === "grid" ? "secondary" : "ghost"}'),
  "dispatch workbench ribbon must expose a dedicated Grid actions menu"
);
assert.ok(
  dispatchPage.includes('runGridCommand("openExport")') &&
    dispatchPage.includes('runGridCommand("copyFiltered")') &&
    dispatchPage.includes('runGridCommand("morningSort")'),
  "dispatch workbench ribbon must centralize grid export/copy/sort actions"
);
assert.ok(
  dispatchPage.includes("Field catalog") &&
    dispatchPage.includes("Search fields") &&
    dispatchPage.includes("Locked"),
  "dispatch grid ribbon must expose searchable grouped field catalog with locked-column indicators"
);
assert.ok(
  dispatchPage.includes("hideCommandMenus"),
  "dispatch workbench must hide duplicate in-grid action menus when ribbon controls are enabled"
);
assert.ok(
  dispatchPage.includes('/trips/${selectedTripId}/cargo-plan/sync'),
  "dispatch workbench must support trip optimization action from inspector"
);
assert.ok(
  dispatchPage.includes('/loads/${selectedLoad.id}/notes'),
  "dispatch workbench must support dispatch pack note logging in timeline"
);
assert.ok(
  dispatchPage.includes("/dispatch/exceptions/sla-queue"),
  "dispatch workbench exceptions panel must consume SLA queue endpoint"
);
assert.ok(
  dispatchPage.includes("canAccessFinance={capabilities.canAccessFinance}") &&
    dispatchPage.includes("canBillActions={capabilities.canBillActions}"),
  "dispatch workbench inspector must receive finance capability props for handoff actions"
);
assert.ok(
  dispatchPage.includes("Open receivables") && dispatchPage.includes("Open payables context"),
  "dispatch workbench ribbon must expose finance handoff actions for selected shipment context"
);
assert.ok(
  dispatchPage.includes("const DISPATCH_TRIPS_FIRST_OPEN_COLUMNS") &&
    dispatchPage.includes("shouldApplyTripsPreset"),
  "dispatch workbench must auto-apply trip-focused default columns on first trips workspace open"
);

console.log("dispatch workbench contract tests passed");

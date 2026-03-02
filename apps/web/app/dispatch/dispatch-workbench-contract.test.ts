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
  dispatchPage.includes('router.push("/loads?create=1")'),
  "dispatch workbench create-load action must route into the existing load creation flow"
);

console.log("dispatch workbench contract tests passed");

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const loadsPage = fs.readFileSync(path.resolve(process.cwd(), "app/loads/page.tsx"), "utf8");

assert.ok(
  loadsPage.includes("const canCreateLoad = roleCapabilities.canEditLoad || roleCapabilities.canDispatchExecution;"),
  "loads page must derive create capability from capability map"
);
assert.ok(
  loadsPage.includes('roleCapabilities.canonicalRole === "SAFETY" || roleCapabilities.canonicalRole === "SUPPORT"'),
  "loads page must detect safety/support read-heavy roles"
);
assert.ok(
  loadsPage.includes('subtitle={isReadHeavyOpsRole ? "Read-only operations workspace for safety and support"'),
  "loads page app shell subtitle must switch to read-only mode for safety/support"
);
assert.ok(
  loadsPage.includes("{canCreateLoad ? (") && loadsPage.includes('{showCreate && canCreateLoad ? ('),
  "loads page must gate create controls and create panel by capability"
);
assert.ok(
  loadsPage.includes("Safety Workspace") && loadsPage.includes("Support Workspace"),
  "loads page must render role-specific read-heavy workspace label"
);
assert.ok(
  loadsPage.includes("Mutation controls are hidden for this role."),
  "loads page must communicate read-only behavior clearly"
);

console.log("loads role workbench tests passed");

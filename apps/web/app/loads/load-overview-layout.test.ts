import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const loadPage = fs.readFileSync(path.resolve(process.cwd(), "app/loads/[id]/page.tsx"), "utf8");
const shell = fs.readFileSync(path.resolve(process.cwd(), "components/detail-workspace/detail-workspace-shell.tsx"), "utf8");

assert.ok(
  loadPage.includes('fetchDetailWorkspaceModel("load", loadId)'),
  "Load detail route must resolve model using load lens"
);
assert.ok(
  loadPage.includes("hideHeader") && loadPage.includes("overflow-hidden"),
  "Load detail route must remain cockpit/no-page-scroll"
);
assert.ok(
  shell.includes('data-testid="detail-context-strip"') && shell.includes("Now:") && shell.includes("Next:"),
  "Context strip must show now/blockers/next-action summaries"
);
assert.ok(
  shell.includes("Assign") && shell.includes("Update stop") && shell.includes("Dispatch pack"),
  "Primary operational commands must be available in context strip"
);
assert.ok(
  shell.includes('data-testid="detail-command-more"') && shell.includes("Copy shipment link") && shell.includes("Open trip"),
  "More menu must contain secondary commands"
);

console.log("load detail command-first contract passed");

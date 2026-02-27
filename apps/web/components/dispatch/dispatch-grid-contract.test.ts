import assert from "node:assert/strict";
import {
  DISPATCH_FROZEN_COLUMNS,
  DISPATCH_GRID_COLUMNS,
  DISPATCH_REQUIRED_COLUMNS,
} from "./DispatchSpreadsheetGrid";

const loadNumberColumn = DISPATCH_GRID_COLUMNS.find((column) => column.key === "loadNumber");
const statusColumn = DISPATCH_GRID_COLUMNS.find((column) => column.key === "status");
const notesColumn = DISPATCH_GRID_COLUMNS.find((column) => column.key === "notes");

assert.ok(loadNumberColumn, "Load # column must exist");
assert.ok(statusColumn, "Status column must exist");
assert.ok(notesColumn, "Notes column must exist");

assert.equal(loadNumberColumn?.required, true);
assert.equal(statusColumn?.required, true);
assert.equal(loadNumberColumn?.frozen, true);
assert.equal(statusColumn?.frozen, true);

assert.equal(DISPATCH_REQUIRED_COLUMNS.includes("loadNumber"), true);
assert.equal(DISPATCH_REQUIRED_COLUMNS.includes("status"), true);
assert.equal(DISPATCH_REQUIRED_COLUMNS.includes("notes"), true);
assert.equal(DISPATCH_FROZEN_COLUMNS.includes("loadNumber"), true);
assert.equal(DISPATCH_FROZEN_COLUMNS.includes("status"), true);

const loadNumberIndex = DISPATCH_GRID_COLUMNS.findIndex((column) => column.key === "loadNumber");
const statusIndex = DISPATCH_GRID_COLUMNS.findIndex((column) => column.key === "status");
assert.equal(loadNumberIndex >= 0, true);
assert.equal(statusIndex > loadNumberIndex, true);

console.log("dispatch grid contract tests passed");

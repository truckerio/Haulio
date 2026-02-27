import assert from "node:assert/strict";
import {
  TRIP_FROZEN_COLUMNS,
  TRIP_GRID_COLUMNS,
  TRIP_REQUIRED_COLUMNS,
} from "./TripSpreadsheetGrid";

const tripNumberColumn = TRIP_GRID_COLUMNS.find((column) => column.key === "tripNumber");
const statusColumn = TRIP_GRID_COLUMNS.find((column) => column.key === "status");
const movementModeColumn = TRIP_GRID_COLUMNS.find((column) => column.key === "movementMode");

assert.ok(tripNumberColumn, "Trip # column must exist");
assert.ok(statusColumn, "Status column must exist");
assert.ok(movementModeColumn, "Mode column must exist");

assert.equal(tripNumberColumn?.required, true);
assert.equal(statusColumn?.required, true);
assert.equal(tripNumberColumn?.frozen, true);
assert.equal(statusColumn?.frozen, true);

assert.equal(TRIP_REQUIRED_COLUMNS.includes("tripNumber"), true);
assert.equal(TRIP_REQUIRED_COLUMNS.includes("status"), true);
assert.equal(TRIP_REQUIRED_COLUMNS.includes("movementMode"), true);
assert.equal(TRIP_FROZEN_COLUMNS.includes("tripNumber"), true);
assert.equal(TRIP_FROZEN_COLUMNS.includes("status"), true);

const tripNumberIndex = TRIP_GRID_COLUMNS.findIndex((column) => column.key === "tripNumber");
const statusIndex = TRIP_GRID_COLUMNS.findIndex((column) => column.key === "status");
assert.equal(tripNumberIndex >= 0, true);
assert.equal(statusIndex > tripNumberIndex, true);

console.log("trip grid contract tests passed");

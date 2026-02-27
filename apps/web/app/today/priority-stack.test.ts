import assert from "node:assert/strict";
import { mapTodayTilesToPriorityItems, type TodayIssueTile } from "./priority-stack";

const serverOrderedTiles: TodayIssueTile[] = [
  {
    type: "MISSING_POD",
    label: "Missing POD",
    count: 3,
    severity: "BLOCKER",
    domain: "BILLING",
    href: "/dispatch?issuePreset=MISSING_POD",
    ctaLabel: "Open queue",
  },
  {
    type: "OPEN_EXCEPTION",
    label: "Open exception",
    count: 9,
    severity: "WARNING",
    domain: "DISPATCH",
    href: "/dispatch?issuePreset=OPEN_EXCEPTION",
    ctaLabel: "Open queue",
  },
  {
    type: "COMPLIANCE_EXPIRING",
    label: "Compliance expiring soon",
    count: 1,
    severity: "WARNING",
    domain: "COMPLIANCE",
    href: "/dispatch?issuePreset=COMPLIANCE_EXPIRING",
    ctaLabel: "Open queue",
  },
];

const mapped = mapTodayTilesToPriorityItems(serverOrderedTiles);

assert.deepStrictEqual(
  mapped.map((row) => row.type),
  ["MISSING_POD", "OPEN_EXCEPTION", "COMPLIANCE_EXPIRING"],
  "UI must preserve order as received from the server"
);

const filtered = mapTodayTilesToPriorityItems([
  ...serverOrderedTiles,
  {
    type: "",
    label: "Bad tile",
    count: 2,
    href: "/dispatch",
  },
  {
    type: "NEEDS_ASSIGNMENT",
    label: "Needs assignment",
    count: 0,
    href: "/dispatch?issuePreset=NEEDS_ASSIGNMENT",
  },
]);

assert.deepStrictEqual(
  filtered.map((row) => row.type),
  ["MISSING_POD", "OPEN_EXCEPTION", "COMPLIANCE_EXPIRING"],
  "defensive filtering should remove invalid rows without reordering valid rows"
);

console.log("today priority stack order tests passed");

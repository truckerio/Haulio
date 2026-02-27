import assert from "node:assert/strict";
import { Role } from "@truckerio/db";
import { ISSUE_TYPES, type IssueType } from "../../lib/load-issues";
import { buildTodayIssueSummary, normalizeTodayIssueTiles, type TodayIssueTile } from "./issue-summary";

const counts = ISSUE_TYPES.reduce(
  (acc, type) => {
    acc[type] = 0;
    return acc;
  },
  {} as Record<IssueType, number>
);

counts.NEEDS_ASSIGNMENT = 5;
counts.OPEN_EXCEPTION = 3;
counts.MISSING_POD = 2;
counts.LOAD_NOT_DELIVERED = 7;

const summary = buildTodayIssueSummary({ role: Role.ADMIN, counts });
assert.ok(summary.tiles.length > 0, "summary should include tiles");
for (const tile of summary.tiles) {
  assert.equal(tile.ctaLabel, "Open queue", "cta label must be stable");
}

const dedupeInput: TodayIssueTile[] = [
  {
    type: "MISSING_POD",
    label: "Missing POD",
    count: 2,
    severity: "BLOCKER",
    domain: "BILLING",
    href: "/dispatch?issuePreset=MISSING_POD",
    ctaLabel: "Open queue",
  },
  {
    type: "MISSING_POD",
    label: "Missing POD",
    count: 2,
    severity: "BLOCKER",
    domain: "BILLING",
    href: "/dispatch?issuePreset=MISSING_POD",
    ctaLabel: "Open queue",
  },
  {
    type: "OPEN_EXCEPTION",
    label: "Open exception",
    count: 4,
    severity: "WARNING",
    domain: "DISPATCH",
    href: "/dispatch?issuePreset=OPEN_EXCEPTION",
    ctaLabel: "Open queue",
  },
  {
    type: "LOAD_NOT_DELIVERED",
    label: "Load not delivered",
    count: 8,
    severity: "INFO",
    domain: "BILLING",
    href: "/dispatch?issuePreset=LOAD_NOT_DELIVERED",
    ctaLabel: "Open queue",
  },
];

const normalized = normalizeTodayIssueTiles(dedupeInput);
assert.equal(
  normalized.filter((tile) => tile.type === "MISSING_POD").length,
  1,
  "duplicate issue types should be deduped"
);
assert.deepStrictEqual(
  normalized.map((tile) => tile.type),
  ["MISSING_POD", "OPEN_EXCEPTION", "LOAD_NOT_DELIVERED"],
  "ordering should be severity, domain, count, type"
);

console.log("today issue summary tests passed");

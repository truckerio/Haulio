import assert from "node:assert/strict";
import { NotePriority, NoteType, Role } from "@truckerio/db";
import { buildTodayIssueSummary } from "../today/issue-summary";
import { buildActivitySummary } from "./summary";

const issueSummary = buildTodayIssueSummary({
  role: Role.DISPATCHER,
  counts: {
    NEEDS_ASSIGNMENT: 4,
    LATE_RISK: 2,
    OVERDUE: 1,
    MISSING_POD: 3,
    MISSING_BOL: 0,
    MISSING_RATECON: 0,
    MISSING_APPOINTMENT: 1,
    PENDING_APPROVALS: 0,
    MISSING_BILL_TO: 0,
    BILLING_PROFILE_INCOMPLETE: 0,
    LOAD_NOT_DELIVERED: 0,
    COMPLIANCE_EXPIRED: 0,
    COMPLIANCE_EXPIRING: 1,
    OPEN_EXCEPTION: 2,
  },
});

const activity = buildActivitySummary({
  generatedAt: new Date("2026-03-02T23:20:00.000Z"),
  role: Role.DISPATCHER,
  issueSummary,
  openExceptionsCount: 2,
  noteGroups: [
    {
      priority: NotePriority.ALERT,
      noteType: NoteType.OPERATIONAL,
      count: 2,
      timestamp: new Date("2026-02-26T12:00:00.000Z"),
    },
    {
      priority: NotePriority.IMPORTANT,
      noteType: NoteType.BILLING,
      count: 5,
      timestamp: new Date("2026-02-25T12:00:00.000Z"),
    },
  ],
  history: [
    {
      id: "resolved-exception-1",
      title: "Resolved exception · LD-1001",
      domain: "DISPATCH",
      timestamp: new Date("2026-02-25T10:30:00.000Z"),
      href: "/dispatch",
    },
  ],
});

assert.ok(activity.now.length > 0, "now bucket should have items");
assert.ok(activity.week.length > 0, "week bucket should have items");
assert.ok(activity.history.length > 0, "history bucket should have items");

const ids = new Set(activity.now.map((item) => item.id));
assert.equal(ids.size, activity.now.length, "now bucket ids should be deterministic and unique");

const expectedBadge = activity.now
  .filter((item) => item.severity === "ALERT")
  .reduce((total, item) => total + (item.count ?? 1), 0);
assert.equal(activity.badgeCount, expectedBadge, "badgeCount must equal NOW ALERT totals");

const groupedMissingPod = activity.now.find((item) => item.id === "issue:MISSING_POD");
assert.equal(groupedMissingPod?.count, 3, "missing POD must stay grouped with correct count");
assert.equal(
  groupedMissingPod?.timestamp,
  "2026-03-02T23:20:00.000Z",
  "issue timestamps should use summary generation time"
);

const dispatchOnly = buildActivitySummary({
  role: Role.DISPATCHER,
  issueSummary,
  domain: "dispatch",
});
assert.ok(dispatchOnly.now.every((item) => item.domain === "DISPATCH"), "dispatch filter should keep dispatch items only");

console.log("activity summary tests passed");

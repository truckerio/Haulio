import assert from "node:assert/strict";
import { filterActivityItems, roleDefaultDomain, selectActivityBucket, type ActivitySummaryData } from "./activity-view";

const data: ActivitySummaryData = {
  badgeCount: 4,
  generatedAt: "2026-02-26T12:00:00.000Z",
  now: [
    {
      id: "issue:NEEDS_ASSIGNMENT",
      title: "Needs assignment",
      severity: "ALERT",
      domain: "DISPATCH",
      timestamp: "2026-02-26T11:00:00.000Z",
      count: 4,
      cta: { label: "Open Dispatch queue", href: "/dispatch" },
    },
    {
      id: "issue:MISSING_POD",
      title: "Missing POD",
      severity: "ALERT",
      domain: "BILLING",
      timestamp: "2026-02-26T10:00:00.000Z",
      count: 2,
      cta: { label: "Open Billing queue", href: "/finance" },
    },
  ],
  week: [
    {
      id: "issue:LATE_RISK",
      title: "Appointment at risk",
      severity: "IMPORTANT",
      domain: "DISPATCH",
      timestamp: "2026-02-26T09:00:00.000Z",
      count: 3,
      cta: { label: "Open Dispatch queue", href: "/dispatch" },
    },
  ],
  history: [
    {
      id: "history:event-1",
      title: "Load status updated",
      severity: "INFO",
      domain: "DISPATCH",
      timestamp: "2026-02-25T09:00:00.000Z",
      cta: { label: "Open queue", href: "/dispatch" },
    },
  ],
  kpis: {
    openAlerts: 6,
    openExceptions: 2,
    dueToday: 3,
    dueThisWeek: 5,
    missingPod: 2,
    unassignedLoads: 4,
    atRiskStops: 3,
  },
  defaultDomain: "dispatch",
};

const nowItems = selectActivityBucket(data, "now");
assert.equal(nowItems.length, 2, "should pick now bucket");

const filteredDispatch = filterActivityItems({
  items: nowItems,
  domain: "dispatch",
  severities: new Set(["ALERT", "IMPORTANT", "INFO"]),
  search: "",
});
assert.deepEqual(filteredDispatch.map((item) => item.id), ["issue:NEEDS_ASSIGNMENT"], "domain filter should apply");

const filteredSearch = filterActivityItems({
  items: nowItems,
  domain: "all",
  severities: new Set(["ALERT"]),
  search: "pod",
});
assert.deepEqual(filteredSearch.map((item) => item.id), ["issue:MISSING_POD"], "search filter should apply");

assert.equal(roleDefaultDomain("BILLING"), "billing");
assert.equal(roleDefaultDomain("UNKNOWN_ROLE"), "dispatch");
assert.equal(roleDefaultDomain("DISPATCHER"), "dispatch");

console.log("activity view tests passed");

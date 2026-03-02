import assert from "node:assert/strict";
import { getVisibleSections } from "./navigation";

function flattenHrefs(role: string, options?: { showTeamsOps?: boolean }) {
  return getVisibleSections(role, options).flatMap((section) => section.items.map((item) => item.href));
}

const dispatcherSections = getVisibleSections("DISPATCHER");
assert.equal(dispatcherSections.some((section) => section.title === "More"), true);
assert.equal(flattenHrefs("DISPATCHER").includes("/today"), true);
assert.equal(flattenHrefs("DISPATCHER").includes("/dashboard"), true);
assert.equal(flattenHrefs("DISPATCHER").includes("/dispatch"), true);
assert.equal(flattenHrefs("DISPATCHER").includes("/loads"), false);
assert.equal(flattenHrefs("DISPATCHER").includes("/trips"), false);
assert.equal(
  dispatcherSections
    .filter((section) => section.title !== "More")
    .flatMap((section) => section.items.map((item) => item.href))
    .includes("/today"),
  false
);
assert.equal(
  dispatcherSections
    .filter((section) => section.title !== "More")
    .flatMap((section) => section.items.map((item) => item.href))
    .includes("/dashboard"),
  false
);

const headDispatcherWithTeams = flattenHrefs("HEAD_DISPATCHER", { showTeamsOps: true });
assert.equal(headDispatcherWithTeams.includes("/teams"), true);
assert.equal(headDispatcherWithTeams.includes("/dispatch"), true);
assert.equal(headDispatcherWithTeams.includes("/loads"), false);
assert.equal(headDispatcherWithTeams.includes("/trips"), false);
const headDispatcherWithoutTeams = flattenHrefs("HEAD_DISPATCHER", { showTeamsOps: false });
assert.equal(headDispatcherWithoutTeams.includes("/teams"), false);

const safetyHrefs = flattenHrefs("SAFETY", { showTeamsOps: true });
assert.deepEqual(
  safetyHrefs.sort(),
  ["/profile", "/safety"].sort()
);

const supportHrefs = flattenHrefs("SUPPORT", { showTeamsOps: true });
assert.deepEqual(
  supportHrefs.sort(),
  ["/profile", "/support"].sort()
);

const billingHrefs = flattenHrefs("BILLING", { showTeamsOps: true });
assert.equal(billingHrefs.includes("/finance"), true);
assert.equal(billingHrefs.includes("/dispatch"), false);

const driverSections = getVisibleSections("DRIVER");
assert.equal(driverSections.length, 1);
assert.equal(driverSections[0]?.title, "Driver");
assert.deepEqual(
  driverSections[0]?.items.map((item) => item.href),
  ["/driver"]
);

console.log("navigation tests passed");

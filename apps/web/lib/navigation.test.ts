import assert from "node:assert/strict";
import { getVisibleSections } from "./navigation";

function flattenHrefs(role: string, options?: { showTeamsOps?: boolean }) {
  return getVisibleSections(role, options).flatMap((section) => section.items.map((item) => item.href));
}

const dispatcherSections = getVisibleSections("DISPATCHER");
assert.equal(dispatcherSections.filter((section) => section.title === "More").length, 1);
assert.equal(flattenHrefs("DISPATCHER").includes("/dispatch"), true);
assert.equal(flattenHrefs("DISPATCHER").includes("/finance"), true);
assert.equal(flattenHrefs("DISPATCHER").includes("/today"), true);
assert.equal(flattenHrefs("DISPATCHER").includes("/teams"), false);
assert.equal(flattenHrefs("DISPATCHER").includes("/loads"), false);
assert.equal(flattenHrefs("DISPATCHER").includes("/trips"), false);

const headDispatcherWithTeams = flattenHrefs("HEAD_DISPATCHER", { showTeamsOps: true });
assert.equal(headDispatcherWithTeams.includes("/teams"), true);
const headDispatcherWithoutTeams = flattenHrefs("HEAD_DISPATCHER", { showTeamsOps: false });
assert.equal(headDispatcherWithoutTeams.includes("/teams"), false);

const safetySections = getVisibleSections("SAFETY", { showTeamsOps: true });
assert.equal(safetySections.filter((section) => section.title === "More").length, 1);
assert.equal(flattenHrefs("SAFETY").includes("/safety"), true);
assert.equal(flattenHrefs("SAFETY").includes("/finance"), false);

const supportSections = getVisibleSections("SUPPORT", { showTeamsOps: true });
assert.equal(supportSections.filter((section) => section.title === "More").length, 1);
assert.equal(flattenHrefs("SUPPORT").includes("/support"), true);
assert.equal(flattenHrefs("SUPPORT").includes("/dispatch"), false);

const billingSections = getVisibleSections("BILLING", { showTeamsOps: true });
assert.equal(billingSections.filter((section) => section.title === "More").length, 1);
assert.equal(flattenHrefs("BILLING").includes("/finance"), true);
assert.equal(flattenHrefs("BILLING").includes("/dispatch"), false);

const adminSections = getVisibleSections("ADMIN", { showTeamsOps: true });
assert.equal(adminSections.filter((section) => section.title === "More").length, 1);
assert.equal(flattenHrefs("ADMIN").includes("/admin"), true);
assert.equal(flattenHrefs("ADMIN").includes("/audit"), true);

const driverSections = getVisibleSections("DRIVER");
assert.equal(driverSections.length, 1);
assert.equal(driverSections[0]?.title, "Driver");
assert.deepEqual(driverSections[0]?.items.map((item) => item.href), ["/driver"]);

console.log("navigation tests passed");

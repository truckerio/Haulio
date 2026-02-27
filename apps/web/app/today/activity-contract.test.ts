import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const todayPage = fs.readFileSync(path.resolve(process.cwd(), "app/today/page.tsx"), "utf8");
const appShell = fs.readFileSync(path.resolve(process.cwd(), "components/app-shell.tsx"), "utf8");

assert.ok(todayPage.includes('apiFetch<ActivitySummaryData>("/activity/summary")'), "Activity page must use /activity/summary");
assert.ok(todayPage.includes("Now"), "Activity page must render Now tab");
assert.ok(todayPage.includes("This week"), "Activity page must render This week tab");
assert.ok(todayPage.includes("History"), "Activity page must render History tab");

assert.ok(appShell.includes('apiFetch<ActivitySummary>("/activity/summary")'), "AppShell bell must use /activity/summary");
assert.ok(appShell.includes("View all activity"), "Activity drawer must include View all activity CTA");

console.log("activity contract tests passed");

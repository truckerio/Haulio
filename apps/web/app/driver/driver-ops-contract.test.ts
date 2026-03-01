import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const driverPage = fs.readFileSync(path.resolve(process.cwd(), "app/driver/page.tsx"), "utf8");
const settlementsPage = fs.readFileSync(path.resolve(process.cwd(), "app/driver/settlements/page.tsx"), "utf8");
const settlementDetailPage = fs.readFileSync(
  path.resolve(process.cwd(), "app/driver/settlements/[id]/page.tsx"),
  "utf8"
);

assert.ok(driverPage.includes('apiFetch<{ load: DriverLoad | null; driver: DriverProfile | null; dispatcher?: DispatcherContact | null }>('), "driver page must fetch current driver payload");
assert.ok(driverPage.includes('"/driver/current"'), "driver page must fetch /driver/current");
assert.ok(driverPage.includes('"/driver/settings"'), "driver page must fetch /driver/settings");
assert.ok(driverPage.includes('"/driver/earnings"'), "driver page must fetch /driver/earnings");
assert.ok(
  driverPage.includes('"/settlements?status=PENDING&groupBy=none"'),
  "driver page must fetch pending settlements read-only list"
);
assert.ok(
  driverPage.includes('`/tracking/load/${load.id}/start`') &&
    driverPage.includes('`/tracking/load/${load.id}/stop`') &&
    driverPage.includes('`/tracking/load/${load.id}/ping`'),
  "driver page must expose tracking start/stop/ping controls"
);
assert.ok(driverPage.includes('apiFetch("/driver/undo"'), "driver page must support undo endpoint");
assert.ok(driverPage.includes("No load assigned right now."), "driver page must render no-load assigned state");
assert.ok(driverPage.includes("Next Step"), "driver page must render a single next-step action section");
assert.ok(driverPage.includes("Acknowledge compliance"), "driver page must render compliance acknowledgement action");
assert.ok(driverPage.includes("Undo last action (5 min)"), "driver page must show bounded undo affordance");
assert.ok(driverPage.includes("View all settlements"), "driver page must deep-link to settlements");

assert.ok(settlementsPage.includes("`/settlements?${query}`"), "driver settlements list must use settlements read endpoint");
assert.ok(settlementsPage.includes('router.push(`/driver/settlements/${id}`)'), "driver settlements list must deep-link to settlement detail");
assert.ok(
  settlementsPage.includes("Pending") && settlementsPage.includes("Paid") && settlementsPage.includes("All"),
  "driver settlements list must provide status filters"
);

assert.ok(
  settlementDetailPage.includes("`/settlements/${settlementId}`"),
  "driver settlement detail must load by settlement id"
);
assert.equal(
  settlementDetailPage.includes('method: "POST"'),
  false,
  "driver settlement detail must remain read-only (no mutation calls)"
);

console.log("driver web ops contract tests passed");

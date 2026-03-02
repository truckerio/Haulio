import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dispatchPage = fs.readFileSync(path.resolve(process.cwd(), "app/dispatch/page.tsx"), "utf8");

assert.ok(
  dispatchPage.includes("showInitialQueueLoadingState") && dispatchPage.includes("Loading dispatch queue..."),
  "Dispatch workbench must render explicit loading state for queue bootstrap"
);
assert.ok(
  dispatchPage.includes("showQueueEmptyState") && dispatchPage.includes("No queue rows match this view."),
  "Dispatch workbench must render explicit empty state when filters produce no rows"
);
assert.ok(
  dispatchPage.includes("Partial sync warning"),
  "Dispatch workbench must expose partial failure state for non-blocking data fetch failures"
);
assert.ok(
  dispatchPage.includes("Retry queue refresh"),
  "Dispatch workbench must offer recoverable retry action for queue errors"
);
assert.ok(
  dispatchPage.includes("formatDispatchRefreshTime(lastRefreshedAt)"),
  "Dispatch workbench must show refresh state visibility in header"
);

console.log("dispatch phase12 state contract tests passed");


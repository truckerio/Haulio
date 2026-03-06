import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const loadPagePath = path.resolve(process.cwd(), "app/loads/[id]/page.tsx");
const loadPage = fs.readFileSync(loadPagePath, "utf8");

assert.ok(
  loadPage.includes("{activeTab === \"overview\" ? ("),
  "Load detail must keep an explicit Overview surface"
);
assert.ok(
  loadPage.includes("id=\"stops\"") && loadPage.includes("SectionHeader title=\"Stops & appointments\""),
  "Load Overview must keep stops/appointments always visible"
);
assert.ok(
  loadPage.includes("SectionHeader title=\"Notes\" subtitle=\"Dispatcher and billing context remains visible\""),
  "Load Overview must keep notes always visible"
);
assert.ok(
  loadPage.includes("sticky top-6 space-y-4"),
  "Load detail must keep right rail layout in overview"
);
assert.ok(
  loadPage.includes("text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]\">Next action"),
  "Load right rail must retain next-action panel"
);
assert.ok(
  loadPage.includes("Execution authority: <span className=\"font-medium text-ink\">Trip/Dispatch</span>"),
  "Load right rail must expose execution authority hint"
);
assert.ok(
  loadPage.includes("Commercial authority: <span className=\"font-medium text-ink\">Load/Finance</span>"),
  "Load right rail must expose commercial authority hint"
);
const dispatchReadinessIndex = loadPage.indexOf(
  "text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]\">Dispatch readiness"
);
const trackingIndex = loadPage.indexOf(
  "text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]\">Tracking"
);
const docsIndex = loadPage.indexOf(
  "text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]\">Documents & POD"
);
const billingIndex = loadPage.indexOf(
  "text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]\">Billing"
);
const freightIndex = loadPage.indexOf(
  "text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]\">Freight"
);
assert.equal(dispatchReadinessIndex > -1, true, "Load right rail must include dispatch readiness card");
assert.equal(trackingIndex > -1, true, "Load right rail must include tracking card");
assert.equal(docsIndex > -1, true, "Load right rail must include documents card");
assert.equal(billingIndex > -1, true, "Load right rail must include billing card");
assert.equal(freightIndex > -1, true, "Load right rail must include freight card");
assert.equal(
  dispatchReadinessIndex < trackingIndex &&
    trackingIndex < docsIndex &&
    docsIndex < billingIndex &&
    billingIndex < freightIndex,
  true,
  "Load right rail must follow dispatch -> tracking -> docs -> billing -> freight order"
);
assert.ok(
  loadPage.includes("Restricted: you cannot create notes on this load."),
  "Load notes actions must fail closed with restricted label"
);
assert.ok(
  loadPage.includes("Restricted: document upload is not available."),
  "Load docs actions must fail closed with restricted label"
);

console.log("load overview layout tests passed");

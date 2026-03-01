import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/index.ts", "utf8");

const anchor = 'app.get("/finance/journals", requireAuth, requireCapability("viewSettlementPreview", "runSettlements"), async (req, res) => {';
const routeIndex = source.indexOf(anchor);
assert.ok(routeIndex >= 0, "finance journals route must exist with capability guard");

const routeBlock = source.slice(routeIndex, routeIndex + 3600);
assert.ok(routeBlock.includes("financeJournalEntry.findMany"), "finance journals route must read journal entries");
assert.ok(routeBlock.includes("lines:"), "finance journals route must include journal lines");
assert.ok(routeBlock.includes("orgId: req.user!.orgId"), "finance journals route must be org scoped");
assert.ok(routeBlock.includes("entityType"), "finance journals route must support entityType filter");
assert.ok(routeBlock.includes("eventType"), "finance journals route must support eventType filter");
assert.ok(routeBlock.includes("idempotencyKey"), "finance journals route must return idempotency key");

console.log("finance journal contract tests passed");

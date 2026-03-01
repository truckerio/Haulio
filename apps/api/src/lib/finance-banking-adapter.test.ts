import assert from "node:assert/strict";
import { createPayoutReceipt } from "./finance-banking-adapter";

process.env.FINANCE_BANKING_ADAPTER = "mock";

const first = createPayoutReceipt({
  orgId: "org-1",
  entityType: "SETTLEMENT",
  entityId: "stl-1",
  amountCents: 12345,
  idempotencyKey: "idem-123",
});
const second = createPayoutReceipt({
  orgId: "org-1",
  entityType: "SETTLEMENT",
  entityId: "stl-1",
  amountCents: 12345,
  idempotencyKey: "idem-123",
});
const differentKey = createPayoutReceipt({
  orgId: "org-1",
  entityType: "SETTLEMENT",
  entityId: "stl-1",
  amountCents: 12345,
  idempotencyKey: "idem-456",
});

assert.equal(first.adapter, "mock");
assert.equal(first.payoutId, second.payoutId);
assert.equal(first.reference, second.reference);
assert.equal(first.idempotencyKey, "idem-123");
assert.notEqual(first.payoutId, differentKey.payoutId);
assert.ok(first.reference.startsWith("MOCK-SETTLEMENT-"));

console.log("finance banking adapter tests passed");


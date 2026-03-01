import assert from "node:assert/strict";
import { PayableRunStatus, SettlementStatus } from "@truckerio/db";
import { evaluatePayableRunHold, evaluateSettlementHold } from "./finance-hold-policy";

const payableHeld = evaluatePayableRunHold({
  status: PayableRunStatus.RUN_FINALIZED,
  lineItemCount: 2,
  holdReasonCode: "ANOMALY_REVIEW_REQUIRED",
  holdOwner: "BILLING",
});
assert.equal(payableHeld.blocked, true);
assert.equal(payableHeld.reasonCode, "ANOMALY_REVIEW_REQUIRED");

const payableMissingItems = evaluatePayableRunHold({
  status: PayableRunStatus.RUN_PREVIEWED,
  lineItemCount: 0,
  holdReasonCode: null,
  holdOwner: null,
});
assert.equal(payableMissingItems.blocked, true);
assert.equal(payableMissingItems.reasonCode, "NO_LINE_ITEMS");

const payableOk = evaluatePayableRunHold({
  status: PayableRunStatus.RUN_FINALIZED,
  lineItemCount: 1,
});
assert.equal(payableOk.blocked, false);

const settlementNoItems = evaluateSettlementHold({
  status: SettlementStatus.FINALIZED,
  itemCount: 0,
  netCents: 100,
});
assert.equal(settlementNoItems.blocked, true);
assert.equal(settlementNoItems.reasonCode, "NO_ITEMS");

const settlementNonPositiveNet = evaluateSettlementHold({
  status: SettlementStatus.FINALIZED,
  itemCount: 1,
  netCents: 0,
});
assert.equal(settlementNonPositiveNet.blocked, true);
assert.equal(settlementNonPositiveNet.reasonCode, "NON_POSITIVE_NET");

const settlementOk = evaluateSettlementHold({
  status: SettlementStatus.FINALIZED,
  itemCount: 1,
  netCents: 100,
});
assert.equal(settlementOk.blocked, false);

console.log("finance hold policy tests passed");

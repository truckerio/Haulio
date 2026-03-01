import assert from "node:assert/strict";
import { SettlementStatus } from "@truckerio/db";
import {
  canFinalizeSettlement,
  canMarkSettlementPaid,
  isFinalizeSettlementIdempotent,
  isMarkSettlementPaidIdempotent,
} from "./settlement-state";

assert.equal(canFinalizeSettlement(SettlementStatus.DRAFT), true);
assert.equal(canFinalizeSettlement(SettlementStatus.FINALIZED), false);
assert.equal(canFinalizeSettlement(SettlementStatus.PAID), false);

assert.equal(isFinalizeSettlementIdempotent(SettlementStatus.DRAFT), false);
assert.equal(isFinalizeSettlementIdempotent(SettlementStatus.FINALIZED), true);
assert.equal(isFinalizeSettlementIdempotent(SettlementStatus.PAID), true);

assert.equal(canMarkSettlementPaid(SettlementStatus.DRAFT), false);
assert.equal(canMarkSettlementPaid(SettlementStatus.FINALIZED), true);
assert.equal(canMarkSettlementPaid(SettlementStatus.PAID), false);

assert.equal(isMarkSettlementPaidIdempotent(SettlementStatus.DRAFT), false);
assert.equal(isMarkSettlementPaidIdempotent(SettlementStatus.FINALIZED), false);
assert.equal(isMarkSettlementPaidIdempotent(SettlementStatus.PAID), true);

console.log("settlement state tests passed");

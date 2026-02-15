import assert from "node:assert/strict";
import { PayableRunStatus } from "@truckerio/db";
import {
  buildPayableChecksum,
  diffPayableLineFingerprints,
  isFinalizeIdempotent,
  payableLineFingerprint,
} from "./payables-engine";

const lineA = {
  partyType: "DRIVER",
  partyId: "d1",
  loadId: "l1",
  type: "EARNING",
  amountCents: 120000,
  memo: "Linehaul",
  source: { settlementId: "s1" },
};
const lineB = {
  partyType: "DRIVER",
  partyId: "d1",
  loadId: "l1",
  type: "DEDUCTION",
  amountCents: 3000,
  memo: "Fuel advance",
  source: { settlementId: "s1" },
};

const checksum1 = buildPayableChecksum([lineA, lineB]);
const checksum2 = buildPayableChecksum([lineB, lineA]);
assert.equal(checksum1, checksum2, "checksum should be order-independent");

const diff = diffPayableLineFingerprints(
  [payableLineFingerprint(lineA)],
  [payableLineFingerprint(lineA), payableLineFingerprint(lineB)]
);
assert.deepEqual(diff, { added: 1, removed: 0 });

assert.equal(isFinalizeIdempotent(PayableRunStatus.RUN_FINALIZED), true);
assert.equal(isFinalizeIdempotent(PayableRunStatus.PAID), true);
assert.equal(isFinalizeIdempotent(PayableRunStatus.RUN_PREVIEWED), false);

console.log("payables engine tests passed");

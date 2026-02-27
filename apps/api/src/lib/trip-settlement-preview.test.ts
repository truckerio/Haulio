import assert from "node:assert/strict";
import { buildTripSettlementPreview } from "./trip-settlement-preview";

const preview = buildTripSettlementPreview({
  loads: [
    {
      miles: 100,
      paidMiles: 110,
      paidMilesSource: "MANUAL_OVERRIDE",
      palletCount: 12,
      weightLbs: 12000,
    },
    {
      miles: 80,
      paidMiles: null,
      paidMilesSource: null,
      palletCount: 4,
      weightLbs: 8000,
    },
    {
      miles: 20,
      paidMiles: 30,
      paidMilesSource: "APPROVED_ACTUAL",
      palletCount: 0,
      weightLbs: 0,
    },
  ],
  accessorialAmounts: ["10.25", 1.75],
  payableLines: [
    { type: "EARNING", amountCents: 100000 },
    { type: "REIMBURSEMENT", amountCents: 5000 },
    { type: "DEDUCTION", amountCents: -2500 },
    { type: "DEDUCTION", amountCents: 500 },
  ],
});

assert.equal(preview.plannedMiles, 200);
assert.equal(preview.paidMiles, 140);
assert.equal(preview.milesVariance, -60);
assert.equal(preview.milesSource, "MIXED");
assert.equal(preview.totalPallets, 16);
assert.equal(preview.totalWeightLbs, 20000);
assert.equal(preview.accessorialTotalCents, 1200);
assert.equal(preview.deductionsTotalCents, 3000);
assert.equal(preview.netPayPreviewCents, 102000);

const noPayables = buildTripSettlementPreview({
  loads: [{ miles: 50, paidMiles: null, paidMilesSource: null }],
  accessorialAmounts: [],
  payableLines: [],
});

assert.equal(noPayables.plannedMiles, 50);
assert.equal(noPayables.paidMiles, null);
assert.equal(noPayables.milesVariance, null);
assert.equal(noPayables.milesSource, null);
assert.equal(noPayables.netPayPreviewCents, null);

console.log("trip settlement preview tests passed");

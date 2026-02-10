import assert from "node:assert/strict";
import {
  AccessorialStatus,
  BillingStatus,
  DocStatus,
  DocType,
  InvoiceStatus,
  LoadStatus,
} from "@truckerio/db";
import { evaluateBillingReadinessSnapshot } from "./billing-readiness";

const baseLoad = { status: LoadStatus.DELIVERED, deliveredAt: new Date() };
const podDoc = { type: DocType.POD, status: DocStatus.UPLOADED };
const rateconDoc = { type: DocType.RATECON, status: DocStatus.UPLOADED };

const ready = evaluateBillingReadinessSnapshot({
  load: baseLoad,
  docs: [podDoc, rateconDoc],
  accessorials: [],
  invoices: [],
});
assert.equal(ready.billingStatus, BillingStatus.READY);
assert.equal(ready.blockingReasons.length, 0);

const missingPod = evaluateBillingReadinessSnapshot({
  load: baseLoad,
  docs: [rateconDoc],
  accessorials: [],
  invoices: [],
});
assert.equal(missingPod.billingStatus, BillingStatus.BLOCKED);
assert.ok(missingPod.blockingReasons.includes("Missing POD"));

const missingRatecon = evaluateBillingReadinessSnapshot({
  load: baseLoad,
  docs: [podDoc],
  accessorials: [],
  invoices: [],
});
assert.equal(missingRatecon.billingStatus, BillingStatus.BLOCKED);
assert.ok(missingRatecon.blockingReasons.includes("Missing Rate Confirmation"));

const accessorialPending = evaluateBillingReadinessSnapshot({
  load: baseLoad,
  docs: [podDoc, rateconDoc],
  accessorials: [{ status: AccessorialStatus.PENDING_APPROVAL, requiresProof: false }],
  invoices: [],
});
assert.equal(accessorialPending.billingStatus, BillingStatus.BLOCKED);
assert.ok(accessorialPending.blockingReasons.includes("Accessorial pending resolution"));

const accessorialMissingProof = evaluateBillingReadinessSnapshot({
  load: baseLoad,
  docs: [podDoc, rateconDoc],
  accessorials: [{ status: AccessorialStatus.NEEDS_PROOF, requiresProof: true, proofDocumentId: null }],
  invoices: [],
});
assert.equal(accessorialMissingProof.billingStatus, BillingStatus.BLOCKED);
assert.ok(accessorialMissingProof.blockingReasons.includes("Accessorial missing proof"));

const accessorialRejected = evaluateBillingReadinessSnapshot({
  load: baseLoad,
  docs: [podDoc, rateconDoc],
  accessorials: [{ status: AccessorialStatus.REJECTED, requiresProof: true, proofDocumentId: null }],
  invoices: [],
});
assert.equal(accessorialRejected.billingStatus, BillingStatus.READY);

const disputed = evaluateBillingReadinessSnapshot({
  load: baseLoad,
  docs: [podDoc, rateconDoc],
  accessorials: [],
  invoices: [{ status: InvoiceStatus.DISPUTED }],
});
assert.equal(disputed.billingStatus, BillingStatus.BLOCKED);
assert.ok(disputed.blockingReasons.includes("Billing dispute open"));

console.log("billing readiness tests passed");


import assert from "node:assert/strict";
import {
  AccessorialStatus,
  BillingStatus,
  DocStatus,
  DocType,
  FinanceAccessorialProofRequirement,
  FinanceDeliveredDocRequirement,
  FinanceRateConRequirement,
  InvoiceStatus,
  LoadStatus,
  LoadType,
} from "@truckerio/db";
import { evaluateBillingReadinessSnapshot } from "./billing-readiness";

const deliveredBrokeredLoad = {
  status: LoadStatus.DELIVERED,
  deliveredAt: new Date(),
  loadType: LoadType.BROKERED,
};

const readyDocs = [
  { type: DocType.POD, status: DocStatus.VERIFIED },
  { type: DocType.RATECON, status: DocStatus.UPLOADED },
  { type: DocType.BOL, status: DocStatus.UPLOADED },
];

const ready = evaluateBillingReadinessSnapshot({
  load: deliveredBrokeredLoad,
  docs: readyDocs,
  accessorials: [],
  invoices: [],
}, {
  requireInvoiceBeforeReady: false,
});
assert.equal(ready.billingStatus, BillingStatus.READY);
assert.equal(ready.blockingReasons.length, 0);

const rateConAlwaysForCompanyLoad = evaluateBillingReadinessSnapshot(
  {
    load: {
      status: LoadStatus.DELIVERED,
      deliveredAt: new Date(),
      loadType: LoadType.COMPANY,
    },
    docs: [{ type: DocType.POD, status: DocStatus.VERIFIED }, { type: DocType.BOL, status: DocStatus.UPLOADED }],
    accessorials: [],
    invoices: [],
  },
  {
    requireRateCon: FinanceRateConRequirement.ALWAYS,
  }
);
assert.equal(rateConAlwaysForCompanyLoad.billingStatus, BillingStatus.BLOCKED);
assert.ok(rateConAlwaysForCompanyLoad.blockingReasons.includes("Missing Rate Confirmation"));

const rateConBrokeredOnlyForCompanyLoad = evaluateBillingReadinessSnapshot(
  {
    load: {
      status: LoadStatus.DELIVERED,
      deliveredAt: new Date(),
      loadType: LoadType.COMPANY,
    },
    docs: [{ type: DocType.POD, status: DocStatus.VERIFIED }, { type: DocType.BOL, status: DocStatus.UPLOADED }],
    accessorials: [],
    invoices: [],
  },
  {
    requireRateCon: FinanceRateConRequirement.BROKERED_ONLY,
    requireInvoiceBeforeReady: false,
  }
);
assert.equal(rateConBrokeredOnlyForCompanyLoad.billingStatus, BillingStatus.READY);

const podRequiredDeliveredOnly = evaluateBillingReadinessSnapshot(
  {
    load: deliveredBrokeredLoad,
    docs: [
      { type: DocType.POD, status: DocStatus.UPLOADED },
      { type: DocType.RATECON, status: DocStatus.UPLOADED },
      { type: DocType.BOL, status: DocStatus.UPLOADED },
    ],
    accessorials: [],
    invoices: [],
  },
  {
    requireSignedPOD: FinanceDeliveredDocRequirement.DELIVERED_ONLY,
  }
);
assert.equal(podRequiredDeliveredOnly.billingStatus, BillingStatus.BLOCKED);
assert.ok(podRequiredDeliveredOnly.blockingReasons.includes("Missing POD"));

const podNeverRequired = evaluateBillingReadinessSnapshot(
  {
    load: deliveredBrokeredLoad,
    docs: [
      { type: DocType.RATECON, status: DocStatus.UPLOADED },
      { type: DocType.BOL, status: DocStatus.UPLOADED },
    ],
    accessorials: [],
    invoices: [],
  },
  {
    requireSignedPOD: FinanceDeliveredDocRequirement.NEVER,
    requireInvoiceBeforeReady: false,
  }
);
assert.equal(podNeverRequired.billingStatus, BillingStatus.READY);

const bolRequired = evaluateBillingReadinessSnapshot(
  {
    load: deliveredBrokeredLoad,
    docs: [
      { type: DocType.POD, status: DocStatus.VERIFIED },
      { type: DocType.RATECON, status: DocStatus.UPLOADED },
    ],
    accessorials: [],
    invoices: [],
  },
  {
    requireBOL: FinanceDeliveredDocRequirement.ALWAYS,
  }
);
assert.equal(bolRequired.billingStatus, BillingStatus.BLOCKED);
assert.ok(bolRequired.blockingReasons.includes("Missing BOL"));

const accessorialProofRequiredWhenPresent = evaluateBillingReadinessSnapshot(
  {
    load: deliveredBrokeredLoad,
    docs: readyDocs,
    accessorials: [{ status: AccessorialStatus.NEEDS_PROOF, requiresProof: true, proofDocumentId: null }],
    invoices: [],
  },
  {
    requireAccessorialProof: FinanceAccessorialProofRequirement.WHEN_ACCESSORIAL_PRESENT,
  }
);
assert.equal(accessorialProofRequiredWhenPresent.billingStatus, BillingStatus.BLOCKED);
assert.ok(accessorialProofRequiredWhenPresent.blockingReasons.includes("Accessorial missing proof"));

const accessorialProofNeverRequired = evaluateBillingReadinessSnapshot(
  {
    load: deliveredBrokeredLoad,
    docs: readyDocs,
    accessorials: [{ status: AccessorialStatus.NEEDS_PROOF, requiresProof: true, proofDocumentId: null }],
    invoices: [],
  },
  {
    requireAccessorialProof: FinanceAccessorialProofRequirement.NEVER,
  }
);
assert.equal(accessorialProofNeverRequired.billingStatus, BillingStatus.BLOCKED);
assert.ok(!accessorialProofNeverRequired.blockingReasons.includes("Accessorial missing proof"));
assert.ok(accessorialProofNeverRequired.blockingReasons.includes("Accessorial pending resolution"));

const disputed = evaluateBillingReadinessSnapshot({
  load: deliveredBrokeredLoad,
  docs: readyDocs,
  accessorials: [],
  invoices: [{ status: InvoiceStatus.DISPUTED }],
});
assert.equal(disputed.billingStatus, BillingStatus.BLOCKED);
assert.ok(disputed.blockingReasons.includes("Billing dispute open"));

const invoiceRequiredBlocked = evaluateBillingReadinessSnapshot(
  {
    load: deliveredBrokeredLoad,
    docs: readyDocs,
    accessorials: [],
    invoices: [],
  },
  {
    requireInvoiceBeforeReady: true,
  }
);
assert.equal(invoiceRequiredBlocked.billingStatus, BillingStatus.BLOCKED);
assert.ok(invoiceRequiredBlocked.blockingReasons.includes("Invoice required before ready"));

const invoiceRequiredSatisfied = evaluateBillingReadinessSnapshot(
  {
    load: deliveredBrokeredLoad,
    docs: readyDocs,
    accessorials: [],
    invoices: [{ status: InvoiceStatus.SENT }],
  },
  {
    requireInvoiceBeforeReady: true,
  }
);
assert.equal(invoiceRequiredSatisfied.billingStatus, BillingStatus.READY);

console.log("billing readiness tests passed");

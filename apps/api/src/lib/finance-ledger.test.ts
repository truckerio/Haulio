import assert from "node:assert/strict";
import {
  buildInvoiceIssuedJournal,
  buildInvoicePaymentReceivedJournal,
  buildPayableRunPaidJournal,
  buildSettlementPaidJournal,
  createJournalEntry,
} from "./finance-ledger";

const settlementJournal = buildSettlementPaidJournal({
  orgId: "org-1",
  settlementId: "settlement-1",
  amountCents: 12000,
  idempotencyKey: "idem-a",
});
assert.equal(settlementJournal.eventType, "SETTLEMENT_PAID");
assert.equal(settlementJournal.totalDebitCents, 12000);
assert.equal(settlementJournal.totalCreditCents, 12000);
assert.equal(settlementJournal.lines.length, 2);
assert.equal(Object.isFrozen(settlementJournal), true);
assert.equal(Object.isFrozen(settlementJournal.lines), true);
assert.equal(Object.isFrozen(settlementJournal.lines[0]), true);

const payableJournal = buildPayableRunPaidJournal({
  orgId: "org-1",
  payableRunId: "run-1",
  amountCents: 25000,
  idempotencyKey: "idem-b",
});
assert.equal(payableJournal.eventType, "PAYABLE_RUN_PAID");
assert.equal(payableJournal.totalDebitCents, 25000);
assert.equal(payableJournal.totalCreditCents, 25000);

const issuedJournal = buildInvoiceIssuedJournal({
  orgId: "org-1",
  invoiceId: "inv-1",
  amountCents: 320000,
  idempotencyKey: "idem-issued",
});
assert.equal(issuedJournal.eventType, "INVOICE_ISSUED");
assert.equal(issuedJournal.entityType, "INVOICE");
assert.equal(issuedJournal.totalDebitCents, 320000);
assert.equal(issuedJournal.totalCreditCents, 320000);

const paymentJournal = buildInvoicePaymentReceivedJournal({
  orgId: "org-1",
  invoiceId: "inv-1",
  amountCents: 300000,
  idempotencyKey: "idem-payment",
});
assert.equal(paymentJournal.eventType, "INVOICE_PAYMENT_RECEIVED");
assert.equal(paymentJournal.entityType, "INVOICE");
assert.equal(paymentJournal.totalDebitCents, 300000);
assert.equal(paymentJournal.totalCreditCents, 300000);

assert.throws(
  () =>
    createJournalEntry({
      orgId: "org-1",
      eventType: "SETTLEMENT_PAID",
      entityType: "SETTLEMENT",
      entityId: "bad-1",
      idempotencyKey: "idem-c",
      lines: [
        { account: "DRIVER_PAYABLE", side: "DEBIT", amountCents: 100 },
        { account: "CASH_CLEARING", side: "CREDIT", amountCents: 99 },
      ],
    }),
  /Unbalanced journal entry/
);

assert.throws(
  () =>
    createJournalEntry({
      orgId: "org-1",
      eventType: "SETTLEMENT_PAID",
      entityType: "SETTLEMENT",
      entityId: "bad-2",
      idempotencyKey: "idem-d",
      lines: [{ account: "CASH_CLEARING", side: "DEBIT", amountCents: 100 }],
    }),
  /at least 2 lines/
);

console.log("finance ledger tests passed");

import assert from "node:assert/strict";
import {
  BillingStatus,
  DocStatus,
  DocType,
  InvoiceStatus,
  LoadStatus,
  LoadType,
  SettlementStatus,
} from "@truckerio/db";
import { applyFinanceReceivableFilters, mapLoadToFinanceReceivableRow } from "./finance-receivables";
import { normalizeFinancePolicy } from "./finance-policy";

const now = new Date("2026-02-14T12:00:00.000Z");

const baseLoad: any = {
  id: "load_1",
  loadNumber: "LD-1001",
  status: LoadStatus.DELIVERED,
  loadType: LoadType.BROKERED,
  billingStatus: BillingStatus.BLOCKED,
  billingBlockingReasons: [],
  deliveredAt: new Date("2026-02-12T10:00:00.000Z"),
  desiredInvoiceDate: null,
  customerName: "Acme",
  customer: { name: "Acme" },
  rate: "2500.00",
  externalInvoiceRef: null,
  invoicedAt: null,
  stops: [],
  docs: [
    { type: DocType.POD, status: DocStatus.VERIFIED },
    { type: DocType.RATECON, status: DocStatus.VERIFIED },
    { type: DocType.BOL, status: DocStatus.VERIFIED },
  ],
  charges: [],
  accessorials: [],
  invoices: [],
  SettlementItem: [],
  billingSubmissions: [],
  operatingEntity: { id: "oe1", name: "Haulio" },
  driver: { id: "d1", name: "Driver One" },
};

const readyRow = mapLoadToFinanceReceivableRow({
  load: baseLoad,
  policy: normalizeFinancePolicy(null),
  now,
  quickbooksConnected: true,
});
assert.equal(readyRow.billingStage, "READY");
assert.equal(readyRow.readinessSnapshot.isReady, true);
assert.ok(readyRow.actions.allowedActions.includes("SEND_TO_FACTORING"));

const blockedRow = mapLoadToFinanceReceivableRow({
  load: {
    ...baseLoad,
    docs: [{ type: DocType.RATECON, status: DocStatus.VERIFIED }, { type: DocType.BOL, status: DocStatus.VERIFIED }],
  },
  policy: normalizeFinancePolicy(null),
  now,
  quickbooksConnected: false,
});
assert.equal(blockedRow.billingStage, "DOCS_REVIEW");
assert.equal(blockedRow.readinessSnapshot.isReady, false);
assert.ok(blockedRow.readinessSnapshot.blockers.some((item) => item.code === "POD_MISSING"));
assert.equal(blockedRow.integrations.quickbooks.syncStatus, "NOT_CONNECTED");

const invoicedRow = mapLoadToFinanceReceivableRow({
  load: {
    ...baseLoad,
    invoices: [
      {
        id: "inv1",
        invoiceNumber: "INV-1001",
        status: InvoiceStatus.SENT,
        sentAt: new Date("2026-02-10T12:00:00.000Z"),
        generatedAt: new Date("2026-02-10T11:00:00.000Z"),
        totalAmount: "2500.00",
      },
    ],
    externalInvoiceRef: "QBO-1",
    invoicedAt: new Date("2026-02-10T12:05:00.000Z"),
  },
  policy: normalizeFinancePolicy(null),
  now,
  quickbooksConnected: true,
});
assert.equal(invoicedRow.billingStage, "INVOICE_SENT");
assert.equal(invoicedRow.integrations.quickbooks.syncStatus, "SYNCED");

const settledRow = mapLoadToFinanceReceivableRow({
  load: {
    ...baseLoad,
    invoices: [
      {
        id: "inv2",
        invoiceNumber: "INV-1002",
        status: InvoiceStatus.PAID,
        sentAt: new Date("2026-02-08T12:00:00.000Z"),
        generatedAt: new Date("2026-02-08T11:00:00.000Z"),
        totalAmount: "2100.00",
      },
    ],
    SettlementItem: [{ settlement: { status: SettlementStatus.FINALIZED } }],
  },
  policy: normalizeFinancePolicy(null),
  now,
  quickbooksConnected: true,
});
assert.equal(settledRow.billingStage, "SETTLED");

assert.equal(
  applyFinanceReceivableFilters(readyRow, {
    stage: ["READY"],
    blockerCode: null,
    agingBucket: ["0_30", "31_60"],
    qboSyncStatus: ["NOT_SYNCED", "SYNCED"],
    readyState: "READY",
  }),
  true
);
assert.equal(
  applyFinanceReceivableFilters(readyRow, {
    stage: ["DOCS_REVIEW"],
    blockerCode: null,
    agingBucket: undefined,
    qboSyncStatus: undefined,
    readyState: undefined,
  }),
  false
);
assert.equal(
  applyFinanceReceivableFilters(blockedRow, {
    stage: ["DOCS_REVIEW"],
    blockerCode: "POD_MISSING",
    agingBucket: undefined,
    qboSyncStatus: ["NOT_CONNECTED"],
    readyState: "BLOCKED",
  }),
  true
);

console.log("finance receivables tests passed");

import crypto from "crypto";

export type LedgerSide = "DEBIT" | "CREDIT";

export type LedgerAccount =
  | "CASH_CLEARING"
  | "DRIVER_PAYABLE"
  | "SETTLEMENT_EXPENSE"
  | "AR_CLEARING"
  | "REVENUE"
  | "VENDOR_PAYABLE"
  | "FACTORING_RESERVE"
  | "FACTORING_FEE_EXPENSE";

export type JournalEventType =
  | "INVOICE_ISSUED"
  | "INVOICE_PAYMENT_RECEIVED"
  | "FACTORING_TRANSACTION_POSTED"
  | "SETTLEMENT_PAID"
  | "PAYABLE_RUN_PAID"
  | "VENDOR_BILL_PAID";

export type JournalLine = {
  account: LedgerAccount;
  side: LedgerSide;
  amountCents: number;
  memo?: string;
};

export type JournalEntry = {
  entryId: string;
  orgId: string;
  eventType: JournalEventType;
  entityType: "INVOICE" | "FACTORING_TRANSACTION" | "SETTLEMENT" | "PAYABLE_RUN" | "VENDOR_BILL";
  entityId: string;
  idempotencyKey: string;
  createdAt: string;
  totalDebitCents: number;
  totalCreditCents: number;
  lines: readonly Readonly<JournalLine>[];
};

type CreateJournalEntryInput = {
  orgId: string;
  eventType: JournalEventType;
  entityType: "INVOICE" | "FACTORING_TRANSACTION" | "SETTLEMENT" | "PAYABLE_RUN" | "VENDOR_BILL";
  entityId: string;
  idempotencyKey: string;
  lines: JournalLine[];
};

function makeEntryId(input: {
  orgId: string;
  eventType: JournalEventType;
  entityType: "INVOICE" | "FACTORING_TRANSACTION" | "SETTLEMENT" | "PAYABLE_RUN" | "VENDOR_BILL";
  entityId: string;
  idempotencyKey: string;
}) {
  const digest = crypto
    .createHash("sha256")
    .update([input.orgId, input.eventType, input.entityType, input.entityId, input.idempotencyKey].join(":"))
    .digest("hex")
    .slice(0, 20);
  return `jrnl_${digest}`;
}

function assertValidLine(line: JournalLine, index: number) {
  if (!line.account) {
    throw new Error(`Journal line ${index} missing account`);
  }
  if (line.side !== "DEBIT" && line.side !== "CREDIT") {
    throw new Error(`Journal line ${index} has invalid side`);
  }
  if (!Number.isInteger(line.amountCents) || line.amountCents <= 0) {
    throw new Error(`Journal line ${index} amountCents must be a positive integer`);
  }
}

function freezeLine(line: JournalLine) {
  return Object.freeze({
    account: line.account,
    side: line.side,
    amountCents: line.amountCents,
    memo: line.memo,
  });
}

export function createJournalEntry(input: CreateJournalEntryInput): Readonly<JournalEntry> {
  if (!input.orgId) throw new Error("Journal entry requires orgId");
  if (!input.entityId) throw new Error("Journal entry requires entityId");
  if (!input.idempotencyKey) throw new Error("Journal entry requires idempotencyKey");
  if (!Array.isArray(input.lines) || input.lines.length < 2) {
    throw new Error("Journal entry must contain at least 2 lines");
  }

  let totalDebitCents = 0;
  let totalCreditCents = 0;
  const frozenLines = input.lines.map((line, index) => {
    assertValidLine(line, index);
    if (line.side === "DEBIT") totalDebitCents += line.amountCents;
    else totalCreditCents += line.amountCents;
    return freezeLine(line);
  });

  if (totalDebitCents !== totalCreditCents) {
    throw new Error(
      `Unbalanced journal entry: totalDebitCents=${totalDebitCents}, totalCreditCents=${totalCreditCents}`
    );
  }

  const entry: JournalEntry = {
    entryId: makeEntryId(input),
    orgId: input.orgId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
    totalDebitCents,
    totalCreditCents,
    lines: Object.freeze(frozenLines),
  };

  return Object.freeze(entry);
}

export function journalToJson(journal: Readonly<JournalEntry>) {
  return {
    entryId: journal.entryId,
    orgId: journal.orgId,
    eventType: journal.eventType,
    entityType: journal.entityType,
    entityId: journal.entityId,
    idempotencyKey: journal.idempotencyKey,
    createdAt: journal.createdAt,
    totalDebitCents: journal.totalDebitCents,
    totalCreditCents: journal.totalCreditCents,
    lines: journal.lines.map((line) => ({
      account: line.account,
      side: line.side,
      amountCents: line.amountCents,
      memo: line.memo ?? null,
    })),
  };
}

export function buildSettlementPaidJournal(params: {
  orgId: string;
  settlementId: string;
  amountCents: number;
  idempotencyKey: string;
}) {
  return createJournalEntry({
    orgId: params.orgId,
    eventType: "SETTLEMENT_PAID",
    entityType: "SETTLEMENT",
    entityId: params.settlementId,
    idempotencyKey: params.idempotencyKey,
    lines: [
      { account: "DRIVER_PAYABLE", side: "DEBIT", amountCents: params.amountCents, memo: "Driver settlement paid" },
      { account: "CASH_CLEARING", side: "CREDIT", amountCents: params.amountCents, memo: "Cash outflow" },
    ],
  });
}

export function buildInvoiceIssuedJournal(params: {
  orgId: string;
  invoiceId: string;
  amountCents: number;
  idempotencyKey: string;
}) {
  return createJournalEntry({
    orgId: params.orgId,
    eventType: "INVOICE_ISSUED",
    entityType: "INVOICE",
    entityId: params.invoiceId,
    idempotencyKey: params.idempotencyKey,
    lines: [
      { account: "AR_CLEARING", side: "DEBIT", amountCents: params.amountCents, memo: "Invoice issued" },
      { account: "REVENUE", side: "CREDIT", amountCents: params.amountCents, memo: "Freight revenue recognized" },
    ],
  });
}

export function buildInvoicePaymentReceivedJournal(params: {
  orgId: string;
  invoiceId: string;
  amountCents: number;
  idempotencyKey: string;
}) {
  return createJournalEntry({
    orgId: params.orgId,
    eventType: "INVOICE_PAYMENT_RECEIVED",
    entityType: "INVOICE",
    entityId: params.invoiceId,
    idempotencyKey: params.idempotencyKey,
    lines: [
      { account: "CASH_CLEARING", side: "DEBIT", amountCents: params.amountCents, memo: "Invoice payment received" },
      { account: "AR_CLEARING", side: "CREDIT", amountCents: params.amountCents, memo: "Receivable cleared" },
    ],
  });
}

export function buildPayableRunPaidJournal(params: {
  orgId: string;
  payableRunId: string;
  amountCents: number;
  idempotencyKey: string;
}) {
  return createJournalEntry({
    orgId: params.orgId,
    eventType: "PAYABLE_RUN_PAID",
    entityType: "PAYABLE_RUN",
    entityId: params.payableRunId,
    idempotencyKey: params.idempotencyKey,
    lines: [
      { account: "DRIVER_PAYABLE", side: "DEBIT", amountCents: params.amountCents, memo: "Payable run paid" },
      { account: "CASH_CLEARING", side: "CREDIT", amountCents: params.amountCents, memo: "Cash outflow" },
    ],
  });
}

export function buildVendorBillPaidJournal(params: {
  orgId: string;
  vendorBillId: string;
  amountCents: number;
  idempotencyKey: string;
}) {
  return createJournalEntry({
    orgId: params.orgId,
    eventType: "VENDOR_BILL_PAID",
    entityType: "VENDOR_BILL",
    entityId: params.vendorBillId,
    idempotencyKey: params.idempotencyKey,
    lines: [
      { account: "VENDOR_PAYABLE", side: "DEBIT", amountCents: params.amountCents, memo: "Vendor bill paid" },
      { account: "CASH_CLEARING", side: "CREDIT", amountCents: params.amountCents, memo: "Cash outflow" },
    ],
  });
}

export function buildFactoringTransactionJournal(params: {
  orgId: string;
  transactionId: string;
  type: "ADVANCE" | "RESERVE_RELEASE" | "FEE" | "RECOURSE" | "ADJUSTMENT";
  amountCents: number;
  idempotencyKey: string;
}) {
  const lines: JournalLine[] =
    params.type === "ADVANCE"
      ? [
          { account: "CASH_CLEARING", side: "DEBIT", amountCents: params.amountCents, memo: "Factoring advance" },
          { account: "AR_CLEARING", side: "CREDIT", amountCents: params.amountCents, memo: "Receivable advanced" },
        ]
      : params.type === "RESERVE_RELEASE"
      ? [
          { account: "CASH_CLEARING", side: "DEBIT", amountCents: params.amountCents, memo: "Factoring reserve release" },
          { account: "FACTORING_RESERVE", side: "CREDIT", amountCents: params.amountCents, memo: "Reserve cleared" },
        ]
      : params.type === "FEE"
      ? [
          { account: "FACTORING_FEE_EXPENSE", side: "DEBIT", amountCents: params.amountCents, memo: "Factoring fee" },
          { account: "CASH_CLEARING", side: "CREDIT", amountCents: params.amountCents, memo: "Fee outflow" },
        ]
      : params.type === "RECOURSE"
      ? [
          { account: "AR_CLEARING", side: "DEBIT", amountCents: params.amountCents, memo: "Factoring recourse" },
          { account: "CASH_CLEARING", side: "CREDIT", amountCents: params.amountCents, memo: "Cash clawback" },
        ]
      : [
          { account: "CASH_CLEARING", side: "DEBIT", amountCents: params.amountCents, memo: "Factoring adjustment" },
          { account: "AR_CLEARING", side: "CREDIT", amountCents: params.amountCents, memo: "Receivable adjustment" },
        ];

  return createJournalEntry({
    orgId: params.orgId,
    eventType: "FACTORING_TRANSACTION_POSTED",
    entityType: "FACTORING_TRANSACTION",
    entityId: params.transactionId,
    idempotencyKey: params.idempotencyKey,
    lines,
  });
}

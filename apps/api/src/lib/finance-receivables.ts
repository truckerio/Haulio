import {
  BillingStatus,
  BillingSubmissionChannel,
  BillingSubmissionStatus,
  FinanceBlockerOwner,
  InvoiceStatus,
  LoadStatus,
  Prisma,
  QboEntityType,
  QboSyncJobStatus,
  prisma,
} from "@truckerio/db";
import { evaluateBillingReadinessSnapshot } from "./billing-readiness";
import { normalizeFinancePolicy, type OrgFinancePolicy } from "./finance-policy";

export const FINANCE_RECEIVABLE_STAGE = {
  DELIVERED: "DELIVERED",
  DOCS_REVIEW: "DOCS_REVIEW",
  READY: "READY",
  INVOICE_SENT: "INVOICE_SENT",
  COLLECTED: "COLLECTED",
  SETTLED: "SETTLED",
} as const;

export type FinanceReceivableStage = (typeof FINANCE_RECEIVABLE_STAGE)[keyof typeof FINANCE_RECEIVABLE_STAGE];
export type FinanceAgingBucket = "0_30" | "31_60" | "61_90" | "90_plus" | "unknown";
export type FinanceQboSyncStatus = "NOT_CONNECTED" | "NOT_SYNCED" | "SYNCING" | "SYNCED" | "FAILED";
export type FinanceNextBestAction =
  | "OPEN_LOAD"
  | "UPLOAD_DOCS"
  | "GENERATE_INVOICE"
  | "SEND_TO_FACTORING"
  | "RETRY_FACTORING"
  | "RETRY_QBO_SYNC"
  | "FOLLOW_UP_COLLECTION"
  | "MARK_COLLECTED"
  | "VIEW_SETTLEMENT";

export type FinanceReceivableRow = {
  loadId: string;
  loadNumber: string;
  customer: string | null;
  billTo: string | null;
  amountCents: number;
  deliveredAt: Date | null;
  billingStage: FinanceReceivableStage;
  readinessSnapshot: {
    isReady: boolean;
    blockers: Array<{
      code: string;
      severity: "error" | "warning";
      message: string;
      meta: Record<string, unknown>;
    }>;
    computedAt: Date;
    version: number;
  };
  topBlocker: {
    code: string;
    severity: "error" | "warning";
    message: string;
    meta: Record<string, unknown>;
  } | null;
  // Keep legacy key during rollout for old consumers.
  readiness: {
    isReady: boolean;
    blockers: Array<{
      code: string;
      severity: "error" | "warning";
      message: string;
      meta: Record<string, unknown>;
    }>;
    computedAt: Date;
    version: number;
  };
  invoice: {
    invoiceId: string | null;
    invoiceNumber: string | null;
    invoiceSentAt: Date | null;
    dueDate: Date | null;
    pdfPath?: string | null;
    packetPath?: string | null;
  };
  collections: {
    daysOutstanding: number | null;
    agingBucket: FinanceAgingBucket;
  };
  integrations: {
    quickbooks: {
      syncStatus: FinanceQboSyncStatus;
      qboInvoiceId: string | null;
      lastError: string | null;
      syncedAt: Date | null;
    };
  };
  factoring: {
    lastSubmission: {
      id: string;
      status: BillingSubmissionStatus;
      toEmail: string;
      createdAt: Date;
      errorMessage: string | null;
      attachmentMode: string;
    } | null;
  };
  nextBestAction: FinanceNextBestAction;
  nextBestActionReasonCodes: string[];
  priorityScore: number;
  blockerOwner: FinanceBlockerOwner | null;
  factorReady: boolean;
  factorReadyReasonCodes: string[];
  actions: {
    primaryAction: string;
    allowedActions: string[];
  };
};

export type FinanceReceivablesSummaryCounters = {
  total: number;
  ready: number;
  blocked: number;
  byStage: Record<FinanceReceivableStage, number>;
  byAgingBucket: Record<FinanceAgingBucket, number>;
  byQboSyncStatus: Record<FinanceQboSyncStatus, number>;
};

export const FINANCE_POLICY_SELECT = {
  requireRateCon: true,
  requireBOL: true,
  requireSignedPOD: true,
  requireAccessorialProof: true,
  requireInvoiceBeforeReady: true,
  requireInvoiceBeforeSend: true,
  allowReadinessOverride: true,
  overrideRoles: true,
  factoringEnabled: true,
  factoringEmail: true,
  factoringCcEmails: true,
  factoringAttachmentMode: true,
  defaultPaymentTermsDays: true,
} as const;

const FINANCE_RECEIVABLE_LOAD_INCLUDE = {
  customer: { select: { name: true } },
  operatingEntity: { select: { id: true, name: true } },
  driver: { select: { id: true, name: true } },
  stops: { orderBy: { sequence: "asc" } },
  docs: true,
  charges: true,
  accessorials: true,
  invoices: {
    orderBy: { generatedAt: "desc" },
    include: { items: true },
  },
  SettlementItem: { include: { settlement: true } },
  billingSubmissions: {
    where: { channel: BillingSubmissionChannel.FACTORING },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
} satisfies Prisma.LoadInclude;

type FinanceLoadWithRelations = Prisma.LoadGetPayload<{ include: typeof FINANCE_RECEIVABLE_LOAD_INCLUDE }>;

type ListReceivablesParams = {
  orgId: string;
  now?: Date;
  quickbooksConnected: boolean;
  cursor?: string | null;
  limit: number;
  search?: string;
  stage?: FinanceReceivableStage[];
  readyState?: "READY" | "BLOCKED";
  blockerCode?: string | null;
  agingBucket?: FinanceAgingBucket[];
  qboSyncStatus?: FinanceQboSyncStatus[];
};

const FINANCE_LOAD_STATUSES = [
  LoadStatus.DELIVERED,
  LoadStatus.POD_RECEIVED,
  LoadStatus.READY_TO_INVOICE,
  LoadStatus.INVOICED,
  LoadStatus.PAID,
] as const;

const BLOCKER_CODE_MAP: Record<string, { code: string; severity: "error" | "warning" }> = {
  "Delivery incomplete": { code: "DELIVERY_INCOMPLETE", severity: "error" },
  "Missing POD": { code: "POD_MISSING", severity: "error" },
  "Missing BOL": { code: "BOL_MISSING", severity: "error" },
  "Missing Rate Confirmation": { code: "RATECON_MISSING", severity: "error" },
  "Invoice required before ready": { code: "INVOICE_REQUIRED", severity: "warning" },
  "Accessorial pending resolution": { code: "ACCESSORIAL_PENDING", severity: "warning" },
  "Accessorial missing proof": { code: "ACCESSORIAL_PROOF_MISSING", severity: "error" },
  "Billing dispute open": { code: "BILLING_DISPUTE", severity: "warning" },
};

function toCents(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

function deriveAgingBucket(daysOutstanding: number | null): FinanceAgingBucket {
  if (daysOutstanding === null) return "unknown";
  if (daysOutstanding <= 30) return "0_30";
  if (daysOutstanding <= 60) return "31_60";
  if (daysOutstanding <= 90) return "61_90";
  return "90_plus";
}

function daysSince(now: Date, at?: Date | null) {
  if (!at) return null;
  const ms = now.getTime() - at.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function deriveBillingStage(params: {
  readiness: { isReady: boolean; blockers: string[] };
  invoice: { status: InvoiceStatus } | null;
  settlementStatuses: string[];
}): FinanceReceivableStage {
  if (params.settlementStatuses.some((status) => status === "FINALIZED" || status === "PAID")) {
    return FINANCE_RECEIVABLE_STAGE.SETTLED;
  }
  if (params.invoice?.status === InvoiceStatus.PAID || params.invoice?.status === InvoiceStatus.SHORT_PAID) {
    return FINANCE_RECEIVABLE_STAGE.COLLECTED;
  }
  if (params.invoice && params.invoice.status !== InvoiceStatus.VOID) {
    return FINANCE_RECEIVABLE_STAGE.INVOICE_SENT;
  }
  if (params.readiness.isReady) {
    return FINANCE_RECEIVABLE_STAGE.READY;
  }
  if (!params.readiness.blockers.includes("Delivery incomplete")) {
    return FINANCE_RECEIVABLE_STAGE.DOCS_REVIEW;
  }
  return FINANCE_RECEIVABLE_STAGE.DELIVERED;
}

function deriveBlockerOwner(code: string): FinanceBlockerOwner {
  switch (code) {
    case "DELIVERY_INCOMPLETE":
    case "RATECON_MISSING":
      return FinanceBlockerOwner.DISPATCH;
    case "POD_MISSING":
    case "BOL_MISSING":
      return FinanceBlockerOwner.DRIVER;
    case "ACCESSORIAL_PENDING":
    case "ACCESSORIAL_PROOF_MISSING":
    case "INVOICE_REQUIRED":
      return FinanceBlockerOwner.BILLING;
    case "BILLING_DISPUTE":
      return FinanceBlockerOwner.CUSTOMER;
    default:
      return FinanceBlockerOwner.SYSTEM;
  }
}

function deriveQuickbooksSyncStatus(params: {
  quickbooksConnected: boolean;
  latestInvoice: { status: InvoiceStatus } | null;
  externalInvoiceRef: string | null;
  latestQboJob:
    | {
        status: QboSyncJobStatus;
        qboId: string | null;
      }
    | null;
}): FinanceQboSyncStatus {
  if (!params.quickbooksConnected) return "NOT_CONNECTED";
  if (params.latestQboJob?.status === QboSyncJobStatus.SYNCING) return "SYNCING";
  if (params.latestQboJob?.status === QboSyncJobStatus.FAILED) return "FAILED";
  if (params.latestQboJob?.status === QboSyncJobStatus.SYNCED) return "SYNCED";
  if (!params.latestInvoice) return "NOT_SYNCED";
  if (params.externalInvoiceRef || params.latestQboJob?.qboId) return "SYNCED";
  if (params.latestInvoice.status === InvoiceStatus.SENT || params.latestInvoice.status === InvoiceStatus.PAID) {
    return "NOT_SYNCED";
  }
  return "NOT_SYNCED";
}

function deriveFactorReadiness(params: {
  readinessIsReady: boolean;
  readinessBlockers: Array<{ code: string }>;
  latestInvoice: { id: string; pdfPath?: string | null; packetPath?: string | null } | null;
  policy: OrgFinancePolicy;
}) {
  const reasonCodes: string[] = [];
  if (!params.readinessIsReady) {
    for (const blocker of params.readinessBlockers) {
      reasonCodes.push(`READINESS_${blocker.code}`);
    }
  }
  if (params.policy.requireInvoiceBeforeSend && !params.latestInvoice) {
    reasonCodes.push("INVOICE_REQUIRED");
  }
  if (params.latestInvoice && !params.latestInvoice.pdfPath) {
    reasonCodes.push("INVOICE_PDF_MISSING");
  }
  if (params.policy.factoringAttachmentMode === "ZIP" && params.latestInvoice && !params.latestInvoice.packetPath) {
    reasonCodes.push("PACKET_MISSING");
  }
  return {
    factorReady: reasonCodes.length === 0,
    factorReadyReasonCodes: Array.from(new Set(reasonCodes)),
  };
}

function deriveNextBestAction(params: {
  stage: FinanceReceivableStage;
  blockers: Array<{ code: string }>;
  hasInvoice: boolean;
  quickbooksSyncStatus: FinanceQboSyncStatus;
  factoringFailed: boolean;
  daysOutstanding: number | null;
  factorReady: boolean;
}): { nextBestAction: FinanceNextBestAction; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  if (params.blockers.length > 0) {
    const blockerCodes = new Set(params.blockers.map((blocker) => blocker.code));
    if (blockerCodes.has("INVOICE_REQUIRED")) {
      reasonCodes.push("POLICY_REQUIRE_INVOICE_BEFORE_READY");
      return { nextBestAction: "GENERATE_INVOICE", reasonCodes };
    }
    if (
      blockerCodes.has("POD_MISSING") ||
      blockerCodes.has("BOL_MISSING") ||
      blockerCodes.has("RATECON_MISSING") ||
      blockerCodes.has("DELIVERY_INCOMPLETE")
    ) {
      reasonCodes.push("MISSING_REQUIRED_DOCS");
      return { nextBestAction: "UPLOAD_DOCS", reasonCodes };
    }
    reasonCodes.push("RESOLVE_BLOCKERS");
    return { nextBestAction: "OPEN_LOAD", reasonCodes };
  }
  if (!params.hasInvoice) {
    reasonCodes.push("READY_FOR_INVOICE");
    return { nextBestAction: "GENERATE_INVOICE", reasonCodes };
  }
  if (params.quickbooksSyncStatus === "FAILED") {
    reasonCodes.push("QBO_SYNC_FAILED");
    return { nextBestAction: "RETRY_QBO_SYNC", reasonCodes };
  }
  if (params.factoringFailed && params.factorReady) {
    reasonCodes.push("FACTORING_PREVIOUS_ATTEMPT_FAILED");
    return { nextBestAction: "RETRY_FACTORING", reasonCodes };
  }
  if (params.stage === FINANCE_RECEIVABLE_STAGE.INVOICE_SENT && (params.daysOutstanding ?? 0) > 30) {
    reasonCodes.push("OVERDUE_COLLECTION");
    return { nextBestAction: "FOLLOW_UP_COLLECTION", reasonCodes };
  }
  if (params.stage === FINANCE_RECEIVABLE_STAGE.COLLECTED) {
    reasonCodes.push("COLLECTED_READY_TO_SETTLE");
    return { nextBestAction: "MARK_COLLECTED", reasonCodes };
  }
  if (params.stage === FINANCE_RECEIVABLE_STAGE.SETTLED) {
    reasonCodes.push("SETTLED_VIEW_ONLY");
    return { nextBestAction: "VIEW_SETTLEMENT", reasonCodes };
  }
  reasonCodes.push("OPEN_WORKFLOW");
  return { nextBestAction: "OPEN_LOAD", reasonCodes };
}

function derivePriorityScore(params: {
  stage: FinanceReceivableStage;
  amountCents: number;
  daysOutstanding: number | null;
  blockers: Array<{ severity: "error" | "warning" }>;
  qboSyncStatus: FinanceQboSyncStatus;
}) {
  let score = 0;
  if (params.stage === FINANCE_RECEIVABLE_STAGE.DOCS_REVIEW) score += 20;
  if (params.stage === FINANCE_RECEIVABLE_STAGE.READY) score += 30;
  if (params.stage === FINANCE_RECEIVABLE_STAGE.INVOICE_SENT) score += 40;
  if (params.stage === FINANCE_RECEIVABLE_STAGE.COLLECTED) score += 25;
  if ((params.daysOutstanding ?? 0) > 90) score += 70;
  else if ((params.daysOutstanding ?? 0) > 60) score += 55;
  else if ((params.daysOutstanding ?? 0) > 30) score += 35;
  else if ((params.daysOutstanding ?? 0) > 0) score += 10;
  score += Math.min(35, Math.floor(params.amountCents / 50_000));
  score += params.blockers.filter((blocker) => blocker.severity === "error").length * 10;
  score += params.blockers.filter((blocker) => blocker.severity === "warning").length * 4;
  if (params.qboSyncStatus === "FAILED") score += 25;
  if (params.qboSyncStatus === "SYNCING") score -= 5;
  return Math.max(0, Math.round(score));
}

function deriveActions(params: {
  stage: FinanceReceivableStage;
  nextBestAction: FinanceNextBestAction;
  hasInvoice: boolean;
  hasInvoicePdf: boolean;
  hasPacket: boolean;
  quickbooksSyncStatus: FinanceQboSyncStatus;
  factorReady: boolean;
  factoringFailed: boolean;
}) {
  const allowed = new Set<string>(["OPEN_LOAD"]);
  if (params.stage === FINANCE_RECEIVABLE_STAGE.DELIVERED || params.stage === FINANCE_RECEIVABLE_STAGE.DOCS_REVIEW) {
    allowed.add("UPLOAD_DOCS");
  }
  if (!params.hasInvoice && params.stage === FINANCE_RECEIVABLE_STAGE.READY) {
    allowed.add("GENERATE_INVOICE");
  }
  if (params.hasInvoice) {
    allowed.add("OPEN_INVOICE");
    allowed.add("VIEW_INVOICE");
  }
  if (params.hasInvoicePdf) {
    allowed.add("DOWNLOAD_INVOICE_PDF");
  }
  if (params.hasPacket) {
    allowed.add("DOWNLOAD_PACKET");
  }
  if (params.stage === FINANCE_RECEIVABLE_STAGE.INVOICE_SENT) {
    allowed.add("FOLLOW_UP_COLLECTION");
    allowed.add("MARK_COLLECTED");
  }
  if (params.stage === FINANCE_RECEIVABLE_STAGE.COLLECTED) {
    allowed.add("MARK_COLLECTED");
    allowed.add("GENERATE_SETTLEMENT");
  }
  if (params.stage === FINANCE_RECEIVABLE_STAGE.SETTLED) {
    allowed.add("VIEW_SETTLEMENT");
  }
  if (params.factorReady) {
    allowed.add("SEND_TO_FACTORING");
  }
  if (params.factoringFailed) {
    allowed.add("RETRY_FACTORING");
  }
  if (params.quickbooksSyncStatus === "FAILED") {
    allowed.add("RETRY_QBO_SYNC");
  }
  const primaryAction = allowed.has(params.nextBestAction) ? params.nextBestAction : "OPEN_LOAD";
  return { primaryAction, allowedActions: Array.from(allowed) };
}

function deriveDueDate(params: {
  latestInvoice: { sentAt?: Date | null } | null;
  desiredInvoiceDate: Date | null;
  policy: OrgFinancePolicy;
}) {
  const sentAt = params.latestInvoice?.sentAt ?? null;
  if (sentAt && params.policy.defaultPaymentTermsDays !== null) {
    return new Date(sentAt.getTime() + params.policy.defaultPaymentTermsDays * 24 * 60 * 60 * 1000);
  }
  return params.desiredInvoiceDate;
}

export function mapLoadToFinanceReceivableRow(params: {
  load: FinanceLoadWithRelations;
  policy: OrgFinancePolicy;
  now: Date;
  quickbooksConnected: boolean;
  latestQboJob?: {
    status: QboSyncJobStatus;
    qboId: string | null;
    lastErrorMessage: string | null;
    updatedAt: Date;
  } | null;
}): FinanceReceivableRow {
  const { load, policy, now, quickbooksConnected, latestQboJob = null } = params;
  const readiness = evaluateBillingReadinessSnapshot(
    {
      load,
      stops: load.stops,
      docs: load.docs,
      accessorials: load.accessorials,
      invoices: load.invoices.map((invoice) => ({ status: invoice.status })),
    },
    policy
  );

  const latestInvoice = load.invoices[0] ?? null;
  const settlementStatuses = load.SettlementItem.map((item) => item.settlement.status);
  const blockers = readiness.blockingReasons.map((message) => {
    const mapped = BLOCKER_CODE_MAP[message] ?? { code: "UNKNOWN", severity: "warning" as const };
    return {
      code: mapped.code,
      severity: mapped.severity,
      message,
      meta: {},
    };
  });

  const billingStage = deriveBillingStage({
    readiness: { isReady: readiness.billingStatus === BillingStatus.READY, blockers: readiness.blockingReasons },
    invoice: latestInvoice ? { status: latestInvoice.status } : null,
    settlementStatuses,
  });

  const invoiceAnchorDate = latestInvoice?.sentAt ?? latestInvoice?.generatedAt ?? load.deliveredAt;
  const daysOutstanding = daysSince(now, invoiceAnchorDate);
  const agingBucket = deriveAgingBucket(daysOutstanding);
  const readinessSnapshot = {
    isReady: readiness.billingStatus === BillingStatus.READY,
    blockers,
    computedAt: now,
    version: 3,
  };
  const syncStatus = deriveQuickbooksSyncStatus({
    quickbooksConnected,
    latestInvoice,
    externalInvoiceRef: load.externalInvoiceRef ?? null,
    latestQboJob,
  });
  const lastSubmission = load.billingSubmissions[0] ?? null;
  const amountCents = toCents(latestInvoice?.totalAmount ?? load.rate);
  const factorReadiness = deriveFactorReadiness({
    readinessIsReady: readinessSnapshot.isReady,
    readinessBlockers: readinessSnapshot.blockers,
    latestInvoice,
    policy,
  });
  const blockerOwner = readinessSnapshot.blockers.length > 0 ? deriveBlockerOwner(readinessSnapshot.blockers[0]!.code) : null;
  const nextBestAction = deriveNextBestAction({
    stage: billingStage,
    blockers: readinessSnapshot.blockers,
    hasInvoice: Boolean(latestInvoice),
    quickbooksSyncStatus: syncStatus,
    factoringFailed: lastSubmission?.status === BillingSubmissionStatus.FAILED,
    daysOutstanding,
    factorReady: factorReadiness.factorReady,
  });
  const priorityScore = derivePriorityScore({
    stage: billingStage,
    amountCents,
    daysOutstanding,
    blockers: readinessSnapshot.blockers,
    qboSyncStatus: syncStatus,
  });
  const actions = deriveActions({
    stage: billingStage,
    nextBestAction: nextBestAction.nextBestAction,
    hasInvoice: Boolean(latestInvoice),
    hasInvoicePdf: Boolean(latestInvoice?.pdfPath),
    hasPacket: Boolean(latestInvoice?.packetPath),
    quickbooksSyncStatus: syncStatus,
    factorReady: factorReadiness.factorReady,
    factoringFailed: lastSubmission?.status === BillingSubmissionStatus.FAILED,
  });

  return {
    loadId: load.id,
    loadNumber: load.loadNumber,
    customer: load.customerName ?? load.customer?.name ?? null,
    billTo: load.customerName ?? load.customer?.name ?? null,
    amountCents,
    deliveredAt: load.deliveredAt ?? null,
    billingStage,
    readinessSnapshot,
    readiness: readinessSnapshot,
    topBlocker: readinessSnapshot.blockers[0] ?? null,
    invoice: {
      invoiceId: latestInvoice?.id ?? null,
      invoiceNumber: latestInvoice?.invoiceNumber ?? null,
      invoiceSentAt: latestInvoice?.sentAt ?? null,
      pdfPath: latestInvoice?.pdfPath ?? null,
      packetPath: latestInvoice?.packetPath ?? null,
      dueDate: deriveDueDate({
        latestInvoice,
        desiredInvoiceDate: load.desiredInvoiceDate ?? null,
        policy,
      }),
    },
    collections: {
      daysOutstanding,
      agingBucket,
    },
    integrations: {
      quickbooks: {
        syncStatus,
        qboInvoiceId: latestQboJob?.qboId ?? load.externalInvoiceRef ?? null,
        lastError: latestQboJob?.lastErrorMessage ?? load.qboSyncLastError ?? null,
        syncedAt:
          syncStatus === "SYNCED"
            ? latestQboJob?.updatedAt ?? load.invoicedAt ?? latestInvoice?.sentAt ?? null
            : null,
      },
    },
    factoring: {
      lastSubmission: lastSubmission
        ? {
            id: lastSubmission.id,
            status: lastSubmission.status,
            toEmail: lastSubmission.toEmail,
            createdAt: lastSubmission.createdAt,
            errorMessage: lastSubmission.errorMessage ?? null,
            attachmentMode: lastSubmission.attachmentMode,
          }
        : null,
    },
    nextBestAction: nextBestAction.nextBestAction,
    nextBestActionReasonCodes: nextBestAction.reasonCodes,
    priorityScore,
    blockerOwner,
    factorReady: factorReadiness.factorReady,
    factorReadyReasonCodes: factorReadiness.factorReadyReasonCodes,
    actions,
  };
}

type ReceivablesFilterInput = Pick<ListReceivablesParams, "stage" | "readyState" | "blockerCode" | "agingBucket" | "qboSyncStatus">;

export function applyFinanceReceivableFilters(row: FinanceReceivableRow, filters: ReceivablesFilterInput) {
  if (filters.stage?.length && !filters.stage.includes(row.billingStage)) {
    return false;
  }
  if (filters.readyState === "READY" && !row.readinessSnapshot.isReady) {
    return false;
  }
  if (filters.readyState === "BLOCKED" && row.readinessSnapshot.isReady) {
    return false;
  }
  if (
    filters.blockerCode &&
    !row.readinessSnapshot.blockers.some((blocker) => blocker.code === filters.blockerCode)
  ) {
    return false;
  }
  if (filters.agingBucket?.length && !filters.agingBucket.includes(row.collections.agingBucket)) {
    return false;
  }
  if (filters.qboSyncStatus?.length && !filters.qboSyncStatus.includes(row.integrations.quickbooks.syncStatus)) {
    return false;
  }
  return true;
}

function buildSummaryCounters(items: FinanceReceivableRow[]): FinanceReceivablesSummaryCounters {
  const byStage: Record<FinanceReceivableStage, number> = {
    DELIVERED: 0,
    DOCS_REVIEW: 0,
    READY: 0,
    INVOICE_SENT: 0,
    COLLECTED: 0,
    SETTLED: 0,
  };
  const byAgingBucket: Record<FinanceAgingBucket, number> = {
    "0_30": 0,
    "31_60": 0,
    "61_90": 0,
    "90_plus": 0,
    unknown: 0,
  };
  const byQboSyncStatus: Record<FinanceQboSyncStatus, number> = {
    NOT_CONNECTED: 0,
    NOT_SYNCED: 0,
    SYNCING: 0,
    SYNCED: 0,
    FAILED: 0,
  };
  let ready = 0;
  let blocked = 0;
  for (const item of items) {
    byStage[item.billingStage] += 1;
    byAgingBucket[item.collections.agingBucket] += 1;
    byQboSyncStatus[item.integrations.quickbooks.syncStatus] += 1;
    if (item.readinessSnapshot.isReady) ready += 1;
    else blocked += 1;
  }
  return {
    total: items.length,
    ready,
    blocked,
    byStage,
    byAgingBucket,
    byQboSyncStatus,
  };
}

export async function listFinanceReceivables(params: ListReceivablesParams) {
  const now = params.now ?? new Date();
  const where: Prisma.LoadWhereInput = {
    orgId: params.orgId,
    deletedAt: null,
    status: { in: [...FINANCE_LOAD_STATUSES] },
  };

  if (params.search?.trim()) {
    const q = params.search.trim();
    where.OR = [
      { loadNumber: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const settings = await prisma.orgSettings.findFirst({
    where: { orgId: params.orgId },
    select: FINANCE_POLICY_SELECT,
  });
  const policy = normalizeFinancePolicy(settings);

  const items: FinanceReceivableRow[] = [];
  const loadsById = new Map<string, FinanceLoadWithRelations>();
  let dbCursor = params.cursor ?? null;
  const fetchBatchSize = Math.min(200, Math.max(params.limit * 3, params.limit + 1));
  let hasMoreInDb = true;

  while (items.length < params.limit + 1 && hasMoreInDb) {
    const loads = await prisma.load.findMany({
      where,
      include: FINANCE_RECEIVABLE_LOAD_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: dbCursor ? { id: dbCursor } : undefined,
      skip: dbCursor ? 1 : 0,
      take: fetchBatchSize,
    });
    if (loads.length === 0) {
      hasMoreInDb = false;
      break;
    }

    const invoiceIds = Array.from(
      new Set(
        loads
          .map((load) => load.invoices[0]?.id ?? null)
          .filter((value): value is string => Boolean(value))
      )
    );
    const latestQboJobByInvoiceId = new Map<
      string,
      {
        status: QboSyncJobStatus;
        qboId: string | null;
        lastErrorMessage: string | null;
        updatedAt: Date;
      }
    >();
    if (invoiceIds.length > 0) {
      const jobs = await prisma.qboSyncJob.findMany({
        where: {
          orgId: params.orgId,
          entityType: QboEntityType.INVOICE,
          entityId: { in: invoiceIds },
        },
        select: {
          entityId: true,
          status: true,
          qboId: true,
          lastErrorMessage: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      });
      for (const job of jobs) {
        if (!latestQboJobByInvoiceId.has(job.entityId)) {
          latestQboJobByInvoiceId.set(job.entityId, job);
        }
      }
    }

    for (const load of loads) {
      const row = mapLoadToFinanceReceivableRow({
        load,
        policy,
        now,
        quickbooksConnected: params.quickbooksConnected,
        latestQboJob: load.invoices[0]?.id ? latestQboJobByInvoiceId.get(load.invoices[0].id) ?? null : null,
      });
      if (!applyFinanceReceivableFilters(row, params)) {
        continue;
      }
      items.push(row);
      loadsById.set(load.id, load);
      if (items.length >= params.limit + 1) {
        break;
      }
    }

    dbCursor = loads[loads.length - 1]?.id ?? null;
    hasMoreInDb = loads.length === fetchBatchSize;
  }

  const hasMore = items.length > params.limit;
  const pageItems = hasMore ? items.slice(0, params.limit) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.loadId ?? null : null;
  const summaryCounters = buildSummaryCounters(pageItems);

  return {
    items: pageItems,
    rows: pageItems,
    nextCursor,
    hasMore,
    summaryCounters,
    loadsById,
  };
}

export function mapReceivablesToLegacyReadiness(
  rows: FinanceReceivableRow[],
  loadsById?: Map<string, FinanceLoadWithRelations>
) {
  return rows.map((row) => ({
    id: row.loadId,
    loadNumber: row.loadNumber,
    status: loadsById?.get(row.loadId)?.status ?? row.billingStage,
    customerName: row.customer,
    stops: loadsById?.get(row.loadId)?.stops ?? [],
    billingStatus: row.readinessSnapshot.isReady ? BillingStatus.READY : BillingStatus.BLOCKED,
    billingBlockingReasons: row.readinessSnapshot.blockers.map((blocker) => blocker.message),
  }));
}

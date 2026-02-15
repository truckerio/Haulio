import {
  BillingStatus,
  BillingSubmissionChannel,
  BillingSubmissionStatus,
  InvoiceStatus,
  LoadStatus,
  Prisma,
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

function deriveActions(stage: FinanceReceivableStage) {
  switch (stage) {
    case FINANCE_RECEIVABLE_STAGE.DELIVERED:
    case FINANCE_RECEIVABLE_STAGE.DOCS_REVIEW:
      return { primaryAction: "OPEN_LOAD", allowedActions: ["OPEN_LOAD", "UPLOAD_DOCS"] };
    case FINANCE_RECEIVABLE_STAGE.READY:
      return { primaryAction: "GENERATE_INVOICE", allowedActions: ["GENERATE_INVOICE", "SEND_TO_FACTORING", "OPEN_LOAD"] };
    case FINANCE_RECEIVABLE_STAGE.INVOICE_SENT:
      return { primaryAction: "FOLLOW_UP_COLLECTION", allowedActions: ["FOLLOW_UP_COLLECTION", "MARK_COLLECTED", "OPEN_INVOICE"] };
    case FINANCE_RECEIVABLE_STAGE.COLLECTED:
      return { primaryAction: "GENERATE_SETTLEMENT", allowedActions: ["GENERATE_SETTLEMENT", "VIEW_INVOICE"] };
    case FINANCE_RECEIVABLE_STAGE.SETTLED:
      return { primaryAction: "VIEW_SETTLEMENT", allowedActions: ["VIEW_SETTLEMENT", "VIEW_INVOICE"] };
    default:
      return { primaryAction: "OPEN_LOAD", allowedActions: ["OPEN_LOAD"] };
  }
}

function deriveQuickbooksSyncStatus(params: {
  quickbooksConnected: boolean;
  latestInvoice: { status: InvoiceStatus } | null;
  externalInvoiceRef: string | null;
}): FinanceQboSyncStatus {
  if (!params.quickbooksConnected) return "NOT_CONNECTED";
  if (!params.latestInvoice) return "NOT_SYNCED";
  if (params.externalInvoiceRef) return "SYNCED";
  if (params.latestInvoice.status === InvoiceStatus.SENT || params.latestInvoice.status === InvoiceStatus.PAID) {
    return "NOT_SYNCED";
  }
  return "NOT_SYNCED";
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
}): FinanceReceivableRow {
  const { load, policy, now, quickbooksConnected } = params;
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
  });
  const lastSubmission = load.billingSubmissions[0] ?? null;

  return {
    loadId: load.id,
    loadNumber: load.loadNumber,
    customer: load.customerName ?? load.customer?.name ?? null,
    billTo: load.customerName ?? load.customer?.name ?? null,
    amountCents: toCents(latestInvoice?.totalAmount ?? load.rate),
    deliveredAt: load.deliveredAt ?? null,
    billingStage,
    readinessSnapshot,
    readiness: readinessSnapshot,
    invoice: {
      invoiceId: latestInvoice?.id ?? null,
      invoiceNumber: latestInvoice?.invoiceNumber ?? null,
      invoiceSentAt: latestInvoice?.sentAt ?? null,
      dueDate: deriveDueDate({
        latestInvoice,
        desiredInvoiceDate: load.desiredInvoiceDate ?? null,
        policy,
      }),
    },
    collections: {
      daysOutstanding,
      agingBucket: deriveAgingBucket(daysOutstanding),
    },
    integrations: {
      quickbooks: {
        syncStatus,
        qboInvoiceId: load.externalInvoiceRef ?? null,
        lastError: null,
        syncedAt: load.externalInvoiceRef ? load.invoicedAt ?? latestInvoice?.sentAt ?? null : null,
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
    actions: deriveActions(billingStage),
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

    for (const load of loads) {
      const row = mapLoadToFinanceReceivableRow({
        load,
        policy,
        now,
        quickbooksConnected: params.quickbooksConnected,
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

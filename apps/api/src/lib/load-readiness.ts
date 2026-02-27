import {
  AccessorialStatus,
  DispatchExceptionOwner,
  DispatchExceptionSeverity,
  DispatchExceptionStatus,
  DocStatus,
  DocType,
  FinanceDeliveredDocRequirement,
  FinanceRateConRequirement,
  InvoiceStatus,
  LoadStatus,
  Role,
  StopType,
} from "@truckerio/db";
import { z } from "zod";

export const READINESS_SEVERITIES = ["BLOCKER", "WARNING"] as const;
export type ReadinessSeverity = (typeof READINESS_SEVERITIES)[number];

export const READINESS_DOMAINS = ["DISPATCH", "BILLING", "COMPLIANCE"] as const;
export type ReadinessDomain = (typeof READINESS_DOMAINS)[number];

export const READINESS_OWNER_ROLES = [
  Role.ADMIN,
  Role.DISPATCHER,
  Role.HEAD_DISPATCHER,
  Role.BILLING,
  Role.SAFETY,
  Role.SUPPORT,
  Role.DRIVER,
] as const;
export type ReadinessOwnerRole = (typeof READINESS_OWNER_ROLES)[number];

export const READINESS_BLOCKER_CODES = [
  "UNASSIGNED_DRIVER",
  "UNASSIGNED_EQUIPMENT",
  "MISSING_APPOINTMENT",
  "APPT_AT_RISK",
  "OVERDUE",
  "OPEN_EXCEPTION",
  "MISSING_POD",
  "MISSING_BOL",
  "MISSING_RATECON",
  "UNAPPROVED_ACCESSORIAL",
  "MISSING_BILL_TO",
  "BILLING_PROFILE_INCOMPLETE",
  "LOAD_NOT_DELIVERED",
  "DRIVER_DOC_EXPIRED",
  "DRIVER_DOC_EXPIRING_SOON",
  "EQUIPMENT_DOC_EXPIRED",
  "EQUIPMENT_DOC_EXPIRING_SOON",
] as const;
export type ReadinessBlockerCode = (typeof READINESS_BLOCKER_CODES)[number];

export const READINESS_BLOCKER_CODE_DOMAIN: Record<ReadinessBlockerCode, ReadinessDomain> = {
  UNASSIGNED_DRIVER: "DISPATCH",
  UNASSIGNED_EQUIPMENT: "DISPATCH",
  MISSING_APPOINTMENT: "DISPATCH",
  APPT_AT_RISK: "DISPATCH",
  OVERDUE: "DISPATCH",
  OPEN_EXCEPTION: "DISPATCH",
  MISSING_POD: "BILLING",
  MISSING_BOL: "BILLING",
  MISSING_RATECON: "BILLING",
  UNAPPROVED_ACCESSORIAL: "BILLING",
  MISSING_BILL_TO: "BILLING",
  BILLING_PROFILE_INCOMPLETE: "BILLING",
  LOAD_NOT_DELIVERED: "BILLING",
  DRIVER_DOC_EXPIRED: "COMPLIANCE",
  DRIVER_DOC_EXPIRING_SOON: "COMPLIANCE",
  EQUIPMENT_DOC_EXPIRED: "COMPLIANCE",
  EQUIPMENT_DOC_EXPIRING_SOON: "COMPLIANCE",
};

export const READINESS_POLICY_DEFAULTS = {
  dispatchAtRiskMinutes: 120,
  dispatchAtRiskBlocks: false,
  dispatchOverdueBlocks: true,
  complianceExpiringSoonDays: 14,
} as const;

const readinessSeveritySchema = z.enum(READINESS_SEVERITIES);
const readinessDomainSchema = z.enum(READINESS_DOMAINS);
const readinessOwnerRoleSchema = z.enum(READINESS_OWNER_ROLES);
const readinessCodeSchema = z.enum(READINESS_BLOCKER_CODES);

export const readinessBlockerSchema = z.object({
  domain: readinessDomainSchema,
  code: readinessCodeSchema,
  message: z.string().min(1),
  ownerRole: readinessOwnerRoleSchema,
  actionHint: z.string().min(1),
  severity: readinessSeveritySchema,
});

export type Blocker = z.infer<typeof readinessBlockerSchema>;

export const readinessSchema = z.object({
  ready: z.boolean(),
  blockers: z.array(readinessBlockerSchema),
});

export type Readiness = z.infer<typeof readinessSchema>;

export const readinessProjectionSchema = z.object({
  dispatch: readinessSchema,
  billing: readinessSchema,
  compliance: readinessSchema,
  overall: readinessSchema,
});

export type LoadReadinessProjection = z.infer<typeof readinessProjectionSchema>;

type DispatchStopSnapshot = {
  type: StopType;
  appointmentStart?: Date | string | null;
  appointmentEnd?: Date | string | null;
  arrivedAt?: Date | string | null;
  departedAt?: Date | string | null;
  sequence?: number | null;
};

type DispatchExceptionSnapshot = {
  type?: string | null;
  title?: string | null;
  owner?: DispatchExceptionOwner | null;
  severity?: DispatchExceptionSeverity | null;
  status?: DispatchExceptionStatus | null;
};

export type DispatchReadinessInput = {
  assignedDriverId?: string | null;
  truckId?: string | null;
  trailerId?: string | null;
  stops?: DispatchStopSnapshot[] | null;
  exceptions?: DispatchExceptionSnapshot[] | null;
  now?: Date;
  atRiskWindowMinutes?: number;
  atRiskBlocks?: boolean;
  overdueBlocks?: boolean;
};

type BillingDocSnapshot = {
  type: DocType;
  status: DocStatus;
};

type BillingAccessorialSnapshot = {
  status: AccessorialStatus;
  requiresProof?: boolean;
  proofDocumentId?: string | null;
};

type BillingInvoiceSnapshot = {
  status: InvoiceStatus;
};

type BillingCustomerSnapshot = {
  billingEmail?: string | null;
  remitToAddress?: string | null;
  termsDays?: number | null;
};

export type BillingReadinessInput = {
  loadStatus: LoadStatus;
  deliveredAt?: Date | string | null;
  customerId?: string | null;
  customerName?: string | null;
  customer?: BillingCustomerSnapshot | null;
  stops?: DispatchStopSnapshot[] | null;
  docs?: BillingDocSnapshot[] | null;
  accessorials?: BillingAccessorialSnapshot[] | null;
  invoices?: BillingInvoiceSnapshot[] | null;
  requireBOL: FinanceDeliveredDocRequirement;
  requireSignedPOD: FinanceDeliveredDocRequirement;
  requireRateCon: FinanceRateConRequirement;
};

export type ComplianceReadinessInput = {
  driverDocExpirations?: Array<Date | string | null>;
  equipmentDocExpirations?: Array<Date | string | null>;
  now?: Date;
  expiringSoonDays?: number;
};

const RATECON_DOC_TYPES = new Set<DocType>([DocType.RATECON, DocType.RATE_CONFIRMATION]);
const DELIVERY_COMPLETE_STATUSES = new Set<LoadStatus>([
  LoadStatus.DELIVERED,
  LoadStatus.POD_RECEIVED,
  LoadStatus.READY_TO_INVOICE,
  LoadStatus.INVOICED,
  LoadStatus.PAID,
]);
const BILLING_TERMINAL_STATUSES = new Set<LoadStatus>([LoadStatus.INVOICED, LoadStatus.PAID]);
const ACCESSORIAL_UNAPPROVED = new Set<AccessorialStatus>([
  AccessorialStatus.PROPOSED,
  AccessorialStatus.NEEDS_PROOF,
  AccessorialStatus.PENDING_APPROVAL,
]);

const severityRank: Record<ReadinessSeverity, number> = {
  BLOCKER: 0,
  WARNING: 1,
};

const domainRank: Record<ReadinessDomain, number> = {
  DISPATCH: 0,
  BILLING: 1,
  COMPLIANCE: 2,
};

const toDate = (value?: Date | string | null) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const blockerIdentityKey = (blocker: Blocker) =>
  `${blocker.severity}|${blocker.domain}|${blocker.code}|${blocker.ownerRole}|${blocker.message}|${blocker.actionHint}`;

const blockerSort = (a: Blocker, b: Blocker) => {
  const severityDiff = severityRank[a.severity] - severityRank[b.severity];
  if (severityDiff !== 0) return severityDiff;
  const domainDiff = domainRank[a.domain] - domainRank[b.domain];
  if (domainDiff !== 0) return domainDiff;
  if (a.code !== b.code) return a.code.localeCompare(b.code);
  if (a.message !== b.message) return a.message.localeCompare(b.message);
  if (a.ownerRole !== b.ownerRole) return a.ownerRole.localeCompare(b.ownerRole);
  return a.actionHint.localeCompare(b.actionHint);
};

export function sortAndDedupeReadinessBlockers(blockers: Blocker[]): Blocker[] {
  const normalized = blockers.map((blocker) => readinessBlockerSchema.parse(blocker)).sort(blockerSort);
  const deduped: Blocker[] = [];
  const seen = new Set<string>();
  for (const blocker of normalized) {
    const key = blockerIdentityKey(blocker);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(blocker);
  }
  return deduped;
}

function makeReadiness(blockers: Blocker[]): Readiness {
  const normalized = sortAndDedupeReadinessBlockers(blockers);
  return {
    ready: !normalized.some((blocker) => blocker.severity === "BLOCKER"),
    blockers: normalized,
  };
}

function createBlocker(params: {
  code: ReadinessBlockerCode;
  message: string;
  ownerRole: ReadinessOwnerRole;
  actionHint: string;
  severity: ReadinessSeverity;
}): Blocker {
  return readinessBlockerSchema.parse({
    domain: READINESS_BLOCKER_CODE_DOMAIN[params.code],
    code: params.code,
    message: params.message,
    ownerRole: params.ownerRole,
    actionHint: params.actionHint,
    severity: params.severity,
  });
}

function ownerForException(owner?: DispatchExceptionOwner | null): ReadinessOwnerRole {
  if (!owner) return Role.DISPATCHER;
  if (owner === DispatchExceptionOwner.DRIVER) return Role.DRIVER;
  if (owner === DispatchExceptionOwner.BILLING) return Role.BILLING;
  if (owner === DispatchExceptionOwner.SYSTEM) return Role.ADMIN;
  if (owner === DispatchExceptionOwner.CUSTOMER) return Role.HEAD_DISPATCHER;
  return Role.DISPATCHER;
}

function isDeliveryComplete(params: {
  loadStatus: LoadStatus;
  deliveredAt?: Date | string | null;
  stops?: DispatchStopSnapshot[] | null;
}) {
  if (toDate(params.deliveredAt)) return true;
  if (DELIVERY_COMPLETE_STATUSES.has(params.loadStatus)) return true;
  const deliveries = (params.stops ?? []).filter((stop) => stop.type === StopType.DELIVERY);
  if (!deliveries.length) return false;
  const finalDelivery = deliveries
    .slice()
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .at(-1);
  if (!finalDelivery) return false;
  return Boolean(toDate(finalDelivery.departedAt) || toDate(finalDelivery.arrivedAt));
}

function hasDoc(docs: BillingDocSnapshot[], predicate: (doc: BillingDocSnapshot) => boolean) {
  return docs.some((doc) => predicate(doc) && doc.status !== DocStatus.REJECTED);
}

function shouldRequireDeliveredDoc(requirement: FinanceDeliveredDocRequirement, delivered: boolean) {
  if (requirement === FinanceDeliveredDocRequirement.NEVER) return false;
  if (requirement === FinanceDeliveredDocRequirement.ALWAYS) return true;
  return delivered;
}

function shouldRequireRateCon(requirement: FinanceRateConRequirement) {
  return requirement !== FinanceRateConRequirement.NEVER;
}

export function evaluateDispatchReadiness(input: DispatchReadinessInput): Readiness {
  const blockers: Blocker[] = [];
  const now = input.now ?? new Date();
  const atRiskWindowMinutes = input.atRiskWindowMinutes ?? READINESS_POLICY_DEFAULTS.dispatchAtRiskMinutes;
  const atRiskBlocks = input.atRiskBlocks ?? READINESS_POLICY_DEFAULTS.dispatchAtRiskBlocks;
  const overdueBlocks = input.overdueBlocks ?? READINESS_POLICY_DEFAULTS.dispatchOverdueBlocks;

  if (!input.assignedDriverId) {
    blockers.push(
      createBlocker({
        code: "UNASSIGNED_DRIVER",
        message: "Driver is not assigned.",
        ownerRole: Role.DISPATCHER,
        actionHint: "Assign a driver from Trip assignment.",
        severity: "BLOCKER",
      })
    );
  }
  if (!input.truckId || !input.trailerId) {
    blockers.push(
      createBlocker({
        code: "UNASSIGNED_EQUIPMENT",
        message: "Truck or trailer is not assigned.",
        ownerRole: Role.DISPATCHER,
        actionHint: "Assign truck and trailer from Trip assignment.",
        severity: "BLOCKER",
      })
    );
  }

  const stops = (input.stops ?? []).slice().sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const pickup = stops.find((stop) => stop.type === StopType.PICKUP) ?? null;
  const delivery = stops.filter((stop) => stop.type === StopType.DELIVERY).at(-1) ?? null;
  if (!pickup || (!pickup.appointmentStart && !pickup.appointmentEnd)) {
    blockers.push(
      createBlocker({
        code: "MISSING_APPOINTMENT",
        message: "Pickup appointment is missing.",
        ownerRole: Role.DISPATCHER,
        actionHint: "Add pickup appointment window.",
        severity: "BLOCKER",
      })
    );
  }
  if (!delivery || (!delivery.appointmentStart && !delivery.appointmentEnd)) {
    blockers.push(
      createBlocker({
        code: "MISSING_APPOINTMENT",
        message: "Delivery appointment is missing.",
        ownerRole: Role.DISPATCHER,
        actionHint: "Add delivery appointment window.",
        severity: "BLOCKER",
      })
    );
  }

  const nextStop = stops.find((stop) => !toDate(stop.arrivedAt) || !toDate(stop.departedAt)) ?? null;
  const nextStart = toDate(nextStop?.appointmentStart);
  const nextEnd = toDate(nextStop?.appointmentEnd);
  const nextArrived = Boolean(toDate(nextStop?.arrivedAt));
  if (nextStop && !nextArrived) {
    if (nextEnd && nextEnd.getTime() < now.getTime()) {
      blockers.push(
        createBlocker({
          code: "OVERDUE",
          message: "Upcoming stop is overdue.",
          ownerRole: Role.DISPATCHER,
          actionHint: "Update ETA or stop timing.",
          severity: overdueBlocks ? "BLOCKER" : "WARNING",
        })
      );
    } else {
      const reference = nextStart ?? nextEnd;
      if (reference) {
        const diffMinutes = Math.round((reference.getTime() - now.getTime()) / 60000);
        if (diffMinutes >= 0 && diffMinutes <= atRiskWindowMinutes) {
          blockers.push(
            createBlocker({
              code: "APPT_AT_RISK",
              message: "Upcoming appointment is at risk.",
              ownerRole: Role.DISPATCHER,
              actionHint: "Confirm ETA and update appointment if needed.",
              severity: atRiskBlocks ? "BLOCKER" : "WARNING",
            })
          );
        }
      }
    }
  }

  const openExceptions = (input.exceptions ?? []).filter(
    (exception) => exception.status === DispatchExceptionStatus.OPEN || exception.status === DispatchExceptionStatus.ACKNOWLEDGED
  );
  if (openExceptions.length) {
    const prioritized =
      openExceptions.find((exception) => exception.severity === DispatchExceptionSeverity.BLOCKER) ?? openExceptions[0]!;
    blockers.push(
      createBlocker({
        code: "OPEN_EXCEPTION",
        message: prioritized.title?.trim() || prioritized.type?.trim() || "Open dispatch exception requires attention.",
        ownerRole: ownerForException(prioritized.owner),
        actionHint: "Open exceptions panel and resolve the issue.",
        severity: prioritized.severity === DispatchExceptionSeverity.BLOCKER ? "BLOCKER" : "WARNING",
      })
    );
  }

  return makeReadiness(blockers);
}

export function evaluateBillingReadiness(input: BillingReadinessInput): Readiness {
  const blockers: Blocker[] = [];
  if (BILLING_TERMINAL_STATUSES.has(input.loadStatus)) {
    return makeReadiness(blockers);
  }

  const delivered = isDeliveryComplete({
    loadStatus: input.loadStatus,
    deliveredAt: input.deliveredAt,
    stops: input.stops,
  });
  const docs = input.docs ?? [];
  const accessorials = input.accessorials ?? [];

  const requiresDelivery =
    input.requireBOL !== FinanceDeliveredDocRequirement.NEVER || input.requireSignedPOD !== FinanceDeliveredDocRequirement.NEVER;
  if (requiresDelivery && !delivered) {
    blockers.push(
      createBlocker({
        code: "LOAD_NOT_DELIVERED",
        message: "Load is not delivered.",
        ownerRole: Role.DISPATCHER,
        actionHint: "Complete delivery stop events before billing.",
        severity: "BLOCKER",
      })
    );
  }

  if (shouldRequireDeliveredDoc(input.requireSignedPOD, delivered)) {
    const hasVerifiedPod = docs.some((doc) => doc.type === DocType.POD && doc.status === DocStatus.VERIFIED);
    if (!hasVerifiedPod) {
      blockers.push(
        createBlocker({
          code: "MISSING_POD",
          message: "Signed POD is missing or unverified.",
          ownerRole: Role.DRIVER,
          actionHint: "Upload and verify POD in Docs.",
          severity: "BLOCKER",
        })
      );
    }
  }

  if (shouldRequireDeliveredDoc(input.requireBOL, delivered) && !hasDoc(docs, (doc) => doc.type === DocType.BOL)) {
    blockers.push(
      createBlocker({
        code: "MISSING_BOL",
        message: "BOL document is missing.",
        ownerRole: Role.DISPATCHER,
        actionHint: "Upload BOL in Docs.",
        severity: "BLOCKER",
      })
    );
  }

  if (shouldRequireRateCon(input.requireRateCon) && !hasDoc(docs, (doc) => RATECON_DOC_TYPES.has(doc.type))) {
    blockers.push(
      createBlocker({
        code: "MISSING_RATECON",
        message: "Rate confirmation is missing.",
        ownerRole: Role.DISPATCHER,
        actionHint: "Upload Rate Confirmation document.",
        severity: "BLOCKER",
      })
    );
  }

  if (accessorials.some((row) => ACCESSORIAL_UNAPPROVED.has(row.status))) {
    blockers.push(
      createBlocker({
        code: "UNAPPROVED_ACCESSORIAL",
        message: "Accessorials are pending approval.",
        ownerRole: Role.BILLING,
        actionHint: "Review and approve/reject accessorials.",
        severity: "BLOCKER",
      })
    );
  }

  if (!input.customerId && !(input.customerName ?? "").trim()) {
    blockers.push(
      createBlocker({
        code: "MISSING_BILL_TO",
        message: "Bill-to customer is missing.",
        ownerRole: Role.BILLING,
        actionHint: "Set customer on load.",
        severity: "BLOCKER",
      })
    );
  } else if (input.customerId) {
    const profile = input.customer;
    if (!profile || !profile.billingEmail || !profile.remitToAddress || profile.termsDays == null) {
      blockers.push(
        createBlocker({
          code: "BILLING_PROFILE_INCOMPLETE",
          message: "Billing profile is incomplete.",
          ownerRole: Role.BILLING,
          actionHint: "Complete customer billing email, remit-to address, and terms.",
          severity: "BLOCKER",
        })
      );
    }
  }

  return makeReadiness(blockers);
}

function buildComplianceBlockers(params: {
  codeExpired: "DRIVER_DOC_EXPIRED" | "EQUIPMENT_DOC_EXPIRED";
  codeExpiringSoon: "DRIVER_DOC_EXPIRING_SOON" | "EQUIPMENT_DOC_EXPIRING_SOON";
  ownerRole: ReadinessOwnerRole;
  actionHint: string;
  dates: Array<Date | null>;
  now: Date;
  thresholdDate: Date;
}) {
  const blockers: Blocker[] = [];
  const expiredCount = params.dates.filter((date) => Boolean(date) && date!.getTime() < params.now.getTime()).length;
  if (expiredCount > 0) {
    blockers.push(
      createBlocker({
        code: params.codeExpired,
        message: `${expiredCount} required document${expiredCount === 1 ? "" : "s"} expired.`,
        ownerRole: params.ownerRole,
        actionHint: params.actionHint,
        severity: "BLOCKER",
      })
    );
  }
  const expiringSoonCount = params.dates.filter(
    (date) =>
      Boolean(date) && date!.getTime() >= params.now.getTime() && date!.getTime() <= params.thresholdDate.getTime()
  ).length;
  if (expiringSoonCount > 0) {
    blockers.push(
      createBlocker({
        code: params.codeExpiringSoon,
        message: `${expiringSoonCount} required document${expiringSoonCount === 1 ? "" : "s"} expiring soon.`,
        ownerRole: params.ownerRole,
        actionHint: params.actionHint,
        severity: "WARNING",
      })
    );
  }
  return blockers;
}

export function evaluateComplianceReadiness(input: ComplianceReadinessInput): Readiness {
  const now = input.now ?? new Date();
  const expiringSoonDays = input.expiringSoonDays ?? READINESS_POLICY_DEFAULTS.complianceExpiringSoonDays;
  const thresholdDate = new Date(now.getTime() + expiringSoonDays * 24 * 60 * 60 * 1000);
  const driverDates = (input.driverDocExpirations ?? []).map((value) => toDate(value)).filter((value) => Boolean(value));
  const equipmentDates = (input.equipmentDocExpirations ?? [])
    .map((value) => toDate(value))
    .filter((value) => Boolean(value));
  const blockers: Blocker[] = [];
  blockers.push(
    ...buildComplianceBlockers({
      codeExpired: "DRIVER_DOC_EXPIRED",
      codeExpiringSoon: "DRIVER_DOC_EXPIRING_SOON",
      ownerRole: Role.SAFETY,
      actionHint: "Renew required driver compliance documents.",
      dates: driverDates,
      now,
      thresholdDate,
    })
  );
  blockers.push(
    ...buildComplianceBlockers({
      codeExpired: "EQUIPMENT_DOC_EXPIRED",
      codeExpiringSoon: "EQUIPMENT_DOC_EXPIRING_SOON",
      ownerRole: Role.SAFETY,
      actionHint: "Renew required equipment compliance documents.",
      dates: equipmentDates,
      now,
      thresholdDate,
    })
  );
  return makeReadiness(blockers);
}

export function evaluateLoadReadinessProjection(params: {
  dispatch: DispatchReadinessInput;
  billing: BillingReadinessInput;
  compliance: ComplianceReadinessInput;
}): LoadReadinessProjection {
  const dispatch = evaluateDispatchReadiness(params.dispatch);
  const billing = evaluateBillingReadiness(params.billing);
  const compliance = evaluateComplianceReadiness(params.compliance);
  const overall = makeReadiness([...dispatch.blockers, ...billing.blockers, ...compliance.blockers]);
  return readinessProjectionSchema.parse({ dispatch, billing, compliance, overall });
}

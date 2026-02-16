import "./lib/env";
import crypto from "crypto";
import express from "express";
import type { Response } from "express";
import fs from "fs";
import fsPromises from "fs/promises";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { parse } from "cookie";
import { z } from "zod";
import multer from "multer";
import { addDays, endOfISOWeek, format, getISOWeek, getISOWeekYear, startOfISOWeek } from "date-fns";
import {
  prisma,
  DocStatus,
  DocType,
  DriverDocType,
  DriverStatus,
  LoadStatus,
  LoadType,
  LoadConfirmationStatus,
  LoadChargeType,
  StopType,
  LegType,
  LegStatus,
  ManifestStatus,
  LoadAssignmentRole,
  EventType,
  TaskPriority,
  TaskStatus,
  TaskType,
  InvoiceStatus,
  OperatingEntityType,
  Permission,
  Role,
  Prisma,
  TrailerStatus,
  TrailerType,
  TruckStatus,
  TrackingIntegrationStatus,
  TrackingProviderType,
  TrackingSessionStatus,
  SettlementStatus,
  FuelSummarySource,
  BillingStatus,
  BillingSubmissionChannel,
  BillingSubmissionStatus,
  FinancePaymentMethod,
  PayableLineItemType,
  PayableHoldOwner,
  PayablePartyType,
  PayableRunStatus,
  QboSyncJobStatus,
  AccessorialStatus,
  AccessorialType,
  MfaChallengePurpose,
  UserStatus,
  VaultDocType,
  VaultScopeType,
  LearningDomain,
  TeamEntityType,
  add,
  formatUSD,
  mul,
  toDecimal,
  toDecimalFixed,
} from "@truckerio/db";
import { createSession, setSessionCookie, clearSessionCookie, requireAuth, destroySession } from "./lib/auth";
import { createCsrfToken, setCsrfCookie, requireCsrf } from "./lib/csrf";
import { requireRole } from "./lib/rbac";
import { isEmailConfigured, sendOperationalEmail, sendPasswordResetEmail } from "./lib/email";
import {
  upload,
  saveDocumentFile,
  saveDriverProfilePhoto,
  saveUserProfilePhoto,
  saveLoadConfirmationFile,
  saveVaultDocumentFile,
  ensureUploadDirs,
  getUploadDir,
  resolveUploadPath,
  toRelativeUploadPath,
} from "./lib/uploads";
import { logAudit } from "./lib/audit";
import { createEvent } from "./lib/events";
import { completeTask, calculateStorageCharge, ensureTask, buildTaskKey, getTaskEntity } from "./lib/tasks";
import { logLoadFieldAudit, logStopTimeAudit } from "./lib/load-audit";
import { generateInvoicePdf } from "./lib/invoice";
import { generatePacketZip } from "./lib/packet";
import { hasPermission, requirePermission } from "./lib/permissions";
import { requireOrgEntity } from "./lib/tenant";
import { requireOperationalOrg } from "./lib/onboarding";
import { fetchSamsaraVehicleLocation, fetchSamsaraVehicles, formatSamsaraError, validateSamsaraToken } from "./lib/samsara";
import { assertLoadStatusTransition, formatLoadStatusLabel, mapExternalLoadStatus } from "./lib/load-status";
import { buildAssignmentPlan, validateAssignmentDrivers } from "./lib/load-assignment";
import { evaluateBillingReadiness, evaluateBillingReadinessSnapshot } from "./lib/billing-readiness";
import {
  FINANCE_RECEIVABLE_STAGE,
  FINANCE_POLICY_SELECT,
  listFinanceReceivables,
  mapReceivablesToLegacyReadiness,
} from "./lib/finance-receivables";
import { canRoleOverrideReadiness, financePolicyPayloadSchema, normalizeFinancePolicy } from "./lib/finance-policy";
import {
  enqueueDispatchLoadUpdatedEvent,
  enqueueFinanceStatusUpdatedEvent,
  enqueueQboSyncRequestedEvent,
} from "./lib/finance-outbox";
import {
  enqueueQboInvoiceSyncJob,
  getQuickbooksStatusForOrg,
  isQuickbooksConnectedFromEnv,
  processQueuedQboSyncJobs,
  retryQboSyncJob,
} from "./lib/qbo-sync";
import { computeFinanceSnapshotForLoad, persistFinanceSnapshotForLoad } from "./lib/finance-snapshot";
import { getVaultStatus, DEFAULT_VAULT_EXPIRING_DAYS, VAULT_DOCS_REQUIRING_EXPIRY } from "./lib/vault-status";
import {
  applyTeamFilterOverride,
  ensureDefaultTeamForOrg,
  ensureEntityAssignedToDefaultTeam,
  ensureTeamAssignmentsForEntityType,
  getScopedEntityIds,
  getUserTeamScope,
} from "./lib/team-scope";
import { parseDeleteOrgAllowlist, performOrganizationDelete } from "./lib/org-delete";
import { buildAssignmentSuggestions } from "./modules/assignmentAssist/data";
import { ASSIST_MODEL_VERSION, ASSIST_WEIGHTS_VERSION } from "./modules/assignmentAssist/scoring";
import { parseSuggestionLogPayload } from "./modules/assignmentAssist/validation";
import {
  buildDispatchQueueFilters,
  isCompletedStatus,
  normalizeDispatchQueueView,
} from "./modules/dispatch/queue-view";
import { assignTeamEntities } from "./modules/teams/assign";
import { canAssignTeams } from "./modules/teams/access";
import {
  buildOtpAuthUrl,
  consumeRecoveryCode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyRecoveryCode,
  verifyTotp,
} from "./lib/mfa";
import { getTodayScope } from "./modules/today/scope";
import { isWarningType, WARNING_TYPE_MAP } from "./modules/today/warnings";
import {
  applyLearned,
  buildLearningKeyForAddress,
  buildLearningKeyForCharge,
  buildLearningKeyForHeader,
  buildLearningKeysForCustomer,
  buildLearningKeyForStopName,
  recordExample,
} from "./lib/learning";
import {
  TMS_LOAD_SHEET_HEADERS,
  evaluateTmsRow,
  formatDateForSheet,
  formatTimeForSheet,
  parseCsvText as parseTmsCsvText,
  previewTmsLoadSheet,
  validateTmsHeaders,
} from "./lib/tms-load-sheet";
import { allocateLoadAndTripNumbers, getOrgSequence } from "./lib/sequences";
import { normalizeSetupCode } from "./lib/setup-codes";
import {
  buildPayableChecksum,
  diffPayableLineFingerprints,
  isFinalizeIdempotent,
  payableLineFingerprint,
} from "./lib/payables-engine";
import path from "path";

const app = express();
app.set("etag", false);
app.set("trust proxy", 1);
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const DEV_ERRORS = process.env.NODE_ENV !== "production";
const DEFAULT_TEAM_NAME = "Default";

function sendServerError(res: Response, message: string, error?: unknown) {
  const detail = error instanceof Error ? error.message : error ? String(error) : null;
  if (DEV_ERRORS && detail) {
    return res.status(500).json({ error: message, detail });
  }
  return res.status(500).json({ error: message });
}

const parseTermsDays = (terms?: string | null) => {
  if (!terms) return null;
  const match = terms.match(/(\\d+)/);
  return match ? Number(match[1]) : null;
};

const RESET_TOKEN_TTL_MINUTES = 60;

async function refreshFinanceAfterMutation(params: {
  orgId: string;
  loadId: string;
  source: string;
  trigger: string;
  dedupeSuffix?: string | null;
}) {
  await evaluateBillingReadiness(params.loadId);
  await persistFinanceSnapshotForLoad({
    orgId: params.orgId,
    loadId: params.loadId,
    quickbooksConnected: isQuickbooksConnectedFromEnv(),
  });
  await enqueueDispatchLoadUpdatedEvent(prisma as any, {
    orgId: params.orgId,
    loadId: params.loadId,
    source: params.source,
    trigger: params.trigger,
    dedupeSuffix: params.dedupeSuffix ?? null,
  });
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeReference(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > 64) {
    throw new Error("Reference number must be 64 characters or less");
  }
  return trimmed;
}

function parseOptionalNonNegativeInt(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return num as number;
}

function parseOptionalNumber(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = typeof value === "string" ? value.toString().replace(/[$,]/g, "") : value;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return num;
}

async function maybeAdvanceLoadForPodUpload(params: {
  load: {
    id: string;
    loadNumber: string;
    status: LoadStatus;
    deliveredAt?: Date | null;
  };
  stopType: StopType | null;
  actor: { userId: string; orgId: string; role: Role };
}) {
  if (params.stopType !== StopType.DELIVERY) return;
  let currentStatus = params.load.status;
  if (currentStatus === LoadStatus.IN_TRANSIT) {
    await transitionLoadStatus({
      load: { id: params.load.id, loadNumber: params.load.loadNumber, status: currentStatus },
      nextStatus: LoadStatus.DELIVERED,
      userId: params.actor.userId,
      orgId: params.actor.orgId,
      role: params.actor.role,
      data: { deliveredAt: params.load.deliveredAt ?? new Date() },
      message: `Load ${params.load.loadNumber} delivered`,
    });
    currentStatus = LoadStatus.DELIVERED;
  }
  if (currentStatus === LoadStatus.DELIVERED) {
    await transitionLoadStatus({
      load: { id: params.load.id, loadNumber: params.load.loadNumber, status: currentStatus },
      nextStatus: LoadStatus.POD_RECEIVED,
      userId: params.actor.userId,
      orgId: params.actor.orgId,
      role: params.actor.role,
      message: `POD received for ${params.load.loadNumber}`,
    });
  }
}

const FACTORING_PACKET_LINK_SECRET =
  process.env.FACTORING_PACKET_LINK_SECRET || process.env.API_JWT_SECRET || process.env.NEXTAUTH_SECRET || "";
const FACTORING_PACKET_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function buildFactoringPacketToken(payload: { orgId: string; packetPath: string; exp: number }) {
  if (!FACTORING_PACKET_LINK_SECRET) return null;
  const body = toBase64Url(JSON.stringify(payload));
  const sig = toBase64Url(crypto.createHmac("sha256", FACTORING_PACKET_LINK_SECRET).update(body).digest());
  return `${body}.${sig}`;
}

function parseFactoringPacketToken(token: string) {
  if (!FACTORING_PACKET_LINK_SECRET) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expectedSig = toBase64Url(crypto.createHmac("sha256", FACTORING_PACKET_LINK_SECRET).update(body).digest());
  if (sig !== expectedSig) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(body)) as { orgId?: string; packetPath?: string; exp?: number };
    if (!parsed.orgId || !parsed.packetPath || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed as { orgId: string; packetPath: string; exp: number };
  } catch {
    return null;
  }
}

function buildFactoringPacketLink(orgId: string, packetPath: string) {
  const token = buildFactoringPacketToken({
    orgId,
    packetPath,
    exp: Math.floor(Date.now() / 1000) + FACTORING_PACKET_LINK_TTL_SECONDS,
  });
  if (!token) {
    return `/files/packets/${path.basename(packetPath)}`;
  }
  const apiOrigin = process.env.API_PUBLIC_ORIGIN || `http://localhost:${process.env.PORT || "4000"}`;
  return `${apiOrigin.replace(/\/+$/, "")}/public/files/packets/${encodeURIComponent(path.basename(packetPath))}?token=${encodeURIComponent(token)}`;
}

function mapLoadTypeForInput(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return LoadType.COMPANY;
  const key = trimmed.toUpperCase().replace(/[^A-Z]/g, "");
  if (key === "BROKERED") return LoadType.BROKERED;
  if (key === "COMPANY") return LoadType.COMPANY;
  if (["VAN", "DRYVAN", "DRY"].includes(key)) return LoadType.VAN;
  if (["REEFER", "REFRIGERATED"].includes(key)) return LoadType.REEFER;
  if (["FLATBED", "FLAT"].includes(key)) return LoadType.FLATBED;
  if (["OTHER", "UNKNOWN"].includes(key)) return LoadType.OTHER;
  return LoadType.COMPANY;
}

function normalizeStopLocation(stop?: { city?: string | null; state?: string | null; zip?: string | null }) {
  const city = stop?.city?.trim() ?? "";
  const state = stop?.state?.trim() ?? "";
  const zip = stop?.zip?.trim() ?? "";
  if (!city || !state) return null;
  return { city, state, zip: zip || null };
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

async function fetchMatchingMiles(params: {
  orgId: string;
  pickup: { city: string; state: string; zip: string | null };
  delivery: { city: string; state: string; zip: string | null };
  includeZip: boolean;
}) {
  const pickupFilter: any = {
    type: StopType.PICKUP,
    city: { equals: params.pickup.city, mode: "insensitive" },
    state: { equals: params.pickup.state, mode: "insensitive" },
  };
  const deliveryFilter: any = {
    type: StopType.DELIVERY,
    city: { equals: params.delivery.city, mode: "insensitive" },
    state: { equals: params.delivery.state, mode: "insensitive" },
  };
  if (params.includeZip && params.pickup.zip) {
    pickupFilter.zip = { equals: params.pickup.zip, mode: "insensitive" };
  }
  if (params.includeZip && params.delivery.zip) {
    deliveryFilter.zip = { equals: params.delivery.zip, mode: "insensitive" };
  }
  const rows = await prisma.load.findMany({
    where: {
      orgId: params.orgId,
      deletedAt: null,
      miles: { not: null },
      AND: [{ stops: { some: pickupFilter } }, { stops: { some: deliveryFilter } }],
    },
    select: { miles: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((row) => row.miles).filter((value): value is number => typeof value === "number");
}

async function suggestMilesForRoute(params: {
  orgId: string;
  pickup?: { city?: string | null; state?: string | null; zip?: string | null };
  delivery?: { city?: string | null; state?: string | null; zip?: string | null };
}) {
  const pickup = normalizeStopLocation(params.pickup);
  const delivery = normalizeStopLocation(params.delivery);
  if (!pickup || !delivery) return null;
  const includeZip = Boolean(pickup.zip && delivery.zip);
  const primary = await fetchMatchingMiles({ orgId: params.orgId, pickup, delivery, includeZip });
  const fallback = primary.length > 0 || !includeZip
    ? primary
    : await fetchMatchingMiles({ orgId: params.orgId, pickup, delivery, includeZip: false });
  if (fallback.length === 0) return null;
  const value = median(fallback);
  if (!value || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

function normalizeVin(value?: string | null) {
  const trimmed = value?.trim().toUpperCase() ?? "";
  if (!trimmed) return null;
  if (!VIN_PATTERN.test(trimmed)) {
    throw new Error("VIN must be 17 characters (A-H, J-N, P, R-Z, 0-9)");
  }
  return trimmed;
}

function normalizePlateState(value?: string | null) {
  const trimmed = value?.trim().toUpperCase() ?? "";
  if (!trimmed) return null;
  if (!/^[A-Z]{2}$/.test(trimmed)) {
    throw new Error("Plate state must be a 2-letter code");
  }
  return trimmed;
}

type LoadStatusRecord = { id: string; loadNumber: string; status: LoadStatus; completedAt?: Date | null };

const resolveCompletedAtUpdate = (params: { current: LoadStatus; next: LoadStatus; existing?: Date | null }) => {
  if (params.current === params.next) return undefined;
  const currentCompleted = isCompletedStatus(params.current);
  const nextCompleted = isCompletedStatus(params.next);
  if (nextCompleted && !currentCompleted) {
    return params.existing ?? new Date();
  }
  if (currentCompleted && !nextCompleted) {
    return null;
  }
  return undefined;
};

async function transitionLoadStatus(params: {
  load: LoadStatusRecord;
  nextStatus: LoadStatus;
  userId: string;
  orgId: string;
  role: Role;
  overrideReason?: string | null;
  data?: Prisma.LoadUpdateInput;
  message?: string;
}) {
  if (params.load.status === params.nextStatus) {
    return params.load;
  }
  const { overridden } = assertLoadStatusTransition({
    current: params.load.status,
    next: params.nextStatus,
    isAdmin: params.role === "ADMIN",
    overrideReason: params.overrideReason,
  });
  const completedAt = resolveCompletedAtUpdate({
    current: params.load.status,
    next: params.nextStatus,
    existing: params.load.completedAt ?? null,
  });
  const updated = await prisma.load.update({
    where: { id: params.load.id },
    data: {
      status: params.nextStatus,
      ...(params.data ?? {}),
      completedAt: completedAt !== undefined ? completedAt : undefined,
    },
  });
  await createEvent({
    orgId: params.orgId,
    loadId: params.load.id,
    userId: params.userId,
    type: EventType.LOAD_STATUS_UPDATED,
    message:
      params.message ??
      `Load ${params.load.loadNumber} status ${params.load.status} -> ${params.nextStatus}`,
    meta: {
      from: params.load.status,
      to: params.nextStatus,
      overrideReason: params.overrideReason ?? null,
      overridden,
    },
  });
  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "LOAD_STATUS",
    entity: "Load",
    entityId: params.load.id,
    summary: `Load ${params.load.loadNumber} status ${params.load.status} -> ${params.nextStatus}`,
    meta: { overrideReason: params.overrideReason ?? null, overridden },
    before: { status: params.load.status },
    after: { status: params.nextStatus },
  });
  await refreshFinanceAfterMutation({
    orgId: params.orgId,
    loadId: params.load.id,
    source: "dispatch.load-status-transition",
    trigger: params.nextStatus,
    dedupeSuffix: `${params.load.status}->${params.nextStatus}`,
  });
  return updated;
}

async function applyLoadAssignment(params: {
  load: {
    id: string;
    loadNumber: string;
    status: LoadStatus;
    assignedDriverId: string | null;
    truckId: string | null;
    trailerId: string | null;
    assignedDriverAt: Date | null;
    assignedTruckAt: Date | null;
    assignedTrailerAt: Date | null;
  };
  driverId: string;
  truckId?: string | null;
  trailerId?: string | null;
  orgId: string;
  userId: string;
  role: Role;
  overrideReason?: string | null;
}) {
  const now = new Date();
  const assignedDriverAt =
    params.driverId !== params.load.assignedDriverId ? now : params.load.assignedDriverAt ?? null;
  const assignedTruckAt =
    params.truckId !== params.load.truckId ? (params.truckId ? now : null) : params.load.assignedTruckAt ?? null;
  const assignedTrailerAt =
    params.trailerId !== params.load.trailerId ? (params.trailerId ? now : null) : params.load.assignedTrailerAt ?? null;
  const assignmentData = {
    assignedDriverId: params.driverId,
    truckId: params.truckId ?? null,
    trailerId: params.trailerId ?? null,
    assignedDriverAt,
    assignedTruckAt,
    assignedTrailerAt,
  };

  let updatedLoad: typeof params.load;
  if (params.load.status !== LoadStatus.ASSIGNED) {
    updatedLoad = (await transitionLoadStatus({
      load: { id: params.load.id, loadNumber: params.load.loadNumber, status: params.load.status },
      nextStatus: LoadStatus.ASSIGNED,
      userId: params.userId,
      orgId: params.orgId,
      role: params.role,
      overrideReason: params.overrideReason,
      data: assignmentData,
      message: `Load ${params.load.loadNumber} assigned`,
    })) as typeof params.load;
  } else {
    updatedLoad = (await prisma.load.update({
      where: { id: params.load.id },
      data: assignmentData,
    })) as typeof params.load;
  }

  const resetStatusIfIdle = async (asset: "driver" | "truck" | "trailer", id: string | null) => {
    if (!id) return;
    const where: Prisma.LoadWhereInput = {
      orgId: params.orgId,
      deletedAt: null,
      id: { not: params.load.id },
      status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
    };
    if (asset === "driver") where.assignedDriverId = id;
    if (asset === "truck") where.truckId = id;
    if (asset === "trailer") where.trailerId = id;
    const other = await prisma.load.findFirst({ where, select: { id: true } });
    if (other) return;
    if (asset === "driver") {
      await prisma.driver.update({ where: { id }, data: { status: DriverStatus.AVAILABLE } });
    } else if (asset === "truck") {
      await prisma.truck.update({ where: { id }, data: { status: TruckStatus.AVAILABLE } });
    } else {
      await prisma.trailer.update({ where: { id }, data: { status: TrailerStatus.AVAILABLE } });
    }
  };

  if (params.load.assignedDriverId && params.load.assignedDriverId !== params.driverId) {
    await resetStatusIfIdle("driver", params.load.assignedDriverId);
  }
  if (params.load.truckId && params.load.truckId !== (params.truckId ?? null)) {
    await resetStatusIfIdle("truck", params.load.truckId);
  }
  if (params.load.trailerId && params.load.trailerId !== (params.trailerId ?? null)) {
    await resetStatusIfIdle("trailer", params.load.trailerId);
  }

  await Promise.all([
    prisma.driver.update({ where: { id: params.driverId }, data: { status: DriverStatus.ON_LOAD } }),
    params.truckId ? prisma.truck.update({ where: { id: params.truckId }, data: { status: TruckStatus.ASSIGNED } }) : Promise.resolve(null),
    params.trailerId
      ? prisma.trailer.update({ where: { id: params.trailerId }, data: { status: TrailerStatus.ASSIGNED } })
      : Promise.resolve(null),
  ]);

  await createEvent({
    orgId: params.orgId,
    loadId: params.load.id,
    userId: params.userId,
    type: EventType.LOAD_ASSIGNED,
    message: `Load ${params.load.loadNumber} assigned`,
  });
  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "LOAD_ASSIGNED",
    entity: "Load",
    entityId: params.load.id,
    summary: `Assigned load ${params.load.loadNumber}`,
    meta: { overrideReason: params.overrideReason ?? null },
    before: {
      assignedDriverId: params.load.assignedDriverId,
      truckId: params.load.truckId,
      trailerId: params.load.trailerId,
    },
    after: {
      assignedDriverId: updatedLoad.assignedDriverId,
      truckId: updatedLoad.truckId,
      trailerId: updatedLoad.trailerId,
    },
  });

  return updatedLoad;
}

const ONBOARDING_STEPS = [
  "basics",
  "operating",
  "team",
  "drivers",
  "fleet",
  "preferences",
  "tracking",
  "finance",
] as const;

const ONBOARDING_STATUS = {
  NOT_ACTIVATED: "NOT_ACTIVATED",
  OPERATIONAL: "OPERATIONAL",
} as const;

function normalizeOnboardingSteps(values: string[]) {
  const allowed = new Set(ONBOARDING_STEPS);
  return Array.from(new Set(values.filter((value) => allowed.has(value as (typeof ONBOARDING_STEPS)[number]))));
}

function calculateOnboardingPercent(completed: string[]) {
  if (ONBOARDING_STEPS.length === 0) return 0;
  return Math.round((completed.length / ONBOARDING_STEPS.length) * 100);
}

async function upsertOnboardingState(params: {
  orgId: string;
  completedSteps?: string[];
  currentStep?: number;
}) {
  const [existing, settings, operatingCount, employeeCount, driverCount, truckCount, trailerCount] =
    await Promise.all([
      prisma.onboardingState.findFirst({ where: { orgId: params.orgId } }),
      prisma.orgSettings.findFirst({
        where: { orgId: params.orgId },
        select: {
          id: true,
          timezone: true,
          requiredDocs: true,
          trackingPreference: true,
          settlementSchedule: true,
        },
      }),
      prisma.operatingEntity.count({ where: { orgId: params.orgId } }),
      prisma.user.count({ where: { orgId: params.orgId, role: { in: [Role.ADMIN, Role.DISPATCHER, Role.BILLING] } } }),
      prisma.driver.count({ where: { orgId: params.orgId } }),
      prisma.truck.count({ where: { orgId: params.orgId } }),
      prisma.trailer.count({ where: { orgId: params.orgId } }),
    ]);

  const inferredSteps: string[] = [];
  if (settings?.id) inferredSteps.push("basics");
  if (operatingCount > 0) inferredSteps.push("operating");
  if (employeeCount > 1) inferredSteps.push("team");
  if (driverCount > 0) inferredSteps.push("drivers");
  if (truckCount > 0 || trailerCount > 0) inferredSteps.push("fleet");

  const existingSteps = Array.isArray(existing?.completedSteps) ? (existing.completedSteps as string[]) : [];
  const mergedSteps = [
    ...existingSteps,
    ...(params.completedSteps ?? []),
    ...inferredSteps,
  ];
  const completedSteps = normalizeOnboardingSteps(mergedSteps);
  const percentComplete = calculateOnboardingPercent(completedSteps);
  const computedStep = Math.min(ONBOARDING_STEPS.length, Math.max(1, completedSteps.length + 1));
  const currentStep = params.currentStep ?? existing?.currentStep ?? computedStep;
  const completedAt =
    completedSteps.length === ONBOARDING_STEPS.length
      ? existing?.completedAt ?? new Date()
      : null;
  const status = existing?.status ?? ONBOARDING_STATUS.NOT_ACTIVATED;
  return prisma.onboardingState.upsert({
    where: { orgId: params.orgId },
    create: {
      orgId: params.orgId,
      status: ONBOARDING_STATUS.NOT_ACTIVATED,
      completedSteps,
      percentComplete,
      currentStep,
      completedAt,
    },
    update: {
      status,
      completedSteps,
      percentComplete,
      currentStep,
      completedAt,
    },
  });
}

async function getDbInfo() {
  const [dbRow] = await prisma.$queryRaw<{ current_database: string }[]>`
    SELECT current_database() AS current_database
  `;
  const [userRow] = await prisma.$queryRaw<{ current_user: string }[]>`
    SELECT current_user AS current_user
  `;
  let serverVersion: string | null = null;
  try {
    const [versionRow] = await prisma.$queryRaw<{ server_version: string }[]>`
      SHOW server_version
    `;
    serverVersion = versionRow?.server_version ?? null;
  } catch {
    serverVersion = null;
  }

  const [loadCount, confirmationCount, operatingEntityCount, org] = await Promise.all([
    prisma.load.count(),
    prisma.loadConfirmationDocument.count(),
    prisma.operatingEntity.count(),
    prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);

  return {
    database: dbRow?.current_database ?? null,
    user: userRow?.current_user ?? null,
    serverVersion,
    counts: {
      load: loadCount,
      loadConfirmationDocument: confirmationCount,
      operatingEntity: operatingEntityCount,
    },
    org: org ? { id: org.id, name: org.name } : null,
  };
}

async function ensureDefaultOperatingEntity(orgId: string) {
  const existing = await prisma.operatingEntity.findFirst({
    where: { orgId, isDefault: true },
  });
  if (existing) return existing;
  const org = await prisma.organization.findFirst({
    where: { id: orgId },
    include: { settings: true },
  });
  const name = org?.settings?.companyDisplayName ?? org?.name ?? "Operating Entity";
  return prisma.operatingEntity.create({
    data: {
      orgId,
      name,
      type: OperatingEntityType.CARRIER,
      addressLine1: org?.settings?.remitToAddress ?? null,
      remitToName: name,
      remitToAddressLine1: org?.settings?.remitToAddress ?? null,
      isDefault: true,
    },
  });
}

async function setDefaultOperatingEntity(orgId: string, entityId: string) {
  return prisma.$transaction(async (tx) => {
    const entity = await tx.operatingEntity.findFirst({
      where: { id: entityId, orgId },
    });
    if (!entity) return null;
    await tx.operatingEntity.updateMany({
      where: { orgId },
      data: { isDefault: false },
    });
    return tx.operatingEntity.update({
      where: { id: entity.id },
      data: { isDefault: true },
    });
  });
}

function extractSamsaraToken(config: Prisma.JsonValue | null) {
  if (!config || typeof config !== "object") return null;
  const token = (config as { apiToken?: unknown }).apiToken;
  return typeof token === "string" && token.trim().length > 0 ? token : null;
}

function sendSamsaraError(res: Response, error: unknown) {
  const info = formatSamsaraError(error);
  const status =
    info.code === "UNAUTHORIZED"
      ? 400
      : info.code === "RATE_LIMITED"
        ? 429
        : info.code === "NETWORK_ERROR"
          ? 503
          : 502;
  res.status(status).json({
    error: info.message,
    code: `SAMSARA_${info.code}`,
    retryAfter: info.retryAfter ?? null,
  });
}

type DraftStop = {
  type: "PICKUP" | "DELIVERY";
  name: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  apptStart?: string | null;
  apptEnd?: string | null;
  notes?: string | null;
};

type DraftLoad = {
  loadNumber: string | null;
  status: string | null;
  loadType: string | null;
  customerName: string | null;
  customerRef: string | null;
  externalTripId: string | null;
  truckUnit: string | null;
  trailerUnit: string | null;
  rate: number | null;
  salesRepName: string | null;
  dropName: string | null;
  desiredInvoiceDate: string | null;
  shipperReferenceNumber: string | null;
  consigneeReferenceNumber: string | null;
  palletCount: number | null;
  weightLbs: number | null;
  miles: number | null;
  stops: DraftStop[];
};

function normalizeDraftText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeDraftStop(stop: any): DraftStop {
  return {
    type: stop?.type === "DELIVERY" ? "DELIVERY" : "PICKUP",
    name: normalizeDraftText(stop?.name),
    address1: normalizeDraftText(stop?.address1),
    city: normalizeDraftText(stop?.city),
    state: normalizeDraftText(stop?.state),
    zip: normalizeDraftText(stop?.zip),
    apptStart: normalizeDraftText(stop?.apptStart) || null,
    apptEnd: normalizeDraftText(stop?.apptEnd) || null,
    notes: normalizeDraftText(stop?.notes) || null,
  };
}

function normalizeLoadDraft(raw: any): DraftLoad {
  const stops = Array.isArray(raw?.stops) ? raw.stops.map(normalizeDraftStop) : [];
  return {
    loadNumber: normalizeDraftText(raw?.loadNumber) || null,
    status: normalizeDraftText(raw?.status) || null,
    loadType: normalizeDraftText(raw?.loadType ?? raw?.type) || null,
    customerName: normalizeDraftText(raw?.customerName ?? raw?.customer) || null,
    customerRef: normalizeDraftText(raw?.customerRef ?? raw?.custRef) || null,
    externalTripId: normalizeDraftText(raw?.externalTripId ?? raw?.trip) || null,
    truckUnit: normalizeDraftText(raw?.truckUnit ?? raw?.unit) || null,
    trailerUnit: normalizeDraftText(raw?.trailerUnit ?? raw?.trailer) || null,
    rate: parseOptionalNumber(raw?.rate ?? raw?.totalRev, "Total Rev"),
    salesRepName: normalizeDraftText(raw?.salesRepName ?? raw?.sales) || null,
    dropName: normalizeDraftText(raw?.dropName ?? raw?.drop) || null,
    desiredInvoiceDate: normalizeDraftText(raw?.desiredInvoiceDate ?? raw?.invDate) || null,
    shipperReferenceNumber: normalizeReference(raw?.shipperReferenceNumber ?? null),
    consigneeReferenceNumber: normalizeReference(raw?.consigneeReferenceNumber ?? null),
    palletCount: parseOptionalNonNegativeInt(raw?.palletCount, "Pallet count"),
    weightLbs: parseOptionalNonNegativeInt(raw?.weightLbs, "Weight (lbs)"),
    miles: parseOptionalNonNegativeInt(raw?.miles, "Miles"),
    stops,
  };
}

function isDraftReady(draft: DraftLoad) {
  if (!draft.customerName || draft.customerName.length < 2) return false;
  if (!draft.stops || draft.stops.length < 2) return false;
  const hasPickupDate = draft.stops.some((stop) => stop.type === "PICKUP" && stop.apptStart);
  const hasDeliveryDate = draft.stops.some((stop) => stop.type === "DELIVERY" && stop.apptStart);
  if (!hasPickupDate || !hasDeliveryDate) return false;
  return draft.stops.every(
    (stop) =>
      stop.name.length > 0 &&
      stop.city.length > 0 &&
      stop.state.length > 0
  );
}

const LOAD_CONFIRMATION_LEARNING_LIMIT = Number(process.env.LOAD_CONFIRMATION_LEARNING_LIMIT || "500");
const LOAD_CONFIRMATION_LEARNING_MAX_BYTES = Number(process.env.LOAD_CONFIRMATION_LEARNING_MAX_BYTES || String(50 * 1024 * 1024));

function safeByteLength(value: unknown) {
  if (!value) return 0;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

async function pruneLearningExamples(orgId: string) {
  const stats = await prisma.loadConfirmationLearningExample.aggregate({
    where: { orgId },
    _count: { _all: true },
    _sum: { sizeBytes: true },
  });
  let remainingCount = stats._count._all ?? 0;
  let remainingBytes = stats._sum.sizeBytes ?? 0;
  if (remainingCount <= LOAD_CONFIRMATION_LEARNING_LIMIT && remainingBytes <= LOAD_CONFIRMATION_LEARNING_MAX_BYTES) {
    return;
  }
  const candidates = await prisma.loadConfirmationLearningExample.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
    select: { id: true, sizeBytes: true },
    take: Math.max(remainingCount - LOAD_CONFIRMATION_LEARNING_LIMIT, 0) + 50,
  });
  const idsToDelete: string[] = [];
  for (const row of candidates) {
    if (remainingCount <= LOAD_CONFIRMATION_LEARNING_LIMIT && remainingBytes <= LOAD_CONFIRMATION_LEARNING_MAX_BYTES) {
      break;
    }
    idsToDelete.push(row.id);
    remainingCount -= 1;
    remainingBytes -= row.sizeBytes ?? 0;
  }
  if (idsToDelete.length > 0) {
    await prisma.loadConfirmationLearningExample.deleteMany({ where: { id: { in: idsToDelete }, orgId } });
  }
}

async function recordLearningExample(params: {
  orgId: string;
  userId: string;
  doc: {
    id: string;
    sha256?: string | null;
    extractedText?: string | null;
    extractedDraft?: DraftLoad | null;
    normalizedDraft?: DraftLoad | null;
    extractedJson?: Prisma.JsonValue | null;
  };
}) {
  const extractedText = params.doc.extractedText ?? null;
  const correctedDraft = params.doc.normalizedDraft;
  if (!extractedText || !correctedDraft || !isDraftReady(correctedDraft)) {
    return;
  }
  const extractedDraft = params.doc.extractedDraft ?? null;
  const extractedJson =
    params.doc.extractedJson && typeof params.doc.extractedJson === "object" && !Array.isArray(params.doc.extractedJson)
      ? (params.doc.extractedJson as Record<string, unknown>)
      : {};
  const brokerName = typeof extractedJson.brokerName === "string" ? extractedJson.brokerName : null;
  const sizeBytes =
    safeByteLength(extractedText) +
    safeByteLength(extractedDraft ?? {}) +
    safeByteLength(correctedDraft ?? {});

  await prisma.loadConfirmationLearningExample.create({
    data: {
      orgId: params.orgId,
      docId: params.doc.id,
      docFingerprint: params.doc.sha256 ?? null,
      brokerName,
      extractedText,
      extractedDraft: extractedDraft ?? undefined,
      correctedDraft,
      sizeBytes,
    },
  });

  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "LOAD_CONFIRMATION_LEARNING_SAVED",
    entity: "LoadConfirmationDocument",
    entityId: params.doc.id,
    summary: "Saved load confirmation learning example",
    meta: { brokerName },
  });

  await pruneLearningExamples(params.orgId);
}

app.use(helmet());
const explicitOrigins = Array.from(
  new Set(
    [process.env.WEB_ORIGIN, ...(process.env.CORS_ORIGINS || "").split(",")]
      .map((value) => value?.trim())
      .filter(Boolean),
  ),
);
const allowedOrigins = explicitOrigins;
const IS_PROD = process.env.NODE_ENV === "production";
const WEB_ORIGIN = process.env.WEB_ORIGIN?.trim() || "";
const DEFAULT_COOKIE_SECURE = WEB_ORIGIN ? WEB_ORIGIN.startsWith("https://") : IS_PROD;
const COOKIE_SECURE =
  typeof process.env.COOKIE_SECURE === "string" ? process.env.COOKIE_SECURE.toLowerCase() === "true" : DEFAULT_COOKIE_SECURE;

const parseHostname = (value?: string) => {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
};

const parseHostHeader = (value?: string | null) => {
  if (!value) return null;
  return value.split(",")[0]?.trim().split(":")[0] ?? null;
};

const isLocalhostHost = (hostname: string | null) => hostname === "localhost" || hostname === "127.0.0.1";

const isAllowedOrigin = (origin: string | undefined, hostHeader: string | undefined) => {
  if (!origin) return true;
  if (explicitOrigins.includes(origin)) return true;
  if (IS_PROD) return false;
  const originHost = parseHostname(origin);
  if (!originHost) return false;
  if (isLocalhostHost(originHost)) return true;
  const requestHost = parseHostHeader(hostHeader);
  return Boolean(requestHost && originHost === requestHost);
};

app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  const allowed = isAllowedOrigin(origin, req.headers.host);
  cors({
    origin: allowed ? origin || true : false,
    credentials: true,
  })(req, res, next);
});
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  req.cookies = parse(req.headers.cookie || "");
  next();
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "haulio-api", health: "/health" });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const setupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

app.get("/setup/status", async (_req, res) => {
  const org = await prisma.organization.findFirst({ select: { id: true } });
  res.json({ hasOrg: Boolean(org) });
});

app.post("/setup/validate", setupLimiter, async (req, res) => {
  const schema = z.object({ code: z.string().min(4) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const normalized = normalizeSetupCode(parsed.data.code);
  if (!normalized) {
    res.json({ valid: false });
    return;
  }
  const setup = await prisma.setupCode.findFirst({
    where: { code: normalized, consumedAt: null },
    select: { id: true },
  });
  if (!setup) {
    res.json({ valid: false });
    return;
  }
  res.cookie("setup_code", normalized, {
    httpOnly: true,
    sameSite: "lax",
    // Prod-local runs NODE_ENV=production over http://localhost; Secure cookies would be dropped.
    secure: COOKIE_SECURE,
    maxAge: 15 * 60 * 1000,
  });
  res.json({ valid: true });
});

app.post("/setup/consume-and-create-org", setupLimiter, async (req, res) => {
  const schema = z.object({
    code: z.string().optional(),
    companyName: z.string().min(2),
    admin: z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
    }),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }
  const existingOrg = await prisma.organization.findFirst({ select: { id: true } });
  if (existingOrg) {
    res.status(400).json({ error: "Setup already completed." });
    return;
  }
  const cookieCode = req.cookies?.setup_code;
  const code = normalizeSetupCode(parsed.data.code ?? cookieCode ?? "");
  if (!code) {
    res.status(400).json({ error: "Setup code is required." });
    return;
  }

  const ipAddress =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;

  try {
    const { org, user } = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "SetupCode" WHERE "code" = ${code} AND "consumedAt" IS NULL FOR UPDATE
      `;
      const setup = rows[0];
      if (!setup) {
        throw new Error("INVALID_SETUP_CODE");
      }

      const org = await tx.organization.create({
        data: { name: parsed.data.companyName },
      });
      const passwordHash = await bcrypt.hash(parsed.data.admin.password, 10);
      const user = await tx.user.create({
        data: {
          orgId: org.id,
          email: normalizeEmail(parsed.data.admin.email),
          name: parsed.data.admin.name,
          role: "ADMIN",
          passwordHash,
          canSeeAllTeams: true,
        },
      });
      await tx.setupCode.update({
        where: { id: setup.id },
        data: { orgId: org.id, consumedAt: new Date() },
      });
      return { org, user };
    });

    const session = await createSession({ userId: user.id, ipAddress, userAgent: userAgent ? String(userAgent) : null });
    setSessionCookie(res, session.token, session.expiresAt);
    const csrfToken = createCsrfToken();
    setCsrfCookie(res, csrfToken);
    res.clearCookie("setup_code");
    res.json({
      org: { id: org.id, name: org.name },
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
      csrfToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("INVALID_SETUP_CODE")) {
      res.status(400).json({ error: "Invalid or already used setup code." });
      return;
    }
    if (message.toLowerCase().includes("unique")) {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    sendServerError(res, "Failed to create organization.", error);
  }
});

const parseBooleanParam = (value: string | undefined) => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return undefined;
};

const parseDateParam = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const parseNumberParam = (value: string) => {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
};

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function resolveOrgTimeZone(orgId: string) {
  const settings = await prisma.orgSettings.findFirst({
    where: { orgId },
    select: { timezone: true },
  });
  const candidate = settings?.timezone?.trim();
  if (candidate && isValidTimeZone(candidate)) {
    return { timeZone: candidate, warning: null as string | null };
  }
  if (candidate && !isValidTimeZone(candidate)) {
    return {
      timeZone: "UTC",
      warning: `Org timezone "${candidate}" is invalid. Using UTC.`,
    };
  }
  return { timeZone: "UTC", warning: null as string | null };
}

const formatDriverStatusLabel = (status: DriverStatus) => {
  switch (status) {
    case DriverStatus.AVAILABLE:
      return "Available";
    case DriverStatus.ON_LOAD:
      return "On Load";
    case DriverStatus.UNAVAILABLE:
      return "Unavailable";
    default:
      return status;
  }
};

const formatRoleLabel = (role: Role) => {
  switch (role) {
    case Role.ADMIN:
      return "Admin";
    case Role.HEAD_DISPATCHER:
      return "Head Dispatcher";
    case Role.DISPATCHER:
      return "Dispatcher";
    case Role.BILLING:
      return "Billing";
    case Role.DRIVER:
      return "Driver";
    default:
      return role;
  }
};

const buildLoadFilters = (
  req: express.Request,
  overrides: { from?: Date; to?: Date; archived?: boolean } = {}
) => {
  const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
  const status = statusParam && Object.values(LoadStatus).includes(statusParam as LoadStatus)
    ? (statusParam as LoadStatus)
    : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const customer = typeof req.query.customer === "string" ? req.query.customer.trim() : "";
  const assigned = typeof req.query.assigned === "string" ? req.query.assigned.trim() : "";
  const driverId = typeof req.query.driverId === "string" ? req.query.driverId.trim() : "";
  const truckId = typeof req.query.truckId === "string" ? req.query.truckId.trim() : "";
  const trailerId = typeof req.query.trailerId === "string" ? req.query.trailerId.trim() : "";
  const operatingEntityId = typeof req.query.operatingEntityId === "string" ? req.query.operatingEntityId.trim() : "";
  const destCity = typeof req.query.destCity === "string" ? req.query.destCity.trim() : "";
  const destState = typeof req.query.destState === "string" ? req.query.destState.trim() : "";
  const destSearch = typeof req.query.destSearch === "string" ? req.query.destSearch.trim() : "";
  const minRate = typeof req.query.minRate === "string" ? req.query.minRate.trim() : "";
  const maxRate = typeof req.query.maxRate === "string" ? req.query.maxRate.trim() : "";
  const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate.trim() : "";
  const toDate = typeof req.query.toDate === "string" ? req.query.toDate.trim() : "";
  const from = overrides.from ?? parseDateParam(fromDate);
  const to = overrides.to ?? parseDateParam(toDate);
  const minRateValue = parseNumberParam(minRate);
  const maxRateValue = parseNumberParam(maxRate);

  const orFilters: any[] = [];
  const where: any = {
    orgId: req.user!.orgId,
    deletedAt: null,
    status: status ? status : undefined,
    truckId: truckId || undefined,
    trailerId: trailerId || undefined,
    createdAt: {
      gte: from,
      lte: to,
    },
  };

  if (!status && overrides.archived !== undefined) {
    where.status = overrides.archived
      ? { in: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] }
      : { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] };
  }

  if (driverId) {
    where.assignedDriverId = driverId;
  } else if (assigned === "true") {
    where.assignedDriverId = { not: null };
  } else if (assigned === "false") {
    where.assignedDriverId = null;
  }
  if (operatingEntityId) {
    where.operatingEntityId = operatingEntityId;
  }
  if (customer) {
    orFilters.push(
      { customerName: { contains: customer, mode: "insensitive" } },
      { customer: { name: { contains: customer, mode: "insensitive" } } }
    );
  }
  if (search) {
    orFilters.push(
      { loadNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
      { customerRef: { contains: search, mode: "insensitive" } },
      { bolNumber: { contains: search, mode: "insensitive" } },
      { shipperReferenceNumber: { contains: search, mode: "insensitive" } },
      { consigneeReferenceNumber: { contains: search, mode: "insensitive" } },
      { driver: { name: { contains: search, mode: "insensitive" } } },
      {
        stops: {
          some: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { address: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
              { state: { contains: search, mode: "insensitive" } },
              { zip: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      }
    );
  }
  if (orFilters.length > 0) {
    where.OR = orFilters;
  }
  if (minRateValue !== undefined || maxRateValue !== undefined) {
    where.rate = {
      gte: minRateValue,
      lte: maxRateValue,
    };
  }
  if (destCity || destState || destSearch) {
    const stopFilter: any = { type: StopType.DELIVERY };
    if (destCity) {
      stopFilter.city = { contains: destCity, mode: "insensitive" };
    }
    if (destState) {
      stopFilter.state = { contains: destState, mode: "insensitive" };
    }
    if (destSearch) {
      stopFilter.OR = [
        { name: { contains: destSearch, mode: "insensitive" } },
        { address: { contains: destSearch, mode: "insensitive" } },
        { city: { contains: destSearch, mode: "insensitive" } },
        { state: { contains: destSearch, mode: "insensitive" } },
        { zip: { contains: destSearch, mode: "insensitive" } },
      ];
    }
    where.stops = { some: stopFilter };
  }

  return { where };
};

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

const mfaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

app.post("/auth/login", loginLimiter, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const users = await prisma.user.findMany({ where: { email } });
  if (users.length !== 1) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const user = users[0];
  if (!user.isActive || user.status !== UserStatus.ACTIVE || !user.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const enforceMfa =
    user.mfaEnforced || (((process.env.MFA_ENFORCE_ADMIN || "").toLowerCase() === "true") && user.role === "ADMIN");
  if (user.mfaEnabled) {
    const tempToken = await createMfaChallenge(user.id, MfaChallengePurpose.LOGIN);
    res.json({ mfaRequired: true, tempToken });
    return;
  }
  if (enforceMfa) {
    const tempToken = await createMfaChallenge(user.id, MfaChallengePurpose.SETUP);
    res.json({ mfaSetupRequired: true, tempToken });
    return;
  }
  const ipAddress =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;
  const session = await createSession({ userId: user.id, ipAddress, userAgent: userAgent ? String(userAgent) : null });
  setSessionCookie(res, session.token, session.expiresAt);
  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);
  await prisma.user.updateMany({
    where: { id: user.id, orgId: user.orgId },
    data: { lastLoginAt: new Date() },
  });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      permissions: user.permissions,
    },
    csrfToken,
  });
});

app.post("/auth/login/mfa", mfaLimiter, async (req, res) => {
  const schema = z.object({
    tempToken: z.string().min(20),
    code: z.string().optional(),
    recoveryCode: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.code && !parsed.data.recoveryCode)) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const challenge = await getMfaChallenge(parsed.data.tempToken, MfaChallengePurpose.LOGIN);
  if (!challenge) {
    res.status(401).json({ error: "Invalid or expired MFA token" });
    return;
  }
  const user = challenge.user;
  if (!user.isActive || user.status !== UserStatus.ACTIVE || !user.mfaEnabled) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const recoveryHashes = parseRecoveryHashes(user.mfaRecoveryCodesHash);
  let verified = false;
  let nextRecoveryHashes = recoveryHashes;
  if (parsed.data.code && user.mfaTotpSecretEncrypted) {
    const secret = decryptSecret(user.mfaTotpSecretEncrypted);
    verified = verifyTotp(parsed.data.code, secret);
  }
  if (!verified && parsed.data.recoveryCode) {
    verified = verifyRecoveryCode(parsed.data.recoveryCode, recoveryHashes);
    if (verified) {
      nextRecoveryHashes = consumeRecoveryCode(parsed.data.recoveryCode, recoveryHashes);
    }
  }
  if (!verified) {
    res.status(401).json({ error: "Invalid MFA code" });
    return;
  }
  const ipAddress =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;
  const session = await createSession({ userId: user.id, ipAddress, userAgent: userAgent ? String(userAgent) : null });
  setSessionCookie(res, session.token, session.expiresAt);
  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      mfaRecoveryCodesHash: JSON.stringify(nextRecoveryHashes),
    },
  });
  await prisma.mfaChallenge.delete({ where: { id: challenge.id } });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      permissions: user.permissions,
    },
    csrfToken,
  });
});

app.post("/auth/forgot", async (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }
  const allowResetUrl =
    (process.env.RETURN_RESET_URL || "").toLowerCase() === "true" || process.env.NODE_ENV !== "production";
  const email = normalizeEmail(parsed.data.email);
  const users = await prisma.user.findMany({ where: { email } });
  if (users.length !== 1) {
    res.json({ message: "If an account exists, a reset link will be sent to the email address." });
    return;
  }
  const user = users[0];
  if (!user.isActive || user.status !== UserStatus.ACTIVE) {
    res.json({ message: "If an account exists, a reset link will be sent to the email address." });
    return;
  }
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  await prisma.passwordReset.create({
    data: {
      orgId: user.orgId,
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });
  const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";
  const resetUrl = `${webOrigin}/reset/${token}`;
  let emailSent = false;
  if (isEmailConfigured()) {
    try {
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
      });
      emailSent = true;
    } catch (error) {
      console.error("Failed to send password reset email", error);
    }
  }

  const response: { message: string; resetUrl?: string } = {
    message: "If an account exists, a reset link will be sent to the email address.",
  };
  if (!emailSent && allowResetUrl) {
    response.resetUrl = resetUrl;
  }
  res.json(response);
});

app.post("/auth/reset", async (req, res) => {
  const schema = z.object({
    token: z.string().min(20),
    password: z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const tokenHash = hashToken(parsed.data.token);
  const reset = await prisma.passwordReset.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!reset) {
    res.status(400).json({ error: "Reset link is invalid or expired." });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: reset.userId },
    data: { passwordHash },
  });
  await prisma.passwordReset.update({
    where: { id: reset.id },
    data: { usedAt: new Date() },
  });
  await prisma.session.updateMany({
    where: { userId: reset.userId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: "PASSWORD_RESET" },
  });
  res.json({ message: "Password updated. You can sign in now." });
});

app.post("/auth/mfa/setup/start", mfaLimiter, async (req, res) => {
  const schema = z.object({ tempToken: z.string().optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  let user = null as Awaited<ReturnType<typeof resolveSessionUser>> | null;
  let challengeId: string | null = null;
  if (parsed.data.tempToken) {
    const challenge = await getMfaChallenge(parsed.data.tempToken, MfaChallengePurpose.SETUP);
    if (!challenge) {
      res.status(401).json({ error: "Invalid or expired MFA token" });
      return;
    }
    user = challenge.user;
    challengeId = challenge.id;
  } else {
    user = await resolveSessionUser(req);
    if (user && !requireSessionCsrf(req, res)) {
      return;
    }
  }
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!user.isActive || user.status !== UserStatus.ACTIVE) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpAuthUrl(user.email, secret);
  const { codes, hashes } = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaTotpSecretEncrypted: encryptSecret(secret),
      mfaRecoveryCodesHash: JSON.stringify(hashes),
    },
  });
  if (challengeId) {
    await prisma.mfaChallenge.update({
      where: { id: challengeId },
      data: { expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MINUTES * 60 * 1000) },
    });
  }
  res.json({ otpauthUrl, secret, recoveryCodes: codes });
});

app.post("/auth/mfa/setup/verify", mfaLimiter, async (req, res) => {
  const schema = z.object({
    code: z.string().min(6),
    tempToken: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  let user = null as Awaited<ReturnType<typeof resolveSessionUser>> | null;
  let challenge: Awaited<ReturnType<typeof getMfaChallenge>> | null = null;
  if (parsed.data.tempToken) {
    challenge = await getMfaChallenge(parsed.data.tempToken, MfaChallengePurpose.SETUP);
    if (!challenge) {
      res.status(401).json({ error: "Invalid or expired MFA token" });
      return;
    }
    user = challenge.user;
  } else {
    user = await resolveSessionUser(req);
    if (user && !requireSessionCsrf(req, res)) {
      return;
    }
  }
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!user.isActive || user.status !== UserStatus.ACTIVE) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  if (!user.mfaTotpSecretEncrypted) {
    res.status(400).json({ error: "MFA setup not started" });
    return;
  }
  const secret = decryptSecret(user.mfaTotpSecretEncrypted);
  if (!verifyTotp(parsed.data.code, secret)) {
    res.status(401).json({ error: "Invalid MFA code" });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true },
  });
  if (challenge) {
    await prisma.mfaChallenge.delete({ where: { id: challenge.id } });
    const ipAddress =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;
    const userAgent = req.headers["user-agent"] || null;
    const session = await createSession({ userId: user.id, ipAddress, userAgent: userAgent ? String(userAgent) : null });
    setSessionCookie(res, session.token, session.expiresAt);
    const csrfToken = createCsrfToken();
    setCsrfCookie(res, csrfToken);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        permissions: user.permissions,
      },
      csrfToken,
    });
    return;
  }
  res.json({ ok: true });
});

app.post("/auth/mfa/disable", requireAuth, requireCsrf, mfaLimiter, async (req, res) => {
  const schema = z.object({
    password: z.string().min(6),
    code: z.string().optional(),
    recoveryCode: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success || (!parsed.data.code && !parsed.data.recoveryCode)) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const user = await prisma.user.findFirst({
    where: { id: req.user!.id, orgId: req.user!.orgId },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  let verified = false;
  const recoveryHashes = parseRecoveryHashes(user.mfaRecoveryCodesHash);
  if (parsed.data.code && user.mfaTotpSecretEncrypted) {
    const secret = decryptSecret(user.mfaTotpSecretEncrypted);
    verified = verifyTotp(parsed.data.code, secret);
  }
  if (!verified && parsed.data.recoveryCode) {
    verified = verifyRecoveryCode(parsed.data.recoveryCode, recoveryHashes);
  }
  if (!verified) {
    res.status(401).json({ error: "Invalid MFA code" });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: false,
      mfaTotpSecretEncrypted: null,
      mfaRecoveryCodesHash: null,
      mfaEnforced: false,
    },
  });
  res.json({ ok: true });
});

app.get("/auth/me", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING", "DRIVER"), async (req, res) => {
  const [org, userRecord] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: req.user!.orgId },
      select: {
        id: true,
        name: true,
        settings: { select: { companyDisplayName: true, operatingMode: true } },
      },
    }),
    prisma.user.findFirst({
      where: { id: req.user!.id, orgId: req.user!.orgId },
      select: { canSeeAllTeams: true, mfaEnabled: true, mfaEnforced: true },
    }),
  ]);
  res.json({
    user: {
      ...req.user,
      canSeeAllTeams: userRecord?.canSeeAllTeams ?? false,
      mfaEnabled: userRecord?.mfaEnabled ?? false,
      mfaEnforced: userRecord?.mfaEnforced ?? false,
    },
    org: org
      ? {
        id: org.id,
          name: org.name,
          companyDisplayName: org.settings?.companyDisplayName ?? null,
          operatingMode: org.settings?.operatingMode ?? null,
        }
      : null,
  });
});

app.get("/auth/csrf", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING", "DRIVER"), (req, res) => {
  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);
  res.json({ csrfToken });
});

app.post("/auth/logout", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING", "DRIVER"), requireCsrf, async (req, res) => {
  const token = req.cookies?.session;
  if (token) {
    await destroySession(token);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.post("/auth/sessions/revoke", requireAuth, requireCsrf, requirePermission(Permission.ADMIN_SETTINGS), async (req, res) => {
  const schema = z.object({
    sessionId: z.string().optional(),
    userId: z.string().optional(),
    reason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.sessionId && !parsed.data.userId)) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const where = parsed.data.sessionId
    ? { id: parsed.data.sessionId, user: { orgId: req.user!.orgId } }
    : { userId: parsed.data.userId!, user: { orgId: req.user!.orgId } };
  await prisma.session.updateMany({
    where,
    data: { revokedAt: new Date(), revokeReason: parsed.data.reason ?? "revoked" },
  });
  res.json({ ok: true });
});

const TASK_LIMIT_DEFAULT = 10;
const TASK_LIMIT_MAX = 50;

function parseListParam(input: unknown) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(String).flatMap((value) => value.split(","));
  if (typeof input === "string") return input.split(",");
  return [];
}

function parseIntParam(value: unknown, fallback: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function deriveTaskDueAt(priority: TaskPriority, now: Date) {
  const hours = priority === TaskPriority.HIGH ? 24 : priority === TaskPriority.MED ? 72 : 24 * 7;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

type TaskInboxRecord = {
  id: string;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: Date | null;
  createdAt: Date;
  assignedToId: string | null;
  assignedRole: Role | null;
  loadId: string | null;
  stopId: string | null;
  docId: string | null;
  driverId: string | null;
  invoiceId: string | null;
  customerId: string | null;
  load: { loadNumber: string; customer: { name: string | null } | null } | null;
  driver: { name: string | null } | null;
  customer: { name: string | null } | null;
  invoice: { invoiceNumber: string | null } | null;
};

function getTaskAction(task: TaskInboxRecord) {
  switch (task.type) {
    case TaskType.COLLECT_POD:
    case TaskType.MISSING_DOC:
      if (task.loadId) {
        return {
          primaryActionLabel: "Upload POD",
          deepLink: `/loads/${task.loadId}?tab=documents&docType=POD`,
        };
      }
      return { primaryActionLabel: "Open documents", deepLink: "/loads" };
    case TaskType.STOP_DELAY_FOLLOWUP:
      if (task.loadId) {
        return { primaryActionLabel: "Review stop delay", deepLink: `/loads/${task.loadId}?tab=stops` };
      }
      return { primaryActionLabel: "Review stop delay", deepLink: "/loads" };
    case TaskType.INVOICE_DISPUTE:
      return { primaryActionLabel: "Review dispute", deepLink: "/billing" };
    case TaskType.PAYMENT_FOLLOWUP:
      return { primaryActionLabel: "Follow up payment", deepLink: "/billing" };
    case TaskType.DRIVER_COMPLIANCE_EXPIRING:
      return { primaryActionLabel: "Review driver", deepLink: "/admin" };
    default:
      if (task.loadId) return { primaryActionLabel: "Open load", deepLink: `/loads/${task.loadId}` };
      if (task.invoiceId) return { primaryActionLabel: "Open billing", deepLink: "/billing" };
      return { primaryActionLabel: "Open", deepLink: "/dashboard" };
  }
}

function mapTaskInboxItem(task: TaskInboxRecord, now: Date) {
  const entity = getTaskEntity(task);
  const derivedDueAt = task.dueAt ? null : deriveTaskDueAt(task.priority, now);
  const action = getTaskAction(task);
  return {
    id: task.id,
    taskKey: buildTaskKey(task),
    title: task.title,
    type: task.type,
    priority: task.priority,
    status: task.status,
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    derivedDueAt: derivedDueAt ? derivedDueAt.toISOString() : null,
    assignedToId: task.assignedToId,
    assignedRole: task.assignedRole,
    entityType: entity.entityType,
    entityId: entity.entityId,
    primaryActionLabel: action.primaryActionLabel,
    deepLink: action.deepLink,
    loadNumber: task.load?.loadNumber ?? null,
    customerName: task.customer?.name ?? task.load?.customer?.name ?? null,
    driverName: task.driver?.name ?? null,
    invoiceNumber: task.invoice?.invoiceNumber ?? null,
  };
}

app.get("/tasks/inbox", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  const tabParam = typeof req.query.tab === "string" ? req.query.tab : "mine";
  const tab = tabParam === "role" ? "role" : "mine";
  const page = clamp(parseIntParam(req.query.page, 1), 1, 500);
  const limit = clamp(parseIntParam(req.query.limit, TASK_LIMIT_DEFAULT), 1, TASK_LIMIT_MAX);
  const statusParam = typeof req.query.status === "string" ? req.query.status : "open";

  const allowedPriorities = new Set(Object.values(TaskPriority));
  const allowedTypes = new Set(Object.values(TaskType));
  const priorities = parseListParam(req.query.priority).filter((value) => allowedPriorities.has(value as TaskPriority));
  const types = parseListParam(req.query.type).filter((value) => allowedTypes.has(value as TaskType));

  const statusFilter =
    statusParam === "completed" ? [TaskStatus.DONE] : [TaskStatus.OPEN, TaskStatus.IN_PROGRESS];

  const baseWhere: Prisma.TaskWhereInput = {
    orgId: req.user!.orgId,
    status: { in: statusFilter },
  };

  const taskScope = await getUserTeamScope(req.user!);
  if (!taskScope.canSeeAllTeams) {
    await ensureTeamAssignmentsForEntityType(req.user!.orgId, TeamEntityType.LOAD, taskScope.defaultTeamId!);
    const scopedLoadIds = await getScopedEntityIds(req.user!.orgId, TeamEntityType.LOAD, taskScope);
    const scopeFilter: Prisma.TaskWhereInput = {
      OR: [{ loadId: null }, { loadId: { in: scopedLoadIds ?? [] } }],
    };
    const existingAnd = baseWhere.AND ? (Array.isArray(baseWhere.AND) ? baseWhere.AND : [baseWhere.AND]) : [];
    baseWhere.AND = [...existingAnd, scopeFilter];
  }

  if (priorities.length > 0) {
    baseWhere.priority = { in: priorities as TaskPriority[] };
  }
  if (types.length > 0) {
    baseWhere.type = { in: types as TaskType[] };
  }

  const where: Prisma.TaskWhereInput =
    tab === "role"
      ? { ...baseWhere, assignedToId: null, assignedRole: req.user!.role as Role }
      : { ...baseWhere, assignedToId: req.user!.id };

  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        type: true,
        priority: true,
        status: true,
        dueAt: true,
        createdAt: true,
        assignedToId: true,
        assignedRole: true,
        loadId: true,
        stopId: true,
        docId: true,
        driverId: true,
        invoiceId: true,
        customerId: true,
        load: { select: { loadNumber: true, customer: { select: { name: true } } } },
        driver: { select: { name: true } },
        customer: { select: { name: true } },
        invoice: { select: { invoiceNumber: true } },
      },
    }),
  ]);

  const now = new Date();
  res.json({
    items: tasks.map((task) => mapTaskInboxItem(task as TaskInboxRecord, now)),
    total,
    page,
    limit,
  });
});

app.get("/tasks/assignees", requireAuth, requirePermission(Permission.TASK_ASSIGN), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { orgId: req.user!.orgId, isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users });
});

app.post("/tasks/:id/assign", requireAuth, requireCsrf, requirePermission(Permission.TASK_ASSIGN), async (req, res) => {
  const schema = z.object({
    assignedToId: z.string().nullable().optional(),
    assignedRole: z.enum(["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING", "DRIVER"]).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  let task;
  try {
    task = await requireOrgEntity(prisma.task, req.user!.orgId, req.params.id, "Task");
  } catch {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (parsed.data.assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: parsed.data.assignedToId, orgId: req.user!.orgId },
    });
    if (!assignee) {
      res.status(400).json({ error: "Assignee not found" });
      return;
    }
  }
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      assignedToId: parsed.data.assignedToId ?? null,
      assignedRole: parsed.data.assignedRole ?? task.assignedRole,
    },
  });
  await createEvent({
    orgId: req.user!.orgId,
    loadId: task.loadId ?? null,
    userId: req.user!.id,
    taskId: updated.id,
    type: EventType.TASK_CREATED,
    message: "Task assigned",
    meta: { assignedToId: updated.assignedToId, assignedRole: updated.assignedRole },
  });
  res.json({ task: updated });
});

app.post("/tasks/:id/complete", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), requireCsrf, async (req, res) => {
  const existing = await prisma.task.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const canComplete =
    existing.assignedToId === req.user!.id || hasPermission(req.user, Permission.TASK_ASSIGN);
  if (!canComplete) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const task = await completeTask(req.params.id, req.user!.orgId, req.user!.id);
  await logAudit({
    orgId: task.orgId,
    userId: req.user!.id,
    action: "TASK_DONE",
    entity: "Task",
    entityId: task.id,
    summary: `Completed task ${task.title}`,
  });
  res.json({ task });
});

app.get("/today", requireAuth, async (req, res) => {
  type TodayItem = {
    severity: "block" | "warning" | "info";
    ruleId: string;
    title: string;
    detail?: string | null;
    href?: string | null;
    entityType?: string | null;
    entityId?: string | null;
  };

  const orgId = req.user!.orgId;
  const role = req.user!.role as Role;
  const now = new Date();
  const blocks: TodayItem[] = [];
  const warnings: TodayItem[] = [];
  const info: TodayItem[] = [];
  const warningSummary: Record<string, number> = {
    dispatch_unassigned_loads: 0,
    dispatch_stuck_in_transit: 0,
  };
  let teamBreakdown:
    | Array<{ teamId: string; teamName: string; warnings: Record<string, number> }>
    | undefined;

  const teamsEnabled = Boolean(
    await prisma.team.findFirst({ where: { orgId, name: { not: DEFAULT_TEAM_NAME } }, select: { id: true } })
  );
  const teamScope = teamsEnabled ? await getUserTeamScope(req.user) : null;
  const canSeeAllTeams = Boolean(teamScope?.canSeeAllTeams);
  const scopeInfo = getTodayScope({ teamsEnabled, role, canSeeAllTeams });
  const { teamScoped, includeTeamBreakdown, isHeadDispatcher } = scopeInfo;
  const scopedLoadIds = teamScoped ? await getScopedEntityIds(orgId, TeamEntityType.LOAD, teamScope!) : null;
  if (scopedLoadIds && scopedLoadIds.length > 2000) {
    console.warn(`[today] Large scopedLoadIds (${scopedLoadIds.length}) for org ${orgId}.`);
  }
  const loadScopeFilter = teamScoped ? { id: { in: scopedLoadIds ?? [] } } : {};

  const addBlock = (item: Omit<TodayItem, "severity">) => blocks.push({ severity: "block", ...item });
  const addWarning = (item: Omit<TodayItem, "severity">) => warnings.push({ severity: "warning", ...item });
  const addInfo = (item: Omit<TodayItem, "severity">) => info.push({ severity: "info", ...item });

  if (role === "ADMIN" || role === "DISPATCHER" || role === "HEAD_DISPATCHER") {
    const [settings, unassignedCount, unassignedSample, rateConCount, rateConSample, activeAssignments, transitLoads] =
      await Promise.all([
        prisma.orgSettings.findFirst({ where: { orgId }, select: { requireRateConBeforeDispatch: true } }),
        prisma.load.count({
          where: {
            orgId,
            deletedAt: null,
            ...loadScopeFilter,
            status: { in: [LoadStatus.PLANNED, LoadStatus.ASSIGNED] },
            OR: [{ assignedDriverId: null }, { truckId: null }, { trailerId: null }],
          },
        }),
        prisma.load.findFirst({
          where: {
            orgId,
            deletedAt: null,
            ...loadScopeFilter,
            status: { in: [LoadStatus.PLANNED, LoadStatus.ASSIGNED] },
            OR: [{ assignedDriverId: null }, { truckId: null }, { trailerId: null }],
          },
          select: { id: true },
        }),
        prisma.load.count({
          where: {
            orgId,
            deletedAt: null,
            ...loadScopeFilter,
            status: { in: [LoadStatus.PLANNED, LoadStatus.ASSIGNED] },
            loadType: LoadType.BROKERED,
            docs: { none: { type: { in: [DocType.RATECON, DocType.RATE_CONFIRMATION] } } },
          },
        }),
        prisma.load.findFirst({
          where: {
            orgId,
            deletedAt: null,
            ...loadScopeFilter,
            status: { in: [LoadStatus.PLANNED, LoadStatus.ASSIGNED] },
            loadType: LoadType.BROKERED,
            docs: { none: { type: { in: [DocType.RATECON, DocType.RATE_CONFIRMATION] } } },
          },
          select: { id: true },
        }),
        prisma.load.findMany({
          where: {
            orgId,
            deletedAt: null,
            ...loadScopeFilter,
            status: { in: [LoadStatus.ASSIGNED, LoadStatus.IN_TRANSIT] },
            OR: [{ assignedDriverId: { not: null } }, { truckId: { not: null } }, { trailerId: { not: null } }],
          },
          select: {
            id: true,
            loadNumber: true,
            assignedDriverId: true,
            truckId: true,
            trailerId: true,
          },
        }),
        prisma.load.findMany({
          where: { orgId, deletedAt: null, ...loadScopeFilter, status: LoadStatus.IN_TRANSIT },
          select: {
            id: true,
            loadNumber: true,
            createdAt: true,
            stops: { select: { arrivedAt: true, departedAt: true } },
          },
        }),
      ]);

    if (unassignedCount > 0) {
      warningSummary.dispatch_unassigned_loads = unassignedCount;
      addWarning({
        ruleId: "dispatch_unassigned_loads",
        title: "Unassigned loads need coverage",
        detail: `${unassignedCount} load${unassignedCount === 1 ? "" : "s"} missing driver, truck, or trailer.`,
        href: "/dispatch",
        entityType: "load",
        entityId: unassignedSample?.id ?? null,
      });
    }

    if (settings?.requireRateConBeforeDispatch && rateConCount > 0) {
      addBlock({
        ruleId: "dispatch_missing_ratecon",
        title: "Rate confirmation required before dispatch",
        detail: `${rateConCount} load${rateConCount === 1 ? "" : "s"} missing a RateCon.`,
        href: "/loads",
        entityType: "load",
        entityId: rateConSample?.id ?? null,
      });
    }

    if (activeAssignments.length > 1) {
      const driverMap = new Map<string, string[]>();
      const truckMap = new Map<string, string[]>();
      const trailerMap = new Map<string, string[]>();
      for (const load of activeAssignments) {
        if (load.assignedDriverId) {
          driverMap.set(load.assignedDriverId, [...(driverMap.get(load.assignedDriverId) ?? []), load.loadNumber]);
        }
        if (load.truckId) {
          truckMap.set(load.truckId, [...(truckMap.get(load.truckId) ?? []), load.loadNumber]);
        }
        if (load.trailerId) {
          trailerMap.set(load.trailerId, [...(trailerMap.get(load.trailerId) ?? []), load.loadNumber]);
        }
      }
      const driverConflicts = [...driverMap.values()].filter((loads) => loads.length > 1).length;
      const truckConflicts = [...truckMap.values()].filter((loads) => loads.length > 1).length;
      const trailerConflicts = [...trailerMap.values()].filter((loads) => loads.length > 1).length;
      const conflictParts = [];
      if (driverConflicts > 0) conflictParts.push(`${driverConflicts} driver${driverConflicts === 1 ? "" : "s"}`);
      if (truckConflicts > 0) conflictParts.push(`${truckConflicts} truck${truckConflicts === 1 ? "" : "s"}`);
      if (trailerConflicts > 0) conflictParts.push(`${trailerConflicts} trailer${trailerConflicts === 1 ? "" : "s"}`);
      if (conflictParts.length > 0) {
        addBlock({
          ruleId: "dispatch_assignment_conflicts",
          title: "Assignment conflicts detected",
          detail: `${conflictParts.join(", ")} double-booked across active loads.`,
          href: "/dispatch",
          entityType: "dispatch",
          entityId: activeAssignments[0]?.id ?? null,
        });
      }
    }

    const stuckThresholdMs = 24 * 60 * 60 * 1000;
    const stuckLoads = transitLoads.filter((load) => {
      const stopTimes = load.stops
        .flatMap((stop) => [stop.arrivedAt, stop.departedAt])
        .filter((value): value is Date => Boolean(value));
      const lastEvent = stopTimes.length > 0 ? new Date(Math.max(...stopTimes.map((date) => date.getTime()))) : load.createdAt;
      return now.getTime() - lastEvent.getTime() > stuckThresholdMs;
    });
    if (stuckLoads.length > 0) {
      warningSummary.dispatch_stuck_in_transit = stuckLoads.length;
      addWarning({
        ruleId: "dispatch_stuck_in_transit",
        title: "Loads stuck in transit",
        detail: `${stuckLoads.length} load${stuckLoads.length === 1 ? "" : "s"} with no recent stop activity.`,
        href: "/loads",
        entityType: "load",
        entityId: stuckLoads[0]?.id ?? null,
      });
    }

    if (includeTeamBreakdown) {
      const [teams, unassignedLoadsForBreakdown] = await Promise.all([
        prisma.team.findMany({ where: { orgId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        unassignedCount > 0
          ? prisma.load.findMany({
              where: {
                orgId,
                deletedAt: null,
                status: { in: [LoadStatus.PLANNED, LoadStatus.ASSIGNED] },
                OR: [{ assignedDriverId: null }, { truckId: null }, { trailerId: null }],
              },
              select: { id: true },
            })
          : Promise.resolve([]),
      ]);

      if (teams.length > 0) {
        if (teamScope?.defaultTeamId) {
          await ensureTeamAssignmentsForEntityType(orgId, TeamEntityType.LOAD, teamScope.defaultTeamId);
        }
        const stuckIds = stuckLoads.map((load) => load.id);
        const unassignedIds = unassignedLoadsForBreakdown.map((load) => load.id);
        const relevantIds = Array.from(new Set([...stuckIds, ...unassignedIds]));
        const assignments = relevantIds.length
          ? await prisma.teamAssignment.findMany({
              where: { orgId, entityType: TeamEntityType.LOAD, entityId: { in: relevantIds } },
              select: { entityId: true, teamId: true },
            })
          : [];
        const assignmentMap = new Map(assignments.map((assignment) => [assignment.entityId, assignment.teamId]));

        const breakdownMap = new Map<string, Record<string, number>>();
        for (const team of teams) {
          breakdownMap.set(team.id, { dispatch_unassigned_loads: 0, dispatch_stuck_in_transit: 0 });
        }
        const fallbackTeamId = teamScope?.defaultTeamId ?? teams[0]?.id ?? null;

        for (const loadId of unassignedIds) {
          const teamId = assignmentMap.get(loadId) ?? fallbackTeamId;
          if (!teamId) continue;
          const entry = breakdownMap.get(teamId);
          if (entry) entry.dispatch_unassigned_loads += 1;
        }
        for (const loadId of stuckIds) {
          const teamId = assignmentMap.get(loadId) ?? fallbackTeamId;
          if (!teamId) continue;
          const entry = breakdownMap.get(teamId);
          if (entry) entry.dispatch_stuck_in_transit += 1;
        }

        teamBreakdown = teams.map((team) => ({
          teamId: team.id,
          teamName: team.name,
          warnings: breakdownMap.get(team.id) ?? { dispatch_unassigned_loads: 0, dispatch_stuck_in_transit: 0 },
        }));
      }
    }
  }

  if (role === "ADMIN") {
    const expiringThreshold = addDays(now, DEFAULT_VAULT_EXPIRING_DAYS);
    const expiringSoon = await prisma.vaultDocument.count({
      where: { orgId, expiresAt: { gte: now, lte: expiringThreshold } },
    });
    if (expiringSoon > 0) {
      addInfo({
        ruleId: "vault_docs_expiring_soon",
        title: "Documents expiring soon",
        detail: `${expiringSoon} document${expiringSoon === 1 ? "" : "s"} expiring in the next ${DEFAULT_VAULT_EXPIRING_DAYS} days.`,
        href: "/admin/documents/vault",
      });
    }
  }

  if (role === "ADMIN" || role === "BILLING") {
    const [missingPodCount, missingPodSample, podUnverifiedCount, podUnverifiedSample, readyCount, readySample] =
      await Promise.all([
        prisma.load.count({
          where: { orgId, status: LoadStatus.DELIVERED, docs: { none: { type: DocType.POD } } },
        }),
        prisma.load.findFirst({
          where: { orgId, status: LoadStatus.DELIVERED, docs: { none: { type: DocType.POD } } },
          select: { id: true },
        }),
        prisma.load.count({
          where: {
            orgId,
            status: { in: [LoadStatus.DELIVERED, LoadStatus.POD_RECEIVED, LoadStatus.READY_TO_INVOICE] },
            docs: { some: { type: DocType.POD, status: DocStatus.UPLOADED } },
          },
        }),
        prisma.load.findFirst({
          where: {
            orgId,
            status: { in: [LoadStatus.DELIVERED, LoadStatus.POD_RECEIVED, LoadStatus.READY_TO_INVOICE] },
            docs: { some: { type: DocType.POD, status: DocStatus.UPLOADED } },
          },
          select: { id: true },
        }),
        prisma.load.count({ where: { orgId, status: LoadStatus.READY_TO_INVOICE } }),
        prisma.load.findFirst({ where: { orgId, status: LoadStatus.READY_TO_INVOICE }, select: { id: true } }),
      ]);

    if (missingPodCount > 0) {
      addBlock({
        ruleId: "billing_missing_pod",
        title: "Delivered loads missing POD",
        detail: `${missingPodCount} load${missingPodCount === 1 ? "" : "s"} still need POD uploaded.`,
        href: "/billing",
        entityType: "load",
        entityId: missingPodSample?.id ?? null,
      });
    }

    if (podUnverifiedCount > 0) {
      addWarning({
        ruleId: "billing_pod_unverified",
        title: "PODs awaiting verification",
        detail: `${podUnverifiedCount} POD${podUnverifiedCount === 1 ? "" : "s"} uploaded but not verified.`,
        href: "/billing",
        entityType: "load",
        entityId: podUnverifiedSample?.id ?? null,
      });
    }

    if (readyCount > 0) {
      addInfo({
        ruleId: "billing_ready_to_invoice",
        title: "Ready to invoice",
        detail: `${readyCount} load${readyCount === 1 ? "" : "s"} ready for invoice generation.`,
        href: "/billing",
        entityType: "load",
        entityId: readySample?.id ?? null,
      });
    }
  }

  if (role === "DRIVER") {
    const driver = await prisma.driver.findFirst({ where: { orgId, userId: req.user!.id } });
    if (driver) {
      const load = await prisma.load.findFirst({
        where: {
          orgId,
          assignedDriverId: driver.id,
          status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
        },
        include: {
          stops: { orderBy: { sequence: "asc" } },
          docs: { select: { id: true, type: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      if (load) {
        const nextStop = load.stops.find((stop) => stop.status !== "DEPARTED");
        if (nextStop && (nextStop.status === "PLANNED" || nextStop.status === "ARRIVED")) {
          addBlock({
            ruleId: "driver_next_stop_action",
            title: nextStop.status === "ARRIVED" ? "Depart your current stop" : "Arrive at your next stop",
            detail: nextStop.name ? `Next stop: ${nextStop.name}` : "Open the current load to update your stop.",
            href: "/driver",
            entityType: "stop",
            entityId: nextStop.id,
          });
        }

        if (load.status === LoadStatus.DELIVERED) {
          const hasPod = load.docs.some((doc) => doc.type === DocType.POD);
          if (!hasPod) {
            addWarning({
              ruleId: "driver_pod_missing",
              title: "POD missing after delivery",
              detail: "Upload proof of delivery to close out this load.",
              href: "/driver",
              entityType: "load",
              entityId: load.id,
            });
          }
        }

        const rejectedDocs = load.docs.filter((doc) => doc.status === DocStatus.REJECTED);
        if (rejectedDocs.length > 0) {
          addWarning({
            ruleId: "driver_doc_rejected",
            title: "Rejected document needs reupload",
            detail: `${rejectedDocs.length} document${rejectedDocs.length === 1 ? "" : "s"} rejected by billing.`,
            href: "/driver",
            entityType: "document",
            entityId: rejectedDocs[0]?.id ?? null,
          });
        }
      }
    }
  }

  res.json({
    blocks,
    warnings,
    info,
    teamsEnabled,
    scope: scopeInfo.scope,
    warningSummary,
    teamBreakdown,
  });
});

app.get("/today/warnings/details", requireAuth, async (req, res) => {
  const orgId = req.user!.orgId;
  const role = req.user!.role as Role;
  const typeParam = typeof req.query.type === "string" ? req.query.type : "";
  if (!typeParam || !isWarningType(typeParam)) {
    res.status(400).json({ error: "Invalid warning type" });
    return;
  }

  const limitRaw = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : NaN;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 25;
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
  const teamIdParam = typeof req.query.teamId === "string" ? req.query.teamId : null;

  const teamsEnabled = Boolean(
    await prisma.team.findFirst({ where: { orgId, name: { not: DEFAULT_TEAM_NAME } }, select: { id: true } })
  );
  const teamScope = teamsEnabled ? await getUserTeamScope(req.user) : null;
  const canSeeAllTeams = Boolean(teamScope?.canSeeAllTeams);
  const baseScope = getTodayScope({ teamsEnabled, role, canSeeAllTeams });

  let effectiveScope = teamScope;
  let teamScoped = baseScope.teamScoped;
  let scopeMode = baseScope.scope;
  let teamInfo: { teamId: string; teamName: string } | undefined;

  if (teamsEnabled && teamIdParam && (role === Role.ADMIN || baseScope.isHeadDispatcher)) {
    const team = await prisma.team.findFirst({ where: { id: teamIdParam, orgId }, select: { id: true, name: true } });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    teamInfo = { teamId: team.id, teamName: team.name };
    effectiveScope = await applyTeamFilterOverride(orgId, teamScope!, team.id);
    teamScoped = true;
    scopeMode = "team";
  }

  const scopedLoadIds = teamScoped ? await getScopedEntityIds(orgId, TeamEntityType.LOAD, effectiveScope!) : null;
  if (scopedLoadIds && scopedLoadIds.length > 2000) {
    console.warn(`[today] Large scopedLoadIds (${scopedLoadIds.length}) for org ${orgId}.`);
  }
  const loadScopeFilter = teamScoped ? { id: { in: scopedLoadIds ?? [] } } : {};

  const now = Date.now();
  let loads: Array<{
    id: string;
    loadNumber?: string | null;
    customerName?: string | null;
    status?: string | null;
    warningReason: string;
    ageMinutes?: number | null;
    assignedDriverName?: string | null;
    stopSummary?: string | null;
  }> = [];
  let nextCursor: string | null = null;

  if (typeParam === "dispatch_unassigned_loads") {
    const rows = await prisma.load.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...loadScopeFilter,
        status: { in: [LoadStatus.PLANNED, LoadStatus.ASSIGNED] },
        OR: [{ assignedDriverId: null }, { truckId: null }, { trailerId: null }],
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        loadNumber: true,
        customerName: true,
        status: true,
        assignedDriverId: true,
        truckId: true,
        trailerId: true,
        createdAt: true,
        driver: { select: { name: true } },
        stops: { select: { type: true, city: true, state: true, arrivedAt: true, departedAt: true, sequence: true } },
      },
    });

    const pageRows = rows.slice(0, limit);
    if (rows.length > limit) {
      nextCursor = rows[limit - 1]?.id ?? null;
    }

    loads = pageRows.map((load) => {
      const missing: string[] = [];
      if (!load.assignedDriverId) missing.push("driver");
      if (!load.truckId) missing.push("truck");
      if (!load.trailerId) missing.push("trailer");
      const nextStop =
        load.stops.find((stop) => !stop.arrivedAt || !stop.departedAt) ??
        load.stops.slice().sort((a, b) => a.sequence - b.sequence)[0];
      const stopSummary = nextStop ? `${nextStop.type} · ${nextStop.city}, ${nextStop.state}` : null;
      return {
        id: load.id,
        loadNumber: load.loadNumber ?? null,
        customerName: load.customerName ?? null,
        status: load.status ?? null,
        warningReason: missing.length ? `Missing ${missing.join(", ")}` : WARNING_TYPE_MAP.dispatch_unassigned_loads.reason,
        ageMinutes: Math.round((now - load.createdAt.getTime()) / (1000 * 60)),
        assignedDriverName: load.driver?.name ?? null,
        stopSummary,
      };
    });
  }

  if (typeParam === "dispatch_stuck_in_transit") {
    const fetchLimit = Math.min(limit * 3, 150);
    const rows = await prisma.load.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...loadScopeFilter,
        status: LoadStatus.IN_TRANSIT,
      },
      orderBy: { createdAt: "desc" },
      take: fetchLimit,
      select: {
        id: true,
        loadNumber: true,
        customerName: true,
        status: true,
        createdAt: true,
        driver: { select: { name: true } },
        stops: { select: { type: true, city: true, state: true, arrivedAt: true, departedAt: true, sequence: true } },
      },
    });

    const stuckThresholdMs = 24 * 60 * 60 * 1000;
    const stuckRows = rows.filter((load) => {
      const stopTimes = load.stops
        .flatMap((stop) => [stop.arrivedAt, stop.departedAt])
        .filter((value): value is Date => Boolean(value));
      const lastEvent = stopTimes.length > 0 ? new Date(Math.max(...stopTimes.map((date) => date.getTime()))) : load.createdAt;
      return now - lastEvent.getTime() > stuckThresholdMs;
    });

    loads = stuckRows.slice(0, limit).map((load) => {
      const stopTimes = load.stops
        .flatMap((stop) => [stop.arrivedAt, stop.departedAt])
        .filter((value): value is Date => Boolean(value));
      const lastEvent = stopTimes.length > 0 ? new Date(Math.max(...stopTimes.map((date) => date.getTime()))) : load.createdAt;
      const nextStop =
        load.stops.find((stop) => !stop.arrivedAt || !stop.departedAt) ??
        load.stops.slice().sort((a, b) => a.sequence - b.sequence)[0];
      const stopSummary = nextStop ? `${nextStop.type} · ${nextStop.city}, ${nextStop.state}` : null;
      return {
        id: load.id,
        loadNumber: load.loadNumber ?? null,
        customerName: load.customerName ?? null,
        status: load.status ?? null,
        warningReason: WARNING_TYPE_MAP.dispatch_stuck_in_transit.reason,
        ageMinutes: Math.round((now - lastEvent.getTime()) / (1000 * 60)),
        assignedDriverName: load.driver?.name ?? null,
        stopSummary,
      };
    });

    if (stuckRows.length >= limit && rows.length === fetchLimit) {
      nextCursor = rows[rows.length - 1]?.id ?? null;
    }
  }

  res.json({
    teamsEnabled,
    scope: scopeMode,
    type: typeParam,
    team: teamInfo,
    loads,
    pageInfo: { nextCursor },
  });
});

app.post("/learning/suggest", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  const schema = z.object({
    domain: z.nativeEnum(LearningDomain),
    inputJson: z.record(z.any()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const suggestion = await applyLearned({
    orgId: req.user!.orgId,
    domain: parsed.data.domain,
    inputJson: parsed.data.inputJson,
  });
  res.json({ suggestion });
});

app.post("/learning/import-mapping", requireAuth, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const schema = z.object({
    headers: z.array(z.string().min(1)),
    mapping: z.record(z.string(), z.string()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const mappingEntries = Object.entries(parsed.data.mapping).filter(([, value]) => value);
  for (const [header, field] of mappingEntries) {
    const key = buildLearningKeyForHeader(header);
    await recordExample({
      orgId: req.user!.orgId,
      domain: LearningDomain.IMPORT_MAPPING,
      inputJson: { header },
      correctedJson: { field },
      keys: [key],
      valueJson: { field },
    });
  }
  res.json({ ok: true });
});

app.post("/learning/attention-outcome", requireAuth, async (req, res) => {
  const schema = z.object({
    ruleId: z.string().min(1),
    severity: z.enum(["block", "warning", "info"]),
    entityType: z.string().optional(),
    outcome: z.enum(["FIXED", "IGNORED", "SNOOZED"]),
    timeToFixSeconds: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  await recordExample({
    orgId: req.user!.orgId,
    domain: LearningDomain.ATTENTION_OUTCOME,
    inputJson: {
      ruleId: parsed.data.ruleId,
      severity: parsed.data.severity,
      entityType: parsed.data.entityType ?? null,
      timeToFixSeconds: parsed.data.timeToFixSeconds ?? null,
    },
    correctedJson: { outcome: parsed.data.outcome },
  });
  res.json({ ok: true });
});

app.get("/admin/attention-tuning", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const examples = await prisma.learningExample.findMany({
    where: { orgId: req.user!.orgId, domain: LearningDomain.ATTENTION_OUTCOME },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const statsByRule = new Map<string, { total: number; fixed: number; ignored: number; snoozed: number; times: number[]; severity?: string }>();
  for (const example of examples) {
    const input = example.inputJson as any;
    const corrected = example.correctedJson as any;
    const ruleId = String(input?.ruleId ?? "unknown");
    const outcome = String(corrected?.outcome ?? "");
    const entry =
      statsByRule.get(ruleId) ?? { total: 0, fixed: 0, ignored: 0, snoozed: 0, times: [], severity: input?.severity };
    entry.total += 1;
    if (outcome === "FIXED") entry.fixed += 1;
    if (outcome === "IGNORED") entry.ignored += 1;
    if (outcome === "SNOOZED") entry.snoozed += 1;
    if (typeof input?.timeToFixSeconds === "number") entry.times.push(input.timeToFixSeconds);
    entry.severity = entry.severity ?? input?.severity;
    statsByRule.set(ruleId, entry);
  }

  const suggestions = Array.from(statsByRule.entries()).map(([ruleId, stats]) => {
    const ignoredPct = stats.total ? stats.ignored / stats.total : 0;
    const fixedPct = stats.total ? stats.fixed / stats.total : 0;
    const avgTimeToFix = stats.times.length
      ? Math.round(stats.times.reduce((sum, value) => sum + value, 0) / stats.times.length)
      : null;
    let suggestion = "Keep current severity";
    if (ignoredPct >= 0.7) {
      suggestion = "Downgrade severity (high ignore rate)";
    } else if (fixedPct >= 0.7 && avgTimeToFix !== null && avgTimeToFix <= 300) {
      suggestion = "Keep severity (fast resolution)";
    }
    return {
      ruleId,
      suggestion,
      stats: {
        severity: stats.severity ?? null,
        total: stats.total,
        ignoredPct: Number(ignoredPct.toFixed(2)),
        fixedPct: Number(fixedPct.toFixed(2)),
        avgTimeToFixSeconds: avgTimeToFix,
      },
    };
  });

  res.json({ suggestions });
});

app.get("/loads", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  try {
    const archived = parseBooleanParam(typeof req.query.archived === "string" ? req.query.archived : undefined);
    const { where } = buildLoadFilters(req, { archived });
    const loadScope = await getUserTeamScope(req.user!);
    const teamFilterId = typeof req.query.teamId === "string" ? req.query.teamId.trim() : "";
    const effectiveScope = await applyTeamFilterOverride(req.user!.orgId, loadScope, teamFilterId || null);
    if (!effectiveScope.canSeeAllTeams) {
      await ensureTeamAssignmentsForEntityType(req.user!.orgId, TeamEntityType.LOAD, effectiveScope.defaultTeamId!);
      const scopedLoadIds = await getScopedEntityIds(req.user!.orgId, TeamEntityType.LOAD, effectiveScope);
      where.id = { in: scopedLoadIds ?? [] };
    }
    const chip = typeof req.query.chip === "string" ? req.query.chip : "";
    if (!req.query.status && chip) {
      if (chip === "active") {
        where.status = { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] };
      } else if (chip === "archived") {
        where.status = { in: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] };
      } else if (chip === "ready-to-invoice") {
        where.status = LoadStatus.READY_TO_INVOICE;
      } else if (chip === "delivered-unbilled") {
        where.status = { in: [LoadStatus.DELIVERED, LoadStatus.POD_RECEIVED] };
        where.docs = { none: { type: DocType.POD, status: DocStatus.VERIFIED } };
      } else if (chip === "missing-pod") {
        where.status = LoadStatus.DELIVERED;
        where.docs = { none: { type: DocType.POD } };
      } else if (chip === "tracking-off") {
        const recentPingSince = new Date(Date.now() - 10 * 60 * 1000);
        where.status = { in: [LoadStatus.ASSIGNED, LoadStatus.IN_TRANSIT] };
        const andConditions = where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : [];
        andConditions.push(
          { trackingSessions: { none: { status: "ON" } } },
          { locationPings: { none: { capturedAt: { gte: recentPingSince } } } }
        );
        where.AND = andConditions;
      }
    }
    const view = typeof req.query.view === "string" ? req.query.view : "";
    if (view === "dispatch") {
      if (!hasPermission(req.user, Permission.LOAD_ASSIGN)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const needsAssignment = parseBooleanParam(
        typeof req.query.needsAssignment === "string" ? req.query.needsAssignment : undefined
      );
      const atRisk = parseBooleanParam(typeof req.query.atRisk === "string" ? req.query.atRisk : undefined);
      const requestedQueueView = normalizeDispatchQueueView(
        typeof req.query.queueView === "string" ? req.query.queueView : null
      );
      const effectiveQueueView = needsAssignment ? "active" : requestedQueueView;
      const queueFilters = buildDispatchQueueFilters(effectiveQueueView);
      const andConditions = where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : [];
      if (needsAssignment) {
        andConditions.push({
          OR: [{ assignedDriverId: null }, { truckId: null }, { status: LoadStatus.PLANNED }],
        });
      }
      if (atRisk) {
        const recentPingSince = new Date(Date.now() - 10 * 60 * 1000);
        andConditions.push({
          OR: [
            {
              status: LoadStatus.IN_TRANSIT,
              trackingSessions: { none: { status: "ON" } },
              locationPings: { none: { capturedAt: { gte: recentPingSince } } },
            },
            { stops: { some: { appointmentEnd: { lt: new Date() }, arrivedAt: null } } },
          ],
        });
      }
      andConditions.push(queueFilters.where);
      if (andConditions.length > 0) {
        where.AND = andConditions;
      }

      const page = Math.max(1, parseInt(typeof req.query.page === "string" ? req.query.page : "1", 10) || 1);
      const pageSizeRaw = parseInt(typeof req.query.limit === "string" ? req.query.limit : "25", 10) || 25;
      const limit = Math.min(100, Math.max(10, pageSizeRaw));
      const skip = (page - 1) * limit;

      const [total, rows] = await Promise.all([
        prisma.load.count({ where }),
        prisma.load.findMany({
          where,
          select: {
            id: true,
            loadNumber: true,
            status: true,
            customerName: true,
            rate: true,
            miles: true,
            assignedDriverId: true,
            driver: { select: { id: true, name: true } },
            truck: { select: { id: true, unit: true } },
            trailer: { select: { id: true, unit: true } },
            operatingEntity: { select: { id: true, name: true } },
            stops: {
              orderBy: { sequence: "asc" },
              select: {
                id: true,
                type: true,
                name: true,
                city: true,
                state: true,
                appointmentStart: true,
                appointmentEnd: true,
                arrivedAt: true,
                departedAt: true,
                sequence: true,
              },
            },
            legs: { select: { status: true } },
            trackingSessions: {
              where: { status: "ON" },
              orderBy: { startedAt: "desc" },
              take: 1,
              select: { status: true },
            },
            locationPings: {
              orderBy: { capturedAt: "desc" },
              take: 1,
              select: { capturedAt: true },
            },
            createdAt: true,
          },
          orderBy: queueFilters.orderBy,
          skip,
          take: limit,
        }),
      ]);

      const now = Date.now();
      const items = rows.map((load) => {
        const shipper = load.stops.find((stop) => stop.type === StopType.PICKUP);
        const consignee = load.stops.slice().reverse().find((stop) => stop.type === StopType.DELIVERY);
        const nextStop = load.stops.find((stop) => !stop.arrivedAt || !stop.departedAt) ?? null;
        const lastPing = load.locationPings[0];
        const hasActiveTracking = load.trackingSessions.some((session) => session.status === "ON");
        let trackingState: "ON" | "OFF" = "OFF";
        if (hasActiveTracking) {
          trackingState = "ON";
        } else if (lastPing?.capturedAt) {
          const diffMs = now - new Date(lastPing.capturedAt).getTime();
          if (diffMs < 10 * 60 * 1000) {
            trackingState = "ON";
          }
        }
        const overdueStop =
          Boolean(nextStop?.appointmentEnd) &&
          now > new Date(nextStop!.appointmentEnd as Date).getTime() &&
          !nextStop?.arrivedAt;
        const trackingOff = load.status === LoadStatus.IN_TRANSIT && trackingState === "OFF";
        const needsAssign =
          !load.assignedDriverId || !load.truck?.id || load.status === LoadStatus.PLANNED || load.status === LoadStatus.DRAFT;
        const atRiskFlag = trackingOff || overdueStop;
        const nextStopTime = nextStop?.appointmentStart ?? nextStop?.appointmentEnd ?? null;
        const legSummary = {
          count: load.legs.length,
          activeStatus: load.legs.find((leg) => leg.status === "IN_PROGRESS")?.status ?? null,
        };
        return {
          id: load.id,
          loadNumber: load.loadNumber,
          status: load.status,
          customerName: load.customerName ?? null,
          rate: load.rate,
          miles: load.miles,
          assignment: {
            driver: load.driver,
            truck: load.truck,
            trailer: load.trailer,
          },
          operatingEntity: load.operatingEntity,
          route: {
            shipperCity: shipper?.city ?? null,
            shipperState: shipper?.state ?? null,
            consigneeCity: consignee?.city ?? null,
            consigneeState: consignee?.state ?? null,
          },
          nextStop: nextStop
            ? {
                id: nextStop.id,
                type: nextStop.type,
                name: nextStop.name,
                city: nextStop.city,
                state: nextStop.state,
                appointmentStart: nextStop.appointmentStart,
                appointmentEnd: nextStop.appointmentEnd,
                arrivedAt: nextStop.arrivedAt,
                departedAt: nextStop.departedAt,
                sequence: nextStop.sequence,
              }
            : null,
          tracking: {
            state: trackingState,
            lastPingAt: lastPing?.capturedAt ?? null,
          },
          legSummary,
          riskFlags: {
            needsAssignment: needsAssign,
            trackingOffInTransit: trackingOff,
            overdueStopWindow: overdueStop,
            atRisk: atRiskFlag,
            nextStopTime,
          },
        };
      });

      const ordered = items.sort((a, b) => {
        const priorityA = a.riskFlags.needsAssignment ? 0 : a.riskFlags.atRisk ? 1 : 2;
        const priorityB = b.riskFlags.needsAssignment ? 0 : b.riskFlags.atRisk ? 1 : 2;
        if (priorityA !== priorityB) return priorityA - priorityB;
        const aTime = a.riskFlags.nextStopTime ? new Date(a.riskFlags.nextStopTime).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.riskFlags.nextStopTime ? new Date(b.riskFlags.nextStopTime).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });

      res.json({
        items: queueFilters.useRiskSort ? ordered : items,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        total,
        pageSize: limit,
      });
      return;
    }
    const page = Math.max(1, parseInt(typeof req.query.page === "string" ? req.query.page : "1", 10) || 1);
    const pageSizeRaw = parseInt(typeof req.query.limit === "string" ? req.query.limit : "25", 10) || 25;
    const limit = Math.min(100, Math.max(10, pageSizeRaw));
    const skip = (page - 1) * limit;
    const [total, rows] = await Promise.all([
      prisma.load.count({ where }),
      prisma.load.findMany({
        where,
        select: {
          id: true,
          loadNumber: true,
          status: true,
          loadType: true,
          customerName: true,
          customerRef: true,
          bolNumber: true,
          shipperReferenceNumber: true,
          consigneeReferenceNumber: true,
          palletCount: true,
          weightLbs: true,
          miles: true,
          rate: true,
          plannedAt: true,
          deliveredAt: true,
          assignedDriverId: true,
          driver: { select: { id: true, name: true } },
          customer: { select: { name: true } },
          operatingEntity: { select: { name: true } },
          stops: {
            where: { type: { in: [StopType.PICKUP, StopType.DELIVERY] } },
            orderBy: { sequence: "asc" },
            select: { type: true, city: true, state: true, name: true, appointmentStart: true, appointmentEnd: true },
          },
          docs: {
            where: { type: DocType.POD },
            select: { status: true, uploadedAt: true, verifiedAt: true, rejectedAt: true },
          },
          trackingSessions: {
            where: { status: "ON" },
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { status: true },
          },
          locationPings: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { capturedAt: true, speedMph: true },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    const loads = rows.map((load) => {
      const shipper = load.stops.find((stop) => stop.type === "PICKUP");
      const consignee = load.stops.slice().reverse().find((stop) => stop.type === "DELIVERY");
      const podDocs = load.docs;
      let podStatus: "MISSING" | "UPLOADED" | "VERIFIED" | "REJECTED" = "MISSING";
      let podUploadedAt: Date | null = null;
      let podVerifiedAt: Date | null = null;
      let podRejectedAt: Date | null = null;
      if (podDocs.length > 0) {
        const rejected = podDocs.find((doc) => doc.status === "REJECTED");
        const verified = podDocs.find((doc) => doc.status === "VERIFIED");
        if (rejected) {
          podStatus = "REJECTED";
          podUploadedAt = rejected.uploadedAt ?? null;
          podVerifiedAt = rejected.verifiedAt ?? null;
          podRejectedAt = rejected.rejectedAt ?? null;
        } else if (verified) {
          podStatus = "VERIFIED";
          podUploadedAt = verified.uploadedAt ?? null;
          podVerifiedAt = verified.verifiedAt ?? null;
          podRejectedAt = verified.rejectedAt ?? null;
        } else {
          podStatus = "UPLOADED";
          podUploadedAt = podDocs[0].uploadedAt ?? null;
          podVerifiedAt = podDocs[0].verifiedAt ?? null;
          podRejectedAt = podDocs[0].rejectedAt ?? null;
        }
      }

      const lastPing = load.locationPings[0];
      const hasActiveTracking = load.trackingSessions.some((session) => session.status === "ON");
      let trackingState: "ON" | "OFF" = "OFF";
      if (hasActiveTracking) {
        trackingState = "ON";
      } else if (lastPing?.capturedAt) {
        const diffMs = Date.now() - new Date(lastPing.capturedAt).getTime();
        if (diffMs < 10 * 60 * 1000) {
          trackingState = "ON";
        }
      }

      return {
        id: load.id,
        loadNumber: load.loadNumber,
        status: load.status,
        loadType: load.loadType,
        customerName: load.customerName,
        customerRef: load.customerRef,
        bolNumber: load.bolNumber,
        shipperReferenceNumber: load.shipperReferenceNumber,
        consigneeReferenceNumber: load.consigneeReferenceNumber,
        palletCount: load.palletCount,
        weightLbs: load.weightLbs,
        miles: load.miles,
        rate: load.rate,
        plannedAt: load.plannedAt,
        deliveredAt: load.deliveredAt,
        assignedDriverId: load.assignedDriverId,
        driver: load.driver,
        customer: load.customer,
        operatingEntity: load.operatingEntity,
        shipperCity: shipper?.city ?? null,
        shipperState: shipper?.state ?? null,
        shipperName: shipper?.name ?? null,
        shipperApptStart: shipper?.appointmentStart ?? null,
        shipperApptEnd: shipper?.appointmentEnd ?? null,
        consigneeCity: consignee?.city ?? null,
        consigneeState: consignee?.state ?? null,
        consigneeName: consignee?.name ?? null,
        consigneeApptStart: consignee?.appointmentStart ?? null,
        consigneeApptEnd: consignee?.appointmentEnd ?? null,
        podStatus,
        podUploadedAt,
        podVerifiedAt,
        podRejectedAt,
        trackingState,
        trackingLastPingAt: lastPing?.capturedAt ?? null,
        trackingLastPingSpeedMph: lastPing?.speedMph ?? null,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({ loads, page, totalPages, total, pageSize: limit });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    console.error("GET /loads failed", detail);
    sendServerError(res, "Failed to load loads", err);
  }
});

const formatCsvValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  if (text.includes(",") || text.includes("\n")) {
    return `"${text}"`;
  }
  return text;
};

const formatIso = (value?: string | Date | null) => {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const derivePodStatus = (docs: any[]) => {
  const podDocs = docs.filter((doc) => doc.type === "POD");
  if (podDocs.length === 0) {
    return { status: "Missing", uploadedAt: "", verifiedAt: "", rejectedAt: "" };
  }
  const rejected = podDocs.find((doc) => doc.status === "REJECTED");
  if (rejected) {
    return {
      status: "Rejected",
      uploadedAt: formatIso(rejected.uploadedAt),
      verifiedAt: formatIso(rejected.verifiedAt),
      rejectedAt: formatIso(rejected.rejectedAt),
    };
  }
  const verified = podDocs.find((doc) => doc.status === "VERIFIED");
  if (verified) {
    return {
      status: "Verified",
      uploadedAt: formatIso(verified.uploadedAt),
      verifiedAt: formatIso(verified.verifiedAt),
      rejectedAt: formatIso(verified.rejectedAt),
    };
  }
  const uploaded = podDocs[0];
  return {
    status: "Uploaded",
    uploadedAt: formatIso(uploaded.uploadedAt),
    verifiedAt: formatIso(uploaded.verifiedAt),
    rejectedAt: formatIso(uploaded.rejectedAt),
  };
};

const deriveTrackingState = (load: any) => {
  const lastPingAt = load?.locationPings?.[0]?.capturedAt;
  const hasActiveSession = (load?.trackingSessions ?? []).some((session: any) => session.status === "ON");
  if (hasActiveSession) return "ON";
  if (lastPingAt) {
    const diffMs = Date.now() - new Date(lastPingAt).getTime();
    if (diffMs < 10 * 60 * 1000) return "ON";
  }
  return "OFF";
};

const applyChipFilter = (loads: any[], chip: string) => {
  if (!chip) return loads;
  if (chip === "archived") {
    return loads.filter((load) => load.status === "INVOICED" || load.status === "PAID");
  }
  if (chip === "active") {
    return loads.filter((load) => load.status !== "INVOICED" && load.status !== "PAID");
  }
  if (chip === "delivered-unbilled") {
    return loads.filter((load) => {
      if (load.status !== "DELIVERED") return false;
      const pod = derivePodStatus(load.docs ?? []);
      return pod.status !== "Verified";
    });
  }
  if (chip === "ready-to-invoice") {
    return loads.filter((load) => load.status === "READY_TO_INVOICE");
  }
  if (chip === "tracking-off") {
    return loads.filter((load) =>
      (load.status === "ASSIGNED" || load.status === "IN_TRANSIT") && deriveTrackingState(load) === "OFF"
    );
  }
  if (chip === "missing-pod") {
    return loads.filter((load) => load.status === "DELIVERED" && derivePodStatus(load.docs ?? []).status === "Missing");
  }
  return loads;
};

const MAX_EXPORT_ROWS = 2000;

const fetchExportCandidates = async (where: any) =>
  prisma.load.findMany({
    where,
    select: {
      id: true,
      status: true,
      createdAt: true,
      docs: { where: { type: DocType.POD }, select: { type: true, status: true, uploadedAt: true, verifiedAt: true, rejectedAt: true } },
      trackingSessions: { where: { status: "ON" }, orderBy: { startedAt: "desc" }, take: 1, select: { status: true } },
      locationPings: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

app.get("/loads/export/preview", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  try {
    const archived = parseBooleanParam(typeof req.query.archived === "string" ? req.query.archived : undefined);
    const rangeDays =
      typeof req.query.rangeDays === "string" ? Math.max(1, Math.min(365, Number(req.query.rangeDays))) : undefined;
    let fromOverride: Date | undefined;
    let toOverride: Date | undefined;
    if (rangeDays && !Number.isNaN(rangeDays)) {
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - rangeDays);
      from.setHours(0, 0, 0, 0);
      fromOverride = from;
      toOverride = now;
    }
    const { where } = buildLoadFilters(req, { archived, from: fromOverride, to: toOverride });
    const exportScope = await getUserTeamScope(req.user!);
    const teamFilterId = typeof req.query.teamId === "string" ? req.query.teamId.trim() : "";
    const effectiveScope = await applyTeamFilterOverride(req.user!.orgId, exportScope, teamFilterId || null);
    if (!effectiveScope.canSeeAllTeams) {
      await ensureTeamAssignmentsForEntityType(req.user!.orgId, TeamEntityType.LOAD, effectiveScope.defaultTeamId!);
      const scopedLoadIds = await getScopedEntityIds(req.user!.orgId, TeamEntityType.LOAD, effectiveScope);
      where.id = { in: scopedLoadIds ?? [] };
    }
    const candidates = await fetchExportCandidates(where);
    const chip = typeof req.query.chip === "string" ? req.query.chip : "";
    const filtered = applyChipFilter(candidates, chip);
    res.json({ count: filtered.length, maxRows: MAX_EXPORT_ROWS });
  } catch (error) {
    sendServerError(res, "Failed to preview export", error);
  }
});

app.get("/loads/export", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  try {
    const archived = parseBooleanParam(typeof req.query.archived === "string" ? req.query.archived : undefined);
    const rangeDays =
      typeof req.query.rangeDays === "string" ? Math.max(1, Math.min(365, Number(req.query.rangeDays))) : undefined;
    let fromOverride: Date | undefined;
    let toOverride: Date | undefined;
    if (rangeDays && !Number.isNaN(rangeDays)) {
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - rangeDays);
      from.setHours(0, 0, 0, 0);
      fromOverride = from;
      toOverride = now;
    }
    const { where } = buildLoadFilters(req, { archived, from: fromOverride, to: toOverride });
    const exportScope = await getUserTeamScope(req.user!);
    const teamFilterId = typeof req.query.teamId === "string" ? req.query.teamId.trim() : "";
    const effectiveScope = await applyTeamFilterOverride(req.user!.orgId, exportScope, teamFilterId || null);
    if (!effectiveScope.canSeeAllTeams) {
      await ensureTeamAssignmentsForEntityType(req.user!.orgId, TeamEntityType.LOAD, effectiveScope.defaultTeamId!);
      const scopedLoadIds = await getScopedEntityIds(req.user!.orgId, TeamEntityType.LOAD, effectiveScope);
      where.id = { in: scopedLoadIds ?? [] };
    }
    const candidates = await fetchExportCandidates(where);
    const chip = typeof req.query.chip === "string" ? req.query.chip : "";
    const exportFormat = typeof req.query.format === "string" ? req.query.format : "";
    const filteredCandidates = applyChipFilter(candidates, chip);
    if (filteredCandidates.length > MAX_EXPORT_ROWS) {
      res.status(413).json({
        error: "Export too large. Narrow your filters or date range.",
        count: filteredCandidates.length,
        maxRows: MAX_EXPORT_ROWS,
      });
      return;
    }

    const ids = filteredCandidates.map((load) => load.id);
    const loads = await prisma.load.findMany({
      where: { orgId: req.user!.orgId, id: { in: ids } },
      include: {
        customer: true,
        driver: true,
        truck: true,
        trailer: true,
        deletedBy: true,
        operatingEntity: true,
        stops: { orderBy: { sequence: "asc" } },
        docs: { select: { id: true, type: true, status: true, uploadedAt: true, verifiedAt: true, rejectedAt: true } },
        invoices: { orderBy: { generatedAt: "desc" } },
        SettlementItem: { include: { settlement: true } },
        trackingSessions: { where: { status: "ON" }, orderBy: { startedAt: "desc" }, take: 1, select: { status: true } },
        locationPings: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (exportFormat === "tms_load_sheet") {
      const { timeZone, warning } = await resolveOrgTimeZone(req.user!.orgId);
      const headers = [...TMS_LOAD_SHEET_HEADERS];
      const rows = [headers.map(formatCsvValue).join(",")];

      const mapLoadTypeForSheet = (loadType: LoadType) => {
        switch (loadType) {
          case LoadType.VAN:
            return "Van";
          case LoadType.REEFER:
            return "Reefer";
          case LoadType.FLATBED:
            return "Flatbed";
          case LoadType.OTHER:
            return "Other";
          case LoadType.BROKERED:
            return "Brokered";
          case LoadType.COMPANY:
          default:
            return "Company";
        }
      };

      for (const load of loads) {
        const pickup = load.stops?.find((stop: any) => stop.type === "PICKUP");
        const delivery = load.stops?.slice().reverse().find((stop: any) => stop.type === "DELIVERY");
        const pickupStart = pickup?.appointmentStart ?? pickup?.appointmentEnd ?? null;
        const pickupEnd = pickup?.appointmentEnd ?? pickup?.appointmentStart ?? null;
        const deliveryStart = delivery?.appointmentStart ?? delivery?.appointmentEnd ?? null;
        const deliveryEnd = delivery?.appointmentEnd ?? null;
        const deliveryEndDate = deliveryEnd ? formatDateForSheet(deliveryEnd, timeZone) : deliveryStart ? formatDateForSheet(deliveryStart, timeZone) : "";
        const invoice = load.invoices?.[0];
        const invoiceDate = invoice?.sentAt ?? invoice?.generatedAt ?? null;
        const rateNumber = load.rate ? Number(load.rate) : null;

        const row = [
          load.loadNumber,
          load.externalTripId ?? "",
          formatLoadStatusLabel(load.status),
          load.customer?.name ?? load.customerName ?? "",
          load.customerRef ?? "",
          load.truck?.unit ?? "",
          load.trailer?.unit ?? "",
          load.weightLbs ?? "",
          rateNumber !== null ? rateNumber.toFixed(2) : "",
          formatDateForSheet(pickupStart, timeZone),
          formatTimeForSheet(pickupStart, timeZone),
          formatTimeForSheet(pickupEnd, timeZone),
          pickup?.name ?? "",
          pickup?.city ?? "",
          pickup?.state ?? "",
          formatDateForSheet(deliveryStart, timeZone),
          formatTimeForSheet(deliveryEnd, timeZone),
          delivery?.name ?? "",
          delivery?.city ?? "",
          delivery?.state ?? "",
          load.salesRepName ?? "",
          load.dropName ?? "",
          pickup?.notes ?? load.notes ?? "",
          delivery?.notes ?? "",
          formatDateForSheet(invoiceDate, timeZone),
          deliveryEndDate,
          mapLoadTypeForSheet(load.loadType),
        ];
        rows.push(row.map(formatCsvValue).join(","));
      }

      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `loads-export-tms-load-sheet-${stamp}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      if (warning) {
        res.setHeader("X-Timezone-Warning", warning);
      }
      res.send(rows.join("\n"));
      return;
    }

    const headers = [
      "Load ID",
      "Load Number",
      "Ops Status",
      "Billing Status",
      "Customer",
      "Customer Ref",
      "BOL Number",
      "Shipper Ref",
      "Consignee Ref",
      "Pallet Count",
      "Weight (lbs)",
      "Driver",
      "Truck",
      "Trailer",
      "Operating Entity",
      "Load Type",
      "Rate",
      "Miles",
      "Created At",
      "Planned At",
      "Delivered At",
      "Shipper Name",
      "Shipper Address",
      "Shipper City",
      "Shipper State",
      "Shipper Zip",
      "Shipper Appt Start",
      "Shipper Appt End",
      "Consignee Name",
      "Consignee Address",
      "Consignee City",
      "Consignee State",
      "Consignee Zip",
      "Consignee Appt Start",
      "Consignee Appt End",
      "POD Status",
      "POD Uploaded At",
      "POD Verified At",
      "POD Rejected At",
      "Invoice Number",
      "Invoice Status",
      "Invoice Generated At",
      "Invoice Sent At",
      "Invoice Paid At",
      "Settlement Status",
    ];

    const rows = [headers.map(formatCsvValue).join(",")];

    for (const load of loads) {
      const pickup = load.stops?.find((stop: any) => stop.type === "PICKUP");
      const delivery = load.stops?.slice().reverse().find((stop: any) => stop.type === "DELIVERY");
      const pod = derivePodStatus(load.docs ?? []);
      const invoice = load.invoices?.[0];
      const settlementStatus = load.SettlementItem?.[0]?.settlement?.status ?? "";
      const billingStatus =
        load.status === "INVOICED"
          ? "INVOICED"
          : load.status === "READY_TO_INVOICE"
            ? "READY_TO_INVOICE"
            : load.status === "DELIVERED"
              ? "DOCS_NEEDED"
              : "";

      const row = [
        load.id,
        load.loadNumber,
        load.status,
        billingStatus,
        load.customer?.name ?? load.customerName ?? "",
        load.customerRef ?? "",
        load.bolNumber ?? "",
        load.shipperReferenceNumber ?? "",
        load.consigneeReferenceNumber ?? "",
        load.palletCount ?? "",
        load.weightLbs ?? "",
        load.driver?.name ?? "",
        load.truck?.unit ?? "",
        load.trailer?.unit ?? "",
        load.operatingEntity?.name ?? "",
        load.loadType ?? "",
        load.rate ?? "",
        load.miles ?? "",
        formatIso(load.createdAt),
        formatIso(load.plannedAt),
        formatIso(load.deliveredAt),
        pickup?.name ?? "",
        pickup?.address ?? "",
        pickup?.city ?? "",
        pickup?.state ?? "",
        pickup?.zip ?? "",
        formatIso(pickup?.appointmentStart),
        formatIso(pickup?.appointmentEnd),
        delivery?.name ?? "",
        delivery?.address ?? "",
        delivery?.city ?? "",
        delivery?.state ?? "",
        delivery?.zip ?? "",
        formatIso(delivery?.appointmentStart),
        formatIso(delivery?.appointmentEnd),
        pod.status,
        pod.uploadedAt,
        pod.verifiedAt,
        pod.rejectedAt,
        invoice?.invoiceNumber ?? "",
        invoice?.status ?? "",
        formatIso(invoice?.generatedAt),
        formatIso(invoice?.sentAt),
        formatIso(invoice?.paidAt),
        settlementStatus,
      ];

      rows.push(row.map(formatCsvValue).join(","));
    }

    const filename = `loads-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(rows.join("\n"));
  } catch (error) {
    sendServerError(res, "Failed to export loads", error);
  }
});

app.get("/loads/:id", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  const [loadResult, settings] = await Promise.all([
    prisma.load.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
      include: {
        customer: true,
        driver: true,
        truck: true,
        trailer: true,
        operatingEntity: true,
        stops: { orderBy: { sequence: "asc" } },
        docs: true,
        tasks: true,
        legs: { orderBy: { sequence: "asc" }, include: { driver: true, truck: true, trailer: true } },
        accessorials: {
          include: {
            createdBy: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
          },
        },
        invoices: true,
      },
    }),
    prisma.orgSettings.findFirst({
      where: { orgId: req.user!.orgId },
      select: { requiredDocs: true, requireRateConBeforeDispatch: true, ...FINANCE_POLICY_SELECT },
    }),
  ]);
  const load = loadResult;
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const billingReadiness = evaluateBillingReadinessSnapshot({
    load,
    stops: load.stops,
    docs: load.docs,
    accessorials: load.accessorials,
    invoices: load.invoices.map((invoice) => ({ status: invoice.status })),
  }, settings);
  const loadScope = await getUserTeamScope(req.user!);
  if (!loadScope.canSeeAllTeams) {
    let assignment = await prisma.teamAssignment.findFirst({
      where: { orgId: req.user!.orgId, entityType: TeamEntityType.LOAD, entityId: load.id },
    });
    if (!assignment) {
      assignment = await ensureEntityAssignedToDefaultTeam(
        req.user!.orgId,
        TeamEntityType.LOAD,
        load.id,
        loadScope.defaultTeamId!
      );
    }
    if (!loadScope.teamIds.includes(assignment.teamId)) {
      res.status(404).json({ error: "Load not found" });
      return;
    }
  }
  res.json({ load, settings, billingReadiness });
});

app.post("/loads/:id/delete", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    reason: z.string().min(3, "Reason required"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Reason required" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId, deletedAt: null },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.deletedAt) {
    res.json({ loadId: load.id, deletedAt: load.deletedAt });
    return;
  }

  const reason = parsed.data.reason.trim();
  let updatedLoad = load;
  const assignmentReset = {
    assignedDriverId: null,
    truckId: null,
    trailerId: null,
    assignedDriverAt: null,
    assignedTruckAt: null,
    assignedTrailerAt: null,
  };
  if (load.status !== LoadStatus.CANCELLED) {
    try {
      updatedLoad = (await transitionLoadStatus({
        load: { id: load.id, loadNumber: load.loadNumber, status: load.status },
        nextStatus: LoadStatus.CANCELLED,
        userId: req.user!.id,
        orgId: req.user!.orgId,
        role: req.user!.role,
        overrideReason: reason,
        data: assignmentReset,
        message: `Load ${load.loadNumber} cancelled (deleted)`,
      })) as typeof load;
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
  } else {
    updatedLoad = await prisma.load.update({
      where: { id: load.id },
      data: assignmentReset,
    });
  }

  const deletedAt = new Date();
  await prisma.load.update({
    where: { id: load.id },
    data: {
      deletedAt,
      deletedById: req.user!.id,
      deletedReason: reason,
    },
  });

  const activeLeg = await prisma.loadLeg.findFirst({
    where: { loadId: load.id, orgId: req.user!.orgId, status: LegStatus.IN_PROGRESS },
    orderBy: { sequence: "desc" },
  });
  if (activeLeg) {
    await prisma.loadLeg.update({
      where: { id: activeLeg.id },
      data: {
        driverId: null,
        truckId: null,
        trailerId: null,
      },
    });
  }

  const resetStatusIfIdle = async (asset: "driver" | "truck" | "trailer", id: string | null) => {
    if (!id) return;
    const where: Prisma.LoadWhereInput = {
      orgId: req.user!.orgId,
      deletedAt: null,
      id: { not: load.id },
      status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
    };
    if (asset === "driver") where.assignedDriverId = id;
    if (asset === "truck") where.truckId = id;
    if (asset === "trailer") where.trailerId = id;
    const other = await prisma.load.findFirst({ where, select: { id: true } });
    if (other) return;
    if (asset === "driver") {
      await prisma.driver.update({ where: { id }, data: { status: DriverStatus.AVAILABLE } });
    } else if (asset === "truck") {
      await prisma.truck.update({ where: { id }, data: { status: TruckStatus.AVAILABLE } });
    } else {
      await prisma.trailer.update({ where: { id }, data: { status: TrailerStatus.AVAILABLE } });
    }
  };

  await resetStatusIfIdle("driver", load.assignedDriverId);
  await resetStatusIfIdle("truck", load.truckId);
  await resetStatusIfIdle("trailer", load.trailerId);

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LOAD_DELETED",
    entity: "Load",
    entityId: load.id,
    summary: `Load ${load.loadNumber} deleted`,
    meta: { reason },
    before: {
      deletedAt: null,
      deletedById: null,
      deletedReason: null,
      status: load.status,
    },
    after: {
      deletedAt,
      deletedById: req.user!.id,
      deletedReason: reason,
      status: updatedLoad.status,
    },
  });

  res.json({ loadId: load.id, deletedAt });
});

app.get("/loads/:id/charges", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    select: { id: true },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const charges = await prisma.loadCharge.findMany({
    where: { loadId: req.params.id, orgId: req.user!.orgId },
    orderBy: { createdAt: "asc" },
  });
  res.json({ charges });
});

app.post(
  "/loads/:id/charges",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "DISPATCHER"),
  requirePermission(Permission.LOAD_EDIT),
  async (req, res) => {
    const schema = z.object({
      type: z.nativeEnum(LoadChargeType),
      description: z.string().trim().max(200).optional().nullable(),
      amountCents: z.number().int(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
      return;
    }
    const load = await prisma.load.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId, deletedAt: null },
      select: { id: true, loadNumber: true, customerId: true },
    });
    if (!load) {
      res.status(404).json({ error: "Load not found" });
      return;
    }
    const charge = await prisma.loadCharge.create({
      data: {
        orgId: req.user!.orgId,
        loadId: load.id,
        type: parsed.data.type,
        description: parsed.data.description ?? null,
        amountCents: parsed.data.amountCents,
      },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "LOAD_CHARGE_CREATED",
      entity: "LoadCharge",
      entityId: charge.id,
      summary: `Charge added to ${load.loadNumber}`,
      after: {
        type: charge.type,
        description: charge.description,
        amountCents: charge.amountCents,
      },
    });
    if (charge.description) {
      const baseKey = buildLearningKeyForCharge(charge.description);
      const keys = load.customerId ? [baseKey, `${load.customerId}::${baseKey}`] : [baseKey];
      await recordExample({
        orgId: req.user!.orgId,
        domain: LearningDomain.CHARGE_SUGGESTION,
        inputJson: { description: charge.description, customerId: load.customerId ?? null },
        correctedJson: { type: charge.type, amountCents: charge.amountCents },
        keys,
        valueJson: { type: charge.type, amountCents: charge.amountCents },
      });
    }
    res.json({ charge });
  }
);

app.patch(
  "/loads/:id/charges/:chargeId",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "DISPATCHER"),
  requirePermission(Permission.LOAD_EDIT),
  async (req, res) => {
    const schema = z.object({
      type: z.nativeEnum(LoadChargeType).optional(),
      description: z.string().trim().max(200).optional().nullable(),
      amountCents: z.number().int().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
      return;
    }
    const [load, charge] = await Promise.all([
      prisma.load.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId, deletedAt: null },
        select: { id: true, customerId: true },
      }),
      prisma.loadCharge.findFirst({ where: { id: req.params.chargeId, orgId: req.user!.orgId } }),
    ]);
    if (!load || !charge || charge.loadId !== load.id) {
      res.status(404).json({ error: "Charge not found" });
      return;
    }
    const updated = await prisma.loadCharge.update({
      where: { id: charge.id },
      data: {
        type: parsed.data.type ?? undefined,
        description: parsed.data.description === undefined ? undefined : parsed.data.description ?? null,
        amountCents: parsed.data.amountCents ?? undefined,
      },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "LOAD_CHARGE_UPDATED",
      entity: "LoadCharge",
      entityId: updated.id,
      summary: "Charge updated",
      before: {
        type: charge.type,
        description: charge.description,
        amountCents: charge.amountCents,
      },
      after: {
        type: updated.type,
        description: updated.description,
        amountCents: updated.amountCents,
      },
    });
    if (updated.description) {
      const baseKey = buildLearningKeyForCharge(updated.description);
      const keys = load.customerId ? [baseKey, `${load.customerId}::${baseKey}`] : [baseKey];
      await recordExample({
        orgId: req.user!.orgId,
        domain: LearningDomain.CHARGE_SUGGESTION,
        inputJson: { description: updated.description, customerId: load.customerId ?? null },
        correctedJson: { type: updated.type, amountCents: updated.amountCents },
        keys,
        valueJson: { type: updated.type, amountCents: updated.amountCents },
      });
    }
    res.json({ charge: updated });
  }
);

app.delete(
  "/loads/:id/charges/:chargeId",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "DISPATCHER"),
  requirePermission(Permission.LOAD_EDIT),
  async (req, res) => {
    const [load, charge] = await Promise.all([
      prisma.load.findFirst({ where: { id: req.params.id, orgId: req.user!.orgId, deletedAt: null }, select: { id: true } }),
      prisma.loadCharge.findFirst({ where: { id: req.params.chargeId, orgId: req.user!.orgId } }),
    ]);
    if (!load || !charge || charge.loadId !== load.id) {
      res.status(404).json({ error: "Charge not found" });
      return;
    }
    await prisma.loadCharge.delete({ where: { id: charge.id } });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "LOAD_CHARGE_DELETED",
      entity: "LoadCharge",
      entityId: charge.id,
      summary: "Charge deleted",
      before: {
        type: charge.type,
        description: charge.description,
        amountCents: charge.amountCents,
      },
    });
    res.json({ ok: true });
  }
);

app.post(
  "/loads/:id/accessorials",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"),
  async (req, res) => {
    const schema = z.object({
      type: z.nativeEnum(AccessorialType),
      amount: z.union([z.number(), z.string()]),
      currency: z.string().optional(),
      requiresProof: z.boolean().optional(),
      notes: z.string().trim().max(500).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
      return;
    }
    const load = await prisma.load.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId, deletedAt: null },
      select: { id: true, loadNumber: true },
    });
    if (!load) {
      res.status(404).json({ error: "Load not found" });
      return;
    }
    const amount = toDecimalFixed(parsed.data.amount, 2);
    if (!amount) {
      res.status(400).json({ error: "Amount required" });
      return;
    }
    const requiresProofDefault = [AccessorialType.LUMPER, AccessorialType.DETENTION].includes(parsed.data.type);
    const requiresProof = parsed.data.requiresProof ?? requiresProofDefault;
    const status = requiresProof ? AccessorialStatus.NEEDS_PROOF : AccessorialStatus.PENDING_APPROVAL;
    const accessorial = await prisma.accessorial.create({
      data: {
        orgId: req.user!.orgId,
        loadId: load.id,
        type: parsed.data.type,
        amount,
        currency: parsed.data.currency ?? "USD",
        requiresProof,
        status,
        notes: parsed.data.notes ?? null,
        createdById: req.user!.id,
      },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "ACCESSORIAL_CREATED",
      entity: "Accessorial",
      entityId: accessorial.id,
      summary: `Accessorial added to ${load.loadNumber}`,
      after: {
        type: accessorial.type,
        amount: accessorial.amount,
        status: accessorial.status,
        requiresProof: accessorial.requiresProof,
      },
    });
    await refreshFinanceAfterMutation({
      orgId: req.user!.orgId,
      loadId: load.id,
      source: "dispatch.accessorial",
      trigger: "created",
      dedupeSuffix: accessorial.id,
    });
    res.json({ accessorial });
  }
);

app.patch(
  "/accessorials/:id",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"),
  async (req, res) => {
    const schema = z.object({
      type: z.nativeEnum(AccessorialType).optional(),
      amount: z.union([z.number(), z.string()]).optional(),
      currency: z.string().optional(),
      requiresProof: z.boolean().optional(),
      notes: z.string().trim().max(500).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
      return;
    }
    const accessorial = await prisma.accessorial.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
    });
    if (!accessorial) {
      res.status(404).json({ error: "Accessorial not found" });
      return;
    }
    const amount = parsed.data.amount !== undefined ? toDecimalFixed(parsed.data.amount, 2) : undefined;
    if (parsed.data.amount !== undefined && !amount) {
      res.status(400).json({ error: "Amount required" });
      return;
    }
    let nextStatus = accessorial.status;
    if (parsed.data.requiresProof !== undefined && accessorial.status !== AccessorialStatus.APPROVED) {
      if (parsed.data.requiresProof && !accessorial.proofDocumentId) {
        nextStatus = AccessorialStatus.NEEDS_PROOF;
      } else if (!parsed.data.requiresProof && accessorial.status === AccessorialStatus.NEEDS_PROOF) {
        nextStatus = AccessorialStatus.PENDING_APPROVAL;
      }
    }
    const updated = await prisma.accessorial.update({
      where: { id: accessorial.id },
      data: {
        type: parsed.data.type ?? undefined,
        amount: amount ?? undefined,
        currency: parsed.data.currency ?? undefined,
        requiresProof: parsed.data.requiresProof ?? undefined,
        notes: parsed.data.notes === undefined ? undefined : parsed.data.notes ?? null,
        status: nextStatus,
      },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "ACCESSORIAL_UPDATED",
      entity: "Accessorial",
      entityId: updated.id,
      summary: "Accessorial updated",
      before: { status: accessorial.status, amount: accessorial.amount, requiresProof: accessorial.requiresProof },
      after: { status: updated.status, amount: updated.amount, requiresProof: updated.requiresProof },
    });
    await refreshFinanceAfterMutation({
      orgId: req.user!.orgId,
      loadId: updated.loadId,
      source: "dispatch.accessorial",
      trigger: "updated",
      dedupeSuffix: updated.id,
    });
    res.json({ accessorial: updated });
  }
);

app.post(
  "/accessorials/:id/approve",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "BILLING"),
  async (req, res) => {
    const accessorial = await prisma.accessorial.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
    });
    if (!accessorial) {
      res.status(404).json({ error: "Accessorial not found" });
      return;
    }
    if (accessorial.requiresProof && !accessorial.proofDocumentId) {
      res.status(400).json({ error: "Proof required before approval" });
      return;
    }
    const updated = await prisma.accessorial.update({
      where: { id: accessorial.id },
      data: {
        status: AccessorialStatus.APPROVED,
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "ACCESSORIAL_APPROVED",
      entity: "Accessorial",
      entityId: updated.id,
      summary: "Accessorial approved",
      before: { status: accessorial.status },
      after: { status: updated.status },
    });
    await refreshFinanceAfterMutation({
      orgId: req.user!.orgId,
      loadId: updated.loadId,
      source: "dispatch.accessorial",
      trigger: "approved",
      dedupeSuffix: updated.id,
    });
    res.json({ accessorial: updated });
  }
);

app.post(
  "/accessorials/:id/reject",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "BILLING"),
  async (req, res) => {
    const schema = z.object({ notes: z.string().trim().max(500).optional().nullable() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
      return;
    }
    const accessorial = await prisma.accessorial.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
    });
    if (!accessorial) {
      res.status(404).json({ error: "Accessorial not found" });
      return;
    }
    const updated = await prisma.accessorial.update({
      where: { id: accessorial.id },
      data: {
        status: AccessorialStatus.REJECTED,
        approvedById: req.user!.id,
        approvedAt: new Date(),
        notes: parsed.data.notes === undefined ? undefined : parsed.data.notes ?? null,
      },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "ACCESSORIAL_REJECTED",
      entity: "Accessorial",
      entityId: updated.id,
      summary: "Accessorial rejected",
      before: { status: accessorial.status },
      after: { status: updated.status },
    });
    await refreshFinanceAfterMutation({
      orgId: req.user!.orgId,
      loadId: updated.loadId,
      source: "dispatch.accessorial",
      trigger: "rejected",
      dedupeSuffix: updated.id,
    });
    res.json({ accessorial: updated });
  }
);

app.get("/loads/:id/dispatch-detail", requireAuth, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const [load, settings] = await Promise.all([
    prisma.load.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId, deletedAt: null },
      include: {
        customer: true,
        driver: true,
        truck: true,
        trailer: true,
        operatingEntity: true,
        stops: {
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            type: true,
            status: true,
            name: true,
            address: true,
            city: true,
            state: true,
            zip: true,
            appointmentStart: true,
            appointmentEnd: true,
            arrivedAt: true,
            departedAt: true,
            delayReason: true,
            delayNotes: true,
            detentionMinutes: true,
            sequence: true,
          },
        },
        legs: {
          orderBy: { sequence: "asc" },
          include: { driver: true, truck: true, trailer: true },
        },
        assignmentMembers: {
          include: { driver: { select: { id: true, name: true } } },
        },
        docs: {
          where: { type: { in: [DocType.POD, DocType.RATECON, DocType.RATE_CONFIRMATION] } },
          select: { id: true, type: true, status: true },
        },
        trackingSessions: {
          where: { status: "ON" },
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { status: true },
        },
        locationPings: {
          orderBy: { capturedAt: "desc" },
          take: 1,
          select: { capturedAt: true },
        },
      },
    }),
    prisma.orgSettings.findFirst({
      where: { orgId: req.user!.orgId },
      select: { requiredDocs: true, requireRateConBeforeDispatch: true },
    }),
  ]);
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const loadScope = await getUserTeamScope(req.user!);
  if (!loadScope.canSeeAllTeams) {
    let assignment = await prisma.teamAssignment.findFirst({
      where: { orgId: req.user!.orgId, entityType: TeamEntityType.LOAD, entityId: load.id },
    });
    if (!assignment) {
      assignment = await ensureEntityAssignedToDefaultTeam(
        req.user!.orgId,
        TeamEntityType.LOAD,
        load.id,
        loadScope.defaultTeamId!
      );
    }
    if (!loadScope.teamIds.includes(assignment.teamId)) {
      res.status(404).json({ error: "Load not found" });
      return;
    }
  }
  res.json({ load, settings });
});

app.get("/loads/:id/timeline", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    include: { customer: true },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const [events, tasks, docs, invoices, settlementItems] = await Promise.all([
    prisma.event.findMany({
      where: { loadId: load.id, orgId: req.user!.orgId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.task.findMany({
      where: { loadId: load.id, orgId: req.user!.orgId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.document.findMany({
      where: { loadId: load.id, orgId: req.user!.orgId },
      orderBy: { uploadedAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { loadId: load.id, orgId: req.user!.orgId },
      orderBy: { generatedAt: "desc" },
    }),
    prisma.settlementItem.findMany({
      where: { loadId: load.id, settlement: { orgId: req.user!.orgId } },
      include: { settlement: true },
    }),
  ]);

  const items: Array<{ id: string; type: string; message: string; time: Date; refId?: string }> = [];
  for (const event of events) {
    items.push({ id: event.id, type: `EVENT_${event.type}`, message: event.message, time: event.createdAt, refId: event.id });
  }
  for (const doc of docs) {
    items.push({
      id: doc.id,
      type: `DOC_${doc.status}`,
      message: `${doc.type} ${doc.status.toLowerCase()}`,
      time: doc.uploadedAt,
      refId: doc.id,
    });
    if (doc.verifiedAt) {
      items.push({
        id: `${doc.id}-verified`,
        type: "DOC_VERIFIED",
        message: `${doc.type} verified`,
        time: doc.verifiedAt,
        refId: doc.id,
      });
    }
    if (doc.rejectedAt) {
      items.push({
        id: `${doc.id}-rejected`,
        type: "DOC_REJECTED",
        message: `${doc.type} rejected`,
        time: doc.rejectedAt,
        refId: doc.id,
      });
    }
  }
  for (const task of tasks) {
    items.push({
      id: task.id,
      type: `TASK_${task.status}`,
      message: task.title,
      time: task.createdAt,
      refId: task.id,
    });
    if (task.completedAt) {
      items.push({
        id: `${task.id}-done`,
        type: "TASK_DONE",
        message: `Completed: ${task.title}`,
        time: task.completedAt,
        refId: task.id,
      });
    }
  }
  for (const invoice of invoices) {
    items.push({
      id: invoice.id,
      type: "INVOICE_GENERATED",
      message: `Invoice ${invoice.invoiceNumber} generated`,
      time: invoice.generatedAt,
      refId: invoice.id,
    });
    if (invoice.sentAt) {
      items.push({
        id: `${invoice.id}-sent`,
        type: "INVOICE_SENT",
        message: `Invoice ${invoice.invoiceNumber} sent`,
        time: invoice.sentAt,
        refId: invoice.id,
      });
    }
    if (invoice.paidAt) {
      items.push({
        id: `${invoice.id}-paid`,
        type: `INVOICE_${invoice.status}`,
        message: `Invoice ${invoice.invoiceNumber} ${invoice.status.toLowerCase()}`,
        time: invoice.paidAt,
        refId: invoice.id,
      });
    }
    if (invoice.disputeReason) {
      items.push({
        id: `${invoice.id}-disputed`,
        type: "INVOICE_DISPUTED",
        message: `Invoice ${invoice.invoiceNumber} disputed`,
        time: invoice.sentAt ?? invoice.generatedAt,
        refId: invoice.id,
      });
    }
  }
  for (const item of settlementItems) {
    const settlement = item.settlement;
    items.push({
      id: item.id,
      type: `SETTLEMENT_${settlement.status}`,
      message: `Settlement ${settlement.status.toLowerCase()}`,
      time: settlement.paidAt ?? settlement.finalizedAt ?? settlement.createdAt,
      refId: settlement.id,
    });
  }

  items.sort((a, b) => b.time.getTime() - a.time.getTime());
  res.json({ load, timeline: items });
});

app.post(
  ["/load-confirmations/upload", "/api/load-confirmations/upload"],
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "DISPATCHER"),
  upload.array("files", 12),
  async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }
    const docs = [];
    for (const file of files) {
      const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
      const existing = await prisma.loadConfirmationDocument.findFirst({
        where: {
          orgId: req.user!.orgId,
          sha256,
          status: { in: [LoadConfirmationStatus.CREATED, LoadConfirmationStatus.READY_TO_CREATE] },
        },
      });
      if (existing) {
        docs.push(existing);
        continue;
      }

      const pending = await prisma.loadConfirmationDocument.create({
        data: {
          orgId: req.user!.orgId,
          uploadedByUserId: req.user!.id,
          filename: file.originalname || "load-confirmation",
          contentType: file.mimetype,
          sizeBytes: file.size,
          storageKey: "pending",
          sha256,
          status: LoadConfirmationStatus.UPLOADED,
        },
      });
      const saved = await saveLoadConfirmationFile(file, req.user!.orgId, pending.id);
      const doc = await prisma.loadConfirmationDocument.update({
        where: { id: pending.id },
        data: { filename: saved.filename, storageKey: saved.storageKey },
      });
      await prisma.loadConfirmationExtractEvent.create({
        data: {
          orgId: req.user!.orgId,
          docId: doc.id,
          type: "UPLOADED",
          message: "Load confirmation uploaded",
        },
      });
      await logAudit({
        orgId: req.user!.orgId,
        userId: req.user!.id,
        action: "LOAD_CONFIRMATION_UPLOADED",
        entity: "LoadConfirmationDocument",
        entityId: doc.id,
        summary: `Uploaded load confirmation ${doc.filename}`,
        meta: { sha256 },
      });
      docs.push(doc);
    }
    res.json({ docs });
  }
);

app.get(
  ["/load-confirmations", "/api/load-confirmations"],
  requireAuth,
  requireRole("ADMIN", "DISPATCHER", "BILLING"),
  async (req, res) => {
    const statusParam = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const status = Object.values(LoadConfirmationStatus).includes(statusParam as LoadConfirmationStatus)
      ? (statusParam as LoadConfirmationStatus)
      : undefined;
    const docs = await prisma.loadConfirmationDocument.findMany({
      where: { orgId: req.user!.orgId, status },
      orderBy: { createdAt: "desc" },
    });
    res.json({ docs });
  }
);

app.get(
  ["/load-confirmations/:id", "/api/load-confirmations/:id"],
  requireAuth,
  requireRole("ADMIN", "DISPATCHER", "BILLING"),
  async (req, res) => {
    const doc = await prisma.loadConfirmationDocument.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
      include: { createdLoad: true, uploadedBy: true },
    });
    if (!doc) {
      res.status(404).json({ error: "Load confirmation not found" });
      return;
    }
    res.json({ doc });
  }
);

app.get(
  ["/load-confirmations/:id/file", "/api/load-confirmations/:id/file"],
  requireAuth,
  requireRole("ADMIN", "DISPATCHER", "BILLING"),
  async (req, res) => {
    const doc = await prisma.loadConfirmationDocument.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
    });
    if (!doc) {
      res.status(404).json({ error: "Load confirmation not found" });
      return;
    }
    let filePath: string;
    try {
      filePath = resolveUploadPath(doc.storageKey);
    } catch {
      res.status(400).json({ error: "Invalid file path" });
      return;
    }
    if (doc.contentType) {
      res.setHeader("Content-Type", doc.contentType);
    }
    // Allow the web app to embed the document preview iframe.
    if (allowedOrigins.length > 0) {
      res.removeHeader("X-Frame-Options");
      res.setHeader("Content-Security-Policy", `frame-ancestors 'self' ${allowedOrigins.join(" ")}`);
    }
    res.sendFile(filePath);
  }
);

app.patch(
  ["/load-confirmations/:id/draft", "/api/load-confirmations/:id/draft"],
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "DISPATCHER"),
  async (req, res) => {
    const rawDraft = req.body?.draft ?? req.body;
    const existing = await prisma.loadConfirmationDocument.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
    });
    if (!existing) {
      res.status(404).json({ error: "Load confirmation not found" });
      return;
    }
    let normalizedDraft: DraftLoad;
    try {
      normalizedDraft = normalizeLoadDraft(rawDraft);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    const ready = isDraftReady(normalizedDraft);
    const doc = await prisma.loadConfirmationDocument.update({
      where: { id: existing.id },
      data: {
        normalizedDraft,
        status: ready ? LoadConfirmationStatus.READY_TO_CREATE : LoadConfirmationStatus.NEEDS_REVIEW,
        errorMessage: ready ? null : "Review required",
      },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "LOAD_CONFIRMATION_DRAFT_EDITED",
      entity: "LoadConfirmationDocument",
      entityId: doc.id,
      summary: `Draft updated for ${doc.filename}`,
      meta: { ready },
    });
    res.json({ doc, ready });
  }
);

app.post(
  ["/load-confirmations/:id/create-load", "/api/load-confirmations/:id/create-load"],
  requireAuth,
  requireOperationalOrg,
  requireCsrf,
  requireRole("ADMIN", "DISPATCHER"),
  requirePermission(Permission.LOAD_CREATE),
  async (req, res) => {
    const doc = await prisma.loadConfirmationDocument.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
    });
    if (!doc) {
      res.status(404).json({ error: "Load confirmation not found" });
      return;
    }
    if (doc.status === LoadConfirmationStatus.CREATED && doc.createdLoadId) {
      res.json({ loadId: doc.createdLoadId });
      return;
    }
    if (!doc.normalizedDraft) {
      res.status(400).json({ error: "Draft missing" });
      return;
    }
    let draft: DraftLoad;
    try {
      draft = normalizeLoadDraft(doc.normalizedDraft);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    if (!isDraftReady(draft)) {
      res.status(400).json({ error: "Draft is incomplete" });
      return;
    }

    const manualLoadNumber = draft.loadNumber?.trim() || null;
    if (manualLoadNumber) {
      const existing = await prisma.load.findFirst({
        where: { orgId: req.user!.orgId, loadNumber: manualLoadNumber },
        select: { id: true },
      });
      if (existing) {
        const sequence = await getOrgSequence(req.user!.orgId);
        const suggestedLoadNumber = `${sequence.loadPrefix}${sequence.nextLoadNumber}`;
        res.status(409).json({
          error: `Load number already exists. Next available is ${suggestedLoadNumber}.`,
          suggestedLoadNumber,
        });
        return;
      }
    }

    const shipperName = draft.stops.find((stop) => stop.type === "PICKUP")?.name || "Unknown";
    const customerName = draft.customerName ?? shipperName;
    const [customerRecord] = await prisma.customer.findMany({
      where: { orgId: req.user!.orgId, name: customerName },
      take: 1,
    });
    const customerId = customerRecord
      ? customerRecord.id
      : (
          await prisma.customer.create({
            data: { orgId: req.user!.orgId, name: customerName },
          })
        ).id;

    const toDate = (value?: string | null) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const [operatingEntity, settingsForMode] = await Promise.all([
      ensureDefaultOperatingEntity(req.user!.orgId),
      prisma.orgSettings.findFirst({
        where: { orgId: req.user!.orgId },
        select: { operatingMode: true },
      }),
    ]);
    const truck = draft.truckUnit
      ? await prisma.truck.findFirst({ where: { orgId: req.user!.orgId, unit: draft.truckUnit } })
      : null;
    const trailer = draft.trailerUnit
      ? await prisma.trailer.findFirst({ where: { orgId: req.user!.orgId, unit: draft.trailerUnit } })
      : null;
    const statusMapped = draft.status ? mapExternalLoadStatus(draft.status).status : LoadStatus.PLANNED;
    const businessType =
      settingsForMode?.operatingMode === "BROKER"
        ? "BROKER"
        : "COMPANY";
    const loadType = mapLoadTypeForInput(draft.loadType);

    const pickupStop = draft.stops.find((stop) => stop.type === "PICKUP") ?? draft.stops[0];
    const deliveryStop =
      draft.stops.slice().reverse().find((stop) => stop.type === "DELIVERY") ?? draft.stops[draft.stops.length - 1];
    let miles = draft.miles ?? null;
    if (miles === null) {
      miles = await suggestMilesForRoute({
        orgId: req.user!.orgId,
        pickup: pickupStop,
        delivery: deliveryStop,
      });
    }

    let assignedLoadNumber = manualLoadNumber;
    let assignedTripNumber: string | null = null;
    if (!assignedLoadNumber) {
      const allocated = await allocateLoadAndTripNumbers(req.user!.orgId);
      assignedLoadNumber = allocated.loadNumber;
      assignedTripNumber = allocated.tripNumber;
    }

    const load = await prisma.$transaction(async (tx) => {
      const created = await tx.load.create({
        data: {
          orgId: req.user!.orgId,
          loadNumber: assignedLoadNumber!,
          tripNumber: assignedTripNumber,
          status: statusMapped,
          loadType,
          businessType,
          operatingEntityId: operatingEntity.id,
          customerId,
          customerName,
          customerRef: draft.customerRef,
          externalTripId: draft.externalTripId,
          truckId: truck?.id ?? null,
          trailerId: trailer?.id ?? null,
          shipperReferenceNumber: draft.shipperReferenceNumber,
          consigneeReferenceNumber: draft.consigneeReferenceNumber,
          palletCount: draft.palletCount,
          weightLbs: draft.weightLbs,
          rate: toDecimal(draft.rate),
          salesRepName: draft.salesRepName,
          dropName: draft.dropName,
          desiredInvoiceDate: toDate(draft.desiredInvoiceDate),
          miles: miles ?? undefined,
          createdById: req.user!.id,
          stops: {
            create: draft.stops.map((stop, index) => ({
              orgId: req.user!.orgId,
              type: stop.type,
              name: stop.name,
              address: stop.address1,
              city: stop.city,
              state: stop.state,
              zip: stop.zip,
              notes: stop.notes ?? null,
              appointmentStart: toDate(stop.apptStart),
              appointmentEnd: toDate(stop.apptEnd),
              sequence: index + 1,
            })),
          },
        },
      });
      await tx.loadConfirmationDocument.update({
        where: { id: doc.id },
        data: {
          status: LoadConfirmationStatus.CREATED,
          createdLoadId: created.id,
          errorMessage: null,
        },
      });
      return created;
    });

    await createEvent({
      orgId: req.user!.orgId,
      loadId: load.id,
      userId: req.user!.id,
      type: EventType.LOAD_CREATED,
      message: `Load ${load.loadNumber} created from confirmation`,
      meta: { loadConfirmationId: doc.id },
    });

    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "LOAD_CONFIRMATION_CREATED",
      entity: "LoadConfirmationDocument",
      entityId: doc.id,
      summary: `Created load ${load.loadNumber} from confirmation`,
      meta: { loadId: load.id },
    });

    for (const stop of draft.stops ?? []) {
      if (!stop.address1 || !stop.city || !stop.state || !stop.zip) continue;
      const rawAddressString = `${stop.address1}, ${stop.city}, ${stop.state} ${stop.zip}`.trim();
      await recordExample({
        orgId: req.user!.orgId,
        domain: LearningDomain.MATCH_ADDRESS,
        inputJson: { rawAddressString },
        correctedJson: {
          normalized: {
            street: stop.address1,
            city: stop.city,
            state: stop.state,
            zip: stop.zip,
          },
        },
        contextJson: { stopType: stop.type, stopName: stop.name },
        keys: [buildLearningKeyForAddress(rawAddressString)],
        valueJson: {
          normalized: {
            street: stop.address1,
            city: stop.city,
            state: stop.state,
            zip: stop.zip,
          },
        },
      });
      const nameDomain =
        stop.type === "PICKUP"
          ? LearningDomain.MATCH_SHIPPER
          : stop.type === "DELIVERY"
            ? LearningDomain.MATCH_CONSIGNEE
            : null;
      if (nameDomain && stop.name) {
        await recordExample({
          orgId: req.user!.orgId,
          domain: nameDomain,
          inputJson: { rawName: stop.name },
          correctedJson: {
            address: stop.address1,
            city: stop.city,
            state: stop.state,
            zip: stop.zip,
          },
          contextJson: { stopType: stop.type },
          keys: [buildLearningKeyForStopName(stop.name)],
          valueJson: {
            address: stop.address1,
            city: stop.city,
            state: stop.state,
            zip: stop.zip,
          },
        });
      }
    }

    await recordLearningExample({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      doc: {
        id: doc.id,
        sha256: doc.sha256,
        extractedText: doc.extractedText,
        extractedDraft: doc.extractedDraft as DraftLoad | null,
        normalizedDraft: doc.normalizedDraft as DraftLoad | null,
        extractedJson: doc.extractedJson,
      },
    });

    res.json({ loadId: load.id });
  }
);

app.post("/loads/:id/legs", requireAuth, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const schema = z.object({
    type: z.enum(["PICKUP", "LINEHAUL", "DELIVERY"]),
    startStopSequence: z.number().optional(),
    endStopSequence: z.number().optional(),
    driverId: z.string().optional(),
    truckId: z.string().optional(),
    trailerId: z.string().optional(),
    setActive: z.boolean().optional(),
    overrideReason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId, deletedAt: null },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const [driverCheck, truckCheck, trailerCheck] = await Promise.all([
    parsed.data.driverId
      ? prisma.driver.findFirst({ where: { id: parsed.data.driverId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.truckId
      ? prisma.truck.findFirst({ where: { id: parsed.data.truckId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.trailerId
      ? prisma.trailer.findFirst({ where: { id: parsed.data.trailerId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
  ]);
  if ((parsed.data.driverId && !driverCheck) || (parsed.data.truckId && !truckCheck) || (parsed.data.trailerId && !trailerCheck)) {
    res.status(400).json({ error: "Invalid asset assignment" });
    return;
  }
  if (parsed.data.setActive && parsed.data.driverId) {
    const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
    if (settings?.requireRateConBeforeDispatch && load.loadType === LoadType.BROKERED) {
      const hasRateCon = await prisma.document.findFirst({
        where: { orgId: req.user!.orgId, loadId: load.id, type: { in: [DocType.RATECON, DocType.RATE_CONFIRMATION] } },
        select: { id: true },
      });
      if (!hasRateCon && (req.user!.role !== "ADMIN" || !parsed.data.overrideReason)) {
        res.status(400).json({ error: "Rate confirmation required before dispatch", missingDocs: ["RATECON"] });
        return;
      }
    }
  }
  const sequence = await prisma.loadLeg
    .aggregate({ where: { loadId: load.id, orgId: req.user!.orgId }, _max: { sequence: true } })
    .then((result) => (result._max.sequence ?? 0) + 1);

  const leg = await prisma.loadLeg.create({
    data: {
      orgId: req.user!.orgId,
      loadId: load.id,
      sequence,
      type: parsed.data.type as LegType,
      status: parsed.data.setActive ? LegStatus.IN_PROGRESS : LegStatus.PLANNED,
      startStopSequence: parsed.data.startStopSequence,
      endStopSequence: parsed.data.endStopSequence,
      driverId: parsed.data.driverId ?? null,
      truckId: parsed.data.truckId ?? null,
      trailerId: parsed.data.trailerId ?? null,
    },
    include: { driver: true, truck: true, trailer: true },
  });

  if (parsed.data.setActive && parsed.data.driverId) {
    try {
      await applyLoadAssignment({
        load,
        driverId: parsed.data.driverId,
        truckId: parsed.data.truckId ?? null,
        trailerId: parsed.data.trailerId ?? null,
        orgId: req.user!.orgId,
        userId: req.user!.id,
        role: req.user!.role as Role,
        overrideReason: parsed.data.overrideReason,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
  }

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LEG_CREATED",
    entity: "LoadLeg",
    entityId: leg.id,
    summary: `Created ${leg.type} leg for ${load.loadNumber}`,
  });

  res.json({ leg });
});

app.post("/legs/:id/assign", requireAuth, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const schema = z.object({
    driverId: z.string().optional(),
    truckId: z.string().optional(),
    trailerId: z.string().optional(),
    setActive: z.boolean().optional(),
    overrideReason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const [driverCheck, truckCheck, trailerCheck] = await Promise.all([
    parsed.data.driverId
      ? prisma.driver.findFirst({ where: { id: parsed.data.driverId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.truckId
      ? prisma.truck.findFirst({ where: { id: parsed.data.truckId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.trailerId
      ? prisma.trailer.findFirst({ where: { id: parsed.data.trailerId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
  ]);
  if ((parsed.data.driverId && !driverCheck) || (parsed.data.truckId && !truckCheck) || (parsed.data.trailerId && !trailerCheck)) {
    res.status(400).json({ error: "Invalid asset assignment" });
    return;
  }
  const leg = await prisma.loadLeg.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    include: { load: true },
  });
  if (!leg) {
    res.status(404).json({ error: "Leg not found" });
    return;
  }
  if (parsed.data.setActive && parsed.data.driverId) {
    const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
    if (settings?.requireRateConBeforeDispatch && leg.load?.loadType === LoadType.BROKERED) {
      const hasRateCon = await prisma.document.findFirst({
        where: {
          orgId: req.user!.orgId,
          loadId: leg.loadId,
          type: { in: [DocType.RATECON, DocType.RATE_CONFIRMATION] },
        },
        select: { id: true },
      });
      if (!hasRateCon && (req.user!.role !== "ADMIN" || !parsed.data.overrideReason)) {
        res.status(400).json({ error: "Rate confirmation required before dispatch", missingDocs: ["RATECON"] });
        return;
      }
    }
  }
  const updated = await prisma.loadLeg.update({
    where: { id: leg.id },
    data: {
      driverId: parsed.data.driverId ?? null,
      truckId: parsed.data.truckId ?? null,
      trailerId: parsed.data.trailerId ?? null,
      status: parsed.data.setActive ? LegStatus.IN_PROGRESS : undefined,
    },
    include: { driver: true, truck: true, trailer: true },
  });

  if (parsed.data.setActive && parsed.data.driverId) {
    try {
      await applyLoadAssignment({
        load: leg.load,
        driverId: parsed.data.driverId,
        truckId: parsed.data.truckId ?? null,
        trailerId: parsed.data.trailerId ?? null,
        orgId: req.user!.orgId,
        userId: req.user!.id,
        role: req.user!.role as Role,
        overrideReason: parsed.data.overrideReason,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
  }

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LEG_ASSIGNED",
    entity: "LoadLeg",
    entityId: updated.id,
    summary: `Assigned assets for ${updated.type} leg on ${leg.load.loadNumber}`,
  });

  res.json({ leg: updated });
});

app.post("/legs/:id/status", requireAuth, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const schema = z.object({
    status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETE"]),
    overrideReason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const leg = await prisma.loadLeg.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    include: { load: true },
  });
  if (!leg) {
    res.status(404).json({ error: "Leg not found" });
    return;
  }
  if (parsed.data.status === "IN_PROGRESS" && leg.driverId) {
    const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
    if (settings?.requireRateConBeforeDispatch && leg.load?.loadType === LoadType.BROKERED) {
      const hasRateCon = await prisma.document.findFirst({
        where: {
          orgId: req.user!.orgId,
          loadId: leg.loadId,
          type: { in: [DocType.RATECON, DocType.RATE_CONFIRMATION] },
        },
        select: { id: true },
      });
      if (!hasRateCon && (req.user!.role !== "ADMIN" || !parsed.data.overrideReason)) {
        res.status(400).json({ error: "Rate confirmation required before dispatch", missingDocs: ["RATECON"] });
        return;
      }
    }
  }
  const updated = await prisma.loadLeg.update({
    where: { id: leg.id },
    data: { status: parsed.data.status as LegStatus },
    include: { driver: true, truck: true, trailer: true },
  });

  if (parsed.data.status === "IN_PROGRESS" && leg.driverId) {
    try {
      await applyLoadAssignment({
        load: leg.load,
        driverId: leg.driverId,
        truckId: leg.truckId ?? null,
        trailerId: leg.trailerId ?? null,
        orgId: req.user!.orgId,
        userId: req.user!.id,
        role: req.user!.role as Role,
        overrideReason: parsed.data.overrideReason,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
  }

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LEG_STATUS",
    entity: "LoadLeg",
    entityId: updated.id,
    summary: `Set ${updated.type} leg to ${updated.status} on ${leg.load.loadNumber}`,
  });

  res.json({ leg: updated });
});

app.get("/manifests", requireAuth, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const manifests = await prisma.trailerManifest.findMany({
    where: { orgId: req.user!.orgId },
    include: {
      trailer: true,
      truck: true,
      driver: true,
      items: { include: { load: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ manifests });
});

app.post("/manifests", requireAuth, requireCsrf, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const schema = z.object({
    trailerId: z.string(),
    truckId: z.string().optional(),
    driverId: z.string().optional(),
    origin: z.string().optional(),
    destination: z.string().optional(),
    plannedDepartureAt: z.string().optional(),
    plannedArrivalAt: z.string().optional(),
    loadNumbers: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const loadNumbers = parsed.data.loadNumbers?.map((value) => value.trim()).filter(Boolean) ?? [];
  const loads = loadNumbers.length
    ? await prisma.load.findMany({
        where: { orgId: req.user!.orgId, loadNumber: { in: loadNumbers } },
      })
    : [];
  const loadMap = new Map(loads.map((load) => [load.loadNumber, load]));
  const missingLoadNumbers = loadNumbers.filter((num) => !loadMap.has(num));

  const manifest = await prisma.trailerManifest.create({
    data: {
      orgId: req.user!.orgId,
      trailerId: parsed.data.trailerId,
      truckId: parsed.data.truckId ?? null,
      driverId: parsed.data.driverId ?? null,
      origin: parsed.data.origin,
      destination: parsed.data.destination,
      plannedDepartureAt: parsed.data.plannedDepartureAt ? new Date(parsed.data.plannedDepartureAt) : null,
      plannedArrivalAt: parsed.data.plannedArrivalAt ? new Date(parsed.data.plannedArrivalAt) : null,
      items: {
        create: loads.map((load) => ({ loadId: load.id })),
      },
    },
    include: {
      trailer: true,
      truck: true,
      driver: true,
      items: { include: { load: true } },
    },
  });

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "MANIFEST_CREATED",
    entity: "TrailerManifest",
    entityId: manifest.id,
    summary: `Created manifest ${manifest.id} with ${manifest.items.length} loads`,
  });

  res.json({ manifest, missingLoadNumbers });
});

app.post("/manifests/:id/status", requireAuth, requireCsrf, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const schema = z.object({
    status: z.enum(["PLANNED", "LOADED", "IN_TRANSIT", "ARRIVED", "UNLOADED", "COMPLETE"]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const current = await prisma.trailerManifest.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!current) {
    res.status(404).json({ error: "Manifest not found" });
    return;
  }
  const manifest = await prisma.trailerManifest.update({
    where: { id: current.id },
    data: { status: parsed.data.status as ManifestStatus },
    include: {
      trailer: true,
      truck: true,
      driver: true,
      items: { include: { load: true } },
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "MANIFEST_STATUS",
    entity: "TrailerManifest",
    entityId: manifest.id,
    summary: `Set manifest ${manifest.id} to ${manifest.status}`,
  });
  res.json({ manifest });
});

app.post("/manifests/:id/items", requireAuth, requireCsrf, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const schema = z.object({
    loadNumbers: z.array(z.string()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const loadNumbers = parsed.data.loadNumbers.map((value) => value.trim()).filter(Boolean);
  const loads = await prisma.load.findMany({
    where: { orgId: req.user!.orgId, loadNumber: { in: loadNumbers } },
  });
  const loadMap = new Map(loads.map((load) => [load.loadNumber, load]));
  const missingLoadNumbers = loadNumbers.filter((num) => !loadMap.has(num));

  const manifestCheck = await prisma.trailerManifest.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!manifestCheck) {
    res.status(404).json({ error: "Manifest not found" });
    return;
  }
  const items = await prisma.trailerManifestItem.findMany({
    where: { manifestId: manifestCheck.id },
    select: { loadId: true },
  });
  const existing = new Set(items.map((item) => item.loadId));

  await prisma.trailerManifestItem.createMany({
    data: loads
      .filter((load) => !existing.has(load.id))
      .map((load) => ({ manifestId: manifestCheck.id, loadId: load.id })),
    skipDuplicates: true,
  });

  const manifest = await prisma.trailerManifest.findFirst({
    where: { id: manifestCheck.id, orgId: req.user!.orgId },
    include: {
      trailer: true,
      truck: true,
      driver: true,
      items: { include: { load: true } },
    },
  });

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "MANIFEST_ITEMS",
    entity: "TrailerManifest",
    entityId: req.params.id,
    summary: `Added ${loads.length} loads to manifest`,
  });

  res.json({ manifest, missingLoadNumbers });
});

app.delete("/manifests/:id/items/:loadId", requireAuth, requireCsrf, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const manifestCheck = await prisma.trailerManifest.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!manifestCheck) {
    res.status(404).json({ error: "Manifest not found" });
    return;
  }
  await prisma.trailerManifestItem.deleteMany({
    where: { manifestId: manifestCheck.id, loadId: req.params.loadId },
  });
  const manifest = await prisma.trailerManifest.findFirst({
    where: { id: manifestCheck.id, orgId: req.user!.orgId },
    include: {
      trailer: true,
      truck: true,
      driver: true,
      items: { include: { load: true } },
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "MANIFEST_ITEMS",
    entity: "TrailerManifest",
    entityId: req.params.id,
    summary: `Removed load ${req.params.loadId} from manifest`,
  });
  res.json({ manifest });
});

app.post("/loads", requireAuth, requireOperationalOrg, requireCsrf, requirePermission(Permission.LOAD_CREATE), async (req, res) => {
  const schema = z.object({
    loadNumber: z.string().trim().min(2).optional(),
    tripNumber: z.string().trim().min(2).optional(),
    loadType: z.enum(["COMPANY", "BROKERED", "VAN", "REEFER", "FLATBED", "OTHER"]).optional(),
    businessType: z.enum(["COMPANY", "BROKER"]).optional(),
    status: z.string().optional(),
    operatingEntityId: z.string().optional(),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    customerRef: z.string().optional(),
    externalTripId: z.string().optional(),
    salesRepName: z.string().optional(),
    dropName: z.string().optional(),
    desiredInvoiceDate: z.string().optional(),
    truckUnit: z.string().optional(),
    trailerUnit: z.string().optional(),
    bolNumber: z.string().optional(),
    shipperReferenceNumber: z.string().max(64).optional(),
    consigneeReferenceNumber: z.string().max(64).optional(),
    palletCount: z.union([z.number(), z.string()]).optional(),
    weightLbs: z.union([z.number(), z.string()]).optional(),
    rate: z.union([z.number(), z.string()]).optional(),
    miles: z.number().optional(),
    stops: z
      .array(
        z.object({
          type: z.enum(["PICKUP", "YARD", "DELIVERY"]),
          name: z.string(),
          address: z.string(),
          city: z.string(),
          state: z.string(),
          zip: z.string(),
          notes: z.string().optional(),
          appointmentStart: z.string().optional(),
          appointmentEnd: z.string().optional(),
          sequence: z.number(),
        })
      )
      .min(2),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  if (!parsed.data.customerId && !parsed.data.customerName) {
    res.status(400).json({ error: "Customer required" });
    return;
  }

  const loadType = mapLoadTypeForInput(parsed.data.loadType ?? null);
  const settingsForMode = await prisma.orgSettings.findFirst({
    where: { orgId: req.user!.orgId },
    select: { operatingMode: true },
  });
  const businessType =
    parsed.data.businessType ??
    (settingsForMode?.operatingMode === "BROKER"
      ? "BROKER"
      : "COMPANY");
  const statusMapped = parsed.data.status ? mapExternalLoadStatus(parsed.data.status).status : LoadStatus.PLANNED;
  const operatingEntity = parsed.data.operatingEntityId
    ? await prisma.operatingEntity.findFirst({
        where: { id: parsed.data.operatingEntityId, orgId: req.user!.orgId },
      })
    : await ensureDefaultOperatingEntity(req.user!.orgId);
  if (!operatingEntity) {
    res.status(400).json({ error: "Operating entity not found" });
    return;
  }

  let customerId = parsed.data.customerId ?? null;
  let customerName = parsed.data.customerName?.trim() ?? null;
  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, orgId: req.user!.orgId },
    });
    if (!customer) {
      res.status(400).json({ error: "Customer not found" });
      return;
    }
    if (!customerName) {
      customerName = customer.name;
    }
  }
  if (!customerId && customerName) {
    const existing = await prisma.customer.findFirst({
      where: { orgId: req.user!.orgId, name: customerName },
    });
    const created =
      existing ??
      (await prisma.customer.create({
        data: { orgId: req.user!.orgId, name: customerName },
      }));
    customerId = created.id;
  }

  const truck = parsed.data.truckUnit
    ? await prisma.truck.findFirst({ where: { orgId: req.user!.orgId, unit: parsed.data.truckUnit } })
    : null;
  const trailer = parsed.data.trailerUnit
    ? await prisma.trailer.findFirst({ where: { orgId: req.user!.orgId, unit: parsed.data.trailerUnit } })
    : null;

  const manualLoadNumber = parsed.data.loadNumber?.trim() || null;
  const manualTripNumber = parsed.data.tripNumber?.trim() || null;
  if (manualLoadNumber) {
    const existing = await prisma.load.findFirst({
      where: { orgId: req.user!.orgId, loadNumber: manualLoadNumber },
      select: { id: true },
    });
    if (existing) {
      const sequence = await getOrgSequence(req.user!.orgId);
      const suggestedLoadNumber = `${sequence.loadPrefix}${sequence.nextLoadNumber}`;
      res.status(409).json({
        error: `Load number already exists. Next available is ${suggestedLoadNumber}.`,
        suggestedLoadNumber,
      });
      return;
    }
  }

  let assignedLoadNumber = manualLoadNumber;
  let assignedTripNumber = manualTripNumber;
  if (!assignedLoadNumber) {
    const allocated = await allocateLoadAndTripNumbers(req.user!.orgId);
    assignedLoadNumber = allocated.loadNumber;
    assignedTripNumber = allocated.tripNumber;
  }

  let shipperReferenceNumber: string | null = null;
  let consigneeReferenceNumber: string | null = null;
  let palletCount: number | null = null;
  let weightLbs: number | null = null;
  try {
    shipperReferenceNumber = normalizeReference(parsed.data.shipperReferenceNumber ?? null);
    consigneeReferenceNumber = normalizeReference(parsed.data.consigneeReferenceNumber ?? null);
    palletCount = parseOptionalNonNegativeInt(parsed.data.palletCount, "Pallet count");
    weightLbs = parseOptionalNonNegativeInt(parsed.data.weightLbs, "Weight (lbs)");
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }

  const pickupStop = parsed.data.stops.find((stop) => stop.type === "PICKUP") ?? parsed.data.stops[0];
  const deliveryStop =
    parsed.data.stops
      .slice()
      .reverse()
      .find((stop) => stop.type === "DELIVERY") ?? parsed.data.stops[parsed.data.stops.length - 1];
  let miles = parsed.data.miles;
  if (miles === undefined) {
    miles =
      (await suggestMilesForRoute({
        orgId: req.user!.orgId,
        pickup: pickupStop,
        delivery: deliveryStop,
      })) ?? undefined;
  }

  const load = await prisma.load.create({
    data: {
      orgId: req.user!.orgId,
      loadNumber: assignedLoadNumber!,
      tripNumber: assignedTripNumber,
      status: statusMapped,
      completedAt: isCompletedStatus(statusMapped) ? new Date() : null,
      loadType,
      businessType,
      operatingEntityId: operatingEntity.id,
      customerId,
      customerName,
      customerRef: parsed.data.customerRef ?? null,
      externalTripId: parsed.data.externalTripId ?? null,
      salesRepName: parsed.data.salesRepName ?? null,
      dropName: parsed.data.dropName ?? null,
      desiredInvoiceDate: parsed.data.desiredInvoiceDate ? new Date(parsed.data.desiredInvoiceDate) : null,
      truckId: truck?.id ?? null,
      trailerId: trailer?.id ?? null,
      bolNumber: parsed.data.bolNumber ?? null,
      shipperReferenceNumber,
      consigneeReferenceNumber,
      palletCount,
      weightLbs,
      rate: toDecimal(parsed.data.rate),
      miles,
      createdById: req.user!.id,
      stops: {
        create: parsed.data.stops.map((stop) => ({
          orgId: req.user!.orgId,
          type: stop.type,
          name: stop.name,
          address: stop.address,
          city: stop.city,
          state: stop.state,
          zip: stop.zip,
          notes: stop.notes ?? null,
          appointmentStart: stop.appointmentStart ? new Date(stop.appointmentStart) : null,
          appointmentEnd: stop.appointmentEnd ? new Date(stop.appointmentEnd) : null,
          sequence: stop.sequence,
        })),
      },
    },
  });

  await createEvent({
    orgId: req.user!.orgId,
    loadId: load.id,
    userId: req.user!.id,
    type: EventType.LOAD_CREATED,
    message: `Load ${load.loadNumber} created`,
  });

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LOAD_CREATED",
    entity: "Load",
    entityId: load.id,
    summary: `Created load ${load.loadNumber}`,
  });

  if (customerId && customerName) {
    const rawCustomerName = parsed.data.customerName?.trim() || customerName;
    const emailDomain = extractEmailDomain(rawCustomerName);
    await recordExample({
      orgId: req.user!.orgId,
      domain: LearningDomain.MATCH_CUSTOMER,
      inputJson: { rawCustomerName, emailDomain },
      correctedJson: { customerId },
      keys: buildLearningKeysForCustomer(rawCustomerName, emailDomain),
      valueJson: { customerId },
    });
  }

  for (const stop of parsed.data.stops) {
    if (!stop.address || !stop.city || !stop.state || !stop.zip) continue;
    const rawAddressString = `${stop.address}, ${stop.city}, ${stop.state} ${stop.zip}`.trim();
    await recordExample({
      orgId: req.user!.orgId,
      domain: LearningDomain.MATCH_ADDRESS,
      inputJson: { rawAddressString },
      correctedJson: {
        normalized: {
          street: stop.address,
          city: stop.city,
          state: stop.state,
          zip: stop.zip,
        },
      },
      contextJson: { stopType: stop.type, stopName: stop.name },
      keys: [buildLearningKeyForAddress(rawAddressString)],
      valueJson: {
        normalized: {
          street: stop.address,
          city: stop.city,
          state: stop.state,
          zip: stop.zip,
        },
      },
    });
    const nameDomain =
      stop.type === "PICKUP"
        ? LearningDomain.MATCH_SHIPPER
        : stop.type === "DELIVERY"
          ? LearningDomain.MATCH_CONSIGNEE
          : null;
    if (nameDomain && stop.name) {
      await recordExample({
        orgId: req.user!.orgId,
        domain: nameDomain,
        inputJson: { rawName: stop.name },
        correctedJson: {
          address: stop.address,
          city: stop.city,
          state: stop.state,
          zip: stop.zip,
        },
        contextJson: { stopType: stop.type },
        keys: [buildLearningKeyForStopName(stop.name)],
        valueJson: {
          address: stop.address,
          city: stop.city,
          state: stop.state,
          zip: stop.zip,
        },
      });
    }
  }

  res.json({ load });
});

app.put("/loads/:id", requireAuth, requireCsrf, requirePermission(Permission.LOAD_EDIT), async (req, res) => {
  const schema = z.object({
    customerId: z.string().optional(),
    customerName: z.string().min(2).optional(),
    customerRef: z.string().optional(),
    bolNumber: z.string().optional(),
    loadType: z.enum(["COMPANY", "BROKERED", "VAN", "REEFER", "FLATBED", "OTHER"]).optional(),
    operatingEntityId: z.string().optional(),
    shipperReferenceNumber: z.string().max(64).optional(),
    consigneeReferenceNumber: z.string().max(64).optional(),
    palletCount: z.union([z.number(), z.string()]).optional(),
    weightLbs: z.union([z.number(), z.string()]).optional(),
    rate: z.union([z.number(), z.string()]).optional(),
    miles: z.number().optional(),
    status: z
      .enum([
        "DRAFT",
        "PLANNED",
        "ASSIGNED",
        "IN_TRANSIT",
        "DELIVERED",
        "POD_RECEIVED",
        "READY_TO_INVOICE",
        "INVOICED",
        "PAID",
        "CANCELLED",
      ])
      .optional(),
    overrideReason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const existing = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId, deletedAt: null },
    include: { customer: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (parsed.data.rate !== undefined && !hasPermission(req.user, Permission.RATE_EDIT)) {
    res.status(403).json({ error: "Missing permission to edit rate" });
    return;
  }
  const lockedFieldsChanged: string[] = [];
  if (parsed.data.rate !== undefined) lockedFieldsChanged.push("rate");
  if (parsed.data.customerId !== undefined || parsed.data.customerName !== undefined) lockedFieldsChanged.push("customer");
  if (parsed.data.customerRef !== undefined) lockedFieldsChanged.push("customerRef");
  if (parsed.data.bolNumber !== undefined) lockedFieldsChanged.push("bolNumber");
  if (parsed.data.loadType !== undefined) lockedFieldsChanged.push("loadType");
  if (parsed.data.operatingEntityId !== undefined) lockedFieldsChanged.push("operatingEntityId");
  if (parsed.data.shipperReferenceNumber !== undefined) lockedFieldsChanged.push("shipperReferenceNumber");
  if (parsed.data.consigneeReferenceNumber !== undefined) lockedFieldsChanged.push("consigneeReferenceNumber");
  if (parsed.data.palletCount !== undefined) lockedFieldsChanged.push("palletCount");
  if (parsed.data.weightLbs !== undefined) lockedFieldsChanged.push("weightLbs");
  if (parsed.data.miles !== undefined) lockedFieldsChanged.push("miles");
  const attemptingLockedEdit = existing.lockedAt && lockedFieldsChanged.length > 0;
  if (attemptingLockedEdit && req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "Load is locked" });
    return;
  }
  if (attemptingLockedEdit && req.user!.role === "ADMIN" && !parsed.data.overrideReason) {
    res.status(400).json({ error: "overrideReason required for locked loads" });
    return;
  }

  let customerId = parsed.data.customerId ?? null;
  let customerName = parsed.data.customerName ?? null;
  if (parsed.data.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: parsed.data.customerId, orgId: req.user!.orgId },
    });
    if (!customer) {
      res.status(400).json({ error: "Customer not found" });
      return;
    }
    customerName = customer.name;
  }
  if (!customerId && customerName) {
    const existingCustomer = await prisma.customer.findFirst({
      where: { orgId: req.user!.orgId, name: customerName },
    });
    const created =
      existingCustomer ??
      (await prisma.customer.create({
        data: { orgId: req.user!.orgId, name: customerName },
      }));
    customerId = created.id;
  }
  if (!customerId && !customerName) {
    customerId = existing.customerId ?? null;
    customerName = existing.customerName ?? null;
  }

  let operatingEntityId: string | undefined = undefined;
  if (parsed.data.operatingEntityId !== undefined) {
    const entity = await prisma.operatingEntity.findFirst({
      where: { id: parsed.data.operatingEntityId, orgId: req.user!.orgId },
    });
    if (!entity) {
      res.status(400).json({ error: "Operating entity not found" });
      return;
    }
    operatingEntityId = entity.id;
  }

  let shipperReferenceNumber: string | null | undefined = undefined;
  let consigneeReferenceNumber: string | null | undefined = undefined;
  let palletCount: number | null | undefined = undefined;
  let weightLbs: number | null | undefined = undefined;
  try {
    if (parsed.data.shipperReferenceNumber !== undefined) {
      shipperReferenceNumber = normalizeReference(parsed.data.shipperReferenceNumber ?? null);
    }
    if (parsed.data.consigneeReferenceNumber !== undefined) {
      consigneeReferenceNumber = normalizeReference(parsed.data.consigneeReferenceNumber ?? null);
    }
    if (parsed.data.palletCount !== undefined) {
      palletCount = parseOptionalNonNegativeInt(parsed.data.palletCount, "Pallet count");
    }
    if (parsed.data.weightLbs !== undefined) {
      weightLbs = parseOptionalNonNegativeInt(parsed.data.weightLbs, "Weight (lbs)");
    }
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }

  const statusRequested = parsed.data.status;
  const statusChanged = statusRequested !== undefined && statusRequested !== existing.status;
  let statusResult = { overridden: false };
  if (statusChanged) {
    try {
      statusResult = assertLoadStatusTransition({
        current: existing.status,
        next: statusRequested as LoadStatus,
        isAdmin: req.user!.role === "ADMIN",
        overrideReason: parsed.data.overrideReason,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
  }
  const completedAtUpdate =
    statusChanged && statusRequested
      ? resolveCompletedAtUpdate({
          current: existing.status,
          next: statusRequested as LoadStatus,
          existing: existing.completedAt ?? null,
        })
      : undefined;

  const load = await prisma.load.update({
    where: { id: existing.id },
    data: {
      customerId,
      customerName,
      customerRef: parsed.data.customerRef ?? existing.customerRef ?? null,
      bolNumber: parsed.data.bolNumber ?? existing.bolNumber ?? null,
      loadType: parsed.data.loadType ?? existing.loadType,
      operatingEntityId: operatingEntityId ?? existing.operatingEntityId,
      shipperReferenceNumber:
        shipperReferenceNumber !== undefined ? shipperReferenceNumber : existing.shipperReferenceNumber ?? null,
      consigneeReferenceNumber:
        consigneeReferenceNumber !== undefined ? consigneeReferenceNumber : existing.consigneeReferenceNumber ?? null,
      palletCount: palletCount !== undefined ? palletCount : existing.palletCount ?? null,
      weightLbs: weightLbs !== undefined ? weightLbs : existing.weightLbs ?? null,
      rate: parsed.data.rate !== undefined ? toDecimal(parsed.data.rate) : undefined,
      miles: parsed.data.miles,
      status: statusRequested,
      completedAt: completedAtUpdate !== undefined ? completedAtUpdate : undefined,
    },
  });
  await logLoadFieldAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    before: existing,
    after: load,
  });
  if (statusChanged) {
    await createEvent({
      orgId: req.user!.orgId,
      loadId: load.id,
      userId: req.user!.id,
      type: EventType.LOAD_STATUS_UPDATED,
      message: `Load ${load.loadNumber} status ${existing.status} -> ${load.status}`,
      meta: { overrideReason: parsed.data.overrideReason ?? null, overridden: statusResult.overridden },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "LOAD_STATUS",
      entity: "Load",
      entityId: load.id,
      summary: `Load ${load.loadNumber} status ${existing.status} -> ${load.status}`,
      meta: { overrideReason: parsed.data.overrideReason ?? null, overridden: statusResult.overridden },
      before: { status: existing.status },
      after: { status: load.status },
    });
  }
  if (attemptingLockedEdit && req.user!.role === "ADMIN") {
    await createEvent({
      orgId: req.user!.orgId,
      loadId: load.id,
      userId: req.user!.id,
      type: EventType.DRIVER_NOTE,
      message: "Admin override on locked load",
      meta: { overrideReason: parsed.data.overrideReason, fields: lockedFieldsChanged },
    });
  }

  if ((parsed.data.customerId || parsed.data.customerName) && customerId && customerName) {
    const rawCustomerName = parsed.data.customerName?.trim() || customerName;
    const emailDomain = extractEmailDomain(rawCustomerName);
    await recordExample({
      orgId: req.user!.orgId,
      domain: LearningDomain.MATCH_CUSTOMER,
      inputJson: { rawCustomerName, emailDomain },
      correctedJson: { customerId },
      keys: buildLearningKeysForCustomer(rawCustomerName, emailDomain),
      valueJson: { customerId },
    });
  }
  res.json({ load });
});

app.get("/loads/:id/assignment-suggestions", requireAuth, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const limitRaw = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : NaN;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 5;
  const includeTrucks = req.query.includeTrucks !== "false";
  const explain = req.query.explain !== "false";

  const suggestions = await buildAssignmentSuggestions({
    user: req.user,
    loadId: req.params.id,
    limit,
    includeTrucks,
    explain,
  });

  if (!suggestions) {
    res.status(404).json({ error: "Load not found" });
    return;
  }

  res.json(suggestions);
});

app.post(
  "/loads/:id/assignment-suggestions/log",
  requireAuth,
  requireCsrf,
  requirePermission(Permission.LOAD_ASSIGN),
  async (req, res) => {
    const parsed = parseSuggestionLogPayload(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    const load = await prisma.load.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
      select: { id: true },
    });
    if (!load) {
      res.status(404).json({ error: "Load not found" });
      return;
    }

    const scope = await getUserTeamScope(req.user);
    if (!scope.canSeeAllTeams) {
      let assignment = await prisma.teamAssignment.findFirst({
        where: { orgId: req.user!.orgId, entityType: TeamEntityType.LOAD, entityId: load.id },
      });
      if (!assignment && scope.defaultTeamId) {
        assignment = await ensureEntityAssignedToDefaultTeam(
          req.user!.orgId,
          TeamEntityType.LOAD,
          load.id,
          scope.defaultTeamId
        );
      }
      if (assignment && !scope.teamIds.includes(assignment.teamId)) {
        res.status(404).json({ error: "Load not found" });
        return;
      }
    }

    if (parsed.data.logId) {
      const existing = await prisma.assignmentSuggestionLog.findFirst({
        where: { id: parsed.data.logId, orgId: req.user!.orgId },
        select: { id: true },
      });
      if (!existing) {
        res.status(404).json({ error: "Suggestion log not found" });
        return;
      }
      await prisma.assignmentSuggestionLog.update({
        where: { id: existing.id },
        data: {
          chosenDriverId: parsed.data.chosenDriverId ?? undefined,
          chosenTruckId: parsed.data.chosenTruckId ?? undefined,
          overrideReason: parsed.data.overrideReason ?? undefined,
          overrideNotes: parsed.data.overrideNotes ?? undefined,
        },
      });
      res.json({ logId: existing.id });
      return;
    }

    const created = await prisma.assignmentSuggestionLog.create({
      data: {
        orgId: req.user!.orgId,
        loadId: load.id,
        dispatcherUserId: req.user!.id,
        modelVersion: parsed.data.modelVersion ?? ASSIST_MODEL_VERSION,
        weightsVersion: parsed.data.weightsVersion ?? ASSIST_WEIGHTS_VERSION,
        suggestionsJson: parsed.data.suggestions ?? [],
        chosenDriverId: parsed.data.chosenDriverId ?? null,
        chosenTruckId: parsed.data.chosenTruckId ?? null,
        overrideReason: parsed.data.overrideReason ?? null,
        overrideNotes: parsed.data.overrideNotes ?? null,
      },
    });
    res.json({ logId: created.id });
  }
);

app.post("/loads/:id/assign", requireAuth, requireOperationalOrg, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const schema = z.object({
    primaryDriverId: z.string().optional(),
    coDriverId: z.string().optional().nullable(),
    driverId: z.string().optional(),
    truckId: z.string().optional(),
    trailerId: z.string().optional(),
    overrideReason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const primaryDriverId = parsed.data.primaryDriverId ?? parsed.data.driverId ?? "";
  const coDriverId =
    parsed.data.coDriverId && parsed.data.coDriverId.trim() ? parsed.data.coDriverId.trim() : null;
  const validation = validateAssignmentDrivers(primaryDriverId, coDriverId);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }
  const assignmentPlan = buildAssignmentPlan({ primaryDriverId, coDriverId });
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    select: {
      id: true,
      loadNumber: true,
      loadType: true,
      status: true,
      assignedDriverId: true,
      truckId: true,
      trailerId: true,
      assignedDriverAt: true,
      assignedTruckAt: true,
      assignedTrailerAt: true,
    },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const existingMembers = await prisma.loadAssignmentMember.findMany({
    where: { loadId: load.id },
  });
  const existingPrimaryId =
    existingMembers.find((member) => member.role === LoadAssignmentRole.PRIMARY)?.driverId ??
    load.assignedDriverId ??
    null;
  const existingCoId =
    existingMembers.find((member) => member.role === LoadAssignmentRole.CO_DRIVER)?.driverId ?? null;

  const [driverCheck, coDriverCheck, truckCheck, trailerCheck, settings] = await Promise.all([
    prisma.driver.findFirst({ where: { id: primaryDriverId, orgId: req.user!.orgId } }),
    coDriverId
      ? prisma.driver.findFirst({ where: { id: coDriverId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.truckId
      ? prisma.truck.findFirst({ where: { id: parsed.data.truckId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.trailerId
      ? prisma.trailer.findFirst({ where: { id: parsed.data.trailerId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } }),
  ]);
  if (!driverCheck || (coDriverId && !coDriverCheck) || (parsed.data.truckId && !truckCheck) || (parsed.data.trailerId && !trailerCheck)) {
    res.status(400).json({ error: "Invalid asset assignment" });
    return;
  }

  if (settings?.requireRateConBeforeDispatch && load.loadType === LoadType.BROKERED) {
    const hasRateCon = await prisma.document.findFirst({
      where: { orgId: req.user!.orgId, loadId: load.id, type: { in: [DocType.RATECON, DocType.RATE_CONFIRMATION] } },
      select: { id: true },
    });
    if (!hasRateCon) {
      if (req.user!.role !== "ADMIN" || !parsed.data.overrideReason) {
        res.status(400).json({ error: "Rate confirmation required before dispatch", missingDocs: ["RATECON"] });
        return;
      }
    }
  }

  const availabilityIssues: string[] = [];
  if (driverCheck.status !== DriverStatus.AVAILABLE && load.assignedDriverId !== driverCheck.id) {
    availabilityIssues.push(`Driver status ${driverCheck.status}`);
  }
  if (coDriverCheck && coDriverCheck.status !== DriverStatus.AVAILABLE && existingCoId !== coDriverCheck.id) {
    availabilityIssues.push(`Co-driver status ${coDriverCheck.status}`);
  }
  if (truckCheck && truckCheck.status !== TruckStatus.AVAILABLE && load.truckId !== truckCheck.id) {
    availabilityIssues.push(`Truck status ${truckCheck.status}`);
  }
  if (trailerCheck && trailerCheck.status !== TrailerStatus.AVAILABLE && load.trailerId !== trailerCheck.id) {
    availabilityIssues.push(`Trailer status ${trailerCheck.status}`);
  }
  if (availabilityIssues.length > 0) {
    if (req.user!.role !== "ADMIN" || !parsed.data.overrideReason) {
      res.status(400).json({ error: availabilityIssues.join("; ") });
      return;
    }
  }

  let statusResult = { overridden: false };
  if (load.status !== LoadStatus.ASSIGNED) {
    try {
      statusResult = assertLoadStatusTransition({
        current: load.status,
        next: LoadStatus.ASSIGNED,
        isAdmin: req.user!.role === "ADMIN",
        overrideReason: parsed.data.overrideReason,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
  }

  const now = new Date();
  const assignedDriverAt =
    assignmentPlan.assignedDriverId !== load.assignedDriverId ? now : load.assignedDriverAt ?? null;
  const assignedTruckAt =
    parsed.data.truckId !== load.truckId ? (parsed.data.truckId ? now : null) : load.assignedTruckAt ?? null;
  const assignedTrailerAt =
    parsed.data.trailerId !== load.trailerId ? (parsed.data.trailerId ? now : null) : load.assignedTrailerAt ?? null;
  const nextStatus = load.status === LoadStatus.ASSIGNED ? load.status : LoadStatus.ASSIGNED;
  const completedAtUpdate = resolveCompletedAtUpdate({
    current: load.status,
    next: nextStatus,
    existing: load.completedAt ?? null,
  });

  const updated = await prisma.load.update({
    where: { id: load.id },
    data: {
      assignedDriverId: assignmentPlan.assignedDriverId,
      truckId: parsed.data.truckId ?? null,
      trailerId: parsed.data.trailerId ?? null,
      assignedDriverAt,
      assignedTruckAt,
      assignedTrailerAt,
      status: load.status === LoadStatus.ASSIGNED ? undefined : LoadStatus.ASSIGNED,
      completedAt: completedAtUpdate !== undefined ? completedAtUpdate : undefined,
    },
  });

  await prisma.loadAssignmentMember.upsert({
    where: { loadId_role: { loadId: updated.id, role: LoadAssignmentRole.PRIMARY } },
    update: { driverId: assignmentPlan.primaryDriverId },
    create: { loadId: updated.id, driverId: assignmentPlan.primaryDriverId, role: LoadAssignmentRole.PRIMARY },
  });
  if (assignmentPlan.coDriverId) {
    await prisma.loadAssignmentMember.upsert({
      where: { loadId_role: { loadId: updated.id, role: LoadAssignmentRole.CO_DRIVER } },
      update: { driverId: assignmentPlan.coDriverId },
      create: { loadId: updated.id, driverId: assignmentPlan.coDriverId, role: LoadAssignmentRole.CO_DRIVER },
    });
  } else {
    await prisma.loadAssignmentMember.deleteMany({
      where: { loadId: updated.id, role: LoadAssignmentRole.CO_DRIVER },
    });
  }

  const activeLeg = await prisma.loadLeg.findFirst({
    where: { loadId: updated.id, orgId: req.user!.orgId, status: LegStatus.IN_PROGRESS },
    orderBy: { sequence: "desc" },
  });
  if (activeLeg) {
    await prisma.loadLeg.update({
      where: { id: activeLeg.id },
      data: {
        driverId: assignmentPlan.primaryDriverId,
        truckId: parsed.data.truckId ?? null,
        trailerId: parsed.data.trailerId ?? null,
      },
    });
  }

  const resetStatusIfIdle = async (asset: "driver" | "truck" | "trailer", id: string | null) => {
    if (!id) return;
    const where: Prisma.LoadWhereInput = {
      orgId: req.user!.orgId,
      deletedAt: null,
      id: { not: load.id },
      status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
    };
    if (asset === "driver") where.assignedDriverId = id;
    if (asset === "truck") where.truckId = id;
    if (asset === "trailer") where.trailerId = id;
    const other = await prisma.load.findFirst({ where, select: { id: true } });
    if (other) return;
    if (asset === "driver") {
      await prisma.driver.update({ where: { id }, data: { status: DriverStatus.AVAILABLE } });
    } else if (asset === "truck") {
      await prisma.truck.update({ where: { id }, data: { status: TruckStatus.AVAILABLE } });
    } else {
      await prisma.trailer.update({ where: { id }, data: { status: TrailerStatus.AVAILABLE } });
    }
  };

  const resetDriverIfIdle = async (driverId: string | null) => {
    if (!driverId) return;
    const otherPrimary = await prisma.load.findFirst({
      where: {
        orgId: req.user!.orgId,
        id: { not: load.id },
        assignedDriverId: driverId,
        status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
      },
      select: { id: true },
    });
    const otherMember = await prisma.loadAssignmentMember.findFirst({
      where: {
        driverId,
        loadId: { not: load.id },
        load: {
          orgId: req.user!.orgId,
          status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
        },
      },
      select: { id: true },
    });
    if (!otherPrimary && !otherMember) {
      await prisma.driver.update({ where: { id: driverId }, data: { status: DriverStatus.AVAILABLE } });
    }
  };

  if (existingPrimaryId && existingPrimaryId !== primaryDriverId) {
    await resetDriverIfIdle(existingPrimaryId);
  }
  if (existingCoId && existingCoId !== assignmentPlan.coDriverId) {
    await resetDriverIfIdle(existingCoId);
  }
  if (load.truckId && load.truckId !== (parsed.data.truckId ?? null)) {
    await resetStatusIfIdle("truck", load.truckId);
  }
  if (load.trailerId && load.trailerId !== (parsed.data.trailerId ?? null)) {
    await resetStatusIfIdle("trailer", load.trailerId);
  }

  await Promise.all([
    prisma.driver.update({ where: { id: driverCheck.id }, data: { status: DriverStatus.ON_LOAD } }),
    assignmentPlan.coDriverId
      ? prisma.driver.update({ where: { id: assignmentPlan.coDriverId }, data: { status: DriverStatus.ON_LOAD } })
      : Promise.resolve(null),
    parsed.data.truckId ? prisma.truck.update({ where: { id: parsed.data.truckId }, data: { status: TruckStatus.ASSIGNED } }) : Promise.resolve(null),
    parsed.data.trailerId
      ? prisma.trailer.update({ where: { id: parsed.data.trailerId }, data: { status: TrailerStatus.ASSIGNED } })
      : Promise.resolve(null),
  ]);

  if (load.status !== updated.status) {
    await createEvent({
      orgId: req.user!.orgId,
      loadId: updated.id,
      userId: req.user!.id,
      type: EventType.LOAD_STATUS_UPDATED,
      message: `Load ${updated.loadNumber} status ${load.status} -> ${updated.status}`,
      meta: { overrideReason: parsed.data.overrideReason ?? null, overridden: statusResult.overridden },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "LOAD_STATUS",
      entity: "Load",
      entityId: updated.id,
      summary: `Load ${updated.loadNumber} status ${load.status} -> ${updated.status}`,
      meta: { overrideReason: parsed.data.overrideReason ?? null, overridden: statusResult.overridden },
      before: { status: load.status },
      after: { status: updated.status },
    });
  }

  await createEvent({
    orgId: req.user!.orgId,
    loadId: updated.id,
    userId: req.user!.id,
    type: EventType.LOAD_ASSIGNED,
    message: `Load ${updated.loadNumber} assigned`,
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LOAD_ASSIGNED",
    entity: "Load",
    entityId: updated.id,
    summary: `Assigned load ${updated.loadNumber}`,
    meta: { overrideReason: parsed.data.overrideReason ?? null },
    before: { assignedDriverId: load.assignedDriverId, truckId: load.truckId, trailerId: load.trailerId },
    after: {
      assignedDriverId: updated.assignedDriverId,
      truckId: updated.truckId,
      trailerId: updated.trailerId,
    },
  });
  const members = await prisma.loadAssignmentMember.findMany({
    where: { loadId: updated.id },
    include: { driver: { select: { id: true, name: true } } },
  });
  res.json({ load: updated, assignmentMembers: members });
});

app.post("/loads/:id/unassign", requireAuth, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const existingMembers = await prisma.loadAssignmentMember.findMany({
    where: { loadId: load.id },
  });
  const existingPrimaryId =
    existingMembers.find((member) => member.role === LoadAssignmentRole.PRIMARY)?.driverId ??
    load.assignedDriverId ??
    null;
  const existingCoId =
    existingMembers.find((member) => member.role === LoadAssignmentRole.CO_DRIVER)?.driverId ?? null;
  let statusResult = { overridden: false };
  if (load.status === LoadStatus.ASSIGNED) {
    try {
      statusResult = assertLoadStatusTransition({
        current: load.status,
        next: LoadStatus.PLANNED,
        isAdmin: req.user!.role === "ADMIN",
        overrideReason: null,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
  }
  const nextStatus = load.status === LoadStatus.ASSIGNED ? LoadStatus.PLANNED : load.status;
  const completedAtUpdate = resolveCompletedAtUpdate({
    current: load.status,
    next: nextStatus,
    existing: load.completedAt ?? null,
  });
  const updated = await prisma.load.update({
    where: { id: load.id },
    data: {
      assignedDriverId: null,
      truckId: null,
      trailerId: null,
      assignedDriverAt: null,
      assignedTruckAt: null,
      assignedTrailerAt: null,
      status: load.status === LoadStatus.ASSIGNED ? LoadStatus.PLANNED : load.status,
      completedAt: completedAtUpdate !== undefined ? completedAtUpdate : undefined,
    },
  });
  await prisma.loadAssignmentMember.deleteMany({ where: { loadId: load.id } });
  const activeLeg = await prisma.loadLeg.findFirst({
    where: { loadId: load.id, orgId: req.user!.orgId, status: LegStatus.IN_PROGRESS },
    orderBy: { sequence: "desc" },
  });
  if (activeLeg) {
    await prisma.loadLeg.update({
      where: { id: activeLeg.id },
      data: {
        driverId: null,
        truckId: null,
        trailerId: null,
      },
    });
  }
  const resetStatusIfIdle = async (asset: "driver" | "truck" | "trailer", id: string | null) => {
    if (!id) return;
    const where: Prisma.LoadWhereInput = {
      orgId: req.user!.orgId,
      id: { not: load.id },
      status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
    };
    if (asset === "driver") where.assignedDriverId = id;
    if (asset === "truck") where.truckId = id;
    if (asset === "trailer") where.trailerId = id;
    const other = await prisma.load.findFirst({ where, select: { id: true } });
    if (other) return;
    if (asset === "driver") {
      await prisma.driver.update({ where: { id }, data: { status: DriverStatus.AVAILABLE } });
    } else if (asset === "truck") {
      await prisma.truck.update({ where: { id }, data: { status: TruckStatus.AVAILABLE } });
    } else {
      await prisma.trailer.update({ where: { id }, data: { status: TrailerStatus.AVAILABLE } });
    }
  };

  const resetDriverIfIdle = async (driverId: string | null) => {
    if (!driverId) return;
    const otherPrimary = await prisma.load.findFirst({
      where: {
        orgId: req.user!.orgId,
        id: { not: load.id },
        assignedDriverId: driverId,
        status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
      },
      select: { id: true },
    });
    const otherMember = await prisma.loadAssignmentMember.findFirst({
      where: {
        driverId,
        loadId: { not: load.id },
        load: {
          orgId: req.user!.orgId,
          status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
        },
      },
      select: { id: true },
    });
    if (!otherPrimary && !otherMember) {
      await prisma.driver.update({ where: { id: driverId }, data: { status: DriverStatus.AVAILABLE } });
    }
  };

  await resetDriverIfIdle(existingPrimaryId);
  await resetDriverIfIdle(existingCoId);
  await resetStatusIfIdle("truck", load.truckId);
  await resetStatusIfIdle("trailer", load.trailerId);

  if (load.status !== updated.status) {
    await createEvent({
      orgId: req.user!.orgId,
      loadId: updated.id,
      userId: req.user!.id,
      type: EventType.LOAD_STATUS_UPDATED,
      message: `Load ${updated.loadNumber} status ${load.status} -> ${updated.status}`,
      meta: { overridden: statusResult.overridden },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "LOAD_STATUS",
      entity: "Load",
      entityId: updated.id,
      summary: `Load ${updated.loadNumber} status ${load.status} -> ${updated.status}`,
      meta: { overridden: statusResult.overridden },
      before: { status: load.status },
      after: { status: updated.status },
    });
  }

  await createEvent({
    orgId: req.user!.orgId,
    loadId: updated.id,
    userId: req.user!.id,
    type: EventType.LOAD_ASSIGNED,
    message: `Load ${updated.loadNumber} unassigned`,
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LOAD_UNASSIGNED",
    entity: "Load",
    entityId: updated.id,
    summary: `Unassigned load ${updated.loadNumber}`,
    before: { assignedDriverId: load.assignedDriverId, truckId: load.truckId, trailerId: load.trailerId },
    after: { assignedDriverId: null, truckId: null, trailerId: null },
  });
  res.json({ load: updated });
});

app.post("/stops/:id/delay", requireAuth, requireCsrf, requirePermission(Permission.STOP_EDIT), async (req, res) => {
  const schema = z.object({
    delayReason: z.enum(["SHIPPER_DELAY", "RECEIVER_DELAY", "TRAFFIC", "WEATHER", "BREAKDOWN", "OTHER"]).optional(),
    delayNotes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const stop = await prisma.stop.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!stop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }
  const updated = await prisma.stop.update({
    where: { id: stop.id },
    data: {
      delayReason: parsed.data.delayReason ?? null,
      delayNotes: parsed.data.delayNotes ?? null,
    },
  });
  await createEvent({
    orgId: req.user!.orgId,
    loadId: stop.loadId,
    stopId: stop.id,
    userId: req.user!.id,
    type: EventType.DRIVER_NOTE,
    message: "Stop delay updated",
    meta: { delayReason: parsed.data.delayReason, delayNotes: parsed.data.delayNotes },
  });
  res.json({ stop: updated });
});

app.get("/assets/drivers", requireAuth, requirePermission(Permission.LOAD_ASSIGN, Permission.SETTLEMENT_GENERATE), async (req, res) => {
  const scope = await getUserTeamScope(req.user!);
  const where: Prisma.DriverWhereInput = { orgId: req.user!.orgId, archivedAt: null };
  if (!scope.canSeeAllTeams) {
    await ensureTeamAssignmentsForEntityType(req.user!.orgId, TeamEntityType.DRIVER, scope.defaultTeamId!);
    const scopedIds = await getScopedEntityIds(req.user!.orgId, TeamEntityType.DRIVER, scope);
    where.id = { in: scopedIds ?? [] };
  }
  const drivers = await prisma.driver.findMany({ where });
  res.json({ drivers });
});

app.get("/assets/trucks", requireAuth, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const scope = await getUserTeamScope(req.user!);
  const where: Prisma.TruckWhereInput = { orgId: req.user!.orgId };
  if (!scope.canSeeAllTeams) {
    await ensureTeamAssignmentsForEntityType(req.user!.orgId, TeamEntityType.TRUCK, scope.defaultTeamId!);
    const scopedIds = await getScopedEntityIds(req.user!.orgId, TeamEntityType.TRUCK, scope);
    where.id = { in: scopedIds ?? [] };
  }
  const trucks = await prisma.truck.findMany({ where });
  res.json({ trucks });
});

app.get("/assets/trailers", requireAuth, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const scope = await getUserTeamScope(req.user!);
  const where: Prisma.TrailerWhereInput = { orgId: req.user!.orgId };
  if (!scope.canSeeAllTeams) {
    await ensureTeamAssignmentsForEntityType(req.user!.orgId, TeamEntityType.TRAILER, scope.defaultTeamId!);
    const scopedIds = await getScopedEntityIds(req.user!.orgId, TeamEntityType.TRAILER, scope);
    where.id = { in: scopedIds ?? [] };
  }
  const trailers = await prisma.trailer.findMany({ where });
  res.json({ trailers });
});

app.get("/operating-entities", requireAuth, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const entities = await prisma.operatingEntity.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  res.json({ entities });
});

app.get("/dispatch/availability", requireAuth, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const loadId = typeof req.query.loadId === "string" ? req.query.loadId : "";
  if (!loadId) {
    res.status(400).json({ error: "loadId required" });
    return;
  }

  const load = await prisma.load.findFirst({
    where: { id: loadId, orgId: req.user!.orgId },
    include: { stops: { select: { appointmentStart: true, appointmentEnd: true } } },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const dispatchScopeBase = await getUserTeamScope(req.user!);
  const teamFilterId = typeof req.query.teamId === "string" ? req.query.teamId.trim() : "";
  const dispatchScope = await applyTeamFilterOverride(req.user!.orgId, dispatchScopeBase, teamFilterId || null);
  if (!dispatchScope.canSeeAllTeams) {
    await ensureTeamAssignmentsForEntityType(req.user!.orgId, TeamEntityType.LOAD, dispatchScope.defaultTeamId!);
    let assignment = await prisma.teamAssignment.findFirst({
      where: { orgId: req.user!.orgId, entityType: TeamEntityType.LOAD, entityId: load.id },
    });
    if (!assignment) {
      assignment = await ensureEntityAssignedToDefaultTeam(
        req.user!.orgId,
        TeamEntityType.LOAD,
        load.id,
        dispatchScope.defaultTeamId!
      );
    }
    if (!dispatchScope.teamIds.includes(assignment.teamId)) {
      res.status(404).json({ error: "Load not found" });
      return;
    }
  }

  const deriveWindow = (stops: Array<{ appointmentStart: Date | null; appointmentEnd: Date | null }>) => {
    const dates = stops
      .flatMap((stop) => [stop.appointmentStart, stop.appointmentEnd])
      .filter((value): value is Date => Boolean(value));
    if (dates.length === 0) return null;
    const start = new Date(Math.min(...dates.map((date) => date.getTime())));
    const end = new Date(Math.max(...dates.map((date) => date.getTime())));
    return { start, end };
  };

  const targetWindow = deriveWindow(load.stops);

  let scopedLoadIds: string[] | null = null;
  let scopedDriverIds: string[] | null = null;
  let scopedTruckIds: string[] | null = null;
  let scopedTrailerIds: string[] | null = null;

  if (!dispatchScope.canSeeAllTeams) {
    await Promise.all([
      ensureTeamAssignmentsForEntityType(req.user!.orgId, TeamEntityType.DRIVER, dispatchScope.defaultTeamId!),
      ensureTeamAssignmentsForEntityType(req.user!.orgId, TeamEntityType.TRUCK, dispatchScope.defaultTeamId!),
      ensureTeamAssignmentsForEntityType(req.user!.orgId, TeamEntityType.TRAILER, dispatchScope.defaultTeamId!),
    ]);
    [scopedLoadIds, scopedDriverIds, scopedTruckIds, scopedTrailerIds] = await Promise.all([
      getScopedEntityIds(req.user!.orgId, TeamEntityType.LOAD, dispatchScope),
      getScopedEntityIds(req.user!.orgId, TeamEntityType.DRIVER, dispatchScope),
      getScopedEntityIds(req.user!.orgId, TeamEntityType.TRUCK, dispatchScope),
      getScopedEntityIds(req.user!.orgId, TeamEntityType.TRAILER, dispatchScope),
    ]);
  }

  const activeLoads = await prisma.load.findMany({
    where: {
      orgId: req.user!.orgId,
      id: {
        not: loadId,
        in: scopedLoadIds ?? undefined,
      },
      status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
      OR: [{ assignedDriverId: { not: null } }, { truckId: { not: null } }, { trailerId: { not: null } }],
    },
    select: {
      id: true,
      loadNumber: true,
      status: true,
      assignedDriverId: true,
      truckId: true,
      trailerId: true,
      stops: { select: { appointmentStart: true, appointmentEnd: true } },
    },
  });
  const assignmentMembers = await prisma.loadAssignmentMember.findMany({
    where: {
      role: LoadAssignmentRole.CO_DRIVER,
      loadId: { in: activeLoads.map((item) => item.id) },
    },
    select: { loadId: true, driverId: true },
  });

  const assignmentMap = new Map<
    string,
    { loadId: string; loadNumber: string; status: LoadStatus; window: { start: Date; end: Date } | null }
  >();

  const windowByLoad = new Map<string, { start: Date; end: Date } | null>();
  for (const other of activeLoads) {
    windowByLoad.set(other.id, deriveWindow(other.stops));
  }

  const overlaps = (a: { start: Date; end: Date } | null, b: { start: Date; end: Date } | null) => {
    if (!a || !b) return true;
    return a.start <= b.end && b.start <= a.end;
  };

  const markUnavailable = (key: string, info: { loadId: string; loadNumber: string; status: LoadStatus }) => {
    assignmentMap.set(key, {
      loadId: info.loadId,
      loadNumber: info.loadNumber,
      status: info.status,
      window: windowByLoad.get(info.loadId) ?? null,
    });
  };

  for (const other of activeLoads) {
    if (other.assignedDriverId) {
      markUnavailable(`driver:${other.assignedDriverId}`, {
        loadId: other.id,
        loadNumber: other.loadNumber,
        status: other.status,
      });
    }
    if (other.truckId) {
      markUnavailable(`truck:${other.truckId}`, {
        loadId: other.id,
        loadNumber: other.loadNumber,
        status: other.status,
      });
    }
    if (other.trailerId) {
      markUnavailable(`trailer:${other.trailerId}`, {
        loadId: other.id,
        loadNumber: other.loadNumber,
        status: other.status,
      });
    }
  }
  const loadById = new Map(activeLoads.map((item) => [item.id, item]));
  for (const member of assignmentMembers) {
    const info = loadById.get(member.loadId);
    if (!info) continue;
    markUnavailable(`driver:${member.driverId}`, {
      loadId: info.id,
      loadNumber: info.loadNumber,
      status: info.status,
    });
  }

  const [drivers, trucks, trailers] = await Promise.all([
    prisma.driver.findMany({ where: { orgId: req.user!.orgId, id: { in: scopedDriverIds ?? undefined } } }),
    prisma.truck.findMany({ where: { orgId: req.user!.orgId, id: { in: scopedTruckIds ?? undefined } } }),
    prisma.trailer.findMany({ where: { orgId: req.user!.orgId, id: { in: scopedTrailerIds ?? undefined } } }),
  ]);

  const toAvailability = (
    type: "driver" | "truck" | "trailer",
    items: Array<{ id: string; name?: string; unit?: string; status?: string | null }>
  ) => {
    const available: any[] = [];
    const unavailable: any[] = [];
    for (const item of items) {
      const reasons: string[] = [];
      if (item.status && item.status !== "AVAILABLE") {
        reasons.push(`Status ${item.status}`);
      }
      const key = `${type}:${item.id}`;
      const assignment = assignmentMap.get(key);
      if (!assignment && reasons.length === 0) {
        available.push(item);
        continue;
      }
      if (assignment) {
        const conflict = assignment.status === LoadStatus.IN_TRANSIT || assignment.status === LoadStatus.ASSIGNED;
        const overlap = overlaps(targetWindow, assignment.window);
        if (conflict || overlap) {
          const reason =
            assignment.status === LoadStatus.IN_TRANSIT
              ? `In transit on ${assignment.loadNumber}`
              : `Assigned to ${assignment.loadNumber}`;
          reasons.push(reason);
        }
      }
      if (reasons.length > 0) {
        unavailable.push({ ...item, reason: reasons.join(" · ") });
      } else {
        available.push(item);
      }
    }
    return { available, unavailable };
  };

  const driversAvailability = toAvailability(
    "driver",
    drivers.map((driver) => ({ id: driver.id, name: driver.name, status: driver.status }))
  );
  const trucksAvailability = toAvailability(
    "truck",
    trucks.map((truck) => ({ id: truck.id, unit: truck.unit, status: truck.status }))
  );
  const trailersAvailability = toAvailability(
    "trailer",
    trailers.map((trailer) => ({ id: trailer.id, unit: trailer.unit, status: trailer.status }))
  );

  res.json({
    availableDrivers: driversAvailability.available,
    unavailableDrivers: driversAvailability.unavailable,
    availableTrucks: trucksAvailability.available,
    unavailableTrucks: trucksAvailability.unavailable,
    availableTrailers: trailersAvailability.available,
    unavailableTrailers: trailersAvailability.unavailable,
  });
});

app.get(
  "/search",
  requireAuth,
  requireRole("ADMIN", "HEAD_DISPATCHER", "DISPATCHER", "BILLING"),
  async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!query) {
      res.json({ results: [] });
      return;
    }
    const limitParam = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 10) : 6;
    const orgId = req.user!.orgId;

    const [loads, drivers, customers, users] = await Promise.all([
      prisma.load.findMany({
        where: {
          orgId,
          deletedAt: null,
          OR: [
            { loadNumber: { contains: query, mode: "insensitive" } },
            { customerName: { contains: query, mode: "insensitive" } },
            { customer: { name: { contains: query, mode: "insensitive" } } },
            { customerRef: { contains: query, mode: "insensitive" } },
            { bolNumber: { contains: query, mode: "insensitive" } },
            { shipperReferenceNumber: { contains: query, mode: "insensitive" } },
            { consigneeReferenceNumber: { contains: query, mode: "insensitive" } },
            { externalTripId: { contains: query, mode: "insensitive" } },
            { tripNumber: { contains: query, mode: "insensitive" } },
            { driver: { name: { contains: query, mode: "insensitive" } } },
            {
              stops: {
                some: {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { address: { contains: query, mode: "insensitive" } },
                    { city: { contains: query, mode: "insensitive" } },
                    { state: { contains: query, mode: "insensitive" } },
                    { zip: { contains: query, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        },
        select: {
          id: true,
          loadNumber: true,
          status: true,
          customerName: true,
          customer: { select: { name: true } },
          driver: { select: { name: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.driver.findMany({
        where: {
          orgId,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
            { license: { contains: query, mode: "insensitive" } },
            { user: { email: { contains: query, mode: "insensitive" } } },
          ],
        },
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
          archivedAt: true,
          user: { select: { email: true } },
        },
        orderBy: { name: "asc" },
        take: limit,
      }),
      prisma.customer.findMany({
        where: {
          orgId,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { billingEmail: { contains: query, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, billingEmail: true },
        orderBy: { name: "asc" },
        take: limit,
      }),
      prisma.user.findMany({
        where: {
          orgId,
          role: { not: Role.DRIVER },
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
        orderBy: { name: "asc" },
        take: limit,
      }),
    ]);

    const results = [
      ...loads.map((load) => {
        const customerLabel = load.customerName || load.customer?.name || "Customer";
        const driverLabel = load.driver?.name ? `Driver: ${load.driver.name}` : null;
        const subtitle = [customerLabel, driverLabel].filter(Boolean).join(" · ");
        return {
          id: load.id,
          type: "load" as const,
          title: `Load ${load.loadNumber}`,
          subtitle,
          status: formatLoadStatusLabel(load.status),
          url: `/loads/${load.id}`,
        };
      }),
      ...drivers.map((driver) => ({
        id: driver.id,
        type: "driver" as const,
        title: driver.name,
        subtitle: driver.user?.email ?? driver.phone ?? "Driver",
        status: driver.archivedAt ? "Archived" : formatDriverStatusLabel(driver.status),
        url: "/admin/people/drivers",
      })),
      ...users.map((user) => {
        const subtitleParts = [formatRoleLabel(user.role), user.email].filter(Boolean);
        return {
          id: user.id,
          type: "employee" as const,
          title: user.name ?? user.email ?? "Employee",
          subtitle: subtitleParts.join(" · "),
          status: user.isActive ? "Active" : "Inactive",
          url: "/admin/people/employees",
        };
      }),
      ...customers.map((customer) => ({
        id: customer.id,
        type: "customer" as const,
        title: customer.name,
        subtitle: customer.billingEmail ?? "Customer",
        url: "/admin/company",
      })),
    ];

    res.json({ results });
  }
);

app.get("/customers", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  const customers = await prisma.customer.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { name: "asc" },
  });
  res.json({ customers });
});

app.post("/customers", requireAuth, requireCsrf, requirePermission(Permission.LOAD_CREATE), async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    billingEmail: z.string().email().optional(),
    billingPhone: z.string().optional(),
    remitToAddress: z.string().optional(),
    termsDays: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const existing = await prisma.customer.findFirst({
    where: { orgId: req.user!.orgId, name: parsed.data.name },
  });
  if (existing) {
    res.json({ customer: existing, existing: true });
    return;
  }
  const customer = await prisma.customer.create({
    data: { orgId: req.user!.orgId, ...parsed.data },
  });
  res.json({ customer, existing: false });
});

app.put("/customers/:id", requireAuth, requireCsrf, requirePermission(Permission.LOAD_EDIT), async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    billingEmail: z.string().email().optional(),
    billingPhone: z.string().optional(),
    remitToAddress: z.string().optional(),
    termsDays: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const existing = await prisma.customer.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!existing) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const customer = await prisma.customer.update({
    where: { id: existing.id },
    data: parsed.data,
  });
  res.json({ customer });
});

async function handleArriveStop(params: {
  stopId: string;
  userId: string;
  orgId: string;
  role: string;
  loadId?: string;
}) {
  const stop = await prisma.stop.findFirst({
    where: { id: params.stopId, orgId: params.orgId },
    include: { load: true },
  });
  if (!stop) {
    throw new Error("Stop not found");
  }
  if (params.loadId && stop.loadId !== params.loadId) {
    throw new Error("Stop not found");
  }
  const updated = await prisma.stop.update({
    where: { id: stop.id },
    data: { arrivedAt: stop.arrivedAt ?? new Date(), status: "ARRIVED" },
  });
  await logStopTimeAudit({
    orgId: params.orgId,
    userId: params.userId,
    before: stop,
    after: updated,
  });
  await createEvent({
    orgId: params.orgId,
    loadId: stop.loadId,
    userId: params.userId,
    stopId: stop.id,
    type: EventType.STOP_ARRIVED,
    message: `${stop.type} arrived at ${stop.name}`,
  });
  if (stop.type === StopType.DELIVERY) {
    const settings = await prisma.orgSettings.findFirst({ where: { orgId: params.orgId } });
    if (settings) {
      await ensureTask({
        orgId: params.orgId,
        loadId: stop.loadId,
        stopId: stop.id,
        type: TaskType.COLLECT_POD,
        title: "Collect POD",
        priority: TaskPriority.HIGH,
        assignedRole: "BILLING",
        dueAt: new Date(Date.now() + settings.collectPodDueMinutes * 60 * 1000),
        createdById: params.userId,
        dedupeKey: `COLLECT_POD:stop:${stop.id}`,
      });
    }
  }
  if ([LoadStatus.ASSIGNED].includes(stop.load.status)) {
    await transitionLoadStatus({
      load: { id: stop.loadId, loadNumber: stop.load.loadNumber, status: stop.load.status },
      nextStatus: LoadStatus.IN_TRANSIT,
      userId: params.userId,
      orgId: params.orgId,
      role: params.role as Role,
      message: `Load ${stop.load.loadNumber} in transit`,
    });
  }
  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "STOP_ARRIVED",
    entity: "Stop",
    entityId: stop.id,
    summary: `${stop.type} arrived at ${stop.name}`,
  });
  return updated;
}

async function handleDepartStop(params: {
  stopId: string;
  userId: string;
  orgId: string;
  role: Role;
  loadId?: string;
}) {
  const stop = await prisma.stop.findFirst({
    where: { id: params.stopId, orgId: params.orgId },
    include: { load: true },
  });
  if (!stop) {
    throw new Error("Stop not found");
  }
  if (params.loadId && stop.loadId !== params.loadId) {
    throw new Error("Stop not found");
  }
  const updated = await prisma.stop.update({
    where: { id: stop.id },
    data: { departedAt: stop.departedAt ?? new Date(), status: "DEPARTED" },
  });
  await logStopTimeAudit({
    orgId: params.orgId,
    userId: params.userId,
    before: stop,
    after: updated,
  });
  await createEvent({
    orgId: params.orgId,
    loadId: stop.loadId,
    userId: params.userId,
    stopId: stop.id,
    type: EventType.STOP_DEPARTED,
    message: `${stop.type} departed ${stop.name}`,
  });
  if (stop.type === StopType.DELIVERY) {
    const deliveries = await prisma.stop.findMany({
      where: { loadId: stop.loadId, orgId: params.orgId, type: StopType.DELIVERY },
      select: { departedAt: true },
    });
    const allDeparted = deliveries.length > 0 && deliveries.every((delivery) => delivery.departedAt);
    if (allDeparted) {
      await transitionLoadStatus({
        load: { id: stop.loadId, loadNumber: stop.load.loadNumber, status: stop.load.status },
        nextStatus: LoadStatus.DELIVERED,
        userId: params.userId,
        orgId: params.orgId,
        role: params.role,
        data: { deliveredAt: stop.load.deliveredAt ?? new Date() },
        message: `Load ${stop.load.loadNumber} delivered`,
      });
    }
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: params.orgId } });
  if (settings && updated.arrivedAt && updated.departedAt) {
    const dwellMinutes = Math.max(
      0,
      Math.round((updated.departedAt.getTime() - updated.arrivedAt.getTime()) / 60000)
    );
    const freeMinutes =
      stop.type === StopType.PICKUP
        ? settings.pickupFreeDetentionMinutes
        : stop.type === StopType.DELIVERY
        ? settings.deliveryFreeDetentionMinutes
        : 0;
    const detentionMinutes = Math.max(0, dwellMinutes - freeMinutes);
    if (detentionMinutes > 0) {
      await prisma.stop.update({
        where: { id: stop.id },
        data: { detentionMinutes },
      });
      if (settings.detentionRatePerHour) {
        await ensureTask({
          orgId: params.orgId,
          loadId: stop.loadId,
          stopId: stop.id,
          type: TaskType.STOP_DELAY_FOLLOWUP,
          title: "Detention follow-up",
          priority: TaskPriority.MED,
          assignedRole: "BILLING",
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdById: params.userId,
          dedupeKey: `STOP_DELAY_FOLLOWUP:stop:${stop.id}`,
        });
      }
    }
  }
  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "STOP_DEPARTED",
    entity: "Stop",
    entityId: stop.id,
    summary: `${stop.type} departed ${stop.name}`,
  });
  return updated;
}

app.post(
  "/loads/:loadId/stops/:stopId/arrive",
  requireAuth,
  requireCsrf,
  requirePermission(Permission.STOP_EDIT),
  async (req, res) => {
    try {
      const stop = await handleArriveStop({
        stopId: req.params.stopId,
        userId: req.user!.id,
        orgId: req.user!.orgId,
        role: req.user!.role,
        loadId: req.params.loadId,
      });
      res.json({ stop });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

app.post(
  "/loads/:loadId/stops/:stopId/depart",
  requireAuth,
  requireCsrf,
  requirePermission(Permission.STOP_EDIT),
  async (req, res) => {
    try {
      const stop = await handleDepartStop({
        stopId: req.params.stopId,
        userId: req.user!.id,
        orgId: req.user!.orgId,
        role: req.user!.role as Role,
        loadId: req.params.loadId,
      });
      res.json({ stop });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

async function getDriverAssignmentRole(loadId: string, driverId: string) {
  const member = await prisma.loadAssignmentMember.findFirst({
    where: { loadId, driverId },
    select: { role: true },
  });
  return member?.role ?? null;
}

app.get("/driver/current", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const driver = await prisma.driver.findFirst({
    where: { userId: req.user!.id, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: {
      orgId: req.user!.orgId,
      OR: [
        { assignedDriverId: driver.id },
        { assignmentMembers: { some: { driverId: driver.id } } },
      ],
      status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
    },
    include: {
      stops: { orderBy: { sequence: "asc" } },
      docs: true,
      driver: true,
      customer: true,
      assignmentMembers: { include: { driver: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ load, driver });
});

app.get("/driver/settings", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  res.json({
    settings: settings
      ? {
          requiredDocs: settings.requiredDocs,
          requiredDriverDocs: settings.requiredDriverDocs,
          reminderFrequencyMinutes: settings.reminderFrequencyMinutes,
          missingPodAfterMinutes: settings.missingPodAfterMinutes,
        }
      : null,
  });
});

app.get("/profile", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING", "DRIVER"), async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.user!.id, orgId: req.user!.orgId },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      timezone: user.timezone,
      profilePhotoUrl: user.profilePhotoUrl,
      role: user.role,
    },
  });
});

app.patch("/profile", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING", "DRIVER"), requireCsrf, async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(32).optional().nullable(),
    timezone: z.string().trim().max(64).optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      name: parsed.data.name ?? undefined,
      phone: parsed.data.phone === undefined ? undefined : parsed.data.phone || null,
      timezone: parsed.data.timezone === undefined ? undefined : parsed.data.timezone || null,
    },
  });
  res.json({ profile: updated });
});

app.post(
  "/profile/photo",
  requireAuth,
  requireRole("ADMIN", "DISPATCHER", "BILLING", "DRIVER"),
  requireCsrf,
  upload.single("file"),
  async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "File required" });
    return;
  }
  if (!req.file.mimetype.startsWith("image/")) {
    res.status(400).json({ error: "Profile photo must be an image" });
    return;
  }
  const { filename } = await saveUserProfilePhoto(req.file, req.user!.id);
  const profilePhotoUrl = `profiles/${filename}`;
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: { profilePhotoUrl },
  });
  res.json({ profilePhotoUrl: updated.profilePhotoUrl });
});

app.get("/driver/profile", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const driver = await prisma.driver.findFirst({
    where: { userId: req.user!.id, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  res.json({
    profile: {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      license: driver.license,
      licenseState: driver.licenseState,
      licenseExpiresAt: driver.licenseExpiresAt,
      medCardExpiresAt: driver.medCardExpiresAt,
      profilePhotoUrl: driver.profilePhotoUrl,
    },
    user: { email: req.user!.email, name: req.user!.name },
  });
});

app.patch("/driver/profile", requireAuth, requireCsrf, requireRole("DRIVER"), async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(32).optional().nullable(),
    license: z.string().trim().max(32).optional().nullable(),
    licenseState: z.string().trim().max(8).optional().nullable(),
    licenseExpiresAt: z.string().optional().nullable(),
    medCardExpiresAt: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }
  const driver = await prisma.driver.findFirst({
    where: { userId: req.user!.id, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const data = parsed.data;
  const licenseExpiresAt = data.licenseExpiresAt ? parseDateInput(data.licenseExpiresAt, "start") : null;
  const medCardExpiresAt = data.medCardExpiresAt ? parseDateInput(data.medCardExpiresAt, "start") : null;

  const updateData: Prisma.DriverUpdateInput = {
    name: data.name ?? undefined,
    phone: data.phone === undefined ? undefined : data.phone || null,
    license: data.license === undefined ? undefined : data.license || null,
    licenseState: data.licenseState === undefined ? undefined : data.licenseState || null,
    licenseExpiresAt: data.licenseExpiresAt === undefined ? undefined : licenseExpiresAt,
    medCardExpiresAt: data.medCardExpiresAt === undefined ? undefined : medCardExpiresAt,
  };

  const updated = await prisma.driver.update({
    where: { id: driver.id },
    data: updateData,
  });

  if (data.name && data.name !== req.user!.name) {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { name: data.name },
    });
  }

  res.json({ profile: updated });
});

app.post(
  "/driver/profile/photo",
  requireAuth,
  requireCsrf,
  requireRole("DRIVER"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "File required" });
      return;
    }
    if (!req.file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "Profile photo must be an image" });
      return;
    }
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }
    const { filename } = await saveDriverProfilePhoto(req.file, driver.id);
    const profilePhotoUrl = `profiles/${filename}`;
    const updated = await prisma.driver.update({
      where: { id: driver.id },
      data: { profilePhotoUrl },
    });
    res.json({ profilePhotoUrl: updated.profilePhotoUrl });
  }
);

function getWeekStart(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function parseDateInput(value: string, mode: "start" | "end") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (mode === "start") {
      date.setHours(0, 0, 0, 0);
    } else {
      date.setHours(23, 59, 59, 999);
    }
  }
  return date;
}

app.get("/driver/earnings", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const driver = await prisma.driver.findFirst({
    where: { userId: req.user!.id, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  const ratePerMileValue = toDecimal(driver.payRatePerMile ?? settings?.driverRatePerMile ?? 0) ?? new Prisma.Decimal(0);
  const weekStart = getWeekStart(new Date());
  const loads = await prisma.load.findMany({
    where: {
      orgId: req.user!.orgId,
      assignedDriverId: driver.id,
      deliveredAt: { gte: weekStart },
    },
    select: { miles: true },
  });
  const milesThisWeek = loads.reduce((total, load) => total + (load.miles ?? 0), 0);
  const milesDecimal = toDecimalFixed(milesThisWeek, 2) ?? new Prisma.Decimal(0);
  const estimatedPay = mul(ratePerMileValue, milesDecimal);
  res.json({
    weekStart,
    milesThisWeek,
    ratePerMile: formatUSD(ratePerMileValue),
    estimatedPay: formatUSD(estimatedPay),
    loadCount: loads.length,
  });
});

app.post("/driver/stops/:stopId/arrive", requireAuth, requireCsrf, requireRole("DRIVER"), async (req, res) => {
  try {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }
    const stopCheck = await prisma.stop.findFirst({
      where: { id: req.params.stopId, orgId: req.user!.orgId },
      include: { load: true },
    });
    if (!stopCheck) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    const assignmentRole =
      stopCheck.load.assignedDriverId === driver.id
        ? LoadAssignmentRole.PRIMARY
        : await getDriverAssignmentRole(stopCheck.load.id, driver.id);
    if (!assignmentRole) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    if (assignmentRole !== LoadAssignmentRole.PRIMARY) {
      res.status(403).json({ error: "Only the primary driver can update stops" });
      return;
    }
    const stop = await handleArriveStop({
      stopId: req.params.stopId,
      userId: req.user!.id,
      orgId: req.user!.orgId,
      role: req.user!.role,
    });
    res.json({ stop });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/driver/stops/:stopId/depart", requireAuth, requireCsrf, requireRole("DRIVER"), async (req, res) => {
  try {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }
    const stopCheck = await prisma.stop.findFirst({
      where: { id: req.params.stopId, orgId: req.user!.orgId },
      include: { load: true },
    });
    if (!stopCheck) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    const assignmentRole =
      stopCheck.load.assignedDriverId === driver.id
        ? LoadAssignmentRole.PRIMARY
        : await getDriverAssignmentRole(stopCheck.load.id, driver.id);
    if (!assignmentRole) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    if (assignmentRole !== LoadAssignmentRole.PRIMARY) {
      res.status(403).json({ error: "Only the primary driver can update stops" });
      return;
    }
    const stop = await handleDepartStop({
      stopId: req.params.stopId,
      userId: req.user!.id,
      orgId: req.user!.orgId,
      role: req.user!.role as Role,
    });
    res.json({ stop });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/driver/note", requireAuth, requireCsrf, requireRole("DRIVER"), async (req, res) => {
  const schema = z.object({ loadId: z.string(), note: z.string().min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const driver = await prisma.driver.findFirst({
    where: { userId: req.user!.id, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: { id: parsed.data.loadId, orgId: req.user!.orgId },
  });
  if (!load) {
    res.status(403).json({ error: "Not assigned to this load" });
    return;
  }
  const assignmentRole =
    load.assignedDriverId === driver.id
      ? LoadAssignmentRole.PRIMARY
      : await getDriverAssignmentRole(load.id, driver.id);
  if (!assignmentRole) {
    res.status(403).json({ error: "Not assigned to this load" });
    return;
  }
  if (assignmentRole !== LoadAssignmentRole.PRIMARY) {
    res.status(403).json({ error: "Only the primary driver can add notes" });
    return;
  }
  await createEvent({
    orgId: req.user!.orgId,
    loadId: load.id,
    userId: req.user!.id,
    type: EventType.DRIVER_NOTE,
    message: "Driver note added",
    meta: { note: parsed.data.note },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DRIVER_NOTE",
    entity: "Load",
    entityId: load.id,
    summary: `Driver note on ${load.loadNumber}`,
    meta: { note: parsed.data.note },
  });
  res.json({ ok: true });
});

app.post("/driver/undo", requireAuth, requireCsrf, requireRole("DRIVER"), async (req, res) => {
  const schema = z.object({ loadId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const driver = await prisma.driver.findFirst({
    where: { userId: req.user!.id, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: { id: parsed.data.loadId, orgId: req.user!.orgId },
    include: { stops: true },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const assignmentRole =
    load.assignedDriverId === driver.id
      ? LoadAssignmentRole.PRIMARY
      : await getDriverAssignmentRole(load.id, driver.id);
  if (!assignmentRole) {
    res.status(403).json({ error: "Not assigned to this load" });
    return;
  }
  if (assignmentRole !== LoadAssignmentRole.PRIMARY) {
    res.status(403).json({ error: "Only the primary driver can undo actions" });
    return;
  }
  const recentStops = load.stops
    .flatMap((stop) => [
      stop.arrivedAt ? { stop, type: "arrived", time: stop.arrivedAt } : null,
      stop.departedAt ? { stop, type: "departed", time: stop.departedAt } : null,
    ])
    .filter(Boolean) as { stop: typeof load.stops[number]; type: string; time: Date }[];
  recentStops.sort((a, b) => b.time.getTime() - a.time.getTime());
  const latest = recentStops[0];
  if (!latest || Date.now() - latest.time.getTime() > 5 * 60 * 1000) {
    res.status(400).json({ error: "No recent action to undo" });
    return;
  }
  const data =
    latest.type === "arrived"
      ? { arrivedAt: null, status: "PLANNED" }
      : { departedAt: null, status: "ARRIVED" };
  const updated = await prisma.stop.update({ where: { id: latest.stop.id }, data });
  await logStopTimeAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    before: latest.stop,
    after: updated,
  });
  await createEvent({
    orgId: req.user!.orgId,
    loadId: load.id,
    userId: req.user!.id,
    stopId: latest.stop.id,
    type: EventType.STOP_DEPARTED,
    message: `Undo ${latest.type} at ${latest.stop.name}`,
    meta: { undo: true },
  });
  res.json({ stop: updated });
});

app.post(
  "/tracking/load/:loadId/start",
  requireAuth,
  requireRole("ADMIN", "DISPATCHER", "DRIVER"),
  requireCsrf,
  async (req, res) => {
  const schema = z.object({ providerType: z.enum(["PHONE"]).optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  if (!["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "DRIVER"].includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: { id: req.params.loadId, orgId: req.user!.orgId },
    include: { truck: true },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (req.user!.role === "DRIVER") {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    const assignmentRole =
      load.assignedDriverId === driver.id
        ? LoadAssignmentRole.PRIMARY
        : await getDriverAssignmentRole(load.id, driver.id);
    if (!assignmentRole) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    if (assignmentRole !== LoadAssignmentRole.PRIMARY) {
      res.status(403).json({ error: "Only the primary driver can manage tracking" });
      return;
    }
  }

  const providerType = TrackingProviderType.PHONE;
  const existing = await prisma.loadTrackingSession.findFirst({
    where: { orgId: req.user!.orgId, loadId: load.id, providerType, status: TrackingSessionStatus.ON },
  });
  if (existing) {
    res.json({ session: existing });
    return;
  }

  const session = await prisma.loadTrackingSession.create({
    data: {
      orgId: req.user!.orgId,
      loadId: load.id,
      providerType,
      status: TrackingSessionStatus.ON,
      startedByUserId: req.user!.id,
      startedAt: new Date(),
    },
  });

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "TRACKING_START",
    entity: "LoadTrackingSession",
    entityId: session.id,
    summary: `Started phone tracking for load ${load.loadNumber}`,
  });

  res.json({ session });
});

app.post(
  "/tracking/load/:loadId/stop",
  requireAuth,
  requireRole("ADMIN", "DISPATCHER", "DRIVER"),
  requireCsrf,
  async (req, res) => {
  if (!["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "DRIVER"].includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: { id: req.params.loadId, orgId: req.user!.orgId },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (req.user!.role === "DRIVER") {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    const assignmentRole =
      load.assignedDriverId === driver.id
        ? LoadAssignmentRole.PRIMARY
        : await getDriverAssignmentRole(load.id, driver.id);
    if (!assignmentRole) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    if (assignmentRole !== LoadAssignmentRole.PRIMARY) {
      res.status(403).json({ error: "Only the primary driver can manage tracking" });
      return;
    }
  }

  const session = await prisma.loadTrackingSession.findFirst({
    where: { orgId: req.user!.orgId, loadId: load.id, providerType: TrackingProviderType.PHONE, status: TrackingSessionStatus.ON },
    orderBy: { startedAt: "desc" },
  });
  if (!session) {
    res.status(400).json({ error: "Tracking is not active" });
    return;
  }
  const updated = await prisma.loadTrackingSession.update({
    where: { id: session.id },
    data: { status: TrackingSessionStatus.ENDED, endedAt: new Date() },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "TRACKING_STOP",
    entity: "LoadTrackingSession",
    entityId: updated.id,
    summary: `Stopped phone tracking for load ${load.loadNumber}`,
  });
  res.json({ session: updated });
});

app.post(
  "/tracking/load/:loadId/ping",
  requireAuth,
  requireRole("ADMIN", "DISPATCHER", "DRIVER"),
  requireCsrf,
  async (req, res) => {
  if (!["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "DRIVER"].includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const schema = z.object({
    lat: z.union([z.number(), z.string()]),
    lng: z.union([z.number(), z.string()]),
    accuracyM: z.union([z.number(), z.string()]).optional(),
    speedMph: z.union([z.number(), z.string()]).optional(),
    heading: z.union([z.number(), z.string()]).optional(),
    capturedAt: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const lat = typeof parsed.data.lat === "string" ? Number(parsed.data.lat) : parsed.data.lat;
  const lng = typeof parsed.data.lng === "string" ? Number(parsed.data.lng) : parsed.data.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.status(400).json({ error: "Invalid coordinates" });
    return;
  }
  const capturedAt = parsed.data.capturedAt ? new Date(parsed.data.capturedAt) : new Date();
  if (Number.isNaN(capturedAt.getTime())) {
    res.status(400).json({ error: "Invalid capturedAt" });
    return;
  }

  const load = await prisma.load.findFirst({
    where: { id: req.params.loadId, orgId: req.user!.orgId },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  let driverId: string | null = null;
  if (req.user!.role === "DRIVER") {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    const assignmentRole =
      load.assignedDriverId === driver.id
        ? LoadAssignmentRole.PRIMARY
        : await getDriverAssignmentRole(load.id, driver.id);
    if (!assignmentRole) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    if (assignmentRole !== LoadAssignmentRole.PRIMARY) {
      res.status(403).json({ error: "Only the primary driver can manage tracking" });
      return;
    }
    driverId = driver.id;
  }

  const session = await prisma.loadTrackingSession.findFirst({
    where: { orgId: req.user!.orgId, loadId: load.id, providerType: TrackingProviderType.PHONE, status: TrackingSessionStatus.ON },
    orderBy: { startedAt: "desc" },
  });
  if (!session) {
    res.status(400).json({ error: "Tracking is not active" });
    return;
  }

  const ping = await prisma.locationPing.create({
    data: {
      orgId: req.user!.orgId,
      loadId: load.id,
      truckId: load.truckId ?? null,
      driverId,
      providerType: TrackingProviderType.PHONE,
      lat: new Prisma.Decimal(lat),
      lng: new Prisma.Decimal(lng),
      accuracyM: parsed.data.accuracyM ? Number(parsed.data.accuracyM) : null,
      speedMph: parsed.data.speedMph ? Number(parsed.data.speedMph) : null,
      heading: parsed.data.heading ? Number(parsed.data.heading) : null,
      capturedAt,
    },
  });
  res.json({ ping });
});

app.get("/tracking/load/:loadId/latest", requireAuth, requireRole("ADMIN", "DISPATCHER", "DRIVER"), async (req, res) => {
  const load = await prisma.load.findFirst({
    where: { id: req.params.loadId, orgId: req.user!.orgId },
    include: { truck: true },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (req.user!.role === "DRIVER") {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    const assignmentRole =
      load.assignedDriverId === driver.id
        ? LoadAssignmentRole.PRIMARY
        : await getDriverAssignmentRole(load.id, driver.id);
    if (!assignmentRole) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
  }

  const [latestPing, activeSession] = await Promise.all([
    prisma.locationPing.findFirst({
      where: { orgId: req.user!.orgId, loadId: load.id },
      orderBy: { capturedAt: "desc" },
    }),
    prisma.loadTrackingSession.findFirst({
      where: { orgId: req.user!.orgId, loadId: load.id, status: TrackingSessionStatus.ON },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  let ping = latestPing;
  let samsaraError: { code: string; message: string; retryAfter?: number | null } | null = null;

  if (!ping && load.truckId) {
    const mapping = await prisma.truckTelematicsMapping.findFirst({
      where: { orgId: req.user!.orgId, truckId: load.truckId, providerType: TrackingProviderType.SAMSARA },
    });
    const integration = await prisma.trackingIntegration.findFirst({
      where: { orgId: req.user!.orgId, providerType: TrackingProviderType.SAMSARA, status: TrackingIntegrationStatus.CONNECTED },
    });
    const token = extractSamsaraToken(integration?.configJson ?? null);
    if (mapping && token) {
      try {
        const loc = await fetchSamsaraVehicleLocation(token, mapping.externalId);
        ping = await prisma.locationPing.create({
          data: {
            orgId: req.user!.orgId,
            loadId: load.id,
            truckId: load.truckId ?? null,
            providerType: TrackingProviderType.SAMSARA,
            lat: new Prisma.Decimal(loc.lat),
            lng: new Prisma.Decimal(loc.lng),
            speedMph: loc.speedMph ? Number(loc.speedMph) : null,
            heading: loc.heading ? Number(loc.heading) : null,
            capturedAt: loc.capturedAt,
          },
        });
      } catch (error) {
        const info = formatSamsaraError(error);
        console.error("Samsara fetch failed", info);
        samsaraError = {
          code: "SAMSARA_FETCH_FAILED",
          message: info.message,
          retryAfter: info.retryAfter ?? null,
        };
      }
    }
  }

  res.json({ session: activeSession, ping, error: samsaraError });
});

app.get("/tracking/load/:loadId/history", requireAuth, requireRole("ADMIN", "DISPATCHER", "DRIVER"), async (req, res) => {
  const load = await prisma.load.findFirst({
    where: { id: req.params.loadId, orgId: req.user!.orgId },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (req.user!.role === "DRIVER") {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    const assignmentRole =
      load.assignedDriverId === driver.id
        ? LoadAssignmentRole.PRIMARY
        : await getDriverAssignmentRole(load.id, driver.id);
    if (!assignmentRole) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
  }
  const minutesRaw = Array.isArray(req.query.minutes) ? req.query.minutes[0] : req.query.minutes;
  const minutes = Math.min(1440, Math.max(1, Number(minutesRaw ?? 120)));
  const since = new Date(Date.now() - minutes * 60 * 1000);
  const pings = await prisma.locationPing.findMany({
    where: { orgId: req.user!.orgId, loadId: load.id, capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
  });
  res.json({ pings });
});

app.post(
  "/loads/:loadId/docs",
  requireAuth,
  requireRole("ADMIN", "DISPATCHER", "BILLING"),
  requireCsrf,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "File required" });
      return;
    }
    const schema = z.object({
      type: z.nativeEnum(DocType),
      stopId: z.string().optional(),
      accessorialId: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    try {
      const load = await prisma.load.findFirst({
        where: { id: req.params.loadId, orgId: req.user!.orgId },
        select: { id: true, loadNumber: true, status: true, deliveredAt: true },
      });
      if (!load) {
        res.status(404).json({ error: "Load not found" });
        return;
      }
      let stop: { id: string; type: StopType } | null = null;
      if (parsed.data.stopId) {
        stop = await prisma.stop.findFirst({
          where: { id: parsed.data.stopId, orgId: req.user!.orgId, loadId: load.id },
          select: { id: true, type: true },
        });
        if (!stop) {
          res.status(404).json({ error: "Stop not found" });
          return;
        }
      }
      let accessorial: { id: string; status: AccessorialStatus } | null = null;
      if (parsed.data.accessorialId) {
        accessorial = await prisma.accessorial.findFirst({
          where: { id: parsed.data.accessorialId, orgId: req.user!.orgId, loadId: load.id },
          select: { id: true, status: true },
        });
        if (!accessorial) {
          res.status(404).json({ error: "Accessorial not found" });
          return;
        }
      }
      const { filename } = await saveDocumentFile(req.file, load.id, req.user!.orgId, parsed.data.type);
      const doc = await prisma.document.create({
        data: {
          orgId: req.user!.orgId,
          loadId: load.id,
          stopId: stop?.id ?? null,
          type: parsed.data.type,
          status: DocStatus.UPLOADED,
          source: "OPS_UPLOAD",
          filename,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          uploadedById: req.user!.id,
        },
      });
      if (accessorial && parsed.data.type === DocType.ACCESSORIAL_PROOF) {
        await prisma.accessorial.update({
          where: { id: accessorial.id },
          data: {
            proofDocumentId: doc.id,
            status: accessorial.status === AccessorialStatus.NEEDS_PROOF ? AccessorialStatus.PENDING_APPROVAL : undefined,
          },
        });
      }
      await createEvent({
        orgId: req.user!.orgId,
        loadId: load.id,
        stopId: stop?.id ?? null,
        docId: doc.id,
        userId: req.user!.id,
        type: EventType.DOC_UPLOADED,
        message: `Document uploaded (${parsed.data.type})`,
        meta: { docId: doc.id },
      });
      if (doc.type === DocType.POD) {
        await ensureTask({
          orgId: req.user!.orgId,
          loadId: load.id,
          docId: doc.id,
          type: TaskType.VERIFY_POD,
          title: "Verify POD",
          priority: TaskPriority.HIGH,
          assignedRole: "BILLING",
          createdById: req.user!.id,
          dedupeKey: `VERIFY_POD:doc:${doc.id}`,
        });
      }
      if (doc.type === DocType.POD) {
        await maybeAdvanceLoadForPodUpload({
          load,
          stopType: stop?.type ?? null,
          actor: { userId: req.user!.id, orgId: req.user!.orgId, role: req.user!.role as Role },
        });
      }
      await logAudit({
        orgId: req.user!.orgId,
        userId: req.user!.id,
        action: "DOC_UPLOADED",
        entity: "Document",
        entityId: doc.id,
        summary: `Uploaded ${parsed.data.type} for load ${load.loadNumber}`,
        after: { type: doc.type, status: doc.status, stopId: doc.stopId ?? null },
      });
      await refreshFinanceAfterMutation({
        orgId: req.user!.orgId,
        loadId: load.id,
        source: "dispatch.docs",
        trigger: "uploaded",
        dedupeSuffix: doc.id,
      });
      res.json({ doc });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

app.post(
  "/driver/docs",
  requireAuth,
  requireCsrf,
  requireRole("DRIVER"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "File required" });
      return;
    }
    const schema = z.object({
      loadId: z.string(),
      type: z.nativeEnum(DocType),
      stopId: z.string().optional(),
      accessorialId: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    try {
      const load = await prisma.load.findFirst({
        where: { id: parsed.data.loadId, orgId: req.user!.orgId },
        select: { id: true, loadNumber: true, status: true, assignedDriverId: true, deliveredAt: true },
      });
      if (!load) {
        res.status(404).json({ error: "Load not found" });
        return;
      }
      const driver = await prisma.driver.findFirst({
        where: { userId: req.user!.id, orgId: req.user!.orgId },
      });
      if (!driver) {
        res.status(403).json({ error: "Not assigned to this load" });
        return;
      }
      if (load.assignedDriverId !== driver.id) {
        const role = await getDriverAssignmentRole(load.id, driver.id);
        if (!role) {
          res.status(403).json({ error: "Not assigned to this load" });
          return;
        }
      }
      let stop: { id: string; type: StopType } | null = null;
      if (parsed.data.stopId) {
        stop = await prisma.stop.findFirst({
          where: { id: parsed.data.stopId, orgId: req.user!.orgId, loadId: load.id },
          select: { id: true, type: true },
        });
        if (!stop) {
          res.status(404).json({ error: "Stop not found" });
          return;
        }
      }
      const { filename } = await saveDocumentFile(req.file, load.id, req.user!.orgId, parsed.data.type);
      const doc = await prisma.document.create({
        data: {
          orgId: req.user!.orgId,
          loadId: load.id,
          stopId: stop?.id ?? null,
          type: parsed.data.type,
          status: DocStatus.UPLOADED,
          source: "DRIVER_UPLOAD",
          filename,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          uploadedById: req.user!.id,
        },
      });
      await createEvent({
        orgId: req.user!.orgId,
        loadId: load.id,
        stopId: stop?.id ?? null,
        docId: doc.id,
        userId: req.user!.id,
        type: EventType.DOC_UPLOADED,
        message: `Document uploaded (${parsed.data.type})`,
        meta: { docId: doc.id },
      });
      if (doc.type === DocType.POD) {
        await ensureTask({
          orgId: req.user!.orgId,
          loadId: load.id,
          docId: doc.id,
          type: TaskType.VERIFY_POD,
          title: "Verify POD",
          priority: TaskPriority.HIGH,
          assignedRole: "BILLING",
          createdById: req.user!.id,
          dedupeKey: `VERIFY_POD:doc:${doc.id}`,
        });
      }
      if (doc.type === DocType.POD) {
        await maybeAdvanceLoadForPodUpload({
          load,
          stopType: stop?.type ?? null,
          actor: { userId: req.user!.id, orgId: req.user!.orgId, role: req.user!.role as Role },
        });
      }
      await logAudit({
        orgId: req.user!.orgId,
        userId: req.user!.id,
        action: "DOC_UPLOADED",
        entity: "Document",
        entityId: doc.id,
        summary: `Uploaded ${parsed.data.type} for load ${load.loadNumber}`,
        after: { type: doc.type, status: doc.status, stopId: doc.stopId ?? null },
      });
      await refreshFinanceAfterMutation({
        orgId: req.user!.orgId,
        loadId: load.id,
        source: "dispatch.docs",
        trigger: "driver_uploaded",
        dedupeSuffix: doc.id,
      });
      res.json({ doc });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

app.post("/docs/:id/verify", requireAuth, requireCsrf, requirePermission(Permission.DOC_VERIFY), async (req, res) => {
  const schema = z.object({
    requireSignature: z.boolean(),
    requirePrintedName: z.boolean(),
    requireDeliveryDate: z.boolean(),
    pages: z.number().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  let doc;
  try {
    doc = await requireOrgEntity(prisma.document, req.user!.orgId, req.params.id, "Document");
  } catch {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: { id: doc.loadId, orgId: req.user!.orgId },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  if (!settings) {
    res.status(400).json({ error: "Settings not configured" });
    return;
  }
  if (settings.podRequireSignature && !parsed.data.requireSignature) {
    res.status(400).json({ error: "Signature required" });
    return;
  }
  if (settings.podRequirePrintedName && !parsed.data.requirePrintedName) {
    res.status(400).json({ error: "Printed name required" });
    return;
  }
  if (settings.podRequireDeliveryDate && !parsed.data.requireDeliveryDate) {
    res.status(400).json({ error: "Consignee date required" });
    return;
  }
  if (parsed.data.pages < settings.podMinPages) {
    res.status(400).json({ error: `Minimum ${settings.podMinPages} page(s) required` });
    return;
  }

  const verifiedAt = new Date();
  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: {
      status: DocStatus.VERIFIED,
      verifiedById: req.user!.id,
      verifiedAt,
    },
  });
  let currentStatus = load.status;
  if (doc.type === DocType.POD) {
    let isDeliveryStop = false;
    if (doc.stopId) {
      const stop = await prisma.stop.findFirst({
        where: { id: doc.stopId, orgId: req.user!.orgId, loadId: load.id },
        select: { id: true, type: true },
      });
      isDeliveryStop = stop?.type === StopType.DELIVERY;
    } else {
      const deliveryCount = await prisma.stop.count({
        where: { loadId: load.id, orgId: req.user!.orgId, type: StopType.DELIVERY },
      });
      isDeliveryStop = deliveryCount > 0;
    }
    if (isDeliveryStop) {
      if (currentStatus === LoadStatus.IN_TRANSIT) {
        await transitionLoadStatus({
          load: { id: load.id, loadNumber: load.loadNumber, status: currentStatus },
          nextStatus: LoadStatus.DELIVERED,
          userId: req.user!.id,
          orgId: req.user!.orgId,
          role: req.user!.role as Role,
          data: { deliveredAt: load.deliveredAt ?? new Date() },
          message: `Load ${load.loadNumber} delivered`,
        });
        currentStatus = LoadStatus.DELIVERED;
      }
      if (currentStatus === LoadStatus.DELIVERED) {
        await transitionLoadStatus({
          load: { id: load.id, loadNumber: load.loadNumber, status: currentStatus },
          nextStatus: LoadStatus.POD_RECEIVED,
          userId: req.user!.id,
          orgId: req.user!.orgId,
          role: req.user!.role as Role,
          message: `POD received for ${load.loadNumber}`,
        });
        currentStatus = LoadStatus.POD_RECEIVED;
      }
    }
  }

  const requiredDocs = settings.requiredDocs ?? [];
  let readyForInvoice = true;
  let missingDocs: DocType[] = [];
  if (requiredDocs.length > 0) {
    const verifiedDocs = await prisma.document.findMany({
      where: {
        orgId: req.user!.orgId,
        loadId: load.id,
        type: { in: requiredDocs },
        status: DocStatus.VERIFIED,
      },
      select: { type: true },
    });
    const verifiedSet = new Set(verifiedDocs.map((docRow) => docRow.type));
    missingDocs = requiredDocs.filter((docType) => !verifiedSet.has(docType));
    readyForInvoice = missingDocs.length === 0;
  }

  const canMoveToReady =
    ![LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED].includes(currentStatus) &&
    [LoadStatus.DELIVERED, LoadStatus.POD_RECEIVED, LoadStatus.READY_TO_INVOICE].includes(currentStatus);

  if (doc.type === DocType.POD) {
    if (readyForInvoice && canMoveToReady && currentStatus !== LoadStatus.READY_TO_INVOICE) {
      await transitionLoadStatus({
        load: { id: load.id, loadNumber: load.loadNumber, status: currentStatus },
        nextStatus: LoadStatus.READY_TO_INVOICE,
        userId: req.user!.id,
        orgId: req.user!.orgId,
        role: req.user!.role as Role,
        data: { podVerifiedAt: verifiedAt },
        message: `POD verified for ${load.loadNumber}`,
      });
    } else {
      await prisma.load.update({
        where: { id: load.id },
        data: { podVerifiedAt: verifiedAt },
      });
    }
  } else if (readyForInvoice && canMoveToReady && currentStatus !== LoadStatus.READY_TO_INVOICE) {
    await transitionLoadStatus({
      load: { id: load.id, loadNumber: load.loadNumber, status: currentStatus },
      nextStatus: LoadStatus.READY_TO_INVOICE,
      userId: req.user!.id,
      orgId: req.user!.orgId,
      role: req.user!.role as Role,
      message: `Required docs verified for ${load.loadNumber}`,
    });
  }
  await createEvent({
    orgId: req.user!.orgId,
    loadId: doc.loadId,
    userId: req.user!.id,
    type: EventType.DOC_VERIFIED,
    message: "POD verified",
    docId: doc.id,
    stopId: doc.stopId ?? null,
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DOC_VERIFIED",
    entity: "Document",
    entityId: doc.id,
    summary: `Verified ${doc.type} for load ${load.loadNumber}`,
    before: { status: doc.status },
    after: { status: DocStatus.VERIFIED },
  });
  const verifyTasks = await prisma.task.findMany({
    where: {
      orgId: req.user!.orgId,
      type: TaskType.VERIFY_POD,
      status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
      OR: [{ docId: doc.id }, { loadId: load.id }],
    },
    select: { id: true },
  });
  for (const task of verifyTasks) {
    await completeTask(task.id, req.user!.orgId, req.user!.id);
  }
  if (readyForInvoice) {
    const missingDocTasks = await prisma.task.findMany({
      where: {
        orgId: req.user!.orgId,
        loadId: load.id,
        type: TaskType.MISSING_DOC,
        status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
      },
      select: { id: true },
    });
    for (const task of missingDocTasks) {
      await completeTask(task.id, req.user!.orgId, req.user!.id);
    }
  }
  await refreshFinanceAfterMutation({
    orgId: req.user!.orgId,
    loadId: load.id,
    source: "dispatch.docs",
    trigger: "verified",
    dedupeSuffix: doc.id,
  });
  res.json({
    doc: updated,
    invoice: null,
    missingDocs,
    readyForInvoice,
  });
});

app.post("/docs/:id/reject", requireAuth, requireCsrf, requirePermission(Permission.DOC_VERIFY), async (req, res) => {
  const schema = z.object({ rejectReason: z.string().min(2) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Reject reason required" });
    return;
  }
  let doc;
  try {
    doc = await requireOrgEntity(prisma.document, req.user!.orgId, req.params.id, "Document");
  } catch {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: {
      status: DocStatus.REJECTED,
      rejectedById: req.user!.id,
      rejectedAt: new Date(),
      rejectReason: parsed.data.rejectReason,
    },
  });
  await createEvent({
    orgId: req.user!.orgId,
    loadId: doc.loadId,
    userId: req.user!.id,
    type: EventType.DOC_REJECTED,
    message: "POD rejected",
    docId: doc.id,
    stopId: doc.stopId ?? null,
    meta: { rejectReason: parsed.data.rejectReason },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DOC_REJECTED",
    entity: "Document",
    entityId: doc.id,
    summary: `Rejected ${doc.type} for load ${doc.loadId}`,
    meta: { rejectReason: parsed.data.rejectReason },
    before: { status: doc.status },
    after: { status: DocStatus.REJECTED },
  });
  await refreshFinanceAfterMutation({
    orgId: req.user!.orgId,
    loadId: doc.loadId,
    source: "dispatch.docs",
    trigger: "rejected",
    dedupeSuffix: doc.id,
  });
  res.json({ doc: updated });
});

app.get("/finance/receivables", requireAuth, requireRole("ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"), async (req, res) => {
  const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
  const search = typeof req.query.search === "string" ? req.query.search : "";
  const blockerCode = typeof req.query.blockerCode === "string" ? req.query.blockerCode.trim() : "";
  const readiness = typeof req.query.readiness === "string" ? req.query.readiness.toUpperCase() : "";
  const readyState = readiness === "READY" || readiness === "BLOCKED" ? (readiness as "READY" | "BLOCKED") : undefined;
  const stageTokens =
    typeof req.query.stage === "string"
      ? req.query.stage
          .split(",")
          .map((token) => token.trim())
          .filter(Boolean)
      : [];
  const validStages = stageTokens.filter((token) => Object.values(FINANCE_RECEIVABLE_STAGE).includes(token as any)) as Array<
    (typeof FINANCE_RECEIVABLE_STAGE)[keyof typeof FINANCE_RECEIVABLE_STAGE]
  >;
  const agingTokens =
    typeof req.query.agingBucket === "string"
      ? req.query.agingBucket
          .split(",")
          .map((token) => token.trim())
          .filter(Boolean)
      : [];
  const validAgingBuckets = agingTokens.filter((token) => ["0_30", "31_60", "61_90", "90_plus", "unknown"].includes(token));
  const qboTokens =
    typeof req.query.qboSyncStatus === "string"
      ? req.query.qboSyncStatus
          .split(",")
          .map((token) => token.trim())
          .filter(Boolean)
      : [];
  const validQboStatuses = qboTokens.filter((token) =>
    ["NOT_CONNECTED", "NOT_SYNCED", "SYNCING", "SYNCED", "FAILED"].includes(token)
  );

  const qbo = await getQuickbooksStatusForOrg(req.user!.orgId);
  const quickbooksConnected = qbo.enabled;

  const result = await listFinanceReceivables({
    orgId: req.user!.orgId,
    cursor,
    limit,
    search,
    stage: validStages.length ? validStages : undefined,
    readyState,
    blockerCode: blockerCode || undefined,
    agingBucket: validAgingBuckets.length ? (validAgingBuckets as any) : undefined,
    qboSyncStatus: validQboStatuses.length ? (validQboStatuses as any) : undefined,
    quickbooksConnected,
  });

  res.json({
    items: result.items,
    nextCursor: result.nextCursor,
    summaryCounters: result.summaryCounters,
    rows: result.items,
    pageInfo: { nextCursor: result.nextCursor, hasMore: result.hasMore },
  });
});

app.post(
  "/finance/receivables/bulk/generate-invoices",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "BILLING"),
  async (req, res) => {
    const schema = z.object({
      loadIds: z.array(z.string()).min(1),
      dry_run: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    const dryRun = Boolean(parsed.data.dry_run);
    const loadIds = Array.from(new Set(parsed.data.loadIds.map((id) => id.trim()).filter(Boolean)));
    const results: Array<{ loadId: string; ok: boolean; message: string; invoiceId?: string | null }> = [];
    for (const loadId of loadIds) {
      const load = await prisma.load.findFirst({
        where: { id: loadId, orgId: req.user!.orgId, deletedAt: null },
        select: { id: true, loadNumber: true, status: true },
      });
      if (!load) {
        results.push({ loadId, ok: false, message: "Load not found" });
        continue;
      }
      if (dryRun) {
        results.push({ loadId, ok: true, message: "Ready to generate invoice" });
        continue;
      }
      try {
        const invoiceResult = await generateInvoiceForLoad({
          orgId: req.user!.orgId,
          loadId,
          userId: req.user!.id,
          role: req.user!.role as Role,
        });
        if ("invoice" in invoiceResult && invoiceResult.invoice?.id) {
          await persistFinanceSnapshotForLoad({
            orgId: req.user!.orgId,
            loadId,
            quickbooksConnected: isQuickbooksConnectedFromEnv(),
          });
          await enqueueDispatchLoadUpdatedEvent(prisma as any, {
            orgId: req.user!.orgId,
            loadId,
            source: "finance.bulk.generate-invoices",
            trigger: "invoice_generated",
            dedupeSuffix: invoiceResult.invoice.id,
          });
          results.push({
            loadId,
            ok: true,
            message: "Invoice generated",
            invoiceId: invoiceResult.invoice.id,
          });
        } else {
          results.push({
            loadId,
            ok: false,
            message: `Missing required docs: ${(invoiceResult as any).missingDocs?.join(", ") || "unknown"}`,
          });
        }
      } catch (error) {
        results.push({ loadId, ok: false, message: (error as Error).message });
      }
    }
    const okCount = results.filter((row) => row.ok).length;
    res.json({
      dryRun,
      summary: {
        total: results.length,
        ok: okCount,
        failed: results.length - okCount,
      },
      results,
    });
  }
);

app.post(
  "/finance/receivables/bulk/qbo-sync",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "BILLING"),
  async (req, res) => {
    const schema = z.object({
      loadIds: z.array(z.string()).min(1),
      dry_run: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    if (!isQuickbooksConnectedFromEnv()) {
      res.status(400).json({ error: "QuickBooks is not connected" });
      return;
    }
    const dryRun = Boolean(parsed.data.dry_run);
    const loadIds = Array.from(new Set(parsed.data.loadIds.map((id) => id.trim()).filter(Boolean)));
    const results: Array<{ loadId: string; ok: boolean; message: string; jobId?: string | null }> = [];
    for (const loadId of loadIds) {
      const load = await prisma.load.findFirst({
        where: { id: loadId, orgId: req.user!.orgId, deletedAt: null },
        include: { invoices: { orderBy: { generatedAt: "desc" }, take: 1 } },
      });
      if (!load) {
        results.push({ loadId, ok: false, message: "Load not found" });
        continue;
      }
      const invoice = load.invoices[0] ?? null;
      if (!invoice) {
        results.push({ loadId, ok: false, message: "Invoice not found" });
        continue;
      }
      if (dryRun) {
        results.push({ loadId, ok: true, message: "Will enqueue QBO sync" });
        continue;
      }
      try {
        const job = await enqueueQboInvoiceSyncJob(prisma as any, {
          orgId: req.user!.orgId,
          invoiceId: invoice.id,
          reason: "finance.bulk.qbo-sync",
        });
        await enqueueQboSyncRequestedEvent(prisma as any, {
          orgId: req.user!.orgId,
          loadId: load.id,
          invoiceId: invoice.id,
          reason: "finance.bulk.qbo-sync",
          dedupeSuffix: job.id,
        });
        results.push({ loadId, ok: true, message: "Queued", jobId: job.id });
      } catch (error) {
        results.push({ loadId, ok: false, message: (error as Error).message });
      }
    }
    const okCount = results.filter((row) => row.ok).length;
    res.json({
      dryRun,
      summary: {
        total: results.length,
        ok: okCount,
        failed: results.length - okCount,
      },
      results,
    });
  }
);

app.post(
  "/finance/receivables/bulk/send-reminders",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "BILLING"),
  async (req, res) => {
    const schema = z.object({
      loadIds: z.array(z.string()).min(1),
      dry_run: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    const dryRun = Boolean(parsed.data.dry_run);
    const loadIds = Array.from(new Set(parsed.data.loadIds.map((id) => id.trim()).filter(Boolean)));
    const results: Array<{ loadId: string; ok: boolean; message: string }> = [];
    for (const loadId of loadIds) {
      const load = await prisma.load.findFirst({
        where: { id: loadId, orgId: req.user!.orgId, deletedAt: null },
        include: { invoices: { orderBy: { generatedAt: "desc" }, take: 1 } },
      });
      if (!load) {
        results.push({ loadId, ok: false, message: "Load not found" });
        continue;
      }
      const invoice = load.invoices[0] ?? null;
      if (!invoice || ![InvoiceStatus.SENT, InvoiceStatus.ACCEPTED, InvoiceStatus.DISPUTED].includes(invoice.status)) {
        results.push({ loadId, ok: false, message: "Invoice is not in reminder stage" });
        continue;
      }
      if (dryRun) {
        results.push({ loadId, ok: true, message: "Reminder validation passed" });
        continue;
      }
      results.push({ loadId, ok: true, message: "Reminder workflow stubbed (email integration pending recipient mapping)" });
    }
    const okCount = results.filter((row) => row.ok).length;
    res.json({
      dryRun,
      summary: {
        total: results.length,
        ok: okCount,
        failed: results.length - okCount,
      },
      results,
    });
  }
);

app.get("/finance/qbo/jobs", requireAuth, requireRole("ADMIN", "BILLING"), async (req, res) => {
  const statusParam = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "";
  const statusFilter =
    statusParam && ["QUEUED", "SYNCING", "SYNCED", "FAILED"].includes(statusParam)
      ? (statusParam as QboSyncJobStatus)
      : undefined;
  const jobs = await prisma.qboSyncJob.findMany({
    where: {
      orgId: req.user!.orgId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  res.json({ jobs });
});

app.post("/finance/qbo/jobs/:id/retry", requireAuth, requireCsrf, requireRole("ADMIN", "BILLING"), async (req, res) => {
  try {
    const job = await retryQboSyncJob({ orgId: req.user!.orgId, jobId: req.params.id });
    res.json({ job });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/finance/qbo/retry-failed", requireAuth, requireCsrf, requireRole("ADMIN", "BILLING"), async (req, res) => {
  const failed = await prisma.qboSyncJob.findMany({
    where: { orgId: req.user!.orgId, status: QboSyncJobStatus.FAILED },
    select: { id: true },
    take: 500,
  });
  for (const row of failed) {
    await retryQboSyncJob({ orgId: req.user!.orgId, jobId: row.id });
  }
  const processed = await processQueuedQboSyncJobs({ limit: 25 });
  res.json({
    retried: failed.length,
    processed,
  });
});

app.get("/internal/loads/:id/finance-snapshot", requireAuth, requireRole("ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"), async (req, res) => {
  const snapshot = await computeFinanceSnapshotForLoad({
    orgId: req.user!.orgId,
    loadId: req.params.id,
    quickbooksConnected: isQuickbooksConnectedFromEnv(),
  });
  if (!snapshot) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  res.json({ snapshot });
});

app.post(
  "/internal/dispatch-events",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "DISPATCHER", "HEAD_DISPATCHER"),
  async (req, res) => {
    const schema = z.object({
      loadId: z.string().min(1),
      trigger: z.string().min(1),
      source: z.string().min(1).default("dispatch.internal"),
      dedupeSuffix: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    const load = await prisma.load.findFirst({
      where: { id: parsed.data.loadId, orgId: req.user!.orgId, deletedAt: null },
      select: { id: true },
    });
    if (!load) {
      res.status(404).json({ error: "Load not found" });
      return;
    }
    const event = await enqueueDispatchLoadUpdatedEvent(prisma as any, {
      orgId: req.user!.orgId,
      loadId: load.id,
      source: parsed.data.source,
      trigger: parsed.data.trigger,
      dedupeSuffix: parsed.data.dedupeSuffix ?? null,
    });
    res.json({ event });
  }
);

app.get("/billing/readiness", requireAuth, requireRole("ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"), async (req, res) => {
  const qbo = await getQuickbooksStatusForOrg(req.user!.orgId);
  const quickbooksConnected = qbo.enabled;
  const result = await listFinanceReceivables({
    orgId: req.user!.orgId,
    limit: 500,
    quickbooksConnected,
  });
  res.json({ loads: mapReceivablesToLegacyReadiness(result.items, result.loadsById) });
});

app.get("/integrations/quickbooks/status", requireAuth, requireRole("ADMIN", "BILLING"), async (req, res) => {
  const qbo = await getQuickbooksStatusForOrg(req.user!.orgId);
  res.json({ enabled: qbo.enabled, companyId: qbo.companyId });
});

app.put("/integrations/quickbooks/status", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    companyId: z.union([z.string().trim().min(1), z.literal(""), z.null()]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({
    where: { orgId: req.user!.orgId },
    select: { id: true, quickbooksCompanyId: true },
  });
  if (!settings) {
    res.status(404).json({ error: "Settings not configured" });
    return;
  }
  const nextCompanyId = parsed.data.companyId?.trim() ? parsed.data.companyId.trim() : null;
  if (settings.quickbooksCompanyId === nextCompanyId) {
    const status = await getQuickbooksStatusForOrg(req.user!.orgId);
    res.json({ enabled: status.enabled, companyId: status.companyId });
    return;
  }
  await prisma.orgSettings.update({
    where: { orgId: req.user!.orgId },
    data: { quickbooksCompanyId: nextCompanyId },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "QUICKBOOKS_COMPANY_ID_UPDATED",
    entity: "OrgSettings",
    entityId: settings.id,
    summary: "Updated QuickBooks company ID",
    before: { quickbooksCompanyId: settings.quickbooksCompanyId },
    after: { quickbooksCompanyId: nextCompanyId },
  });
  const status = await getQuickbooksStatusForOrg(req.user!.orgId);
  res.json({ enabled: status.enabled, companyId: status.companyId });
});

app.get("/billing/queue", requireAuth, requirePermission(Permission.DOC_VERIFY, Permission.INVOICE_SEND), async (req, res) => {
  const qbo = await getQuickbooksStatusForOrg(req.user!.orgId);
  const quickbooksConnected = qbo.enabled;
  const result = await listFinanceReceivables({
    orgId: req.user!.orgId,
    limit: 500,
    quickbooksConnected,
  });
  const delivered: any[] = [];
  const ready: any[] = [];
  const invoiced: any[] = [];
  for (const row of result.items) {
    const load = result.loadsById.get(row.loadId);
    if (!load) continue;
    const legacyLoad = {
      ...load,
      billingStatus: row.readinessSnapshot.isReady ? BillingStatus.READY : BillingStatus.BLOCKED,
      billingBlockingReasons: row.readinessSnapshot.blockers.map((blocker) => blocker.message),
    };
    if (row.billingStage === FINANCE_RECEIVABLE_STAGE.READY) {
      ready.push(legacyLoad);
      continue;
    }
    if (
      row.billingStage === FINANCE_RECEIVABLE_STAGE.INVOICE_SENT ||
      row.billingStage === FINANCE_RECEIVABLE_STAGE.COLLECTED ||
      row.billingStage === FINANCE_RECEIVABLE_STAGE.SETTLED
    ) {
      invoiced.push(legacyLoad);
      continue;
    }
    delivered.push(legacyLoad);
  }
  res.json({ delivered, ready, invoiced });
});

const factoringSendPayloadSchema = z.object({
  toEmail: z.string().trim().email().optional(),
  ccEmails: z.array(z.string().trim().email()).optional(),
  override: z.boolean().optional(),
  overrideReason: z.string().trim().max(400).optional(),
});

async function sendLoadToFactoring(params: {
  orgId: string;
  userId: string;
  role: Role;
  loadId: string;
  input: z.infer<typeof factoringSendPayloadSchema>;
  retryMode?: boolean;
}) {
  const [load, settings] = await Promise.all([
    prisma.load.findFirst({
      where: { id: params.loadId, orgId: params.orgId },
      include: {
        stops: { orderBy: { sequence: "asc" } },
        docs: true,
        accessorials: true,
        invoices: { orderBy: { generatedAt: "desc" } },
      },
    }),
    prisma.orgSettings.findFirst({
      where: { orgId: params.orgId },
      select: {
        requiredDocs: true,
        ...FINANCE_POLICY_SELECT,
      },
    }),
  ]);
  if (!load) throw new Error("Load not found");
  if (!settings) throw new Error("Settings not configured");

  const policy = normalizeFinancePolicy(settings);
  if (!policy.factoringEnabled) throw new Error("Factoring is not enabled for this organization");

  const toEmail = params.input.toEmail?.trim() || policy.factoringEmail?.trim() || "";
  if (!toEmail) throw new Error("Factoring email is required");
  const ccEmails = (params.input.ccEmails ?? policy.factoringCcEmails ?? []).map((email) => email.trim()).filter(Boolean);

  const snapshot = await computeFinanceSnapshotForLoad({
    orgId: params.orgId,
    loadId: load.id,
    quickbooksConnected: isQuickbooksConnectedFromEnv(),
  });
  if (!snapshot) throw new Error("Finance snapshot unavailable");

  const overrideRequested = Boolean(params.input.override);
  const overrideAllowed = canRoleOverrideReadiness(policy, params.role as Role);
  const override = overrideRequested && overrideAllowed;
  if (overrideRequested && !overrideAllowed) {
    throw new Error("Readiness override is not allowed for this role");
  }
  if (override && !params.input.overrideReason?.trim()) {
    throw new Error("Override reason is required when readiness is overridden");
  }
  if (!snapshot.readinessSnapshot.isReady && !override) {
    throw new Error(
      `Load is not ready for factoring submission: ${snapshot.readinessSnapshot.blockers.map((b) => b.code).join(", ")}`
    );
  }
  if (!snapshot.factorReady) {
    throw new Error(`Load is not factor-ready: ${snapshot.factorReadyReasonCodes.join(", ") || "unknown reason"}`);
  }

  const invoice = load.invoices[0] ?? null;
  if (policy.requireInvoiceBeforeSend && !invoice) {
    throw new Error("Invoice must be generated before factoring submission");
  }

  let packetPath = invoice?.packetPath ?? null;
  let packetLink: string | null = null;
  const attachments: Array<{ filename: string; path: string }> = [];

  if (!packetPath && invoice?.pdfPath) {
    const packet = await generatePacketZip({
      orgId: params.orgId,
      invoiceNumber: invoice.invoiceNumber,
      invoicePath: invoice.pdfPath,
      loadId: load.id,
      requiredDocs: settings.requiredDocs,
    });
    if (packet.missing.length > 0) {
      throw new Error(`Missing required docs: ${packet.missing.join(", ")}`);
    }
    packetPath = packet.filePath ?? null;
    if (packetPath) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { packetPath },
      });
    }
  }

  if (policy.factoringAttachmentMode !== "LINK_ONLY" && !invoice?.pdfPath) {
    throw new Error("Invoice PDF is required for factoring attachments");
  }

  if (policy.factoringAttachmentMode === "ZIP") {
    if (!packetPath) {
      throw new Error("Packet not available for ZIP attachment mode");
    }
    attachments.push({
      filename: path.basename(packetPath),
      path: resolveUploadPath(packetPath),
    });
  } else if (policy.factoringAttachmentMode === "PDFS") {
    if (!invoice?.pdfPath) {
      throw new Error("Invoice PDF is required for PDF attachment mode");
    }
    attachments.push({
      filename: path.basename(invoice.pdfPath),
      path: resolveUploadPath(invoice.pdfPath),
    });
    for (const doc of load.docs.filter((item) => item.status === DocStatus.VERIFIED)) {
      attachments.push({
        filename: path.basename(doc.filename),
        path: resolveUploadPath(doc.filename),
      });
    }
  } else if (policy.factoringAttachmentMode === "LINK_ONLY") {
    const effectivePacketPath = packetPath ?? invoice?.packetPath ?? null;
    if (effectivePacketPath) {
      packetLink = buildFactoringPacketLink(params.orgId, effectivePacketPath);
    }
  }

  const latestSubmission = await prisma.billingSubmission.findFirst({
    where: {
      orgId: params.orgId,
      loadId: load.id,
      channel: BillingSubmissionChannel.FACTORING,
      status: BillingSubmissionStatus.SENT,
    },
    orderBy: { createdAt: "desc" },
  });
  const latestMatchesArtifacts =
    latestSubmission &&
    latestSubmission.invoiceId === (invoice?.id ?? null) &&
    latestSubmission.attachmentMode === policy.factoringAttachmentMode &&
    latestSubmission.packetPath === packetPath &&
    latestSubmission.packetLink === packetLink &&
    latestSubmission.toEmail === toEmail &&
    JSON.stringify(latestSubmission.ccEmails ?? []) === JSON.stringify(ccEmails);
  if (params.retryMode && latestMatchesArtifacts) {
    return { submission: latestSubmission, idempotent: true };
  }

  const subject = invoice
    ? `Factoring packet: ${invoice.invoiceNumber} / ${load.loadNumber}`
    : `Factoring packet: ${load.loadNumber}`;
  const lines = [
    `Load: ${load.loadNumber}`,
    invoice ? `Invoice: ${invoice.invoiceNumber}` : "Invoice: not generated",
    `Readiness: ${snapshot.readinessSnapshot.isReady ? "READY" : "BLOCKED"}`,
    "",
    override ? "Submitted with admin override." : "Submitted with readiness checks passed.",
    packetLink ? `Packet link: ${packetLink}` : "",
  ].filter(Boolean);
  const text = lines.join("\n");

  try {
    await sendOperationalEmail({
      to: toEmail,
      cc: ccEmails,
      subject,
      text,
      attachments: policy.factoringAttachmentMode === "LINK_ONLY" ? [] : attachments,
    });
    const submission = await prisma.billingSubmission.create({
      data: {
        orgId: params.orgId,
        loadId: load.id,
        invoiceId: invoice?.id ?? null,
        channel: BillingSubmissionChannel.FACTORING,
        status: BillingSubmissionStatus.SENT,
        toEmail,
        ccEmails,
        attachmentMode: policy.factoringAttachmentMode,
        packetPath,
        packetLink,
        createdById: params.userId,
      },
    });
    await logAudit({
      orgId: params.orgId,
      userId: params.userId,
      action: "FACTORING_PACKET_SENT",
      entity: "BillingSubmission",
      entityId: submission.id,
      summary: `Sent factoring packet for ${load.loadNumber}`,
      meta: {
        loadId: load.id,
        invoiceId: invoice?.id ?? null,
        attachmentMode: policy.factoringAttachmentMode,
        override,
        overrideReason: params.input.overrideReason?.trim() || null,
      },
    });
    await persistFinanceSnapshotForLoad({
      orgId: params.orgId,
      loadId: load.id,
      quickbooksConnected: isQuickbooksConnectedFromEnv(),
    });
    return { submission, idempotent: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const submission = await prisma.billingSubmission.create({
      data: {
        orgId: params.orgId,
        loadId: load.id,
        invoiceId: invoice?.id ?? null,
        channel: BillingSubmissionChannel.FACTORING,
        status: BillingSubmissionStatus.FAILED,
        toEmail,
        ccEmails,
        attachmentMode: policy.factoringAttachmentMode,
        packetPath,
        packetLink,
        errorMessage: message,
        createdById: params.userId,
      },
    });
    await logAudit({
      orgId: params.orgId,
      userId: params.userId,
      action: "FACTORING_PACKET_FAILED",
      entity: "BillingSubmission",
      entityId: submission.id,
      summary: `Factoring send failed for ${load.loadNumber}`,
      meta: { error: message, retryMode: Boolean(params.retryMode) },
    });
    throw new Error(message);
  }
}

app.get("/billing/loads/:id/factoring/history", requireAuth, requireRole("ADMIN", "BILLING"), async (req, res) => {
  const submissions = await prisma.billingSubmission.findMany({
    where: {
      orgId: req.user!.orgId,
      loadId: req.params.id,
      channel: BillingSubmissionChannel.FACTORING,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ submissions });
});

app.post(
  "/billing/loads/:id/factoring/retry",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "BILLING"),
  async (req, res) => {
    const parsed = factoringSendPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    try {
      const result = await sendLoadToFactoring({
        orgId: req.user!.orgId,
        userId: req.user!.id,
        role: req.user!.role as Role,
        loadId: req.params.id,
        input: parsed.data,
        retryMode: true,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

app.post(
  "/billing/loads/:id/send-to-factoring",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "BILLING"),
  async (req, res) => {
    const parsed = factoringSendPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    try {
      const result = await sendLoadToFactoring({
        orgId: req.user!.orgId,
        userId: req.user!.id,
        role: req.user!.role as Role,
        loadId: req.params.id,
        input: parsed.data,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

app.post(
  "/billing/readiness/:loadId/mark-invoiced",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "BILLING"),
  async (req, res) => {
    const load = await prisma.load.findFirst({
      where: { id: req.params.loadId, orgId: req.user!.orgId },
      select: { id: true, loadNumber: true, billingStatus: true },
    });
    if (!load) {
      res.status(404).json({ error: "Load not found" });
      return;
    }
    if (load.billingStatus !== BillingStatus.READY) {
      res.status(400).json({ error: "Load is not ready to bill" });
      return;
    }
    const updated = await prisma.load.update({
      where: { id: load.id },
      data: {
        billingStatus: BillingStatus.INVOICED,
        billingBlockingReasons: [],
        invoicedAt: new Date(),
      },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "BILLING_MARK_INVOICED",
      entity: "Load",
      entityId: updated.id,
      summary: `Marked ${load.loadNumber} invoiced`,
      before: { billingStatus: load.billingStatus },
      after: { billingStatus: updated.billingStatus, invoicedAt: updated.invoicedAt },
    });
    await persistFinanceSnapshotForLoad({
      orgId: req.user!.orgId,
      loadId: load.id,
      quickbooksConnected: isQuickbooksConnectedFromEnv(),
    });
    await enqueueFinanceStatusUpdatedEvent(prisma as any, {
      orgId: req.user!.orgId,
      loadId: load.id,
      stage: null,
      billingStatus: BillingStatus.INVOICED,
      dedupeSuffix: `mark-invoiced:${Date.now()}`,
    });
    res.json({ load: updated });
  }
);

app.get(
  "/finance/receivables/:loadId/payments",
  requireAuth,
  requireRole("ADMIN", "BILLING", "DISPATCHER", "HEAD_DISPATCHER"),
  async (req, res) => {
    const load = await prisma.load.findFirst({
      where: { id: req.params.loadId, orgId: req.user!.orgId, deletedAt: null },
      select: { id: true },
    });
    if (!load) {
      res.status(404).json({ error: "Load not found" });
      return;
    }
    const payments = await prisma.invoicePayment.findMany({
      where: { orgId: req.user!.orgId, loadId: load.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        invoiceId: true,
        amountCents: true,
        method: true,
        reference: true,
        notes: true,
        receivedAt: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    res.json({ payments });
  }
);

app.post(
  "/finance/receivables/:loadId/manual-payment",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "BILLING"),
  async (req, res) => {
    const schema = z.object({
      mode: z.enum(["FULL", "PARTIAL"]).default("FULL"),
      amountCents: z.number().int().positive().optional(),
      method: z.nativeEnum(FinancePaymentMethod).default(FinancePaymentMethod.OTHER),
      reference: z.string().trim().max(120).optional(),
      notes: z.string().trim().max(500).optional(),
      receivedAt: z.string().datetime().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    const load = await prisma.load.findFirst({
      where: { id: req.params.loadId, orgId: req.user!.orgId, deletedAt: null },
      select: { id: true, loadNumber: true, status: true },
    });
    if (!load) {
      res.status(404).json({ error: "Load not found" });
      return;
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        orgId: req.user!.orgId,
        loadId: load.id,
        status: { not: InvoiceStatus.VOID },
      },
      orderBy: { generatedAt: "desc" },
      include: {
        items: { select: { amount: true } },
      },
    });
    if (!invoice) {
      res.status(400).json({ error: "Invoice not found for load" });
      return;
    }

    const invoiceTotal = invoice.totalAmount
      ? toDecimal(invoice.totalAmount) ?? new Prisma.Decimal(0)
      : invoice.items.reduce((sum, item) => add(sum, item.amount), new Prisma.Decimal(0));
    const invoiceTotalCents = Math.max(0, Math.round(Number(invoiceTotal) * 100));
    if (invoiceTotalCents <= 0) {
      res.status(400).json({ error: "Invoice total must be greater than zero" });
      return;
    }

    const mode = parsed.data.mode;
    const receivedAt = parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime())) {
      res.status(400).json({ error: "Invalid receivedAt value" });
      return;
    }
    const reference = parsed.data.reference?.trim() || null;
    const notes = parsed.data.notes?.trim() || null;
    const method = parsed.data.method;

    let amountCents = invoiceTotalCents;
    if (mode === "PARTIAL") {
      if (!parsed.data.amountCents) {
        res.status(400).json({ error: "amountCents is required for partial payments" });
        return;
      }
      if (parsed.data.amountCents > invoiceTotalCents) {
        res.status(400).json({ error: "Payment amount cannot exceed invoice total" });
        return;
      }
      amountCents = parsed.data.amountCents;
    }

    if (amountCents <= 0) {
      res.status(400).json({ error: "Payment amount must be greater than zero" });
      return;
    }

    const duplicate = await prisma.invoicePayment.findFirst({
      where: {
        orgId: req.user!.orgId,
        loadId: load.id,
        invoiceId: invoice.id,
        amountCents,
        method,
        reference,
        receivedAt,
      },
      orderBy: { createdAt: "desc" },
    });
    if (duplicate) {
      res.json({
        ok: true,
        idempotent: true,
        payment: duplicate,
        invoice: {
          id: invoice.id,
          status: invoice.status,
          paidAt: invoice.paidAt,
          shortPaidAmount: invoice.shortPaidAmount,
        },
      });
      return;
    }

    const shortPaidCents = Math.max(0, invoiceTotalCents - amountCents);
    const nextStatus = shortPaidCents > 0 ? InvoiceStatus.SHORT_PAID : InvoiceStatus.PAID;
    const paymentRef =
      reference ||
      (invoice.paymentRef && invoice.paymentRef.trim().length > 0 ? invoice.paymentRef : method);

    const [updatedInvoice, payment] = await prisma.$transaction(async (tx) => {
      const nextInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: nextStatus,
          paidAt: receivedAt,
          paymentRef,
          shortPaidAmount:
            shortPaidCents > 0 ? new Prisma.Decimal(shortPaidCents).div(100) : null,
        },
      });
      const nextPayment = await tx.invoicePayment.create({
        data: {
          orgId: req.user!.orgId,
          loadId: load.id,
          invoiceId: invoice.id,
          amountCents,
          method,
          reference,
          notes,
          receivedAt,
          createdById: req.user!.id,
        },
      });
      return [nextInvoice, nextPayment] as const;
    });

    if (load.status !== LoadStatus.PAID) {
      await transitionLoadStatus({
        load,
        nextStatus: LoadStatus.PAID,
        userId: req.user!.id,
        orgId: req.user!.orgId,
        role: req.user!.role as Role,
        message: `Manual payment recorded for ${load.loadNumber}`,
      });
    }

    await createEvent({
      orgId: req.user!.orgId,
      loadId: load.id,
      userId: req.user!.id,
      invoiceId: invoice.id,
      type: EventType.INVOICE_GENERATED,
      message: `Manual payment recorded (${nextStatus})`,
      meta: {
        mode,
        amountCents,
        method,
        reference,
        receivedAt: receivedAt.toISOString(),
      },
    });

    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "FINANCE_MANUAL_PAYMENT_RECORDED",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Manual payment recorded for ${load.loadNumber}`,
      before: {
        status: invoice.status,
        paidAt: invoice.paidAt,
        shortPaidAmount: invoice.shortPaidAmount,
        paymentRef: invoice.paymentRef,
      },
      after: {
        status: updatedInvoice.status,
        paidAt: updatedInvoice.paidAt,
        shortPaidAmount: updatedInvoice.shortPaidAmount,
        paymentRef: updatedInvoice.paymentRef,
        payment: {
          id: payment.id,
          amountCents: payment.amountCents,
          method: payment.method,
          reference: payment.reference,
          notes: payment.notes,
          receivedAt: payment.receivedAt,
        },
      },
    });

    await refreshFinanceAfterMutation({
      orgId: req.user!.orgId,
      loadId: load.id,
      source: "finance.manual-payment",
      trigger: nextStatus,
      dedupeSuffix: payment.id,
    });

    res.json({
      ok: true,
      idempotent: false,
      payment: {
        id: payment.id,
        invoiceId: payment.invoiceId,
        amountCents: payment.amountCents,
        method: payment.method,
        reference: payment.reference,
        notes: payment.notes,
        receivedAt: payment.receivedAt,
        createdAt: payment.createdAt,
      },
      invoice: {
        id: updatedInvoice.id,
        status: updatedInvoice.status,
        paidAt: updatedInvoice.paidAt,
        shortPaidAmount: updatedInvoice.shortPaidAmount,
        paymentRef: updatedInvoice.paymentRef,
      },
    });
  }
);

app.post(
  "/billing/readiness/:loadId/quickbooks",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "BILLING"),
  async (req, res) => {
    const load = await prisma.load.findFirst({
      where: { id: req.params.loadId, orgId: req.user!.orgId },
      select: { id: true, loadNumber: true, billingStatus: true },
    });
    if (!load) {
      res.status(404).json({ error: "Load not found" });
      return;
    }
    if (load.billingStatus !== BillingStatus.READY) {
      res.status(400).json({ error: "Load is not ready to bill" });
      return;
    }
    try {
      const qbo = await getQuickbooksStatusForOrg(req.user!.orgId);
      if (!qbo.enabled) {
        res.status(400).json({ error: "QuickBooks is not connected" });
        return;
      }
      const invoice = await prisma.invoice.findFirst({
        where: { orgId: req.user!.orgId, loadId: load.id },
        orderBy: { generatedAt: "desc" },
        select: { id: true },
      });
      if (!invoice) {
        res.status(400).json({ error: "Invoice not found for load" });
        return;
      }
      const job = await enqueueQboInvoiceSyncJob(prisma as any, {
        orgId: req.user!.orgId,
        invoiceId: invoice.id,
        reason: "billing.readiness.quickbooks",
      });
      await enqueueQboSyncRequestedEvent(prisma as any, {
        orgId: req.user!.orgId,
        loadId: load.id,
        invoiceId: invoice.id,
        reason: "billing.readiness.quickbooks",
        dedupeSuffix: job.id,
      });
      const processed = await processQueuedQboSyncJobs({ limit: 1 });
      const refreshed = await prisma.load.findFirst({
        where: { id: load.id, orgId: req.user!.orgId },
        select: { id: true, externalInvoiceRef: true, qboSyncStatus: true, qboSyncLastError: true },
      });
      res.json({
        load: refreshed,
        job,
        processed,
        externalInvoiceRef: refreshed?.externalInvoiceRef ?? null,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

async function generateInvoiceForLoad(params: { orgId: string; loadId: string; userId: string; role: Role }) {
  const load = await prisma.load.findFirst({
    where: { id: params.loadId, orgId: params.orgId },
    include: { stops: true, customer: true, operatingEntity: true },
  });
  if (!load) {
    throw new Error("Load not found");
  }
  let operatingEntity = load.operatingEntity;
  if (!operatingEntity) {
    operatingEntity = await ensureDefaultOperatingEntity(params.orgId);
    await prisma.load.update({
      where: { id: load.id },
      data: { operatingEntityId: operatingEntity.id },
    });
  }
  const existingInvoice = await prisma.invoice.findFirst({
    where: { loadId: load.id, orgId: params.orgId },
    include: { items: true },
  });
  if (existingInvoice) {
    let hydratedInvoice = existingInvoice;
    if (!hydratedInvoice.pdfPath || !hydratedInvoice.packetPath) {
      const settings = await prisma.orgSettings.findFirst({ where: { orgId: params.orgId } });
      if (!settings) {
        throw new Error("Settings not configured");
      }

      const fallbackLinehaul = toDecimal(load.rate) ?? hydratedInvoice.totalAmount ?? new Prisma.Decimal(0);
      const invoiceLineItems =
        hydratedInvoice.items.length > 0
          ? hydratedInvoice.items
          : [
              {
                id: `linehaul-fallback-${hydratedInvoice.id}`,
                invoiceId: hydratedInvoice.id,
                code: "LINEHAUL",
                description: "Linehaul",
                quantity: new Prisma.Decimal(1),
                rate: fallbackLinehaul,
                amount: hydratedInvoice.totalAmount ?? fallbackLinehaul,
              },
            ];
      const totalAmount =
        hydratedInvoice.totalAmount ??
        invoiceLineItems.reduce((sum, item) => add(sum, item.amount ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));

      let pdfPath = hydratedInvoice.pdfPath ?? null;
      if (!pdfPath) {
        const generatedPdf = await generateInvoicePdf({
          orgId: params.orgId,
          invoiceNumber: hydratedInvoice.invoiceNumber,
          load,
          stops: load.stops,
          settings,
          operatingEntity,
          items: invoiceLineItems,
          totalAmount,
        });
        pdfPath = generatedPdf.filePath;
      }

      let packetPath = hydratedInvoice.packetPath ?? null;
      if (!packetPath && pdfPath) {
        const packet = await generatePacketZip({
          orgId: params.orgId,
          invoiceNumber: hydratedInvoice.invoiceNumber,
          invoicePath: pdfPath,
          loadId: load.id,
          requiredDocs: settings.requiredDocs,
        });
        packetPath = packet.filePath ?? null;
      }

      hydratedInvoice = await prisma.invoice.update({
        where: { id: hydratedInvoice.id },
        data: {
          pdfPath,
          packetPath,
        },
        include: { items: true },
      });
    }

    if (![LoadStatus.INVOICED, LoadStatus.PAID].includes(load.status)) {
      await transitionLoadStatus({
        load: { id: load.id, loadNumber: load.loadNumber, status: load.status },
        nextStatus: LoadStatus.INVOICED,
        userId: params.userId,
        orgId: params.orgId,
        role: params.role,
        message: `Invoice exists for ${load.loadNumber}`,
      });
    }
    if (isQuickbooksConnectedFromEnv()) {
      const job = await enqueueQboInvoiceSyncJob(prisma as any, {
        orgId: params.orgId,
        invoiceId: hydratedInvoice.id,
        reason: "invoice.generate.existing",
      });
      await enqueueQboSyncRequestedEvent(prisma as any, {
        orgId: params.orgId,
        loadId: load.id,
        invoiceId: hydratedInvoice.id,
        reason: "invoice.generate.existing",
        dedupeSuffix: job.id,
      });
    }
    await persistFinanceSnapshotForLoad({
      orgId: params.orgId,
      loadId: load.id,
      quickbooksConnected: isQuickbooksConnectedFromEnv(),
    });
    await enqueueDispatchLoadUpdatedEvent(prisma as any, {
      orgId: params.orgId,
      loadId: load.id,
      source: "finance.invoice",
      trigger: "invoice_generated",
      dedupeSuffix: hydratedInvoice.id,
    });
    return { invoice: hydratedInvoice, missingDocs: [] } as const;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: params.orgId } });
  if (!settings) {
    throw new Error("Settings not configured");
  }
  const docs = await prisma.document.findMany({ where: { loadId: load.id, orgId: params.orgId } });
  const missingDocs = settings.requiredDocs.filter(
    (docType) => !docs.some((doc) => doc.type === (docType as DocType) && doc.status === DocStatus.VERIFIED)
  );
  if (missingDocs.length > 0) {
    for (const docType of missingDocs) {
      await ensureTask({
        orgId: params.orgId,
        loadId: load.id,
        type: TaskType.MISSING_DOC,
        title: `Missing doc ${docType}`,
        priority: TaskPriority.HIGH,
        assignedRole: "BILLING",
        createdById: params.userId,
        dedupeKey: `MISSING_DOC:${docType}:load:${load.id}`,
      });
    }
    return { missingDocs } as const;
  }
  const chargeLabels: Record<LoadChargeType, string> = {
    LINEHAUL: "Linehaul",
    LUMPER: "Lumper",
    DETENTION: "Detention",
    LAYOVER: "Layover",
    OTHER: "Other",
    ADJUSTMENT: "Adjustment",
  };
  const charges = await prisma.loadCharge.findMany({
    where: { orgId: params.orgId, loadId: load.id },
    orderBy: { createdAt: "asc" },
  });
  const linehaul = toDecimal(load.rate);
  const hasLinehaulCharge = charges.some((charge) => charge.type === LoadChargeType.LINEHAUL);
  const chargeItems = charges.map((charge) => {
    const amount = new Prisma.Decimal(charge.amountCents).div(100);
    return {
      code: charge.type,
      description: charge.description || chargeLabels[charge.type],
      quantity: new Prisma.Decimal(1),
      rate: amount,
      amount,
    };
  });
  const lineItems =
    !hasLinehaulCharge && linehaul && !linehaul.isZero()
      ? [
          {
            code: "LINEHAUL",
            description: chargeLabels.LINEHAUL,
            quantity: new Prisma.Decimal(1),
            rate: linehaul,
            amount: linehaul,
          },
          ...chargeItems,
        ]
      : chargeItems.length > 0
      ? chargeItems
      : [
          {
            code: "LINEHAUL",
            description: chargeLabels.LINEHAUL,
            quantity: new Prisma.Decimal(1),
            rate: linehaul ?? new Prisma.Decimal(0),
            amount: linehaul ?? new Prisma.Decimal(0),
          },
        ];
  const totalAmount = lineItems.reduce((sum, item) => add(sum, item.amount), new Prisma.Decimal(0));

  const invoiceResult = await prisma.$transaction(async (tx) => {
    const rows = (await tx.$queryRaw`
      SELECT "id", "invoicePrefix", "nextInvoiceNumber"
      FROM "OrgSettings"
      WHERE "orgId" = ${params.orgId}
      FOR UPDATE
    `) as { id: string; invoicePrefix: string; nextInvoiceNumber: number }[];
    const row = rows[0];
    if (!row) {
      throw new Error("Settings not configured");
    }
    const nextNumber = row.nextInvoiceNumber;
    await tx.orgSettings.update({
      where: { orgId: params.orgId },
      data: { nextInvoiceNumber: nextNumber + 1 },
    });
    const invoiceNumber = `${row.invoicePrefix}${String(nextNumber).padStart(4, "0")}`;
    const invoice = await tx.invoice.create({
      data: {
        orgId: params.orgId,
        loadId: load.id,
        invoiceNumber,
        totalAmount,
        items: {
          create: lineItems,
        },
      },
    });
    return { invoice, invoiceNumber };
  });

  const { filePath } = await generateInvoicePdf({
    orgId: params.orgId,
    invoiceNumber: invoiceResult.invoiceNumber,
    load,
    stops: load.stops,
    settings,
    operatingEntity,
    items: lineItems,
    totalAmount,
  });

  const packet = await generatePacketZip({
    orgId: params.orgId,
    invoiceNumber: invoiceResult.invoiceNumber,
    invoicePath: filePath,
    loadId: load.id,
    requiredDocs: settings.requiredDocs,
  });

  const invoice = await prisma.invoice.update({
    where: { id: invoiceResult.invoice.id },
    data: { pdfPath: filePath, packetPath: packet.filePath ?? null },
  });

  await transitionLoadStatus({
    load: { id: load.id, loadNumber: load.loadNumber, status: load.status },
    nextStatus: LoadStatus.INVOICED,
    userId: params.userId,
    orgId: params.orgId,
    role: params.role,
    message: `Invoice ${invoiceResult.invoiceNumber} generated`,
  });

  await createEvent({
    orgId: params.orgId,
    loadId: load.id,
    userId: params.userId,
    invoiceId: invoice.id,
    type: EventType.INVOICE_GENERATED,
    message: `Invoice ${invoiceResult.invoiceNumber} generated`,
  });

  if (packet.filePath) {
    await createEvent({
      orgId: params.orgId,
      loadId: load.id,
      userId: params.userId,
      invoiceId: invoice.id,
      type: EventType.PACKET_GENERATED,
      message: `Packet ${invoiceResult.invoiceNumber} generated`,
    });
  } else if (packet.missing.length > 0) {
    for (const docType of packet.missing) {
      await ensureTask({
        orgId: params.orgId,
        loadId: load.id,
        type: TaskType.MISSING_DOC,
        title: `Missing doc ${docType}`,
        priority: TaskPriority.HIGH,
        assignedRole: "BILLING",
        createdById: params.userId,
        dedupeKey: `MISSING_DOC:${docType}:load:${load.id}`,
      });
    }
  }

  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "INVOICE_GENERATED",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Generated invoice ${invoiceResult.invoiceNumber} for ${load.loadNumber}`,
    after: { invoiceNumber: invoice.invoiceNumber, status: invoice.status },
  });

  if (isQuickbooksConnectedFromEnv()) {
    const job = await enqueueQboInvoiceSyncJob(prisma as any, {
      orgId: params.orgId,
      invoiceId: invoice.id,
      reason: "invoice.generate.new",
    });
    await enqueueQboSyncRequestedEvent(prisma as any, {
      orgId: params.orgId,
      loadId: load.id,
      invoiceId: invoice.id,
      reason: "invoice.generate.new",
      dedupeSuffix: job.id,
    });
  }
  await persistFinanceSnapshotForLoad({
    orgId: params.orgId,
    loadId: load.id,
    quickbooksConnected: isQuickbooksConnectedFromEnv(),
  });
  await enqueueDispatchLoadUpdatedEvent(prisma as any, {
    orgId: params.orgId,
    loadId: load.id,
    source: "finance.invoice",
    trigger: "invoice_generated",
    dedupeSuffix: invoice.id,
  });

  return { invoice, missingDocs: packet.missing } as const;
}

app.post(
  "/billing/invoices/:loadId/generate",
  requireAuth,
  requireOperationalOrg,
  requireCsrf,
  requirePermission(Permission.INVOICE_GENERATE),
  async (req, res) => {
  try {
    const result = await generateInvoiceForLoad({
      orgId: req.user!.orgId,
      loadId: req.params.loadId,
      userId: req.user!.id,
      role: req.user!.role as Role,
    });
    if ("missingDocs" in result && result.missingDocs.length > 0) {
      res.status(400).json({ error: "Missing required docs", missingDocs: result.missingDocs });
      return;
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post(
  "/billing/invoices/:invoiceId/packet",
  requireAuth,
  requireOperationalOrg,
  requireCsrf,
  requirePermission(Permission.INVOICE_SEND),
  async (req, res) => {
  let invoice;
  try {
    invoice = await requireOrgEntity(prisma.invoice, req.user!.orgId, req.params.invoiceId, "Invoice");
  } catch {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (!invoice.pdfPath) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  if (!settings) {
    res.status(400).json({ error: "Settings not configured" });
    return;
  }
  const packet = await generatePacketZip({
    orgId: req.user!.orgId,
    invoiceNumber: invoice.invoiceNumber,
    invoicePath: invoice.pdfPath,
    loadId: invoice.loadId,
    requiredDocs: settings.requiredDocs,
  });
  if (packet.missing.length > 0) {
    for (const docType of packet.missing) {
      await ensureTask({
        orgId: req.user!.orgId,
        loadId: invoice.loadId,
        type: TaskType.MISSING_DOC,
        title: `Missing doc ${docType}`,
        priority: TaskPriority.HIGH,
        assignedRole: "BILLING",
        createdById: req.user!.id,
        dedupeKey: `MISSING_DOC:${docType}:load:${invoice.loadId}`,
      });
    }
    res.status(400).json({ error: "Missing required docs", missingDocs: packet.missing });
    return;
  }
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { packetPath: packet.filePath },
  });
  await createEvent({
    orgId: req.user!.orgId,
    loadId: invoice.loadId,
    userId: req.user!.id,
    invoiceId: invoice.id,
    type: EventType.PACKET_GENERATED,
    message: `Packet ${invoice.invoiceNumber} generated`,
  });
  res.json({ packetPath: packet.filePath });
});

app.post(
  "/billing/invoices/:invoiceId/status",
  requireAuth,
  requireOperationalOrg,
  requirePermission(Permission.INVOICE_SEND, Permission.INVOICE_VOID),
  requireCsrf,
  async (req, res) => {
    const schema = z.object({
      status: z.enum(["SENT", "ACCEPTED", "DISPUTED", "PAID", "SHORT_PAID", "VOID"]),
      disputeReason: z.string().optional(),
      disputeNotes: z.string().optional(),
      paymentRef: z.string().optional(),
      shortPaidAmount: z.union([z.number(), z.string()]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    const requiredPermission =
      parsed.data.status === "VOID" ? Permission.INVOICE_VOID : Permission.INVOICE_SEND;
    if (!hasPermission(req.user, requiredPermission)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    let invoice;
    try {
      invoice = await requireOrgEntity(prisma.invoice, req.user!.orgId, req.params.invoiceId, "Invoice");
    } catch {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    if (parsed.data.status === "DISPUTED" && !parsed.data.disputeReason) {
      res.status(400).json({ error: "Dispute reason required" });
      return;
    }
    if (parsed.data.status === "SHORT_PAID" && parsed.data.shortPaidAmount === undefined) {
      res.status(400).json({ error: "shortPaidAmount required" });
      return;
    }

    const beforeStatus = invoice.status;
    const data: any = {
      status: parsed.data.status as InvoiceStatus,
    };
    if (parsed.data.status === "SENT" && !invoice.sentAt) {
      data.sentAt = new Date();
    }
    if (parsed.data.status === "PAID" || parsed.data.status === "SHORT_PAID") {
      data.paidAt = new Date();
      data.paymentRef = parsed.data.paymentRef ?? invoice.paymentRef;
      data.shortPaidAmount = parsed.data.shortPaidAmount
        ? toDecimal(parsed.data.shortPaidAmount)
        : invoice.shortPaidAmount;
    }
    if (parsed.data.status === "DISPUTED") {
      data.disputeReason = parsed.data.disputeReason;
      data.disputeNotes = parsed.data.disputeNotes ?? null;
    }
    if (parsed.data.status === "VOID") {
      data.voidedAt = new Date();
    }

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data,
    });

    if (parsed.data.status === "SENT") {
      await prisma.load.updateMany({
        where: { id: invoice.loadId, orgId: req.user!.orgId, lockedAt: null },
        data: { lockedAt: new Date() },
      });
    }
    if (parsed.data.status === "DISPUTED") {
      await ensureTask({
        orgId: req.user!.orgId,
        invoiceId: invoice.id,
        loadId: invoice.loadId,
        type: TaskType.INVOICE_DISPUTE,
        title: `Invoice ${invoice.invoiceNumber} disputed`,
        priority: TaskPriority.HIGH,
        assignedRole: "BILLING",
        createdById: req.user!.id,
        dedupeKey: `INVOICE_DISPUTE:invoice:${invoice.id}`,
      });
    }

    if (parsed.data.status === "PAID" || parsed.data.status === "SHORT_PAID") {
      const load = await prisma.load.findFirst({
        where: { id: invoice.loadId, orgId: req.user!.orgId },
        select: { id: true, loadNumber: true, status: true },
      });
      if (load && load.status !== LoadStatus.PAID) {
        await transitionLoadStatus({
          load,
          nextStatus: LoadStatus.PAID,
          userId: req.user!.id,
          orgId: req.user!.orgId,
          role: req.user!.role as Role,
          message: `Load ${load.loadNumber} paid`,
        });
      }
    }

    await createEvent({
      orgId: req.user!.orgId,
      loadId: invoice.loadId,
      userId: req.user!.id,
      invoiceId: invoice.id,
      type: EventType.INVOICE_GENERATED,
      message: `Invoice ${invoice.invoiceNumber} status ${parsed.data.status}`,
      meta: { status: parsed.data.status },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "INVOICE_STATUS",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Invoice ${invoice.invoiceNumber} status ${parsed.data.status}`,
      before: { status: beforeStatus },
      after: { status: updated.status },
    });

    if (parsed.data.status === "SENT" && isQuickbooksConnectedFromEnv()) {
      const job = await enqueueQboInvoiceSyncJob(prisma as any, {
        orgId: req.user!.orgId,
        invoiceId: invoice.id,
        reason: "invoice.status.sent",
      });
      await enqueueQboSyncRequestedEvent(prisma as any, {
        orgId: req.user!.orgId,
        loadId: invoice.loadId,
        invoiceId: invoice.id,
        reason: "invoice.status.sent",
        dedupeSuffix: job.id,
      });
    }
    await refreshFinanceAfterMutation({
      orgId: req.user!.orgId,
      loadId: invoice.loadId,
      source: "finance.invoice-status",
      trigger: parsed.data.status,
      dedupeSuffix: invoice.id,
    });
    res.json({ invoice: updated });
  }
);

app.get("/invoices/:id/pdf", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  let invoice;
  try {
    invoice = await requireOrgEntity(prisma.invoice, req.user!.orgId, req.params.id, "Invoice");
  } catch {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (!invoice.pdfPath) {
    res.status(404).json({ error: "Invoice PDF not found" });
    return;
  }
  let relativePath = toRelativeUploadPath(invoice.pdfPath);
  if (!relativePath) {
    res.status(404).json({ error: "Invoice PDF not found" });
    return;
  }
  if (!relativePath.startsWith("invoices/") && !relativePath.startsWith("org/")) {
    relativePath = path.posix.join("invoices", path.basename(relativePath));
  }
  const baseDir = getUploadDir();
  let filePath: string;
  try {
    filePath = resolveUploadPath(relativePath);
  } catch {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }
  console.log("Invoice PDF", { baseDir, filePath });
  let stat;
  try {
    stat = await fsPromises.stat(filePath);
  } catch {
    res.status(404).json({ error: "Invoice PDF not found" });
    return;
  }
  if (stat.size === 0) {
    res.status(404).json({ error: "Invoice PDF not found" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}.pdf"`);
  res.setHeader("Cache-Control", "private, no-store");
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(404).json({ error: "Invoice PDF not found" });
    } else {
      res.end();
    }
  });
  stream.pipe(res);
});

type PayablePreviewLine = {
  partyType: PayablePartyType;
  partyId: string;
  loadId: string | null;
  type: PayableLineItemType;
  amountCents: number;
  memo: string | null;
  source: Prisma.JsonObject;
};

async function buildPayablePreviewLines(params: { orgId: string; periodStart: Date; periodEnd: Date }) {
  const settlements = await prisma.settlement.findMany({
    where: {
      orgId: params.orgId,
      periodStart: { gte: params.periodStart },
      periodEnd: { lte: params.periodEnd },
    },
    include: { items: true },
    orderBy: [{ driverId: "asc" }, { periodStart: "asc" }],
  });
  const lines: PayablePreviewLine[] = [];
  for (const settlement of settlements) {
    if (settlement.items.length > 0) {
      for (const item of settlement.items) {
        const rawAmount = Number(item.amount);
        const type = rawAmount >= 0 ? PayableLineItemType.EARNING : PayableLineItemType.DEDUCTION;
        lines.push({
          partyType: PayablePartyType.DRIVER,
          partyId: settlement.driverId,
          loadId: item.loadId ?? null,
          type,
          amountCents: Math.abs(Math.round(rawAmount * 100)),
          memo: item.description ?? item.code,
          source: {
            settlementId: settlement.id,
            settlementItemId: item.id,
          },
        });
      }
      continue;
    }
    const netAmount = Number(settlement.net ?? settlement.gross ?? 0);
    if (Math.round(netAmount * 100) === 0) continue;
    const type = netAmount >= 0 ? PayableLineItemType.EARNING : PayableLineItemType.DEDUCTION;
    lines.push({
      partyType: PayablePartyType.DRIVER,
      partyId: settlement.driverId,
      loadId: null,
      type,
      amountCents: Math.abs(Math.round(netAmount * 100)),
      memo: `Settlement ${settlement.id}`,
      source: { settlementId: settlement.id },
    });
  }
  lines.sort((a, b) => payableLineFingerprint(a).localeCompare(payableLineFingerprint(b)));
  return lines;
}

type PayableAnomaly = {
  code: string;
  severity: "warning" | "critical";
  message: string;
  partyId?: string;
  meta?: Record<string, unknown>;
};

function detectPayableAnomalies(lines: PayablePreviewLine[]): PayableAnomaly[] {
  const anomalies: PayableAnomaly[] = [];
  const netByParty = new Map<string, number>();
  const absoluteAmounts: number[] = [];

  for (const line of lines) {
    const signed = line.type === PayableLineItemType.DEDUCTION ? -line.amountCents : line.amountCents;
    const partyKey = `${line.partyType}:${line.partyId}`;
    netByParty.set(partyKey, (netByParty.get(partyKey) ?? 0) + signed);
    absoluteAmounts.push(Math.abs(line.amountCents));
    if ((line.type === PayableLineItemType.DEDUCTION || line.type === PayableLineItemType.REIMBURSEMENT) && !line.loadId) {
      anomalies.push({
        code: "MISSING_LINKAGE",
        severity: "warning",
        message: `${line.type} line item has no load linkage`,
        partyId: line.partyId,
        meta: { lineMemo: line.memo ?? null },
      });
    }
  }

  for (const [partyKey, net] of netByParty) {
    if (net < 0) {
      anomalies.push({
        code: "NEGATIVE_NET",
        severity: "critical",
        message: `Net payable is negative for ${partyKey}`,
        partyId: partyKey.split(":")[1],
        meta: { netCents: net },
      });
    }
  }

  const medianAmount = median(absoluteAmounts) ?? 0;
  if (medianAmount > 0) {
    for (const line of lines) {
      if (line.amountCents > medianAmount * 3 && line.amountCents >= 100_000) {
        anomalies.push({
          code: "AMOUNT_SPIKE",
          severity: "warning",
          message: `Amount spike detected on ${line.partyType} ${line.partyId}`,
          partyId: line.partyId,
          meta: { amountCents: line.amountCents, medianCents: medianAmount },
        });
      }
    }
  }

  return anomalies;
}


app.get("/payables/runs", requireAuth, requirePermission(Permission.SETTLEMENT_GENERATE), async (req, res) => {
  const runs = await prisma.payableRun.findMany({
    where: { orgId: req.user!.orgId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      lineItems: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const payload = runs.map((run) => {
    let earnings = 0;
    let deductions = 0;
    let reimbursements = 0;
    for (const item of run.lineItems) {
      if (item.type === PayableLineItemType.EARNING) earnings += item.amountCents;
      else if (item.type === PayableLineItemType.DEDUCTION) deductions += item.amountCents;
      else reimbursements += item.amountCents;
    }
    return {
      id: run.id,
      orgId: run.orgId,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      status: run.status,
      previewChecksum: run.previewChecksum,
      finalizedChecksum: run.finalizedChecksum,
      holdReasonCode: run.holdReasonCode,
      holdOwner: run.holdOwner,
      holdNotes: run.holdNotes,
      anomalyCount: run.anomalyCount,
      finalizedAt: run.finalizedAt,
      paidAt: run.paidAt,
      createdAt: run.createdAt,
      createdBy: run.createdBy,
      totals: {
        earningsCents: earnings,
        deductionsCents: deductions,
        reimbursementsCents: reimbursements,
        netCents: earnings + reimbursements - deductions,
      },
      lineItemCount: run.lineItems.length,
    };
  });

  res.json({ runs: payload });
});

app.post("/payables/runs", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_GENERATE), async (req, res) => {
  const schema = z.object({
    periodStart: z.string().min(1),
    periodEnd: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const periodStart = parseDateInput(parsed.data.periodStart, "start");
  const periodEnd = parseDateInput(parsed.data.periodEnd, "end");
  if (!periodStart || !periodEnd || periodStart > periodEnd) {
    res.status(400).json({ error: "Invalid period range" });
    return;
  }

  const run = await prisma.payableRun.create({
    data: {
      orgId: req.user!.orgId,
      periodStart,
      periodEnd,
      status: PayableRunStatus.PAYABLE_READY,
      createdById: req.user!.id,
    },
  });

  const latestPolicy = await prisma.settlementPolicyVersion.findFirst({
    where: { orgId: req.user!.orgId },
    orderBy: { version: "desc" },
  });
  if (!latestPolicy) {
    await prisma.settlementPolicyVersion.create({
      data: {
        orgId: req.user!.orgId,
        version: 1,
        effectiveFrom: new Date(),
        rulesJson: { source: "legacy_settlement_engine_v1" },
        createdById: req.user!.id,
      },
    });
  }

  res.json({ run });
});

app.get("/payables/runs/:id", requireAuth, requirePermission(Permission.SETTLEMENT_GENERATE), async (req, res) => {
  const run = await prisma.payableRun.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      lineItems: { orderBy: [{ partyType: "asc" }, { partyId: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  let earnings = 0;
  let deductions = 0;
  let reimbursements = 0;
  for (const item of run.lineItems) {
    if (item.type === PayableLineItemType.EARNING) earnings += item.amountCents;
    else if (item.type === PayableLineItemType.DEDUCTION) deductions += item.amountCents;
    else reimbursements += item.amountCents;
  }
  res.json({
    run: {
      id: run.id,
      orgId: run.orgId,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      status: run.status,
      previewChecksum: run.previewChecksum,
      finalizedChecksum: run.finalizedChecksum,
      holdReasonCode: run.holdReasonCode,
      holdOwner: run.holdOwner,
      holdNotes: run.holdNotes,
      anomalyCount: run.anomalyCount,
      anomalies: Array.isArray(run.anomaliesJson) ? run.anomaliesJson : [],
      finalizedAt: run.finalizedAt,
      paidAt: run.paidAt,
      createdAt: run.createdAt,
      createdBy: run.createdBy,
      totals: {
        earningsCents: earnings,
        deductionsCents: deductions,
        reimbursementsCents: reimbursements,
        netCents: earnings + reimbursements - deductions,
      },
      lineItems: run.lineItems,
    },
  });
});

app.post("/payables/runs/:id/preview", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_GENERATE), async (req, res) => {
  const run = await prisma.payableRun.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    include: { lineItems: true },
  });
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  if (run.status === PayableRunStatus.PAID) {
    res.status(400).json({ error: "Paid run cannot be previewed" });
    return;
  }

  const previewLines = await buildPayablePreviewLines({
    orgId: req.user!.orgId,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
  });
  const previewChecksum = buildPayableChecksum(previewLines);
  const previousFingerprints = run.lineItems.map((item) => payableLineFingerprint(item));
  const nextFingerprints = previewLines.map((item) => payableLineFingerprint(item));
  const diff = diffPayableLineFingerprints(previousFingerprints, nextFingerprints);
  const anomalies = detectPayableAnomalies(previewLines);
  const holdReasonCode = anomalies.length > 0 ? "ANOMALY_REVIEW_REQUIRED" : null;
  const holdOwner = anomalies.length > 0 ? PayableHoldOwner.BILLING : null;

  await prisma.$transaction(async (tx) => {
    await tx.payableLineItem.deleteMany({ where: { runId: run.id } });
    if (previewLines.length > 0) {
      await tx.payableLineItem.createMany({
        data: previewLines.map((line) => ({
          orgId: req.user!.orgId,
          runId: run.id,
          partyType: line.partyType,
          partyId: line.partyId,
          loadId: line.loadId,
          type: line.type,
          amountCents: line.amountCents,
          memo: line.memo,
          source: line.source,
        })),
      });
    }
    await tx.payableRun.update({
      where: { id: run.id },
      data: {
        status: PayableRunStatus.RUN_PREVIEWED,
        previewChecksum,
        anomaliesJson: anomalies as unknown as Prisma.JsonArray,
        anomalyCount: anomalies.length,
        holdReasonCode,
        holdOwner,
        holdNotes: anomalies.length > 0 ? "Review anomalies before finalizing this run." : null,
      },
    });
  });

  const lineItems = await prisma.payableLineItem.findMany({
    where: { runId: run.id },
    orderBy: [{ partyType: "asc" }, { partyId: "asc" }, { createdAt: "asc" }],
  });

  res.json({
    runId: run.id,
    status: PayableRunStatus.RUN_PREVIEWED,
    previewChecksum,
    diff,
    anomalies,
    hold: {
      reasonCode: holdReasonCode,
      owner: holdOwner,
    },
    lineItems,
  });
});

app.post("/payables/runs/:id/hold", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_FINALIZE), async (req, res) => {
  const schema = z.object({
    reasonCode: z.string().trim().min(2),
    owner: z.nativeEnum(PayableHoldOwner).optional(),
    notes: z.string().trim().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const run = await prisma.payableRun.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  const updated = await prisma.payableRun.update({
    where: { id: run.id },
    data: {
      holdReasonCode: parsed.data.reasonCode,
      holdOwner: parsed.data.owner ?? PayableHoldOwner.BILLING,
      holdNotes: parsed.data.notes ?? null,
    },
  });
  res.json({ run: updated });
});

app.post("/payables/runs/:id/release-hold", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_FINALIZE), async (req, res) => {
  const run = await prisma.payableRun.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  const updated = await prisma.payableRun.update({
    where: { id: run.id },
    data: {
      holdReasonCode: null,
      holdOwner: null,
      holdNotes: null,
    },
  });
  res.json({ run: updated });
});

app.post("/payables/runs/:id/finalize", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_FINALIZE), async (req, res) => {
  const run = await prisma.payableRun.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  if (isFinalizeIdempotent(run.status)) {
    res.json({ run, idempotent: true });
    return;
  }
  if (run.status !== PayableRunStatus.RUN_PREVIEWED) {
    res.status(400).json({ error: "Run must be previewed before finalize" });
    return;
  }
  if (run.holdReasonCode) {
    res.status(400).json({
      error: "Run is on hold and requires review before finalize",
      holdReasonCode: run.holdReasonCode,
      holdOwner: run.holdOwner,
    });
    return;
  }
  const updated = await prisma.payableRun.update({
    where: { id: run.id },
    data: {
      status: PayableRunStatus.RUN_FINALIZED,
      finalizedAt: run.finalizedAt ?? new Date(),
      finalizedChecksum: run.finalizedChecksum ?? run.previewChecksum,
    },
  });
  res.json({ run: updated, idempotent: false });
});

const markPayableRunPaidHandler = async (req: any, res: any) => {
  const run = await prisma.payableRun.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  if (run.status === PayableRunStatus.PAID) {
    res.json({ run, idempotent: true });
    return;
  }
  if (run.status !== PayableRunStatus.RUN_FINALIZED) {
    res.status(400).json({ error: "Run must be finalized before marking paid" });
    return;
  }
  const updated = await prisma.payableRun.update({
    where: { id: run.id },
    data: {
      status: PayableRunStatus.PAID,
      paidAt: run.paidAt ?? new Date(),
    },
  });
  res.json({ run: updated, idempotent: false });
};

app.post("/payables/runs/:id/paid", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_FINALIZE), markPayableRunPaidHandler);
app.post(
  "/payables/runs/:id/mark-paid",
  requireAuth,
  requireCsrf,
  requirePermission(Permission.SETTLEMENT_FINALIZE),
  markPayableRunPaidHandler
);

app.get("/payables/runs/:id/statements", requireAuth, requirePermission(Permission.SETTLEMENT_GENERATE), async (req, res) => {
  const run = await prisma.payableRun.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    include: { lineItems: true },
  });
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  const driverIds = Array.from(
    new Set(run.lineItems.filter((item) => item.partyType === PayablePartyType.DRIVER).map((item) => item.partyId))
  );
  const drivers = driverIds.length
    ? await prisma.driver.findMany({
        where: { orgId: req.user!.orgId, id: { in: driverIds } },
        select: { id: true, name: true },
      })
    : [];
  const driverMap = new Map(drivers.map((driver) => [driver.id, driver.name]));

  const grouped = new Map<
    string,
    {
      partyId: string;
      partyName: string;
      earningsCents: number;
      deductionsCents: number;
      reimbursementsCents: number;
      items: any[];
    }
  >();
  for (const item of run.lineItems.filter((line) => line.partyType === PayablePartyType.DRIVER)) {
    const existing = grouped.get(item.partyId) ?? {
      partyId: item.partyId,
      partyName: driverMap.get(item.partyId) ?? "Driver",
      earningsCents: 0,
      deductionsCents: 0,
      reimbursementsCents: 0,
      items: [],
    };
    if (item.type === PayableLineItemType.EARNING) existing.earningsCents += item.amountCents;
    else if (item.type === PayableLineItemType.DEDUCTION) existing.deductionsCents += item.amountCents;
    else existing.reimbursementsCents += item.amountCents;
    existing.items.push(item);
    grouped.set(item.partyId, existing);
  }

  const statements = Array.from(grouped.values()).map((row) => ({
    partyId: row.partyId,
    partyName: row.partyName,
    totals: {
      earningsCents: row.earningsCents,
      deductionsCents: row.deductionsCents,
      reimbursementsCents: row.reimbursementsCents,
      netCents: row.earningsCents + row.reimbursementsCents - row.deductionsCents,
    },
    items: row.items,
  }));
  res.json({ runId: run.id, statements });
});

app.get("/settlements", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING", "DRIVER"), async (req, res) => {
  const role = req.user!.role;
  const isDriver = role === "DRIVER";
  if (!isDriver && !hasPermission(req.user, Permission.SETTLEMENT_GENERATE)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const includeInvalid = req.query.includeInvalid === "true";
  const allowIncludeInvalid = includeInvalid && role === "ADMIN";

  let driverId = typeof req.query.driverId === "string" ? req.query.driverId : undefined;
  if (isDriver) {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }
    driverId = driver.id;
  } else if (driverId && !["ADMIN", "DISPATCHER", "BILLING"].includes(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const statusParam = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;
  const groupBy = req.query.groupBy === "none" ? "none" : "week";
  const weekParam = typeof req.query.week === "string" ? req.query.week : undefined;
  const fromParam = typeof req.query.from === "string" ? req.query.from : undefined;
  const toParam = typeof req.query.to === "string" ? req.query.to : undefined;

  let fromDate = fromParam ? parseDateInput(fromParam, "start") : null;
  let toDate = toParam ? parseDateInput(toParam, "end") : null;
  if (weekParam) {
    const match = /^(\d{4})-W(\d{2})$/.exec(weekParam);
    if (!match) {
      res.status(400).json({ error: "Invalid week format" });
      return;
    }
    const year = Number(match[1]);
    const week = Number(match[2]);
    const firstWeekStart = startOfISOWeek(new Date(Date.UTC(year, 0, 4)));
    const weekStart = addDays(firstWeekStart, (week - 1) * 7);
    fromDate = weekStart;
    toDate = endOfISOWeek(weekStart);
  }
  if (fromDate && Number.isNaN(fromDate.getTime())) fromDate = null;
  if (toDate && Number.isNaN(toDate.getTime())) toDate = null;

  const where: any = { orgId: req.user!.orgId };
  if (driverId) {
    where.driverId = driverId;
  }
  if (statusParam === "PENDING") {
    where.status = { in: [SettlementStatus.DRAFT, SettlementStatus.FINALIZED] };
  } else if (statusParam && Object.values(SettlementStatus).includes(statusParam as SettlementStatus)) {
    where.status = statusParam as SettlementStatus;
  }
  if (fromDate || toDate) {
    where.periodEnd = {};
    if (fromDate) where.periodEnd.gte = fromDate;
    if (toDate) where.periodEnd.lte = toDate;
  }

  const settlements = await prisma.settlement.findMany({
    where,
    include: { driver: true },
    orderBy: { periodEnd: "desc" },
  });

  const filtered = allowIncludeInvalid
    ? settlements
    : settlements.filter((settlement) => settlement.periodStart <= settlement.periodEnd);

  const enriched = filtered.map((settlement) => {
    const periodEnd = settlement.periodEnd ?? settlement.periodStart;
    const weekKey = getWeekKey(periodEnd);
    const weekLabel = getWeekLabel(periodEnd);
    return { ...settlement, weekKey, weekLabel };
  });

  let totalNet = new Prisma.Decimal(0);
  for (const item of enriched) {
    const base = item.net ?? item.gross ?? new Prisma.Decimal(0);
    totalNet = add(totalNet, toDecimal(base) ?? new Prisma.Decimal(0));
  }
  const totals = { count: enriched.length, net: totalNet.toFixed(2) };

  const weeks = Array.from(
    new Map(enriched.map((item) => [item.weekKey, item.weekLabel])).entries()
  ).map(([weekKey, weekLabel]) => ({ weekKey, weekLabel }));

  if (groupBy === "week") {
    const groups = Array.from(
      enriched.reduce((map, item) => {
        const existing = map.get(item.weekKey) || {
          weekKey: item.weekKey,
          weekLabel: item.weekLabel,
          settlements: [],
          totals: { count: 0, net: "0.00" },
        };
        existing.settlements.push(item);
        map.set(item.weekKey, existing);
        return map;
      }, new Map<string, any>())
    ).map(([, group]) => {
      let groupNet = new Prisma.Decimal(0);
      for (const item of group.settlements) {
        const base = item.net ?? item.gross ?? new Prisma.Decimal(0);
        groupNet = add(groupNet, toDecimal(base) ?? new Prisma.Decimal(0));
      }
      return { ...group, totals: { count: group.settlements.length, net: groupNet.toFixed(2) } };
    });
    res.json({ groups, totals, weeks });
    return;
  }

  res.json({ settlements: enriched, totals, weeks });
});

app.get("/settlements/:id", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING", "DRIVER"), async (req, res) => {
  const role = req.user!.role;
  const isDriver = role === "DRIVER";
  if (!isDriver && !hasPermission(req.user, Permission.SETTLEMENT_GENERATE)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  let settlement;
  try {
    settlement = await requireOrgEntity(prisma.settlement, req.user!.orgId, req.params.id, "Settlement");
  } catch {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }
  if (isDriver) {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver || settlement.driverId !== driver.id) {
      res.status(404).json({ error: "Settlement not found" });
      return;
    }
  }
  const fullSettlement = await prisma.settlement.findFirst({
    where: { id: settlement.id, orgId: req.user!.orgId },
    include: { driver: true, items: { include: { load: true } } },
  });
  if (!fullSettlement) {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }
  res.json({ settlement: fullSettlement });
});

app.post("/settlements/generate", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_GENERATE), async (req, res) => {
  const schema = z.object({
    driverId: z.string(),
    periodStart: z.string(),
    periodEnd: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const periodStart = parseDateInput(parsed.data.periodStart, "start");
  const periodEnd = parseDateInput(parsed.data.periodEnd, "end");
  if (!periodStart || !periodEnd) {
    res.status(400).json({ error: "Invalid dates" });
    return;
  }
  if (periodStart.getTime() > periodEnd.getTime()) {
    res.status(400).json({ error: "periodStart must be <= periodEnd" });
    return;
  }
  const existing = await prisma.settlement.findFirst({
    where: {
      orgId: req.user!.orgId,
      driverId: parsed.data.driverId,
      periodStart,
      periodEnd,
    },
  });
  if (existing) {
    res.status(409).json({ error: "Settlement already exists", settlementId: existing.id });
    return;
  }
  const driver = await prisma.driver.findFirst({
    where: { id: parsed.data.driverId, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  const rate = toDecimal(driver.payRatePerMile ?? settings?.driverRatePerMile ?? 0) ?? new Prisma.Decimal(0);
  const loads = await prisma.load.findMany({
    where: {
      orgId: req.user!.orgId,
      assignedDriverId: driver.id,
      deliveredAt: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true, loadNumber: true, miles: true },
  });
  if (loads.length === 0) {
    res.status(409).json({
      error: "No delivered loads in range",
      meta: {
        driverId: driver.id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
    });
    return;
  }
  let gross = new Prisma.Decimal(0);
  const items = loads.map((load) => {
    const miles = toDecimalFixed(load.miles ?? 0, 2) ?? new Prisma.Decimal(0);
    const amount = mul(rate, miles);
    gross = add(gross, amount);
    return {
      loadId: load.id,
      code: "CPM",
      description: `Miles for ${load.loadNumber ?? load.id}`,
      amount,
    };
  });

  const settlement = await prisma.settlement.create({
    data: {
      orgId: req.user!.orgId,
      driverId: driver.id,
      periodStart,
      periodEnd,
      gross,
      deductions: new Prisma.Decimal(0),
      net: gross,
      items: { create: items },
    },
    include: { items: true },
  });
  await createEvent({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    type: EventType.SETTLEMENT_GENERATED,
    message: `Settlement generated for ${driver.name}`,
    meta: { settlementId: settlement.id },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "SETTLEMENT_GENERATED",
    entity: "Settlement",
    entityId: settlement.id,
    summary: `Generated settlement for ${driver.name}`,
    after: { status: settlement.status, periodStart: settlement.periodStart, periodEnd: settlement.periodEnd },
  });
  res.json({ settlement });
});

app.post("/settlements/:id/finalize", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_FINALIZE), async (req, res) => {
  let settlement;
  try {
    settlement = await requireOrgEntity(prisma.settlement, req.user!.orgId, req.params.id, "Settlement");
  } catch {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }
  if (settlement.status !== SettlementStatus.DRAFT) {
    res.status(400).json({ error: "Settlement not in draft" });
    return;
  }
  const itemCount = await prisma.settlementItem.count({ where: { settlementId: settlement.id } });
  if (itemCount === 0) {
    res.status(400).json({ error: "Settlement has no items" });
    return;
  }
  const updated = await prisma.settlement.update({
    where: { id: settlement.id },
    data: { status: SettlementStatus.FINALIZED, finalizedAt: new Date() },
  });
  await createEvent({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    type: EventType.SETTLEMENT_FINALIZED,
    message: `Settlement finalized`,
    meta: { settlementId: updated.id },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "SETTLEMENT_FINALIZED",
    entity: "Settlement",
    entityId: updated.id,
    summary: `Finalized settlement ${updated.id}`,
    before: { status: settlement.status },
    after: { status: updated.status },
  });
  res.json({ settlement: updated });
});

app.post("/settlements/:id/paid", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_FINALIZE), async (req, res) => {
  let settlement;
  try {
    settlement = await requireOrgEntity(prisma.settlement, req.user!.orgId, req.params.id, "Settlement");
  } catch {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }
  const itemCount = await prisma.settlementItem.count({ where: { settlementId: settlement.id } });
  if (itemCount === 0) {
    res.status(400).json({ error: "Settlement has no items" });
    return;
  }
  const updated = await prisma.settlement.update({
    where: { id: settlement.id },
    data: { status: SettlementStatus.PAID, paidAt: new Date() },
  });
  await createEvent({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    type: EventType.SETTLEMENT_PAID,
    message: `Settlement paid`,
    meta: { settlementId: updated.id },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "SETTLEMENT_PAID",
    entity: "Settlement",
    entityId: updated.id,
    summary: `Paid settlement ${updated.id}`,
    before: { status: settlement.status },
    after: { status: updated.status },
  });
  res.json({ settlement: updated });
});

app.get("/public/files/packets/:name", async (req, res) => {
  const name = req.params.name;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    res.status(400).json({ error: "Invalid file name" });
    return;
  }
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const claims = parseFactoringPacketToken(token);
  if (!claims) {
    res.status(403).json({ error: "Invalid or expired packet token" });
    return;
  }
  if (path.basename(claims.packetPath) !== name) {
    res.status(403).json({ error: "Invalid packet token scope" });
    return;
  }
  const relPath = toRelativeUploadPath(claims.packetPath);
  if (!relPath || !relPath.endsWith(`/packets/${name}`) && relPath !== `packets/${name}`) {
    res.status(403).json({ error: "Invalid packet token scope" });
    return;
  }
  const invoice = await prisma.invoice.findFirst({
    where: {
      orgId: claims.orgId,
      OR: [{ packetPath: relPath }, { packetPath: { endsWith: `/packets/${name}` } }],
    },
    select: { id: true },
  });
  if (!invoice) {
    res.status(404).json({ error: "Packet not found" });
    return;
  }
  let filePath: string;
  try {
    filePath = resolveUploadPath(relPath);
  } catch {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }
  res.sendFile(filePath);
});

app.get("/files/:type/:name", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING", "DRIVER"), async (req, res) => {
  const type = req.params.type;
  const name = req.params.name;
  if (type !== "docs" && type !== "invoices" && type !== "packets" && type !== "profiles") {
    res.status(400).json({ error: "Invalid file type" });
    return;
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    res.status(400).json({ error: "Invalid file name" });
    return;
  }
  let allowed = false;
  let invoice: { pdfPath?: string | null; packetPath?: string | null; load?: { assignedDriverId: string | null } } | null = null;
  const isDriver = req.user!.role === "DRIVER";
  let driverId: string | null = null;
  if (isDriver) {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
      select: { id: true },
    });
    driverId = driver?.id ?? null;
  }
  if (type === "docs") {
    const doc = await prisma.document.findFirst({
      where: { orgId: req.user!.orgId, filename: name },
      select: { loadId: true },
    });
    if (doc) {
      if (isDriver) {
        const assigned = await prisma.load.findFirst({
          where: { id: doc.loadId, orgId: req.user!.orgId, assignedDriverId: driverId ?? undefined },
          select: { id: true },
        });
        allowed = Boolean(assigned);
      } else {
        allowed = true;
      }
    }
  } else if (type === "invoices") {
    const relPath = `${type}/${name}`;
    invoice = await prisma.invoice.findFirst({
      where: {
        orgId: req.user!.orgId,
        OR: [{ pdfPath: relPath }, { pdfPath: { endsWith: `/${type}/${name}` } }],
      },
      include: { load: { select: { assignedDriverId: true } } },
    });
    if (invoice) {
      if (isDriver) {
        allowed = invoice.load?.assignedDriverId === driverId;
      } else {
        allowed = true;
      }
    }
  } else if (type === "packets") {
    const relPath = `${type}/${name}`;
    invoice = await prisma.invoice.findFirst({
      where: {
        orgId: req.user!.orgId,
        OR: [{ packetPath: relPath }, { packetPath: { endsWith: `/${type}/${name}` } }],
      },
      include: { load: { select: { assignedDriverId: true } } },
    });
    if (invoice) {
      if (isDriver) {
        allowed = invoice.load?.assignedDriverId === driverId;
      } else {
        allowed = true;
      }
    }
  } else if (type === "profiles") {
    const relPath = `${type}/${name}`;
    if (req.user!.role === "DRIVER") {
      const driver = await prisma.driver.findFirst({
        where: { userId: req.user!.id, orgId: req.user!.orgId },
      });
      if (driver?.profilePhotoUrl && (driver.profilePhotoUrl === relPath || driver.profilePhotoUrl.endsWith(`/${type}/${name}`))) {
        allowed = true;
      } else {
        const user = await prisma.user.findFirst({
          where: { id: req.user!.id, orgId: req.user!.orgId },
        });
        allowed = Boolean(
          user?.profilePhotoUrl && (user.profilePhotoUrl === relPath || user.profilePhotoUrl.endsWith(`/${type}/${name}`))
        );
      }
    } else {
      const driver = await prisma.driver.findFirst({
        where: {
          orgId: req.user!.orgId,
          profilePhotoUrl: { endsWith: `/${type}/${name}` },
        },
      });
      if (driver) {
        allowed = true;
      } else {
        const user = await prisma.user.findFirst({
          where: {
            orgId: req.user!.orgId,
            profilePhotoUrl: { endsWith: `/${type}/${name}` },
          },
        });
        allowed = Boolean(user);
      }
    }
  }
  if (!allowed) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  let relativePath = `${type}/${name}`;
  if (type === "invoices" || type === "packets") {
    const targetPath = type === "invoices" ? invoice?.pdfPath : invoice?.packetPath;
    if (targetPath) {
      const resolved = toRelativeUploadPath(targetPath);
      if (resolved) {
        relativePath = resolved;
      }
    }
  }
  let filePath: string;
  try {
    filePath = resolveUploadPath(relativePath);
  } catch {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }
  res.sendFile(filePath);
});

const yardStorageEnabled = process.env.YARD_STORAGE_ENABLED === "true";
const ensureYardStorageEnabled = (res: Response) => {
  if (!yardStorageEnabled) {
    res.status(410).json({ error: "Yard Storage moved to Yard OS." });
    return false;
  }
  return true;
};

app.get("/storage", requireAuth, requireRole("ADMIN"), async (req, res) => {
  if (!ensureYardStorageEnabled(res)) return;
  const records = await prisma.storageRecord.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { checkInAt: "desc" },
  });
  res.json({ records });
});

app.post("/storage/checkin", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  if (!ensureYardStorageEnabled(res)) return;
  const schema = z.object({
    loadId: z.string().optional(),
    checkInAt: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  if (!settings) {
    res.status(400).json({ error: "Settings not configured" });
    return;
  }
  const record = await prisma.storageRecord.create({
    data: {
      orgId: req.user!.orgId,
      loadId: parsed.data.loadId ?? null,
      checkInAt: parsed.data.checkInAt ? new Date(parsed.data.checkInAt) : new Date(),
      freeMinutes: settings.freeStorageMinutes,
      ratePerDay: settings.storageRatePerDay,
    },
  });
  res.json({ record });
});

app.post("/storage/:id/checkout", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  if (!ensureYardStorageEnabled(res)) return;
  let record;
  try {
    record = await requireOrgEntity(prisma.storageRecord, req.user!.orgId, req.params.id, "Record");
  } catch {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  const checkOutAt = new Date();
  const { dwellMinutes, suggestedCharge } = calculateStorageCharge({
    checkInAt: record.checkInAt,
    checkOutAt,
    freeMinutes: record.freeMinutes,
    ratePerDay: record.ratePerDay,
  });
  const updated = await prisma.storageRecord.update({
    where: { id: record.id },
    data: { checkOutAt, dwellMinutes, suggestedCharge },
  });
  res.json({ record: updated });
});

app.get("/audit", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  const { loadNumber, userId, startDate, endDate } = req.query;
  const load = loadNumber
    ? await prisma.load.findFirst({ where: { loadNumber: String(loadNumber), orgId: req.user!.orgId } })
    : null;
  const audits = await prisma.auditLog.findMany({
    where: {
      orgId: req.user!.orgId,
      userId: userId ? String(userId) : undefined,
      entityId: load ? load.id : undefined,
      createdAt: {
        gte: startDate ? new Date(String(startDate)) : undefined,
        lte: endDate ? new Date(String(endDate)) : undefined,
      },
    },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ audits });
});

app.get("/admin/finance-policy", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const settings = await prisma.orgSettings.findFirst({
    where: { orgId: req.user!.orgId },
    select: FINANCE_POLICY_SELECT,
  });
  if (!settings) {
    res.status(404).json({ error: "Settings not configured" });
    return;
  }
  res.json({ policy: normalizeFinancePolicy(settings) });
});

app.put("/admin/finance-policy", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const parsed = financePolicyPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const existing = await prisma.orgSettings.findFirst({
    where: { orgId: req.user!.orgId },
    select: {
      id: true,
      ...FINANCE_POLICY_SELECT,
    },
  });
  if (!existing) {
    res.status(404).json({ error: "Settings not configured" });
    return;
  }
  const nextPolicy = normalizeFinancePolicy({
    ...existing,
    ...parsed.data,
  });
  const updated = await prisma.orgSettings.update({
    where: { orgId: req.user!.orgId },
    data: nextPolicy,
    select: FINANCE_POLICY_SELECT,
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "FINANCE_POLICY_UPDATED",
    entity: "OrgSettings",
    entityId: existing.id,
    summary: "Updated finance policy",
    before: normalizeFinancePolicy(existing),
    after: normalizeFinancePolicy(updated),
  });
  res.json({ policy: normalizeFinancePolicy(updated) });
});

app.get("/admin/settings", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  res.json({ settings });
});

app.delete("/admin/organizations/:orgId", requireAuth, requireCsrf, async (req, res) => {
  const allowlist = parseDeleteOrgAllowlist(process.env.ADMIN_DELETE_ORG_ALLOWLIST);
  const result = await performOrganizationDelete({
    prisma,
    audit: logAudit,
    actor: req.user!,
    orgId: req.params.orgId,
    payload: req.body,
    allowlist,
  });
  if (result.status === 204) {
    res.sendStatus(204);
    return;
  }
  res.status(result.status).json(result.body);
});

app.get("/teams", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  const scope = await getUserTeamScope(req.user!);
  if (!scope.canSeeAllTeams) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  const teams = await prisma.team.findMany({
    where: { orgId: req.user!.orgId, active: true },
    orderBy: { name: "asc" },
  });
  res.json({
    teams: teams.map((team) => ({ id: team.id, name: team.name, active: team.active })),
  });
});

app.get("/admin/teams", requireAuth, requireRole("ADMIN"), async (req, res) => {
  await ensureDefaultTeamForOrg(req.user!.orgId);
  const teams = await prisma.team.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { name: "asc" },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
    },
  });
  res.json({
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      active: team.active,
      members: team.members.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        role: member.user.role,
      })),
    })),
  });
});

app.post("/admin/teams", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ name: z.string().trim().min(2).max(64) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  try {
    const team = await prisma.team.create({
      data: { orgId: req.user!.orgId, name: parsed.data.name, active: true },
    });
    res.json({ team: { id: team.id, name: team.name, active: team.active } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: "Team name already exists" });
      return;
    }
    sendServerError(res, "Failed to create team", error);
  }
});

app.patch("/admin/teams/:id", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(64).optional(),
    active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const existing = await prisma.team.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!existing) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (existing.name === DEFAULT_TEAM_NAME && parsed.data.name && parsed.data.name !== DEFAULT_TEAM_NAME) {
    res.status(400).json({ error: "Default team name cannot be changed" });
    return;
  }
  if (existing.name === DEFAULT_TEAM_NAME && parsed.data.active === false) {
    res.status(400).json({ error: "Default team cannot be deactivated" });
    return;
  }
  try {
    const team = await prisma.team.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name ?? existing.name,
        active: parsed.data.active ?? existing.active,
      },
    });
    res.json({ team: { id: team.id, name: team.name, active: team.active } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: "Team name already exists" });
      return;
    }
    sendServerError(res, "Failed to update team", error);
  }
});

app.post("/admin/teams/:id/members", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ userId: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const team = await prisma.team.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const user = await prisma.user.findFirst({
    where: { id: parsed.data.userId, orgId: req.user!.orgId },
    select: { id: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await prisma.teamMember.createMany({
    data: [{ orgId: req.user!.orgId, teamId: team.id, userId: user.id }],
    skipDuplicates: true,
  });
  if (!team.active) {
    await prisma.team.update({ where: { id: team.id }, data: { active: true } });
  }
  res.json({ ok: true });
});

app.delete("/admin/teams/:id/members/:userId", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const team = await prisma.team.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    select: { id: true },
  });
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  await prisma.teamMember.deleteMany({
    where: { orgId: req.user!.orgId, teamId: team.id, userId: req.params.userId },
  });
  res.json({ ok: true });
});

app.delete("/admin/teams/:id", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const orgId = req.user!.orgId;
  const existing = await prisma.team.findFirst({
    where: { id: req.params.id, orgId },
    select: { id: true, name: true, active: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  const defaultTeam = await ensureDefaultTeamForOrg(orgId);
  if (existing.id === defaultTeam.id || existing.name === DEFAULT_TEAM_NAME) {
    res.status(400).json({ error: "Default team cannot be deleted" });
    return;
  }

  try {
    const before = await prisma.team.findFirst({
      where: { id: existing.id, orgId },
      include: {
        members: { select: { userId: true } },
        assignments: { select: { id: true, entityType: true, entityId: true } },
      },
    });
    if (!before) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { orgId, defaultTeamId: existing.id },
        data: { defaultTeamId: defaultTeam.id },
      });

      const assignments = await tx.teamAssignment.findMany({
        where: { orgId, teamId: existing.id },
        select: { entityType: true, entityId: true },
      });
      if (assignments.length > 0) {
        await tx.teamAssignment.createMany({
          data: assignments.map((assignment) => ({
            orgId,
            teamId: defaultTeam.id,
            entityType: assignment.entityType,
            entityId: assignment.entityId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.teamAssignment.deleteMany({ where: { orgId, teamId: existing.id } });
      await tx.teamMember.deleteMany({ where: { orgId, teamId: existing.id } });
      await tx.team.delete({ where: { id: existing.id } });
    });

    await logAudit({
      orgId,
      userId: req.user!.id,
      action: "TEAM_DELETED",
      entity: "Team",
      entityId: existing.id,
      summary: `Deleted team ${existing.name}`,
      before: {
        id: before.id,
        name: before.name,
        active: before.active,
        members: before.members.length,
        assignments: before.assignments.length,
      },
      after: {
        deleted: true,
        reassignedToDefaultTeamId: defaultTeam.id,
      },
    });

    res.json({ ok: true, reassignedToTeamId: defaultTeam.id, reassignedToTeamName: defaultTeam.name });
  } catch (error) {
    sendServerError(res, "Failed to delete team", error);
  }
});

app.post("/admin/teams/assign", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    teamId: z.string().min(1),
    entityType: z.nativeEnum(TeamEntityType),
    entityIds: z.array(z.string().min(1)).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  try {
    const result = await assignTeamEntities({
      prisma,
      orgId: req.user!.orgId,
      teamId: parsed.data.teamId,
      entityType: parsed.data.entityType,
      entityIds: parsed.data.entityIds,
    });
    if (result.count === 0) {
      res.status(400).json({ error: "No valid entities provided" });
      return;
    }
    res.json({ ok: true, count: result.count });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "Team not found") {
      res.status(404).json({ error: message });
      return;
    }
    res.status(400).json({ error: message || "Invalid payload" });
  }
});

app.post("/teams/assign-loads", requireAuth, requireCsrf, requireRole("ADMIN", "HEAD_DISPATCHER"), async (req, res) => {
  if (!canAssignTeams(req.user!.role as Role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const schema = z.object({
    teamId: z.string().min(1).nullable(),
    loadIds: z.array(z.string().min(1)).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  try {
    const result = await assignTeamEntities({
      prisma,
      orgId: req.user!.orgId,
      teamId: parsed.data.teamId,
      entityType: TeamEntityType.LOAD,
      entityIds: parsed.data.loadIds,
    });
    if (result.count === 0) {
      res.status(400).json({ error: "No valid loads provided" });
      return;
    }
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "TEAM_LOADS_ASSIGNED",
      entity: "TeamAssignment",
      summary: `Assigned ${result.count} load(s) to ${parsed.data.teamId ?? "unassigned"}`,
      meta: {
        loadCount: result.count,
        teamId: parsed.data.teamId,
        loadIds: result.validEntityIds,
      },
    });
    res.json({ ok: true, count: result.count });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "Team not found") {
      res.status(404).json({ error: message });
      return;
    }
    res.status(400).json({ error: message || "Invalid payload" });
  }
});

app.get("/admin/sequences", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const sequence = await getOrgSequence(req.user!.orgId);
  res.json({ sequence });
});

app.patch("/admin/sequences", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    loadPrefix: z.string().trim().min(1).max(10).optional(),
    tripPrefix: z.string().trim().min(1).max(10).optional(),
    nextLoadNumber: z.union([z.number(), z.string()]).optional(),
    nextTripNumber: z.union([z.number(), z.string()]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  let nextLoadNumber: number | null = null;
  let nextTripNumber: number | null = null;
  try {
    nextLoadNumber = parseOptionalNonNegativeInt(parsed.data.nextLoadNumber, "Next load number");
    nextTripNumber = parseOptionalNonNegativeInt(parsed.data.nextTripNumber, "Next trip number");
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }

  if (nextLoadNumber !== null && nextLoadNumber < 1) {
    res.status(400).json({ error: "Next load number must be at least 1." });
    return;
  }
  if (nextTripNumber !== null && nextTripNumber < 1) {
    res.status(400).json({ error: "Next trip number must be at least 1." });
    return;
  }

  const updates: Prisma.OrgSequenceUpdateInput = {};
  if (parsed.data.loadPrefix !== undefined) updates.loadPrefix = parsed.data.loadPrefix;
  if (parsed.data.tripPrefix !== undefined) updates.tripPrefix = parsed.data.tripPrefix;
  if (nextLoadNumber !== null) updates.nextLoadNumber = nextLoadNumber;
  if (nextTripNumber !== null) updates.nextTripNumber = nextTripNumber;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updates provided." });
    return;
  }

  await getOrgSequence(req.user!.orgId);
  const sequence = await prisma.orgSequence.update({
    where: { orgId: req.user!.orgId },
    data: updates,
  });

  res.json({
    sequence: {
      orgId: sequence.orgId,
      nextLoadNumber: sequence.nextLoadNumber,
      nextTripNumber: sequence.nextTripNumber,
      loadPrefix: sequence.loadPrefix,
      tripPrefix: sequence.tripPrefix,
    },
  });
});

app.put("/admin/settings", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    companyDisplayName: z.string(),
    remitToAddress: z.string(),
    currency: z.string().trim().length(3).optional(),
    operatingMode: z.enum(["CARRIER", "BROKER", "BOTH"]).optional(),
    invoiceTerms: z.string(),
    invoiceTermsDays: z.number().optional(),
    invoiceFooter: z.string(),
    invoicePrefix: z.string(),
    nextInvoiceNumber: z.number(),
    podRequireSignature: z.boolean(),
    podRequirePrintedName: z.boolean(),
    podRequireDeliveryDate: z.boolean(),
    podMinPages: z.number(),
    requiredDocs: z.array(z.nativeEnum(DocType)),
    requiredDriverDocs: z.array(z.nativeEnum(DriverDocType)),
    collectPodDueMinutes: z.number(),
    missingPodAfterMinutes: z.number(),
    reminderFrequencyMinutes: z.number(),
    requireRateConBeforeDispatch: z.boolean().optional(),
    trackingPreference: z.enum(["MANUAL", "SAMSARA", "MOTIVE", "OTHER"]).optional(),
    settlementSchedule: z.enum(["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY"]).optional(),
    settlementTemplate: z
      .object({
        includeLinehaul: z.boolean().optional(),
        includeFuelSurcharge: z.boolean().optional(),
        includeAccessorials: z.boolean().optional(),
      })
      .optional(),
    timezone: z.string().optional(),
    freeStorageMinutes: z.number(),
    storageRatePerDay: z.union([z.number(), z.string()]),
    pickupFreeDetentionMinutes: z.number().optional(),
    deliveryFreeDetentionMinutes: z.number().optional(),
    detentionRatePerHour: z.union([z.number(), z.string()]).optional(),
    driverRatePerMile: z.union([z.number(), z.string()]),
    logoUrl: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const existingSettings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  if (!existingSettings) {
    res.status(404).json({ error: "Settings not configured" });
    return;
  }
  const settings = await prisma.orgSettings.update({
    where: { orgId: req.user!.orgId },
    data: {
      ...parsed.data,
      storageRatePerDay: toDecimal(parsed.data.storageRatePerDay) ?? new Prisma.Decimal(0),
      detentionRatePerHour: parsed.data.detentionRatePerHour ? toDecimal(parsed.data.detentionRatePerHour) : null,
      driverRatePerMile: toDecimal(parsed.data.driverRatePerMile) ?? new Prisma.Decimal(0),
      pickupFreeDetentionMinutes: parsed.data.pickupFreeDetentionMinutes ?? 120,
      deliveryFreeDetentionMinutes: parsed.data.deliveryFreeDetentionMinutes ?? 120,
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "SETTINGS_UPDATED",
    entity: "OrgSettings",
    entityId: settings.id,
    summary: "Updated admin settings",
    before: {
      companyDisplayName: existingSettings.companyDisplayName,
      remitToAddress: existingSettings.remitToAddress,
      currency: existingSettings.currency,
      operatingMode: existingSettings.operatingMode,
      invoiceTerms: existingSettings.invoiceTerms,
      invoiceTermsDays: existingSettings.invoiceTermsDays,
      requiredDocs: existingSettings.requiredDocs,
      requireRateConBeforeDispatch: existingSettings.requireRateConBeforeDispatch,
      trackingPreference: existingSettings.trackingPreference,
      settlementSchedule: existingSettings.settlementSchedule,
    },
    after: {
      companyDisplayName: settings.companyDisplayName,
      remitToAddress: settings.remitToAddress,
      currency: settings.currency,
      operatingMode: settings.operatingMode,
      invoiceTerms: settings.invoiceTerms,
      invoiceTermsDays: settings.invoiceTermsDays,
      requiredDocs: settings.requiredDocs,
      requireRateConBeforeDispatch: settings.requireRateConBeforeDispatch,
      trackingPreference: settings.trackingPreference,
      settlementSchedule: settings.settlementSchedule,
    },
  });
  res.json({ settings });
});

app.get("/admin/vault/docs", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const typeParam = typeof req.query.type === "string" ? req.query.type.trim() : "";
  const scopeParam = typeof req.query.scope === "string" ? req.query.scope.trim() : "";
  const statusParam = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "200";
  const offsetRaw = typeof req.query.offset === "string" ? req.query.offset : "0";
  const limit = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50));
  const offset = Math.max(0, parseInt(offsetRaw, 10) || 0);

  const docType = Object.values(VaultDocType).includes(typeParam as VaultDocType) ? (typeParam as VaultDocType) : undefined;
  const scopeType = Object.values(VaultScopeType).includes(scopeParam as VaultScopeType) ? (scopeParam as VaultScopeType) : undefined;
  const status = statusParam.toUpperCase();
  const now = new Date();
  const expiringThreshold = addDays(now, DEFAULT_VAULT_EXPIRING_DAYS);

  const where: Prisma.VaultDocumentWhereInput = {
    orgId: req.user!.orgId,
    docType,
    scopeType,
  };

  if (search) {
    where.OR = [
      { originalName: { contains: search, mode: "insensitive" } },
      { filename: { contains: search, mode: "insensitive" } },
      { referenceNumber: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
    ];
  }

  if (status === "EXPIRED") {
    where.expiresAt = { lt: now };
  } else if (status === "EXPIRING_SOON") {
    where.expiresAt = { gte: now, lte: expiringThreshold };
  } else if (status === "NEEDS_DETAILS") {
    where.expiresAt = null;
    where.AND = [...(where.AND ?? []), { docType: { in: VAULT_DOCS_REQUIRING_EXPIRY } }];
  } else if (status === "VALID") {
    where.OR = [
      { expiresAt: { gt: expiringThreshold } },
      { expiresAt: null, docType: { notIn: VAULT_DOCS_REQUIRING_EXPIRY } },
    ];
  }

  const [docs, total] = await Promise.all([
    prisma.vaultDocument.findMany({
      where,
      include: { uploadedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.vaultDocument.count({ where }),
  ]);

  const truckIds = docs.filter((doc) => doc.scopeType === "TRUCK" && doc.scopeId).map((doc) => doc.scopeId!) as string[];
  const driverIds = docs.filter((doc) => doc.scopeType === "DRIVER" && doc.scopeId).map((doc) => doc.scopeId!) as string[];
  const [trucks, drivers, org] = await Promise.all([
    truckIds.length
      ? prisma.truck.findMany({ where: { orgId: req.user!.orgId, id: { in: truckIds } }, select: { id: true, unit: true } })
      : Promise.resolve([]),
    driverIds.length
      ? prisma.driver.findMany({ where: { orgId: req.user!.orgId, id: { in: driverIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.organization.findFirst({ where: { id: req.user!.orgId }, select: { name: true } }),
  ]);
  const truckMap = new Map(trucks.map((truck) => [truck.id, truck]));
  const driverMap = new Map(drivers.map((driver) => [driver.id, driver]));
  const orgLabel = org?.name ?? "Company";

  const rows = docs.map((doc) => {
    let scopeLabel = orgLabel;
    if (doc.scopeType === "TRUCK") {
      scopeLabel = truckMap.get(doc.scopeId ?? "")?.unit ? `Truck ${truckMap.get(doc.scopeId ?? "")?.unit}` : "Truck";
    } else if (doc.scopeType === "DRIVER") {
      scopeLabel = driverMap.get(doc.scopeId ?? "")?.name ?? "Driver";
    }
    return {
      id: doc.id,
      docType: doc.docType,
      scopeType: doc.scopeType,
      scopeId: doc.scopeId,
      scopeLabel,
      status: getVaultStatus({ docType: doc.docType, expiresAt: doc.expiresAt }),
      expiresAt: doc.expiresAt,
      referenceNumber: doc.referenceNumber,
      notes: doc.notes,
      filename: doc.filename,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      size: doc.size,
      storageKey: doc.storageKey,
      uploadedAt: doc.uploadedAt,
      updatedAt: doc.updatedAt,
      uploadedBy: doc.uploadedBy,
    };
  });

  res.json({ docs: rows, total });
});

app.get("/admin/vault/stats", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const now = new Date();
  const expiringThreshold = addDays(now, DEFAULT_VAULT_EXPIRING_DAYS);
  const [expiringSoon, expired, needsDetails] = await Promise.all([
    prisma.vaultDocument.count({ where: { orgId: req.user!.orgId, expiresAt: { gte: now, lte: expiringThreshold } } }),
    prisma.vaultDocument.count({ where: { orgId: req.user!.orgId, expiresAt: { lt: now } } }),
    prisma.vaultDocument.count({
      where: { orgId: req.user!.orgId, expiresAt: null, docType: { in: VAULT_DOCS_REQUIRING_EXPIRY } },
    }),
  ]);
  res.json({ expiringSoon, expired, needsDetails });
});

app.post(
  "/admin/vault/docs",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "File required" });
      return;
    }
    const schema = z.object({
      docType: z.nativeEnum(VaultDocType),
      scopeType: z.nativeEnum(VaultScopeType),
      scopeId: z.string().optional().nullable(),
      expiresAt: z.string().optional().nullable(),
      referenceNumber: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    const scopeType = parsed.data.scopeType;
    const scopeId = normalizeOptionalText(parsed.data.scopeId);
    if (scopeType === "TRUCK") {
      if (!scopeId) {
        res.status(400).json({ error: "Truck required" });
        return;
      }
      const truck = await prisma.truck.findFirst({ where: { id: scopeId, orgId: req.user!.orgId } });
      if (!truck) {
        res.status(404).json({ error: "Truck not found" });
        return;
      }
    }
    if (scopeType === "DRIVER") {
      if (!scopeId) {
        res.status(400).json({ error: "Driver required" });
        return;
      }
      const driver = await prisma.driver.findFirst({ where: { id: scopeId, orgId: req.user!.orgId } });
      if (!driver) {
        res.status(404).json({ error: "Driver not found" });
        return;
      }
    }
    if (scopeType === "ORG" && scopeId) {
      res.status(400).json({ error: "Company documents cannot target a driver or truck." });
      return;
    }
    const expiresAt = parsed.data.expiresAt ? parseDateInput(parsed.data.expiresAt, "end") : null;
    if (parsed.data.expiresAt && !expiresAt) {
      res.status(400).json({ error: "Invalid expiration date" });
      return;
    }
    const docId = crypto.randomUUID();
    const { filename, storageKey } = await saveVaultDocumentFile(req.file, req.user!.orgId, docId);
    const doc = await prisma.vaultDocument.create({
      data: {
        id: docId,
        orgId: req.user!.orgId,
        scopeType,
        scopeId: scopeId ?? null,
        docType: parsed.data.docType,
        filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        storageKey,
        expiresAt,
        referenceNumber: normalizeOptionalText(parsed.data.referenceNumber),
        notes: normalizeOptionalText(parsed.data.notes),
        uploadedById: req.user!.id,
      },
    });
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "VAULT_DOC_UPLOADED",
      entity: "VaultDocument",
      entityId: doc.id,
      summary: `Uploaded ${doc.docType} document`,
      after: { scopeType: doc.scopeType, scopeId: doc.scopeId ?? null },
    });
    res.json({ doc });
  }
);

app.get("/admin/vault/docs/:id/download", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const doc = await prisma.vaultDocument.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  let filePath: string;
  try {
    filePath = resolveUploadPath(doc.storageKey);
  } catch {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }
  if (doc.mimeType) {
    res.setHeader("Content-Type", doc.mimeType);
  }
  res.sendFile(filePath);
});

app.get("/onboarding/state", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const state = await upsertOnboardingState({ orgId: req.user!.orgId });
  res.json({ state });
});

app.post("/onboarding/state", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    completedSteps: z.array(z.string()).optional(),
    currentStep: z.number().int().min(1).max(ONBOARDING_STEPS.length).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const state = await upsertOnboardingState({
    orgId: req.user!.orgId,
    completedSteps: parsed.data.completedSteps,
    currentStep: parsed.data.currentStep,
  });
  res.json({ state });
});

app.post("/onboarding/complete-step", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    step: z.string().min(1),
    currentStep: z.number().int().min(1).max(ONBOARDING_STEPS.length).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const step = normalizeOnboardingSteps([parsed.data.step]);
  if (step.length === 0) {
    res.status(400).json({ error: "Unknown onboarding step" });
    return;
  }
  const state = await upsertOnboardingState({
    orgId: req.user!.orgId,
    completedSteps: step,
    currentStep: parsed.data.currentStep,
  });
  res.json({ state });
});

app.post("/onboarding/activate", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const state = await upsertOnboardingState({ orgId: req.user!.orgId });
  const completedSteps = Array.isArray(state.completedSteps) ? (state.completedSteps as string[]) : [];
  if (completedSteps.length < ONBOARDING_STEPS.length) {
    res.status(400).json({ error: "Onboarding incomplete. Finish all setup steps before activation." });
    return;
  }
  if (state.status === ONBOARDING_STATUS.OPERATIONAL) {
    res.json({ state });
    return;
  }
  const updated = await prisma.onboardingState.update({
    where: { orgId: req.user!.orgId },
    data: {
      status: ONBOARDING_STATUS.OPERATIONAL,
      completedAt: state.completedAt ?? new Date(),
    },
  });
  res.json({ state: updated });
});

app.post("/onboarding/basics", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    legalName: z.string().min(2),
    displayName: z.string().optional(),
    timezone: z.string().optional(),
    currency: z.string().trim().length(3),
    operatingMode: z.enum(["CARRIER", "BROKER", "BOTH"]),
    dotNumber: z.string().optional(),
    mcNumber: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const existingSettings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  const org = await prisma.organization.update({
    where: { id: req.user!.orgId },
    data: { name: parsed.data.legalName },
  });
  const defaults = {
    companyDisplayName: parsed.data.displayName ?? parsed.data.legalName,
    remitToAddress: "",
    invoiceTerms: "",
    invoiceFooter: "",
    invoicePrefix: "",
    nextInvoiceNumber: 0,
    podRequireSignature: true,
    podRequirePrintedName: true,
    podRequireDeliveryDate: true,
    podMinPages: 1,
    requiredDocs: [],
    requiredDriverDocs: [],
    collectPodDueMinutes: 0,
    missingPodAfterMinutes: 0,
    reminderFrequencyMinutes: 0,
    freeStorageMinutes: 0,
    storageRatePerDay: new Prisma.Decimal(0),
    pickupFreeDetentionMinutes: 0,
    deliveryFreeDetentionMinutes: 0,
    detentionRatePerHour: null,
    driverRatePerMile: new Prisma.Decimal(0),
  };
  const settings = await prisma.orgSettings.upsert({
    where: { orgId: req.user!.orgId },
    create: {
      orgId: req.user!.orgId,
      ...defaults,
      currency: parsed.data.currency,
      operatingMode: parsed.data.operatingMode as any,
      trackingPreference: "MANUAL",
      settlementSchedule: "WEEKLY",
      timezone: parsed.data.timezone ?? null,
    },
    update: {
      companyDisplayName: parsed.data.displayName ?? parsed.data.legalName,
      currency: parsed.data.currency,
      operatingMode: parsed.data.operatingMode as any,
      timezone: parsed.data.timezone ?? null,
    },
  });
  const entityType =
    parsed.data.operatingMode === "BROKER" ? OperatingEntityType.BROKER : OperatingEntityType.CARRIER;
  const entity = await ensureDefaultOperatingEntity(req.user!.orgId);
  const operatingEntity = await prisma.operatingEntity.update({
    where: { id: entity.id },
    data: {
      name: settings.companyDisplayName,
      type: entityType,
      dotNumber: normalizeOptionalText(parsed.data.dotNumber),
      mcNumber: normalizeOptionalText(parsed.data.mcNumber),
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "ONBOARDING_BASICS",
    entity: "OrgSettings",
    entityId: settings.id,
    summary: "Onboarding basics updated",
    before: existingSettings
      ? {
          companyDisplayName: existingSettings.companyDisplayName,
          currency: existingSettings.currency,
          operatingMode: existingSettings.operatingMode,
          timezone: existingSettings.timezone,
        }
      : null,
    after: {
      companyDisplayName: settings.companyDisplayName,
      currency: settings.currency,
      operatingMode: settings.operatingMode,
      timezone: settings.timezone,
    },
  });
  const state = await upsertOnboardingState({
    orgId: req.user!.orgId,
    completedSteps: ["basics"],
    currentStep: 2,
  });
  res.json({ org, settings, operatingEntity, state });
});

app.post("/onboarding/preferences", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    requiredDocs: z.array(z.nativeEnum(DocType)).optional(),
    requireRateConBeforeDispatch: z.boolean().optional(),
    currentStep: z.number().int().min(1).max(ONBOARDING_STEPS.length).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const existingSettings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  const settings = await prisma.orgSettings.update({
    where: { orgId: req.user!.orgId },
    data: {
      requiredDocs: parsed.data.requiredDocs,
      requireRateConBeforeDispatch: parsed.data.requireRateConBeforeDispatch,
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "ONBOARDING_PREFERENCES",
    entity: "OrgSettings",
    entityId: settings.id,
    summary: "Onboarding preferences updated",
    before: existingSettings
      ? {
          requiredDocs: existingSettings.requiredDocs,
          requireRateConBeforeDispatch: existingSettings.requireRateConBeforeDispatch,
        }
      : null,
    after: {
      requiredDocs: settings.requiredDocs,
      requireRateConBeforeDispatch: settings.requireRateConBeforeDispatch,
    },
  });
  const state = await upsertOnboardingState({
    orgId: req.user!.orgId,
    completedSteps: ["preferences"],
    currentStep: parsed.data.currentStep,
  });
  res.json({ settings, state });
});

app.post("/onboarding/tracking", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    trackingPreference: z.enum(["MANUAL", "SAMSARA", "MOTIVE", "OTHER"]),
    currentStep: z.number().int().min(1).max(ONBOARDING_STEPS.length).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const existingSettings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  const settings = await prisma.orgSettings.update({
    where: { orgId: req.user!.orgId },
    data: { trackingPreference: parsed.data.trackingPreference as any },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "ONBOARDING_TRACKING",
    entity: "OrgSettings",
    entityId: settings.id,
    summary: "Onboarding tracking updated",
    before: existingSettings ? { trackingPreference: existingSettings.trackingPreference } : null,
    after: { trackingPreference: settings.trackingPreference },
  });
  const state = await upsertOnboardingState({
    orgId: req.user!.orgId,
    completedSteps: ["tracking"],
    currentStep: parsed.data.currentStep,
  });
  res.json({ settings, state });
});

app.post("/onboarding/finance", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    settlementSchedule: z.string().optional(),
    settlementTemplate: z
      .object({
        includeLinehaul: z.boolean().optional(),
        includeFuelSurcharge: z.boolean().optional(),
        includeAccessorials: z.boolean().optional(),
      })
      .optional(),
    currentStep: z.number().int().min(1).max(ONBOARDING_STEPS.length).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const normalizeSchedule = (value?: string | null) => {
    if (!value) return undefined;
    return value.trim().toUpperCase().replace(/-/g, "_");
  };
  const schedule = normalizeSchedule(parsed.data.settlementSchedule);
  if (schedule && !["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY"].includes(schedule)) {
    res.status(400).json({ error: "Invalid settlement schedule" });
    return;
  }
  const existingSettings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  const settings = await prisma.orgSettings.update({
    where: { orgId: req.user!.orgId },
    data: {
      settlementSchedule: schedule as any,
      settlementTemplate: parsed.data.settlementTemplate ?? undefined,
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "ONBOARDING_FINANCE",
    entity: "OrgSettings",
    entityId: settings.id,
    summary: "Onboarding finance updated",
    before: existingSettings
      ? {
          settlementSchedule: existingSettings.settlementSchedule,
          settlementTemplate: existingSettings.settlementTemplate,
        }
      : null,
    after: {
      settlementSchedule: settings.settlementSchedule,
      settlementTemplate: settings.settlementTemplate,
    },
  });
  const state = await upsertOnboardingState({
    orgId: req.user!.orgId,
    completedSteps: ["finance"],
    currentStep: parsed.data.currentStep,
  });
  res.json({ settings, state });
});

app.get("/api/debug/db-info", requireAuth, requireRole("ADMIN"), async (req, res) => {
  if (process.env.DEBUG_DB_INFO !== "true") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const info = await getDbInfo();
  res.json({ info });
});

app.get("/api/operating-entities", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const entities = await prisma.operatingEntity.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ entities });
});

app.post("/api/operating-entities", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    type: z.enum(["CARRIER", "BROKER"]),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    mcNumber: z.string().optional(),
    dotNumber: z.string().optional(),
    remitToName: z.string().optional(),
    remitToAddressLine1: z.string().optional(),
    remitToCity: z.string().optional(),
    remitToState: z.string().optional(),
    remitToZip: z.string().optional(),
    isDefault: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const data = {
    orgId: req.user!.orgId,
    name: parsed.data.name.trim(),
    type: parsed.data.type as OperatingEntityType,
    addressLine1: normalizeOptionalText(parsed.data.addressLine1),
    addressLine2: normalizeOptionalText(parsed.data.addressLine2),
    city: normalizeOptionalText(parsed.data.city),
    state: normalizeOptionalText(parsed.data.state),
    zip: normalizeOptionalText(parsed.data.zip),
    phone: normalizeOptionalText(parsed.data.phone),
    email: normalizeOptionalText(parsed.data.email),
    mcNumber: normalizeOptionalText(parsed.data.mcNumber),
    dotNumber: normalizeOptionalText(parsed.data.dotNumber),
    remitToName: normalizeOptionalText(parsed.data.remitToName),
    remitToAddressLine1: normalizeOptionalText(parsed.data.remitToAddressLine1),
    remitToCity: normalizeOptionalText(parsed.data.remitToCity),
    remitToState: normalizeOptionalText(parsed.data.remitToState),
    remitToZip: normalizeOptionalText(parsed.data.remitToZip),
    isDefault: Boolean(parsed.data.isDefault),
  };

  const entity = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.operatingEntity.updateMany({
        where: { orgId: req.user!.orgId },
        data: { isDefault: false },
      });
    }
    return tx.operatingEntity.create({ data });
  });

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "OPERATING_ENTITY_CREATED",
    entity: "OperatingEntity",
    entityId: entity.id,
    summary: `Created operating entity ${entity.name}`,
  });

  res.json({ entity });
});

app.patch("/api/operating-entities/:id", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    type: z.enum(["CARRIER", "BROKER"]).optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    mcNumber: z.string().optional(),
    dotNumber: z.string().optional(),
    remitToName: z.string().optional(),
    remitToAddressLine1: z.string().optional(),
    remitToCity: z.string().optional(),
    remitToState: z.string().optional(),
    remitToZip: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const entity = await prisma.operatingEntity.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!entity) {
    res.status(404).json({ error: "Operating entity not found" });
    return;
  }

  const updated = await prisma.operatingEntity.update({
    where: { id: entity.id },
    data: {
      name: parsed.data.name ? parsed.data.name.trim() : undefined,
      type: parsed.data.type as OperatingEntityType | undefined,
      addressLine1: parsed.data.addressLine1 !== undefined ? normalizeOptionalText(parsed.data.addressLine1) : undefined,
      addressLine2: parsed.data.addressLine2 !== undefined ? normalizeOptionalText(parsed.data.addressLine2) : undefined,
      city: parsed.data.city !== undefined ? normalizeOptionalText(parsed.data.city) : undefined,
      state: parsed.data.state !== undefined ? normalizeOptionalText(parsed.data.state) : undefined,
      zip: parsed.data.zip !== undefined ? normalizeOptionalText(parsed.data.zip) : undefined,
      phone: parsed.data.phone !== undefined ? normalizeOptionalText(parsed.data.phone) : undefined,
      email: parsed.data.email !== undefined ? normalizeOptionalText(parsed.data.email) : undefined,
      mcNumber: parsed.data.mcNumber !== undefined ? normalizeOptionalText(parsed.data.mcNumber) : undefined,
      dotNumber: parsed.data.dotNumber !== undefined ? normalizeOptionalText(parsed.data.dotNumber) : undefined,
      remitToName: parsed.data.remitToName !== undefined ? normalizeOptionalText(parsed.data.remitToName) : undefined,
      remitToAddressLine1:
        parsed.data.remitToAddressLine1 !== undefined ? normalizeOptionalText(parsed.data.remitToAddressLine1) : undefined,
      remitToCity: parsed.data.remitToCity !== undefined ? normalizeOptionalText(parsed.data.remitToCity) : undefined,
      remitToState: parsed.data.remitToState !== undefined ? normalizeOptionalText(parsed.data.remitToState) : undefined,
      remitToZip: parsed.data.remitToZip !== undefined ? normalizeOptionalText(parsed.data.remitToZip) : undefined,
    },
  });

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "OPERATING_ENTITY_UPDATED",
    entity: "OperatingEntity",
    entityId: updated.id,
    summary: `Updated operating entity ${updated.name}`,
  });

  res.json({ entity: updated });
});

app.post(
  "/api/operating-entities/:id/make-default",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN"),
  async (req, res) => {
    const updated = await setDefaultOperatingEntity(req.user!.orgId, req.params.id);
    if (!updated) {
      res.status(404).json({ error: "Operating entity not found" });
      return;
    }
    await logAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      action: "OPERATING_ENTITY_DEFAULT",
      entity: "OperatingEntity",
      entityId: updated.id,
      summary: `Set ${updated.name} as default operating entity`,
    });
    res.json({ entity: updated });
  }
);

app.get("/api/integrations/samsara/status", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const integration = await prisma.trackingIntegration.findFirst({
    where: { orgId: req.user!.orgId, providerType: TrackingProviderType.SAMSARA },
  });
  res.json({
    integration: integration
      ? {
          status: integration.status,
          errorMessage: integration.errorMessage ?? null,
          updatedAt: integration.updatedAt,
        }
      : { status: TrackingIntegrationStatus.DISCONNECTED, errorMessage: null, updatedAt: null },
  });
});

app.post("/api/integrations/samsara/connect", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ apiToken: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  try {
    await validateSamsaraToken(parsed.data.apiToken);
  } catch (error) {
    sendSamsaraError(res, error);
    return;
  }

  const integration = await prisma.trackingIntegration.upsert({
    where: { orgId_providerType: { orgId: req.user!.orgId, providerType: TrackingProviderType.SAMSARA } },
    update: {
      status: TrackingIntegrationStatus.CONNECTED,
      configJson: { apiToken: parsed.data.apiToken },
      errorMessage: null,
    },
    create: {
      orgId: req.user!.orgId,
      providerType: TrackingProviderType.SAMSARA,
      status: TrackingIntegrationStatus.CONNECTED,
      configJson: { apiToken: parsed.data.apiToken },
    },
  });

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "INTEGRATION_CONNECT",
    entity: "TrackingIntegration",
    entityId: integration.id,
    summary: "Connected Samsara integration",
  });

  res.json({ status: integration.status });
});

app.post("/api/integrations/samsara/disconnect", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const integration = await prisma.trackingIntegration.upsert({
    where: { orgId_providerType: { orgId: req.user!.orgId, providerType: TrackingProviderType.SAMSARA } },
    update: { status: TrackingIntegrationStatus.DISCONNECTED, configJson: null, errorMessage: null },
    create: { orgId: req.user!.orgId, providerType: TrackingProviderType.SAMSARA, status: TrackingIntegrationStatus.DISCONNECTED },
  });

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "INTEGRATION_DISCONNECT",
    entity: "TrackingIntegration",
    entityId: integration.id,
    summary: "Disconnected Samsara integration",
  });

  res.json({ status: integration.status });
});

app.get("/api/integrations/samsara/vehicles", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "50";
  const limit = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50));
  const integration = await prisma.trackingIntegration.findFirst({
    where: { orgId: req.user!.orgId, providerType: TrackingProviderType.SAMSARA, status: TrackingIntegrationStatus.CONNECTED },
  });
  const token = extractSamsaraToken(integration?.configJson ?? null);
  if (!token) {
    res.status(400).json({ error: "Samsara is not connected.", code: "SAMSARA_NOT_CONNECTED" });
    return;
  }
  try {
    const vehicles = await fetchSamsaraVehicles(token, limit);
    res.json({
      vehicles: vehicles.filter((vehicle) => vehicle.id),
      count: vehicles.length,
    });
  } catch (error) {
    sendSamsaraError(res, error);
  }
});

app.post("/api/integrations/samsara/test", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const integration = await prisma.trackingIntegration.findFirst({
    where: { orgId: req.user!.orgId, providerType: TrackingProviderType.SAMSARA, status: TrackingIntegrationStatus.CONNECTED },
  });
  const token = extractSamsaraToken(integration?.configJson ?? null);
  if (!token) {
    res.status(400).json({ ok: false, error: "Samsara is not connected.", code: "SAMSARA_NOT_CONNECTED" });
    return;
  }
  try {
    await validateSamsaraToken(token);
    const vehicles = await fetchSamsaraVehicles(token, 10);
    const sampleIds = vehicles.map((vehicle) => vehicle.id).filter(Boolean);
    res.json({
      ok: true,
      vehicleCountSampled: vehicles.length,
      sampleVehicleIds: sampleIds,
      message: "Samsara connection OK.",
    });
  } catch (error) {
    const info = formatSamsaraError(error);
    res.status(info.code === "UNAUTHORIZED" ? 400 : info.code === "RATE_LIMITED" ? 429 : info.code === "NETWORK_ERROR" ? 503 : 502).json({
      ok: false,
      error: info.message,
      code: `SAMSARA_${info.code}`,
      retryAfter: info.retryAfter ?? null,
    });
  }
});

app.get("/api/integrations/samsara/truck-mappings", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const mappings = await prisma.truckTelematicsMapping.findMany({
    where: { orgId: req.user!.orgId, providerType: TrackingProviderType.SAMSARA },
    include: { truck: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ mappings });
});

app.post("/api/integrations/samsara/map-truck", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ truckId: z.string(), externalId: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const truck = await prisma.truck.findFirst({ where: { id: parsed.data.truckId, orgId: req.user!.orgId } });
  if (!truck) {
    res.status(404).json({ error: "Truck not found" });
    return;
  }
  const externalId = normalizeOptionalText(parsed.data.externalId) ?? null;
  if (!externalId) {
    await prisma.truckTelematicsMapping.deleteMany({
      where: { orgId: req.user!.orgId, truckId: truck.id, providerType: TrackingProviderType.SAMSARA },
    });
    res.json({ mapping: null });
    return;
  }
  const mapping = await prisma.truckTelematicsMapping.upsert({
    where: {
      orgId_truckId_providerType: {
        orgId: req.user!.orgId,
        truckId: truck.id,
        providerType: TrackingProviderType.SAMSARA,
      },
    },
    update: { externalId },
    create: {
      orgId: req.user!.orgId,
      truckId: truck.id,
      providerType: TrackingProviderType.SAMSARA,
      externalId,
    },
  });
  res.json({ mapping });
});

app.get("/admin/fuel/status", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const [integration, mappedCount, totalTrucks] = await Promise.all([
    prisma.trackingIntegration.findFirst({
      where: { orgId: req.user!.orgId, providerType: TrackingProviderType.SAMSARA },
    }),
    prisma.truckTelematicsMapping.count({
      where: { orgId: req.user!.orgId, providerType: TrackingProviderType.SAMSARA },
    }),
    prisma.truck.count({ where: { orgId: req.user!.orgId } }),
  ]);

  res.json({
    status: integration?.status ?? TrackingIntegrationStatus.DISCONNECTED,
    errorMessage: integration?.errorMessage ?? null,
    mappedCount,
    totalTrucks,
    lastFuelSyncAt: integration?.lastFuelSyncAt ?? null,
    lastFuelSyncError: integration?.lastFuelSyncError ?? null,
  });
});

app.get("/admin/fuel/summary", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const rangeParam = typeof req.query.range === "string" ? req.query.range.trim() : "7d";
  const periodDays = rangeParam === "30d" ? 30 : 7;

  const latest = await prisma.fuelSummary.findFirst({
    where: { orgId: req.user!.orgId, providerType: TrackingProviderType.SAMSARA, periodDays },
    orderBy: { periodEnd: "desc" },
  });

  if (!latest) {
    res.json({ rows: [], periodStart: null, periodEnd: null, lastSyncedAt: null });
    return;
  }

  const rows = await prisma.fuelSummary.findMany({
    where: {
      orgId: req.user!.orgId,
      providerType: TrackingProviderType.SAMSARA,
      periodDays,
      periodStart: latest.periodStart,
      periodEnd: latest.periodEnd,
    },
    include: { truck: true },
    orderBy: { fuelUsed: "desc" },
  });

  res.json({
    rows: rows.map((row) => ({
      id: row.id,
      truckId: row.truckId,
      truckUnit: row.truck.unit,
      truckVin: row.truck.vin,
      fuelUsed: row.fuelUsed ? Number(row.fuelUsed) : null,
      distance: row.distance ? Number(row.distance) : null,
      fuelEfficiency: row.fuelEfficiency ? Number(row.fuelEfficiency) : null,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      lastSyncedAt: row.lastSyncedAt,
      source: row.source ?? FuelSummarySource.SAMSARA,
    })),
    periodStart: latest.periodStart,
    periodEnd: latest.periodEnd,
    lastSyncedAt: latest.lastSyncedAt,
  });
});

app.get("/admin/users", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users });
});

app.patch("/admin/members/:memberId/role", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    role: z.enum(["DISPATCHER", "HEAD_DISPATCHER", "BILLING"]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  if (req.params.memberId === req.user!.id) {
    res.status(400).json({ error: "You cannot change your own role." });
    return;
  }
  const member = await prisma.user.findFirst({
    where: { id: req.params.memberId, orgId: req.user!.orgId },
  });
  if (!member) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: member.id },
    data: { role: parsed.data.role },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "USER_ROLE_UPDATED",
    entity: "User",
    entityId: updated.id,
    summary: `Updated role for ${updated.email} to ${updated.role}`,
  });
  res.json({ user: updated });
});

app.post("/admin/users/:id/deactivate", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  if (req.params.id === req.user!.id) {
    res.status(400).json({ error: "You cannot deactivate your own account." });
    return;
  }
  const user = await prisma.user.findFirst({ where: { id: req.params.id, orgId: req.user!.orgId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isActive: false, status: UserStatus.SUSPENDED },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "USER_DEACTIVATED",
    entity: "User",
    entityId: updated.id,
    summary: `Deactivated user ${updated.email}`,
  });
  res.json({ user: updated });
});

app.post("/admin/users/:id/reactivate", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, orgId: req.user!.orgId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isActive: true, status: UserStatus.ACTIVE },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "USER_REACTIVATED",
    entity: "User",
    entityId: updated.id,
    summary: `Reactivated user ${updated.email}`,
  });
  res.json({ user: updated });
});

app.post("/admin/users/:id/mfa/reset", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  if (req.params.id === req.user!.id) {
    res.status(400).json({ error: "You cannot reset your own MFA from here." });
    return;
  }
  const user = await prisma.user.findFirst({ where: { id: req.params.id, orgId: req.user!.orgId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: false,
      mfaTotpSecretEncrypted: null,
      mfaRecoveryCodesHash: null,
      mfaEnforced: false,
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "USER_MFA_RESET",
    entity: "User",
    entityId: user.id,
    summary: `Reset MFA for ${user.email}`,
  });
  res.json({ ok: true });
});

app.get("/admin/drivers", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const drivers = await prisma.driver.findMany({
    where: { orgId: req.user!.orgId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ drivers });
});

app.post("/admin/drivers/:id/status", requireAuth, requireCsrf, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const schema = z.object({ status: z.enum(["AVAILABLE", "ON_LOAD", "UNAVAILABLE"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const driver = await prisma.driver.findFirst({ where: { id: req.params.id, orgId: req.user!.orgId } });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const updated = await prisma.driver.update({
    where: { id: driver.id },
    data: { status: parsed.data.status as DriverStatus },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DRIVER_STATUS",
    entity: "Driver",
    entityId: driver.id,
    summary: `Driver ${driver.name} status ${driver.status} -> ${updated.status}`,
    before: { status: driver.status },
    after: { status: updated.status },
  });
  res.json({ driver: updated });
});

app.patch("/admin/drivers/:id", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    license: z.string().optional(),
    licenseState: z.string().optional(),
    licenseExpiresAt: z.string().optional(),
    medCardExpiresAt: z.string().optional(),
    payRatePerMile: z.union([z.number(), z.string()]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const driver = await prisma.driver.findFirst({ where: { id: req.params.id, orgId: req.user!.orgId } });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  const parseOptionalDate = (value?: string) => {
    if (value === undefined) return undefined;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const updateData: Prisma.DriverUpdateInput = {
    name: parsed.data.name ?? undefined,
    phone: parsed.data.phone === undefined ? undefined : normalizeOptionalText(parsed.data.phone),
    license: parsed.data.license === undefined ? undefined : normalizeOptionalText(parsed.data.license),
    licenseState: parsed.data.licenseState === undefined ? undefined : normalizeOptionalText(parsed.data.licenseState),
    licenseExpiresAt: parseOptionalDate(parsed.data.licenseExpiresAt),
    medCardExpiresAt: parseOptionalDate(parsed.data.medCardExpiresAt),
    payRatePerMile: parsed.data.payRatePerMile !== undefined ? toDecimal(parsed.data.payRatePerMile) : undefined,
  };

  const updated = await prisma.driver.update({
    where: { id: driver.id },
    data: updateData,
  });

  if (parsed.data.name && driver.userId) {
    await prisma.user.update({
      where: { id: driver.userId },
      data: { name: parsed.data.name },
    });
  }

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DRIVER_UPDATED",
    entity: "Driver",
    entityId: driver.id,
    summary: `Updated driver ${updated.name}`,
  });

  res.json({ driver: updated });
});

app.get("/admin/trucks", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const trucks = await prisma.truck.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ trucks });
});

app.post("/admin/trucks", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    unit: z.string().min(1),
    vin: z.string().min(1),
    plate: z.string().optional(),
    plateState: z.string().optional(),
    status: z.enum(["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"]).optional(),
    active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  let vin: string | null;
  let plateState: string | null;
  try {
    vin = normalizeVin(parsed.data.vin);
    plateState = normalizePlateState(parsed.data.plateState);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  if (!vin) {
    res.status(400).json({ error: "VIN required" });
    return;
  }
  const existing = await prisma.truck.findFirst({
    where: {
      orgId: req.user!.orgId,
      OR: [{ unit: parsed.data.unit }, { vin }],
    },
  });
  if (existing) {
    res.status(400).json({ error: "Truck unit or VIN already exists" });
    return;
  }
  const truck = await prisma.truck.create({
    data: {
      orgId: req.user!.orgId,
      unit: parsed.data.unit,
      vin,
      plate: normalizeOptionalText(parsed.data.plate) ?? null,
      plateState,
      status: (parsed.data.status as TruckStatus) ?? TruckStatus.AVAILABLE,
      active: parsed.data.active ?? true,
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "TRUCK_CREATED",
    entity: "Truck",
    entityId: truck.id,
    summary: `Created truck ${truck.unit}`,
    after: { unit: truck.unit, vin: truck.vin, status: truck.status },
  });
  res.json({ truck });
});

app.patch("/admin/trucks/:id", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    unit: z.string().min(1).optional(),
    vin: z.string().optional(),
    plate: z.string().optional().nullable(),
    plateState: z.string().optional().nullable(),
    status: z.enum(["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"]).optional(),
    active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const truck = await prisma.truck.findFirst({ where: { id: req.params.id, orgId: req.user!.orgId } });
  if (!truck) {
    res.status(404).json({ error: "Truck not found" });
    return;
  }
  let vin: string | null | undefined = undefined;
  let plateState: string | null | undefined = undefined;
  try {
    if (parsed.data.vin !== undefined) {
      vin = normalizeVin(parsed.data.vin);
    }
    if (parsed.data.plateState !== undefined) {
      plateState = normalizePlateState(parsed.data.plateState);
    }
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  if (parsed.data.unit || vin) {
    const duplicate = await prisma.truck.findFirst({
      where: {
        orgId: req.user!.orgId,
        id: { not: truck.id },
        OR: [
          parsed.data.unit ? { unit: parsed.data.unit } : undefined,
          vin ? { vin } : undefined,
        ].filter(Boolean) as Prisma.TruckWhereInput[],
      },
    });
    if (duplicate) {
      res.status(400).json({ error: "Truck unit or VIN already exists" });
      return;
    }
  }
  const updated = await prisma.truck.update({
    where: { id: truck.id },
    data: {
      unit: parsed.data.unit ?? truck.unit,
      vin: vin !== undefined ? vin : truck.vin,
      plate: parsed.data.plate !== undefined ? normalizeOptionalText(parsed.data.plate) : truck.plate,
      plateState: plateState !== undefined ? plateState : truck.plateState,
      status: parsed.data.status ? (parsed.data.status as TruckStatus) : truck.status,
      active: parsed.data.active ?? truck.active,
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "TRUCK_UPDATED",
    entity: "Truck",
    entityId: truck.id,
    summary: `Updated truck ${updated.unit}`,
    before: { unit: truck.unit, vin: truck.vin, status: truck.status },
    after: { unit: updated.unit, vin: updated.vin, status: updated.status },
  });
  res.json({ truck: updated });
});

app.get("/admin/trailers", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const trailers = await prisma.trailer.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ trailers });
});

app.post("/admin/trailers", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    unit: z.string().min(1),
    type: z.enum(["DRY_VAN", "REEFER", "FLATBED", "OTHER"]).optional(),
    plate: z.string().optional(),
    plateState: z.string().optional(),
    status: z.enum(["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"]).optional(),
    active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  let plateState: string | null;
  try {
    plateState = normalizePlateState(parsed.data.plateState);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  const existing = await prisma.trailer.findFirst({
    where: { orgId: req.user!.orgId, unit: parsed.data.unit },
  });
  if (existing) {
    res.status(400).json({ error: "Trailer unit already exists" });
    return;
  }
  const trailer = await prisma.trailer.create({
    data: {
      orgId: req.user!.orgId,
      unit: parsed.data.unit,
      type: (parsed.data.type as TrailerType) ?? TrailerType.OTHER,
      plate: normalizeOptionalText(parsed.data.plate) ?? null,
      plateState,
      status: (parsed.data.status as TrailerStatus) ?? TrailerStatus.AVAILABLE,
      active: parsed.data.active ?? true,
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "TRAILER_CREATED",
    entity: "Trailer",
    entityId: trailer.id,
    summary: `Created trailer ${trailer.unit}`,
    after: { unit: trailer.unit, type: trailer.type, status: trailer.status },
  });
  res.json({ trailer });
});

app.patch("/admin/trailers/:id", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    unit: z.string().min(1).optional(),
    type: z.enum(["DRY_VAN", "REEFER", "FLATBED", "OTHER"]).optional(),
    plate: z.string().optional().nullable(),
    plateState: z.string().optional().nullable(),
    status: z.enum(["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"]).optional(),
    active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const trailer = await prisma.trailer.findFirst({ where: { id: req.params.id, orgId: req.user!.orgId } });
  if (!trailer) {
    res.status(404).json({ error: "Trailer not found" });
    return;
  }
  let plateState: string | null | undefined = undefined;
  try {
    if (parsed.data.plateState !== undefined) {
      plateState = normalizePlateState(parsed.data.plateState);
    }
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  if (parsed.data.unit && parsed.data.unit !== trailer.unit) {
    const existing = await prisma.trailer.findFirst({
      where: { orgId: req.user!.orgId, unit: parsed.data.unit, id: { not: trailer.id } },
    });
    if (existing) {
      res.status(400).json({ error: "Trailer unit already exists" });
      return;
    }
  }
  const updated = await prisma.trailer.update({
    where: { id: trailer.id },
    data: {
      unit: parsed.data.unit ?? trailer.unit,
      type: parsed.data.type ? (parsed.data.type as TrailerType) : trailer.type,
      plate: parsed.data.plate !== undefined ? normalizeOptionalText(parsed.data.plate) : trailer.plate,
      plateState: plateState !== undefined ? plateState : trailer.plateState,
      status: parsed.data.status ? (parsed.data.status as TrailerStatus) : trailer.status,
      active: parsed.data.active ?? trailer.active,
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "TRAILER_UPDATED",
    entity: "Trailer",
    entityId: trailer.id,
    summary: `Updated trailer ${updated.unit}`,
    before: { unit: trailer.unit, type: trailer.type, status: trailer.status },
    after: { unit: updated.unit, type: updated.type, status: updated.status },
  });
  res.json({ trailer: updated });
});

app.post("/admin/drivers/:id/archive", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const driver = await prisma.driver.findFirst({ where: { id: req.params.id, orgId: req.user!.orgId } });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const activeLoads = await prisma.load.count({
    where: { orgId: req.user!.orgId, assignedDriverId: driver.id, status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] } },
  });
  if (activeLoads > 0) {
    res.status(400).json({ error: "Driver has active loads. Unassign before archiving." });
    return;
  }
  const updated = await prisma.driver.update({
    where: { id: driver.id },
    data: { archivedAt: new Date() },
  });
  if (driver.userId) {
    await prisma.user.update({ where: { id: driver.userId }, data: { isActive: false } });
  }
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DRIVER_ARCHIVED",
    entity: "Driver",
    entityId: updated.id,
    summary: `Archived driver ${updated.name}`,
  });
  res.json({ driver: updated });
});

app.post("/admin/drivers/:id/restore", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const driver = await prisma.driver.findFirst({ where: { id: req.params.id, orgId: req.user!.orgId } });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const updated = await prisma.driver.update({
    where: { id: driver.id },
    data: { archivedAt: null },
  });
  if (driver.userId) {
    await prisma.user.update({ where: { id: driver.userId }, data: { isActive: true } });
  }
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DRIVER_RESTORED",
    entity: "Driver",
    entityId: updated.id,
    summary: `Restored driver ${updated.name}`,
  });
  res.json({ driver: updated });
});

const IMPORT_FIELDS_BY_TYPE: Record<string, string[]> = {
  employees: ["email", "role", "name", "phone", "timezone"],
  drivers: ["name", "phone", "license", "payRatePerMile", "licenseExpiresAt", "medCardExpiresAt"],
  trucks: ["unit", "vin", "plate", "plateState", "status"],
  trailers: ["unit", "type", "plate", "plateState", "status"],
};

const REQUIRED_IMPORT_FIELDS_BY_TYPE: Record<string, string[]> = {
  employees: ["email", "role"],
  drivers: ["name", "phone"],
  trucks: ["unit", "vin"],
  trailers: ["unit"],
};

function buildImportColumnResolver(params: {
  columns: string[];
  type: "drivers" | "employees" | "trucks" | "trailers";
  mapping?: Record<string, string>;
  learnedMapping?: Record<string, string>;
}) {
  const allowedFields = IMPORT_FIELDS_BY_TYPE[params.type] ?? [];
  const headerMapping: Record<string, string> = {};
  const learnedHeaders: string[] = [];

  for (const header of params.columns) {
    const learnedField = params.learnedMapping?.[header];
    if (learnedField && allowedFields.includes(learnedField)) {
      headerMapping[header] = learnedField;
      learnedHeaders.push(header);
    }
  }

  for (const [header, field] of Object.entries(params.mapping ?? {})) {
    if (field && allowedFields.includes(field)) {
      headerMapping[header] = field;
    }
  }

  for (const header of params.columns) {
    const normalized = normalizeHeader(header);
    if (allowedFields.includes(normalized) && !headerMapping[header]) {
      headerMapping[header] = normalized;
    }
  }

  const fieldToHeader = new Map<string, string>();
  for (const header of params.columns) {
    const mapped = headerMapping[header];
    if (mapped && !fieldToHeader.has(mapped)) {
      fieldToHeader.set(mapped, header);
    }
  }

  const resolveHeader = (field: string) => fieldToHeader.get(field) ?? null;

  return { headerMapping, learnedHeaders, resolveHeader };
}

app.post("/imports/preview", requireAuth, async (req, res) => {
  const schema = z.object({
    type: z.enum(["drivers", "employees", "trucks", "trailers", "tms_load_sheet"]),
    csvText: z.string().min(1),
    mapping: z.record(z.string(), z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  if (parsed.data.type === "tms_load_sheet") {
    if (!req.user || !["ADMIN", "DISPATCHER", "HEAD_DISPATCHER"].includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const orgId = req.user.orgId;
    const [{ timeZone, warning }, defaultEntity, loads, trucks, trailers, customers] = await Promise.all([
      resolveOrgTimeZone(orgId),
      prisma.operatingEntity.findFirst({
        where: { orgId, isDefault: true },
        select: { id: true },
      }),
      prisma.load.findMany({ where: { orgId }, select: { loadNumber: true } }),
      prisma.truck.findMany({ where: { orgId }, select: { id: true, unit: true } }),
      prisma.trailer.findMany({ where: { orgId }, select: { id: true, unit: true } }),
      prisma.customer.findMany({ where: { orgId }, select: { id: true, name: true } }),
    ]);
    const fallbackEntity =
      defaultEntity ??
      (await prisma.operatingEntity.findFirst({
        where: { orgId },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }));
    const context = {
      orgId,
      timeZone,
      defaultOperatingEntityId: fallbackEntity?.id ?? "",
      existingLoadNumbers: new Set(loads.map((load) => load.loadNumber.toLowerCase())),
      trucksByUnit: new Map(trucks.map((truck) => [truck.unit.toLowerCase(), truck])),
      trailersByUnit: new Map(trailers.map((trailer) => [trailer.unit.toLowerCase(), trailer])),
      customersByName: new Map(customers.map((customer) => [customer.name.toLowerCase(), customer])),
    };
    const preview = previewTmsLoadSheet({ csvText: parsed.data.csvText, context });
    if (warning) {
      preview.headerWarnings = [...preview.headerWarnings, warning];
    }
    res.json(preview);
    return;
  }

  if (!hasPermission(req.user, Permission.ADMIN_SETTINGS)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { columns, rows } = parseCsvText(parsed.data.csvText);
  const allowedFields = IMPORT_FIELDS_BY_TYPE[parsed.data.type] ?? [];
  const requiredColumns = REQUIRED_IMPORT_FIELDS_BY_TYPE[parsed.data.type] ?? [];

  const learnedSuggestion = await applyLearned({
    orgId: req.user!.orgId,
    domain: LearningDomain.IMPORT_MAPPING,
    inputJson: { headers: columns },
  });
  const learnedMapping =
    (learnedSuggestion.suggestionJson?.mapping as Record<string, string> | undefined) ?? {};

  const { headerMapping, learnedHeaders, resolveHeader } = buildImportColumnResolver({
    columns,
    type: parsed.data.type,
    mapping: parsed.data.mapping,
    learnedMapping,
  });

  const missingColumns = requiredColumns.filter((col) => !resolveHeader(col));
  if (missingColumns.length > 0) {
    res.status(400).json({ error: `Missing required columns: ${missingColumns.join(", ")}` });
    return;
  }

  const previewRows = rows.map((row, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];
    const warnings: string[] = [];
    const getValue = (key: string) => {
      const header = resolveHeader(key);
      return header ? row[header] ?? "" : "";
    };
    const isEmpty = Object.values(row).every((value) => !String(value ?? "").trim());
    if (isEmpty) {
      errors.push("Empty row");
    }

    if (parsed.data.type === "employees") {
      const email = normalizeEmail(getValue("email"));
      const role = getValue("role").trim().toUpperCase();
      const name = getValue("name").trim();
      const phone = normalizePhone(getValue("phone"));
      const timezone = getValue("timezone").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push("Invalid email");
      }
      if (!["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"].includes(role)) {
        errors.push("Role must be ADMIN, DISPATCHER, HEAD_DISPATCHER, or BILLING");
      }
      return { rowNumber, data: { email, role, name, phone, timezone }, warnings, errors };
    }

    if (parsed.data.type === "drivers") {
      const name = getValue("name").trim();
      const phone = normalizePhone(getValue("phone"));
      const license = getValue("license").trim();
      const payRatePerMile = getValue("payRatePerMile").trim();
      const licenseExpiresAt = getValue("licenseExpiresAt").trim();
      const medCardExpiresAt = getValue("medCardExpiresAt").trim();
      if (!name) errors.push("Name is required");
      if (!phone) errors.push("Phone is required");
      if (payRatePerMile && Number.isNaN(Number(payRatePerMile))) {
        errors.push("Invalid payRatePerMile");
      }
      if (licenseExpiresAt && !toDate(licenseExpiresAt)) {
        errors.push("Invalid licenseExpiresAt");
      }
      if (medCardExpiresAt && !toDate(medCardExpiresAt)) {
        errors.push("Invalid medCardExpiresAt");
      }
      return {
        rowNumber,
        data: { name, phone, license, payRatePerMile, licenseExpiresAt, medCardExpiresAt },
        warnings,
        errors,
      };
    }

    if (parsed.data.type === "trucks") {
      const unit = getValue("unit").trim();
      const vinRaw = getValue("vin").trim();
      const plate = getValue("plate").trim();
      const plateStateRaw = getValue("plateState").trim();
      const status = getValue("status").trim().toUpperCase();
      if (!unit) errors.push("Unit is required");
      try {
        if (!normalizeVin(vinRaw)) {
          errors.push("VIN is required");
        }
      } catch (error) {
        errors.push((error as Error).message);
      }
      try {
        if (plateStateRaw) normalizePlateState(plateStateRaw);
      } catch (error) {
        errors.push((error as Error).message);
      }
      if (status && !["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"].includes(status)) {
        errors.push("Invalid status");
      }
      return { rowNumber, data: { unit, vin: vinRaw, plate, plateState: plateStateRaw, status }, warnings, errors };
    }

    const unit = getValue("unit").trim();
    const type = getValue("type").trim().toUpperCase();
    const plate = getValue("plate").trim();
    const plateStateRaw = getValue("plateState").trim();
    const status = getValue("status").trim().toUpperCase();
    if (!unit) errors.push("Unit is required");
    if (type && !["DRY_VAN", "REEFER", "FLATBED", "OTHER"].includes(type)) {
      errors.push("Invalid trailer type");
    }
    try {
      if (plateStateRaw) normalizePlateState(plateStateRaw);
    } catch (error) {
      errors.push((error as Error).message);
    }
    if (status && !["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"].includes(status)) {
      errors.push("Invalid status");
    }
    return { rowNumber, data: { unit, type, plate, plateState: plateStateRaw, status }, warnings, errors };
  });

  const valid = previewRows.filter((row) => row.errors.length === 0).length;
  const invalid = previewRows.length - valid;
  res.json({
    columns,
    rows: previewRows,
    summary: { total: previewRows.length, valid, invalid, warnings: 0 },
    headerWarnings: [],
    mapping: headerMapping,
    learnedHeaders,
    allowedFields,
  });
});

app.post("/imports/commit", requireAuth, async (req, res) => {
  const schema = z.object({
    type: z.enum(["drivers", "employees", "trucks", "trailers", "tms_load_sheet"]),
    csvText: z.string().min(1),
    importId: z.string().optional(),
    mapping: z.record(z.string(), z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  if (parsed.data.type === "tms_load_sheet") {
    if (!req.user || !["ADMIN", "DISPATCHER", "HEAD_DISPATCHER"].includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const orgId = req.user.orgId;
    const { columns, rows } = parseTmsCsvText(parsed.data.csvText);
    const { missingRequired, missingRequiredLabels } = validateTmsHeaders(columns);
    if (missingRequired.length > 0) {
      res.status(400).json({ error: `Missing required headers: ${missingRequiredLabels.join(", ")}` });
      return;
    }

    const [{ timeZone, warning }, defaultOperatingEntity, loads, trucks, trailers, customers] = await Promise.all([
      resolveOrgTimeZone(orgId),
      ensureDefaultOperatingEntity(orgId),
      prisma.load.findMany({ where: { orgId }, select: { loadNumber: true } }),
      prisma.truck.findMany({ where: { orgId }, select: { id: true, unit: true } }),
      prisma.trailer.findMany({ where: { orgId }, select: { id: true, unit: true } }),
      prisma.customer.findMany({ where: { orgId }, select: { id: true, name: true } }),
    ]);

    const context = {
      orgId,
      timeZone,
      defaultOperatingEntityId: defaultOperatingEntity.id,
      existingLoadNumbers: new Set(loads.map((load) => load.loadNumber.toLowerCase())),
      trucksByUnit: new Map(trucks.map((truck) => [truck.unit.toLowerCase(), truck])),
      trailersByUnit: new Map(trailers.map((trailer) => [trailer.unit.toLowerCase(), trailer])),
      customersByName: new Map(customers.map((customer) => [customer.name.toLowerCase(), customer])),
    };

    const created: Array<{ rowNumber: number; id: string }> = [];
    const warnings: Array<{ rowNumber: number; warnings: string[] }> = [];
    const errors: Array<{ rowNumber: number; errors: string[] }> = [];
    const skipped: Array<{ rowNumber: number; reason: string }> = [];
    const seenLoadNumbers = new Set<string>();
    const headerWarnings = warning ? [warning] : [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 2;
      const rowData = evaluateTmsRow({ row, rowNumber, context, seenLoadNumbers });
      if (rowData.errors.length > 0) {
        errors.push({ rowNumber, errors: rowData.errors });
        continue;
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          const customerKey = rowData.customerName.toLowerCase();
          const customer = await tx.customer.upsert({
            where: { orgId_name: { orgId, name: rowData.customerName } },
            update: {},
            create: { orgId, name: rowData.customerName },
          });

          const load = await tx.load.create({
            data: {
              orgId,
              loadNumber: rowData.loadNumber,
              status: rowData.status,
              loadType: rowData.loadType,
              operatingEntityId: context.defaultOperatingEntityId,
              customerId: customer.id,
              customerName: rowData.customerName,
              customerRef: rowData.customerRef,
              externalTripId: rowData.externalTripId,
              truckId: rowData.truckId,
              trailerId: rowData.trailerId,
              weightLbs: rowData.weightLbs,
              rate: rowData.rate,
              salesRepName: rowData.salesRepName,
              dropName: rowData.dropName,
              notes: null,
              desiredInvoiceDate: rowData.desiredInvoiceDate,
              createdById: req.user!.id,
            },
          });

          await tx.stop.create({
            data: {
              orgId,
              loadId: load.id,
              type: StopType.PICKUP,
              sequence: 1,
              status: "PLANNED",
              name: rowData.pickupStop.name,
              address: "",
              city: rowData.pickupStop.city,
              state: rowData.pickupStop.state,
              zip: "",
              notes: rowData.pickupStop.notes ?? null,
              appointmentStart: rowData.pickupStop.appointmentStart,
              appointmentEnd: rowData.pickupStop.appointmentEnd,
            },
          });

          await tx.stop.create({
            data: {
              orgId,
              loadId: load.id,
              type: StopType.DELIVERY,
              sequence: 2,
              status: "PLANNED",
              name: rowData.deliveryStop.name,
              address: "",
              city: rowData.deliveryStop.city,
              state: rowData.deliveryStop.state,
              zip: "",
              notes: rowData.deliveryStop.notes ?? null,
              appointmentStart: rowData.deliveryStop.appointmentStart,
              appointmentEnd: rowData.deliveryStop.appointmentEnd,
            },
          });

          await tx.event.create({
            data: {
              orgId,
              loadId: load.id,
              type: EventType.LOAD_CREATED,
              message: "Load imported from TMS Load Sheet",
              meta: { importType: "tms_load_sheet", rowNumber },
            },
          });

          return { loadId: load.id, customer };
        });

        context.existingLoadNumbers.add(rowData.loadNumber.toLowerCase());
        context.customersByName.set(result.customer.name.toLowerCase(), result.customer);
        created.push({ rowNumber, id: result.loadId });
        if (rowData.warnings.length > 0) {
          warnings.push({ rowNumber, warnings: rowData.warnings });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to import row";
        errors.push({ rowNumber, errors: [message] });
      }
    }

    res.json({ created, updated: [], skipped, errors, warnings, headerWarnings });
    return;
  }

  if (!hasPermission(req.user, Permission.ADMIN_SETTINGS)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { columns, rows } = parseCsvText(parsed.data.csvText);
  const requiredColumns = REQUIRED_IMPORT_FIELDS_BY_TYPE[parsed.data.type] ?? [];

  const learnedSuggestion = await applyLearned({
    orgId: req.user!.orgId,
    domain: LearningDomain.IMPORT_MAPPING,
    inputJson: { headers: columns },
  });
  const learnedMapping =
    (learnedSuggestion.suggestionJson?.mapping as Record<string, string> | undefined) ?? {};

  const { resolveHeader } = buildImportColumnResolver({
    columns,
    type: parsed.data.type,
    mapping: parsed.data.mapping,
    learnedMapping,
  });

  const missingColumns = requiredColumns.filter((col) => !resolveHeader(col));
  if (missingColumns.length > 0) {
    res.status(400).json({ error: `Missing required columns: ${missingColumns.join(", ")}` });
    return;
  }

  const created: any[] = [];
  const updated: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  const getValue = (row: Record<string, string>, key: string) => {
    const header = resolveHeader(key);
    return header ? row[header] ?? "" : "";
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const rowErrors: string[] = [];
    const isEmpty = Object.values(row).every((value) => !String(value ?? "").trim());
    if (isEmpty) {
      skipped.push({ rowNumber, reason: "Empty row" });
      continue;
    }

    if (parsed.data.type === "employees") {
      const email = normalizeEmail(getValue(row, "email"));
      const role = getValue(row, "role").trim().toUpperCase();
      const name = getValue(row, "name").trim();
      const timezone = getValue(row, "timezone").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        rowErrors.push("Invalid email");
      }
      if (!["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"].includes(role)) {
        rowErrors.push("Role must be ADMIN, DISPATCHER, HEAD_DISPATCHER, or BILLING");
      }
      if (rowErrors.length > 0) {
        errors.push({ rowNumber, errors: rowErrors });
        continue;
      }

      const existing = await prisma.user.findFirst({
        where: { orgId: req.user!.orgId, email },
      });
      if (existing && existing.role === "DRIVER") {
        errors.push({ rowNumber, errors: ["Existing user is a DRIVER"] });
        continue;
      }
      if (existing) {
        const user = await prisma.user.update({
          where: { id: existing.id },
          data: { role: role as Role, name: name || existing.name, timezone: timezone || existing.timezone },
        });
        updated.push({ rowNumber, id: user.id, email: user.email });
      } else {
        const tempPassword = crypto.randomBytes(16).toString("hex");
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        const user = await prisma.user.create({
          data: {
            orgId: req.user!.orgId,
            email,
            passwordHash,
            role: role as Role,
            name: name || null,
            timezone: timezone || null,
          },
        });
        created.push({ rowNumber, id: user.id, email: user.email });
      }
      continue;
    }

    if (parsed.data.type === "drivers") {
      const name = getValue(row, "name").trim();
      const phone = normalizePhone(getValue(row, "phone"));
      const license = getValue(row, "license").trim() || null;
      const payRateRaw = getValue(row, "payRatePerMile").trim();
      const licenseExpiresAtRaw = getValue(row, "licenseExpiresAt").trim();
      const medCardExpiresAtRaw = getValue(row, "medCardExpiresAt").trim();
      if (!name) rowErrors.push("Name is required");
      if (!phone) rowErrors.push("Phone is required");
      if (payRateRaw && Number.isNaN(Number(payRateRaw))) {
        rowErrors.push("Invalid payRatePerMile");
      }
      if (licenseExpiresAtRaw && !toDate(licenseExpiresAtRaw)) {
        rowErrors.push("Invalid licenseExpiresAt");
      }
      if (medCardExpiresAtRaw && !toDate(medCardExpiresAtRaw)) {
        rowErrors.push("Invalid medCardExpiresAt");
      }
      if (rowErrors.length > 0) {
        errors.push({ rowNumber, errors: rowErrors });
        continue;
      }

      const existing = await prisma.driver.findFirst({
        where: { orgId: req.user!.orgId, phone },
      });
      const payload = {
        name,
        phone,
        license,
        payRatePerMile: payRateRaw ? toDecimal(payRateRaw) : null,
        licenseExpiresAt: licenseExpiresAtRaw ? toDate(licenseExpiresAtRaw) : null,
        medCardExpiresAt: medCardExpiresAtRaw ? toDate(medCardExpiresAtRaw) : null,
      };
      if (existing) {
        const driver = await prisma.driver.update({
          where: { id: existing.id },
          data: payload,
        });
        updated.push({ rowNumber, id: driver.id, phone: driver.phone });
      } else {
        const driver = await prisma.driver.create({
          data: { orgId: req.user!.orgId, ...payload },
        });
        created.push({ rowNumber, id: driver.id, phone: driver.phone });
      }
      continue;
    }

    if (parsed.data.type === "trucks") {
      const unit = getValue(row, "unit").trim();
      const vinRaw = getValue(row, "vin").trim();
      const plate = normalizeOptionalText(getValue(row, "plate")) ?? null;
      const plateStateRaw = getValue(row, "plateState").trim();
      const statusRaw = getValue(row, "status").trim().toUpperCase();
      if (!unit) rowErrors.push("Unit is required");
      let vin: string | null = null;
      try {
        vin = normalizeVin(vinRaw);
      } catch (error) {
        rowErrors.push((error as Error).message);
      }
      if (!vin) rowErrors.push("VIN is required");
      let plateState: string | null = null;
      try {
        plateState = normalizePlateState(plateStateRaw);
      } catch (error) {
        if (plateStateRaw) rowErrors.push((error as Error).message);
      }
      const status = statusRaw || "AVAILABLE";
      if (!["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"].includes(status)) {
        rowErrors.push("Invalid status");
      }
      if (rowErrors.length > 0) {
        errors.push({ rowNumber, errors: rowErrors });
        continue;
      }

      const existingByUnit = await prisma.truck.findFirst({
        where: { orgId: req.user!.orgId, unit },
      });
      const existingByVin = vin
        ? await prisma.truck.findFirst({ where: { orgId: req.user!.orgId, vin } })
        : null;
      if (existingByUnit && existingByVin && existingByUnit.id !== existingByVin.id) {
        errors.push({ rowNumber, errors: ["VIN belongs to another truck"] });
        continue;
      }
      const existing = existingByUnit ?? existingByVin;
      const payload = {
        unit,
        vin,
        plate,
        plateState,
        status: status as TruckStatus,
      };
      if (existing) {
        const truck = await prisma.truck.update({
          where: { id: existing.id },
          data: payload,
        });
        updated.push({ rowNumber, id: truck.id, unit: truck.unit });
      } else {
        const truck = await prisma.truck.create({
          data: { orgId: req.user!.orgId, ...payload },
        });
        created.push({ rowNumber, id: truck.id, unit: truck.unit });
      }
      continue;
    }

    const unit = getValue(row, "unit").trim();
    const typeRaw = getValue(row, "type").trim().toUpperCase();
    const plate = normalizeOptionalText(getValue(row, "plate")) ?? null;
    const plateStateRaw = getValue(row, "plateState").trim();
    const statusRaw = getValue(row, "status").trim().toUpperCase();
    if (!unit) rowErrors.push("Unit is required");
    const type = typeRaw || "OTHER";
    if (!["DRY_VAN", "REEFER", "FLATBED", "OTHER"].includes(type)) {
      rowErrors.push("Invalid trailer type");
    }
    let plateState: string | null = null;
    try {
      plateState = normalizePlateState(plateStateRaw);
    } catch (error) {
      if (plateStateRaw) rowErrors.push((error as Error).message);
    }
    const status = statusRaw || "AVAILABLE";
    if (!["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"].includes(status)) {
      rowErrors.push("Invalid status");
    }
    if (rowErrors.length > 0) {
      errors.push({ rowNumber, errors: rowErrors });
      continue;
    }

    const existing = await prisma.trailer.findFirst({
      where: { orgId: req.user!.orgId, unit },
    });
    const payload = {
      unit,
      type: type as TrailerType,
      plate,
      plateState,
      status: status as TrailerStatus,
    };
    if (existing) {
      const trailer = await prisma.trailer.update({
        where: { id: existing.id },
        data: payload,
      });
      updated.push({ rowNumber, id: trailer.id, unit: trailer.unit });
    } else {
      const trailer = await prisma.trailer.create({
        data: { orgId: req.user!.orgId, ...payload },
      });
      created.push({ rowNumber, id: trailer.id, unit: trailer.unit });
    }
  }

  await createEvent({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    type: EventType.IMPORT_COMPLETED,
    message: `Import ${parsed.data.type} completed`,
    meta: {
      type: parsed.data.type,
      created: created.length,
      updated: updated.length,
      skipped: skipped.length,
      errors: errors.length,
      importId: parsed.data.importId,
    },
  });

  res.json({ created, updated, skipped, errors });
});

async function createInvite(params: { orgId: string; email: string; role: Role; invitedByUserId?: string | null }) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.userInvite.deleteMany({
    where: {
      orgId: params.orgId,
      email: params.email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  const invite = await prisma.userInvite.create({
    data: {
      orgId: params.orgId,
      email: params.email,
      role: params.role,
      tokenHash,
      expiresAt,
      invitedByUserId: params.invitedByUserId ?? null,
    },
  });
  const inviteBase = process.env.WEB_ORIGIN || "http://localhost:3000";
  const inviteUrl = `${inviteBase}/invite/${token}`;
  return { invite, inviteUrl };
}

app.post("/admin/invites", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    role: z.enum(["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING", "DRIVER"]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const { invite, inviteUrl } = await createInvite({
    orgId: req.user!.orgId,
    email,
    role: parsed.data.role,
    invitedByUserId: req.user!.id,
  });
  res.json({
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      inviteUrl,
    },
  });
});

app.post("/users/invite-bulk", requireAuth, requirePermission(Permission.ADMIN_SETTINGS), async (req, res) => {
  const schema = z.object({ userIds: z.array(z.string()).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const users = await prisma.user.findMany({
    where: { id: { in: parsed.data.userIds }, orgId: req.user!.orgId },
  });
  const invites = [];
  for (const user of users) {
    const { inviteUrl } = await createInvite({
      orgId: req.user!.orgId,
      email: normalizeEmail(user.email),
      role: user.role as Role,
      invitedByUserId: req.user!.id,
    });
    invites.push({
      userId: user.id,
      email: user.email,
      inviteUrl,
    });
  }
  res.json({ invites });
});


app.get("/invite/:token", async (req, res) => {
  const tokenHash = hashInviteToken(req.params.token);
  const invite = await prisma.userInvite.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() }, acceptedAt: null },
    include: { org: true },
  });
  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  res.json({
    invite: {
      id: invite.id,
      expiresAt: invite.expiresAt,
      email: invite.email,
      role: invite.role,
      org: { id: invite.org.id, name: invite.org.name },
    },
  });
});

app.post("/invite/:token/accept", async (req, res) => {
  const schema = z.object({
    password: z.string().min(8),
    name: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const tokenHash = hashInviteToken(req.params.token);
  const invite = await prisma.userInvite.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() }, acceptedAt: null },
  });
  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.upsert({
    where: { orgId_email: { orgId: invite.orgId, email: invite.email } },
    create: {
      orgId: invite.orgId,
      email: invite.email,
      name: parsed.data.name ?? null,
      role: invite.role,
      status: UserStatus.ACTIVE,
      isActive: true,
      passwordHash,
    },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      isActive: true,
      name: parsed.data.name ?? undefined,
    },
  });
  await prisma.userInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });
  res.json({ ok: true, user: { id: user.id, email: user.email } });
});

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [] as Record<string, string>[];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function parseCsvText(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { columns: [] as string[], rows: [] as Record<string, string>[] };
  }
  const columns = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    columns.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
  return { columns, rows };
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function extractEmailDomain(value?: string | null) {
  if (!value) return null;
  const atIndex = value.indexOf("@");
  if (atIndex === -1) return null;
  const domain = value.slice(atIndex + 1).trim().toLowerCase();
  return domain || null;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function getWeekKey(date: Date) {
  const year = getISOWeekYear(date);
  const week = String(getISOWeek(date)).padStart(2, "0");
  return `${year}-W${week}`;
}

function getWeekLabel(date: Date) {
  const start = startOfISOWeek(date);
  const end = endOfISOWeek(date);
  return `Week of ${format(start, "MMM d")}–${format(end, "MMM d")}`;
}

function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function resolveSessionUser(req: { headers: any; cookies?: Record<string, string> }) {
  const cookies = req.cookies ?? parse(req.headers.cookie || "");
  req.cookies = cookies;
  const token = cookies.session;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await prisma.session.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() }, revokedAt: null },
    include: { user: true },
  });
  if (!session) return null;
  if (!session.user.isActive || session.user.status !== UserStatus.ACTIVE) return null;
  const now = Date.now();
  if (!session.lastUsedAt || now - session.lastUsedAt.getTime() > 15 * 60 * 1000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
  }
  return session.user;
}

function requireSessionCsrf(req: { headers: any; cookies?: Record<string, string> }, res: Response) {
  const csrfCookie = req.cookies?.csrf;
  const csrfHeader = req.headers["x-csrf-token"];
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    res.status(403).json({ error: "Invalid CSRF token" });
    return false;
  }
  return true;
}

const MFA_CHALLENGE_TTL_MINUTES = 10;

function parseRecoveryHashes(value?: string | null) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string");
    }
  } catch {
    // fall through
  }
  return [];
}

async function createMfaChallenge(userId: string, purpose: MfaChallengePurpose) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MINUTES * 60 * 1000);
  await prisma.mfaChallenge.deleteMany({ where: { userId, purpose } });
  await prisma.mfaChallenge.create({
    data: {
      userId,
      tokenHash,
      purpose,
      expiresAt,
    },
  });
  return token;
}

async function getMfaChallenge(token: string, purpose: MfaChallengePurpose) {
  const tokenHash = hashToken(token);
  return prisma.mfaChallenge.findFirst({
    where: { tokenHash, purpose, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
}

function toNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
}

function toDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

app.post(
  "/admin/import/loads",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "DISPATCHER"),
  csvUpload.fields([
    { name: "loads", maxCount: 1 },
    { name: "stops", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]>;
    const loadsFile = files?.loads?.[0];
    const stopsFile = files?.stops?.[0];
    if (!loadsFile || !stopsFile) {
      res.status(400).json({ error: "Both loads.csv and stops.csv are required." });
      return;
    }

    const wipe = String(req.body?.wipe || "").toLowerCase() === "true";
    const orgId = req.user!.orgId;
    const defaultOperatingEntity = await ensureDefaultOperatingEntity(orgId);

    if (wipe) {
      await prisma.task.deleteMany({ where: { orgId } });
      await prisma.event.deleteMany({ where: { orgId } });
      await prisma.document.deleteMany({ where: { orgId } });
      await prisma.invoice.deleteMany({ where: { orgId } });
      await prisma.stop.deleteMany({ where: { orgId } });
      await prisma.load.deleteMany({ where: { orgId } });
    }

    const loadRows = parseCsv(loadsFile.buffer.toString("utf8"));
    const stopRows = parseCsv(stopsFile.buffer.toString("utf8"));

    const existingLoads = await prisma.load.findMany({
      where: { orgId },
      select: { id: true, loadNumber: true },
    });
    const loadMap = new Map(existingLoads.map((load) => [load.loadNumber, load]));

    const existingCustomers = await prisma.customer.findMany({
      where: { orgId },
      select: { id: true, name: true },
    });
    const customerMap = new Map(
      existingCustomers.map((customer) => [customer.name.toLowerCase(), customer.id])
    );

    const drivers = await prisma.user.findMany({
      where: { orgId, role: "DRIVER" },
      include: { driver: true },
    });
    const driverMap = new Map(
      drivers
        .filter((user) => user.driver)
        .map((user) => [user.email.toLowerCase(), user.driver!.id])
    );

    const trucks = await prisma.truck.findMany({ where: { orgId } });
    const trailers = await prisma.trailer.findMany({ where: { orgId } });
    const truckMap = new Map(trucks.map((truck) => [truck.unit.toLowerCase(), truck.id]));
    const trailerMap = new Map(trailers.map((trailer) => [trailer.unit.toLowerCase(), trailer.id]));

    let createdLoads = 0;
    let skippedLoads = 0;
    for (const row of loadRows) {
      const loadNumber = row.loadNumber?.trim();
      if (!loadNumber || loadMap.has(loadNumber)) {
        skippedLoads += 1;
        continue;
      }

      const driverEmail = row.assignedDriverEmail?.trim().toLowerCase();
      const truckUnit = row.truckUnit?.trim().toLowerCase();
      const trailerUnit = row.trailerUnit?.trim().toLowerCase();
      const customerName = row.customerName?.trim() || "Unknown";
      const customerKey = customerName.toLowerCase();
      let customerId = customerMap.get(customerKey);
      if (!customerId) {
        const created = await prisma.customer.create({
          data: { orgId, name: customerName },
        });
        customerId = created.id;
        customerMap.set(customerKey, created.id);
      }

      let truckId = truckUnit ? truckMap.get(truckUnit) : undefined;
      if (!truckId && truckUnit) {
        const truck = await prisma.truck.create({ data: { orgId, unit: row.truckUnit } });
        truckId = truck.id;
        truckMap.set(truckUnit, truck.id);
      }

      let trailerId = trailerUnit ? trailerMap.get(trailerUnit) : undefined;
      if (!trailerId && trailerUnit) {
        const trailer = await prisma.trailer.create({ data: { orgId, unit: row.trailerUnit } });
        trailerId = trailer.id;
        trailerMap.set(trailerUnit, trailer.id);
      }

      const assignedDriverId = driverEmail ? driverMap.get(driverEmail) : undefined;
      const status = row.status?.trim() || (assignedDriverId ? "ASSIGNED" : "PLANNED");
      const rateValue = toNumber(row.rate ?? "") ?? undefined;
      let shipperReferenceNumber: string | null = null;
      let consigneeReferenceNumber: string | null = null;
      let palletCount: number | null = null;
      let weightLbs: number | null = null;
      try {
        shipperReferenceNumber = normalizeReference(row.shipperReferenceNumber ?? "");
        consigneeReferenceNumber = normalizeReference(row.consigneeReferenceNumber ?? "");
        palletCount = parseOptionalNonNegativeInt(row.palletCount ?? "", "Pallet count");
        weightLbs = parseOptionalNonNegativeInt(row.weightLbs ?? "", "Weight (lbs)");
      } catch (error) {
        res.status(400).json({ error: (error as Error).message, loadNumber });
        return;
      }

      const loadType = row.loadType?.trim() === "BROKERED" ? LoadType.BROKERED : LoadType.COMPANY;
      const load = await prisma.load.create({
        data: {
          orgId,
          loadNumber,
          loadType,
          operatingEntityId: defaultOperatingEntity.id,
          customerId,
          customerName,
          shipperReferenceNumber,
          consigneeReferenceNumber,
          palletCount,
          weightLbs,
          miles: toNumber(row.miles ?? "") ?? undefined,
          rate: rateValue !== undefined ? new Prisma.Decimal(rateValue) : undefined,
          assignedDriverId: assignedDriverId ?? null,
          truckId: truckId ?? null,
          trailerId: trailerId ?? null,
          status: status as any,
          completedAt: isCompletedStatus(status as LoadStatus) ? new Date() : null,
        },
      });
      loadMap.set(loadNumber, load);
      createdLoads += 1;
    }

    let createdStops = 0;
    let skippedStops = 0;
    for (const row of stopRows) {
      const loadNumber = row.loadNumber?.trim();
      if (!loadNumber || !loadMap.has(loadNumber)) {
        skippedStops += 1;
        continue;
      }
      const load = loadMap.get(loadNumber)!;
      const sequence = Number(row.sequence || 0);
      if (!sequence) {
        skippedStops += 1;
        continue;
      }

      const existing = await prisma.stop.findFirst({
        where: { loadId: load.id, orgId, sequence },
      });
      if (existing) {
        skippedStops += 1;
        continue;
      }

      await prisma.stop.create({
        data: {
          orgId,
          loadId: load.id,
          type: (row.type || "PICKUP") as any,
          name: row.name || "Unknown",
          address: row.address || "",
          city: row.city || "",
          state: row.state || "",
          zip: row.zip || "",
          appointmentStart: toDate(row.appointmentStart || "") ?? undefined,
          appointmentEnd: toDate(row.appointmentEnd || "") ?? undefined,
          arrivedAt: toDate(row.arrivedAt || "") ?? undefined,
          departedAt: toDate(row.departedAt || "") ?? undefined,
          sequence,
        },
      });
      createdStops += 1;
    }

    res.json({ createdLoads, skippedLoads, createdStops, skippedStops });
  }
);

app.post("/admin/drivers", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    email: z.string().email().optional(),
    name: z.string().min(2),
    phone: z.string().optional(),
    license: z.string().optional(),
    licenseState: z.string().optional(),
    licenseExpiresAt: z.string().optional(),
    medCardExpiresAt: z.string().optional(),
    payRatePerMile: z.union([z.number(), z.string()]).optional(),
    password: z.string().min(6).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const hasEmail = Boolean(parsed.data.email);
  if (hasEmail && !parsed.data.password) {
    res.status(400).json({ error: "Password required when creating a driver login." });
    return;
  }
  const { user, driver } = await prisma.$transaction(async (tx) => {
    let user: any | null = null;
    if (parsed.data.email && parsed.data.password) {
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      user = await tx.user.create({
        data: {
          orgId: req.user!.orgId,
          email: parsed.data.email,
          name: parsed.data.name,
          role: "DRIVER",
          passwordHash,
        },
      });
    }
    const driver = await tx.driver.create({
      data: {
        orgId: req.user!.orgId,
        userId: user?.id ?? null,
        name: parsed.data.name,
        phone: parsed.data.phone,
        license: parsed.data.license,
        licenseState: parsed.data.licenseState,
        licenseExpiresAt: parsed.data.licenseExpiresAt ? new Date(parsed.data.licenseExpiresAt) : null,
        medCardExpiresAt: parsed.data.medCardExpiresAt ? new Date(parsed.data.medCardExpiresAt) : null,
        payRatePerMile: parsed.data.payRatePerMile ? toDecimal(parsed.data.payRatePerMile) : null,
      },
    });
    return { user, driver };
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DRIVER_CREATED",
    entity: "Driver",
    entityId: driver.id,
    summary: `Created driver ${driver.name}`,
  });
  res.json({ user, driver });
});

app.post("/admin/users", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    role: z.enum(["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING", "DRIVER"]),
    phone: z.string().optional(),
    timezone: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const { invite, inviteUrl } = await createInvite({
    orgId: req.user!.orgId,
    email,
    role: parsed.data.role,
    invitedByUserId: req.user!.id,
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "USER_INVITED",
    entity: "UserInvite",
    entityId: invite.id,
    summary: `Invited user ${email}`,
  });
  res.json({
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      inviteUrl,
    },
  });
});

const port = Number(process.env.PORT || process.env.API_PORT || 4000);
const host = process.env.API_HOST || "0.0.0.0";
ensureUploadDirs().then(() => {
  app.listen(port, host, () => {
    console.log(`API listening on ${host}:${port}`);
  });
});

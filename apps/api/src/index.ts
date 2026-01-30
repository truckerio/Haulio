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
import {
  upload,
  saveDocumentFile,
  saveDriverProfilePhoto,
  saveUserProfilePhoto,
  saveLoadConfirmationFile,
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
import {
  applyTeamFilterOverride,
  ensureDefaultTeamForOrg,
  ensureEntityAssignedToDefaultTeam,
  ensureTeamAssignmentsForEntityType,
  getScopedEntityIds,
  getUserTeamScope,
} from "./lib/team-scope";
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
import path from "path";

const app = express();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const DEV_ERRORS = process.env.NODE_ENV !== "production";

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

type LoadStatusRecord = { id: string; loadNumber: string; status: LoadStatus };

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
  const updated = await prisma.load.update({
    where: { id: params.load.id },
    data: {
      status: params.nextStatus,
      ...(params.data ?? {}),
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
const allowedOrigins = [
  process.env.WEB_ORIGIN,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  req.cookies = parse(req.headers.cookie || "");
  next();
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
    secure: false,
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
  const users = await prisma.user.findMany({ where: { email: parsed.data.email } });
  if (users.length === 0) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (users.length > 1) {
    res.status(400).json({ error: "Multiple orgs found for this email. Ask your admin to reset login." });
    return;
  }
  const user = users[0];
  if (!user.isActive) {
    res.status(403).json({ error: "User is inactive" });
    return;
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
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

app.post("/auth/forgot", async (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }
  const users = await prisma.user.findMany({ where: { email: parsed.data.email } });
  if (users.length === 0) {
    res.json({ message: "If an account exists, a reset link is available." });
    return;
  }
  if (users.length > 1) {
    res.status(400).json({ error: "Multiple accounts found for this email. Contact your admin." });
    return;
  }
  const user = users[0];
  if (!user.isActive) {
    res.status(403).json({ error: "User is inactive" });
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
  res.json({ message: "Reset link generated.", resetUrl });
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
      select: { canSeeAllTeams: true },
    }),
  ]);
  res.json({
    user: { ...req.user, canSeeAllTeams: userRecord?.canSeeAllTeams ?? false },
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
    assignedRole: z.enum(["ADMIN", "DISPATCHER", "BILLING", "DRIVER"]).nullable().optional(),
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

  const addBlock = (item: Omit<TodayItem, "severity">) => blocks.push({ severity: "block", ...item });
  const addWarning = (item: Omit<TodayItem, "severity">) => warnings.push({ severity: "warning", ...item });
  const addInfo = (item: Omit<TodayItem, "severity">) => info.push({ severity: "info", ...item });

  if (role === "ADMIN" || role === "DISPATCHER") {
    const [settings, unassignedCount, unassignedSample, rateConCount, rateConSample, activeAssignments, transitLoads] =
      await Promise.all([
        prisma.orgSettings.findFirst({ where: { orgId }, select: { requireRateConBeforeDispatch: true } }),
        prisma.load.count({
          where: {
            orgId,
            deletedAt: null,
            status: { in: [LoadStatus.PLANNED, LoadStatus.ASSIGNED] },
            OR: [{ assignedDriverId: null }, { truckId: null }, { trailerId: null }],
          },
        }),
        prisma.load.findFirst({
          where: {
            orgId,
            deletedAt: null,
            status: { in: [LoadStatus.PLANNED, LoadStatus.ASSIGNED] },
            OR: [{ assignedDriverId: null }, { truckId: null }, { trailerId: null }],
          },
          select: { id: true },
        }),
        prisma.load.count({
          where: {
            orgId,
            deletedAt: null,
            status: { in: [LoadStatus.PLANNED, LoadStatus.ASSIGNED] },
            loadType: LoadType.BROKERED,
            docs: { none: { type: DocType.RATECON } },
          },
        }),
        prisma.load.findFirst({
          where: {
            orgId,
            deletedAt: null,
            status: { in: [LoadStatus.PLANNED, LoadStatus.ASSIGNED] },
            loadType: LoadType.BROKERED,
            docs: { none: { type: DocType.RATECON } },
          },
          select: { id: true },
        }),
        prisma.load.findMany({
          where: {
            orgId,
            deletedAt: null,
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
          where: { orgId, deletedAt: null, status: LoadStatus.IN_TRANSIT },
          select: {
            id: true,
            loadNumber: true,
            createdAt: true,
            stops: { select: { arrivedAt: true, departedAt: true } },
          },
        }),
      ]);

    if (unassignedCount > 0) {
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
      addWarning({
        ruleId: "dispatch_stuck_in_transit",
        title: "Loads stuck in transit",
        detail: `${stuckLoads.length} load${stuckLoads.length === 1 ? "" : "s"} with no recent stop activity.`,
        href: "/loads",
        entityType: "load",
        entityId: stuckLoads[0]?.id ?? null,
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

  res.json({ blocks, warnings, info });
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
          orderBy: [{ assignedDriverId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
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
        items: ordered,
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
  const [load, settings] = await Promise.all([
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
        invoices: true,
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
        docs: {
          where: { type: { in: [DocType.POD, DocType.RATECON] } },
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
        where: { orgId: req.user!.orgId, loadId: load.id, type: DocType.RATECON },
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
        where: { orgId: req.user!.orgId, loadId: leg.loadId, type: DocType.RATECON },
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
        where: { orgId: req.user!.orgId, loadId: leg.loadId, type: DocType.RATECON },
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

app.post("/loads/:id/assign", requireAuth, requireOperationalOrg, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const schema = z.object({
    driverId: z.string(),
    truckId: z.string().optional(),
    trailerId: z.string().optional(),
    overrideReason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
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
  const [driverCheck, truckCheck, trailerCheck, settings] = await Promise.all([
    prisma.driver.findFirst({ where: { id: parsed.data.driverId, orgId: req.user!.orgId } }),
    parsed.data.truckId
      ? prisma.truck.findFirst({ where: { id: parsed.data.truckId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.trailerId
      ? prisma.trailer.findFirst({ where: { id: parsed.data.trailerId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } }),
  ]);
  if (!driverCheck || (parsed.data.truckId && !truckCheck) || (parsed.data.trailerId && !trailerCheck)) {
    res.status(400).json({ error: "Invalid asset assignment" });
    return;
  }

  if (settings?.requireRateConBeforeDispatch && load.loadType === LoadType.BROKERED) {
    const hasRateCon = await prisma.document.findFirst({
      where: { orgId: req.user!.orgId, loadId: load.id, type: DocType.RATECON },
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
    parsed.data.driverId !== load.assignedDriverId ? now : load.assignedDriverAt ?? null;
  const assignedTruckAt =
    parsed.data.truckId !== load.truckId ? (parsed.data.truckId ? now : null) : load.assignedTruckAt ?? null;
  const assignedTrailerAt =
    parsed.data.trailerId !== load.trailerId ? (parsed.data.trailerId ? now : null) : load.assignedTrailerAt ?? null;

  const updated = await prisma.load.update({
    where: { id: load.id },
    data: {
      assignedDriverId: parsed.data.driverId,
      truckId: parsed.data.truckId ?? null,
      trailerId: parsed.data.trailerId ?? null,
      assignedDriverAt,
      assignedTruckAt,
      assignedTrailerAt,
      status: load.status === LoadStatus.ASSIGNED ? undefined : LoadStatus.ASSIGNED,
    },
  });

  const activeLeg = await prisma.loadLeg.findFirst({
    where: { loadId: updated.id, orgId: req.user!.orgId, status: LegStatus.IN_PROGRESS },
    orderBy: { sequence: "desc" },
  });
  if (activeLeg) {
    await prisma.loadLeg.update({
      where: { id: activeLeg.id },
      data: {
        driverId: parsed.data.driverId,
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

  if (load.assignedDriverId && load.assignedDriverId !== parsed.data.driverId) {
    await resetStatusIfIdle("driver", load.assignedDriverId);
  }
  if (load.truckId && load.truckId !== (parsed.data.truckId ?? null)) {
    await resetStatusIfIdle("truck", load.truckId);
  }
  if (load.trailerId && load.trailerId !== (parsed.data.trailerId ?? null)) {
    await resetStatusIfIdle("trailer", load.trailerId);
  }

  await Promise.all([
    prisma.driver.update({ where: { id: driverCheck.id }, data: { status: DriverStatus.ON_LOAD } }),
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
  res.json({ load: updated });
});

app.post("/loads/:id/unassign", requireAuth, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
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
      assignedDriverId: driver.id,
      status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
    },
    include: {
      stops: { orderBy: { sequence: "asc" } },
      docs: true,
      driver: true,
      customer: true,
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
    if (!stopCheck || stopCheck.load.assignedDriverId !== driver.id) {
      res.status(403).json({ error: "Not assigned to this load" });
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
    if (!stopCheck || stopCheck.load.assignedDriverId !== driver.id) {
      res.status(403).json({ error: "Not assigned to this load" });
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
  if (!load || load.assignedDriverId !== driver.id) {
    res.status(403).json({ error: "Not assigned to this load" });
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
  if (load.assignedDriverId !== driver.id) {
    res.status(403).json({ error: "Not assigned to this load" });
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
  if (!["ADMIN", "DISPATCHER", "DRIVER"].includes(req.user!.role)) {
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
    if (!driver || load.assignedDriverId !== driver.id) {
      res.status(403).json({ error: "Not assigned to this load" });
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
  if (!["ADMIN", "DISPATCHER", "DRIVER"].includes(req.user!.role)) {
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
    if (!driver || load.assignedDriverId !== driver.id) {
      res.status(403).json({ error: "Not assigned to this load" });
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
  if (!["ADMIN", "DISPATCHER", "DRIVER"].includes(req.user!.role)) {
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
    if (!driver || load.assignedDriverId !== driver.id) {
      res.status(403).json({ error: "Not assigned to this load" });
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
    if (!driver || load.assignedDriverId !== driver.id) {
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
    if (!driver || load.assignedDriverId !== driver.id) {
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
      if (doc.type === DocType.POD && stop?.type === StopType.DELIVERY) {
        let currentStatus = load.status;
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
        }
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
    const schema = z.object({ loadId: z.string(), type: z.nativeEnum(DocType), stopId: z.string().optional() });
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
      if (!driver || load.assignedDriverId !== driver.id) {
        res.status(403).json({ error: "Not assigned to this load" });
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
      if (doc.type === DocType.POD && stop?.type === StopType.DELIVERY) {
        let currentStatus = load.status;
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
        }
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
  res.json({ doc: updated });
});

app.get("/billing/queue", requireAuth, requirePermission(Permission.DOC_VERIFY, Permission.INVOICE_SEND), async (req, res) => {
  const delivered = await prisma.load.findMany({
    where: { orgId: req.user!.orgId, status: { in: [LoadStatus.DELIVERED, LoadStatus.POD_RECEIVED] } },
    include: { docs: true, stops: true, driver: true, customer: true, operatingEntity: true },
  });
  const ready = await prisma.load.findMany({
    where: { orgId: req.user!.orgId, status: LoadStatus.READY_TO_INVOICE },
    include: { docs: true, stops: true, driver: true, customer: true, operatingEntity: true },
  });
  const invoiced = await prisma.load.findMany({
    where: { orgId: req.user!.orgId, status: LoadStatus.INVOICED },
    include: { docs: true, stops: true, driver: true, customer: true, operatingEntity: true, invoices: { include: { items: true } } },
  });
  res.json({ delivered, ready, invoiced });
});

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
  });
  if (existingInvoice) {
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
    return { invoice: existingInvoice, missingDocs: [] } as const;
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
  if (!relativePath.startsWith("invoices/")) {
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
    const invoice = await prisma.invoice.findFirst({
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
    const invoice = await prisma.invoice.findFirst({
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
  let filePath: string;
  try {
    filePath = resolveUploadPath(`${type}/${name}`);
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

app.get("/admin/settings", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  res.json({ settings });
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
  const team = await prisma.team.create({
    data: { orgId: req.user!.orgId, name: parsed.data.name, active: true },
  });
  res.json({ team: { id: team.id, name: team.name, active: team.active } });
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
  const team = await prisma.team.update({
    where: { id: existing.id },
    data: {
      name: parsed.data.name ?? existing.name,
      active: parsed.data.active ?? existing.active,
    },
  });
  res.json({ team: { id: team.id, name: team.name, active: team.active } });
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
  const team = await prisma.team.findFirst({
    where: { id: parsed.data.teamId, orgId: req.user!.orgId },
  });
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  let validEntityIds: string[] = [];
  if (parsed.data.entityType === TeamEntityType.LOAD) {
    validEntityIds = (await prisma.load.findMany({
      where: { orgId: req.user!.orgId, id: { in: parsed.data.entityIds } },
      select: { id: true },
    })).map((row) => row.id);
  } else if (parsed.data.entityType === TeamEntityType.TRUCK) {
    validEntityIds = (await prisma.truck.findMany({
      where: { orgId: req.user!.orgId, id: { in: parsed.data.entityIds } },
      select: { id: true },
    })).map((row) => row.id);
  } else if (parsed.data.entityType === TeamEntityType.TRAILER) {
    validEntityIds = (await prisma.trailer.findMany({
      where: { orgId: req.user!.orgId, id: { in: parsed.data.entityIds } },
      select: { id: true },
    })).map((row) => row.id);
  } else if (parsed.data.entityType === TeamEntityType.DRIVER) {
    validEntityIds = (await prisma.driver.findMany({
      where: { orgId: req.user!.orgId, id: { in: parsed.data.entityIds } },
      select: { id: true },
    })).map((row) => row.id);
  }

  if (validEntityIds.length === 0) {
    res.status(400).json({ error: "No valid entities provided" });
    return;
  }

  await prisma.teamAssignment.deleteMany({
    where: {
      orgId: req.user!.orgId,
      entityType: parsed.data.entityType,
      entityId: { in: validEntityIds },
    },
  });
  await prisma.teamAssignment.createMany({
    data: validEntityIds.map((entityId) => ({
      orgId: req.user!.orgId,
      teamId: parsed.data.teamId,
      entityType: parsed.data.entityType,
      entityId,
    })),
    skipDuplicates: true,
  });

  res.json({ ok: true, count: validEntityIds.length });
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
  });
  res.json({ settings, state });
});

app.post("/onboarding/tracking", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    trackingPreference: z.enum(["MANUAL", "SAMSARA", "MOTIVE", "OTHER"]),
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
  });
  res.json({ settings, state });
});

app.post("/onboarding/finance", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    settlementSchedule: z.enum(["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY"]).optional(),
    settlementTemplate: z
      .object({
        includeLinehaul: z.boolean().optional(),
        includeFuelSurcharge: z.boolean().optional(),
        includeAccessorials: z.boolean().optional(),
      })
      .optional(),
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
      settlementSchedule: parsed.data.settlementSchedule as any,
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

app.get("/admin/users", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users });
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
    data: { isActive: false },
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
    data: { isActive: true },
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
    if (!req.user || !["ADMIN", "DISPATCHER"].includes(req.user.role)) {
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
      if (!["ADMIN", "DISPATCHER", "BILLING"].includes(role)) {
        errors.push("Role must be ADMIN, DISPATCHER, or BILLING");
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
    if (!req.user || !["ADMIN", "DISPATCHER"].includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const orgId = req.user.orgId;
    const { columns, rows } = parseTmsCsvText(parsed.data.csvText);
    const { missing } = validateTmsHeaders(columns);
    if (missing.length > 0) {
      res.status(400).json({ error: `Missing required headers: ${missing.join(", ")}` });
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
      if (!["ADMIN", "DISPATCHER", "BILLING"].includes(role)) {
        rowErrors.push("Role must be ADMIN, DISPATCHER, or BILLING");
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
  const inviteBase = process.env.WEB_ORIGIN || "http://localhost:3000";
  const invites = [];
  for (const user of users) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.userInvite.create({
      data: { orgId: req.user!.orgId, userId: user.id, tokenHash, expiresAt },
    });
    invites.push({
      userId: user.id,
      email: user.email,
      inviteUrl: `${inviteBase}/invite/${token}`,
    });
  }
  res.json({ invites });
});

app.get("/invite/:token", async (req, res) => {
  const tokenHash = hashInviteToken(req.params.token);
  const invite = await prisma.userInvite.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() }, usedAt: null },
    include: { user: true, org: true },
  });
  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  res.json({
    invite: {
      id: invite.id,
      expiresAt: invite.expiresAt,
      user: { id: invite.user.id, email: invite.user.email, name: invite.user.name },
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
    where: { tokenHash, expiresAt: { gt: new Date() }, usedAt: null },
  });
  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: invite.userId },
    data: { passwordHash, isActive: true, name: parsed.data.name ?? undefined },
  });
  await prisma.userInvite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });
  res.json({ ok: true });
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
    email: z.string().email(),
    name: z.string().min(2),
    phone: z.string().optional(),
    license: z.string().optional(),
    licenseState: z.string().optional(),
    licenseExpiresAt: z.string().optional(),
    medCardExpiresAt: z.string().optional(),
    payRatePerMile: z.union([z.number(), z.string()]).optional(),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const { user, driver } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        orgId: req.user!.orgId,
        email: parsed.data.email,
        name: parsed.data.name,
        role: "DRIVER",
        passwordHash,
      },
    });
    const driver = await tx.driver.create({
      data: {
        orgId: req.user!.orgId,
        userId: user.id,
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
    role: z.enum(["ADMIN", "DISPATCHER", "BILLING", "DRIVER"]),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      orgId: req.user!.orgId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash,
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "USER_CREATED",
    entity: "User",
    entityId: user.id,
    summary: `Created user ${user.email}`,
  });
  res.json({ user });
});

const port = Number(process.env.API_PORT || 4000);
const host = process.env.API_HOST || "0.0.0.0";
ensureUploadDirs().then(() => {
  app.listen(port, host, () => {
    console.log(`API listening on ${host}:${port}`);
  });
});

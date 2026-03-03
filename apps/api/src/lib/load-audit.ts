import { Prisma } from "@truckerio/db";
import { logAudit } from "./audit";

const LOAD_IMPACT_FIELDS = [
  "rate",
  "miles",
  "paidMiles",
  "movementMode",
  "customerId",
  "customerName",
  "customerRef",
  "bolNumber",
  "shipperReferenceNumber",
  "consigneeReferenceNumber",
  "palletCount",
  "weightLbs",
] as const;

const STOP_TIME_FIELDS = ["appointmentStart", "appointmentEnd", "arrivedAt", "departedAt"] as const;

type LoadRecord = {
  id: string;
  loadNumber: string;
  rate?: Prisma.Decimal | null;
  miles?: number | null;
  paidMiles?: number | null;
  movementMode?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerRef?: string | null;
  bolNumber?: string | null;
  shipperReferenceNumber?: string | null;
  consigneeReferenceNumber?: string | null;
  palletCount?: number | null;
  weightLbs?: number | null;
};

type StopRecord = {
  id: string;
  loadId: string;
  name?: string | null;
  type?: string | null;
  appointmentStart?: Date | string | null;
  appointmentEnd?: Date | string | null;
  arrivedAt?: Date | string | null;
  departedAt?: Date | string | null;
};

export type AuditFieldChange = {
  field: string;
  from: Prisma.InputJsonValue | null;
  to: Prisma.InputJsonValue | null;
};

function normalizeValue(value: unknown): Prisma.InputJsonValue | null {
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry)) as Prisma.InputJsonValue;
  }
  if (value && typeof value === "object") {
    const normalized: Record<string, Prisma.InputJsonValue | null> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      normalized[key] = normalizeValue((value as Record<string, unknown>)[key]);
    }
    return normalized as Prisma.InputJsonValue;
  }
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime()) && value.includes("T")) {
      return parsed.toISOString();
    }
  }
  if (value === undefined) return null;
  return value ?? null;
}

function jsonEqual(left: Prisma.InputJsonValue | null, right: Prisma.InputJsonValue | null) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildFieldDiff(params: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  fields: readonly string[];
}) {
  const beforeDiff: Record<string, Prisma.InputJsonValue | null> = {};
  const afterDiff: Record<string, Prisma.InputJsonValue | null> = {};
  const changedFields: string[] = [];
  const changes: AuditFieldChange[] = [];
  for (const field of params.fields) {
    const beforeVal = normalizeValue(params.before[field]);
    const afterVal = normalizeValue(params.after[field]);
    if (!jsonEqual(beforeVal, afterVal)) {
      beforeDiff[field] = beforeVal;
      afterDiff[field] = afterVal;
      changedFields.push(field);
      changes.push({ field, from: beforeVal, to: afterVal });
    }
  }
  return { beforeDiff, afterDiff, changedFields, changes };
}

export async function logLoadFieldAudit(params: {
  orgId: string;
  userId: string;
  before: LoadRecord;
  after: LoadRecord;
  reasonCode: string;
  reasonNote?: string | null;
  actorRole?: string | null;
  route?: string | null;
}) {
  const diff = buildFieldDiff({
    before: params.before as unknown as Record<string, unknown>,
    after: params.after as unknown as Record<string, unknown>,
    fields: LOAD_IMPACT_FIELDS,
  });
  if (diff.changedFields.length === 0) return diff;
  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "LOAD_FIELDS_UPDATED",
    entity: "Load",
    entityId: params.after.id,
    summary: `Updated load ${params.after.loadNumber} fields: ${diff.changedFields.join(", ")}`,
    before: diff.beforeDiff as unknown as Prisma.InputJsonValue,
    after: diff.afterDiff as unknown as Prisma.InputJsonValue,
    meta: {
      reasonCode: params.reasonCode,
      reasonNote: params.reasonNote ?? null,
      actorRole: params.actorRole ?? null,
      route: params.route ?? null,
      changedFields: diff.changedFields,
      changes: diff.changes,
    },
  });
  return diff;
}

export async function logStopTimeAudit(params: {
  orgId: string;
  userId: string;
  before: StopRecord;
  after: StopRecord;
}) {
  const diff = buildFieldDiff({
    before: params.before as unknown as Record<string, unknown>,
    after: params.after as unknown as Record<string, unknown>,
    fields: STOP_TIME_FIELDS,
  });
  if (diff.changedFields.length === 0) return;
  const stopLabel = params.after.name ? ` (${params.after.name})` : "";
  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "STOP_TIMES_UPDATED",
    entity: "Stop",
    entityId: params.after.id,
    summary: `Updated stop times${stopLabel}: ${diff.changedFields.join(", ")}`,
    before: diff.beforeDiff as unknown as Prisma.InputJsonValue,
    after: diff.afterDiff as unknown as Prisma.InputJsonValue,
    meta: {
      changedFields: diff.changedFields,
      changes: diff.changes,
    },
  });
}

import { Prisma } from "@truckerio/db";
import { logAudit } from "./audit";

const LOAD_IMPACT_FIELDS = [
  "rate",
  "miles",
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

function normalizeValue(value: unknown) {
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime()) && value.includes("T")) {
      return parsed.toISOString();
    }
  }
  if (value === undefined) return null;
  return value ?? null;
}

export async function logLoadFieldAudit(params: {
  orgId: string;
  userId: string;
  before: LoadRecord;
  after: LoadRecord;
}) {
  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};
  const changedFields: string[] = [];
  for (const field of LOAD_IMPACT_FIELDS) {
    const beforeVal = normalizeValue((params.before as any)[field]);
    const afterVal = normalizeValue((params.after as any)[field]);
    if (beforeVal !== afterVal) {
      beforeDiff[field] = beforeVal;
      afterDiff[field] = afterVal;
      changedFields.push(field);
    }
  }
  if (changedFields.length === 0) return;
  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "LOAD_FIELDS_UPDATED",
    entity: "Load",
    entityId: params.after.id,
    summary: `Updated load ${params.after.loadNumber} fields: ${changedFields.join(", ")}`,
    before: beforeDiff,
    after: afterDiff,
  });
}

export async function logStopTimeAudit(params: {
  orgId: string;
  userId: string;
  before: StopRecord;
  after: StopRecord;
}) {
  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};
  const changedFields: string[] = [];
  for (const field of STOP_TIME_FIELDS) {
    const beforeVal = normalizeValue((params.before as any)[field]);
    const afterVal = normalizeValue((params.after as any)[field]);
    if (beforeVal !== afterVal) {
      beforeDiff[field] = beforeVal;
      afterDiff[field] = afterVal;
      changedFields.push(field);
    }
  }
  if (changedFields.length === 0) return;
  const stopLabel = params.after.name ? ` (${params.after.name})` : "";
  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "STOP_TIMES_UPDATED",
    entity: "Stop",
    entityId: params.after.id,
    summary: `Updated stop times${stopLabel}: ${changedFields.join(", ")}`,
    before: beforeDiff,
    after: afterDiff,
  });
}

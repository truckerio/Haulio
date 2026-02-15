import crypto from "crypto";
import { PayableRunStatus } from "@truckerio/db";

export type PayableFingerprintableLine = {
  partyType: string;
  partyId: string;
  loadId?: string | null;
  type: string;
  amountCents: number;
  memo?: string | null;
};

export function payableLineFingerprint(item: PayableFingerprintableLine) {
  return [item.partyType, item.partyId, item.loadId ?? "", item.type, String(item.amountCents), item.memo ?? ""].join("||");
}

export function buildPayableChecksum<T extends PayableFingerprintableLine & { source?: unknown }>(lines: T[]) {
  const canonical = lines
    .map((line) => ({
      partyType: line.partyType,
      partyId: line.partyId,
      loadId: line.loadId ?? null,
      type: line.type,
      amountCents: line.amountCents,
      memo: line.memo ?? null,
      source: line.source ?? null,
    }))
    .sort((a, b) => payableLineFingerprint(a).localeCompare(payableLineFingerprint(b)));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function diffPayableLineFingerprints(previous: string[], next: string[]) {
  const prevCounts = new Map<string, number>();
  const nextCounts = new Map<string, number>();
  for (const key of previous) prevCounts.set(key, (prevCounts.get(key) ?? 0) + 1);
  for (const key of next) nextCounts.set(key, (nextCounts.get(key) ?? 0) + 1);
  let added = 0;
  let removed = 0;
  const keys = new Set([...prevCounts.keys(), ...nextCounts.keys()]);
  for (const key of keys) {
    const prev = prevCounts.get(key) ?? 0;
    const nxt = nextCounts.get(key) ?? 0;
    if (nxt > prev) added += nxt - prev;
    if (prev > nxt) removed += prev - nxt;
  }
  return { added, removed };
}

export function isFinalizeIdempotent(status: PayableRunStatus) {
  return status === PayableRunStatus.RUN_FINALIZED || status === PayableRunStatus.PAID;
}

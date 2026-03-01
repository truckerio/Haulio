import crypto from "crypto";

export type FinanceBankingAdapter = "mock";

export type PayoutEntityType = "PAYABLE_RUN" | "SETTLEMENT";

export type PayoutRequest = {
  orgId: string;
  entityType: PayoutEntityType;
  entityId: string;
  amountCents?: number | null;
  idempotencyKey: string;
};

export type PayoutResult = {
  adapter: FinanceBankingAdapter;
  payoutId: string;
  reference: string;
  processedAt: string;
  idempotencyKey: string;
};

function resolveAdapter(): FinanceBankingAdapter {
  const raw = String(process.env.FINANCE_BANKING_ADAPTER ?? "mock").trim().toLowerCase();
  if (!raw || raw === "mock") return "mock";
  throw new Error(`Unsupported FINANCE_BANKING_ADAPTER: ${raw}`);
}

function shortHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalizeAmountCents(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function createPayoutReceipt(input: PayoutRequest): PayoutResult {
  const adapter = resolveAdapter();
  const canonical = [
    input.orgId,
    input.entityType,
    input.entityId,
    String(normalizeAmountCents(input.amountCents)),
    input.idempotencyKey,
  ].join(":");
  const digest = shortHash(canonical);
  const payoutId = `payout_${digest}`;
  return {
    adapter,
    payoutId,
    reference: `MOCK-${input.entityType}-${digest.toUpperCase()}`,
    processedAt: new Date().toISOString(),
    idempotencyKey: input.idempotencyKey,
  };
}


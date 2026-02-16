import {
  FinanceOutboxEventStatus,
  FinanceOutboxEventType,
  Prisma,
  prisma,
} from "@truckerio/db";

type FinanceDbClient = Pick<
  Prisma.TransactionClient,
  "financeOutboxEvent"
> &
  Pick<typeof prisma, "financeOutboxEvent">;

type EnqueueFinanceOutboxInput = {
  orgId: string;
  loadId?: string | null;
  type: FinanceOutboxEventType;
  payload: Prisma.InputJsonValue;
  dedupeKey: string;
};

export function buildFinanceOutboxDedupeKey(parts: Array<string | number | null | undefined>) {
  return parts
    .filter((part) => part !== null && part !== undefined && `${part}`.length > 0)
    .map((part) => String(part).trim())
    .join(":");
}

export async function enqueueFinanceOutboxEvent(db: FinanceDbClient, input: EnqueueFinanceOutboxInput) {
  return db.financeOutboxEvent.upsert({
    where: {
      orgId_dedupeKey: {
        orgId: input.orgId,
        dedupeKey: input.dedupeKey,
      },
    },
    create: {
      orgId: input.orgId,
      loadId: input.loadId ?? null,
      type: input.type,
      payload: input.payload,
      dedupeKey: input.dedupeKey,
      status: FinanceOutboxEventStatus.PENDING,
      nextAttemptAt: new Date(),
      attemptCount: 0,
    },
    update: {
      payload: input.payload,
      loadId: input.loadId ?? null,
      status: FinanceOutboxEventStatus.PENDING,
      nextAttemptAt: new Date(),
      lastError: null,
    },
  });
}

export async function enqueueDispatchLoadUpdatedEvent(
  db: FinanceDbClient,
  params: {
    orgId: string;
    loadId: string;
    source: string;
    trigger: string;
    dedupeSuffix?: string | null;
  }
) {
  return enqueueFinanceOutboxEvent(db, {
    orgId: params.orgId,
    loadId: params.loadId,
    type: FinanceOutboxEventType.DISPATCH_LOAD_UPDATED,
    payload: {
      loadId: params.loadId,
      source: params.source,
      trigger: params.trigger,
      dedupeSuffix: params.dedupeSuffix ?? null,
    },
    dedupeKey: buildFinanceOutboxDedupeKey([
      FinanceOutboxEventType.DISPATCH_LOAD_UPDATED,
      params.loadId,
      params.trigger,
      params.dedupeSuffix ?? "latest",
    ]),
  });
}

export async function enqueueFinanceStatusUpdatedEvent(
  db: FinanceDbClient,
  params: {
    orgId: string;
    loadId: string;
    stage: string | null;
    billingStatus: string | null;
    dedupeSuffix?: string | null;
  }
) {
  return enqueueFinanceOutboxEvent(db, {
    orgId: params.orgId,
    loadId: params.loadId,
    type: FinanceOutboxEventType.FINANCE_STATUS_UPDATED,
    payload: {
      loadId: params.loadId,
      stage: params.stage,
      billingStatus: params.billingStatus,
    },
    dedupeKey: buildFinanceOutboxDedupeKey([
      FinanceOutboxEventType.FINANCE_STATUS_UPDATED,
      params.loadId,
      params.stage ?? "none",
      params.billingStatus ?? "none",
      params.dedupeSuffix ?? "latest",
    ]),
  });
}

export async function enqueueQboSyncRequestedEvent(
  db: FinanceDbClient,
  params: {
    orgId: string;
    loadId: string;
    invoiceId: string;
    reason: string;
    dedupeSuffix?: string | null;
  }
) {
  return enqueueFinanceOutboxEvent(db, {
    orgId: params.orgId,
    loadId: params.loadId,
    type: FinanceOutboxEventType.QBO_SYNC_REQUESTED,
    payload: {
      loadId: params.loadId,
      invoiceId: params.invoiceId,
      reason: params.reason,
    },
    dedupeKey: buildFinanceOutboxDedupeKey([
      FinanceOutboxEventType.QBO_SYNC_REQUESTED,
      params.invoiceId,
      params.reason,
      params.dedupeSuffix ?? "latest",
    ]),
  });
}

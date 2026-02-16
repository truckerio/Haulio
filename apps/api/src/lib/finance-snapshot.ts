import {
  BillingSubmissionChannel,
  Prisma,
  QboEntityType,
  prisma,
} from "@truckerio/db";
import {
  FINANCE_POLICY_SELECT,
  mapLoadToFinanceReceivableRow,
} from "./finance-receivables";
import { normalizeFinancePolicy } from "./finance-policy";

const SNAPSHOT_LOAD_INCLUDE = {
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

type SnapshotLoad = Prisma.LoadGetPayload<{ include: typeof SNAPSHOT_LOAD_INCLUDE }>;

export async function computeFinanceSnapshotForLoad(params: {
  orgId: string;
  loadId: string;
  quickbooksConnected: boolean;
  now?: Date;
}) {
  const [load, settings] = await Promise.all([
    prisma.load.findFirst({
      where: { id: params.loadId, orgId: params.orgId, deletedAt: null },
      include: SNAPSHOT_LOAD_INCLUDE,
    }),
    prisma.orgSettings.findFirst({
      where: { orgId: params.orgId },
      select: FINANCE_POLICY_SELECT,
    }),
  ]);
  if (!load) {
    return null;
  }
  const policy = normalizeFinancePolicy(settings);
  const latestInvoice = load.invoices[0] ?? null;
  const latestQboJob =
    latestInvoice &&
    (await prisma.qboSyncJob.findFirst({
      where: {
        orgId: params.orgId,
        entityType: QboEntityType.INVOICE,
        entityId: latestInvoice.id,
      },
      select: {
        status: true,
        qboId: true,
        lastErrorMessage: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    }));

  return mapLoadToFinanceReceivableRow({
    load: load as SnapshotLoad,
    policy,
    now: params.now ?? new Date(),
    quickbooksConnected: params.quickbooksConnected,
    latestQboJob: latestQboJob ?? null,
  });
}

export async function persistFinanceSnapshotForLoad(params: {
  orgId: string;
  loadId: string;
  quickbooksConnected: boolean;
  now?: Date;
}) {
  const row = await computeFinanceSnapshotForLoad(params);
  if (!row) return null;
  const topBlocker = row.readinessSnapshot.blockers[0] ?? null;
  await prisma.load.updateMany({
    where: { id: params.loadId, orgId: params.orgId },
    data: {
      financeStage: row.billingStage,
      financeTopBlockerCode: topBlocker?.code ?? null,
      financeTopBlockerMessage: topBlocker?.message ?? null,
      financeNextBestAction: row.nextBestAction,
      financeNextBestActionReasonCodes: row.nextBestActionReasonCodes,
      financePriorityScore: row.priorityScore,
      financeBlockerOwner: row.blockerOwner,
      financeSnapshotUpdatedAt: params.now ?? new Date(),
    },
  });
  return row;
}

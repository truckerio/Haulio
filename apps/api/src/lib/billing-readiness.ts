import {
  prisma,
  AccessorialStatus,
  BillingStatus,
  DocStatus,
  DocType,
  InvoiceStatus,
  LoadStatus,
  StopStatus,
  StopType,
} from "@truckerio/db";

export type BillingReadinessResult = {
  billingStatus: BillingStatus;
  blockingReasons: string[];
};

type BillingReadinessSnapshot = {
  load: {
    status: LoadStatus;
    deliveredAt?: Date | null;
    billingStatus?: BillingStatus | null;
    invoicedAt?: Date | null;
  };
  stops?: { type: StopType; status: StopStatus; sequence: number; departedAt?: Date | null }[];
  docs?: { type: DocType; status: DocStatus }[];
  accessorials?: { status: AccessorialStatus; requiresProof: boolean; proofDocumentId?: string | null }[];
  invoices?: { status: InvoiceStatus }[];
};

const RATECON_DOC_TYPES = new Set<DocType>([DocType.RATECON, DocType.RATE_CONFIRMATION]);
const DELIVERED_STATUSES = new Set<LoadStatus>([
  LoadStatus.DELIVERED,
  LoadStatus.POD_RECEIVED,
  LoadStatus.READY_TO_INVOICE,
  LoadStatus.INVOICED,
  LoadStatus.PAID,
]);
const ACCESSORIAL_PENDING = new Set<AccessorialStatus>([
  AccessorialStatus.PROPOSED,
  AccessorialStatus.NEEDS_PROOF,
  AccessorialStatus.PENDING_APPROVAL,
]);

const BLOCKING_REASONS = {
  delivery: "Delivery incomplete",
  pod: "Missing POD",
  rateCon: "Missing Rate Confirmation",
  accessorialPending: "Accessorial pending resolution",
  accessorialProof: "Accessorial missing proof",
  dispute: "Billing dispute open",
} as const;

const hasDoc = (docs: { type: DocType; status: DocStatus }[], types: Set<DocType>) =>
  docs.some((doc) => types.has(doc.type) && doc.status !== DocStatus.REJECTED);

const isDeliveryComplete = (load: BillingReadinessSnapshot["load"], stops: BillingReadinessSnapshot["stops"]) => {
  if (load.deliveredAt) return true;
  if (DELIVERED_STATUSES.has(load.status)) return true;
  if (!stops || stops.length === 0) return false;
  const deliveries = stops.filter((stop) => stop.type === StopType.DELIVERY);
  if (deliveries.length === 0) return false;
  const finalStop = deliveries.reduce((latest, stop) => (stop.sequence > latest.sequence ? stop : latest), deliveries[0]!);
  return finalStop.status === StopStatus.DEPARTED || Boolean(finalStop.departedAt);
};

const isInvoiced = (load: BillingReadinessSnapshot["load"]) =>
  load.billingStatus === BillingStatus.INVOICED ||
  Boolean(load.invoicedAt) ||
  load.status === LoadStatus.INVOICED ||
  load.status === LoadStatus.PAID;

export function evaluateBillingReadinessSnapshot(snapshot: BillingReadinessSnapshot): BillingReadinessResult {
  if (isInvoiced(snapshot.load)) {
    return { billingStatus: BillingStatus.INVOICED, blockingReasons: [] };
  }

  const docs = snapshot.docs ?? [];
  const accessorials = snapshot.accessorials ?? [];
  const invoices = snapshot.invoices ?? [];
  const blockers = new Set<string>();

  if (!isDeliveryComplete(snapshot.load, snapshot.stops)) {
    blockers.add(BLOCKING_REASONS.delivery);
  }
  if (!hasDoc(docs, new Set([DocType.POD]))) {
    blockers.add(BLOCKING_REASONS.pod);
  }
  if (!hasDoc(docs, RATECON_DOC_TYPES)) {
    blockers.add(BLOCKING_REASONS.rateCon);
  }

  const hasPendingAccessorial = accessorials.some((item) => ACCESSORIAL_PENDING.has(item.status));
  if (hasPendingAccessorial) {
    blockers.add(BLOCKING_REASONS.accessorialPending);
  }
  const missingProof = accessorials.some(
    (item) => item.requiresProof && !item.proofDocumentId && item.status !== AccessorialStatus.REJECTED
  );
  if (missingProof) {
    blockers.add(BLOCKING_REASONS.accessorialProof);
  }

  if (invoices.some((invoice) => invoice.status === InvoiceStatus.DISPUTED)) {
    blockers.add(BLOCKING_REASONS.dispute);
  }

  const blockingReasons = Array.from(blockers);
  return {
    billingStatus: blockingReasons.length > 0 ? BillingStatus.BLOCKED : BillingStatus.READY,
    blockingReasons,
  };
}

export async function evaluateBillingReadiness(loadId: string) {
  const load = await prisma.load.findFirst({
    where: { id: loadId },
    include: {
      stops: true,
      docs: true,
      accessorials: true,
      invoices: { select: { status: true } },
    },
  });
  if (!load) return null;
  const result = evaluateBillingReadinessSnapshot({
    load,
    stops: load.stops,
    docs: load.docs,
    accessorials: load.accessorials,
    invoices: load.invoices,
  });
  const reasonsChanged =
    load.billingBlockingReasons.join("||") !== result.blockingReasons.join("||") ||
    load.billingStatus !== result.billingStatus;
  if (reasonsChanged) {
    await prisma.load.update({
      where: { id: load.id },
      data: {
        billingStatus: result.billingStatus,
        billingBlockingReasons: result.blockingReasons,
      },
    });
    console.info("Billing readiness updated", {
      loadId: load.id,
      billingStatus: result.billingStatus,
      blockingReasons: result.blockingReasons,
    });
  }
  return result;
}


import crypto from "crypto";
import {
  Prisma,
  QboEntityType,
  QboSyncJobStatus,
  prisma,
} from "@truckerio/db";
import { createInvoiceForLoad } from "../integrations/quickbooks";

type QboDbClient = Pick<
  Prisma.TransactionClient,
  "invoice" | "load" | "qboSyncJob"
> &
  Pick<typeof prisma, "invoice" | "load" | "qboSyncJob">;

function buildInvoiceQboIdempotencyKey(invoice: {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: Prisma.Decimal | number | string | null;
  sentAt: Date | null;
  generatedAt: Date;
}) {
  const payload = [
    invoice.id,
    invoice.invoiceNumber,
    invoice.status,
    `${invoice.totalAmount}`,
    invoice.sentAt?.toISOString() ?? "",
    invoice.generatedAt.toISOString(),
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function nextBackoffMinutes(attemptCount: number) {
  const exp = Math.min(6, Math.max(1, attemptCount));
  return Math.min(60, 2 ** exp);
}

export function isQuickbooksConnectedFromEnv() {
  const enabledFlag = String(process.env.QUICKBOOKS_ENABLED || "").toLowerCase() === "true";
  const hasToken = Boolean(process.env.QUICKBOOKS_ACCESS_TOKEN);
  // Company ID can be configured per-org in OrgSettings.quickbooksCompanyId.
  return Boolean(enabledFlag && hasToken);
}

export async function getQuickbooksStatusForOrg(orgId: string) {
  const enabledFlag = String(process.env.QUICKBOOKS_ENABLED || "").toLowerCase() === "true";
  const hasToken = Boolean(process.env.QUICKBOOKS_ACCESS_TOKEN);
  let settings: { id: string; quickbooksCompanyId: string | null } | null = null;
  try {
    settings = await prisma.orgSettings.findFirst({
      where: { orgId },
      select: { id: true, quickbooksCompanyId: true },
    });
  } catch (error) {
    // Backward-compatible fallback when API code is newer than DB schema (missing column).
    // Prisma known request error shape is intentionally duck-typed to avoid tight coupling.
    const code = (error as { code?: string } | null)?.code;
    if (code !== "P2022") {
      throw error;
    }
    settings = null;
  }
  const companyId = settings?.quickbooksCompanyId ?? process.env.QUICKBOOKS_COMPANY_ID ?? null;
  return {
    settingsId: settings?.id ?? null,
    enabled: Boolean(enabledFlag && companyId && hasToken),
    companyId,
    enabledFlag,
    hasToken,
  };
}

export async function enqueueQboInvoiceSyncJob(
  db: QboDbClient,
  params: {
    orgId: string;
    invoiceId: string;
    reason: string;
  }
) {
  const invoice = await db.invoice.findFirst({
    where: { id: params.invoiceId, orgId: params.orgId },
    select: {
      id: true,
      orgId: true,
      loadId: true,
      invoiceNumber: true,
      status: true,
      totalAmount: true,
      sentAt: true,
      generatedAt: true,
    },
  });
  if (!invoice) {
    throw new Error("Invoice not found");
  }
  const idempotencyKey = buildInvoiceQboIdempotencyKey(invoice);
  const requestId = `qbo-${invoice.id.slice(0, 8)}-${crypto.randomUUID().slice(0, 12)}`;

  const job = await db.qboSyncJob.upsert({
    where: {
      orgId_idempotencyKey: {
        orgId: params.orgId,
        idempotencyKey,
      },
    },
    create: {
      orgId: params.orgId,
      entityType: QboEntityType.INVOICE,
      entityId: invoice.id,
      status: QboSyncJobStatus.QUEUED,
      idempotencyKey,
      requestId,
      nextAttemptAt: new Date(),
    },
    update: {
      status: QboSyncJobStatus.QUEUED,
      nextAttemptAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });

  await db.load.updateMany({
    where: { id: invoice.loadId, orgId: params.orgId },
    data: {
      qboSyncStatus: QboSyncJobStatus.QUEUED,
      qboSyncLastError: null,
    },
  });

  return job;
}

export async function retryQboSyncJob(params: { orgId: string; jobId: string }) {
  const existing = await prisma.qboSyncJob.findFirst({
    where: { id: params.jobId, orgId: params.orgId },
  });
  if (!existing) {
    throw new Error("QBO sync job not found");
  }
  const updated = await prisma.qboSyncJob.update({
    where: { id: existing.id },
    data: {
      status: QboSyncJobStatus.QUEUED,
      nextAttemptAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  return updated;
}

export async function processQueuedQboSyncJobs(params?: { limit?: number }) {
  const now = new Date();
  const limit = Math.max(1, Math.min(50, params?.limit ?? 10));
  const jobs = await prisma.qboSyncJob.findMany({
    where: {
      status: { in: [QboSyncJobStatus.QUEUED, QboSyncJobStatus.FAILED] },
      nextAttemptAt: { lte: now },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const claim = await prisma.qboSyncJob.updateMany({
      where: {
        id: job.id,
        status: { in: [QboSyncJobStatus.QUEUED, QboSyncJobStatus.FAILED] },
      },
      data: {
        status: QboSyncJobStatus.SYNCING,
        attemptCount: { increment: 1 },
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (claim.count === 0) {
      continue;
    }

    const correlationId = `qbo-job-${job.id}`;
    console.info("qbo.sync.start", {
      correlationId,
      jobId: job.id,
      orgId: job.orgId,
      entityId: job.entityId,
      requestId: job.requestId,
    });

    try {
      if (job.entityType !== QboEntityType.INVOICE) {
        throw new Error(`Unsupported QBO entity type: ${job.entityType}`);
      }

      const invoice = await prisma.invoice.findFirst({
        where: { id: job.entityId, orgId: job.orgId },
        select: { id: true, loadId: true },
      });
      if (!invoice) {
        throw new Error("Invoice not found");
      }

      const orgQbo = await getQuickbooksStatusForOrg(job.orgId);
      const result = await createInvoiceForLoad(invoice.loadId, { companyId: orgQbo.companyId });
      await prisma.$transaction(async (tx) => {
        await tx.qboSyncJob.update({
          where: { id: job.id },
          data: {
            status: QboSyncJobStatus.SYNCED,
            qboId: result.externalInvoiceRef,
            lastErrorCode: null,
            lastErrorMessage: null,
            nextAttemptAt: now,
          },
        });
        await tx.load.updateMany({
          where: { id: invoice.loadId, orgId: job.orgId },
          data: {
            externalInvoiceRef: result.externalInvoiceRef,
            qboSyncStatus: QboSyncJobStatus.SYNCED,
            qboSyncLastError: null,
          },
        });
      });
      processed += 1;
      console.info("qbo.sync.success", {
        correlationId,
        jobId: job.id,
        orgId: job.orgId,
        entityId: job.entityId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latest = await prisma.qboSyncJob.findFirst({
        where: { id: job.id },
        select: { attemptCount: true },
      });
      const attempts = latest?.attemptCount ?? job.attemptCount + 1;
      const retryAt = new Date(Date.now() + nextBackoffMinutes(attempts) * 60 * 1000);

      await prisma.qboSyncJob.update({
        where: { id: job.id },
        data: {
          status: QboSyncJobStatus.FAILED,
          lastErrorCode: "SYNC_FAILED",
          lastErrorMessage: message,
          nextAttemptAt: retryAt,
        },
      });
      const invoice = await prisma.invoice.findFirst({
        where: { id: job.entityId, orgId: job.orgId },
        select: { loadId: true },
      });
      if (invoice) {
        await prisma.load.updateMany({
          where: { id: invoice.loadId, orgId: job.orgId },
          data: {
            qboSyncStatus: QboSyncJobStatus.FAILED,
            qboSyncLastError: message,
          },
        });
      }
      failed += 1;
      console.error("qbo.sync.failed", {
        correlationId,
        jobId: job.id,
        orgId: job.orgId,
        entityId: job.entityId,
        error: message,
      });
    }
  }

  return {
    scanned: jobs.length,
    processed,
    failed,
  };
}

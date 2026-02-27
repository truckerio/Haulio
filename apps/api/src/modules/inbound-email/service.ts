import { InboundEmailStatus, Prisma } from "@truckerio/db";
import { createLoadConfirmationDocumentFromBuffer } from "../load-confirmations/ingest";
import { saveInboundEmailAttachmentBuffer } from "../../lib/uploads";
import { prisma } from "@truckerio/db";
import type {
  InboundRateconEmail,
  InboundRateconProcessingResult,
} from "./types";
import { INBOUND_STATUS_TO_RESPONSE } from "./types";

type InboundAlias = {
  id: string;
  orgId: string;
  address: string;
};

type ExistingInboundAttachment = {
  id: string;
  storageKey: string;
  loadConfirmationDocumentId: string | null;
};

type CreatedInboundEmail = {
  id: string;
  status: InboundEmailStatus;
  wasExisting?: boolean;
};

export type InboundRateconIngestDeps = {
  now: () => Date;
  dedupeWindowDays: number;
  resolveAliasByRecipients: (recipients: string[]) => Promise<InboundAlias | null>;
  isInboundEnabledForOrg: (orgId: string) => Promise<boolean>;
  findByMessageId: (params: { orgId: string; provider: InboundRateconEmail["provider"]; messageId: string }) => Promise<CreatedInboundEmail | null>;
  createInboundEmail: (params: {
    orgId: string | null;
    aliasId: string | null;
    provider: InboundRateconEmail["provider"];
    status: InboundEmailStatus;
    fromAddress: string;
    toAddresses: string[];
    subject: string | null;
    messageId: string | null;
    messageDate: Date | null;
    textBody: string | null;
    htmlBody: string | null;
    rawHeaders: Record<string, string>;
  }) => Promise<CreatedInboundEmail>;
  updateInboundEmailCounters: (params: {
    inboundEmailId: string;
    dedupedAttachmentCount: number;
    createdLoadConfirmationCount: number;
  }) => Promise<void>;
  findRecentAttachmentBySha: (params: {
    orgId: string;
    sha256: string;
    since: Date;
  }) => Promise<ExistingInboundAttachment | null>;
  createInboundAttachment: (params: {
    inboundEmailId: string;
    orgId: string | null;
    filename: string;
    contentType: string;
    byteSize: number;
    sha256: string;
    storageKey: string;
    deduped: boolean;
    dedupedFromAttachmentId: string | null;
    loadConfirmationDocumentId: string | null;
  }) => Promise<void>;
  storeAttachment: (params: {
    inboundEmailId: string;
    orgId: string | null;
    filename: string;
    buffer: Buffer;
  }) => Promise<{ filename: string; storageKey: string }>;
  createLoadConfirmationFromAttachment: (params: {
    orgId: string;
    filename: string;
    contentType: string;
    byteSize: number;
    buffer: Buffer;
    sha256: string;
  }) => Promise<{ id: string; storageKey: string; deduped: boolean }>;
  listCreatedLoadConfirmationIds: (inboundEmailId: string) => Promise<string[]>;
  log: (payload: Record<string, unknown>) => void;
};

export async function ingestInboundRateconEmailWithDeps(
  email: InboundRateconEmail,
  deps: InboundRateconIngestDeps
): Promise<InboundRateconProcessingResult> {
  const recipients = email.to.map((entry) => entry.toLowerCase().trim()).filter(Boolean);
  const alias = await deps.resolveAliasByRecipients(recipients);

  if (!alias) {
    const unroutedEmail = await deps.createInboundEmail({
      orgId: null,
      aliasId: null,
      provider: email.provider,
      status: InboundEmailStatus.UNROUTED,
      fromAddress: email.from,
      toAddresses: recipients,
      subject: email.subject,
      messageId: email.messageId,
      messageDate: email.date ? new Date(email.date) : null,
      textBody: email.textBody,
      htmlBody: email.htmlBody,
      rawHeaders: email.rawHeaders,
    });

    for (const attachment of email.attachments) {
      const stored = await deps.storeAttachment({
        inboundEmailId: unroutedEmail.id,
        orgId: null,
        filename: attachment.filename,
        buffer: attachment.buffer,
      });
      await deps.createInboundAttachment({
        inboundEmailId: unroutedEmail.id,
        orgId: null,
        filename: stored.filename,
        contentType: attachment.contentType,
        byteSize: attachment.byteSize,
        sha256: attachment.sha256,
        storageKey: stored.storageKey,
        deduped: false,
        dedupedFromAttachmentId: null,
        loadConfirmationDocumentId: null,
      });
    }

    deps.log({
      provider: email.provider,
      status: "unrouted",
      orgId: null,
      messageId: email.messageId,
      recipients,
      attachments: email.attachments.length,
    });

    return {
      status: "unrouted",
      inboundEmailId: unroutedEmail.id,
      createdLoadConfirmationIds: [],
      dedupedAttachmentCount: 0,
    };
  }

  if (email.messageId) {
    const existingByMessage = await deps.findByMessageId({
      orgId: alias.orgId,
      provider: email.provider,
      messageId: email.messageId,
    });
    if (existingByMessage) {
      const existingLoadConfirmationIds = await deps.listCreatedLoadConfirmationIds(existingByMessage.id);
      deps.log({
        provider: email.provider,
        status: "deduped",
        orgId: alias.orgId,
        messageId: email.messageId,
        recipients,
      });
      return {
        status: "deduped",
        inboundEmailId: existingByMessage.id,
        createdLoadConfirmationIds: existingLoadConfirmationIds,
        dedupedAttachmentCount: 0,
      };
    }
  }

  const inboundEnabled = await deps.isInboundEnabledForOrg(alias.orgId);
  const inboundEmail = await deps.createInboundEmail({
    orgId: alias.orgId,
    aliasId: alias.id,
    provider: email.provider,
    status: inboundEnabled ? InboundEmailStatus.ACCEPTED : InboundEmailStatus.ACCEPTED_DISABLED,
    fromAddress: email.from,
    toAddresses: recipients,
    subject: email.subject,
    messageId: email.messageId,
    messageDate: email.date ? new Date(email.date) : null,
    textBody: email.textBody,
    htmlBody: email.htmlBody,
    rawHeaders: email.rawHeaders,
  });

  if (inboundEmail.wasExisting) {
    const existingLoadConfirmationIds = await deps.listCreatedLoadConfirmationIds(inboundEmail.id);
    deps.log({
      provider: email.provider,
      status: "deduped",
      orgId: alias.orgId,
      messageId: email.messageId,
      recipients,
      attachments: email.attachments.length,
    });
    return {
      status: "deduped",
      inboundEmailId: inboundEmail.id,
      createdLoadConfirmationIds: existingLoadConfirmationIds,
      dedupedAttachmentCount: 0,
    };
  }

  const dedupeSince = new Date(deps.now().getTime() - deps.dedupeWindowDays * 24 * 60 * 60 * 1000);

  const createdLoadConfirmationIds: string[] = [];
  let dedupedAttachmentCount = 0;

  for (const attachment of email.attachments) {
    const existingAttachment = await deps.findRecentAttachmentBySha({
      orgId: alias.orgId,
      sha256: attachment.sha256,
      since: dedupeSince,
    });

    if (existingAttachment) {
      dedupedAttachmentCount += 1;
      await deps.createInboundAttachment({
        inboundEmailId: inboundEmail.id,
        orgId: alias.orgId,
        filename: attachment.filename,
        contentType: attachment.contentType,
        byteSize: attachment.byteSize,
        sha256: attachment.sha256,
        storageKey: existingAttachment.storageKey,
        deduped: true,
        dedupedFromAttachmentId: existingAttachment.id,
        loadConfirmationDocumentId: existingAttachment.loadConfirmationDocumentId,
      });
      continue;
    }

    if (!inboundEnabled) {
      const stored = await deps.storeAttachment({
        inboundEmailId: inboundEmail.id,
        orgId: alias.orgId,
        filename: attachment.filename,
        buffer: attachment.buffer,
      });
      await deps.createInboundAttachment({
        inboundEmailId: inboundEmail.id,
        orgId: alias.orgId,
        filename: stored.filename,
        contentType: attachment.contentType,
        byteSize: attachment.byteSize,
        sha256: attachment.sha256,
        storageKey: stored.storageKey,
        deduped: false,
        dedupedFromAttachmentId: null,
        loadConfirmationDocumentId: null,
      });
      continue;
    }

    const loadConfirmation = await deps.createLoadConfirmationFromAttachment({
      orgId: alias.orgId,
      filename: attachment.filename,
      contentType: attachment.contentType,
      byteSize: attachment.byteSize,
      buffer: attachment.buffer,
      sha256: attachment.sha256,
    });

    if (loadConfirmation.deduped) {
      dedupedAttachmentCount += 1;
    } else {
      createdLoadConfirmationIds.push(loadConfirmation.id);
    }

    await deps.createInboundAttachment({
      inboundEmailId: inboundEmail.id,
      orgId: alias.orgId,
      filename: attachment.filename,
      contentType: attachment.contentType,
      byteSize: attachment.byteSize,
      sha256: attachment.sha256,
      storageKey: loadConfirmation.storageKey,
      deduped: loadConfirmation.deduped,
      dedupedFromAttachmentId: null,
      loadConfirmationDocumentId: loadConfirmation.id,
    });
  }

  await deps.updateInboundEmailCounters({
    inboundEmailId: inboundEmail.id,
    dedupedAttachmentCount,
    createdLoadConfirmationCount: createdLoadConfirmationIds.length,
  });

  deps.log({
    provider: email.provider,
    status: INBOUND_STATUS_TO_RESPONSE[inboundEmail.status],
    orgId: alias.orgId,
    messageId: email.messageId,
    recipients,
    attachments: email.attachments.length,
    dedupedAttachmentCount,
    createdLoadConfirmationCount: createdLoadConfirmationIds.length,
  });

  return {
    status: INBOUND_STATUS_TO_RESPONSE[inboundEmail.status],
    inboundEmailId: inboundEmail.id,
    createdLoadConfirmationIds,
    dedupedAttachmentCount,
  };
}

export async function ingestInboundRateconEmail(email: InboundRateconEmail) {
  const deps: InboundRateconIngestDeps = {
    now: () => new Date(),
    dedupeWindowDays: Number(process.env.INBOUND_RATECON_ATTACHMENT_DEDUPE_DAYS || "30"),
    resolveAliasByRecipients: async (recipients) => {
      if (recipients.length === 0) return null;
      return prisma.inboundEmailAlias.findFirst({
        where: {
          isActive: true,
          address: { in: recipients },
        },
        orderBy: { createdAt: "asc" },
      });
    },
    isInboundEnabledForOrg: async (orgId) => {
      const settings = await prisma.orgSettings.findFirst({
        where: { orgId },
        select: { inboundRateconEmailEnabled: true },
      });
      return Boolean(settings?.inboundRateconEmailEnabled);
    },
    findByMessageId: async ({ orgId, provider, messageId }) => {
      return prisma.inboundEmail.findFirst({
        where: { orgId, provider, messageId },
        select: { id: true, status: true },
      });
    },
    createInboundEmail: async (params) => {
      try {
        return await prisma.inboundEmail.create({
          data: {
            orgId: params.orgId,
            aliasId: params.aliasId,
            provider: params.provider,
            status: params.status,
            fromAddress: params.fromAddress,
            toAddresses: params.toAddresses,
            subject: params.subject,
            messageId: params.messageId,
            messageDate: params.messageDate,
            textBody: params.textBody,
            htmlBody: params.htmlBody,
            rawHeaders: params.rawHeaders,
          },
          select: { id: true, status: true },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          params.orgId &&
          params.messageId
        ) {
          const existing = await prisma.inboundEmail.findFirst({
            where: {
              orgId: params.orgId,
              provider: params.provider,
              messageId: params.messageId,
            },
            select: { id: true, status: true },
          });
          if (existing) return { ...existing, wasExisting: true };
        }
        throw error;
      }
    },
    updateInboundEmailCounters: async ({ inboundEmailId, dedupedAttachmentCount, createdLoadConfirmationCount }) => {
      await prisma.inboundEmail.update({
        where: { id: inboundEmailId },
        data: {
          dedupedAttachmentCount,
          createdLoadConfirmationCount,
        },
      });
    },
    findRecentAttachmentBySha: async ({ orgId, sha256, since }) => {
      return prisma.inboundEmailAttachment.findFirst({
        where: {
          orgId,
          sha256,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          storageKey: true,
          loadConfirmationDocumentId: true,
        },
      });
    },
    createInboundAttachment: async (params) => {
      await prisma.inboundEmailAttachment.create({
        data: {
          inboundEmailId: params.inboundEmailId,
          orgId: params.orgId,
          filename: params.filename,
          contentType: params.contentType,
          byteSize: params.byteSize,
          sha256: params.sha256,
          storageKey: params.storageKey,
          deduped: params.deduped,
          dedupedFromAttachmentId: params.dedupedFromAttachmentId,
          loadConfirmationDocumentId: params.loadConfirmationDocumentId,
        },
      });
    },
    storeAttachment: async (params) => {
      return saveInboundEmailAttachmentBuffer({
        buffer: params.buffer,
        originalName: params.filename,
        orgId: params.orgId,
        emailId: params.inboundEmailId,
      });
    },
    createLoadConfirmationFromAttachment: async (params) => {
      const result = await createLoadConfirmationDocumentFromBuffer({
        orgId: params.orgId,
        uploadedByUserId: null,
        filename: params.filename,
        contentType: params.contentType,
        byteSize: params.byteSize,
        buffer: params.buffer,
        sha256: params.sha256,
        source: "INBOUND_EMAIL",
      });
      return {
        id: result.doc.id,
        storageKey: result.doc.storageKey,
        deduped: result.deduped,
      };
    },
    listCreatedLoadConfirmationIds: async (inboundEmailId) => {
      const rows = await prisma.inboundEmailAttachment.findMany({
        where: { inboundEmailId, loadConfirmationDocumentId: { not: null } },
        select: { loadConfirmationDocumentId: true },
      });
      return rows
        .map((row) => row.loadConfirmationDocumentId)
        .filter((value): value is string => Boolean(value));
    },
    log: (payload) => {
      console.info("inbound.ratecon.email", payload);
    },
  };

  return ingestInboundRateconEmailWithDeps(email, deps);
}

import assert from "node:assert/strict";
import { InboundEmailProvider, InboundEmailStatus } from "@truckerio/db";
import { ingestInboundRateconEmailWithDeps, type InboundRateconIngestDeps } from "./service";
import type { InboundRateconEmail } from "./types";

function baseEmail(overrides: Partial<InboundRateconEmail> = {}): InboundRateconEmail {
  return {
    provider: InboundEmailProvider.SENDGRID,
    to: ["ratecon+wrath@example.com"],
    from: "broker@example.net",
    subject: "Rate confirmation",
    messageId: "<message-1@example.net>",
    date: "2026-02-06T10:00:00.000Z",
    textBody: "Body",
    htmlBody: null,
    rawHeaders: {},
    attachments: [
      {
        filename: "ratecon.pdf",
        contentType: "application/pdf",
        byteSize: 100,
        sha256: "sha-a",
        buffer: Buffer.from("A"),
      },
    ],
    ...overrides,
  };
}

function buildDeps(overrides: Partial<InboundRateconIngestDeps> = {}): InboundRateconIngestDeps {
  const createdAttachments: Array<{ deduped: boolean; loadConfirmationDocumentId: string | null }> = [];

  return {
    now: () => new Date("2026-02-07T00:00:00.000Z"),
    dedupeWindowDays: 30,
    resolveAliasByRecipients: async () => ({ id: "alias-1", orgId: "org-1", address: "ratecon+wrath@example.com" }),
    isInboundEnabledForOrg: async () => true,
    findByMessageId: async () => null,
    createInboundEmail: async () => ({ id: "inbound-1", status: InboundEmailStatus.ACCEPTED }),
    updateInboundEmailCounters: async () => undefined,
    findRecentAttachmentBySha: async () => null,
    createInboundAttachment: async (params) => {
      createdAttachments.push({ deduped: params.deduped, loadConfirmationDocumentId: params.loadConfirmationDocumentId });
    },
    storeAttachment: async (params) => ({ filename: params.filename, storageKey: `stored/${params.filename}` }),
    createLoadConfirmationFromAttachment: async (params) => ({
      id: `lc-${params.sha256}`,
      storageKey: `org/org-1/load-confirmations/lc-${params.sha256}/${params.filename}`,
      deduped: false,
    }),
    listCreatedLoadConfirmationIds: async () => ["lc-existing"],
    log: () => undefined,
    ...overrides,
  };
}

(async () => {
  const dedupedByMessage = await ingestInboundRateconEmailWithDeps(
    baseEmail(),
    buildDeps({
      findByMessageId: async () => ({ id: "inbound-existing", status: InboundEmailStatus.DEDUPED }),
      listCreatedLoadConfirmationIds: async () => ["lc-existing"],
    })
  );

  assert.equal(dedupedByMessage.status, "deduped");
  assert.equal(dedupedByMessage.inboundEmailId, "inbound-existing");
  assert.deepEqual(dedupedByMessage.createdLoadConfirmationIds, ["lc-existing"]);

  const mixedEmail = baseEmail({
    messageId: "<message-2@example.net>",
    attachments: [
      {
        filename: "dup.pdf",
        contentType: "application/pdf",
        byteSize: 120,
        sha256: "sha-dup",
        buffer: Buffer.from("dup"),
      },
      {
        filename: "new.pdf",
        contentType: "application/pdf",
        byteSize: 130,
        sha256: "sha-new",
        buffer: Buffer.from("new"),
      },
    ],
  });

  let loadConfirmationCalls = 0;
  const mixedResult = await ingestInboundRateconEmailWithDeps(
    mixedEmail,
    buildDeps({
      findRecentAttachmentBySha: async ({ sha256 }) => {
        if (sha256 === "sha-dup") {
          return {
            id: "att-existing",
            storageKey: "org/org-1/load-confirmations/lc-dup/dup.pdf",
            loadConfirmationDocumentId: "lc-dup",
          };
        }
        return null;
      },
      createLoadConfirmationFromAttachment: async (params) => {
        loadConfirmationCalls += 1;
        return {
          id: `lc-${params.sha256}`,
          storageKey: `org/org-1/load-confirmations/lc-${params.sha256}/${params.filename}`,
          deduped: false,
        };
      },
    })
  );

  assert.equal(mixedResult.status, "accepted");
  assert.equal(mixedResult.dedupedAttachmentCount, 1);
  assert.deepEqual(mixedResult.createdLoadConfirmationIds, ["lc-sha-new"]);
  assert.equal(loadConfirmationCalls, 1, "only non-deduped attachment should create a load confirmation");

  let disabledCreateCalls = 0;
  const disabledResult = await ingestInboundRateconEmailWithDeps(
    baseEmail({ messageId: "<message-3@example.net>" }),
    buildDeps({
      isInboundEnabledForOrg: async () => false,
      createInboundEmail: async () => ({ id: "inbound-disabled", status: InboundEmailStatus.ACCEPTED_DISABLED }),
      createLoadConfirmationFromAttachment: async () => {
        disabledCreateCalls += 1;
        return { id: "never", storageKey: "never", deduped: false };
      },
    })
  );

  assert.equal(disabledResult.status, "accepted_disabled");
  assert.equal(disabledCreateCalls, 0, "disabled org should not create load confirmations");

  console.log("inbound email service tests passed");
})();

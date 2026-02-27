import crypto from "crypto";
import {
  prisma,
  LoadConfirmationStatus,
} from "@truckerio/db";
import { saveLoadConfirmationBuffer } from "../../lib/uploads";
import { logAudit } from "../../lib/audit";

export const LOAD_CONFIRMATION_UPLOAD_DEDUPE_STATUSES = [
  LoadConfirmationStatus.CREATED,
  LoadConfirmationStatus.READY_TO_CREATE,
] as const;

export type LoadConfirmationIngestSource = "OPS_UPLOAD" | "INBOUND_EMAIL";

export type LoadConfirmationFileInput = {
  orgId: string;
  uploadedByUserId?: string | null;
  filename: string;
  contentType: string;
  byteSize: number;
  buffer: Buffer;
  source: LoadConfirmationIngestSource;
  sha256?: string;
};

export async function createLoadConfirmationDocumentFromBuffer(input: LoadConfirmationFileInput) {
  const sha256 = input.sha256 || crypto.createHash("sha256").update(input.buffer).digest("hex");
  const existing = await prisma.loadConfirmationDocument.findFirst({
    where: {
      orgId: input.orgId,
      sha256,
      status: { in: [...LOAD_CONFIRMATION_UPLOAD_DEDUPE_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return { doc: existing, deduped: true as const };
  }

  const pending = await prisma.loadConfirmationDocument.create({
    data: {
      orgId: input.orgId,
      uploadedByUserId: input.uploadedByUserId ?? null,
      filename: input.filename || "load-confirmation",
      contentType: input.contentType,
      sizeBytes: input.byteSize,
      storageKey: "pending",
      sha256,
      status: LoadConfirmationStatus.UPLOADED,
    },
  });

  const saved = await saveLoadConfirmationBuffer({
    buffer: input.buffer,
    originalName: input.filename,
    orgId: input.orgId,
    docId: pending.id,
  });

  const doc = await prisma.loadConfirmationDocument.update({
    where: { id: pending.id },
    data: { filename: saved.filename, storageKey: saved.storageKey },
  });

  await prisma.loadConfirmationExtractEvent.create({
    data: {
      orgId: input.orgId,
      docId: doc.id,
      type: "UPLOADED",
      message: input.source === "INBOUND_EMAIL" ? "Load confirmation uploaded from inbound email" : "Load confirmation uploaded",
    },
  });

  if (input.uploadedByUserId) {
    await logAudit({
      orgId: input.orgId,
      userId: input.uploadedByUserId,
      action: "LOAD_CONFIRMATION_UPLOADED",
      entity: "LoadConfirmationDocument",
      entityId: doc.id,
      summary: `Uploaded load confirmation ${doc.filename}`,
      meta: { sha256, source: input.source },
    });
  }

  return { doc, deduped: false as const };
}

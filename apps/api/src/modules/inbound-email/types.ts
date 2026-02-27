import type { InboundEmailProvider, InboundEmailStatus } from "@truckerio/db";

export type InboundRateconAttachment = {
  filename: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  buffer: Buffer;
};

export type InboundRateconEmail = {
  provider: InboundEmailProvider;
  to: string[];
  from: string;
  subject: string | null;
  messageId: string | null;
  date: string | null;
  textBody: string | null;
  htmlBody: string | null;
  rawHeaders: Record<string, string>;
  attachments: InboundRateconAttachment[];
};

export type InboundRateconResponseStatus =
  | "accepted"
  | "accepted_disabled"
  | "rejected"
  | "unrouted"
  | "deduped";

export type InboundRateconProcessingResult = {
  status: InboundRateconResponseStatus;
  inboundEmailId: string | null;
  createdLoadConfirmationIds: string[];
  dedupedAttachmentCount: number;
};

export const INBOUND_STATUS_TO_RESPONSE: Record<InboundEmailStatus, InboundRateconResponseStatus> = {
  ACCEPTED: "accepted",
  ACCEPTED_DISABLED: "accepted_disabled",
  DEDUPED: "deduped",
  REJECTED: "rejected",
  UNROUTED: "unrouted",
};

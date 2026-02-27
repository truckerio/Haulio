import crypto from "crypto";
import { InboundEmailProvider } from "@truckerio/db";
import type { InboundRateconEmail } from "./types";

const IMAGE_MIME_PREFIX = "image/";

function normalizeAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const angleMatch = trimmed.match(/<([^>]+)>/);
  const candidate = (angleMatch?.[1] ?? trimmed).trim().toLowerCase();
  if (!candidate.includes("@")) return null;
  return candidate;
}

export function parseEmailAddressList(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split(/[;,]/g)
    .map((entry) => normalizeAddress(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function parseMessageId(headers: Record<string, string>, body: Record<string, unknown>) {
  const direct = body["message-id"];
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  for (const key of ["message-id", "message-id:", "Message-Id", "Message-ID"]) {
    const value = headers[key.toLowerCase()] ?? headers[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function parseHeaders(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return {} as Record<string, string>;
  const map: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!key || !value) continue;
    map[key] = value;
  }
  return map;
}

function isSupportedAttachment(contentType: string, filename: string) {
  const normalizedType = contentType.toLowerCase();
  if (normalizedType === "application/pdf") return true;
  if (normalizedType.startsWith(IMAGE_MIME_PREFIX)) return true;
  const lowerName = filename.toLowerCase();
  return lowerName.endsWith(".pdf") || lowerName.endsWith(".png") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg");
}

function normalizeContentType(contentType: string, filename: string) {
  const normalizedType = contentType.trim().toLowerCase();
  if (normalizedType) return normalizedType;
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith(".pdf")) return "application/pdf";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function parseSendgridInboundEmail(params: {
  body: Record<string, unknown>;
  files: Express.Multer.File[];
}) {
  const headers = parseHeaders(params.body.headers);
  const to = parseEmailAddressList(typeof params.body.to === "string" ? params.body.to : null);
  const fromCandidates = [
    typeof params.body.from === "string" ? params.body.from : null,
    headers.from,
  ];
  const from =
    fromCandidates
      .map((value) => normalizeAddress(value ?? ""))
      .find((value) => Boolean(value)) ?? "unknown@unknown";

  const attachments = params.files
    .map((file) => {
      const filename = file.originalname || file.fieldname || "attachment";
      const contentType = normalizeContentType(file.mimetype || "", filename);
      if (!isSupportedAttachment(contentType, filename)) return null;
      return {
        filename,
        contentType,
        byteSize: file.size,
        sha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
        buffer: file.buffer,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const normalized: InboundRateconEmail = {
    provider: InboundEmailProvider.SENDGRID,
    to,
    from,
    subject: typeof params.body.subject === "string" ? params.body.subject : null,
    messageId: parseMessageId(headers, params.body),
    date: parseDate(typeof params.body.date === "string" ? params.body.date : headers.date ?? null),
    textBody: typeof params.body.text === "string" ? params.body.text : null,
    htmlBody: typeof params.body.html === "string" ? params.body.html : null,
    rawHeaders: headers,
    attachments,
  };

  return normalized;
}

export function isInboundWebhookAuthorized(params: {
  configuredToken: string | undefined;
  providedToken: string | undefined;
}) {
  const expected = params.configuredToken?.trim();
  if (!expected) {
    return { ok: false as const, reason: "Inbound webhook token is not configured" };
  }
  const actual = params.providedToken?.trim();
  if (!actual || actual !== expected) {
    return { ok: false as const, reason: "Invalid inbound webhook token" };
  }
  return { ok: true as const };
}

// TODO: Add Postmark adapter.
// TODO: Add Mailgun adapter.

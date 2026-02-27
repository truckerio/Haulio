import assert from "node:assert/strict";
import { isInboundWebhookAuthorized, parseSendgridInboundEmail } from "./sendgrid";

const pdfBuffer = Buffer.from("%PDF-sample");
const txtBuffer = Buffer.from("plain-text");

const parsed = parseSendgridInboundEmail({
  body: {
    to: "RateCon+wrath@example.com, Ops <ops@example.com>",
    from: "Broker Desk <broker@example.net>",
    subject: "Load confirmation",
    text: "Body",
    html: "<p>Body</p>",
    headers: "Message-ID: <abc-123@example.net>\nDate: Thu, 06 Feb 2026 10:00:00 +0000",
  },
  files: [
    {
      originalname: "ratecon.pdf",
      mimetype: "application/pdf",
      size: pdfBuffer.length,
      buffer: pdfBuffer,
      fieldname: "attachment1",
    } as Express.Multer.File,
    {
      originalname: "notes.txt",
      mimetype: "text/plain",
      size: txtBuffer.length,
      buffer: txtBuffer,
      fieldname: "attachment2",
    } as Express.Multer.File,
  ],
});

assert.equal(parsed.to.length, 2, "recipient parsing should preserve valid addresses");
assert.equal(parsed.from, "broker@example.net");
assert.equal(parsed.messageId, "<abc-123@example.net>");
assert.equal(parsed.attachments.length, 1, "only pdf/image attachments should be accepted");
assert.equal(parsed.attachments[0].filename, "ratecon.pdf");
assert.ok(parsed.attachments[0].sha256.length > 10);

const authorized = isInboundWebhookAuthorized({
  configuredToken: "secret-token",
  providedToken: "secret-token",
});
assert.equal(authorized.ok, true);

const unauthorized = isInboundWebhookAuthorized({
  configuredToken: "secret-token",
  providedToken: "wrong",
});
assert.equal(unauthorized.ok, false);

console.log("sendgrid inbound adapter tests passed");

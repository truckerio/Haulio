import crypto from "crypto";
import { authenticator } from "otplib";

const ISSUER = "Haulio";
const ENCRYPTION_KEY = process.env.MFA_SECRET || process.env.APP_ENCRYPTION_KEY || "";

function getKey() {
  if (!ENCRYPTION_KEY) {
    throw new Error("MFA_SECRET is not configured");
  }
  const raw = ENCRYPTION_KEY.trim();
  if (raw.length >= 44) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length >= 32) return buf.subarray(0, 32);
  }
  const buf = Buffer.from(raw, "utf8");
  if (buf.length < 32) {
    throw new Error("MFA_SECRET must be at least 32 bytes");
  }
  return buf.subarray(0, 32);
}

export function encryptSecret(secret: string) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string) {
  const key = getKey();
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function generateTotpSecret() {
  authenticator.options = { window: 1 };
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(email: string, secret: string) {
  return authenticator.keyuri(email, ISSUER, secret);
}

export function verifyTotp(code: string, secret: string) {
  authenticator.options = { window: 1 };
  return authenticator.check(code, secret);
}

function hashInput(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateRecoveryCodes(count = 8) {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    codes.push(crypto.randomBytes(5).toString("hex"));
  }
  const hashes = codes.map((code) => hashInput(code));
  return { codes, hashes };
}

function normalizeCode(code: string) {
  return code.replace(/\s+/g, "").toLowerCase();
}

export function hashRecoveryCode(code: string) {
  return hashInput(normalizeCode(code));
}

export function verifyRecoveryCode(code: string, hashes: string[]) {
  const hashed = hashRecoveryCode(code);
  return hashes.some((candidate) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(hashed);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  });
}

export function consumeRecoveryCode(code: string, hashes: string[]) {
  const hashed = hashRecoveryCode(code);
  return hashes.filter((candidate) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(hashed);
    if (a.length !== b.length) return true;
    return !crypto.timingSafeEqual(a, b);
  });
}

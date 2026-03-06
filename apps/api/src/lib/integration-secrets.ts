import crypto from "crypto";

const ENCRYPTED_PREFIX = "enc:v1:";

function resolveSecretKey() {
  const raw =
    process.env.INTEGRATION_SECRET?.trim() ||
    process.env.APP_ENCRYPTION_KEY?.trim() ||
    process.env.MFA_SECRET?.trim() ||
    "";
  if (!raw) return null;
  if (raw.length >= 44) {
    try {
      const decoded = Buffer.from(raw, "base64");
      if (decoded.length >= 32) return decoded.subarray(0, 32);
    } catch {
      // Fall through to hash-based key derivation.
    }
  }
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptWithKey(secret: string, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

function decryptWithKey(payload: string, key: Buffer) {
  const encoded = payload.slice(ENCRYPTED_PREFIX.length);
  const buffer = Buffer.from(encoded, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function isEncryptedIntegrationSecret(value: unknown) {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

export function hasIntegrationSecretKey() {
  return Boolean(resolveSecretKey());
}

export function tryEncryptIntegrationSecret(secret: string) {
  const trimmed = secret.trim();
  if (!trimmed) {
    return { value: "", encrypted: false as const };
  }
  const key = resolveSecretKey();
  if (!key) {
    return { value: trimmed, encrypted: false as const };
  }
  return { value: encryptWithKey(trimmed, key), encrypted: true as const };
}

export function decryptIntegrationSecret(value: string) {
  if (!value) return "";
  if (!isEncryptedIntegrationSecret(value)) return value;
  const key = resolveSecretKey();
  if (!key) {
    throw new Error("Integration secret key is not configured for encrypted credentials.");
  }
  return decryptWithKey(value, key);
}

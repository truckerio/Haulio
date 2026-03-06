import { Prisma } from "@truckerio/db";
import {
  decryptIntegrationSecret,
  hasIntegrationSecretKey,
  isEncryptedIntegrationSecret,
  tryEncryptIntegrationSecret,
} from "./integration-secrets";

type MutableJsonObject = Record<string, unknown>;

function toObject(config: Prisma.JsonValue | null | undefined): MutableJsonObject {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  return { ...(config as MutableJsonObject) };
}

function getString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getDate(value: unknown) {
  const raw = getString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function readSecret(config: MutableJsonObject, encryptedKey: string, legacyKey: string) {
  const encryptedValue = getString(config[encryptedKey]);
  if (encryptedValue) {
    try {
      return decryptIntegrationSecret(encryptedValue);
    } catch {
      return null;
    }
  }
  const legacy = getString(config[legacyKey]);
  return legacy;
}

export function extractSamsaraApiToken(config: Prisma.JsonValue | null) {
  const payload = toObject(config);
  const oauthToken = readSecret(payload, "oauthAccessTokenEncrypted", "oauthAccessToken");
  if (oauthToken) return oauthToken;
  return readSecret(payload, "apiTokenEncrypted", "apiToken");
}

export function extractSamsaraWebhookSigningSecret(config: Prisma.JsonValue | null) {
  const payload = toObject(config);
  return readSecret(payload, "webhookSigningSecretEncrypted", "webhookSigningSecret");
}

export function extractSamsaraOrgExternalId(config: Prisma.JsonValue | null) {
  const payload = toObject(config);
  return getString(payload.orgExternalId);
}

export function hasEncryptedSamsaraCredentials(config: Prisma.JsonValue | null) {
  const payload = toObject(config);
  return (
    isEncryptedIntegrationSecret(payload.oauthAccessTokenEncrypted) ||
    isEncryptedIntegrationSecret(payload.oauthRefreshTokenEncrypted) ||
    isEncryptedIntegrationSecret(payload.oauthClientSecretEncrypted) ||
    isEncryptedIntegrationSecret(payload.apiTokenEncrypted) ||
    isEncryptedIntegrationSecret(payload.webhookSigningSecretEncrypted)
  );
}

export function extractSamsaraOAuthRefreshToken(config: Prisma.JsonValue | null) {
  const payload = toObject(config);
  return readSecret(payload, "oauthRefreshTokenEncrypted", "oauthRefreshToken");
}

export function extractSamsaraOAuthTokenExpiresAt(config: Prisma.JsonValue | null) {
  const payload = toObject(config);
  return getDate(payload.oauthTokenExpiresAt);
}

export function extractSamsaraAuthMode(config: Prisma.JsonValue | null) {
  const payload = toObject(config);
  const mode = getString(payload.authMode);
  return mode ?? null;
}

export function extractSamsaraOAuthScope(config: Prisma.JsonValue | null) {
  const payload = toObject(config);
  return getString(payload.oauthScope);
}

export function extractSamsaraOAuthClientId(config: Prisma.JsonValue | null) {
  const payload = toObject(config);
  return getString(payload.oauthClientId);
}

export function extractSamsaraOAuthClientSecret(config: Prisma.JsonValue | null) {
  const payload = toObject(config);
  return readSecret(payload, "oauthClientSecretEncrypted", "oauthClientSecret");
}

export function writeSamsaraOAuthClientConfig(params: {
  previousConfig?: Prisma.JsonValue | null;
  clientId?: string | null;
  clientSecret?: string | null;
}) {
  const next = toObject(params.previousConfig);
  const clientId = getString(params.clientId);
  const clientSecret = getString(params.clientSecret);

  if (clientId) next.oauthClientId = clientId;
  else delete next.oauthClientId;

  delete next.oauthClientSecret;
  delete next.oauthClientSecretEncrypted;
  if (clientSecret) {
    const encrypted = tryEncryptIntegrationSecret(clientSecret);
    next[encrypted.encrypted ? "oauthClientSecretEncrypted" : "oauthClientSecret"] = encrypted.value;
  }

  next.credentialEncryption = hasIntegrationSecretKey() ? "AES_GCM_V1" : "PLAINTEXT";
  return next as Prisma.InputJsonValue;
}

export function writeSamsaraOAuthCredentials(params: {
  previousConfig?: Prisma.JsonValue | null;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds?: number | null;
  scope?: string | null;
  tokenType?: string | null;
}) {
  const next = toObject(params.previousConfig);
  const applySecret = (value: string, encryptedKey: string, legacyKey: string) => {
    const encrypted = tryEncryptIntegrationSecret(value);
    delete next[legacyKey];
    delete next[encryptedKey];
    next[encrypted.encrypted ? encryptedKey : legacyKey] = encrypted.value;
  };

  applySecret(params.accessToken, "oauthAccessTokenEncrypted", "oauthAccessToken");
  applySecret(params.refreshToken, "oauthRefreshTokenEncrypted", "oauthRefreshToken");
  // Keep legacy-compatible token key populated so existing callers continue working.
  applySecret(params.accessToken, "apiTokenEncrypted", "apiToken");

  if (typeof params.expiresInSeconds === "number" && Number.isFinite(params.expiresInSeconds)) {
    const expiresAt = new Date(Date.now() + Math.max(0, params.expiresInSeconds) * 1000);
    next.oauthTokenExpiresAt = expiresAt.toISOString();
  } else {
    delete next.oauthTokenExpiresAt;
  }

  const scope = getString(params.scope);
  if (scope) next.oauthScope = scope;
  else delete next.oauthScope;

  const tokenType = getString(params.tokenType);
  if (tokenType) next.oauthTokenType = tokenType;
  else delete next.oauthTokenType;

  next.authMode = "oauth2";
  next.oauthConnectedAt = new Date().toISOString();
  next.credentialEncryption = hasIntegrationSecretKey() ? "AES_GCM_V1" : "PLAINTEXT";
  return next as Prisma.InputJsonValue;
}

export function buildSamsaraConfigJson(params: {
  previousConfig?: Prisma.JsonValue | null;
  apiToken?: string | null;
  webhookSigningSecret?: string | null;
  orgExternalId?: string | null;
}) {
  const next = toObject(params.previousConfig);
  const currentToken = extractSamsaraApiToken(params.previousConfig ?? null);
  const currentWebhookSecret = extractSamsaraWebhookSigningSecret(params.previousConfig ?? null);
  const token = getString(params.apiToken ?? currentToken);
  const webhookSecret = getString(params.webhookSigningSecret ?? currentWebhookSecret);
  const orgExternalId = getString(params.orgExternalId ?? extractSamsaraOrgExternalId(params.previousConfig ?? null));

  delete next.apiToken;
  delete next.apiTokenEncrypted;
  delete next.webhookSigningSecret;
  delete next.webhookSigningSecretEncrypted;
  if (token) {
    const encrypted = tryEncryptIntegrationSecret(token);
    next[encrypted.encrypted ? "apiTokenEncrypted" : "apiToken"] = encrypted.value;
  }
  if (webhookSecret) {
    const encrypted = tryEncryptIntegrationSecret(webhookSecret);
    next[encrypted.encrypted ? "webhookSigningSecretEncrypted" : "webhookSigningSecret"] = encrypted.value;
  }
  if (orgExternalId) {
    next.orgExternalId = orgExternalId;
  } else {
    delete next.orgExternalId;
  }
  next.credentialEncryption = hasIntegrationSecretKey() ? "AES_GCM_V1" : "PLAINTEXT";
  return next as Prisma.InputJsonValue;
}

export function migrateLegacySamsaraConfig(config: Prisma.JsonValue | null) {
  const payload = toObject(config);
  if (!hasIntegrationSecretKey()) {
    return { changed: false as const, configJson: payload as Prisma.InputJsonValue };
  }

  let changed = false;
  const token = getString(payload.apiToken);
  const tokenEncrypted = getString(payload.apiTokenEncrypted);
  if (token && !tokenEncrypted) {
    const encrypted = tryEncryptIntegrationSecret(token);
    if (encrypted.encrypted) {
      payload.apiTokenEncrypted = encrypted.value;
      delete payload.apiToken;
      changed = true;
    }
  }

  const webhookSecret = getString(payload.webhookSigningSecret);
  const webhookEncrypted = getString(payload.webhookSigningSecretEncrypted);
  if (webhookSecret && !webhookEncrypted) {
    const encrypted = tryEncryptIntegrationSecret(webhookSecret);
    if (encrypted.encrypted) {
      payload.webhookSigningSecretEncrypted = encrypted.value;
      delete payload.webhookSigningSecret;
      changed = true;
    }
  }

  const oauthAccess = getString(payload.oauthAccessToken);
  const oauthAccessEncrypted = getString(payload.oauthAccessTokenEncrypted);
  if (oauthAccess && !oauthAccessEncrypted) {
    const encrypted = tryEncryptIntegrationSecret(oauthAccess);
    if (encrypted.encrypted) {
      payload.oauthAccessTokenEncrypted = encrypted.value;
      delete payload.oauthAccessToken;
      changed = true;
    }
  }

  const oauthRefresh = getString(payload.oauthRefreshToken);
  const oauthRefreshEncrypted = getString(payload.oauthRefreshTokenEncrypted);
  if (oauthRefresh && !oauthRefreshEncrypted) {
    const encrypted = tryEncryptIntegrationSecret(oauthRefresh);
    if (encrypted.encrypted) {
      payload.oauthRefreshTokenEncrypted = encrypted.value;
      delete payload.oauthRefreshToken;
      changed = true;
    }
  }

  const oauthClientSecret = getString(payload.oauthClientSecret);
  const oauthClientSecretEncrypted = getString(payload.oauthClientSecretEncrypted);
  if (oauthClientSecret && !oauthClientSecretEncrypted) {
    const encrypted = tryEncryptIntegrationSecret(oauthClientSecret);
    if (encrypted.encrypted) {
      payload.oauthClientSecretEncrypted = encrypted.value;
      delete payload.oauthClientSecret;
      changed = true;
    }
  }

  if (changed) {
    payload.credentialEncryption = "AES_GCM_V1";
  }
  return { changed, configJson: payload as Prisma.InputJsonValue };
}

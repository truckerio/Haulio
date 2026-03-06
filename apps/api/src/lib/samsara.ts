const SAMSARA_BASE = process.env.SAMSARA_API_BASE || "https://api.samsara.com";
const SAMSARA_OAUTH_TOKEN_URL = process.env.SAMSARA_OAUTH_TOKEN_URL || "https://api.samsara.com/oauth2/token";
const DEFAULT_TIMEOUT_MS = Number(process.env.SAMSARA_TIMEOUT_MS || "8000");
const MAX_RETRIES = 2;

type SamsaraErrorCode = "UNAUTHORIZED" | "RATE_LIMITED" | "NETWORK_ERROR" | "REQUEST_FAILED";

export class SamsaraError extends Error {
  status?: number;
  code: SamsaraErrorCode;
  retryAfter?: number;

  constructor(message: string, params: { status?: number; code: SamsaraErrorCode; retryAfter?: number }) {
    super(message);
    this.status = params.status;
    this.code = params.code;
    this.retryAfter = params.retryAfter;
  }
}

export type SamsaraErrorInfo = {
  code: SamsaraErrorCode;
  message: string;
  retryAfter?: number;
  status?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(raw?: string | null) {
  if (!raw) return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num)) return undefined;
  return num;
}

function safeParseJson(text: string) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function mapStatusToCode(status: number): SamsaraErrorCode {
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 429) return "RATE_LIMITED";
  return "REQUEST_FAILED";
}

async function timedFetch(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new SamsaraError("Temporary network error", { code: "NETWORK_ERROR" });
    }
    throw new SamsaraError("Temporary network error", { code: "NETWORK_ERROR" });
  } finally {
    clearTimeout(timer);
  }
}

async function samsaraRequest<T>(token: string, path: string, init?: RequestInit) {
  const url = `${SAMSARA_BASE}${path}`;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      const payload = safeParseJson(text);
      if (!res.ok) {
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        const code = mapStatusToCode(res.status);
        const message = payload?.message || `Samsara request failed (${res.status})`;
        throw new SamsaraError(message, { status: res.status, code, retryAfter });
      }
      return payload as T;
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof SamsaraError) {
        lastError = error;
      } else if ((error as Error)?.name === "AbortError") {
        lastError = new SamsaraError("Temporary network error", { code: "NETWORK_ERROR" });
      } else {
        lastError = error as Error;
      }
      if (attempt < MAX_RETRIES) {
        await sleep(150 * attempt);
        continue;
      }
    }
  }
  if (lastError instanceof SamsaraError) {
    throw lastError;
  }
  throw new SamsaraError("Temporary network error", { code: "NETWORK_ERROR" });
}

export function formatSamsaraError(error: unknown): SamsaraErrorInfo {
  if (error instanceof SamsaraError) {
    if (error.code === "UNAUTHORIZED") {
      return { code: error.code, message: "Invalid or expired Samsara token.", retryAfter: error.retryAfter, status: error.status };
    }
    if (error.code === "RATE_LIMITED") {
      return { code: error.code, message: "Samsara rate limit hit. Try again shortly.", retryAfter: error.retryAfter, status: error.status };
    }
    if (error.code === "NETWORK_ERROR") {
      return { code: error.code, message: "Temporary network error. Please retry.", retryAfter: error.retryAfter, status: error.status };
    }
    return { code: error.code, message: "Samsara request failed.", retryAfter: error.retryAfter, status: error.status };
  }
  return { code: "REQUEST_FAILED", message: "Samsara request failed." };
}

export async function validateSamsaraToken(token: string) {
  await samsaraRequest(token, "/fleet/vehicles?limit=1");
}

export async function fetchSamsaraVehicles(token: string, limit = 50) {
  const data = await samsaraRequest<any>(token, `/fleet/vehicles?limit=${encodeURIComponent(String(limit))}`);
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.vehicles) ? data.vehicles : [];
  return rows.map((vehicle: any) => ({
    id: vehicle.id ?? vehicle.uuid ?? vehicle.vehicleId ?? null,
    name: vehicle.name ?? vehicle.label ?? null,
    vin: vehicle.vin ?? null,
  }));
}

export async function fetchSamsaraVehicleLocation(token: string, externalId: string) {
  const data = await samsaraRequest<any>(
    token,
    `/fleet/vehicles/locations?vehicleIds=${encodeURIComponent(externalId)}`
  );
  const record = Array.isArray(data?.data) ? data.data[0] : null;
  if (!record) {
    throw new SamsaraError("No location available", { code: "REQUEST_FAILED" });
  }
  const location = record.location ?? record.lastLocation ?? record;
  const lat = location.latitude ?? location.lat ?? location.latitudeDegrees;
  const lng = location.longitude ?? location.lng ?? location.longitudeDegrees;
  const capturedAt = location.time ?? location.timestamp ?? location.capturedAt;
  return {
    lat: typeof lat === "number" ? lat : Number(lat),
    lng: typeof lng === "number" ? lng : Number(lng),
    capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
    heading: location.heading ?? null,
    speedMph: location.speed ?? location.speedMilesPerHour ?? null,
  } as const;
}

type OAuthTokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number | null;
  scope: string | null;
  tokenType: string | null;
};

function normalizeOAuthTokenResponse(payload: any): OAuthTokenResponse {
  const accessToken = typeof payload?.access_token === "string" ? payload.access_token.trim() : "";
  const refreshToken = typeof payload?.refresh_token === "string" ? payload.refresh_token.trim() : "";
  const expiresInRaw = Number(payload?.expires_in);
  const expiresIn = Number.isFinite(expiresInRaw) ? expiresInRaw : null;
  const scope = typeof payload?.scope === "string" ? payload.scope : null;
  const tokenType = typeof payload?.token_type === "string" ? payload.token_type : null;
  if (!accessToken || !refreshToken) {
    throw new SamsaraError("Samsara OAuth response missing required tokens.", { code: "REQUEST_FAILED" });
  }
  return { accessToken, refreshToken, expiresIn, scope, tokenType };
}

async function requestOAuthToken(body: URLSearchParams) {
  const res = await timedFetch(SAMSARA_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  const text = await res.text();
  const payload = safeParseJson(text);
  if (!res.ok) {
    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    const code = mapStatusToCode(res.status);
    const message = payload?.error_description || payload?.message || `Samsara OAuth request failed (${res.status})`;
    throw new SamsaraError(message, { status: res.status, code, retryAfter });
  }
  return normalizeOAuthTokenResponse(payload);
}

export async function exchangeSamsaraOAuthCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", params.clientId);
  body.set("client_secret", params.clientSecret);
  body.set("code", params.code);
  body.set("redirect_uri", params.redirectUri);
  return requestOAuthToken(body);
}

export async function refreshSamsaraOAuthToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", params.clientId);
  body.set("client_secret", params.clientSecret);
  body.set("refresh_token", params.refreshToken);
  return requestOAuthToken(body);
}

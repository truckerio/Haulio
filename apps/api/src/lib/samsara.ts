const SAMSARA_BASE = process.env.SAMSARA_API_BASE || "https://api.samsara.com";
const DEFAULT_TIMEOUT_MS = Number(process.env.SAMSARA_TIMEOUT_MS || "8000");
const MAX_RETRIES = 2;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      const payload = text ? JSON.parse(text) : null;
      if (!res.ok) {
        throw new Error(payload?.message || `Samsara request failed (${res.status})`);
      }
      return payload as T;
    } catch (error) {
      clearTimeout(timer);
      lastError = error as Error;
      if (attempt < MAX_RETRIES) {
        await sleep(150 * attempt);
        continue;
      }
    }
  }
  throw lastError ?? new Error("Samsara request failed");
}

export async function validateSamsaraToken(token: string) {
  await samsaraRequest(token, "/fleet/vehicles?limit=1");
}

export async function fetchSamsaraVehicleLocation(token: string, externalId: string) {
  const data = await samsaraRequest<any>(
    token,
    `/fleet/vehicles/locations?vehicleIds=${encodeURIComponent(externalId)}`
  );
  const record = Array.isArray(data?.data) ? data.data[0] : null;
  if (!record) {
    throw new Error("No location available");
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

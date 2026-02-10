import { prisma, FuelSummarySource, Prisma, TrackingIntegrationStatus, TrackingProviderType } from "@truckerio/db";

const SAMSARA_BASE = process.env.SAMSARA_API_BASE || "https://api.samsara.com";
const DEFAULT_TIMEOUT_MS = Number(process.env.SAMSARA_TIMEOUT_MS || "8000");
const FUEL_REPORT_PATH = process.env.SAMSARA_FUEL_REPORT_PATH || "/fleet/reports/fuel/energy";

type FuelRow = {
  externalId: string;
  fuelUsed: number | null;
  distance: number | null;
  fuelEfficiency: number | null;
};

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "string" ? Number(value) : typeof value === "number" ? value : null;
  if (num === null || Number.isNaN(num)) return null;
  return num;
}

function mapFuelRows(payload: any) {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.vehicles)
      ? payload.vehicles
      : Array.isArray(payload?.vehicleReports)
        ? payload.vehicleReports
        : [];
  return rows
    .map((row: any) => {
      const vehicle = row.vehicle ?? row;
      const externalId = vehicle.id ?? vehicle.uuid ?? vehicle.vehicleId ?? row.vehicleId ?? row.id ?? null;
      if (!externalId) return null;
      const fuelUsed =
        normalizeNumber(row.fuelUsed) ??
        normalizeNumber(row.fuelConsumed) ??
        normalizeNumber(row.totalFuel) ??
        normalizeNumber(row.fuelVolume) ??
        normalizeNumber(row.fuel);
      const distance =
        normalizeNumber(row.distance) ??
        normalizeNumber(row.totalDistance) ??
        normalizeNumber(row.distanceMiles) ??
        normalizeNumber(row.distanceMeters);
      const fuelEfficiency =
        normalizeNumber(row.fuelEfficiency) ??
        normalizeNumber(row.fuelEconomy) ??
        normalizeNumber(row.mpg) ??
        normalizeNumber(row.kpl);
      return {
        externalId: String(externalId),
        fuelUsed,
        distance,
        fuelEfficiency,
      } as FuelRow;
    })
    .filter(Boolean) as FuelRow[];
}

async function samsaraRequest<T>(token: string, path: string) {
  const url = `${SAMSARA_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Samsara request failed (${res.status}) ${text}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSamsaraFuelReport(token: string, vehicleIds: string[], startMs: number, endMs: number) {
  if (vehicleIds.length === 0) return [];
  const query = new URLSearchParams();
  query.set("startMs", String(startMs));
  query.set("endMs", String(endMs));
  query.set("vehicleIds", vehicleIds.join(","));
  const path = `${FUEL_REPORT_PATH}?${query.toString()}`;
  const payload = await samsaraRequest<any>(token, path);
  return mapFuelRows(payload);
}

function extractSamsaraToken(config: Prisma.JsonValue | null) {
  if (!config || typeof config !== "object") return null;
  const value = (config as { apiToken?: string | null }).apiToken;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toDecimal(value: number | null) {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value);
}

function formatErrorSnippet(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

export async function syncSamsaraFuelSummaries(params: { days: number }) {
  const integrations = await prisma.trackingIntegration.findMany({
    where: { providerType: TrackingProviderType.SAMSARA, status: TrackingIntegrationStatus.CONNECTED },
  });
  const now = new Date();
  const periodEnd = new Date(now);
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - params.days);
  periodStart.setHours(0, 0, 0, 0);
  periodEnd.setHours(23, 59, 59, 999);

  for (const integration of integrations) {
    const token = extractSamsaraToken(integration.configJson ?? null);
    if (!token) continue;
    const mappings = await prisma.truckTelematicsMapping.findMany({
      where: { orgId: integration.orgId, providerType: TrackingProviderType.SAMSARA },
      include: { truck: true },
    });
    if (mappings.length === 0) continue;
    const vehicleIds = mappings.map((mapping) => mapping.externalId).filter(Boolean);
    if (vehicleIds.length === 0) continue;
    let rows: FuelRow[];
    try {
      rows = await fetchSamsaraFuelReport(token, vehicleIds, periodStart.getTime(), periodEnd.getTime());
    } catch (error) {
      console.error("Samsara fuel sync failed", error);
      await prisma.trackingIntegration.update({
        where: { id: integration.id },
        data: { lastFuelSyncError: formatErrorSnippet(error) },
      });
      continue;
    }
    const rowMap = new Map(rows.map((row) => [row.externalId, row]));
    const syncedAt = new Date();
    for (const mapping of mappings) {
      const row = rowMap.get(mapping.externalId);
      const fuelUsed = row?.fuelUsed ?? null;
      const distance = row?.distance ?? null;
      const fuelEfficiency =
        row?.fuelEfficiency ??
        (fuelUsed && distance ? Number((distance / fuelUsed).toFixed(4)) : null);
      await prisma.fuelSummary.upsert({
        where: {
          orgId_truckId_providerType_periodStart_periodEnd: {
            orgId: integration.orgId,
            truckId: mapping.truckId,
            providerType: TrackingProviderType.SAMSARA,
            periodStart,
            periodEnd,
          },
        },
        update: {
          fuelUsed: toDecimal(fuelUsed),
          distance: toDecimal(distance),
          fuelEfficiency: toDecimal(fuelEfficiency),
          lastSyncedAt: syncedAt,
          periodDays: params.days,
          source: FuelSummarySource.SAMSARA,
        },
        create: {
          orgId: integration.orgId,
          truckId: mapping.truckId,
          providerType: TrackingProviderType.SAMSARA,
          source: FuelSummarySource.SAMSARA,
          periodStart,
          periodEnd,
          periodDays: params.days,
          fuelUsed: toDecimal(fuelUsed),
          distance: toDecimal(distance),
          fuelEfficiency: toDecimal(fuelEfficiency),
          lastSyncedAt: syncedAt,
        },
      });
    }
    await prisma.trackingIntegration.update({
      where: { id: integration.id },
      data: { lastFuelSyncAt: syncedAt, lastFuelSyncError: null },
    });
  }
}

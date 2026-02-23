export type YardOsLaunchContext = {
  orgId?: string | null;
  loadIds?: string[];
  trailerId?: string | null;
  loadId?: string | null;
  loadNumber?: string | null;
  trailerUnit?: string | null;
  operatingEntityId?: string | null;
  teamId?: string | null;
  source?: string;
};

export function getYardOsBaseUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_YARDOS_BASE_URL?.trim();
  return base ? base : null;
}

export function buildYardOsPlanningUrl(context: YardOsLaunchContext): string | null {
  const base = getYardOsBaseUrl();
  if (!base) return null;

  try {
    const url = new URL(base, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const params = url.searchParams;

    const loadIds = [...new Set((context.loadIds ?? []).map((id) => id.trim()).filter(Boolean))];
    params.set("source", context.source ?? "truckerio.dispatch");
    if (context.orgId) params.set("orgId", context.orgId);
    if (loadIds.length > 0) params.set("loadIds", loadIds.join(","));
    if (context.trailerId) params.set("trailerId", context.trailerId);
    if (context.loadId) params.set("loadId", context.loadId);
    if (context.loadNumber) params.set("loadNumber", context.loadNumber);
    if (context.trailerUnit) params.set("trailerUnit", context.trailerUnit);
    if (context.operatingEntityId) params.set("operatingEntityId", context.operatingEntityId);
    if (context.teamId) params.set("teamId", context.teamId);

    return url.toString();
  } catch {
    return null;
  }
}

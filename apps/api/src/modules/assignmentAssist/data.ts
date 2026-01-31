import { prisma, DriverStatus, LoadStatus, StopType, TeamEntityType, TruckStatus } from "@truckerio/db";
import type { AuthRequest } from "../../lib/auth";
import {
  ensureEntityAssignedToDefaultTeam,
  ensureTeamAssignmentsForEntityType,
  getScopedEntityIds,
  getUserTeamScope,
} from "../../lib/team-scope";
import {
  ASSIST_MODEL_VERSION,
  ASSIST_WEIGHTS_VERSION,
  haversineMiles,
  scoreSuggestion,
  type ScoredSuggestion,
} from "./scoring";

export type AssignmentSuggestion = ScoredSuggestion & {
  driverName?: string | null;
  truckUnit?: string | null;
};

type SuggestionResponse = {
  loadId: string;
  orgId: string;
  modelVersion: string;
  weightsVersion: string;
  generatedAt: string;
  suggestions: AssignmentSuggestion[];
};

const buildLaneLabel = (pickup?: { city?: string | null; state?: string | null }, delivery?: { city?: string | null; state?: string | null }) => {
  if (!pickup?.city || !pickup?.state || !delivery?.city || !delivery?.state) return null;
  return `${pickup.city}, ${pickup.state} → ${delivery.city}, ${delivery.state}`;
};

const laneKey = (pickup?: { city?: string | null; state?: string | null }, delivery?: { city?: string | null; state?: string | null }) => {
  if (!pickup?.city || !pickup?.state || !delivery?.city || !delivery?.state) return null;
  return `${pickup.city}|${pickup.state}=>${delivery.city}|${delivery.state}`.toLowerCase();
};

export async function buildAssignmentSuggestions(params: {
  user: AuthRequest["user"];
  loadId: string;
  limit: number;
  includeTrucks: boolean;
  explain: boolean;
}): Promise<SuggestionResponse | null> {
  const { user, loadId, limit, includeTrucks, explain } = params;
  if (!user) return null;

  const load = await prisma.load.findFirst({
    where: { id: loadId, orgId: user.orgId },
    select: {
      id: true,
      orgId: true,
      status: true,
      stops: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          type: true,
          city: true,
          state: true,
          lat: true,
          lng: true,
          appointmentStart: true,
          appointmentEnd: true,
          sequence: true,
        },
      },
    },
  });

  if (!load) return null;

  const scope = await getUserTeamScope(user);
  if (!scope.canSeeAllTeams) {
    let assignment = await prisma.teamAssignment.findFirst({
      where: { orgId: user.orgId, entityType: TeamEntityType.LOAD, entityId: load.id },
    });
    if (!assignment && scope.defaultTeamId) {
      assignment = await ensureEntityAssignedToDefaultTeam(user.orgId, TeamEntityType.LOAD, load.id, scope.defaultTeamId);
    }
    if (assignment && !scope.teamIds.includes(assignment.teamId)) {
      return null;
    }
  }

  if (load.stops.length === 0) {
    return {
      loadId: load.id,
      orgId: load.orgId,
      modelVersion: ASSIST_MODEL_VERSION,
      weightsVersion: ASSIST_WEIGHTS_VERSION,
      generatedAt: new Date().toISOString(),
      suggestions: [],
    };
  }

  const pickupStop = load.stops.find((stop) => stop.type === StopType.PICKUP) ?? load.stops[0];
  const deliveryStop = load.stops.slice().reverse().find((stop) => stop.type === StopType.DELIVERY) ?? load.stops[load.stops.length - 1];

  const pickupCoords =
    pickupStop?.lat !== null && pickupStop?.lat !== undefined && pickupStop?.lng !== null && pickupStop?.lng !== undefined
      ? { lat: pickupStop.lat, lng: pickupStop.lng }
      : null;

  let scopedDriverIds: string[] | null = null;
  let scopedTruckIds: string[] | null = null;

  if (!scope.canSeeAllTeams && scope.defaultTeamId) {
    await Promise.all([
      ensureTeamAssignmentsForEntityType(user.orgId, TeamEntityType.DRIVER, scope.defaultTeamId),
      ensureTeamAssignmentsForEntityType(user.orgId, TeamEntityType.TRUCK, scope.defaultTeamId),
    ]);
    [scopedDriverIds, scopedTruckIds] = await Promise.all([
      getScopedEntityIds(user.orgId, TeamEntityType.DRIVER, scope),
      getScopedEntityIds(user.orgId, TeamEntityType.TRUCK, scope),
    ]);
  }

  const [drivers, trucks, activeAssignments] = await Promise.all([
    prisma.driver.findMany({
      where: { orgId: user.orgId, id: { in: scopedDriverIds ?? undefined } },
      select: { id: true, name: true, status: true },
    }),
    includeTrucks
      ? prisma.truck.findMany({
          where: { orgId: user.orgId, id: { in: scopedTruckIds ?? undefined } },
          select: { id: true, unit: true, status: true },
        })
      : Promise.resolve([]),
    prisma.load.findMany({
      where: {
        orgId: user.orgId,
        id: { not: load.id },
        status: { notIn: [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED] },
        OR: [{ assignedDriverId: { not: null } }, { truckId: { not: null } }],
      },
      select: { assignedDriverId: true, truckId: true },
    }),
  ]);

  const activeDriverIds = new Set(activeAssignments.map((row) => row.assignedDriverId).filter(Boolean) as string[]);
  const activeTruckIds = new Set(activeAssignments.map((row) => row.truckId).filter(Boolean) as string[]);

  const availableDrivers = drivers.filter((driver) => driver.status === DriverStatus.AVAILABLE && !activeDriverIds.has(driver.id));
  const availableTrucks = trucks.filter((truck) => truck.status === TruckStatus.AVAILABLE && !activeTruckIds.has(truck.id));

  if (availableDrivers.length === 0) {
    return {
      loadId: load.id,
      orgId: load.orgId,
      modelVersion: ASSIST_MODEL_VERSION,
      weightsVersion: ASSIST_WEIGHTS_VERSION,
      generatedAt: new Date().toISOString(),
      suggestions: [],
    };
  }

  const driverIds = availableDrivers.map((driver) => driver.id);
  const truckIds = availableTrucks.map((truck) => truck.id);

  const [driverPings, truckPings, lastAssignments, driverStats, historyLoads] = await Promise.all([
    prisma.locationPing.findMany({
      where: { orgId: user.orgId, driverId: { in: driverIds } },
      orderBy: { capturedAt: "desc" },
      distinct: ["driverId"],
      select: { driverId: true, lat: true, lng: true, capturedAt: true },
    }),
    includeTrucks && truckIds.length
      ? prisma.locationPing.findMany({
          where: { orgId: user.orgId, truckId: { in: truckIds } },
          orderBy: { capturedAt: "desc" },
          distinct: ["truckId"],
          select: { truckId: true, lat: true, lng: true, capturedAt: true },
        })
      : Promise.resolve([]),
    includeTrucks
      ? prisma.load.findMany({
          where: { orgId: user.orgId, assignedDriverId: { in: driverIds }, truckId: { not: null } },
          orderBy: { assignedDriverAt: "desc" },
          distinct: ["assignedDriverId"],
          select: { assignedDriverId: true, truckId: true },
        })
      : Promise.resolve([]),
    prisma.driverStats.findMany({
      where: { orgId: user.orgId, driverId: { in: driverIds }, windowDays: 30 },
      select: { driverId: true, onTimeRate: true },
    }),
    prisma.load.findMany({
      where: { orgId: user.orgId, assignedDriverId: { in: driverIds }, deliveredAt: { not: null } },
      select: { id: true, assignedDriverId: true, truckId: true, deliveredAt: true, createdAt: true },
      orderBy: { deliveredAt: "desc" },
      take: 500,
    }),
  ]);

  const driverPingMap = new Map(driverPings.map((ping) => [ping.driverId, ping]));
  const truckPingMap = new Map(truckPings.map((ping) => [ping.truckId, ping]));
  const lastTruckMap = new Map(lastAssignments.map((row) => [row.assignedDriverId, row.truckId]));
  const driverStatsMap = new Map(driverStats.map((stat) => [stat.driverId, stat.onTimeRate ?? null]));

  const historyStops = historyLoads.length
    ? await prisma.stop.findMany({
        where: { orgId: user.orgId, loadId: { in: historyLoads.map((row) => row.id) } },
        select: { loadId: true, type: true, city: true, state: true, sequence: true },
      })
    : [];

  const stopsByLoad = new Map<string, typeof historyStops>();
  for (const stop of historyStops) {
    const existing = stopsByLoad.get(stop.loadId) ?? [];
    existing.push(stop);
    stopsByLoad.set(stop.loadId, existing);
  }

  const targetLaneKey = laneKey(pickupStop, deliveryStop);
  const targetLaneLabel = buildLaneLabel(pickupStop, deliveryStop);

  const laneCountByDriver = new Map<string, number>();
  const pairCountByDriver = new Map<string, Map<string, number>>();
  const recentLoadCountByDriver = new Map<string, number>();
  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const loadRow of historyLoads) {
    if (!loadRow.assignedDriverId) continue;
    const stops = stopsByLoad.get(loadRow.id) ?? [];
    const pickup = stops.find((stop) => stop.type === StopType.PICKUP) ?? stops[0];
    const delivery = stops.slice().reverse().find((stop) => stop.type === StopType.DELIVERY) ?? stops[stops.length - 1];
    const key = laneKey(pickup, delivery);
    if (key && targetLaneKey && key === targetLaneKey) {
      laneCountByDriver.set(loadRow.assignedDriverId, (laneCountByDriver.get(loadRow.assignedDriverId) ?? 0) + 1);
    }
    if (loadRow.truckId) {
      const driverMap = pairCountByDriver.get(loadRow.assignedDriverId) ?? new Map<string, number>();
      driverMap.set(loadRow.truckId, (driverMap.get(loadRow.truckId) ?? 0) + 1);
      pairCountByDriver.set(loadRow.assignedDriverId, driverMap);
    }
    if (loadRow.createdAt && loadRow.createdAt.getTime() >= recentCutoff) {
      recentLoadCountByDriver.set(loadRow.assignedDriverId, (recentLoadCountByDriver.get(loadRow.assignedDriverId) ?? 0) + 1);
    }
  }

  const suggestions: AssignmentSuggestion[] = [];
  for (const driver of availableDrivers) {
    const suggestedTruckId = includeTrucks ? lastTruckMap.get(driver.id) ?? null : null;
    const suggestedTruck = suggestedTruckId
      ? availableTrucks.find((truck) => truck.id === suggestedTruckId) ?? null
      : null;

    const ping = driverPingMap.get(driver.id) ?? (suggestedTruck ? truckPingMap.get(suggestedTruck.id) : undefined);
    const pingAgeMinutes = ping?.capturedAt ? (Date.now() - new Date(ping.capturedAt).getTime()) / (1000 * 60) : null;

    const distanceMiles = pickupCoords && ping ? haversineMiles(pickupCoords, { lat: Number(ping.lat), lng: Number(ping.lng) }) : null;

    const laneCount = laneCountByDriver.get(driver.id) ?? 0;
    const pairCount = suggestedTruck ? pairCountByDriver.get(driver.id)?.get(suggestedTruck.id) ?? 0 : 0;
    const recentLoadCount = recentLoadCountByDriver.get(driver.id) ?? 0;

    const suggestion = scoreSuggestion({
      driverId: driver.id,
      truckId: suggestedTruck ? suggestedTruck.id : null,
      distanceMiles,
      pingAgeMinutes: pingAgeMinutes ?? null,
      onTimeRate: driverStatsMap.get(driver.id) ?? null,
      laneCount,
      pairCount,
      recentLoadCount,
      hosFeasible: null,
      appointmentStart: pickupStop?.appointmentStart ?? null,
      appointmentEnd: pickupStop?.appointmentEnd ?? null,
      pickupLabel: targetLaneLabel,
      truckLabel: suggestedTruck?.unit ?? null,
    });

    suggestions.push({
      ...suggestion,
      driverName: driver.name,
      truckUnit: suggestedTruck?.unit ?? null,
    });
  }

  suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.driverId.localeCompare(b.driverId);
  });

  const trimmed = suggestions.slice(0, limit).map((suggestion) =>
    explain
      ? suggestion
      : {
          ...suggestion,
          reasons: [],
          warnings: [],
        }
  );

  return {
    loadId: load.id,
    orgId: load.orgId,
    modelVersion: ASSIST_MODEL_VERSION,
    weightsVersion: ASSIST_WEIGHTS_VERSION,
    generatedAt: new Date().toISOString(),
    suggestions: trimmed,
  };
}

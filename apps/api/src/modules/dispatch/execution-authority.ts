import { LoadStatus, TripStatus } from "@truckerio/db";

export const LEGACY_EXECUTION_MUTATION_BLOCK_FIELDS = ["status", "movementMode"] as const;

export const LEGACY_EXECUTION_REJECTION_MESSAGE = {
  edit:
    "Direct load execution updates are disabled. Use trip assignment/status endpoints (/trips, /trips/:id/assign, /trips/:id/status).",
  assign: "Direct load assignment is disabled. Use trip assignment endpoints (/trips, /trips/:id/assign).",
  unassign: "Direct load unassign is disabled. Update or unassign the trip instead.",
} as const;

export type LoadExecutionMirrorSnapshot = {
  status: LoadStatus;
  assignedDriverId: string | null;
  truckId: string | null;
  trailerId: string | null;
  assignedDriverAt: Date | null;
  assignedTruckAt: Date | null;
  assignedTrailerAt: Date | null;
};

type BuildLoadExecutionMirrorStateParams = {
  load: LoadExecutionMirrorSnapshot;
  driverId?: string | null;
  truckId?: string | null;
  trailerId?: string | null;
  tripStatus?: TripStatus | null;
  now: Date;
};

export function getBlockedLoadExecutionMutationFields(payload: Record<string, unknown>) {
  return LEGACY_EXECUTION_MUTATION_BLOCK_FIELDS.filter((field) => payload[field] !== undefined);
}

export function normalizeTripStatusForLoad(current: LoadStatus, tripStatus: TripStatus) {
  if (
    current === LoadStatus.DELIVERED ||
    current === LoadStatus.POD_RECEIVED ||
    current === LoadStatus.READY_TO_INVOICE ||
    current === LoadStatus.INVOICED ||
    current === LoadStatus.PAID ||
    current === LoadStatus.CANCELLED
  ) {
    return current;
  }
  if (tripStatus === TripStatus.PLANNED || tripStatus === TripStatus.CANCELLED) {
    return LoadStatus.PLANNED;
  }
  if (tripStatus === TripStatus.ASSIGNED) {
    return LoadStatus.ASSIGNED;
  }
  if (tripStatus === TripStatus.IN_TRANSIT || tripStatus === TripStatus.ARRIVED || tripStatus === TripStatus.COMPLETE) {
    return LoadStatus.IN_TRANSIT;
  }
  return current;
}

export function buildLoadExecutionMirrorState(params: BuildLoadExecutionMirrorStateParams): LoadExecutionMirrorSnapshot {
  const nextStatus = params.tripStatus
    ? normalizeTripStatusForLoad(params.load.status, params.tripStatus)
    : params.load.status;
  const nextDriverId = params.driverId ?? null;
  const nextTruckId = params.truckId ?? null;
  const nextTrailerId = params.trailerId ?? null;
  const nextAssignedDriverAt = nextDriverId
    ? params.load.assignedDriverId === nextDriverId
      ? params.load.assignedDriverAt ?? params.now
      : params.now
    : null;
  const nextAssignedTruckAt = nextTruckId
    ? params.load.truckId === nextTruckId
      ? params.load.assignedTruckAt ?? params.now
      : params.now
    : null;
  const nextAssignedTrailerAt = nextTrailerId
    ? params.load.trailerId === nextTrailerId
      ? params.load.assignedTrailerAt ?? params.now
      : params.now
    : null;
  return {
    status: nextStatus,
    assignedDriverId: nextDriverId,
    truckId: nextTruckId,
    trailerId: nextTrailerId,
    assignedDriverAt: nextAssignedDriverAt,
    assignedTruckAt: nextAssignedTruckAt,
    assignedTrailerAt: nextAssignedTrailerAt,
  };
}

export function isLoadExecutionMirrorEqual(a: LoadExecutionMirrorSnapshot, b: LoadExecutionMirrorSnapshot) {
  return (
    a.status === b.status &&
    a.assignedDriverId === b.assignedDriverId &&
    a.truckId === b.truckId &&
    a.trailerId === b.trailerId &&
    a.assignedDriverAt?.getTime() === b.assignedDriverAt?.getTime() &&
    a.assignedTruckAt?.getTime() === b.assignedTruckAt?.getTime() &&
    a.assignedTrailerAt?.getTime() === b.assignedTrailerAt?.getTime()
  );
}

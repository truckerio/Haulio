export type TripLoadRow = {
  id: string;
  sequence: number;
  load: {
    id: string;
    loadNumber: string;
    status: string;
    customerName?: string | null;
  };
};

export type TripLoadDetails = {
  palletCount?: number | null;
  weightLbs?: number | null;
  stops?: Array<{
    sequence?: number | null;
    name?: string | null;
    city?: string | null;
    state?: string | null;
    departedAt?: string | null;
  }>;
};

export type GroupedTripLoads = {
  key: string;
  label: string;
  loads: TripLoadRow[];
  pallets: number;
  weightLbs: number;
};

export function isLtlLikeMovementMode(mode?: string | null) {
  return mode === "LTL" || mode === "POOL_DISTRIBUTION";
}

function findNextStop(details?: TripLoadDetails | null) {
  if (!details?.stops?.length) return null;
  return (
    details.stops.find((stop) => !stop.departedAt) ??
    details.stops
      .slice()
      .sort((left, right) => Number(left.sequence ?? 0) - Number(right.sequence ?? 0))[0] ??
    null
  );
}

export function buildGroupedTripLoads(params: {
  movementMode?: string | null;
  loads: TripLoadRow[];
  loadDetails: Record<string, TripLoadDetails>;
}): GroupedTripLoads[] {
  const ltlLike = isLtlLikeMovementMode(params.movementMode);
  const groups = new Map<string, GroupedTripLoads>();
  for (const row of params.loads) {
    const details = params.loadDetails[row.load.id];
    const nextStop = findNextStop(details);
    const label = ltlLike
      ? nextStop
        ? `${nextStop.name ?? "Next stop"} · ${nextStop.city ?? "-"}${nextStop.state ? `, ${nextStop.state}` : ""}`
        : "Unscheduled next stop"
      : "Loads";
    const current = groups.get(label) ?? {
      key: label,
      label,
      loads: [],
      pallets: 0,
      weightLbs: 0,
    };
    current.loads.push(row);
    current.pallets += Number(details?.palletCount ?? 0) || 0;
    current.weightLbs += Number(details?.weightLbs ?? 0) || 0;
    groups.set(label, current);
  }

  return Array.from(groups.values()).sort((left, right) => left.label.localeCompare(right.label));
}


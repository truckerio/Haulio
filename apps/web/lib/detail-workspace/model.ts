import { apiFetch } from "@/lib/api";
import type {
  DetailAccessorial,
  DetailBlocker,
  DetailCommandMatrix,
  DetailDoc,
  DetailEtaRow,
  DetailLens,
  DetailLoad,
  DetailNextAction,
  DetailNowSnapshot,
  DetailStop,
  DetailTimelineEntry,
  DetailTrip,
  DetailWorkspaceModel,
  LineagePartialGroup,
} from "./types";

type RawStop = {
  id: string;
  sequence?: number | null;
  type?: string | null;
  status?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  appointmentStart?: string | null;
  appointmentEnd?: string | null;
  arrivedAt?: string | null;
  departedAt?: string | null;
  delayReason?: string | null;
  delayNotes?: string | null;
};

type RawLoad = {
  id: string;
  loadNumber: string;
  status: string;
  movementMode?: string | null;
  customerName?: string | null;
  customerRef?: string | null;
  palletCount?: number | null;
  weightLbs?: number | null;
  miles?: number | null;
  paidMiles?: number | null;
  rate?: string | number | null;
  billingStatus?: string | null;
  driver?: { name?: string | null } | null;
  truck?: { unit?: string | null } | null;
  trailer?: { unit?: string | null } | null;
  operatingEntity?: { name?: string | null } | null;
  stops?: RawStop[];
  docs?: Array<{
    id: string;
    type?: string | null;
    status?: string | null;
    uploadedAt?: string | null;
    stopId?: string | null;
    filename?: string | null;
    originalName?: string | null;
    rejectReason?: string | null;
  }>;
  accessorials?: Array<{ id: string; type?: string | null; status?: string | null; amount?: string | number | null }>;
  invoices?: Array<{ id: string; invoiceNumber?: string | null; status?: string | null; generatedAt?: string | null }>;
  loadNotes?: Array<{ id: string; body?: string | null; text?: string | null; priority?: string | null; createdAt?: string | null }>;
};

type TripLoadRow = {
  load: {
    id: string;
    loadNumber: string;
  };
};

type TripPayload = {
  trip: {
    id: string;
    tripNumber: string;
    status: string;
    movementMode?: string | null;
    origin?: string | null;
    destination?: string | null;
    plannedDepartureAt?: string | null;
    plannedArrivalAt?: string | null;
    driver?: { name?: string | null } | null;
    truck?: { unit?: string | null } | null;
    trailer?: { unit?: string | null } | null;
    loads?: TripLoadRow[];
  };
};

type LoadPayload = { load: RawLoad };

type ShipmentPayload = {
  shipment: {
    id?: string;
    load?: RawLoad;
    trip?: {
      id: string;
      tripNumber: string;
      status: string;
      movementMode?: string | null;
      origin?: string | null;
      destination?: string | null;
      plannedDepartureAt?: string | null;
      plannedArrivalAt?: string | null;
      driver?: { name?: string | null } | null;
      truck?: { unit?: string | null } | null;
      trailer?: { unit?: string | null } | null;
    } | null;
  };
};

type TimelinePayload = {
  timeline?: Array<{
    id: string;
    kind?: string;
    type?: string;
    message?: string;
    timestamp?: string;
    time?: string;
  }>;
};

function toTrip(raw: ShipmentPayload["shipment"]["trip"] | TripPayload["trip"] | null | undefined): DetailTrip | null {
  if (!raw) return null;
  return {
    id: raw.id,
    tripNumber: raw.tripNumber,
    status: raw.status,
    movementMode: raw.movementMode ?? null,
    origin: raw.origin ?? null,
    destination: raw.destination ?? null,
    plannedDepartureAt: raw.plannedDepartureAt ?? null,
    plannedArrivalAt: raw.plannedArrivalAt ?? null,
    driverName: raw.driver?.name ?? null,
    truckUnit: raw.truck?.unit ?? null,
    trailerUnit: raw.trailer?.unit ?? null,
  };
}

function toStops(load: RawLoad): DetailStop[] {
  return (load.stops ?? [])
    .slice()
    .sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
    .map((stop) => ({
      id: stop.id,
      loadId: load.id,
      loadNumber: load.loadNumber,
      sequence: Number(stop.sequence ?? 0),
      type: stop.type ?? "STOP",
      status: stop.status ?? null,
      name: stop.name ?? null,
      address: stop.address ?? null,
      city: stop.city ?? null,
      state: stop.state ?? null,
      zip: stop.zip ?? null,
      appointmentStart: stop.appointmentStart ?? null,
      appointmentEnd: stop.appointmentEnd ?? null,
      arrivedAt: stop.arrivedAt ?? null,
      departedAt: stop.departedAt ?? null,
      delayReason: stop.delayReason ?? null,
      delayNotes: stop.delayNotes ?? null,
    }));
}

function toDocs(load: RawLoad): DetailDoc[] {
  return (load.docs ?? []).map((doc) => ({
    id: doc.id,
    loadId: load.id,
    loadNumber: load.loadNumber,
    type: doc.type ?? "DOC",
    status: doc.status ?? null,
    uploadedAt: doc.uploadedAt ?? null,
    stopId: doc.stopId ?? null,
    filename: doc.originalName ?? doc.filename ?? null,
    rejectReason: doc.rejectReason ?? null,
  }));
}

function toAccessorials(load: RawLoad): DetailAccessorial[] {
  return (load.accessorials ?? []).map((item) => ({
    id: item.id,
    loadId: load.id,
    loadNumber: load.loadNumber,
    type: item.type ?? null,
    status: item.status ?? null,
    amount: item.amount ?? null,
  }));
}

function toLoad(load: RawLoad): DetailLoad {
  return {
    id: load.id,
    loadNumber: load.loadNumber,
    status: load.status,
    movementMode: load.movementMode ?? null,
    customerName: load.customerName ?? null,
    customerRef: load.customerRef ?? null,
    palletCount: load.palletCount ?? null,
    weightLbs: load.weightLbs ?? null,
    miles: load.miles ?? null,
    paidMiles: load.paidMiles ?? null,
    rate: load.rate ?? null,
    billingStatus: load.billingStatus ?? null,
    driverName: load.driver?.name ?? null,
    truckUnit: load.truck?.unit ?? null,
    trailerUnit: load.trailer?.unit ?? null,
    operatingEntityName: load.operatingEntity?.name ?? null,
    notes: (load.loadNotes ?? []).map((note) => ({
      id: note.id,
      body: note.body ?? note.text ?? "",
      priority: note.priority ?? null,
      createdAt: note.createdAt ?? null,
    })),
    stops: toStops(load),
    docs: toDocs(load),
    accessorials: toAccessorials(load),
    invoices: (load.invoices ?? []).map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber ?? null,
      status: invoice.status ?? null,
      generatedAt: invoice.generatedAt ?? null,
    })),
  };
}

function getStopEta(stop: DetailStop): string | null {
  return stop.arrivedAt ?? stop.departedAt ?? stop.appointmentStart ?? stop.appointmentEnd ?? null;
}

function toEtaRows(loads: DetailLoad[]): DetailEtaRow[] {
  const rows: DetailEtaRow[] = [];
  for (const load of loads) {
    for (const stop of load.stops) {
      rows.push({
        loadId: load.id,
        loadNumber: load.loadNumber,
        stopId: stop.id,
        stopType: stop.type,
        stopName: stop.name ?? null,
        city: stop.city ?? null,
        state: stop.state ?? null,
        eta: getStopEta(stop),
        appointmentStart: stop.appointmentStart ?? null,
        appointmentEnd: stop.appointmentEnd ?? null,
        arrivedAt: stop.arrivedAt ?? null,
        departedAt: stop.departedAt ?? null,
      });
    }
  }
  return rows;
}

function lineageBase(loadNumber: string) {
  const trimmed = loadNumber.trim();
  const match = trimmed.match(/^(.*?)([A-Za-z])$/);
  return match ? match[1] : trimmed;
}

function toPartialGroups(loads: DetailLoad[]): LineagePartialGroup[] {
  const groups = new Map<string, Array<{ loadId: string; loadNumber: string }>>();
  for (const load of loads) {
    const key = lineageBase(load.loadNumber);
    const list = groups.get(key) ?? [];
    list.push({ loadId: load.id, loadNumber: load.loadNumber });
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, loads: rows }));
}

function mapTimelineEntries(payload: TimelinePayload | null): DetailTimelineEntry[] {
  if (!payload?.timeline) return [];
  return payload.timeline.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    type: entry.type,
    message: entry.message,
    time: entry.timestamp ?? entry.time,
  }));
}

function mergeNotes(loads: DetailLoad[]) {
  const items: DetailWorkspaceModel["notes"] = [];
  for (const load of loads) {
    for (const note of load.notes) {
      if (!note.body) continue;
      items.push({
        id: note.id,
        text: note.body,
        priority: note.priority ?? null,
        createdAt: note.createdAt ?? null,
        sourceLoadNumber: load.loadNumber,
      });
    }
  }
  return items.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

function dedupeLoads(loads: DetailLoad[]) {
  const map = new Map<string, DetailLoad>();
  for (const load of loads) {
    map.set(load.id, load);
  }
  return Array.from(map.values());
}

async function fetchLoadById(loadId: string): Promise<DetailLoad | null> {
  try {
    const payload = await apiFetch<LoadPayload>(`/loads/${loadId}`);
    return toLoad(payload.load);
  } catch {
    return null;
  }
}

async function fetchTripAndLoads(tripId: string) {
  const tripPayload = await apiFetch<TripPayload>(`/trips/${tripId}`);
  const trip = toTrip(tripPayload.trip);
  const loadIds = (tripPayload.trip.loads ?? []).map((row) => row.load.id);
  const details = await Promise.all(loadIds.map((loadId) => fetchLoadById(loadId)));
  const loads = details.filter((item): item is DetailLoad => Boolean(item));
  return { trip, loads };
}

function deriveHandoffStage(loads: DetailLoad[]): DetailWorkspaceModel["handoffStage"] {
  const statuses = new Set(loads.map((load) => String(load.status ?? "").toUpperCase()));
  const billing = new Set(loads.map((load) => String(load.billingStatus ?? "").toUpperCase()));
  if (billing.has("SETTLED")) return "SETTLED";
  if (statuses.has("PAID")) return "COLLECTED";
  if (statuses.has("INVOICED") || billing.has("INVOICED")) return "INVOICED";
  if (statuses.has("READY_TO_INVOICE") || billing.has("READY")) return "READY";
  if (statuses.has("POD_RECEIVED") || statuses.has("DELIVERED")) return "DOCS_REVIEW";
  return "DELIVERED";
}

function deriveNowSnapshot(trip: DetailTrip | null, primaryLoad: DetailLoad): DetailNowSnapshot {
  if (trip) {
    return {
      label: `${trip.tripNumber} · ${trip.status}`,
      subtitle: `${trip.origin ?? "-"} → ${trip.destination ?? "-"}`,
    };
  }
  return {
    label: `${primaryLoad.loadNumber} · ${primaryLoad.status}`,
    subtitle: `${primaryLoad.customerName ?? "-"}`,
  };
}

function deriveBlockers(loads: DetailLoad[]): DetailBlocker[] {
  const blockers: DetailBlocker[] = [];

  const unassigned = loads.filter((load) => !load.driverName || !load.truckUnit || !load.trailerUnit);
  if (unassigned.length) {
    blockers.push({
      code: "ASSIGNMENT_MISSING",
      label: `${unassigned.length} load(s) missing driver/truck/trailer`,
      severity: "danger",
      hint: "Assign resources before execution moves forward.",
    });
  }

  const missingPod = loads.filter((load) => !load.docs.some((doc) => doc.type === "POD"));
  if (missingPod.length) {
    blockers.push({
      code: "POD_MISSING",
      label: `${missingPod.length} load(s) missing POD`,
      severity: "warning",
      hint: "Upload POD in Documents tab.",
    });
  }

  const pendingVerification = loads.filter((load) =>
    load.docs.some((doc) => (doc.type === "POD" || doc.type === "BOL" || doc.type === "RATECON" || doc.type === "RATE_CONFIRMATION") && doc.status !== "VERIFIED")
  );
  if (pendingVerification.length) {
    blockers.push({
      code: "DOCS_PENDING_VERIFICATION",
      label: `${pendingVerification.length} load(s) have unverified docs`,
      severity: "info",
      hint: "Verify or reject docs before invoicing.",
    });
  }

  const pendingAccessorial = loads.filter((load) =>
    load.accessorials.some((item) => item.status && !["APPROVED", "POSTED", "PAID"].includes(String(item.status).toUpperCase()))
  );
  if (pendingAccessorial.length) {
    blockers.push({
      code: "ACCESSORIAL_REVIEW",
      label: `${pendingAccessorial.length} load(s) have accessorials pending review`,
      severity: "warning",
      hint: "Review accessorials before billing handoff.",
    });
  }

  return blockers;
}

function deriveNextAction(args: {
  blockers: DetailBlocker[];
  handoffStage: DetailWorkspaceModel["handoffStage"];
  lens: DetailLens;
  primaryLoadId: string;
  tripId: string | null;
}): DetailNextAction {
  if (args.blockers.some((item) => item.code === "ASSIGNMENT_MISSING")) {
    return { key: "assign", label: "Assign resources", reason: "Loads need driver/truck/trailer." };
  }
  if (args.blockers.some((item) => item.code === "POD_MISSING")) {
    return { key: "uploadPod", label: "Upload POD", reason: "POD is required for finance handoff." };
  }
  if (args.blockers.some((item) => item.code === "DOCS_PENDING_VERIFICATION")) {
    return { key: "verifyDocs", label: "Verify docs", reason: "Document packet is still pending." };
  }
  if (args.handoffStage === "READY" || args.handoffStage === "INVOICED") {
    return {
      key: "openReceivables",
      label: "Open receivables",
      href: `/finance?tab=receivables&search=${encodeURIComponent(args.primaryLoadId)}`,
    };
  }
  if (args.tripId && args.lens === "trip") {
    return { key: "optimizeTrip", label: "Optimize trip", reason: "Sync cargo plan and lane grouping." };
  }
  return { key: "timeline", label: "Review timeline", reason: "No blocking issues detected." };
}

function deriveCommandState(args: {
  loads: DetailLoad[];
  trip: DetailTrip | null;
  blockers: DetailBlocker[];
  handoffStage: DetailWorkspaceModel["handoffStage"];
}): DetailCommandMatrix {
  const docs = args.loads.flatMap((load) => load.docs);
  const stops = args.loads.flatMap((load) => load.stops);
  const hasDocs = docs.length > 0;
  const hasVerifiableDocs = docs.some((doc) => doc.status !== "VERIFIED");
  const hasRejectableDocs = docs.some((doc) => doc.status !== "REJECTED");
  const hasStops = stops.length > 0;
  const hasTrip = Boolean(args.trip?.id);

  return {
    assign: { enabled: args.loads.length > 0 },
    updateStop: { enabled: hasStops },
    message: { enabled: args.loads.length > 0 },
    uploadPod: { enabled: args.loads.length > 0 },
    verifyDocs: { enabled: hasDocs && hasVerifiableDocs, reason: hasDocs ? null : "No documents uploaded yet." },
    rejectDocs: { enabled: hasDocs && hasRejectableDocs, reason: hasDocs ? null : "No documents uploaded yet." },
    dispatchPack: { enabled: args.loads.length > 0 },
    openInspector: { enabled: true },
    openReceivables: {
      enabled: ["READY", "INVOICED", "COLLECTED", "SETTLED"].includes(args.handoffStage),
      reason: "Finance handoff becomes available after docs/commercial readiness.",
    },
    openBillingPreflight: { enabled: args.loads.length > 0 },
    openPayablesContext: { enabled: args.loads.length > 0 },
    optimizeTrip: { enabled: hasTrip, reason: "Trip required." },
    copyShipmentLink: { enabled: true },
    openTrip: { enabled: hasTrip, reason: "No linked trip." },
  };
}

function buildWorkspaceModel(args: {
  lens: DetailLens;
  entityId: string;
  primaryLoad: DetailLoad;
  trip: DetailTrip | null;
  loads: DetailLoad[];
  timeline: DetailTimelineEntry[];
}): DetailWorkspaceModel {
  const dedupedLoads = dedupeLoads(args.loads);
  const pickups = dedupedLoads.flatMap((load) => load.stops.filter((stop) => stop.type === "PICKUP"));
  const deliveries = dedupedLoads.flatMap((load) => load.stops.filter((stop) => stop.type === "DELIVERY"));
  const partialGroups = toPartialGroups(dedupedLoads);
  const blockers = deriveBlockers(dedupedLoads);
  const handoffStage = deriveHandoffStage(dedupedLoads);

  return {
    lens: args.lens,
    entityId: args.entityId,
    entityLabel: args.lens === "trip" ? "Trip" : args.lens === "shipment" ? "Shipment" : "Load",
    entityNumber: args.lens === "trip" ? args.trip?.tripNumber ?? args.entityId : args.primaryLoad.loadNumber,
    customerRef: args.primaryLoad.customerRef ?? null,
    brokerName: args.primaryLoad.customerName ?? null,
    status: args.lens === "trip" ? args.trip?.status ?? null : args.primaryLoad.status,
    movementMode: args.lens === "trip" ? args.trip?.movementMode ?? null : args.primaryLoad.movementMode ?? null,
    primaryLoadId: args.primaryLoad.id,
    primaryLoadNumber: args.primaryLoad.loadNumber,
    trip: args.trip,
    loads: dedupedLoads,
    pickups,
    deliveries,
    etaRows: toEtaRows(dedupedLoads),
    partialGroups,
    timeline: args.timeline,
    notes: mergeNotes(dedupedLoads),
    now: deriveNowSnapshot(args.trip, args.primaryLoad),
    blockers,
    nextAction: deriveNextAction({
      blockers,
      handoffStage,
      lens: args.lens,
      primaryLoadId: args.primaryLoad.id,
      tripId: args.trip?.id ?? null,
    }),
    handoffStage,
    commandState: deriveCommandState({
      loads: dedupedLoads,
      trip: args.trip,
      blockers,
      handoffStage,
    }),
  };
}

export async function fetchDetailWorkspaceModel(lens: DetailLens, entityId: string): Promise<DetailWorkspaceModel> {
  if (lens === "trip") {
    const [{ trip, loads }, timelinePayload] = await Promise.all([
      fetchTripAndLoads(entityId),
      apiFetch<TimelinePayload>(`/timeline?entityType=TRIP&entityId=${encodeURIComponent(entityId)}`).catch(() => null),
    ]);

    const primaryLoad = loads[0] ?? {
      id: entityId,
      loadNumber: entityId,
      status: trip?.status ?? "PLANNED",
      notes: [],
      stops: [],
      docs: [],
      accessorials: [],
      invoices: [],
    };

    return buildWorkspaceModel({
      lens,
      entityId,
      primaryLoad,
      trip,
      loads,
      timeline: mapTimelineEntries(timelinePayload),
    });
  }

  const [loadPayload, shipmentPayload] = await Promise.all([
    apiFetch<LoadPayload>(`/loads/${entityId}`),
    apiFetch<ShipmentPayload>(`/shipments/${entityId}`).catch(() => null),
  ]);

  const primaryLoad = toLoad(shipmentPayload?.shipment?.load ?? loadPayload.load);
  let trip = toTrip(shipmentPayload?.shipment?.trip ?? null);
  let loads = [primaryLoad];

  if (trip?.id) {
    const tripBundle = await fetchTripAndLoads(trip.id).catch(() => null);
    if (tripBundle?.trip) trip = tripBundle.trip;
    if (tripBundle?.loads?.length) {
      loads = dedupeLoads([primaryLoad, ...tripBundle.loads]);
    }
  }

  const timelinePayload = await apiFetch<TimelinePayload>(
    `/timeline?entityType=LOAD&entityId=${encodeURIComponent(primaryLoad.id)}`
  ).catch(() => null);

  return buildWorkspaceModel({
    lens,
    entityId,
    primaryLoad,
    trip,
    loads,
    timeline: mapTimelineEntries(timelinePayload),
  });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return String(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parsed);
}

export function formatMiles(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(1)} mi`;
}

export function getLoadNextEta(load: DetailLoad) {
  const next =
    load.stops.find((stop) => !stop.departedAt) ??
    load.stops.slice().sort((a, b) => a.sequence - b.sequence)[0] ??
    null;
  if (!next) return null;
  return getStopEta(next);
}

export function isLoadPartial(load: DetailLoad, groups: LineagePartialGroup[]) {
  return groups.some((group) => group.loads.some((entry) => entry.loadId === load.id));
}

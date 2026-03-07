import { apiFetch } from "@/lib/api";
import type { DetailDoc, DetailLoad, DetailStop } from "@/lib/detail-workspace/types";

export type DetailAvailabilityDriver = {
  id: string;
  name?: string | null;
  reason?: string | null;
};

export type DetailAvailabilityEquipment = {
  id: string;
  unit?: string | null;
  reason?: string | null;
};

export type DetailAvailability = {
  availableDrivers: DetailAvailabilityDriver[];
  unavailableDrivers: DetailAvailabilityDriver[];
  availableTrucks: DetailAvailabilityEquipment[];
  unavailableTrucks: DetailAvailabilityEquipment[];
  availableTrailers: DetailAvailabilityEquipment[];
  unavailableTrailers: DetailAvailabilityEquipment[];
};

function routeLabel(city?: string | null, state?: string | null) {
  if (!city && !state) return "-";
  if (!state) return city ?? "-";
  if (!city) return state;
  return `${city}, ${state}`;
}

export async function fetchDispatchAvailability(loadId: string): Promise<DetailAvailability> {
  return apiFetch<DetailAvailability>(`/dispatch/availability?loadId=${encodeURIComponent(loadId)}`);
}

export async function assignTripResources(params: {
  tripId: string;
  driverId?: string | null;
  truckId?: string | null;
  trailerId?: string | null;
}) {
  await apiFetch(`/trips/${params.tripId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driverId: params.driverId ?? null,
      truckId: params.truckId ?? null,
      trailerId: params.trailerId ?? null,
      status: "ASSIGNED",
    }),
  });
}

export async function createTripWithLoad(params: {
  loadNumber: string;
  movementMode?: string | null;
  driverId?: string | null;
  truckId?: string | null;
  trailerId?: string | null;
}) {
  await apiFetch("/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "ASSIGNED",
      movementMode: params.movementMode ?? "FTL",
      loadNumbers: [params.loadNumber],
      driverId: params.driverId ?? null,
      truckId: params.truckId ?? null,
      trailerId: params.trailerId ?? null,
    }),
  });
}

export async function markStopArrived(loadId: string, stopId: string) {
  await apiFetch(`/loads/${loadId}/stops/${stopId}/arrive`, { method: "POST" });
}

export async function markStopDeparted(loadId: string, stopId: string) {
  await apiFetch(`/loads/${loadId}/stops/${stopId}/depart`, { method: "POST" });
}

export async function updateStopDelay(params: {
  stopId: string;
  delayReason?: "SHIPPER_DELAY" | "RECEIVER_DELAY" | "TRAFFIC" | "WEATHER" | "BREAKDOWN" | "OTHER" | null;
  delayNotes?: string | null;
}) {
  await apiFetch(`/stops/${params.stopId}/delay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      delayReason: params.delayReason ?? undefined,
      delayNotes: params.delayNotes ?? undefined,
    }),
  });
}

export async function postLoadMessage(params: {
  loadId: string;
  body: string;
  noteType: "INTERNAL" | "CUSTOMER_VISIBLE" | "OPERATIONAL";
  priority?: "LOW" | "NORMAL" | "IMPORTANT" | "ALERT";
}) {
  await apiFetch(`/loads/${params.loadId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      body: params.body,
      noteType: params.noteType,
      priority: params.priority ?? "NORMAL",
    }),
  });
}

export async function verifyDocument(docId: string) {
  await apiFetch(`/docs/${docId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requireSignature: true,
      requirePrintedName: true,
      requireDeliveryDate: true,
      pages: 10,
    }),
  });
}

export async function rejectDocument(docId: string, rejectReason: string) {
  await apiFetch(`/docs/${docId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rejectReason }),
  });
}

export async function optimizeTrip(tripId: string) {
  await apiFetch(`/trips/${tripId}/cargo-plan/sync`, { method: "POST" });
}

export async function createDispatchPack(load: DetailLoad, tripNumber?: string | null) {
  const pickup = load.stops.find((stop) => stop.type === "PICKUP");
  const delivery = load.stops.slice().reverse().find((stop) => stop.type === "DELIVERY");
  const podDoc = load.docs.find((doc) => doc.type === "POD");
  const bolDoc = load.docs.find((doc) => doc.type === "BOL");
  const rateConDoc = load.docs.find((doc) => doc.type === "RATECON" || doc.type === "RATE_CONFIRMATION");

  const body = [
    `Dispatch pack prepared for ${load.loadNumber}.`,
    `Trip: ${tripNumber ?? "Not linked"}`,
    `Lane: ${routeLabel(pickup?.city, pickup?.state)} -> ${routeLabel(delivery?.city, delivery?.state)}`,
    `Stops: ${load.stops.length}`,
    `Assignment: Driver ${load.driverName ?? "Unassigned"} · Truck ${load.truckUnit ?? "Unassigned"} · Trailer ${load.trailerUnit ?? "Unassigned"}`,
    `Docs: POD ${podDoc?.status ?? "MISSING"} · BOL ${bolDoc?.status ?? "MISSING"} · RateCon ${rateConDoc?.status ?? "MISSING"}`,
    "Generated from detail workspace.",
  ].join("\n");

  await postLoadMessage({
    loadId: load.id,
    body,
    noteType: "OPERATIONAL",
    priority: "IMPORTANT",
  });
}

export function findFirstActionableStop(loads: DetailLoad[]): DetailStop | null {
  for (const load of loads) {
    const stop = load.stops.find((item) => !item.departedAt);
    if (stop) return stop;
  }
  return loads.flatMap((load) => load.stops)[0] ?? null;
}

export function findFirstVerifiableDoc(loads: DetailLoad[]): DetailDoc | null {
  return loads
    .flatMap((load) => load.docs)
    .find((doc) => doc.status !== "VERIFIED" && (doc.type === "POD" || doc.type === "BOL" || doc.type === "RATECON" || doc.type === "RATE_CONFIRMATION")) ?? null;
}

export function findFirstRejectableDoc(loads: DetailLoad[]): DetailDoc | null {
  return loads
    .flatMap((load) => load.docs)
    .find((doc) => doc.status !== "REJECTED" && (doc.type === "POD" || doc.type === "BOL" || doc.type === "RATECON" || doc.type === "RATE_CONFIRMATION")) ?? null;
}

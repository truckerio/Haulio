"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NoAccess } from "@/components/rbac/no-access";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { Select } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { apiFetch } from "@/lib/api";

type TripStatus = "PLANNED" | "ASSIGNED" | "IN_TRANSIT" | "ARRIVED" | "COMPLETE" | "CANCELLED";
type MovementMode = "FTL" | "LTL" | "POOL_DISTRIBUTION";

type TripRecord = {
  id: string;
  tripNumber: string;
  status: TripStatus;
  movementMode: MovementMode;
  origin?: string | null;
  destination?: string | null;
  plannedDepartureAt?: string | null;
  plannedArrivalAt?: string | null;
  driverId?: string | null;
  truckId?: string | null;
  trailerId?: string | null;
  driver?: { id: string; name?: string | null } | null;
  truck?: { id: string; unit?: string | null } | null;
  trailer?: { id: string; unit?: string | null } | null;
  sourceManifest?: { id: string; status: string; origin?: string | null; destination?: string | null } | null;
  loads: Array<{
    id: string;
    loadId?: string;
    sequence: number;
    load: {
      id: string;
      loadNumber: string;
      status: string;
      customerName?: string | null;
    };
  }>;
};

type CargoPlanItem = {
  id: string;
  loadId: string;
  loadNumber: string;
  loadStatus?: string | null;
  customerName?: string | null;
  sequence?: number | null;
};

type CargoPlanPayload = {
  movementMode: MovementMode;
  canUseCargoPlan: boolean;
  canEdit: boolean;
  cargoPlan: {
    id: string;
    status: string;
    origin?: string | null;
    destination?: string | null;
    trailer?: { id: string; unit?: string | null } | null;
    truck?: { id: string; unit?: string | null } | null;
    driver?: { id: string; name?: string | null } | null;
    loadCount: number;
    items: CargoPlanItem[];
  } | null;
};

type AssetRecord = { id: string; name?: string | null; unit?: string | null };

const STATUS_OPTIONS: TripStatus[] = ["PLANNED", "ASSIGNED", "IN_TRANSIT", "ARRIVED", "COMPLETE", "CANCELLED"];
const MOVEMENT_OPTIONS: MovementMode[] = ["FTL", "LTL", "POOL_DISTRIBUTION"];

const statusTone = (status: TripStatus) => {
  if (status === "COMPLETE" || status === "ARRIVED") return "success" as const;
  if (status === "IN_TRANSIT") return "info" as const;
  if (status === "ASSIGNED") return "warning" as const;
  if (status === "CANCELLED") return "danger" as const;
  return "neutral" as const;
};

const isConsolidationMode = (mode: MovementMode) => mode === "LTL" || mode === "POOL_DISTRIBUTION";

export function TripsWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tripIdParam = searchParams.get("tripId");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(tripIdParam);
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [movementMode, setMovementMode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<AssetRecord[]>([]);
  const [trucks, setTrucks] = useState<AssetRecord[]>([]);
  const [trailers, setTrailers] = useState<AssetRecord[]>([]);
  const [savingAssign, setSavingAssign] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [addingLoads, setAddingLoads] = useState(false);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [newTripLoadNumbers, setNewTripLoadNumbers] = useState("");
  const [newTripMovementMode, setNewTripMovementMode] = useState<MovementMode>("FTL");
  const [assignForm, setAssignForm] = useState({ driverId: "", truckId: "", trailerId: "" });
  const [statusForm, setStatusForm] = useState<TripStatus>("PLANNED");
  const [addLoadsText, setAddLoadsText] = useState("");
  const [cargoPlanState, setCargoPlanState] = useState<CargoPlanPayload | null>(null);
  const [syncingCargoPlan, setSyncingCargoPlan] = useState(false);
  const [splittingLoadId, setSplittingLoadId] = useState<string | null>(null);

  const selectedTripSummary = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? selectedTrip,
    [trips, selectedTripId, selectedTrip]
  );
  const isConsolidationTrip = Boolean(
    selectedTripSummary &&
      (selectedTripSummary.movementMode === "LTL" || selectedTripSummary.movementMode === "POOL_DISTRIBUTION")
  );
  const cargoPlanDisabledReason = useMemo(() => {
    if (!isConsolidationTrip) return null;
    if (!cargoPlanState?.canEdit) return "Only Admin, Dispatcher, or Head Dispatcher can change cargo plans.";
    if (!selectedTripSummary?.trailerId) return "Assign a trailer to this trip before creating a cargo plan.";
    return null;
  }, [isConsolidationTrip, cargoPlanState?.canEdit, selectedTripSummary?.trailerId]);

  const syncTripParam = useCallback(
    (tripId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tripId) {
        params.set("tripId", tripId);
      } else {
        params.delete("tripId");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const loadTrips = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      if (movementMode) params.set("movementMode", movementMode);
      const query = params.toString();
      const payload = await apiFetch<{ trips: TripRecord[]; total: number }>(query ? `/trips?${query}` : "/trips");
      setTrips(payload.trips ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, status, movementMode]);

  const loadTripDetail = useCallback(async (tripId: string) => {
    const payload = await apiFetch<{ trip: TripRecord }>(`/trips/${tripId}`);
    setSelectedTrip(payload.trip);
    setAssignForm({
      driverId: payload.trip.driverId ?? "",
      truckId: payload.trip.truckId ?? "",
      trailerId: payload.trip.trailerId ?? "",
    });
    setStatusForm(payload.trip.status);
  }, []);

  const loadCargoPlan = useCallback(async (tripId: string) => {
    try {
      const payload = await apiFetch<CargoPlanPayload>(`/trips/${tripId}/cargo-plan`);
      setCargoPlanState(payload);
    } catch {
      setCargoPlanState(null);
    }
  }, []);

  useEffect(() => {
    apiFetch<{ user: { role?: string } }>("/auth/me")
      .then((payload) => {
        const role = payload.user?.role ?? "";
        setHasAccess(["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"].includes(role));
      })
      .catch(() => setHasAccess(false));
  }, []);

  useEffect(() => {
    if (!hasAccess) return;
    loadTrips();
  }, [hasAccess, loadTrips]);

  useEffect(() => {
    if (tripIdParam && tripIdParam !== selectedTripId) {
      setSelectedTripId(tripIdParam);
    }
    if (!tripIdParam && selectedTripId) {
      setSelectedTripId(null);
      setSelectedTrip(null);
      setCargoPlanState(null);
    }
  }, [tripIdParam, selectedTripId]);

  useEffect(() => {
    if (!selectedTripId || !hasAccess) return;
    Promise.all([loadTripDetail(selectedTripId), loadCargoPlan(selectedTripId)]).catch((err) =>
      setFormError((err as Error).message)
    );
  }, [selectedTripId, hasAccess, loadTripDetail, loadCargoPlan]);

  useEffect(() => {
    if (!hasAccess) return;
    Promise.all([
      apiFetch<{ drivers: AssetRecord[] }>("/assets/drivers"),
      apiFetch<{ trucks: AssetRecord[] }>("/assets/trucks"),
      apiFetch<{ trailers: AssetRecord[] }>("/assets/trailers"),
    ])
      .then(([driversPayload, trucksPayload, trailersPayload]) => {
        setDrivers(driversPayload.drivers ?? []);
        setTrucks(trucksPayload.trucks ?? []);
        setTrailers(trailersPayload.trailers ?? []);
      })
      .catch(() => {
        setDrivers([]);
        setTrucks([]);
        setTrailers([]);
      });
  }, [hasAccess]);

  const chooseTrip = (tripId: string) => {
    setSelectedTripId(tripId);
    syncTripParam(tripId);
  };

  const createTrip = async () => {
    setCreatingTrip(true);
    setFormError(null);
    setStatusNote(null);
    try {
      const loadNumbers = newTripLoadNumbers
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (!loadNumbers.length) {
        throw new Error("Enter at least one load number to create a trip.");
      }
      const payload = await apiFetch<{ trip: TripRecord }>("/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loadNumbers,
          movementMode: newTripMovementMode,
          status: "PLANNED",
        }),
      });
      setNewTripLoadNumbers("");
      setSelectedTripId(payload.trip.id);
      syncTripParam(payload.trip.id);
      await loadTrips();
      await loadTripDetail(payload.trip.id);
      await loadCargoPlan(payload.trip.id);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setCreatingTrip(false);
    }
  };

  const saveAssignment = async () => {
    if (!selectedTripId) return;
    setSavingAssign(true);
    setFormError(null);
    setStatusNote(null);
    try {
      await apiFetch(`/trips/${selectedTripId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: assignForm.driverId || null,
          truckId: assignForm.truckId || null,
          trailerId: assignForm.trailerId || null,
          status: statusForm,
        }),
      });
      await loadTrips();
      await loadTripDetail(selectedTripId);
      await loadCargoPlan(selectedTripId);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSavingAssign(false);
    }
  };

  const saveStatus = async () => {
    if (!selectedTripId) return;
    setSavingStatus(true);
    setFormError(null);
    setStatusNote(null);
    try {
      await apiFetch(`/trips/${selectedTripId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusForm }),
      });
      await loadTrips();
      await loadTripDetail(selectedTripId);
      await loadCargoPlan(selectedTripId);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSavingStatus(false);
    }
  };

  const addLoads = async () => {
    if (!selectedTripId) return;
    setAddingLoads(true);
    setFormError(null);
    setStatusNote(null);
    try {
      const loadNumbers = addLoadsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (!loadNumbers.length) {
        throw new Error("Enter at least one load number.");
      }
      await apiFetch(`/trips/${selectedTripId}/loads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loadNumbers }),
      });
      setAddLoadsText("");
      await loadTrips();
      await loadTripDetail(selectedTripId);
      await loadCargoPlan(selectedTripId);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setAddingLoads(false);
    }
  };

  const syncCargoPlan = async () => {
    if (!selectedTripId) return;
    setSyncingCargoPlan(true);
    setFormError(null);
    setStatusNote(null);
    try {
      const payload = await apiFetch<{ trip: TripRecord } & CargoPlanPayload>(`/trips/${selectedTripId}/cargo-plan/sync`, {
        method: "POST",
      });
      setSelectedTrip(payload.trip);
      setCargoPlanState({
        movementMode: payload.movementMode,
        canUseCargoPlan: payload.canUseCargoPlan,
        canEdit: payload.canEdit,
        cargoPlan: payload.cargoPlan,
      });
      await loadTrips();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSyncingCargoPlan(false);
    }
  };

  const splitTripLoad = async (loadId: string) => {
    if (!selectedTripId) return;
    setSplittingLoadId(loadId);
    setFormError(null);
    setStatusNote(null);
    try {
      const payload = await apiFetch<{ trip: TripRecord; splitTrip: TripRecord; splitLoadNumber: string }>(
        `/trips/${selectedTripId}/split-load`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loadId }),
        }
      );
      setSelectedTrip(payload.trip);
      await loadTrips();
      await loadTripDetail(selectedTripId);
      await loadCargoPlan(selectedTripId);
      setStatusNote(`Split ${payload.splitLoadNumber} into new trip ${payload.splitTrip.tripNumber}.`);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSplittingLoadId(null);
    }
  };

  if (hasAccess === false) {
    return <NoAccess title="No access to Trips" description="You do not have permission to view trips." />;
  }

  if (hasAccess === null) {
    return <EmptyState title="Loading trips..." description="Checking access and loading trip workspace." />;
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Create trip" subtitle="Create a trip from existing load numbers" />
      <Card className="grid gap-3 lg:grid-cols-[2fr_1fr_auto]">
        <FormField label="Load numbers" htmlFor="createTripLoadNumbers" hint="Comma separated e.g. LD-1001, LD-1002">
          <Input
            id="createTripLoadNumbers"
            value={newTripLoadNumbers}
            onChange={(event) => setNewTripLoadNumbers(event.target.value)}
            placeholder="LD-1001, LD-1002"
          />
        </FormField>
        <FormField label="Movement mode" htmlFor="createTripMovementMode">
          <Select
            id="createTripMovementMode"
            value={newTripMovementMode}
            onChange={(event) => setNewTripMovementMode(event.target.value as MovementMode)}
          >
            {MOVEMENT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex items-end">
          <Button onClick={createTrip} disabled={creatingTrip}>
            {creatingTrip ? "Creating..." : "Create trip"}
          </Button>
        </div>
      </Card>

      <SectionHeader title="Browse trips" subtitle="Filter and manage active or completed trips" />
      <Card className="grid gap-3 lg:grid-cols-4">
        <FormField label="Search" htmlFor="tripSearch">
          <Input
            id="tripSearch"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Trip #, load #, customer"
          />
        </FormField>
        <FormField label="Status" htmlFor="tripStatus">
          <Select id="tripStatus" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Movement mode" htmlFor="tripMovementMode">
          <Select
            id="tripMovementMode"
            value={movementMode}
            onChange={(event) => setMovementMode(event.target.value)}
          >
            <option value="">All movement modes</option>
            {MOVEMENT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex items-end gap-2">
          <Button variant="secondary" onClick={loadTrips} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSearch("");
              setStatus("");
              setMovementMode("");
            }}
          >
            Reset
          </Button>
        </div>
      </Card>

      {error ? (
        <Card className="border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] text-sm text-[color:var(--color-warning)]">
          {error}
        </Card>
      ) : null}
      {formError ? (
        <Card className="border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] text-sm text-[color:var(--color-warning)]">
          {formError}
        </Card>
      ) : null}
      {statusNote ? (
        <Card className="border border-[color:var(--color-success)] bg-[color:var(--color-success-soft)] text-sm text-[color:var(--color-success)]">
          {statusNote}
        </Card>
      ) : null}

      <div className={`grid gap-4 ${selectedTripId ? "lg:grid-cols-[minmax(380px,560px)_minmax(0,1fr)]" : ""}`}>
        <div className={selectedTripId ? "min-h-0 max-h-[calc(100dvh-26rem)] overflow-y-auto" : ""}>
          {loading ? (
            <Card className="text-sm text-[color:var(--color-text-muted)]">Loading trips...</Card>
          ) : trips.length === 0 ? (
            <EmptyState title="No trips found" description="Create a trip or adjust your filters." />
          ) : (
            <div className="grid gap-3">
              {trips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => chooseTrip(trip.id)}
                  className={`rounded-[var(--radius-card)] border px-4 py-3 text-left transition ${
                    trip.id === selectedTripId
                      ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]/20"
                      : "border-[color:var(--color-divider)] bg-white hover:bg-[color:var(--color-bg-muted)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-ink">{trip.tripNumber}</div>
                    <div className="flex items-center gap-2">
                      {isConsolidationMode(trip.movementMode) ? (
                        <StatusChip
                          label={trip.sourceManifest ? "Cargo linked" : "Cargo unlinked"}
                          tone={trip.sourceManifest ? "success" : "warning"}
                        />
                      ) : null}
                      <StatusChip label={trip.status} tone={statusTone(trip.status)} />
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    {trip.movementMode} · {trip.loads.length} load{trip.loads.length === 1 ? "" : "s"}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    {trip.driver?.name ?? "No driver"} · Truck {trip.truck?.unit ?? "-"} · Trailer {trip.trailer?.unit ?? "-"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedTripSummary ? (
          <div className="min-h-0 max-h-[calc(100dvh-26rem)] overflow-y-auto space-y-3">
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Trip</div>
                  <div className="text-lg font-semibold">{selectedTripSummary.tripNumber}</div>
                </div>
                <StatusChip label={selectedTripSummary.status} tone={statusTone(selectedTripSummary.status)} />
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <FormField label="Driver" htmlFor="tripAssignDriver">
                  <Select
                    id="tripAssignDriver"
                    value={assignForm.driverId}
                    onChange={(event) => setAssignForm((prev) => ({ ...prev, driverId: event.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name ?? "Driver"}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Truck" htmlFor="tripAssignTruck">
                  <Select
                    id="tripAssignTruck"
                    value={assignForm.truckId}
                    onChange={(event) => setAssignForm((prev) => ({ ...prev, truckId: event.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {trucks.map((truck) => (
                      <option key={truck.id} value={truck.id}>
                        {truck.unit ?? "Truck"}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Trailer" htmlFor="tripAssignTrailer">
                  <Select
                    id="tripAssignTrailer"
                    value={assignForm.trailerId}
                    onChange={(event) => setAssignForm((prev) => ({ ...prev, trailerId: event.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {trailers.map((trailer) => (
                      <option key={trailer.id} value={trailer.id}>
                        {trailer.unit ?? "Trailer"}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveAssignment} disabled={savingAssign}>
                  {savingAssign ? "Saving..." : "Save assignment"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/dispatch?loadId=${selectedTripSummary.loads[0]?.load.id ?? ""}`)}
                  disabled={!selectedTripSummary.loads.length}
                >
                  Open in dispatch
                </Button>
              </div>
            </Card>

            <Card className="space-y-3">
              <SectionHeader title="Trip status" subtitle="Trip controls all execution status for member loads" />
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <FormField label="Status" htmlFor="tripStatusUpdate">
                  <Select
                    id="tripStatusUpdate"
                    value={statusForm}
                    onChange={(event) => setStatusForm(event.target.value as TripStatus)}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <div className="flex items-end">
                  <Button onClick={saveStatus} disabled={savingStatus}>
                    {savingStatus ? "Updating..." : "Update status"}
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="space-y-3">
              <SectionHeader
                title={isConsolidationTrip ? "Combine loads" : "Add loads"}
                subtitle={
                  isConsolidationTrip
                    ? "Merge additional loads into this trip before dispatch starts"
                    : "Only allowed before trip dispatch starts"
                }
              />
              <div className="grid gap-3 lg:grid-cols-[2fr_auto]">
                <FormField label="Load numbers" htmlFor="tripAddLoads">
                  <Input
                    id="tripAddLoads"
                    value={addLoadsText}
                    onChange={(event) => setAddLoadsText(event.target.value)}
                    placeholder="LD-1007, LD-1008"
                  />
                </FormField>
                <div className="flex items-end">
                  <Button onClick={addLoads} disabled={addingLoads}>
                    {addingLoads ? "Adding..." : "Add loads"}
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="space-y-3">
              <SectionHeader
                title="Cargo plan"
                subtitle={
                  isConsolidationTrip
                    ? "Manifest data is embedded inside this trip"
                    : "FTL trips do not require an explicit cargo plan"
                }
              />
              {isConsolidationTrip ? (
                <>
                  {cargoPlanState?.cargoPlan ? (
                    <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2">
                      <div className="text-sm font-medium text-ink">
                        Plan {cargoPlanState.cargoPlan.id} · {cargoPlanState.cargoPlan.status}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        {cargoPlanState.cargoPlan.origin ?? "Origin"} {"->"} {cargoPlanState.cargoPlan.destination ?? "Destination"}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        Trailer {cargoPlanState.cargoPlan.trailer?.unit ?? "-"} · Truck {cargoPlanState.cargoPlan.truck?.unit ?? "-"} · Driver {cargoPlanState.cargoPlan.driver?.name ?? "-"}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-[color:var(--color-text-muted)]">
                      No cargo plan linked yet. Create one from the current trip loads.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={syncCargoPlan}
                      disabled={syncingCargoPlan || Boolean(cargoPlanDisabledReason)}
                    >
                      {syncingCargoPlan
                        ? "Syncing..."
                        : cargoPlanState?.cargoPlan
                          ? "Sync cargo plan"
                          : "Create cargo plan"}
                    </Button>
                  </div>
                  {cargoPlanDisabledReason ? (
                    <div className="text-xs text-[color:var(--color-text-muted)]">{cargoPlanDisabledReason}</div>
                  ) : null}
                  {cargoPlanState?.cargoPlan?.items?.length ? (
                    <div className="space-y-2">
                      {cargoPlanState.cargoPlan.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2"
                        >
                          <div className="text-sm">
                            <span className="font-medium">
                              #{item.sequence ?? "-"} {item.loadNumber}
                            </span>
                            <span className="ml-2 text-xs text-[color:var(--color-text-muted)]">
                              {item.loadStatus ?? "UNKNOWN"} · {item.customerName ?? "Customer"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-sm text-[color:var(--color-text-muted)]">
                  This trip is FTL. Cargo composition is managed directly by the trip load list.
                </div>
              )}
            </Card>

            <Card className="space-y-2">
              <SectionHeader title="Trip loads" subtitle="Execution follows trip order" />
              {selectedTripSummary.loads.length === 0 ? (
                <div className="text-sm text-[color:var(--color-text-muted)]">No loads attached yet.</div>
              ) : (
                selectedTripSummary.loads.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2"
                  >
                    <div className="text-sm">
                      <span className="font-medium">#{item.sequence}</span> {item.load.loadNumber}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {item.load.status} · {item.load.customerName ?? "Customer"}
                      </div>
                      {isConsolidationTrip && (cargoPlanState?.canEdit ?? false) && selectedTripSummary.loads.length > 1 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => splitTripLoad(item.load.id)}
                          disabled={splittingLoadId === item.load.id}
                        >
                          {splittingLoadId === item.load.id ? "Splitting..." : "Split out"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}

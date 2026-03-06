"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NoAccess } from "@/components/rbac/no-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import {
  TripSpreadsheetGrid,
  TRIP_FROZEN_COLUMNS,
  TRIP_GRID_COLUMNS,
  TRIP_OPTIONAL_COLUMNS,
  type TripGridColumnKey,
  type TripGridRow,
  type TripGridSortMode,
} from "@/components/dispatch/TripSpreadsheetGrid";
import {
  TRIPS_WORKSPACE_COLUMN_CATALOG,
  filterWorkspaceColumnCatalog,
} from "@/components/dispatch/workspace-column-registry";
import { apiFetch } from "@/lib/api";
import { getRoleCapabilities } from "@/lib/capabilities";
import { toneFromSemantic } from "@/lib/status-semantics";

type TripStatus = "PLANNED" | "ASSIGNED" | "IN_TRANSIT" | "ARRIVED" | "COMPLETE" | "CANCELLED";
type MovementMode = "FTL" | "LTL" | "POOL_DISTRIBUTION";

type TripRecord = {
  id: string;
  tripNumber: string;
  createdAt?: string;
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

function parseTripStatusParam(value: string | null) {
  if (!value) return "";
  return STATUS_OPTIONS.includes(value as TripStatus) ? value : "";
}

function parseMovementModeParam(value: string | null) {
  if (!value) return "";
  return MOVEMENT_OPTIONS.includes(value as MovementMode) ? value : "";
}

function parsePrimaryIdentifierParam(value: string | null): TripPrimaryIdentifier | null {
  if (value === "trip") return "trip";
  if (value === "load") return "load";
  return null;
}

const statusTone = (status: TripStatus) => {
  if (status === "COMPLETE" || status === "ARRIVED") return toneFromSemantic("complete");
  if (status === "IN_TRANSIT") return toneFromSemantic("info");
  if (status === "ASSIGNED") return toneFromSemantic("attention");
  if (status === "CANCELLED") return toneFromSemantic("blocked");
  return toneFromSemantic("neutral");
};

const isConsolidationMode = (mode: MovementMode) => mode === "LTL" || mode === "POOL_DISTRIBUTION";
type DetailTab = "assignment" | "status" | "cargo" | "loads";

const STATUS_SORT_WEIGHT: Record<TripStatus, number> = {
  PLANNED: 1,
  ASSIGNED: 2,
  IN_TRANSIT: 3,
  ARRIVED: 4,
  COMPLETE: 5,
  CANCELLED: 6,
};

function countActiveTripFilters(params: { search: string; status: string; movementMode: string }) {
  let count = 0;
  if (params.search.trim()) count += 1;
  if (params.status.trim()) count += 1;
  if (params.movementMode.trim()) count += 1;
  return count;
}

type TripPrimaryIdentifier = "trip" | "load";
const DEFAULT_TRIP_COLUMN_ORDER: TripGridColumnKey[] = TRIP_GRID_COLUMNS.map((column) => column.key);
const DEFAULT_TRIP_COLUMN_VISIBILITY: Partial<Record<TripGridColumnKey, boolean>> =
  TRIP_OPTIONAL_COLUMNS.reduce((acc, key) => ({ ...acc, [key]: true }), {});
type TripsWorkspacePreferences = {
  primaryIdentifier: TripPrimaryIdentifier;
  columnVisibility: Partial<Record<TripGridColumnKey, boolean>>;
  columnOrder: TripGridColumnKey[];
};

function normalizeTripColumnOrder(order?: TripGridColumnKey[]) {
  const allowed = new Set<TripGridColumnKey>(TRIP_GRID_COLUMNS.map((column) => column.key));
  const seen = new Set<TripGridColumnKey>();
  const normalized: TripGridColumnKey[] = [];
  for (const key of order ?? []) {
    if (!allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  for (const column of TRIP_GRID_COLUMNS) {
    if (seen.has(column.key)) continue;
    seen.add(column.key);
    normalized.push(column.key);
  }
  return normalized;
}

function normalizeTripColumnVisibility(
  visibility?: Partial<Record<TripGridColumnKey, boolean>>
): Partial<Record<TripGridColumnKey, boolean>> {
  const allowed = new Set<TripGridColumnKey>(TRIP_GRID_COLUMNS.map((column) => column.key));
  const required = new Set<TripGridColumnKey>(TRIP_FROZEN_COLUMNS);
  const next: Partial<Record<TripGridColumnKey, boolean>> = {
    ...DEFAULT_TRIP_COLUMN_VISIBILITY,
    ...(visibility ?? {}),
  };
  for (const key of Object.keys(next) as TripGridColumnKey[]) {
    if (!allowed.has(key)) {
      delete next[key];
      continue;
    }
    if (required.has(key)) {
      next[key] = true;
      continue;
    }
    next[key] = next[key] !== false;
  }
  for (const key of required) {
    next[key] = true;
  }
  return next;
}

function buildTripsRoleDefaults(canonicalRole: string | null): TripsWorkspacePreferences {
  const fullVisibility = normalizeTripColumnVisibility(DEFAULT_TRIP_COLUMN_VISIBILITY);
  const makeVisibility = (visibleOptionalColumns: TripGridColumnKey[]) => {
    const next: Partial<Record<TripGridColumnKey, boolean>> = {};
    for (const key of TRIP_OPTIONAL_COLUMNS) {
      next[key] = visibleOptionalColumns.includes(key);
    }
    return normalizeTripColumnVisibility(next);
  };
  if (canonicalRole === "DISPATCHER") {
    return {
      primaryIdentifier: "trip",
      columnVisibility: makeVisibility([
        "movementMode",
        "loadsCount",
        "origin",
        "destination",
        "plannedDepartureAt",
        "plannedArrivalAt",
        "assignment",
        "updatedAt",
      ]),
      columnOrder: normalizeTripColumnOrder([
        "select",
        "tripNumber",
        "status",
        "loadsCount",
        "movementMode",
        "origin",
        "destination",
        "plannedDepartureAt",
        "plannedArrivalAt",
        "assignment",
        "updatedAt",
        "cargo",
      ]),
    };
  }
  if (canonicalRole === "BILLING") {
    return {
      primaryIdentifier: "trip",
      columnVisibility: makeVisibility([
        "movementMode",
        "loadsCount",
        "origin",
        "destination",
        "plannedArrivalAt",
        "updatedAt",
      ]),
      columnOrder: normalizeTripColumnOrder([
        "select",
        "tripNumber",
        "status",
        "loadsCount",
        "origin",
        "destination",
        "plannedArrivalAt",
        "movementMode",
        "updatedAt",
        "plannedDepartureAt",
        "assignment",
        "cargo",
      ]),
    };
  }
  if (canonicalRole === "SAFETY" || canonicalRole === "SUPPORT") {
    return {
      primaryIdentifier: "trip",
      columnVisibility: makeVisibility([
        "movementMode",
        "loadsCount",
        "origin",
        "destination",
        "plannedDepartureAt",
        "plannedArrivalAt",
        "assignment",
        "updatedAt",
      ]),
      columnOrder: normalizeTripColumnOrder([
        "select",
        "tripNumber",
        "status",
        "movementMode",
        "origin",
        "destination",
        "plannedDepartureAt",
        "plannedArrivalAt",
        "assignment",
        "loadsCount",
        "updatedAt",
        "cargo",
      ]),
    };
  }
  if (canonicalRole === "HEAD_DISPATCHER" || canonicalRole === "ADMIN") {
    return {
      primaryIdentifier: "trip",
      columnVisibility: fullVisibility,
      columnOrder: normalizeTripColumnOrder(DEFAULT_TRIP_COLUMN_ORDER),
    };
  }
  return {
    primaryIdentifier: "trip",
    columnVisibility: fullVisibility,
    columnOrder: normalizeTripColumnOrder(DEFAULT_TRIP_COLUMN_ORDER),
  };
}

type TripsWorkspaceProps = {
  inspectorVisible?: boolean;
};

export function TripsWorkspace({ inspectorVisible = true }: TripsWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tripIdParam = searchParams.get("tripId");
  const urlSearch = searchParams.get("search") ?? "";
  const urlStatus = parseTripStatusParam(searchParams.get("status"));
  const urlMovementMode = parseMovementModeParam(searchParams.get("movementMode"));
  const urlPrimaryIdentifier = parsePrimaryIdentifierParam(searchParams.get("primary"));
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [roleCapabilities, setRoleCapabilities] = useState(() => getRoleCapabilities(undefined));
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(tripIdParam);
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);
  const [search, setSearch] = useState(urlSearch);
  const [status, setStatus] = useState(urlStatus);
  const [movementMode, setMovementMode] = useState(urlMovementMode);
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
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showGridSetup, setShowGridSetup] = useState(false);
  const [sortMode, setSortMode] = useState<TripGridSortMode>("newest");
  const [primaryIdentifier, setPrimaryIdentifier] = useState<TripPrimaryIdentifier>(urlPrimaryIdentifier ?? "trip");
  const [tripColumnSearch, setTripColumnSearch] = useState("");
  const [columnVisibility, setColumnVisibility] =
    useState<Partial<Record<TripGridColumnKey, boolean>>>(normalizeTripColumnVisibility(DEFAULT_TRIP_COLUMN_VISIBILITY));
  const [columnOrder, setColumnOrder] = useState<TripGridColumnKey[]>(DEFAULT_TRIP_COLUMN_ORDER);
  const [draggingTripColumn, setDraggingTripColumn] = useState<TripGridColumnKey | null>(null);
  const [workspacePrefsHydrated, setWorkspacePrefsHydrated] = useState(false);
  const [workspacePrefsSaving, setWorkspacePrefsSaving] = useState(false);
  const [workspacePrefsSaveError, setWorkspacePrefsSaveError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("assignment");
  const [selectedGridRows, setSelectedGridRows] = useState<Set<string>>(new Set());
  const [newTripLoadNumbers, setNewTripLoadNumbers] = useState("");
  const [newTripMovementMode, setNewTripMovementMode] = useState<MovementMode>("FTL");
  const [assignForm, setAssignForm] = useState({ driverId: "", truckId: "", trailerId: "" });
  const [statusForm, setStatusForm] = useState<TripStatus>("PLANNED");
  const [addLoadsText, setAddLoadsText] = useState("");
  const [cargoPlanState, setCargoPlanState] = useState<CargoPlanPayload | null>(null);
  const [syncingCargoPlan, setSyncingCargoPlan] = useState(false);
  const [splittingLoadId, setSplittingLoadId] = useState<string | null>(null);
  const lastSavedPrefsRef = useRef<string>("");
  const canMutateTripExecution = roleCapabilities.canDispatchExecution;
  const isReadHeavyOpsRole =
    roleCapabilities.canonicalRole === "SAFETY" || roleCapabilities.canonicalRole === "SUPPORT";

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
  const activeTripFilterCount = useMemo(
    () => countActiveTripFilters({ search, status, movementMode }),
    [search, status, movementMode]
  );
  const tripColumnLabelByKey = useMemo(
    () => new Map<TripGridColumnKey, string>(TRIP_GRID_COLUMNS.map((column) => [column.key, column.label])),
    []
  );
  const tripColumnCatalog = useMemo(() => TRIPS_WORKSPACE_COLUMN_CATALOG, []);
  const filteredTripColumnCatalog = useMemo(() => {
    return filterWorkspaceColumnCatalog(tripColumnCatalog, tripColumnLabelByKey, tripColumnSearch);
  }, [tripColumnCatalog, tripColumnLabelByKey, tripColumnSearch]);
  const normalizedColumnOrder = useMemo(() => normalizeTripColumnOrder(columnOrder), [columnOrder]);
  const movableColumnOrder = useMemo(
    () => normalizedColumnOrder.filter((column) => !TRIP_FROZEN_COLUMNS.includes(column)),
    [normalizedColumnOrder]
  );
  const canMoveTripColumn = useCallback(
    (column: TripGridColumnKey, direction: -1 | 1) => {
      const index = movableColumnOrder.indexOf(column);
      const nextIndex = index + direction;
      return index >= 0 && nextIndex >= 0 && nextIndex < movableColumnOrder.length;
    },
    [movableColumnOrder]
  );
  const moveTripColumn = useCallback((column: TripGridColumnKey, direction: -1 | 1) => {
    setColumnOrder((prev) => {
      const base = normalizeTripColumnOrder(prev);
      const movable = base.filter((key) => !TRIP_FROZEN_COLUMNS.includes(key));
      const index = movable.indexOf(column);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= movable.length) return prev;
      const nextMovable = [...movable];
      const [moved] = nextMovable.splice(index, 1);
      nextMovable.splice(nextIndex, 0, moved);
      let pointer = 0;
      return base.map((key) => {
        if (TRIP_FROZEN_COLUMNS.includes(key)) return key;
        const replacement = nextMovable[pointer];
        pointer += 1;
        return replacement;
      });
    });
  }, []);
  const moveTripColumnToTarget = useCallback((column: TripGridColumnKey, target: TripGridColumnKey) => {
    if (column === target) return;
    setColumnOrder((prev) => {
      const base = normalizeTripColumnOrder(prev);
      const movable = base.filter((key) => !TRIP_FROZEN_COLUMNS.includes(key));
      const fromIndex = movable.indexOf(column);
      const targetIndex = movable.indexOf(target);
      if (fromIndex < 0 || targetIndex < 0) return prev;
      const nextMovable = [...movable];
      const [moved] = nextMovable.splice(fromIndex, 1);
      const insertIndex = nextMovable.indexOf(target);
      if (insertIndex < 0) return prev;
      nextMovable.splice(insertIndex, 0, moved);
      let pointer = 0;
      return base.map((key) => {
        if (TRIP_FROZEN_COLUMNS.includes(key)) return key;
        const replacement = nextMovable[pointer];
        pointer += 1;
        return replacement;
      });
    });
  }, []);
  const applyRoleDefaults = useCallback(() => {
    const defaults = buildTripsRoleDefaults(roleCapabilities.canonicalRole);
    setPrimaryIdentifier(defaults.primaryIdentifier);
    setColumnVisibility(defaults.columnVisibility);
    setColumnOrder(defaults.columnOrder);
    setWorkspacePrefsSaveError(null);
  }, [roleCapabilities.canonicalRole]);
  const sortedTrips = useMemo(() => {
    const list = [...trips];
    if (sortMode === "loads") {
      list.sort((a, b) => b.loads.length - a.loads.length || a.tripNumber.localeCompare(b.tripNumber));
      return list;
    }
    if (sortMode === "status") {
      list.sort(
        (a, b) =>
          STATUS_SORT_WEIGHT[a.status] - STATUS_SORT_WEIGHT[b.status] ||
          a.tripNumber.localeCompare(b.tripNumber)
      );
      return list;
    }
    if (sortMode === "trip") {
      list.sort((a, b) => a.tripNumber.localeCompare(b.tripNumber));
      return list;
    }
    list.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime || b.tripNumber.localeCompare(a.tripNumber);
    });
    return list;
  }, [trips, sortMode]);
  const spreadsheetRows = useMemo<TripGridRow[]>(
    () =>
      sortedTrips.map((trip) => {
        const orderedLoads = [...trip.loads].sort((left, right) => left.sequence - right.sequence);
        return {
          id: trip.id,
          tripNumber: trip.tripNumber,
          primaryLoadNumber: orderedLoads[0]?.load?.loadNumber ?? null,
          status: trip.status,
          movementMode: trip.movementMode,
          loadsCount: orderedLoads.length,
          origin: trip.origin ?? trip.sourceManifest?.origin ?? "-",
          destination: trip.destination ?? trip.sourceManifest?.destination ?? "-",
          plannedDepartureAt: trip.plannedDepartureAt ?? null,
          plannedArrivalAt: trip.plannedArrivalAt ?? null,
          assignment: {
            driverName: trip.driver?.name ?? "No driver",
            truckUnit: `Truck ${trip.truck?.unit ?? "-"}`,
            trailerUnit: `Trailer ${trip.trailer?.unit ?? "-"}`,
          },
          cargo:
            isConsolidationMode(trip.movementMode)
              ? trip.sourceManifest
                ? "LINKED"
                : "UNLINKED"
              : "N/A",
          updatedAt: trip.createdAt ?? null,
        };
      }),
    [sortedTrips]
  );

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

  const clearTripFilters = useCallback(() => {
    setSearch("");
    setStatus("");
    setMovementMode("");
  }, []);

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
        const nextCaps = getRoleCapabilities(role);
        setRoleCapabilities(nextCaps);
        setHasAccess(nextCaps.canAccessTrips);
      })
      .catch(() => {
        setRoleCapabilities(getRoleCapabilities(undefined));
        setHasAccess(false);
      });
  }, []);

  useEffect(() => {
    if (!canMutateTripExecution && showCreatePanel) {
      setShowCreatePanel(false);
    }
  }, [canMutateTripExecution, showCreatePanel]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    const nextSearch = search.trim();
    if (nextSearch) {
      if (params.get("search") !== nextSearch) {
        params.set("search", nextSearch);
        changed = true;
      }
    } else if (params.has("search")) {
      params.delete("search");
      changed = true;
    }
    if (status) {
      if (params.get("status") !== status) {
        params.set("status", status);
        changed = true;
      }
    } else if (params.has("status")) {
      params.delete("status");
      changed = true;
    }
    if (movementMode) {
      if (params.get("movementMode") !== movementMode) {
        params.set("movementMode", movementMode);
        changed = true;
      }
    } else if (params.has("movementMode")) {
      params.delete("movementMode");
      changed = true;
    }
    if (primaryIdentifier === "load") {
      if (params.get("primary") !== "load") {
        params.set("primary", "load");
        changed = true;
      }
    } else if (params.has("primary")) {
      params.delete("primary");
      changed = true;
    }
    if (!changed) return;
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [movementMode, pathname, primaryIdentifier, router, search, searchParams, status]);

  useEffect(() => {
    if (!hasAccess) return;
    let active = true;
    apiFetch<{
      preferences?: {
        primaryIdentifier?: "trip" | "load";
        columnVisibility?: Partial<Record<TripGridColumnKey, boolean>>;
        columnOrder?: TripGridColumnKey[];
      } | null;
      updatedAt?: string | null;
    }>("/dispatch/trips-workspace")
      .then((payload) => {
        if (!active) return;
        const incoming = payload.preferences ?? null;
        const roleDefaults = buildTripsRoleDefaults(roleCapabilities.canonicalRole);
        const useRoleDefaults = !payload.updatedAt;
        const nextPrimary: TripPrimaryIdentifier = urlPrimaryIdentifier
          ? urlPrimaryIdentifier
          : useRoleDefaults
            ? roleDefaults.primaryIdentifier
            : incoming?.primaryIdentifier === "load"
              ? "load"
              : "trip";
        const nextVisibility = normalizeTripColumnVisibility(
          useRoleDefaults ? roleDefaults.columnVisibility : incoming?.columnVisibility ?? DEFAULT_TRIP_COLUMN_VISIBILITY
        );
        const nextOrder = normalizeTripColumnOrder(
          useRoleDefaults ? roleDefaults.columnOrder : incoming?.columnOrder ?? DEFAULT_TRIP_COLUMN_ORDER
        );
        setPrimaryIdentifier(nextPrimary);
        setColumnVisibility(nextVisibility);
        setColumnOrder(nextOrder);
        lastSavedPrefsRef.current = JSON.stringify({
          primaryIdentifier: nextPrimary,
          columnVisibility: nextVisibility,
          columnOrder: nextOrder,
        });
        setWorkspacePrefsSaveError(null);
        setWorkspacePrefsHydrated(true);
      })
      .catch(() => {
        if (!active) return;
        setWorkspacePrefsHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [hasAccess, roleCapabilities.canonicalRole, urlPrimaryIdentifier]);

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
    if (!urlPrimaryIdentifier) return;
    setPrimaryIdentifier(urlPrimaryIdentifier);
  }, [urlPrimaryIdentifier]);

  useEffect(() => {
    if (!hasAccess || !workspacePrefsHydrated) return;
    const payload = {
      primaryIdentifier,
      columnVisibility: normalizeTripColumnVisibility(columnVisibility),
      columnOrder: normalizeTripColumnOrder(columnOrder),
    };
    const snapshot = JSON.stringify(payload);
    if (snapshot === lastSavedPrefsRef.current) return;
    const timer = window.setTimeout(() => {
      setWorkspacePrefsSaving(true);
      setWorkspacePrefsSaveError(null);
      apiFetch("/dispatch/trips-workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: payload }),
      })
        .then(() => {
          lastSavedPrefsRef.current = snapshot;
          setWorkspacePrefsSaving(false);
        })
        .catch((err) => {
          setWorkspacePrefsSaving(false);
          setWorkspacePrefsSaveError((err as Error).message || "Unable to save trips workspace preferences.");
        });
    }, 500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [columnOrder, columnVisibility, hasAccess, primaryIdentifier, workspacePrefsHydrated]);

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
    setDetailTab("assignment");
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
      setShowCreatePanel(false);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setCreatingTrip(false);
    }
  };

  const saveAssignment = async () => {
    if (!selectedTripId) return;
    const shipmentId = selectedTrip?.loads?.[0]?.load?.id ?? null;
    const isLtlShipmentCommand = selectedTrip?.movementMode === "LTL";
    setSavingAssign(true);
    setFormError(null);
    setStatusNote(null);
    try {
      if (isLtlShipmentCommand) {
        if (!shipmentId) {
          setFormError("This LTL trip has no loads attached, so shipment execution cannot be updated yet.");
          return;
        }
        await apiFetch(`/shipments/${shipmentId}/execution`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driverId: assignForm.driverId || null,
            truckId: assignForm.truckId || null,
            trailerId: assignForm.trailerId || null,
            status: statusForm,
            reasonCode: "TRIP_ASSIGNMENT_EDIT",
          }),
        });
      } else {
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
      }
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
    const shipmentId = selectedTrip?.loads?.[0]?.load?.id ?? null;
    const isLtlShipmentCommand = selectedTrip?.movementMode === "LTL";
    setSavingStatus(true);
    setFormError(null);
    setStatusNote(null);
    try {
      if (isLtlShipmentCommand) {
        if (!shipmentId) {
          setFormError("This LTL trip has no loads attached, so shipment execution cannot be updated yet.");
          return;
        }
        await apiFetch(`/shipments/${shipmentId}/execution`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: statusForm,
            reasonCode: "TRIP_STATUS_EDIT",
          }),
        });
      } else {
        await apiFetch(`/trips/${selectedTripId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: statusForm,
          }),
        });
      }
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
    <div className="space-y-5">
      <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">Trips workspace</span>
            <span>
              {isReadHeavyOpsRole
                ? "Read-only trip visibility for investigation and escalation."
                : "Plan, assign, and execute trips from one place."}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[color:var(--color-text-subtle)]">
              {workspacePrefsSaving
                ? "Saving layout..."
                : workspacePrefsSaveError
                  ? "Layout save failed"
                  : workspacePrefsHydrated
                    ? "Layout saved"
                    : "Loading layout..."}
            </span>
            <Button size="sm" variant="secondary" onClick={loadTrips} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button size="sm" variant="secondary" onClick={clearTripFilters}>
              Clear filters
            </Button>
            <Button
              size="sm"
              variant={showGridSetup ? "secondary" : "ghost"}
              onClick={() => setShowGridSetup((prev) => !prev)}
            >
              {showGridSetup ? "Hide grid setup" : "Grid setup"}
            </Button>
            {canMutateTripExecution ? (
              <Button size="sm" onClick={() => setShowCreatePanel((prev) => !prev)}>
                {showCreatePanel ? "Close new trip" : "New trip"}
              </Button>
            ) : (
              <StatusChip tone="warning" label="Read-only" />
            )}
          </div>
        </div>
      </div>

      {showCreatePanel && canMutateTripExecution ? (
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
      ) : null}

      {showGridSetup ? (
        <Card className="space-y-3">
          <SectionHeader
            title="Trips grid setup"
            subtitle="Switch primary identifier and organize non-frozen columns."
          />
          <FormField label="Primary identifier" htmlFor="tripPrimaryIdentifier">
            <Select
              id="tripPrimaryIdentifier"
              value={primaryIdentifier}
              onChange={(event) =>
                setPrimaryIdentifier(event.target.value === "load" ? "load" : "trip")
              }
            >
              <option value="trip">Trip # first</option>
              <option value="load">Load # first</option>
            </Select>
          </FormField>
          <div className="space-y-2">
            <div className="text-xs font-medium text-[color:var(--color-text-muted)]">Field catalog</div>
            <Input
              value={tripColumnSearch}
              onChange={(event) => setTripColumnSearch(event.target.value)}
              placeholder="Search fields"
              className="h-8"
            />
            <div className="space-y-2">
              {filteredTripColumnCatalog.length === 0 ? (
                <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-2 text-xs text-[color:var(--color-text-muted)]">
                  No fields match your search.
                </div>
              ) : (
                filteredTripColumnCatalog.map((group) => (
                  <div key={group.id} className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
                      {group.label}
                    </div>
                    {group.columns.map((column) => {
                      const isLocked = TRIP_FROZEN_COLUMNS.includes(column);
                      return (
                        <label
                          key={column}
                          className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-xs"
                        >
                          <span>{tripColumnLabelByKey.get(column) ?? column}</span>
                          {isLocked ? (
                            <Badge className="bg-[color:var(--color-surface)] text-[color:var(--color-text-muted)]">Locked</Badge>
                          ) : (
                            <input
                              type="checkbox"
                              checked={columnVisibility[column] !== false}
                              onChange={(event) =>
                                setColumnVisibility((prev) => ({
                                  ...prev,
                                  [column]: event.target.checked,
                                }))
                              }
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-[color:var(--color-text-muted)]">Column order</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Drag rows to reorder grid columns.</div>
            <div className="space-y-1">
              {movableColumnOrder.map((column) => (
                <div
                  key={column}
                  className={`flex items-center justify-between gap-2 rounded-[var(--radius-control)] border px-2 py-1.5 text-xs ${
                    draggingTripColumn === column
                      ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]/20"
                      : "border-[color:var(--color-divider)]"
                  }`}
                  draggable
                  onDragStart={(event) => {
                    setDraggingTripColumn(column);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", column);
                  }}
                  onDragOver={(event) => {
                    if (!draggingTripColumn || draggingTripColumn === column) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggingTripColumn || draggingTripColumn === column) return;
                    moveTripColumnToTarget(draggingTripColumn, column);
                    setDraggingTripColumn(null);
                  }}
                  onDragEnd={() => setDraggingTripColumn(null)}
                >
                  <span className="flex items-center gap-2">
                    <span className="cursor-grab select-none text-[color:var(--color-text-muted)]">::</span>
                    {TRIP_GRID_COLUMNS.find((entry) => entry.key === column)?.label ?? column}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => moveTripColumn(column, -1)}
                      disabled={!canMoveTripColumn(column, -1)}
                    >
                      Up
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => moveTripColumn(column, 1)}
                      disabled={!canMoveTripColumn(column, 1)}
                    >
                      Down
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={applyRoleDefaults}
            >
              Reset to role default
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPrimaryIdentifier("trip");
                setColumnOrder(DEFAULT_TRIP_COLUMN_ORDER);
                setColumnVisibility(normalizeTripColumnVisibility(DEFAULT_TRIP_COLUMN_VISIBILITY));
              }}
            >
              Reset to system default
            </Button>
          </div>
        </Card>
      ) : null}

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
      {!inspectorVisible ? (
        <Card className="border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] text-xs text-[color:var(--color-text-muted)]">
          Trip inspector is hidden. Open it from <span className="font-medium text-ink">Panels → Trip inspector</span>.
        </Card>
      ) : null}

      <div
        className={`grid gap-4 ${
          inspectorVisible ? "xl:grid-cols-[minmax(0,1.45fr)_minmax(28rem,1fr)]" : "xl:grid-cols-1"
        }`}
      >
        <TripSpreadsheetGrid
          rows={spreadsheetRows}
          loading={loading}
          primaryIdentifier={primaryIdentifier}
          columnVisibility={columnVisibility}
          columnOrder={normalizedColumnOrder}
          onColumnOrderChange={setColumnOrder}
          selectedTripId={selectedTripId}
          selectedRows={selectedGridRows}
          search={search}
          status={status}
          movementMode={movementMode}
          sortMode={sortMode}
          filterCount={activeTripFilterCount}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onMovementModeChange={setMovementMode}
          onSortModeChange={setSortMode}
          onClearFilters={clearTripFilters}
          onSelectTrip={(tripId) => {
            chooseTrip(tripId);
          }}
          onToggleRowSelection={(tripId, selected) => {
            setSelectedGridRows((prev) => {
              const next = new Set(prev);
              if (selected) next.add(tripId);
              else next.delete(tripId);
              return next;
            });
          }}
          onToggleSelectAllVisible={(selected) => {
            setSelectedGridRows((prev) => {
              if (!selected) {
                const next = new Set(prev);
                spreadsheetRows.forEach((row) => next.delete(row.id));
                return next;
              }
              const next = new Set(prev);
              spreadsheetRows.forEach((row) => next.add(row.id));
              return next;
            });
          }}
        />

        {inspectorVisible ? <Card className="min-h-[62vh] space-y-4">
          {selectedTripSummary ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Trip</div>
                  <div className="text-2xl font-semibold">{selectedTripSummary.tripNumber}</div>
                </div>
                <StatusChip label={selectedTripSummary.status} tone={statusTone(selectedTripSummary.status)} />
              </div>

              <SegmentedControl
                value={detailTab}
                options={[
                  { label: "Assignment", value: "assignment" },
                  { label: "Status", value: "status" },
                  { label: "Cargo", value: "cargo" },
                  { label: "Loads", value: "loads" },
                ]}
                onChange={(value) => setDetailTab(value as DetailTab)}
              />

              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                Execution authority: <span className="font-medium text-ink">Trip/Dispatch</span> · Commercial authority:{" "}
                <span className="font-medium text-ink">Load/Finance</span>
              </div>

              <div className="max-h-[64vh] space-y-3 overflow-y-auto pr-1">
                {detailTab === "assignment" ? (
                  <Card className="space-y-3">
                    <SectionHeader title="Assignment" subtitle="Primary trip resources" />
                    <div className="grid gap-3 lg:grid-cols-3">
                      <FormField label="Driver" htmlFor="tripAssignDriver">
                        <Select
                          id="tripAssignDriver"
                          value={assignForm.driverId}
                          onChange={(event) => setAssignForm((prev) => ({ ...prev, driverId: event.target.value }))}
                          disabled={!canMutateTripExecution}
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
                          disabled={!canMutateTripExecution}
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
                          disabled={!canMutateTripExecution}
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
                      {canMutateTripExecution ? (
                        <Button onClick={saveAssignment} disabled={savingAssign}>
                          {savingAssign ? "Saving..." : "Save assignment"}
                        </Button>
                      ) : null}
                      <Button variant="secondary" onClick={() => setDetailTab("status")}>
                        Update status
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => router.push(`/dispatch?loadId=${selectedTripSummary.loads[0]?.load.id ?? ""}`)}
                        disabled={!selectedTripSummary.loads.length}
                      >
                        Open in dispatch
                      </Button>
                      <Button variant="secondary" onClick={() => router.push(`/trips/${selectedTripSummary.id}`)}>
                        Open trip detail
                      </Button>
                    </div>
                    {!canMutateTripExecution ? (
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        Restricted: assignment mutations are disabled for this role.
                      </div>
                    ) : null}
                  </Card>
                ) : null}

                {detailTab === "status" ? (
                  <Card className="space-y-3">
                    <SectionHeader title="Status control" subtitle="Trip controls execution status for member loads" />
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                      <FormField label="Status" htmlFor="tripStatusUpdate">
                        <Select
                          id="tripStatusUpdate"
                          value={statusForm}
                          onChange={(event) => setStatusForm(event.target.value as TripStatus)}
                          disabled={!canMutateTripExecution}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      <div className="flex items-end">
                        {canMutateTripExecution ? (
                          <Button onClick={saveStatus} disabled={savingStatus}>
                            {savingStatus ? "Updating..." : "Update status"}
                          </Button>
                        ) : (
                          <StatusChip tone="warning" label="Read-only" />
                        )}
                      </div>
                    </div>
                  </Card>
                ) : null}

                {detailTab === "cargo" ? (
                  <Card className="space-y-3">
                    <SectionHeader
                      title="Cargo plan"
                      subtitle={
                        isConsolidationTrip
                          ? "Manifest behavior is embedded inside this trip"
                          : "FTL trips do not require an explicit cargo plan"
                      }
                    />
                    {isConsolidationTrip ? (
                      <>
                        {cargoPlanState?.cargoPlan ? (
                          <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
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
                            disabled={syncingCargoPlan || Boolean(cargoPlanDisabledReason) || !canMutateTripExecution}
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
                                className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2 text-sm"
                              >
                                <span className="font-medium">#{item.sequence ?? "-"} {item.loadNumber}</span>
                                <span className="ml-2 text-xs text-[color:var(--color-text-muted)]">
                                  {item.loadStatus ?? "UNKNOWN"} · {item.customerName ?? "Customer"}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="text-sm text-[color:var(--color-text-muted)]">
                        This trip is FTL. Cargo composition is managed directly by trip loads.
                      </div>
                    )}
                  </Card>
                ) : null}

                {detailTab === "loads" ? (
                  <>
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
                            disabled={!canMutateTripExecution}
                          />
                        </FormField>
                        <div className="flex items-end">
                          {canMutateTripExecution ? (
                            <Button onClick={addLoads} disabled={addingLoads}>
                              {addingLoads ? "Adding..." : "Add loads"}
                            </Button>
                          ) : (
                            <StatusChip tone="warning" label="Read-only" />
                          )}
                        </div>
                      </div>
                    </Card>
                    <Card className="space-y-2">
                      <SectionHeader title="Trip loads" subtitle="Execution follows trip order" />
                      {selectedTripSummary.loads.length === 0 ? (
                        <div className="text-sm text-[color:var(--color-text-muted)]">No loads attached yet.</div>
                      ) : (
                        selectedTripSummary.loads.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2"
                          >
                            <div className="text-sm">
                              <span className="font-medium">#{item.sequence}</span> {item.load.loadNumber}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs text-[color:var(--color-text-muted)]">
                                {item.load.status} · {item.load.customerName ?? "Customer"}
                              </div>
                              {isConsolidationTrip &&
                              (cargoPlanState?.canEdit ?? false) &&
                              selectedTripSummary.loads.length > 1 ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => splitTripLoad(item.load.id)}
                                  disabled={splittingLoadId === item.load.id || !canMutateTripExecution}
                                >
                                  {splittingLoadId === item.load.id ? "Splitting..." : "Split out"}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </Card>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyState title="Select a trip" description="Choose a trip from the list to manage assignment and execution." />
          )}
        </Card> : null}
      </div>
    </div>
  );
}

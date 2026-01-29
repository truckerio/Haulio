"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/ui/section-header";
import { RefinePanel } from "@/components/ui/refine-panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { BlockerCard } from "@/components/ui/blocker-card";
import { BlockedScreen } from "@/components/ui/blocked-screen";
import { NoAccess } from "@/components/rbac/no-access";
import { apiFetch } from "@/lib/api";
import { ManifestPanel } from "./manifest-panel";
import { LegsPanel } from "./legs-panel";

const PAGE_SIZE = 25;
const STORAGE_KEY = "dispatch:operatingEntityId";

type DriverRecord = {
  id: string;
  name?: string | null;
  terminal?: string | null;
  homeTerminal?: string | null;
  region?: string | null;
  reliability?: string | null;
  docsStatus?: string | null;
  trackingStatus?: string | null;
  lastKnownCity?: string | null;
  nearPickup?: boolean | null;
  reason?: string | null;
};

type TruckRecord = {
  id: string;
  unit?: string | null;
  reason?: string | null;
};

type TrailerRecord = {
  id: string;
  unit?: string | null;
  reason?: string | null;
};

type AvailabilityData = {
  availableDrivers: DriverRecord[];
  unavailableDrivers: DriverRecord[];
  availableTrucks: TruckRecord[];
  unavailableTrucks: TruckRecord[];
  availableTrailers: TrailerRecord[];
  unavailableTrailers: TrailerRecord[];
};

type DispatchItem = {
  id: string;
  loadNumber: string;
  status: string;
  customerName?: string | null;
  rate?: string | number | null;
  miles?: number | null;
  assignment?: {
    driver?: { id: string; name: string } | null;
    truck?: { id: string; unit: string } | null;
    trailer?: { id: string; unit: string } | null;
  };
  operatingEntity?: { id: string; name: string } | null;
  route?: { shipperCity?: string | null; shipperState?: string | null; consigneeCity?: string | null; consigneeState?: string | null };
  nextStop?: {
    id: string;
    type: string;
    name: string;
    city: string;
    state: string;
    appointmentStart?: string | null;
    appointmentEnd?: string | null;
    arrivedAt?: string | null;
    departedAt?: string | null;
    sequence: number;
  } | null;
  tracking?: { state: "ON" | "OFF"; lastPingAt?: string | null };
  legSummary?: { count: number; activeStatus?: string | null };
  riskFlags?: {
    needsAssignment: boolean;
    trackingOffInTransit: boolean;
    overdueStopWindow: boolean;
    atRisk: boolean;
    nextStopTime?: string | null;
  };
};

const defaultFilters = {
  search: "",
  status: "",
  driverId: "",
  truckId: "",
  trailerId: "",
  assigned: "all",
  fromDate: "",
  toDate: "",
  destSearch: "",
  minRate: "",
  maxRate: "",
  operatingEntityId: "",
};

type Filters = typeof defaultFilters;

type DriverIdentity = {
  terminal: string;
  reliability: string;
  docs: string;
  tracking: string;
  lastKnown: string;
  summary: string;
  detail: string;
};

export default function DispatchPage() {
  const router = useRouter();
  const [user, setUser] = useState<any | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loads, setLoads] = useState<DispatchItem[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [trucks, setTrucks] = useState<TruckRecord[]>([]);
  const [trailers, setTrailers] = useState<TrailerRecord[]>([]);
  const [operatingEntities, setOperatingEntities] = useState<Array<{ id: string; name: string; isDefault?: boolean }>>(
    []
  );
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [view, setView] = useState<"cards" | "board" | "compact">("board");
  const [showFilters, setShowFilters] = useState(false);
  const [showManifest, setShowManifest] = useState(false);
  const [showLegs, setShowLegs] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [selectedLoad, setSelectedLoad] = useState<any | null>(null);
  const [dispatchSettings, setDispatchSettings] = useState<any | null>(null);
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [assignForm, setAssignForm] = useState({ driverId: "", truckId: "", trailerId: "" });
  const [driverInfo, setDriverInfo] = useState<{ open: boolean; driver: DriverRecord | null }>({ open: false, driver: null });
  const [confirmReassign, setConfirmReassign] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [driverMenuOpen, setDriverMenuOpen] = useState(false);
  const [showStopActions, setShowStopActions] = useState(false);
  const [blocked, setBlocked] = useState<{ message?: string; ctaHref?: string } | null>(null);

  const canDispatch = Boolean(user && (user.role === "ADMIN" || user.role === "DISPATCHER"));
  const canOverride = user?.role === "ADMIN";
  const dispatchStage =
    selectedLoad?.status && ["DRAFT", "PLANNED", "ASSIGNED"].includes(selectedLoad.status);
  const rateConRequired = Boolean(dispatchSettings?.requireRateConBeforeDispatch);
  const hasRateCon = (selectedLoad?.docs ?? []).some((doc: any) => doc.type === "RATECON");
  const rateConMissing = Boolean(dispatchStage && rateConRequired && !hasRateCon);
  const assignDisabled =
    !assignForm.driverId ||
    (rateConMissing && !canOverride) ||
    (rateConMissing && canOverride && !overrideReason.trim());

  const formatReliability = (value?: string | null) => {
    const normalized = value?.toUpperCase();
    if (normalized === "HIGH") return "High";
    if (normalized === "MED" || normalized === "MEDIUM") return "Med";
    if (normalized === "LOW") return "Low";
    return "—";
  };

  const formatDocs = (value?: string | null) => {
    const normalized = value?.toUpperCase();
    if (normalized === "OK") return "OK";
    if (normalized === "MISSING") return "Missing";
    return "—";
  };

  const formatTracking = (value?: string | null) => {
    const normalized = value?.toUpperCase();
    if (normalized === "ON") return "ON";
    if (normalized === "OFF") return "OFF";
    return "—";
  };

  const buildDriverIdentity = useCallback((driver?: DriverRecord | null): DriverIdentity => {
    const terminal = driver?.terminal ?? driver?.homeTerminal ?? driver?.region ?? "—";
    const reliability = formatReliability(driver?.reliability);
    const docs = formatDocs(driver?.docsStatus);
    const tracking = formatTracking(driver?.trackingStatus);
    const lastKnown = driver?.lastKnownCity ?? (driver?.nearPickup ? "Near pickup" : "—");
    const summary = [terminal, reliability, `Docs ${docs}`, `Tracking ${tracking}`, lastKnown].join(" · ");
    const detail = `Terminal: ${terminal} · Reliability ${reliability} · Docs ${docs} · Tracking ${tracking} · ${lastKnown}`;
    return { terminal, reliability, docs, tracking, lastKnown, summary, detail };
  }, []);

  useEffect(() => {
    apiFetch<{ user: any }>("/auth/me")
      .then((data) => {
        setUser(data.user);
        const allowed = data.user?.role === "ADMIN" || data.user?.role === "DISPATCHER";
        setHasAccess(Boolean(allowed));
      })
      .catch(() => setHasAccess(false));
  }, []);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    apiFetch<{ state: { status?: string } }>("/onboarding/state")
      .then((payload) => {
        if (payload.state?.status === "NOT_ACTIVATED") {
          setBlocked({ message: "Finish setup to perform dispatch assignments.", ctaHref: "/onboarding" });
        } else {
          setBlocked(null);
        }
      })
      .catch(() => {
        // ignore onboarding checks for non-admins or unexpected errors
      });
  }, [user]);

  useEffect(() => {
    if (!hasAccess) return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("operatingEntityId");
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const value = fromUrl || stored || "";
    if (value) {
      setFilters((prev) => ({ ...prev, operatingEntityId: value }));
    }
  }, [hasAccess]);

  useEffect(() => {
    if (!hasAccess) return;
    const params = new URLSearchParams(window.location.search);
    if (filters.operatingEntityId) {
      params.set("operatingEntityId", filters.operatingEntityId);
      window.localStorage.setItem(STORAGE_KEY, filters.operatingEntityId);
    } else {
      params.delete("operatingEntityId");
      window.localStorage.removeItem(STORAGE_KEY);
    }
    const query = params.toString();
    router.replace(query ? `/dispatch?${query}` : "/dispatch");
  }, [filters.operatingEntityId, hasAccess, router]);

  const loadAssets = useCallback(async () => {
    if (!canDispatch) return;
    const [driversData, trucksData, trailersData, entitiesData] = await Promise.all([
      apiFetch<{ drivers: DriverRecord[] }>("/assets/drivers"),
      apiFetch<{ trucks: TruckRecord[] }>("/assets/trucks"),
      apiFetch<{ trailers: TrailerRecord[] }>("/assets/trailers"),
      apiFetch<{ entities: Array<{ id: string; name: string; isDefault?: boolean }> }>("/operating-entities"),
    ]);
    setDrivers(driversData.drivers ?? []);
    setTrucks(trucksData.trucks ?? []);
    setTrailers(trailersData.trailers ?? []);
    setOperatingEntities(entitiesData.entities ?? []);
  }, [canDispatch]);

  useEffect(() => {
    if (!canDispatch) return;
    loadAssets();
  }, [canDispatch, loadAssets]);

  const buildParams = useCallback((nextFilters = filters, page = pageIndex) => {
    const params = new URLSearchParams();
    params.set("view", "dispatch");
    params.set("page", String(page + 1));
    params.set("limit", String(PAGE_SIZE));
    if (nextFilters.search) params.set("search", nextFilters.search);
    if (nextFilters.status) params.set("status", nextFilters.status);
    if (nextFilters.driverId) params.set("driverId", nextFilters.driverId);
    if (nextFilters.truckId) params.set("truckId", nextFilters.truckId);
    if (nextFilters.trailerId) params.set("trailerId", nextFilters.trailerId);
    if (nextFilters.destSearch) params.set("destSearch", nextFilters.destSearch);
    if (nextFilters.minRate) params.set("minRate", nextFilters.minRate);
    if (nextFilters.maxRate) params.set("maxRate", nextFilters.maxRate);
    if (nextFilters.assigned !== "all") {
      params.set("assigned", nextFilters.assigned === "assigned" ? "true" : "false");
    }
    if (nextFilters.fromDate) params.set("fromDate", nextFilters.fromDate);
    if (nextFilters.toDate) params.set("toDate", nextFilters.toDate);
    if (nextFilters.operatingEntityId) params.set("operatingEntityId", nextFilters.operatingEntityId);
    return params.toString();
  }, [filters, pageIndex]);

  const loadDispatchLoads = useCallback(async (nextFilters = filters, page = pageIndex) => {
    if (!canDispatch) return;
    const query = buildParams(nextFilters, page);
    const url = query ? `/loads?${query}` : "/loads?view=dispatch";
    const data = await apiFetch<{ items: DispatchItem[]; total: number; totalPages: number }>(url);
    setLoads(data.items ?? []);
    setTotalPages(data.totalPages ?? 1);
    setTotalCount(data.total ?? 0);
    const first = data.items?.[0];
    if (first && !selectedLoadId) {
      setSelectedLoadId(first.id);
    }
  }, [canDispatch, buildParams, selectedLoadId, filters, pageIndex]);

  useEffect(() => {
    if (!canDispatch) return;
    loadDispatchLoads(filters, pageIndex);
  }, [canDispatch, pageIndex, filters, loadDispatchLoads]);

  const refreshSelectedLoad = useCallback(async (loadId: string) => {
    if (!canDispatch) return;
    const data = await apiFetch<{ load: any; settings?: any | null }>(`/loads/${loadId}/dispatch-detail`);
    setSelectedLoad(data.load ?? null);
    setDispatchSettings(data.settings ?? null);
    setAssignError(null);
    setAssignForm({
      driverId: data.load?.assignedDriverId ?? "",
      truckId: data.load?.truckId ?? "",
      trailerId: data.load?.trailerId ?? "",
    });
    return data.load ?? null;
  }, [canDispatch]);

  useEffect(() => {
    if (!selectedLoadId || !canDispatch) return;
    refreshSelectedLoad(selectedLoadId);
    apiFetch<AvailabilityData>(`/dispatch/availability?loadId=${selectedLoadId}`)
      .then((data) => setAvailability(data))
      .catch(() => setAvailability(null));
  }, [selectedLoadId, canDispatch, refreshSelectedLoad]);

  useEffect(() => {
    setConfirmReassign(false);
    setAssignError(null);
    setOverrideReason("");
  }, [assignForm.driverId, assignForm.truckId, assignForm.trailerId, selectedLoadId, showUnavailable]);

  useEffect(() => {
    const shouldAutoExpand = Boolean(selectedLoad?.riskFlags?.atRisk || selectedLoad?.riskFlags?.overdueStopWindow);
    setShowStopActions(shouldAutoExpand);
  }, [selectedLoad?.id, selectedLoad?.riskFlags?.atRisk, selectedLoad?.riskFlags?.overdueStopWindow]);

  const deriveRiskFlags = (load: any) => {
    const stops = load?.stops ?? [];
    const nextStop = stops.find((stop: any) => !stop.arrivedAt || !stop.departedAt) ?? null;
    const now = Date.now();
    const overdueStop =
      Boolean(nextStop?.appointmentEnd) &&
      now > new Date(nextStop.appointmentEnd).getTime() &&
      !nextStop?.arrivedAt;
    const lastPing = load?.locationPings?.[0]?.capturedAt ?? null;
    const hasActiveTracking = (load?.trackingSessions ?? []).some((session: any) => session.status === "ON");
    let trackingState: "ON" | "OFF" = "OFF";
    if (hasActiveTracking) {
      trackingState = "ON";
    } else if (lastPing) {
      const diffMs = now - new Date(lastPing).getTime();
      if (diffMs < 10 * 60 * 1000) {
        trackingState = "ON";
      }
    }
    const trackingOff = load?.status === "IN_TRANSIT" && trackingState === "OFF";
    const needsAssignment =
      !load?.assignedDriverId || !load?.truckId || load?.status === "PLANNED" || load?.status === "DRAFT";
    return {
      needsAssignment,
      trackingOffInTransit: trackingOff,
      overdueStopWindow: overdueStop,
      atRisk: trackingOff || overdueStop,
      nextStopTime: nextStop?.appointmentStart ?? nextStop?.appointmentEnd ?? null,
    };
  };

  const patchLoadSummary = (updated: any) => {
    setLoads((prev) =>
      prev.map((item) => {
        if (item.id !== updated.id) return item;
        const riskFlags = deriveRiskFlags(updated);
        return {
          ...item,
          status: updated.status ?? item.status,
          assignment: {
            driver: updated.driver ?? item.assignment?.driver,
            truck: updated.truck ?? item.assignment?.truck,
            trailer: updated.trailer ?? item.assignment?.trailer,
          },
          operatingEntity: updated.operatingEntity ?? item.operatingEntity,
          nextStop: updated.stops?.find((stop: any) => !stop.arrivedAt || !stop.departedAt) ?? item.nextStop,
          riskFlags,
        };
      })
    );
  };

  const assign = async () => {
    if (!selectedLoad) return;
    if (!assignForm.driverId) return;
    if (hasConflicts && !confirmReassign) {
      setConfirmReassign(true);
      return;
    }
    setAssignError(null);
    try {
      await apiFetch(`/loads/${selectedLoad.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: assignForm.driverId,
          truckId: assignForm.truckId || undefined,
          trailerId: assignForm.trailerId || undefined,
          overrideReason: overrideReason || undefined,
        }),
      });
      const updated = await refreshSelectedLoad(selectedLoad.id);
      if (updated) {
        patchLoadSummary(updated);
      }
      setConfirmReassign(false);
      setOverrideReason("");
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "ORG_NOT_OPERATIONAL") {
        setBlocked({
          message: (err as Error).message || "Finish setup to perform dispatch assignments.",
          ctaHref: (err as { ctaHref?: string }).ctaHref || "/onboarding",
        });
        return;
      }
      setAssignError((err as Error).message);
    }
  };

  const unassign = async () => {
    if (!selectedLoad) return;
    await apiFetch(`/loads/${selectedLoad.id}/unassign`, { method: "POST" });
    const updated = await refreshSelectedLoad(selectedLoad.id);
    if (updated) {
      patchLoadSummary(updated);
    }
  };

  const markArrive = async (loadId: string, stopId: string) => {
    await apiFetch(`/loads/${loadId}/stops/${stopId}/arrive`, { method: "POST" });
    const updated = await refreshSelectedLoad(loadId);
    if (updated) {
      patchLoadSummary(updated);
    }
  };

  const markDepart = async (loadId: string, stopId: string) => {
    await apiFetch(`/loads/${loadId}/stops/${stopId}/depart`, { method: "POST" });
    const updated = await refreshSelectedLoad(loadId);
    if (updated) {
      patchLoadSummary(updated);
    }
  };

  const updateDelay = async (stopId: string, delayReason?: string | null, delayNotes?: string | null) => {
    await apiFetch(`/stops/${stopId}/delay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        delayReason: delayReason || undefined,
        delayNotes: delayNotes || undefined,
      }),
    });
    if (selectedLoad) {
      const updated = await refreshSelectedLoad(selectedLoad.id);
      if (updated) {
        patchLoadSummary(updated);
      }
    }
  };

  const availableDrivers = useMemo(() => availability?.availableDrivers ?? drivers, [availability, drivers]);
  const unavailableDrivers = useMemo(() => availability?.unavailableDrivers ?? [], [availability]);
  const availableTrucks = useMemo(() => availability?.availableTrucks ?? trucks, [availability, trucks]);
  const unavailableTrucks = useMemo(() => availability?.unavailableTrucks ?? [], [availability]);
  const availableTrailers = useMemo(() => availability?.availableTrailers ?? trailers, [availability, trailers]);
  const unavailableTrailers = useMemo(() => availability?.unavailableTrailers ?? [], [availability]);

  const selectedDriver = useMemo(() => {
    const allDrivers = [...availableDrivers, ...unavailableDrivers];
    return allDrivers.find((driver) => driver.id === assignForm.driverId) ?? null;
  }, [availableDrivers, unavailableDrivers, assignForm.driverId]);

  const selectedDriverIdentity = useMemo(() => buildDriverIdentity(selectedDriver), [selectedDriver, buildDriverIdentity]);
  const driverInfoIdentity = useMemo(
    () => (driverInfo.driver ? buildDriverIdentity(driverInfo.driver) : null),
    [driverInfo.driver, buildDriverIdentity]
  );

  const driverUnavailableSelected =
    Boolean(assignForm.driverId) && !availableDrivers.find((driver: any) => driver.id === assignForm.driverId);
  const truckUnavailableSelected =
    Boolean(assignForm.truckId) && !availableTrucks.find((truck: any) => truck.id === assignForm.truckId);
  const trailerUnavailableSelected =
    Boolean(assignForm.trailerId) && !availableTrailers.find((trailer: any) => trailer.id === assignForm.trailerId);

  const buildOptions = <T extends { id: string; name?: string | null; unit?: string | null; reason?: string | null }>(
    available: T[],
    unavailable: T[],
    showAll: boolean
  ) => {
    if (showAll) return [...available, ...unavailable];
    return available;
  };

  const conflictMessages = useMemo(() => {
    const conflicts: string[] = [];
    if (assignForm.driverId) {
      const driver = unavailableDrivers.find((item) => item.id === assignForm.driverId);
      if (driver) {
        conflicts.push(`Driver: Assigning this driver will move them from ${driver.reason ?? "another load"}.`);
      }
    }
    if (assignForm.truckId) {
      const truck = unavailableTrucks.find((item) => item.id === assignForm.truckId);
      if (truck) {
        conflicts.push(`Truck: Assigning this truck will move it from ${truck.reason ?? "another load"}.`);
      }
    }
    if (assignForm.trailerId) {
      const trailer = unavailableTrailers.find((item) => item.id === assignForm.trailerId);
      if (trailer) {
        conflicts.push(`Trailer: Assigning this trailer will move it from ${trailer.reason ?? "another load"}.`);
      }
    }
    return conflicts;
  }, [assignForm.driverId, assignForm.truckId, assignForm.trailerId, unavailableDrivers, unavailableTrucks, unavailableTrailers]);

  const hasConflicts = conflictMessages.length > 0;

  const statusTone = (status: string) => {
    if (status === "PAID" || status === "DELIVERED" || status === "INVOICED") return "success";
    if (status === "IN_TRANSIT") return "info";
    if (status === "READY_TO_INVOICE" || status === "POD_RECEIVED") return "warning";
    if (status === "CANCELLED") return "danger";
    return "neutral";
  };

  const sortedLoads = useMemo(() => {
    return [...loads].sort((a, b) => {
      const aPriority = a.riskFlags?.needsAssignment ? 0 : a.riskFlags?.atRisk ? 1 : 2;
      const bPriority = b.riskFlags?.needsAssignment ? 0 : b.riskFlags?.atRisk ? 1 : 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aTime = a.riskFlags?.nextStopTime ? new Date(a.riskFlags.nextStopTime).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.riskFlags?.nextStopTime ? new Date(b.riskFlags.nextStopTime).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [loads]);

  const focusLoadSummary = useMemo(() => {
    if (selectedLoadId) return sortedLoads.find((load) => load.id === selectedLoadId) ?? null;
    return sortedLoads[0] ?? null;
  }, [sortedLoads, selectedLoadId]);

  useEffect(() => {
    if (!sortedLoads.length) return;
    if (!selectedLoadId) {
      setSelectedLoadId(sortedLoads[0].id);
      return;
    }
    const exists = sortedLoads.some((load) => load.id === selectedLoadId);
    if (!exists) {
      setSelectedLoadId(sortedLoads[0].id);
    }
  }, [sortedLoads, selectedLoadId]);

  if (hasAccess === false) {
    return (
      <AppShell title="Dispatch" subtitle="Assign assets and monitor driver updates">
        <NoAccess title="No access to Dispatch" description="You do not have permission to view dispatch." />
      </AppShell>
    );
  }
  if (hasAccess === null) {
    return (
      <AppShell title="Dispatch" subtitle="Assign assets and monitor driver updates">
        <EmptyState title="Loading dispatch..." description="Pulling active loads and availability." />
      </AppShell>
    );
  }
  if (blocked) {
    const isAdmin = user?.role === "ADMIN";
    return (
      <AppShell title="Dispatch" subtitle="Assign assets and monitor driver updates">
        <BlockedScreen
          isAdmin={isAdmin}
          description={isAdmin ? blocked.message || "Finish setup to perform dispatch assignments." : undefined}
          ctaHref={isAdmin ? blocked.ctaHref || "/onboarding" : undefined}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Dispatch" subtitle="Assign assets and monitor driver updates">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Assignment focus" subtitle="Prioritize and assign the next load" />
        <SegmentedControl
          value={view}
          options={[
            { label: "Board", value: "board" },
            { label: "Cards", value: "cards" },
            { label: "Compact", value: "compact" },
          ]}
          onChange={(value) => setView(value as "cards" | "board" | "compact")}
        />
      </div>

      {focusLoadSummary ? (
        <Card className="space-y-4">
          <SectionHeader
            title={`Load ${focusLoadSummary.loadNumber}`}
            subtitle={`${focusLoadSummary.customerName ?? "Customer"} - ${
              focusLoadSummary.assignment?.driver?.name ?? "Unassigned"
            }`}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-muted)]">
            <StatusChip label={focusLoadSummary.status} tone={statusTone(focusLoadSummary.status)} />
            <div>Truck {focusLoadSummary.assignment?.truck?.unit ?? "-"}</div>
            <div>Trailer {focusLoadSummary.assignment?.trailer?.unit ?? "-"}</div>
            {focusLoadSummary.operatingEntity?.name ? <div>OE {focusLoadSummary.operatingEntity.name}</div> : null}
          </div>
          <div className="grid gap-3 lg:grid-cols-4">
            {hasConflicts ? (
              <div className="lg:col-span-4 rounded-[var(--radius-card)] border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                <div className="text-sm font-semibold text-ink">Reassignment required</div>
                <div className="mt-1 grid gap-1">
                  {conflictMessages.map((message) => (
                    <div key={message}>{message}</div>
                  ))}
                </div>
                <div className="mt-1">{confirmReassign ? "Click confirm to proceed." : "Click Assign to confirm reassignment."}</div>
              </div>
            ) : null}
            {rateConMissing ? (
              <div className="lg:col-span-4">
                <BlockerCard
                  title="Cannot dispatch: Rate Confirmation missing"
                  subtitle="Upload the RateCon to continue assignment."
                  ctaLabel="Fix now"
                  tone="danger"
                  onClick={() => router.push(`/loads/${selectedLoad?.id}?tab=documents&docType=RATECON`)}
                />
              </div>
            ) : null}
            <div className="relative">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={driverMenuOpen}
                onClick={() => setDriverMenuOpen((prev) => !prev)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setDriverMenuOpen(false);
                  }
                }}
                className="w-full rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-white px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
              >
                <div className="font-medium text-ink">{selectedDriver?.name ?? "Driver"}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">{selectedDriverIdentity.summary}</div>
              </button>
              {driverMenuOpen ? (
                <div className="absolute z-10 mt-2 w-full rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-2 shadow-[var(--shadow-subtle)]">
                  <button
                    type="button"
                    className="w-full rounded-[var(--radius-card)] px-3 py-2 text-left text-sm hover:bg-[color:var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
                    onClick={() => {
                      setAssignForm((prev) => ({ ...prev, driverId: "" }));
                      setDriverMenuOpen(false);
                    }}
                  >
                    <div className="font-medium text-ink">Unassigned</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">Select a driver to assign.</div>
                  </button>
                  <div className="mt-1 max-h-56 overflow-y-auto">
                    {buildOptions(availableDrivers, unavailableDrivers, showUnavailable || driverUnavailableSelected).map((driver) => {
                      const identity = buildDriverIdentity(driver);
                      const isUnavailable = Boolean(driver.reason);
                      const isDisabled = isUnavailable && !showUnavailable && driver.id !== assignForm.driverId;
                      return (
                        <button
                          key={driver.id}
                          type="button"
                          className={`w-full rounded-[var(--radius-card)] px-3 py-2 text-left hover:bg-[color:var(--color-bg-muted)] ${
                            isUnavailable ? "opacity-70" : ""
                          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]`}
                          onClick={() => {
                            if (isDisabled) return;
                            setAssignForm((prev) => ({ ...prev, driverId: driver.id }));
                            setDriverMenuOpen(false);
                          }}
                          aria-disabled={isDisabled}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-ink">{driver.name ?? "Driver"}</div>
                            {driver.reason ? (
                              <span className="text-xs text-[color:var(--color-warning)]">Unavailable</span>
                            ) : null}
                          </div>
                          <div className="text-xs text-[color:var(--color-text-muted)]">{identity.detail}</div>
                          {driver.reason ? (
                            <div className="text-xs text-[color:var(--color-text-muted)]">Reason: {driver.reason}</div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <FormField label="Truck" htmlFor="assignTruck">
              <Select
                value={assignForm.truckId}
                onChange={(event) => setAssignForm({ ...assignForm, truckId: event.target.value })}
              >
                <option value="">Select truck</option>
                {buildOptions(availableTrucks, unavailableTrucks, showUnavailable || truckUnavailableSelected).map((truck) => (
                  <option key={truck.id} value={truck.id} disabled={Boolean(truck.reason) && !showUnavailable && truck.id !== assignForm.truckId}>
                    {truck.unit}
                    {truck.reason ? ` (Unavailable: ${truck.reason})` : ""}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Trailer" htmlFor="assignTrailer">
              <Select
                value={assignForm.trailerId}
                onChange={(event) => setAssignForm({ ...assignForm, trailerId: event.target.value })}
              >
                <option value="">Select trailer</option>
                {buildOptions(availableTrailers, unavailableTrailers, showUnavailable || trailerUnavailableSelected).map((trailer) => (
                  <option key={trailer.id} value={trailer.id} disabled={Boolean(trailer.reason) && !showUnavailable && trailer.id !== assignForm.trailerId}>
                    {trailer.unit}
                    {trailer.reason ? ` (Unavailable: ${trailer.reason})` : ""}
                  </option>
                ))}
              </Select>
            </FormField>
            {canOverride && (rateConMissing || hasConflicts) ? (
              <FormField label="Override reason" htmlFor="assignOverrideReason" hint="Required for admin overrides">
                <Input
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  placeholder="Document why this override is needed"
                />
              </FormField>
            ) : null}
            <Button onClick={assign} disabled={assignDisabled}>
              {hasConflicts && confirmReassign ? "Confirm reassignment" : "Assign"}
            </Button>
            {selectedLoad?.assignedDriverId ? (
              <Button variant="secondary" onClick={unassign}>
                Unassign
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
            <CheckboxField
              id="showUnavailable"
              label="Show unavailable"
              checked={showUnavailable}
              onChange={(event) => setShowUnavailable(event.target.checked)}
            />
            {selectedDriver ? (
              <button
                type="button"
                className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-xs text-ink"
                onClick={() => setDriverInfo({ open: true, driver: selectedDriver })}
              >
                {selectedDriver.name ?? "Driver"} · {selectedDriverIdentity.summary}
              </button>
            ) : null}
          </div>
          {assignError ? <div className="text-sm text-[color:var(--color-danger)]">{assignError}</div> : null}
        </Card>
      ) : (
        <EmptyState
          title="No loads ready for dispatch."
          description="Assignments will appear once loads are planned or need attention."
          action={
            <Button variant="secondary" onClick={() => router.push("/loads")}>
              Open loads
            </Button>
          }
        />
      )}

      {selectedLoad && driverInfo.open ? (
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Driver info</div>
            <Button size="sm" variant="secondary" onClick={() => setDriverInfo({ open: false, driver: null })}>
              Close
            </Button>
          </div>
          <div className="mt-3 text-sm text-[color:var(--color-text-muted)]">
            {driverInfo.driver && driverInfoIdentity ? (
              <>
                <div>Name: {driverInfo.driver.name ?? "Driver"}</div>
                <div>Terminal: {driverInfoIdentity.terminal}</div>
                <div>Reliability: {driverInfoIdentity.reliability}</div>
                <div>Docs: {driverInfoIdentity.docs}</div>
                <div>Tracking: {driverInfoIdentity.tracking}</div>
                <div>Last known: {driverInfoIdentity.lastKnown}</div>
              </>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Refine" subtitle="Filter down to what you need" />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowFilters((prev) => !prev)}>
            {showFilters ? "Hide filters" : "Show filters"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowManifest((prev) => !prev)}>
            {showManifest ? "Hide manifests" : "Manifests"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowLegs((prev) => !prev)}>
            {showLegs ? "Hide legs" : "Legs"}
          </Button>
        </div>
      </div>

      {showFilters ? (
        <RefinePanel>
          <div className="grid gap-3 lg:grid-cols-4">
            <FormField label="Search" htmlFor="dispatchSearch">
              <Input
                placeholder="Load #, customer, destination"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </FormField>
            <FormField label="Status" htmlFor="dispatchStatus">
              <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">All statuses</option>
                <option value="PLANNED">Planned</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_TRANSIT">In transit</option>
                <option value="DELIVERED">Delivered</option>
                <option value="READY_TO_INVOICE">Ready to invoice</option>
                <option value="INVOICED">Invoiced</option>
              </Select>
            </FormField>
            <FormField label="Driver" htmlFor="dispatchDriver">
              <Select value={filters.driverId} onChange={(e) => setFilters({ ...filters, driverId: e.target.value })}>
                <option value="">All drivers</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Assignment" htmlFor="dispatchAssigned">
              <Select value={filters.assigned} onChange={(e) => setFilters({ ...filters, assigned: e.target.value })}>
                <option value="all">All assignments</option>
                <option value="assigned">Assigned</option>
                <option value="unassigned">Unassigned</option>
              </Select>
            </FormField>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-[color:var(--color-text-muted)]">Advanced filters</summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <FormField label="Truck" htmlFor="dispatchTruck">
                <Select value={filters.truckId} onChange={(e) => setFilters({ ...filters, truckId: e.target.value })}>
                  <option value="">All trucks</option>
                  {trucks.map((truck) => (
                    <option key={truck.id} value={truck.id}>
                      {truck.unit}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Trailer" htmlFor="dispatchTrailer">
                <Select value={filters.trailerId} onChange={(e) => setFilters({ ...filters, trailerId: e.target.value })}>
                  <option value="">All trailers</option>
                  {trailers.map((trailer) => (
                    <option key={trailer.id} value={trailer.id}>
                      {trailer.unit}
                    </option>
                  ))}
                </Select>
              </FormField>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="From" htmlFor="dispatchFromDate">
                  <Input
                    type="date"
                    value={filters.fromDate}
                    onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                  />
                </FormField>
                <FormField label="To" htmlFor="dispatchToDate">
                  <Input
                    type="date"
                    value={filters.toDate}
                    onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                  />
                </FormField>
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <FormField label="Destination search" htmlFor="dispatchDestSearch">
                <Input
                  placeholder="City, state, zip, or name"
                  value={filters.destSearch}
                  onChange={(e) => setFilters({ ...filters, destSearch: e.target.value })}
                />
              </FormField>
              <FormField label="Min rate" htmlFor="dispatchMinRate">
                <Input placeholder="1000" value={filters.minRate} onChange={(e) => setFilters({ ...filters, minRate: e.target.value })} />
              </FormField>
              <FormField label="Max rate" htmlFor="dispatchMaxRate">
                <Input placeholder="5000" value={filters.maxRate} onChange={(e) => setFilters({ ...filters, maxRate: e.target.value })} />
              </FormField>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <FormField label="Operating entity" htmlFor="dispatchOperatingEntity">
                <Select
                  value={filters.operatingEntityId}
                  onChange={(e) => setFilters({ ...filters, operatingEntityId: e.target.value })}
                >
                  <option value="">All operating entities</option>
                  {operatingEntities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name} {entity.isDefault ? "(Default)" : ""}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setPageIndex(0);
                loadDispatchLoads(filters, 0);
              }}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setFilters(defaultFilters);
                setPageIndex(0);
                loadDispatchLoads(defaultFilters, 0);
              }}
            >
              Reset
            </Button>
          </div>
        </RefinePanel>
      ) : null}

      {showManifest ? <ManifestPanel trailers={trailers} trucks={trucks} drivers={drivers} /> : null}

      {view === "compact" ? (
        <Card>
          <div className="grid gap-3">
            <div className="hidden grid-cols-7 gap-2 text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)] lg:grid">
              <div>Status</div>
              <div>Load</div>
              <div>Customer</div>
              <div>Driver</div>
              <div>Trailer</div>
              <div>Miles</div>
              <div>Rate</div>
            </div>
            {sortedLoads.map((load) => (
              <button
                key={load.id}
                type="button"
                onClick={() => setSelectedLoadId(load.id)}
                className="grid grid-cols-1 gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2 text-left text-sm lg:grid-cols-7"
              >
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">{load.status}</div>
                <div className="space-y-1">
                  <div className="font-semibold">{load.loadNumber}</div>
                  {load.riskFlags?.needsAssignment ? (
                    <div className="text-xs text-[color:var(--color-danger)]">Needs assignment</div>
                  ) : load.riskFlags?.atRisk ? (
                    <div className="text-xs text-[color:var(--color-warning)]">At risk</div>
                  ) : null}
                </div>
                <div>{load.customerName ?? "-"}</div>
                <div>{load.assignment?.driver?.name ?? "Unassigned"}</div>
                <div>{load.assignment?.trailer?.unit ?? "-"}</div>
                <div>{load.miles ?? "-"}</div>
                <div>{load.rate ?? "-"}</div>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className={view === "board" ? "grid gap-4 lg:grid-cols-3" : "grid gap-4"}>
          {(view === "board"
            ? [
                { status: "PLANNED", title: "Planned" },
                { status: "ASSIGNED", title: "Assigned" },
                { status: "IN_TRANSIT", title: "In transit" },
                { status: "DELIVERED", title: "Delivered" },
                { status: "READY_TO_INVOICE", title: "Ready to invoice" },
                { status: "INVOICED", title: "Invoiced" },
              ]
            : [{ status: "ALL", title: "All loads" }]
          ).map((bucket) => {
            const bucketLoads = bucket.status === "ALL" ? sortedLoads : sortedLoads.filter((load) => load.status === bucket.status);
            if (view === "board" && bucketLoads.length === 0) {
              return null;
            }
            return (
              <div key={bucket.status} className="grid gap-4">
                {view === "board" ? (
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">{bucket.title}</div>
                ) : null}
                {bucketLoads.map((load) => (
                  <Card key={load.id} className={`space-y-3 ${selectedLoadId === load.id ? "ring-2 ring-[color:var(--color-accent-soft)]" : ""}`}>
                    <button type="button" className="text-left" onClick={() => setSelectedLoadId(load.id)}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">{load.status}</div>
                          <div className="text-xl font-semibold">{load.loadNumber}</div>
                          <div className="text-sm text-[color:var(--color-text-muted)]">{load.customerName ?? "Customer"}</div>
                          {load.route?.shipperCity || load.route?.consigneeCity ? (
                            <div className="text-xs text-[color:var(--color-text-muted)]">
                              {load.route?.shipperCity ?? "-"}, {load.route?.shipperState ?? "-"} {"->"}{" "}
                              {load.route?.consigneeCity ?? "-"}, {load.route?.consigneeState ?? "-"}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-1 text-xs text-[color:var(--color-text-muted)]">
                          {load.riskFlags?.needsAssignment ? (
                            <span className="text-[color:var(--color-danger)]">Needs assignment</span>
                          ) : null}
                          {load.riskFlags?.trackingOffInTransit ? (
                            <span className="text-[color:var(--color-warning)]">Tracking off</span>
                          ) : null}
                          {load.riskFlags?.overdueStopWindow ? (
                            <span className="text-[color:var(--color-warning)]">Overdue stop window</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-sm text-[color:var(--color-text-muted)]">
                        Assigned: {load.assignment?.driver?.name ?? "Unassigned"} - Truck {load.assignment?.truck?.unit ?? "-"} - Trailer{" "}
                        {load.assignment?.trailer?.unit ?? "-"} - Miles {load.miles ?? "-"} - Rate {load.rate ?? "-"}
                      </div>
                      {load.nextStop ? (
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          Next stop: {load.nextStop.name} - {load.nextStop.city}, {load.nextStop.state}
                        </div>
                      ) : null}
                    </button>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[color:var(--color-text-muted)]">
          Page {pageIndex + 1} of {totalPages} - {totalCount} loads
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))} disabled={pageIndex === 0}>
            Prev
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
            disabled={pageIndex >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      </div>

      {selectedLoad && showLegs ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeader title="Selected load details" subtitle="Stops, legs, and operational updates" />
            <Button size="sm" variant="secondary" onClick={() => setShowStopActions((prev) => !prev)}>
              {showStopActions ? "Hide stop actions" : "Update stop"}
            </Button>
          </div>
          <div className="grid gap-3">
            {selectedLoad.stops?.map((stop: any) => (
              <div
                key={stop.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-2"
              >
                <div>
                  <div className="text-sm font-semibold">
                    {stop.type} - {stop.name}
                  </div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Status: {stop.status ?? "PLANNED"}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    Arrived: {stop.arrivedAt ? new Date(stop.arrivedAt).toLocaleTimeString() : "-"} - Departed:{" "}
                    {stop.departedAt ? new Date(stop.departedAt).toLocaleTimeString() : "-"}
                  </div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    Delay: {stop.delayReason ?? "None"} - Detention: {stop.detentionMinutes ?? 0} min
                  </div>
                </div>
                {showStopActions ? (
                  <div className="flex flex-col gap-2">
                    <Button variant="secondary" onClick={() => markArrive(selectedLoad.id, stop.id)}>
                      Mark arrived
                    </Button>
                    <Button variant="secondary" onClick={() => markDepart(selectedLoad.id, stop.id)}>
                      Mark departed
                    </Button>
                    <FormField label="Delay reason" htmlFor={`delayReason-${stop.id}`}>
                      <Select defaultValue={stop.delayReason ?? ""}>
                        <option value="">Delay reason</option>
                        <option value="SHIPPER_DELAY">Shipper delay</option>
                        <option value="RECEIVER_DELAY">Receiver delay</option>
                        <option value="TRAFFIC">Traffic</option>
                        <option value="WEATHER">Weather</option>
                        <option value="BREAKDOWN">Breakdown</option>
                        <option value="OTHER">Other</option>
                      </Select>
                    </FormField>
                    <FormField label="Delay notes" htmlFor={`delayNotes-${stop.id}`}>
                      <Textarea
                        className="min-h-[60px]"
                        defaultValue={stop.delayNotes ?? ""}
                        placeholder="Add context if needed"
                      />
                    </FormField>
                    <Button
                      variant="ghost"
                      onClick={(event) => {
                        const parent = event.currentTarget.parentElement;
                        const select = parent?.querySelector("select") as HTMLSelectElement | null;
                        const notes = parent?.querySelector("textarea") as HTMLTextAreaElement | null;
                        updateDelay(stop.id, select?.value || null, notes?.value || null);
                      }}
                    >
                      Save delay
                    </Button>
                  </div>
                ) : (
                  <div className="text-xs text-[color:var(--color-text-muted)]">Use “Update stop” to make changes.</div>
                )}
              </div>
            ))}
          </div>
          <LegsPanel
            load={selectedLoad}
            drivers={showUnavailable ? [...availableDrivers, ...unavailableDrivers] : availableDrivers}
            trucks={showUnavailable ? [...availableTrucks, ...unavailableTrucks] : availableTrucks}
            trailers={showUnavailable ? [...availableTrailers, ...unavailableTrailers] : availableTrailers}
            rateConMissing={rateConMissing}
            canOverride={canOverride}
            overrideReason={overrideReason}
            onUpdated={() => {
              if (selectedLoad) refreshSelectedLoad(selectedLoad.id);
            }}
          />
        </Card>
      ) : null}
    </AppShell>
  );
}

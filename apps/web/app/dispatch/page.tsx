"use client";

export const dynamic = "force-dynamic";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { SectionHeader } from "@/components/ui/section-header";
import { RefinePanel } from "@/components/ui/refine-panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState } from "@/components/ui/empty-state";
import { BlockedScreen } from "@/components/ui/blocked-screen";
import { NoAccess } from "@/components/rbac/no-access";
import type { AssignmentSuggestion } from "@/components/assignment-assist/SuggestedAssignments";
import { DispatchBrowse } from "@/components/dispatch/DispatchBrowse";
import { WorkbenchRightPane } from "@/components/dispatch/WorkbenchRightPane";
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
  teamId: "",
};

type Filters = typeof defaultFilters;
type QueueView = "active" | "recent" | "history";

function DispatchPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loads, setLoads] = useState<DispatchItem[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [trucks, setTrucks] = useState<TruckRecord[]>([]);
  const [trailers, setTrailers] = useState<TrailerRecord[]>([]);
  const [operatingEntities, setOperatingEntities] = useState<Array<{ id: string; name: string; isDefault?: boolean }>>(
    []
  );
  const [teams, setTeams] = useState<Array<{ id: string; name: string; active?: boolean }>>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [browseLens, setBrowseLens] = useState<"board" | "list">("board");
  const [showFilters, setShowFilters] = useState(false);
  const [showManifest, setShowManifest] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [selectedLoad, setSelectedLoad] = useState<any | null>(null);
  const [dispatchSettings, setDispatchSettings] = useState<any | null>(null);
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [assignmentMode, setAssignmentMode] = useState<"solo" | "team">("solo");
  const [assignForm, setAssignForm] = useState({ driverId: "", coDriverId: "", truckId: "", trailerId: "" });
  const [assignmentSuggestions, setAssignmentSuggestions] = useState<AssignmentSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [suggestionLogId, setSuggestionLogId] = useState<string | null>(null);
  const [suggestionMeta, setSuggestionMeta] = useState<{ modelVersion: string; weightsVersion?: string } | null>(null);
  const [assistOverrideReason, setAssistOverrideReason] = useState("");
  const [legDrawerOpen, setLegDrawerOpen] = useState(false);
  const [legAddedNote, setLegAddedNote] = useState(false);
  const [workbenchTeamId, setWorkbenchTeamId] = useState("");
  const [teamAssigning, setTeamAssigning] = useState(false);
  const [teamAssignError, setTeamAssignError] = useState<string | null>(null);
  const [confirmReassign, setConfirmReassign] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [showStopActions, setShowStopActions] = useState(false);
  const [blocked, setBlocked] = useState<{ message?: string; ctaHref?: string } | null>(null);
  const pendingLoadIdRef = useRef<string | null>(null);

  const loadIdParam = searchParams.get("loadId");
  const queueView = useMemo<QueueView>(() => {
    const value = searchParams.get("queueView");
    if (value === "recent" || value === "history") return value;
    return "active";
  }, [searchParams]);

  const updateLoadIdParam = useCallback(
    (loadId: string | null) => {
      pendingLoadIdRef.current = loadId;
      const params = new URLSearchParams(searchParams.toString());
      if (loadId) {
        params.set("loadId", loadId);
      } else {
        params.delete("loadId");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const updateQueueViewParam = useCallback(
    (nextView: QueueView) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextView === "active") {
        params.delete("queueView");
      } else {
        params.set("queueView", nextView);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
      setPageIndex(0);
    },
    [pathname, router, searchParams]
  );

  const selectedLoadInView = Boolean(selectedLoadId && loads.some((load) => load.id === selectedLoadId));



  const updateAssignmentMode = useCallback((nextMode: "solo" | "team") => {
    setAssignmentMode(nextMode);
    if (nextMode === "solo") {
      setAssignForm((prev) => ({ ...prev, coDriverId: "" }));
    }
  }, []);

  const selectLoad = useCallback(
    (loadId: string) => {
      setSelectedLoadId(loadId);
      updateLoadIdParam(loadId);
    },
    [updateLoadIdParam]
  );

  const clearSelectedLoad = useCallback(() => {
    setSelectedLoadId(null);
    setSelectedLoad(null);
    setLegDrawerOpen(false);
    setLegAddedNote(false);
    updateLoadIdParam(null);
  }, [updateLoadIdParam]);


  const handleLegCreated = useCallback(() => {
    setLegDrawerOpen(false);
    setLegAddedNote(true);
    window.setTimeout(() => setLegAddedNote(false), 2000);
  }, []);

  const canDispatch = Boolean(
    user && (user.role === "ADMIN" || user.role === "DISPATCHER" || user.role === "HEAD_DISPATCHER")
  );
  const isQueueReadOnly = queueView !== "active";
  const canStartTracking = Boolean(
    user && (user.role === "ADMIN" || user.role === "DISPATCHER" || user.role === "HEAD_DISPATCHER")
  );
  const canSeeAllTeams = Boolean(
    user?.role === "ADMIN" || user?.role === "HEAD_DISPATCHER" || user?.canSeeAllTeams
  );
  const canAssignTeamsOps = Boolean(user?.role === "ADMIN" || user?.role === "HEAD_DISPATCHER");
  const canOverride = user?.role === "ADMIN";
  const dispatchStage =
    selectedLoad?.status && ["DRAFT", "PLANNED", "ASSIGNED"].includes(selectedLoad.status);
  const rateConRequired = Boolean(dispatchSettings?.requireRateConBeforeDispatch && selectedLoad?.loadType === "BROKERED");
  const hasRateCon = (selectedLoad?.docs ?? []).some(
    (doc: any) => doc.type === "RATECON" || doc.type === "RATE_CONFIRMATION"
  );
  const rateConMissing = Boolean(dispatchStage && rateConRequired && !hasRateCon);
  const coDriverConflict =
    assignmentMode === "team" &&
    Boolean(assignForm.coDriverId) &&
    assignForm.coDriverId === assignForm.driverId;
  const assignDisabled =
    isQueueReadOnly ||
    !assignForm.driverId ||
    coDriverConflict ||
    (rateConMissing && !canOverride) ||
    (rateConMissing && canOverride && !overrideReason.trim());

  useEffect(() => {
    apiFetch<{ user: any }>("/auth/me")
      .then((data) => {
        setUser(data.user);
        const allowed =
          data.user?.role === "ADMIN" || data.user?.role === "DISPATCHER" || data.user?.role === "HEAD_DISPATCHER";
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
    const teamFromUrl = canSeeAllTeams ? params.get("teamId") : "";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const value = fromUrl || stored || "";
    setFilters((prev) => ({
      ...prev,
      operatingEntityId: value,
      teamId: teamFromUrl || "",
    }));
  }, [hasAccess, canSeeAllTeams]);

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
    if (canSeeAllTeams && filters.teamId) {
      params.set("teamId", filters.teamId);
    } else {
      params.delete("teamId");
    }
    const query = params.toString();
    router.replace(query ? `/dispatch?${query}` : "/dispatch");
  }, [filters.operatingEntityId, filters.teamId, hasAccess, router, canSeeAllTeams]);

  useEffect(() => {
    if (!loadIdParam) {
      if (pendingLoadIdRef.current) {
        return;
      }
      if (selectedLoadId) {
        clearSelectedLoad();
      }
      return;
    }
    if (pendingLoadIdRef.current === loadIdParam) {
      pendingLoadIdRef.current = null;
    }
    if (loadIdParam !== selectedLoadId) {
      setSelectedLoadId(loadIdParam);
    }
  }, [loadIdParam, selectedLoadId, clearSelectedLoad]);

  const loadAssets = useCallback(async () => {
    if (!canDispatch) return;
    try {
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
      setDispatchError(null);
    } catch (error) {
      setDispatchError((error as Error).message || "Unable to load dispatch assets.");
    }
  }, [canDispatch]);

  useEffect(() => {
    if (!canSeeAllTeams) {
      setTeams([]);
      setFilters((prev) => ({ ...prev, teamId: "" }));
      return;
    }
    apiFetch<{ teams: Array<{ id: string; name: string; active?: boolean }> }>("/teams")
      .then((data) => setTeams(data.teams ?? []))
      .catch(() => setTeams([]));
  }, [canSeeAllTeams]);

  useEffect(() => {
    if (!canDispatch) return;
    loadAssets();
  }, [canDispatch, loadAssets]);

  const buildParams = useCallback((nextFilters = filters, page = pageIndex) => {
    const params = new URLSearchParams();
    params.set("view", "dispatch");
    params.set("queueView", queueView);
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
    if (canSeeAllTeams && nextFilters.teamId) params.set("teamId", nextFilters.teamId);
    return params.toString();
  }, [filters, pageIndex, canSeeAllTeams, queueView]);

  const loadDispatchLoads = useCallback(async (nextFilters = filters, page = pageIndex) => {
    if (!canDispatch) return;
    try {
      const query = buildParams(nextFilters, page);
      const url = query ? `/loads?${query}` : "/loads?view=dispatch";
      const data = await apiFetch<{ items: DispatchItem[]; total: number; totalPages: number }>(url);
      setLoads(data.items ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotalCount(data.total ?? 0);
      setDispatchError(null);
    } catch (error) {
      setDispatchError((error as Error).message || "Unable to load dispatch queue.");
    }
  }, [canDispatch, buildParams, filters, pageIndex]);

  useEffect(() => {
    if (!canDispatch) return;
    loadDispatchLoads(filters, pageIndex);
  }, [canDispatch, pageIndex, filters, loadDispatchLoads]);

  useEffect(() => {
    if (selectedLoadId) return;
    setSelectedLoad(null);
  }, [selectedLoadId]);

  useEffect(() => {
    setLegDrawerOpen(false);
    setLegAddedNote(false);
  }, [selectedLoadId]);

  useEffect(() => {
    if (!selectedLoadId) {
      setWorkbenchTeamId("");
      setTeamAssignError(null);
      return;
    }
    if (canSeeAllTeams && filters.teamId) {
      setWorkbenchTeamId(filters.teamId);
      return;
    }
    setWorkbenchTeamId("");
  }, [selectedLoadId, filters.teamId, canSeeAllTeams]);

  const refreshSelectedLoad = useCallback(async (loadId: string) => {
    if (!canDispatch) return;
    try {
      const data = await apiFetch<{ load: any; settings?: any | null }>(`/loads/${loadId}/dispatch-detail`);
      setSelectedLoad(data.load ?? null);
      setDispatchSettings(data.settings ?? null);
      setAssignError(null);
      const selectedCoDriverId =
        data.load?.assignmentMembers?.find((member: any) => member.role === "CO_DRIVER")?.driverId ?? "";
      setAssignForm({
        driverId: data.load?.assignedDriverId ?? "",
        coDriverId: selectedCoDriverId,
        truckId: data.load?.truckId ?? "",
        trailerId: data.load?.trailerId ?? "",
      });
      setAssignmentMode(selectedCoDriverId ? "team" : "solo");
      setDispatchError(null);
      return data.load ?? null;
    } catch (error) {
      setAssignError((error as Error).message || "Unable to refresh load details.");
      setDispatchError((error as Error).message || "Unable to refresh load details.");
      return null;
    }
  }, [canDispatch]);

  useEffect(() => {
    if (!selectedLoadId || !selectedLoadInView || !canDispatch) return;
    refreshSelectedLoad(selectedLoadId);
    const teamQuery = canSeeAllTeams && filters.teamId ? `&teamId=${filters.teamId}` : "";
    apiFetch<AvailabilityData>(`/dispatch/availability?loadId=${selectedLoadId}${teamQuery}`)
      .then((data) => setAvailability(data))
      .catch(() => setAvailability(null));
  }, [selectedLoadId, selectedLoadInView, canDispatch, refreshSelectedLoad, filters.teamId, canSeeAllTeams]);

  useEffect(() => {
    if (!selectedLoadId || !selectedLoadInView || !canDispatch || isQueueReadOnly) {
      setAssignmentSuggestions([]);
      setSuggestionsError(null);
      setSuggestionLogId(null);
      setSuggestionMeta(null);
      return;
    }
    let active = true;
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    (async () => {
      try {
        const data = await apiFetch<any>(`/loads/${selectedLoadId}/assignment-suggestions?limit=5`);
        if (!active) return;
        setAssignmentSuggestions(data.suggestions ?? []);
        setSuggestionMeta({ modelVersion: data.modelVersion, weightsVersion: data.weightsVersion });
        try {
          const log = await apiFetch<{ logId?: string }>(`/loads/${selectedLoadId}/assignment-suggestions/log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              modelVersion: data.modelVersion,
              weightsVersion: data.weightsVersion,
              suggestions: data.suggestions ?? [],
            }),
          });
          if (active) {
            setSuggestionLogId(log.logId ?? null);
          }
        } catch (error) {
          if (active) {
            setSuggestionLogId(null);
          }
        }
      } catch (error) {
        if (!active) return;
        setAssignmentSuggestions([]);
        setSuggestionMeta(null);
        setSuggestionLogId(null);
        setSuggestionsError((error as Error).message);
      } finally {
        if (active) {
          setSuggestionsLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedLoadId, selectedLoadInView, canDispatch, isQueueReadOnly]);

  useEffect(() => {
    setConfirmReassign(false);
    setAssignError(null);
    setOverrideReason("");
  }, [assignForm.driverId, assignForm.coDriverId, assignForm.truckId, assignForm.trailerId, selectedLoadId, showUnavailable]);

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

  const buildConflictMessages = (driverId?: string, coDriverId?: string, truckId?: string, trailerId?: string) => {
    const conflicts: string[] = [];
    if (driverId) {
      const driver = unavailableDrivers.find((item) => item.id === driverId);
      if (driver) {
        conflicts.push(`Driver: Assigning this driver will move them from ${driver.reason ?? "another load"}.`);
      }
    }
    if (coDriverId) {
      const coDriver = unavailableDrivers.find((item) => item.id === coDriverId);
      if (coDriver) {
        conflicts.push(`Co-driver: Assigning this driver will move them from ${coDriver.reason ?? "another load"}.`);
      }
    }
    if (truckId) {
      const truck = unavailableTrucks.find((item) => item.id === truckId);
      if (truck) {
        conflicts.push(`Truck: Assigning this truck will move it from ${truck.reason ?? "another load"}.`);
      }
    }
    if (trailerId) {
      const trailer = unavailableTrailers.find((item) => item.id === trailerId);
      if (trailer) {
        conflicts.push(`Trailer: Assigning this trailer will move it from ${trailer.reason ?? "another load"}.`);
      }
    }
    return conflicts;
  };

  const logSuggestionChoice = async (params: { driverId: string; truckId?: string | null; overrideReason?: string | null }) => {
    if (!selectedLoad || !suggestionMeta) return;
    try {
      await apiFetch(`/loads/${selectedLoad.id}/assignment-suggestions/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logId: suggestionLogId ?? undefined,
          modelVersion: suggestionMeta.modelVersion,
          weightsVersion: suggestionMeta.weightsVersion,
          suggestions: suggestionLogId ? undefined : assignmentSuggestions,
          chosenDriverId: params.driverId,
          chosenTruckId: params.truckId ?? undefined,
          overrideReason: params.overrideReason ?? undefined,
        }),
      });
    } catch (error) {
      // non-blocking
    }
  };

  const performAssign = async (params: { driverId: string; coDriverId?: string; truckId?: string; trailerId?: string }) => {
    if (isQueueReadOnly) return;
    if (!selectedLoad) return;
    if (!params.driverId) return;
    const conflicts = buildConflictMessages(params.driverId, params.coDriverId, params.truckId, params.trailerId);
    if (conflicts.length > 0 && !confirmReassign) {
      setConfirmReassign(true);
      return;
    }
    setAssignError(null);
    try {
      await apiFetch(`/loads/${selectedLoad.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryDriverId: params.driverId,
          coDriverId: assignmentMode === "team" ? params.coDriverId || undefined : undefined,
          truckId: params.truckId || undefined,
          trailerId: params.trailerId || undefined,
          overrideReason: overrideReason || undefined,
        }),
      });
      const updated = await refreshSelectedLoad(selectedLoad.id);
      if (updated) {
        patchLoadSummary(updated);
      }
      const suggestionDriverIds = new Set(assignmentSuggestions.map((suggestion) => suggestion.driverId));
      const needsOverride = assignmentSuggestions.length > 0 && !suggestionDriverIds.has(params.driverId);
      await logSuggestionChoice({
        driverId: params.driverId,
        truckId: params.truckId ?? null,
        overrideReason: needsOverride ? assistOverrideReason || null : null,
      });
      setConfirmReassign(false);
      setOverrideReason("");
      setAssistOverrideReason("");
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

  const assign = async () => {
    await performAssign({
      driverId: assignForm.driverId,
      coDriverId: assignmentMode === "team" ? assignForm.coDriverId : undefined,
      truckId: assignForm.truckId || undefined,
      trailerId: assignForm.trailerId || undefined,
    });
  };

  const assignFromSuggestion = async (driverId: string, truckId?: string | null) => {
    if (isQueueReadOnly) return;
    setAssignForm((prev) => ({ ...prev, driverId, truckId: truckId ?? prev.truckId }));
    setAssistOverrideReason("");
    await performAssign({
      driverId,
      coDriverId: assignmentMode === "team" ? assignForm.coDriverId : undefined,
      truckId: (truckId ?? assignForm.truckId) || undefined,
      trailerId: assignForm.trailerId || undefined,
    });
  };

  const unassign = async () => {
    if (isQueueReadOnly) return;
    if (!selectedLoad) return;
    await apiFetch(`/loads/${selectedLoad.id}/unassign`, { method: "POST" });
    const updated = await refreshSelectedLoad(selectedLoad.id);
    if (updated) {
      patchLoadSummary(updated);
    }
  };

  const assignTeamForLoad = async (teamId: string) => {
    if (isQueueReadOnly) return;
    if (!selectedLoad || !teamId) return;
    setTeamAssignError(null);
    setTeamAssigning(true);
    try {
      await apiFetch("/teams/assign-loads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          loadIds: [selectedLoad.id],
        }),
      });
      setWorkbenchTeamId(teamId);
    } catch (err) {
      const message = (err as Error).message || "Failed to update team.";
      if (message.toLowerCase().includes("forbidden") || message.toLowerCase().includes("not authorized")) {
        setTeamAssignError("You don’t have permission to reassign loads. Ask an admin.");
      } else {
        setTeamAssignError(message);
      }
    } finally {
      setTeamAssigning(false);
    }
  };

  const markArrive = async (loadId: string, stopId: string) => {
    if (isQueueReadOnly) return;
    await apiFetch(`/loads/${loadId}/stops/${stopId}/arrive`, { method: "POST" });
    const updated = await refreshSelectedLoad(loadId);
    if (updated) {
      patchLoadSummary(updated);
    }
  };

  const markDepart = async (loadId: string, stopId: string) => {
    if (isQueueReadOnly) return;
    await apiFetch(`/loads/${loadId}/stops/${stopId}/depart`, { method: "POST" });
    const updated = await refreshSelectedLoad(loadId);
    if (updated) {
      patchLoadSummary(updated);
    }
  };

  const updateDelay = async (stopId: string, delayReason?: string | null, delayNotes?: string | null) => {
    if (isQueueReadOnly) return;
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
  const teamsEnabled = useMemo(() => teams.some((team) => team.name && team.name !== "Default"), [teams]);

  const suggestionDriverIds = useMemo(
    () => new Set(assignmentSuggestions.map((suggestion) => suggestion.driverId)),
    [assignmentSuggestions]
  );
  const assignmentNotSuggested =
    Boolean(assignForm.driverId) && assignmentSuggestions.length > 0 && !suggestionDriverIds.has(assignForm.driverId);

  useEffect(() => {
    if (!assignmentNotSuggested) {
      setAssistOverrideReason("");
    }
  }, [assignmentNotSuggested]);

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
    if (queueView !== "active") return loads;
    return [...loads].sort((a, b) => {
      const aPriority = a.riskFlags?.needsAssignment ? 0 : a.riskFlags?.atRisk ? 1 : 2;
      const bPriority = b.riskFlags?.needsAssignment ? 0 : b.riskFlags?.atRisk ? 1 : 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aTime = a.riskFlags?.nextStopTime ? new Date(a.riskFlags.nextStopTime).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.riskFlags?.nextStopTime ? new Date(b.riskFlags.nextStopTime).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [loads, queueView]);

  const selectedLoadSummary = useMemo(() => {
    if (!selectedLoadId) return null;
    return sortedLoads.find((load) => load.id === selectedLoadId) ?? null;
  }, [sortedLoads, selectedLoadId]);

  const workbenchAssignment = {
    form: assignForm,
    setForm: setAssignForm,
    assignmentMode,
    setAssignmentMode: updateAssignmentMode,
    coDriverConflict,
    availableDrivers,
    unavailableDrivers,
    availableTrucks,
    unavailableTrucks,
    availableTrailers,
    unavailableTrailers,
    showUnavailable,
    setShowUnavailable,
    assignDisabled,
    assignError,
    assign,
    unassign,
    assignFromSuggestion,
    suggestions: assignmentSuggestions,
    suggestionsLoading,
    suggestionsError,
    assignmentNotSuggested,
    assistOverrideReason,
    setAssistOverrideReason,
    canOverride,
    overrideReason,
    setOverrideReason,
    rateConMissing,
    hasConflicts,
    conflictMessages,
    confirmReassign,
    assignedSummary: {
      driverName: selectedLoadSummary?.assignment?.driver?.name ?? selectedLoad?.driver?.name ?? null,
      coDriverName:
        selectedLoad?.assignmentMembers?.find((member: any) => member.role === "CO_DRIVER")?.driver?.name ?? null,
      truckUnit: selectedLoadSummary?.assignment?.truck?.unit ?? selectedLoad?.truck?.unit ?? null,
      trailerUnit: selectedLoadSummary?.assignment?.trailer?.unit ?? selectedLoad?.trailer?.unit ?? null,
    },
  };

  const legDrawerContent = selectedLoad ? (
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
      onCreated={handleLegCreated}
    />
  ) : null;

  const workbenchRightPane = selectedLoad ? (
    <WorkbenchRightPane
      load={selectedLoad}
      loadSummary={selectedLoadSummary}
      statusTone={statusTone}
      readOnly={isQueueReadOnly}
      onClose={clearSelectedLoad}
      onRefresh={() => {
        if (selectedLoad) refreshSelectedLoad(selectedLoad.id);
      }}
      assignment={workbenchAssignment}
      showStopActions={showStopActions}
      onToggleStopActions={() => {
        if (isQueueReadOnly) return;
        setShowStopActions((prev) => !prev);
      }}
      onMarkArrive={markArrive}
      onMarkDepart={markDepart}
      onUpdateDelay={updateDelay}
      legDrawerOpen={legDrawerOpen}
      onOpenLegDrawer={() => {
        if (isQueueReadOnly) return;
        setLegDrawerOpen(true);
      }}
      onCloseLegDrawer={() => setLegDrawerOpen(false)}
      legDrawerContent={legDrawerContent ?? undefined}
      legAddedNote={legAddedNote ? "✓ Added" : null}
      canStartTracking={canStartTracking}
      teamAssignment={
        canAssignTeamsOps && teamsEnabled && !isQueueReadOnly
          ? {
              enabled: true,
              teams,
              value: workbenchTeamId,
              onChange: assignTeamForLoad,
              loading: teamAssigning,
              error: teamAssignError,
            }
          : undefined
      }
    />
  ) : undefined;

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
        <SectionHeader title="Refine" subtitle="Filter down to what you need" />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowFilters((prev) => !prev)}>
            {showFilters ? "Hide filters" : "Show filters"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowManifest((prev) => !prev)}>
            {showManifest ? "Hide manifests" : "Manifests"}
          </Button>
        </div>
      </div>

      {dispatchError ? (
        <div className="rounded-[var(--radius-card)] border border-[color:var(--color-warning-soft)] bg-[color:var(--color-warning-soft)]/60 px-4 py-3 text-sm text-[color:var(--color-warning)]">
          {dispatchError}
        </div>
      ) : null}

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
              {canSeeAllTeams ? (
                <FormField label="Team" htmlFor="dispatchTeam">
                  <Select value={filters.teamId} onChange={(e) => setFilters({ ...filters, teamId: e.target.value })}>
                    <option value="">All teams</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : null}
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Browse" subtitle="Board or list view of dispatch-ready loads" />
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={queueView}
            options={[
              { label: "Active", value: "active" },
              { label: "Recent", value: "recent" },
              { label: "History", value: "history" },
            ]}
            onChange={(value) => updateQueueViewParam(value as QueueView)}
          />
          <SegmentedControl
            value={browseLens}
            options={[
              { label: "Board", value: "board" },
              { label: "List", value: "list" },
            ]}
            onChange={(value) => setBrowseLens(value as "board" | "list")}
          />
        </div>
      </div>

      <div
        className={`grid gap-4 ${
          selectedLoadId ? "lg:grid-cols-[minmax(420px,590px)_minmax(0,1fr)]" : ""
        }`}
      >
        <div className={selectedLoadId ? "min-h-0 max-h-[calc(100dvh-24rem)] overflow-y-auto" : ""}>
          <DispatchBrowse
            loads={sortedLoads}
            selectedLoadId={selectedLoadId}
            onSelectLoad={selectLoad}
            lens={browseLens}
            queueView={queueView}
          />
        </div>
        {selectedLoadId ? (
          <div className="min-h-0 max-h-[calc(100dvh-24rem)] overflow-y-auto">
            {workbenchRightPane ?? (
              <Card>
                <EmptyState title="Loading load..." description="Fetching assignment and stop details." />
              </Card>
            )}
          </div>
        ) : null}
      </div>

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

    </AppShell>
  );
}

export default function DispatchPage() {
  return (
    <Suspense fallback={null}>
      <DispatchPageContent />
    </Suspense>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useUser } from "@/components/auth/user-context";
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
import {
  DISPATCH_OPTIONAL_COLUMNS,
  DISPATCH_REQUIRED_COLUMNS,
  DispatchSpreadsheetGrid,
  type DispatchGridColumnKey,
  type DispatchGridDensity,
  type DispatchGridFilterState,
  type DispatchGridSortRule,
  type DispatchInspectorFocusSection,
  type DispatchGridRow,
} from "@/components/dispatch/DispatchSpreadsheetGrid";
import { DriverLanesPanel } from "@/components/dispatch/DriverLanesPanel";
import { DispatchDocUploadDrawer } from "@/components/dispatch/DispatchDocUploadDrawer";
import { TripsWorkspace } from "@/components/dispatch/TripsWorkspace";
import { WorkbenchRightPane } from "@/components/dispatch/WorkbenchRightPane";
import { apiFetch } from "@/lib/api";
import { getDefaultDispatchWorkspace, getRoleCapabilities, type DispatchWorkspace } from "@/lib/capabilities";
import { buildYardOsPlanningUrl } from "@/lib/yardos";
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
  movementMode?: string | null;
  trip?: {
    id: string;
    tripNumber: string;
    status: string;
  } | null;
  customerName?: string | null;
  rate?: string | number | null;
  miles?: number | null;
  paidMiles?: number | null;
  updatedAt?: string | null;
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
  docs?: {
    hasPod?: boolean;
    hasBol?: boolean;
    hasRateCon?: boolean;
  } | null;
  notesIndicator?: "NONE" | "NORMAL" | "ALERT";
  exceptions?: Array<{
    id: string;
    type: string;
    severity: "WARNING" | "BLOCKER";
    owner: "DISPATCH" | "DRIVER" | "BILLING" | "CUSTOMER" | "SYSTEM";
    status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
    title: string;
  }> | null;
  issuesTop?: Array<{
    type: string;
    label: string;
    severity: "BLOCKER" | "WARNING";
    focusSection?: DispatchInspectorFocusSection | null;
    actionHint: string;
  }> | null;
  issues?: Array<{
    type: string;
    label: string;
    severity: "BLOCKER" | "WARNING";
    focusSection?: DispatchInspectorFocusSection | null;
    actionHint: string;
  }> | null;
  issuesText?: string | null;
  issueCounts?: Record<string, number> | null;
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
type WorkflowQueuePresetId =
  | "needsAssignment"
  | "lateRisk"
  | "missingDocs"
  | "billingPrep"
  | "complianceIssues"
  | "openExceptions"
  | "anyIssues"
  | "missingAppointment"
  | "pendingApprovals";
type PanelDock = "left" | "right" | "bottom";
type BulkStatus =
  | "PLANNED"
  | "ASSIGNED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "POD_RECEIVED"
  | "READY_TO_INVOICE"
  | "INVOICED"
  | "PAID"
  | "CANCELLED";

type DispatchPanels = {
  inspector: boolean;
  tripInspector: boolean;
  driverLanes: boolean;
  exceptions: boolean;
  exceptionsDock: Exclude<PanelDock, "bottom">;
};

type DispatchViewConfig = {
  id: string;
  name: string;
  scope?: "PERSONAL" | "ADMIN_TEMPLATE";
  role?: string | null;
  isRoleDefault?: boolean;
  userId?: string | null;
  filters: Filters;
  density: DispatchGridDensity;
  columns: Partial<Record<DispatchGridColumnKey, boolean>>;
  panels: DispatchPanels;
  grid: {
    filters: DispatchGridFilterState;
    sortRules: DispatchGridSortRule[];
  };
};

type DispatchExceptionItem = {
  id: string;
  loadId: string;
  loadNumber?: string | null;
  tripId?: string | null;
  tripNumber?: string | null;
  type: string;
  severity: "WARNING" | "BLOCKER";
  owner: "DISPATCH" | "DRIVER" | "BILLING" | "CUSTOMER" | "SYSTEM";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  title: string;
  detail?: string | null;
  createdAt: string;
};

const DEFAULT_COLUMNS: Partial<Record<DispatchGridColumnKey, boolean>> = DISPATCH_OPTIONAL_COLUMNS.reduce(
  (acc, key) => ({ ...acc, [key]: key === "tripNumber" }),
  {}
);

const DEFAULT_PANELS: DispatchPanels = {
  inspector: true,
  tripInspector: false,
  driverLanes: false,
  exceptions: false,
  exceptionsDock: "left",
};

const DEFAULT_GRID_STATE: DispatchViewConfig["grid"] = {
  filters: {},
  sortRules: [{ column: "pickupAppt", direction: "asc" }],
};

const SYSTEM_VIEW: DispatchViewConfig = {
  id: "dispatch-core",
  name: "Dispatch Core",
  filters: defaultFilters,
  density: "comfortable",
  columns: DEFAULT_COLUMNS,
  panels: DEFAULT_PANELS,
  grid: DEFAULT_GRID_STATE,
};

const ISSUE_TYPE_LIST = [
  "NEEDS_ASSIGNMENT",
  "LATE_RISK",
  "OVERDUE",
  "MISSING_POD",
  "MISSING_BOL",
  "MISSING_RATECON",
  "MISSING_APPOINTMENT",
  "PENDING_APPROVALS",
  "MISSING_BILL_TO",
  "BILLING_PROFILE_INCOMPLETE",
  "LOAD_NOT_DELIVERED",
  "COMPLIANCE_EXPIRED",
  "COMPLIANCE_EXPIRING",
  "OPEN_EXCEPTION",
] as const;

const issueTypeSet = new Set<string>(ISSUE_TYPE_LIST);

function buildIssueTypeFilter(types: readonly string[]): DispatchGridFilterState {
  const includeValues = Array.from(new Set(types.filter((type) => issueTypeSet.has(type))));
  return includeValues.length ? { issueTypes: { includeValues, excludeValues: [] } } : {};
}

const WORKFLOW_QUEUE_PRESETS: Array<{
  id: WorkflowQueuePresetId;
  label: string;
  queueView: QueueView;
  gridFilters: DispatchGridFilterState;
}> = [
  {
    id: "needsAssignment",
    label: "Needs Assignment",
    queueView: "active",
    gridFilters: buildIssueTypeFilter(["NEEDS_ASSIGNMENT"]),
  },
  {
    id: "lateRisk",
    label: "Late Risk",
    queueView: "active",
    gridFilters: buildIssueTypeFilter(["LATE_RISK", "OVERDUE", "MISSING_APPOINTMENT"]),
  },
  {
    id: "missingDocs",
    label: "Missing Docs",
    queueView: "active",
    gridFilters: buildIssueTypeFilter(["MISSING_POD", "MISSING_BOL", "MISSING_RATECON"]),
  },
  {
    id: "billingPrep",
    label: "Billing Prep",
    queueView: "active",
    gridFilters: buildIssueTypeFilter([
      "MISSING_POD",
      "MISSING_BOL",
      "MISSING_RATECON",
      "PENDING_APPROVALS",
      "MISSING_BILL_TO",
      "BILLING_PROFILE_INCOMPLETE",
      "LOAD_NOT_DELIVERED",
    ]),
  },
  {
    id: "complianceIssues",
    label: "Compliance Issues",
    queueView: "active",
    gridFilters: buildIssueTypeFilter(["COMPLIANCE_EXPIRED", "COMPLIANCE_EXPIRING"]),
  },
  {
    id: "openExceptions",
    label: "Open Exceptions",
    queueView: "active",
    gridFilters: buildIssueTypeFilter(["OPEN_EXCEPTION"]),
  },
  {
    id: "anyIssues",
    label: "Any Issues",
    queueView: "active",
    gridFilters: { risk: { includeValues: ["hasRisk"], excludeValues: [] } },
  },
  {
    id: "missingAppointment",
    label: "Missing Appointment",
    queueView: "active",
    gridFilters: buildIssueTypeFilter(["MISSING_APPOINTMENT"]),
  },
  {
    id: "pendingApprovals",
    label: "Pending Approvals",
    queueView: "active",
    gridFilters: buildIssueTypeFilter(["PENDING_APPROVALS"]),
  },
];

const workflowQueuePresetMap = new Map(WORKFLOW_QUEUE_PRESETS.map((preset) => [preset.id, preset]));

function formatExceptionAge(createdAt: string) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "Age unknown";
  const diffMinutes = Math.max(0, Math.round((Date.now() - created.getTime()) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m open`;
  if (diffMinutes < 24 * 60) return `${Math.round(diffMinutes / 60)}h open`;
  return `${Math.round(diffMinutes / (24 * 60))}d open`;
}

function formatDispatchRefreshTime(value: string | null) {
  if (!value) return "Not refreshed yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not refreshed yet";
  return `Last refresh ${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function countActiveDispatchFilters(filters: Filters) {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.status.trim()) count += 1;
  if (filters.driverId.trim()) count += 1;
  if (filters.truckId.trim()) count += 1;
  if (filters.trailerId.trim()) count += 1;
  if (filters.assigned !== "all") count += 1;
  if (filters.fromDate.trim()) count += 1;
  if (filters.toDate.trim()) count += 1;
  if (filters.destSearch.trim()) count += 1;
  if (filters.minRate.trim()) count += 1;
  if (filters.maxRate.trim()) count += 1;
  if (filters.operatingEntityId.trim()) count += 1;
  if (filters.teamId.trim()) count += 1;
  return count;
}

function issuePresetToGridFilters(issueType: string): DispatchGridFilterState {
  if (issueTypeSet.has(issueType)) {
    return buildIssueTypeFilter([issueType]);
  }
  switch (issueType) {
    case "OPEN_EXCEPTION":
      return { risk: { includeValues: ["hasOpenException"], excludeValues: [] } };
    default:
      return { risk: { includeValues: ["hasRisk"], excludeValues: [] } };
  }
}

function normalizeViewColumns(
  columns?: Partial<Record<DispatchGridColumnKey, boolean>>
): Partial<Record<DispatchGridColumnKey, boolean>> {
  const next: Partial<Record<DispatchGridColumnKey, boolean>> = { ...DEFAULT_COLUMNS, ...(columns ?? {}) };
  for (const required of DISPATCH_REQUIRED_COLUMNS) {
    next[required] = true;
  }
  return next;
}

function sanitizeView(view: DispatchViewConfig): DispatchViewConfig {
  return {
    ...view,
    columns: normalizeViewColumns(view.columns),
    panels: {
      inspector: view.panels?.inspector ?? DEFAULT_PANELS.inspector,
      tripInspector: view.panels?.tripInspector ?? DEFAULT_PANELS.tripInspector,
      driverLanes: view.panels?.driverLanes ?? DEFAULT_PANELS.driverLanes,
      exceptions: view.panels?.exceptions ?? DEFAULT_PANELS.exceptions,
      exceptionsDock: view.panels?.exceptionsDock === "right" ? "right" : "left",
    },
    density: "comfortable",
    grid: {
      filters: view.grid?.filters ?? DEFAULT_GRID_STATE.filters,
      sortRules: Array.isArray(view.grid?.sortRules) && view.grid!.sortRules.length ? view.grid!.sortRules : DEFAULT_GRID_STATE.sortRules,
    },
  };
}

function hydrateDispatchViewFromApi(view: any): DispatchViewConfig {
  return sanitizeView({
    id: view.id,
    name: view.name,
    scope: view.scope ?? "PERSONAL",
    role: view.role ?? null,
    isRoleDefault: Boolean(view.isRoleDefault),
    userId: view.userId ?? null,
    filters: view.config?.filters ?? view.filters ?? defaultFilters,
    density: "comfortable",
    columns: view.config?.columns ?? view.columns ?? DEFAULT_COLUMNS,
    panels: view.config?.panels ?? view.panels ?? DEFAULT_PANELS,
    grid: view.config?.grid ?? view.grid ?? DEFAULT_GRID_STATE,
  });
}

function DispatchPageContent({
  workspace,
  onWorkspaceChange,
}: {
  workspace: DispatchWorkspace;
  onWorkspaceChange: (next: DispatchWorkspace) => void;
}) {
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
  const [gridDensity, setGridDensity] = useState<DispatchGridDensity>("comfortable");
  const [columnVisibility, setColumnVisibility] =
    useState<Partial<Record<DispatchGridColumnKey, boolean>>>(normalizeViewColumns(DEFAULT_COLUMNS));
  const [gridFilters, setGridFilters] = useState<DispatchGridFilterState>(DEFAULT_GRID_STATE.filters);
  const [gridSortRules, setGridSortRules] = useState<DispatchGridSortRule[]>(DEFAULT_GRID_STATE.sortRules);
  const [panelLayout, setPanelLayout] = useState<DispatchPanels>(DEFAULT_PANELS);
  const [personalViews, setPersonalViews] = useState<DispatchViewConfig[]>([]);
  const [templateViews, setTemplateViews] = useState<DispatchViewConfig[]>([]);
  const [canManageTemplates, setCanManageTemplates] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string>(SYSTEM_VIEW.id);
  const [showFilters, setShowFilters] = useState(false);
  const [showWorkbenchMenu, setShowWorkbenchMenu] = useState(false);
  const [activeWorkflowQueueId, setActiveWorkflowQueueId] = useState<WorkflowQueuePresetId | "">("");
  const [pageIndex, setPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<BulkStatus>("ASSIGNED");
  const [bulkMovementMode, setBulkMovementMode] = useState<"FTL" | "LTL" | "POOL_DISTRIBUTION">("FTL");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [cellSavingKey, setCellSavingKey] = useState<string | null>(null);
  const [laneAssigningKey, setLaneAssigningKey] = useState<string | null>(null);
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [selectedLoad, setSelectedLoad] = useState<any | null>(null);
  const [inspectorFocusSection, setInspectorFocusSection] = useState<DispatchInspectorFocusSection | null>(null);
  const [inspectorFocusNonce, setInspectorFocusNonce] = useState(0);
  const [docUploadTarget, setDocUploadTarget] = useState<{ loadId: string; loadNumber?: string | null } | null>(null);
  const [dispatchActionNote, setDispatchActionNote] = useState<string | null>(null);
  const [dispatchSettings, setDispatchSettings] = useState<any | null>(null);
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [assignForm, setAssignForm] = useState({ driverId: "", truckId: "", trailerId: "" });
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
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueLoadedOnce, setQueueLoadedOnce] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [exceptionsError, setExceptionsError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [dispatchExceptions, setDispatchExceptions] = useState<DispatchExceptionItem[]>([]);
  const [exceptionsSummary, setExceptionsSummary] = useState<{ total: number; open: number; acknowledged: number; blockers: number } | null>(null);
  const [tripInspector, setTripInspector] = useState<any | null>(null);
  const [tripInspectorError, setTripInspectorError] = useState<string | null>(null);
  const [tripInspectorLoading, setTripInspectorLoading] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [showStopActions, setShowStopActions] = useState(false);
  const [blocked, setBlocked] = useState<{ message?: string; ctaHref?: string } | null>(null);
  const pendingLoadIdRef = useRef<string | null>(null);
  const appliedIssuePresetRef = useRef<string | null>(null);

  const loadIdParam = searchParams.get("loadId");
  const queueView = useMemo<QueueView>(() => {
    const value = searchParams.get("queueView");
    if (value === "recent" || value === "history") return value;
    return "active";
  }, [searchParams]);
  const issuePresetParam = searchParams.get("issuePreset");

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

  const selectLoad = useCallback(
    (loadId: string, options?: { preserveFocus?: boolean }) => {
      if (!options?.preserveFocus) {
        setInspectorFocusSection(null);
      }
      setSelectedLoadId(loadId);
      updateLoadIdParam(loadId);
    },
    [updateLoadIdParam]
  );

  const clearSelectedLoad = useCallback(() => {
    setSelectedLoadId(null);
    setSelectedLoad(null);
    setInspectorFocusSection(null);
    setLegDrawerOpen(false);
    setLegAddedNote(false);
    updateLoadIdParam(null);
  }, [updateLoadIdParam]);

  const openInspectorForLoad = useCallback(
    (loadId: string, focusSection?: DispatchInspectorFocusSection) => {
      setPanelLayout((prev) => ({ ...prev, inspector: true }));
      setInspectorFocusSection(focusSection ?? null);
      setInspectorFocusNonce((value) => value + 1);
      selectLoad(loadId, { preserveFocus: true });
    },
    [selectLoad]
  );

  const openUploadPodForLoad = useCallback(
    (loadId: string) => {
      const row = loads.find((item) => item.id === loadId);
      setDocUploadTarget({ loadId, loadNumber: row?.loadNumber ?? null });
    },
    [loads]
  );


  const handleLegCreated = useCallback(() => {
    setLegDrawerOpen(false);
    setLegAddedNote(true);
    window.setTimeout(() => setLegAddedNote(false), 2000);
  }, []);

  const capabilities = useMemo(() => getRoleCapabilities(user?.role), [user?.role]);
  const hasDispatchRole = capabilities.canDispatchExecution;
  const canDispatch = capabilities.canAccessDispatch;
  const canCreateLoad = capabilities.canEditLoad || capabilities.canDispatchExecution;
  const isQueueReadOnly = queueView !== "active";
  const canStartTracking = capabilities.canStartTracking && canDispatch;
  const canSeeAllTeams = Boolean(
    capabilities.canAccessAdmin || capabilities.canSeeTeamsOps || user?.canSeeAllTeams
  );
  const canAssignTeamsOps = Boolean(capabilities.canAccessAdmin || capabilities.canSeeTeamsOps);
  const canOverride = capabilities.canAccessAdmin;
  const userLastViewStorageKey = useMemo(
    () => (user?.id ? `dispatch:last-view:${user.id}` : null),
    [user?.id]
  );
  const allViews = useMemo(
    () => [...templateViews, ...personalViews],
    [templateViews, personalViews]
  );
  const activeView = useMemo(() => {
    if (activeViewId === SYSTEM_VIEW.id) return SYSTEM_VIEW;
    return allViews.find((view) => view.id === activeViewId) ?? SYSTEM_VIEW;
  }, [activeViewId, allViews]);
  const dispatchStage =
    selectedLoad?.status && ["DRAFT", "PLANNED", "ASSIGNED"].includes(selectedLoad.status);
  const rateConRequired = Boolean(dispatchSettings?.requireRateConBeforeDispatch && selectedLoad?.loadType === "BROKERED");
  const hasRateCon = (selectedLoad?.docs ?? []).some(
    (doc: any) => doc.type === "RATECON" || doc.type === "RATE_CONFIRMATION"
  );
  const rateConMissing = Boolean(dispatchStage && rateConRequired && !hasRateCon);
  const activeFilterCount = useMemo(() => countActiveDispatchFilters(filters), [filters]);
  const partialFailureMessages = useMemo(() => {
    const messages: string[] = [];
    if (assetsError) messages.push(`Assets sync issue: ${assetsError}`);
    if (exceptionsError) messages.push(`Exceptions sync issue: ${exceptionsError}`);
    return messages;
  }, [assetsError, exceptionsError]);
  const assignDisabled =
    isQueueReadOnly ||
    !assignForm.driverId ||
    (rateConMissing && !canOverride) ||
    (rateConMissing && canOverride && !overrideReason.trim());

  useEffect(() => {
    apiFetch<{ user: any }>("/auth/me")
      .then((data) => {
        setUser(data.user);
        setHasAccess(getRoleCapabilities(data.user?.role).canAccessDispatch);
      })
      .catch(() => setHasAccess(false));
  }, []);

  useEffect(() => {
    if (!showWorkbenchMenu) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowWorkbenchMenu(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, [showWorkbenchMenu]);

  useEffect(() => {
    if (!canDispatch || !user?.id) return;
    let active = true;
    apiFetch<{
      personalViews: any[];
      templates: any[];
      roleDefaultTemplateId?: string | null;
      canManageTemplates?: boolean;
    }>("/dispatch/views")
      .then((payload) => {
        if (!active) return;
        const mappedPersonal = (payload.personalViews ?? []).map(hydrateDispatchViewFromApi);
        const mappedTemplates = (payload.templates ?? []).map(hydrateDispatchViewFromApi);
        setPersonalViews(mappedPersonal);
        setTemplateViews(mappedTemplates);
        setCanManageTemplates(Boolean(payload.canManageTemplates));

        const lastViewId = userLastViewStorageKey ? window.localStorage.getItem(userLastViewStorageKey) : null;
        const all = [...mappedTemplates, ...mappedPersonal];
        const byId = new Map(all.map((entry) => [entry.id, entry]));
        const nextView =
          (lastViewId && byId.get(lastViewId)) ||
          ((payload.roleDefaultTemplateId && byId.get(payload.roleDefaultTemplateId)) ?? null);
        if (!nextView) return;
        setActiveViewId(nextView.id);
        setFilters(nextView.filters);
        setGridDensity(nextView.density);
        setColumnVisibility(normalizeViewColumns(nextView.columns));
        setPanelLayout({ ...nextView.panels, exceptions: false });
      })
      .catch(() => {
        if (!active) return;
        setPersonalViews([]);
        setTemplateViews([]);
        setCanManageTemplates(false);
      });
    return () => {
      active = false;
    };
  }, [canDispatch, user?.id, userLastViewStorageKey]);

  useEffect(() => {
    if (!userLastViewStorageKey) return;
    window.localStorage.setItem(userLastViewStorageKey, activeViewId);
  }, [activeViewId, userLastViewStorageKey]);

  useEffect(() => {
    if (!user || !capabilities.canAccessAdmin) return;
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
  }, [user, capabilities.canAccessAdmin]);

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
    if (!issuePresetParam) {
      appliedIssuePresetRef.current = null;
      return;
    }
    setActiveWorkflowQueueId("");
    if (appliedIssuePresetRef.current === issuePresetParam) return;
    appliedIssuePresetRef.current = issuePresetParam;
    setGridFilters(issuePresetToGridFilters(issuePresetParam));
    setPageIndex(0);
    setShowFilters(true);
  }, [issuePresetParam]);

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
      setAssetsError(null);
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
    } catch (error) {
      setAssetsError((error as Error).message || "Unable to load dispatch assets.");
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
    setQueueLoading(true);
    try {
      const query = buildParams(nextFilters, page);
      const url = query ? `/loads?${query}` : "/loads?view=dispatch";
      const data = await apiFetch<{ items: DispatchItem[]; total: number; totalPages: number }>(url);
      setLoads(data.items ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotalCount(data.total ?? 0);
      setDispatchError(null);
      setLastRefreshedAt(new Date().toISOString());
    } catch (error) {
      setDispatchError((error as Error).message || "Unable to load dispatch queue.");
    } finally {
      setQueueLoading(false);
      setQueueLoadedOnce(true);
    }
  }, [canDispatch, buildParams, filters, pageIndex]);

  useEffect(() => {
    if (!canDispatch) return;
    loadDispatchLoads(filters, pageIndex);
  }, [canDispatch, pageIndex, filters, loadDispatchLoads]);

  const loadDispatchExceptions = useCallback(async () => {
    if (!canDispatch) return;
    try {
      setExceptionsError(null);
      const data = await apiFetch<{
        exceptions: DispatchExceptionItem[];
        summary: { total: number; open: number; acknowledged: number; blockers: number };
      }>("/dispatch/exceptions?status=ALL");
      const unresolved = (data.exceptions ?? []).filter((item) => item.status !== "RESOLVED");
      setDispatchExceptions(unresolved);
      setExceptionsSummary(data.summary ?? null);
    } catch (error) {
      setDispatchExceptions([]);
      setExceptionsSummary(null);
      setExceptionsError((error as Error).message || "Unable to load dispatch exceptions.");
    }
  }, [canDispatch]);

  useEffect(() => {
    if (!canDispatch) return;
    loadDispatchExceptions();
  }, [canDispatch, filters.teamId, loadDispatchExceptions]);

  useEffect(() => {
    setSelectedRows((prev) => {
      if (prev.size === 0) return prev;
      const availableIds = new Set(loads.map((load) => load.id));
      const next = new Set(Array.from(prev).filter((id) => availableIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [loads]);

  useEffect(() => {
    if (!bulkNote) return;
    const timer = window.setTimeout(() => setBulkNote(null), 2600);
    return () => window.clearTimeout(timer);
  }, [bulkNote]);

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

  useEffect(() => {
    if (!dispatchActionNote) return;
    const timer = window.setTimeout(() => setDispatchActionNote(null), 1800);
    return () => window.clearTimeout(timer);
  }, [dispatchActionNote]);

  const refreshSelectedLoad = useCallback(async (loadId: string) => {
    if (!canDispatch) return;
    try {
      const data = await apiFetch<{ load: any; settings?: any | null }>(`/loads/${loadId}/dispatch-detail`);
      setSelectedLoad(data.load ?? null);
      setDispatchSettings(data.settings ?? null);
      setAssignError(null);
      const selectedTrip = data.load?.tripLoads?.[0]?.trip ?? null;
      setAssignForm({
        driverId: selectedTrip?.driverId ?? data.load?.assignedDriverId ?? "",
        truckId: selectedTrip?.truckId ?? data.load?.truckId ?? "",
        trailerId: selectedTrip?.trailerId ?? data.load?.trailerId ?? "",
      });
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
  }, [assignForm.driverId, assignForm.truckId, assignForm.trailerId, selectedLoadId, showUnavailable]);

  useEffect(() => {
    const shouldAutoExpand = Boolean(selectedLoad?.riskFlags?.atRisk || selectedLoad?.riskFlags?.overdueStopWindow);
    setShowStopActions(shouldAutoExpand);
  }, [selectedLoad?.id, selectedLoad?.riskFlags?.atRisk, selectedLoad?.riskFlags?.overdueStopWindow]);

  const deriveRiskFlags = (load: any) => {
    const trip = load?.tripLoads?.[0]?.trip ?? null;
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
      !trip || !trip.driverId || !trip.truckId || !trip.trailerId || trip.status === "PLANNED";
    return {
      needsAssignment,
      trackingOffInTransit: trackingOff,
      overdueStopWindow: overdueStop,
      atRisk: trackingOff || overdueStop,
      nextStopTime: nextStop?.appointmentStart ?? nextStop?.appointmentEnd ?? null,
    };
  };

  const patchLoadSummary = (updated: any) => {
    const updatedTrip = updated?.tripLoads?.[0]?.trip ?? null;
    setLoads((prev) =>
      prev.map((item) => {
        if (item.id !== updated.id) return item;
        const riskFlags = deriveRiskFlags(updated);
        return {
          ...item,
          status: updated.status ?? item.status,
          movementMode: updated.movementMode ?? item.movementMode,
          customerName: updated.customerName ?? item.customerName,
          miles: updated.miles ?? item.miles,
          paidMiles: updated.paidMiles ?? item.paidMiles,
          rate: updated.rate ?? item.rate,
          updatedAt: updated.createdAt ? new Date(updated.createdAt).toISOString() : item.updatedAt,
          trip: updatedTrip
            ? {
                id: updatedTrip.id,
                tripNumber: updatedTrip.tripNumber,
                status: updatedTrip.status,
              }
            : item.trip,
          assignment: {
            driver: updatedTrip?.driver ?? updated.driver ?? item.assignment?.driver,
            truck: updatedTrip?.truck ?? updated.truck ?? item.assignment?.truck,
            trailer: updatedTrip?.trailer ?? updated.trailer ?? item.assignment?.trailer,
          },
          operatingEntity: updated.operatingEntity ?? item.operatingEntity,
          nextStop: updated.stops?.find((stop: any) => !stop.arrivedAt || !stop.departedAt) ?? item.nextStop,
          docs: updated.docs
            ? {
                hasPod: updated.docs.some((doc: any) => doc.type === "POD" && doc.status !== "REJECTED"),
                hasBol: updated.docs.some((doc: any) => doc.type === "BOL" && doc.status !== "REJECTED"),
                hasRateCon: updated.docs.some(
                  (doc: any) =>
                    (doc.type === "RATECON" || doc.type === "RATE_CONFIRMATION") && doc.status !== "REJECTED"
                ),
              }
            : item.docs,
          issuesTop: updated.issuesTop ?? item.issuesTop,
          issuesText: updated.issuesText ?? item.issuesText,
          issues: updated.issues ?? item.issues,
          issueCounts: updated.issueCounts ?? item.issueCounts,
          riskFlags,
        };
      })
    );
  };

  const applyUploadedDocToGrid = useCallback(
    (params: { loadId: string; docType: "POD" | "BOL" | "RATECON" | "RATE_CONFIRMATION" }) => {
      setLoads((prev) =>
        prev.map((item) => {
          if (item.id !== params.loadId) return item;
          const nextDocs = {
            hasPod: item.docs?.hasPod ?? false,
            hasBol: item.docs?.hasBol ?? false,
            hasRateCon: item.docs?.hasRateCon ?? false,
          };
          if (params.docType === "POD") nextDocs.hasPod = true;
          if (params.docType === "BOL") nextDocs.hasBol = true;
          if (params.docType === "RATECON" || params.docType === "RATE_CONFIRMATION") nextDocs.hasRateCon = true;
          const removeIssueTypes = new Set<string>();
          if (params.docType === "POD") removeIssueTypes.add("MISSING_POD");
          if (params.docType === "BOL") removeIssueTypes.add("MISSING_BOL");
          if (params.docType === "RATECON" || params.docType === "RATE_CONFIRMATION") removeIssueTypes.add("MISSING_RATECON");
          const nextIssues = (item.issues ?? []).filter((issue) => !removeIssueTypes.has(issue.type));
          const nextIssuesTop = (item.issuesTop ?? []).filter((issue) => !removeIssueTypes.has(issue.type));
          const nextIssueCounts = { ...(item.issueCounts ?? {}) };
          for (const issueType of removeIssueTypes) {
            nextIssueCounts[issueType] = 0;
          }
          const nextIssuesText =
            nextIssuesTop.length === 0
              ? "No issues"
              : nextIssues.length > 2
                ? `${nextIssuesTop.map((issue) => issue.label).join(" · ")} · +${nextIssues.length - 2} more`
                : nextIssuesTop.map((issue) => issue.label).join(" · ");
          return {
            ...item,
            docs: nextDocs,
            issues: nextIssues,
            issuesTop: nextIssuesTop,
            issuesText: nextIssuesText,
            issueCounts: nextIssueCounts,
          };
        })
      );
      setDispatchActionNote("Saved");
    },
    []
  );

  const buildConflictMessages = (driverId?: string, truckId?: string, trailerId?: string) => {
    const conflicts: string[] = [];
    if (driverId) {
      const driver = unavailableDrivers.find((item) => item.id === driverId);
      if (driver) {
        conflicts.push(`Driver: Assigning this driver will move them from ${driver.reason ?? "another load"}.`);
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

  const performAssign = async (params: { driverId: string; truckId?: string; trailerId?: string }) => {
    if (isQueueReadOnly) return;
    if (!selectedLoad) return;
    if (!params.driverId) return;
    const conflicts = buildConflictMessages(params.driverId, params.truckId, params.trailerId);
    if (conflicts.length > 0 && !confirmReassign) {
      setConfirmReassign(true);
      return;
    }
    setAssignError(null);
    try {
      const existingTrip = selectedLoad?.tripLoads?.[0]?.trip ?? null;
      if (existingTrip?.id) {
        await apiFetch(`/trips/${existingTrip.id}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driverId: params.driverId,
            truckId: params.truckId || null,
            trailerId: params.trailerId || null,
            status: "ASSIGNED",
          }),
        });
      } else {
        await apiFetch(`/trips`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            loadNumbers: [selectedLoad.loadNumber],
            movementMode: selectedLoad.movementMode ?? "FTL",
            driverId: params.driverId,
            truckId: params.truckId || null,
            trailerId: params.trailerId || null,
            status: "ASSIGNED",
          }),
        });
      }
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
      truckId: (truckId ?? assignForm.truckId) || undefined,
      trailerId: assignForm.trailerId || undefined,
    });
  };

  const unassign = async () => {
    if (isQueueReadOnly) return;
    if (!selectedLoad) return;
    const existingTrip = selectedLoad?.tripLoads?.[0]?.trip ?? null;
    if (!existingTrip?.id) {
      setAssignError("This load is not attached to a trip.");
      return;
    }
    if (!["PLANNED", "ASSIGNED"].includes(existingTrip.status)) {
      setAssignError("Cannot unassign once trip dispatch is in progress.");
      return;
    }
    await apiFetch(`/trips/${existingTrip.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driverId: null,
        truckId: null,
        trailerId: null,
        status: "PLANNED",
      }),
    });
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

  const acknowledgeException = useCallback(
    async (exceptionId: string) => {
      await apiFetch(`/dispatch/exceptions/${exceptionId}/acknowledge`, { method: "POST" });
      await loadDispatchExceptions();
    },
    [loadDispatchExceptions]
  );

  const resolveException = useCallback(
    async (exceptionId: string) => {
      const resolutionNote = window.prompt("Resolution note");
      if (!resolutionNote?.trim()) return;
      await apiFetch(`/dispatch/exceptions/${exceptionId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutionNote: resolutionNote.trim() }),
      });
      await loadDispatchExceptions();
    },
    [loadDispatchExceptions]
  );

  const reopenException = useCallback(
    async (exceptionId: string) => {
      await apiFetch(`/dispatch/exceptions/${exceptionId}/reopen`, { method: "POST" });
      await loadDispatchExceptions();
    },
    [loadDispatchExceptions]
  );

  const applyView = useCallback((view: DispatchViewConfig) => {
    const sanitized = sanitizeView(view);
    setActiveViewId(sanitized.id);
    setActiveWorkflowQueueId("");
    setFilters(sanitized.filters);
    setGridDensity(sanitized.density);
    setColumnVisibility(normalizeViewColumns(sanitized.columns));
    setGridFilters(sanitized.grid.filters ?? DEFAULT_GRID_STATE.filters);
    setGridSortRules(sanitized.grid.sortRules ?? DEFAULT_GRID_STATE.sortRules);
    setPanelLayout(sanitized.panels);
    setPageIndex(0);
  }, []);

  const applyWorkflowQueuePreset = useCallback(
    (presetId: WorkflowQueuePresetId) => {
      const preset = workflowQueuePresetMap.get(presetId);
      if (!preset) return;
      setActiveViewId(SYSTEM_VIEW.id);
      setActiveWorkflowQueueId(preset.id);
      setGridFilters(structuredClone(preset.gridFilters));
      setPageIndex(0);
      setShowFilters(true);
      if (queueView !== preset.queueView) {
        updateQueueViewParam(preset.queueView);
      }
    },
    [queueView, updateQueueViewParam]
  );

  const saveCurrentAsView = useCallback(async (scope: "PERSONAL" | "ADMIN_TEMPLATE" = "PERSONAL") => {
    const name = window.prompt("Save view as");
    if (!name?.trim()) return;
    const response = await apiFetch<{ view: any }>("/dispatch/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        scope,
        role: scope === "ADMIN_TEMPLATE" ? user?.role ?? null : null,
        isRoleDefault: false,
        config: {
          filters,
          density: gridDensity,
          columns: normalizeViewColumns(columnVisibility),
          panels: panelLayout,
          grid: {
            filters: gridFilters,
            sortRules: gridSortRules,
          },
        },
      }),
    });
    const nextView = hydrateDispatchViewFromApi(response.view);
    if (nextView.scope === "ADMIN_TEMPLATE") {
      setTemplateViews((prev) => [nextView, ...prev.filter((view) => view.id !== nextView.id)]);
    } else {
      setPersonalViews((prev) => [nextView, ...prev.filter((view) => view.id !== nextView.id)]);
    }
    applyView(nextView);
  }, [applyView, columnVisibility, filters, gridDensity, gridFilters, gridSortRules, panelLayout, user?.role]);

  const updateCurrentView = useCallback(async () => {
    if (activeViewId === SYSTEM_VIEW.id) {
      await saveCurrentAsView();
      return;
    }
    const current = allViews.find((view) => view.id === activeViewId);
    if (!current) {
      applyView(SYSTEM_VIEW);
      return;
    }
    if (current.scope === "ADMIN_TEMPLATE" && !canManageTemplates) {
      await saveCurrentAsView();
      return;
    }
    const response = await apiFetch<{ view: any }>(`/dispatch/views/${activeViewId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          filters,
          density: gridDensity,
          columns: normalizeViewColumns(columnVisibility),
          panels: panelLayout,
          grid: {
            filters: gridFilters,
            sortRules: gridSortRules,
          },
        },
      }),
    });
    const updatedView = hydrateDispatchViewFromApi(response.view);
    if (updatedView.scope === "ADMIN_TEMPLATE") {
      setTemplateViews((prev) => prev.map((view) => (view.id === updatedView.id ? updatedView : view)));
    } else {
      setPersonalViews((prev) => prev.map((view) => (view.id === updatedView.id ? updatedView : view)));
    }
    applyView(updatedView);
  }, [
    activeViewId,
    allViews,
    applyView,
    canManageTemplates,
    columnVisibility,
    filters,
    gridDensity,
    gridFilters,
    gridSortRules,
    panelLayout,
    saveCurrentAsView,
  ]);

  const deleteCurrentView = useCallback(async () => {
    if (activeViewId === SYSTEM_VIEW.id) return;
    const current = allViews.find((view) => view.id === activeViewId);
    if (!current) {
      applyView(SYSTEM_VIEW);
      return;
    }
    if (current.scope === "ADMIN_TEMPLATE" && !canManageTemplates) return;
    await apiFetch(`/dispatch/views/${activeViewId}`, { method: "DELETE" });
    if (current.scope === "ADMIN_TEMPLATE") {
      setTemplateViews((prev) => prev.filter((view) => view.id !== activeViewId));
    } else {
      setPersonalViews((prev) => prev.filter((view) => view.id !== activeViewId));
    }
    applyView(SYSTEM_VIEW);
  }, [activeViewId, allViews, applyView, canManageTemplates]);

  const handleInlineEdit = useCallback(
    async (params: { loadId: string; field: "status" | "customerName" | "miles" | "rate"; value: string | number }) => {
      const payload: Record<string, string | number> = {};
      payload[params.field] = params.value;
      setCellSavingKey(`${params.loadId}:${params.field === "customerName" ? "customer" : params.field}`);
      try {
        const response = await apiFetch<{ load: any }>(`/loads/${params.loadId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setLoads((prev) =>
          prev.map((item) => {
            if (item.id !== params.loadId) return item;
            return {
              ...item,
              customerName: response.load.customerName ?? item.customerName,
              status: response.load.status ?? item.status,
              miles: response.load.miles ?? item.miles,
              paidMiles: response.load.paidMiles ?? item.paidMiles,
              rate: response.load.rate ?? item.rate,
              movementMode: response.load.movementMode ?? item.movementMode,
            };
          })
        );
        if (selectedLoadId === params.loadId) {
          await refreshSelectedLoad(params.loadId);
        }
      } finally {
        setCellSavingKey(null);
      }
    },
    [refreshSelectedLoad, selectedLoadId]
  );

  const toggleRowSelection = useCallback((loadId: string, selected: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (selected) next.add(loadId);
      else next.delete(loadId);
      return next;
    });
  }, []);

  const toggleAllRows = useCallback((selected: boolean, rowIds: string[]) => {
    setSelectedRows(selected ? new Set(rowIds) : new Set());
  }, []);

  const handleDocUploaded = useCallback(
    async (params: { loadId: string; docType: "POD" | "BOL" | "RATECON" | "RATE_CONFIRMATION" }) => {
      applyUploadedDocToGrid(params);
      if (selectedLoadId === params.loadId) {
        const updated = await refreshSelectedLoad(params.loadId);
        if (updated) {
          patchLoadSummary(updated);
        }
      }
    },
    [applyUploadedDocToGrid, patchLoadSummary, refreshSelectedLoad, selectedLoadId]
  );

  const assignLoadFromLane = useCallback(
    async (params: { loadId: string; driverId: string }) => {
      if (isQueueReadOnly) return;
      const row = loads.find((load) => load.id === params.loadId);
      if (!row) return;
      setLaneAssigningKey(`lane:${params.driverId}`);
      try {
        if (row.trip?.id) {
          await apiFetch(`/trips/${row.trip.id}/assign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              driverId: params.driverId,
              truckId: row.assignment?.truck?.id ?? null,
              trailerId: row.assignment?.trailer?.id ?? null,
              status: "ASSIGNED",
            }),
          });
        } else {
          await apiFetch("/trips", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              loadNumbers: [row.loadNumber],
              movementMode: row.movementMode ?? "FTL",
              driverId: params.driverId,
              status: "ASSIGNED",
            }),
          });
        }
        await loadDispatchLoads(filters, pageIndex);
        if (selectedLoadId === row.id) {
          await refreshSelectedLoad(row.id);
        }
      } finally {
        setLaneAssigningKey(null);
      }
    },
    [filters, isQueueReadOnly, loadDispatchLoads, loads, pageIndex, refreshSelectedLoad, selectedLoadId]
  );

  const runBulkStatusUpdate = useCallback(async () => {
    const ids = Array.from(selectedRows);
    if (!ids.length) return;
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(
        ids.map((loadId) =>
          apiFetch(`/loads/${loadId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: bulkStatus }),
          })
        )
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      setBulkNote(
        failed
          ? `Updated ${ids.length - failed}/${ids.length} loads. ${failed} failed.`
          : `Updated ${ids.length} loads to ${bulkStatus}.`
      );
      await loadDispatchLoads(filters, pageIndex);
      setSelectedRows(new Set());
    } finally {
      setBulkLoading(false);
    }
  }, [bulkStatus, filters, loadDispatchLoads, pageIndex, selectedRows]);

  const createTripFromSelection = useCallback(async () => {
    const selected = loads.filter((load) => selectedRows.has(load.id));
    if (!selected.length) return;
    setBulkLoading(true);
    try {
      const payload = await apiFetch<{ trip: { id: string } }>("/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loadNumbers: selected.map((load) => load.loadNumber),
          movementMode: bulkMovementMode,
          status: "PLANNED",
        }),
      });
      setBulkNote(`Created trip with ${selected.length} loads.`);
      setSelectedRows(new Set());
      await loadDispatchLoads(filters, pageIndex);
      if (payload.trip?.id) {
        router.push(`/trips?tripId=${payload.trip.id}`);
      }
    } finally {
      setBulkLoading(false);
    }
  }, [bulkMovementMode, filters, loadDispatchLoads, loads, pageIndex, router, selectedRows]);

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

  const dispatchSignals = useMemo(() => {
    const inTransit = sortedLoads.filter((load) => load.status === "IN_TRANSIT");
    const atRisk = sortedLoads.filter((load) => load.riskFlags?.atRisk).length;
    const overdueStops = sortedLoads.filter((load) => load.riskFlags?.overdueStopWindow).length;
    const trackingHealthy = inTransit.filter((load) => load.tracking?.state === "ON").length;
    const trackingContinuity = inTransit.length ? Math.round((trackingHealthy / inTransit.length) * 100) : 100;
    const etaConfidence =
      inTransit.length === 0
        ? "High"
        : trackingContinuity >= 85 && overdueStops === 0
          ? "High"
          : trackingContinuity >= 60
            ? "Medium"
            : "Low";
    return {
      inTransitCount: inTransit.length,
      atRiskCount: atRisk,
      overdueStopsCount: overdueStops,
      trackingContinuity,
      etaConfidence,
    };
  }, [sortedLoads]);

  const workbenchMapHref = useMemo(
    () =>
      buildYardOsPlanningUrl({
        orgId: user?.orgId ?? null,
        loadIds: sortedLoads.slice(0, 80).map((load) => load.id),
        operatingEntityId: filters.operatingEntityId || null,
        teamId: canSeeAllTeams ? filters.teamId || null : null,
        source: "truckerio.dispatch.workbench",
      }),
    [canSeeAllTeams, filters.operatingEntityId, filters.teamId, sortedLoads, user?.orgId]
  );

  const openWorkbenchMap = useCallback(() => {
    if (!workbenchMapHref) return;
    window.open(workbenchMapHref, "_blank", "noopener,noreferrer");
  }, [workbenchMapHref]);

  const selectedLoadSummary = useMemo(() => {
    if (!selectedLoadId) return null;
    return sortedLoads.find((load) => load.id === selectedLoadId) ?? null;
  }, [sortedLoads, selectedLoadId]);

  const gridRows = useMemo<DispatchGridRow[]>(
    () =>
      sortedLoads.map((load) => ({
        ...load,
      })),
    [sortedLoads]
  );
  const selectedCount = selectedRows.size;
  const loadById = useMemo(() => new Map(sortedLoads.map((load) => [load.id, load])), [sortedLoads]);
  const exceptionRows = useMemo<Array<DispatchExceptionItem & { actionable: boolean; source: "dispatch" | "signal" }>>(() => {
    const mapped = dispatchExceptions.map((item) => ({
      ...item,
      loadNumber: item.loadNumber ?? loadById.get(item.loadId)?.loadNumber ?? "Unknown load",
      actionable: true,
      source: "dispatch" as const,
    }));
    const seen = new Set(
      mapped.map((item) => `${item.loadId}:${item.title.trim().toLowerCase()}`)
    );
    const signalRows = sortedLoads.flatMap((load) => {
      const derived: Array<DispatchExceptionItem & { actionable: boolean; source: "signal" }> = [];
      const loadNumber = load.loadNumber ?? "Unknown load";
      const createdAt = load.updatedAt ?? new Date().toISOString();
      const pushSignal = (title: string, severity: "WARNING" | "BLOCKER") => {
        const signature = `${load.id}:${title.toLowerCase()}`;
        if (seen.has(signature)) return;
        seen.add(signature);
        derived.push({
          id: `signal:${load.id}:${title.toLowerCase().replace(/\s+/g, "-")}`,
          loadId: load.id,
          loadNumber,
          tripId: load.trip?.id ?? null,
          tripNumber: load.trip?.tripNumber ?? null,
          type: "RISK_SIGNAL",
          severity,
          owner: "DISPATCH",
          status: "OPEN",
          title,
          detail: "Derived from active dispatch risk signals.",
          createdAt,
          actionable: false,
          source: "signal",
        });
      };
      if (load.riskFlags?.needsAssignment) pushSignal("Needs assignment", "BLOCKER");
      if (load.riskFlags?.trackingOffInTransit) pushSignal("Tracking off", "WARNING");
      if (load.riskFlags?.overdueStopWindow) pushSignal("Overdue stop", "WARNING");
      return derived;
    });
    return [...mapped, ...signalRows];
  }, [dispatchExceptions, loadById, sortedLoads]);
  const exceptionSubtitle = useMemo(() => {
    if (exceptionsSummary && (exceptionsSummary.open > 0 || dispatchExceptions.length > 0)) {
      return `${exceptionsSummary.open} open · ${exceptionsSummary.acknowledged} acknowledged · ${exceptionsSummary.blockers} blockers`;
    }
    if (!exceptionRows.length) return "Open issues visible in queue";
    const blockers = exceptionRows.filter((item) => item.severity === "BLOCKER").length;
    return `${exceptionRows.length} open signals · ${blockers} blockers`;
  }, [dispatchExceptions.length, exceptionRows, exceptionsSummary]);

  const selectedTripId =
    selectedLoadSummary?.trip?.id ?? selectedLoad?.tripLoads?.[0]?.trip?.id ?? null;

  useEffect(() => {
    if (!panelLayout.tripInspector || !selectedTripId || !canDispatch) {
      setTripInspector(null);
      setTripInspectorError(null);
      setTripInspectorLoading(false);
      return;
    }
    let active = true;
    setTripInspectorLoading(true);
    apiFetch<{ trip: any }>(`/trips/${selectedTripId}`)
      .then((data) => {
        if (!active) return;
        setTripInspector(data.trip ?? null);
        setTripInspectorError(null);
      })
      .catch((error) => {
        if (!active) return;
        setTripInspector(null);
        setTripInspectorError((error as Error).message || "Unable to load trip inspector.");
      })
      .finally(() => {
        if (active) setTripInspectorLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canDispatch, panelLayout.tripInspector, selectedTripId]);

  const workbenchAssignment = {
    form: assignForm,
    setForm: setAssignForm,
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
      driverName:
        selectedLoadSummary?.assignment?.driver?.name ??
        selectedLoad?.tripLoads?.[0]?.trip?.driver?.name ??
        selectedLoad?.driver?.name ??
        null,
      truckUnit:
        selectedLoadSummary?.assignment?.truck?.unit ??
        selectedLoad?.tripLoads?.[0]?.trip?.truck?.unit ??
        selectedLoad?.truck?.unit ??
        null,
      trailerUnit:
        selectedLoadSummary?.assignment?.trailer?.unit ??
        selectedLoad?.tripLoads?.[0]?.trip?.trailer?.unit ??
        selectedLoad?.trailer?.unit ??
        null,
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

  const selectedTrailerId =
    selectedLoadSummary?.assignment?.trailer?.id ??
    selectedLoad?.tripLoads?.[0]?.trip?.trailerId ??
    selectedLoad?.trailerId ??
    (assignForm.trailerId || null);

  const selectedTrailerUnit =
    selectedLoadSummary?.assignment?.trailer?.unit ??
    selectedLoad?.tripLoads?.[0]?.trip?.trailer?.unit ??
    selectedLoad?.trailer?.unit ??
    null;

  const yardOsLaunchHref = useMemo(
    () =>
      selectedLoad
        ? buildYardOsPlanningUrl({
            orgId: user?.orgId ?? null,
            loadIds: [selectedLoad.id],
            loadId: selectedLoad.id,
            loadNumber: selectedLoad.loadNumber ?? selectedLoadSummary?.loadNumber ?? null,
            trailerId: selectedTrailerId,
            trailerUnit: selectedTrailerUnit,
            operatingEntityId: filters.operatingEntityId || selectedLoadSummary?.operatingEntity?.id || null,
            teamId: canSeeAllTeams ? filters.teamId || null : null,
          })
        : null,
    [
      selectedLoad,
      selectedLoadSummary?.loadNumber,
      selectedLoadSummary?.operatingEntity?.id,
      selectedTrailerId,
      selectedTrailerUnit,
      user?.orgId,
      filters.operatingEntityId,
      filters.teamId,
      canSeeAllTeams,
    ]
  );

  const openYardOs = useCallback(() => {
    if (!yardOsLaunchHref) return;
    window.open(yardOsLaunchHref, "_blank", "noopener,noreferrer");
  }, [yardOsLaunchHref]);

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
      yardOsLaunch={yardOsLaunchHref ? { href: yardOsLaunchHref, onOpen: openYardOs } : undefined}
      focusSection={inspectorFocusSection}
      focusNonce={inspectorFocusNonce}
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
  const tripInspectorPanel = panelLayout.tripInspector ? (
    <Card>
      <SectionHeader title="Trip Inspector" subtitle="Trip-level execution context" />
      {tripInspectorLoading ? (
        <div className="text-xs text-[color:var(--color-text-muted)]">Loading trip…</div>
      ) : tripInspectorError ? (
        <div className="text-xs text-[color:var(--color-warning)]">{tripInspectorError}</div>
      ) : !tripInspector ? (
        <div className="text-xs text-[color:var(--color-text-muted)]">Select a trip-linked load to inspect trip details.</div>
      ) : (
        <div className="space-y-2 text-xs">
          <div className="font-semibold text-ink">{tripInspector.tripNumber}</div>
          <div className="text-[color:var(--color-text-muted)]">
            {tripInspector.movementMode} · {tripInspector.status}
          </div>
          <div className="text-[color:var(--color-text-muted)]">
            Driver: {tripInspector.driver?.name ?? "Unassigned"} · Truck: {tripInspector.truck?.unit ?? "-"} · Trailer:{" "}
            {tripInspector.trailer?.unit ?? "-"}
          </div>
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2">
            <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">Loads</div>
            <div className="space-y-1">
              {(tripInspector.loads ?? []).map((row: any) => (
                <div key={row.id} className="flex items-center justify-between">
                  <span>{row.load?.loadNumber ?? "Load"}</span>
                  <span className="text-[color:var(--color-text-muted)]">{row.load?.status ?? "-"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  ) : null;
  const showInspectorPanel = panelLayout.inspector && Boolean(selectedLoadId);
  const showTripInspectorPanel = panelLayout.tripInspector;
  const showExceptionsPanel = panelLayout.exceptions;
  const showDriverLanesPanel = panelLayout.driverLanes;
  const showInitialQueueLoadingState = queueLoading && !queueLoadedOnce;
  const showQueueEmptyState = !queueLoading && queueLoadedOnce && !dispatchError && gridRows.length === 0;
  const showQueueCanvas = !showInitialQueueLoadingState && !showQueueEmptyState;
  const dispatchGridTemplateColumns = [
    ...(showExceptionsPanel && panelLayout.exceptionsDock === "left" ? ["minmax(220px, 280px)"] : []),
    "minmax(0, 1fr)",
    ...(showInspectorPanel || showTripInspectorPanel ? ["minmax(360px, 440px)"] : []),
    ...(showExceptionsPanel && panelLayout.exceptionsDock === "right" ? ["minmax(220px, 280px)"] : []),
  ].join(" ");

  if (hasAccess === false) {
    return (
      <AppShell title="Dispatch" subtitle="Trip-first assignment and execution">
        <NoAccess title="No access to Dispatch" description="You do not have permission to view dispatch execution." />
      </AppShell>
    );
  }
  if (hasAccess === null) {
    return (
      <AppShell title="Dispatch" subtitle="Trip-first assignment and execution">
        <EmptyState title="Loading workspace..." description="Pulling dispatch and trip access." />
      </AppShell>
    );
  }

  if (!hasDispatchRole) {
    return (
      <AppShell title="Dispatch" subtitle="Trip-first assignment and execution">
        <NoAccess title="No access to Dispatch" description="You do not have permission to view dispatch execution." />
      </AppShell>
    );
  }

  if (blocked) {
    const isAdmin = user?.role === "ADMIN";
    return (
      <AppShell title="Dispatch" subtitle="Trip-first assignment and execution">
        <BlockedScreen
          isAdmin={isAdmin}
          description={isAdmin ? blocked.message || "Finish setup to perform dispatch assignments." : undefined}
          ctaHref={isAdmin ? blocked.ctaHref || "/onboarding" : undefined}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Dispatch" subtitle="Trip-first assignment and execution">
      <div className="sticky top-0 z-20 -mx-2 rounded-[var(--radius-card)] border-b border-[color:var(--color-divider)] bg-[color:var(--color-bg)]/95 px-2 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink">Dispatch Spreadsheet</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Primary canvas · inspector + lanes are dockable panels</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              value={workspace}
              options={[
                { label: "Trips", value: "trips" },
                { label: "Loads", value: "loads" },
              ]}
              onChange={(value) => onWorkspaceChange(value as DispatchWorkspace)}
            />
            {workspace === "loads" && workbenchMapHref ? (
              <Button variant="secondary" size="sm" onClick={openWorkbenchMap}>
                Live map
              </Button>
            ) : null}
            {workspace === "loads" && canCreateLoad ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/loads?create=1")}
              >
                Create load
              </Button>
            ) : null}
            <div className="relative">
              <button
                type="button"
                aria-label={showWorkbenchMenu ? "Close dispatch controls menu" : "Open dispatch controls menu"}
                title={showWorkbenchMenu ? "Close dispatch controls menu" : "Open dispatch controls menu"}
                onClick={() => setShowWorkbenchMenu((prev) => !prev)}
                className="relative inline-flex h-[var(--icon-button-size-toolbar)] w-[var(--icon-button-size-toolbar)] items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] text-[color:var(--color-text-muted)] transition hover:bg-[color:var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-[var(--icon-size-toolbar)] w-[var(--icon-size-toolbar)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
                </svg>
                {activeFilterCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex h-[var(--icon-badge-size)] min-w-[var(--icon-badge-size)] items-center justify-center rounded-full bg-[color:var(--color-accent)] px-1 text-[10px] font-semibold leading-none text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              {showWorkbenchMenu ? (
                <div className="fixed inset-0 z-[120]">
                  <button
                    type="button"
                    aria-label="Close dispatch controls menu"
                    onClick={() => setShowWorkbenchMenu(false)}
                    className="absolute inset-0 bg-black/15 backdrop-blur-[1px]"
                  />
                  <div className="absolute right-4 top-20 w-[min(96vw,640px)] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] p-3 shadow-[var(--shadow-elevated)]">
                    <div className="grid gap-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">Workbench controls</div>
                    <FormField label="View" htmlFor="dispatchViewSelectMenu">
                      <Select
                        id="dispatchViewSelectMenu"
                        value={activeViewId}
                        onChange={(event) => {
                          const nextId = event.target.value;
                          if (nextId === SYSTEM_VIEW.id) {
                            applyView(SYSTEM_VIEW);
                            return;
                          }
                          const view = allViews.find((entry) => entry.id === nextId);
                          if (view) applyView(view);
                        }}
                      >
                        <option value={SYSTEM_VIEW.id}>{SYSTEM_VIEW.name}</option>
                        {templateViews.map((view) => (
                          <option key={view.id} value={view.id}>
                            [Template] {view.name}
                          </option>
                        ))}
                        {personalViews.map((view) => (
                          <option key={view.id} value={view.id}>
                            [Mine] {view.name}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button size="sm" variant="secondary" onClick={() => void saveCurrentAsView("PERSONAL")}>
                        Save as new
                      </Button>
                      {canManageTemplates ? (
                        <Button size="sm" variant="ghost" onClick={() => void saveCurrentAsView("ADMIN_TEMPLATE")}>
                          Save template
                        </Button>
                      ) : null}
                      <Button size="sm" variant="secondary" onClick={() => void updateCurrentView()}>
                        Save current
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void deleteCurrentView()}
                        disabled={
                          activeViewId === SYSTEM_VIEW.id ||
                          (activeView.scope === "ADMIN_TEMPLATE" && !canManageTemplates)
                        }
                      >
                        Delete view
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <FormField label="Workflow queue preset" htmlFor="workflowQueuePresetMenu">
                        <Select
                          id="workflowQueuePresetMenu"
                          value={activeWorkflowQueueId}
                          onChange={(event) => {
                            const nextValue = event.target.value as WorkflowQueuePresetId | "";
                            if (!nextValue) {
                              setActiveWorkflowQueueId("");
                              return;
                            }
                            applyWorkflowQueuePreset(nextValue);
                          }}
                        >
                          <option value="">Workflow queue preset</option>
                          {WORKFLOW_QUEUE_PRESETS.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.label}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void saveCurrentAsView("PERSONAL")}
                        disabled={!activeWorkflowQueueId}
                      >
                        Save
                      </Button>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">Panels</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button
                          size="sm"
                          variant={panelLayout.inspector ? "secondary" : "ghost"}
                          onClick={() => setPanelLayout((prev) => ({ ...prev, inspector: !prev.inspector }))}
                        >
                          Inspector
                        </Button>
                        <Button
                          size="sm"
                          variant={panelLayout.tripInspector ? "secondary" : "ghost"}
                          onClick={() => setPanelLayout((prev) => ({ ...prev, tripInspector: !prev.tripInspector }))}
                        >
                          Trip inspector
                        </Button>
                        <Button
                          size="sm"
                          variant={panelLayout.driverLanes ? "secondary" : "ghost"}
                          onClick={() => setPanelLayout((prev) => ({ ...prev, driverLanes: !prev.driverLanes }))}
                        >
                          Driver lanes
                        </Button>
                        <Button
                          size="sm"
                          variant={panelLayout.exceptions ? "secondary" : "ghost"}
                          onClick={() => setPanelLayout((prev) => ({ ...prev, exceptions: !prev.exceptions }))}
                        >
                          Exceptions
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <FormField label="Exceptions dock" htmlFor="exceptionsDockMenu">
                        <Select
                          id="exceptionsDockMenu"
                          value={panelLayout.exceptionsDock}
                          onChange={(event) =>
                            setPanelLayout((prev) => ({
                              ...prev,
                              exceptionsDock: event.target.value === "right" ? "right" : "left",
                            }))
                          }
                        >
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                        </Select>
                      </FormField>
                      <div className="flex items-end">
                        <Button size="sm" variant="secondary" onClick={() => setShowFilters((prev) => !prev)}>
                          {showFilters ? "Hide refine filters" : "Show refine filters"}
                        </Button>
                      </div>
                    </div>
                    <div className="text-[11px] text-[color:var(--color-text-muted)]">Active view: {activeView.name}</div>
                  </div>
                </div>
                </div>
              ) : null}
            </div>
            <SegmentedControl
              value={queueView}
              options={[
                { label: "Active", value: "active" },
                { label: "Recent", value: "recent" },
                { label: "History", value: "history" },
              ]}
              onChange={(value) => updateQueueViewParam(value as QueueView)}
            />
            <Button variant="secondary" size="sm" onClick={() => void loadDispatchLoads(filters, pageIndex)} disabled={queueLoading}>
              {queueLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-[color:var(--color-text-muted)]">
          {formatDispatchRefreshTime(lastRefreshedAt)}
        </div>
        {workspace === "loads" ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs">
              <div className="text-[color:var(--color-text-muted)]">In transit</div>
              <div className="font-semibold text-ink">{dispatchSignals.inTransitCount}</div>
            </div>
            <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs">
              <div className="text-[color:var(--color-text-muted)]">At risk</div>
              <div className="font-semibold text-ink">{dispatchSignals.atRiskCount}</div>
            </div>
            <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs">
              <div className="text-[color:var(--color-text-muted)]">Tracking continuity</div>
              <div className="font-semibold text-ink">{dispatchSignals.trackingContinuity}%</div>
            </div>
            <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs">
              <div className="text-[color:var(--color-text-muted)]">ETA confidence</div>
              <div className="font-semibold text-ink">{dispatchSignals.etaConfidence}</div>
            </div>
          </div>
        ) : null}
      </div>

      {selectedCount > 0 ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-3">
          <div className="text-sm font-medium text-ink">{selectedCount} selected</div>
          <FormField label="Bulk status" htmlFor="bulkStatus">
            <Select id="bulkStatus" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as BulkStatus)}>
              <option value="PLANNED">PLANNED</option>
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="IN_TRANSIT">IN_TRANSIT</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="POD_RECEIVED">POD_RECEIVED</option>
              <option value="READY_TO_INVOICE">READY_TO_INVOICE</option>
              <option value="INVOICED">INVOICED</option>
              <option value="PAID">PAID</option>
              <option value="CANCELLED">CANCELLED</option>
            </Select>
          </FormField>
          <Button size="sm" onClick={() => void runBulkStatusUpdate()} disabled={bulkLoading || isQueueReadOnly}>
            {bulkLoading ? "Applying..." : "Apply status"}
          </Button>
          <FormField label="Trip mode" htmlFor="bulkTripMode">
            <Select
              id="bulkTripMode"
              value={bulkMovementMode}
              onChange={(event) => setBulkMovementMode(event.target.value as "FTL" | "LTL" | "POOL_DISTRIBUTION")}
            >
              <option value="FTL">FTL</option>
              <option value="LTL">LTL</option>
              <option value="POOL_DISTRIBUTION">POOL_DISTRIBUTION</option>
            </Select>
          </FormField>
          <Button size="sm" variant="secondary" onClick={() => void createTripFromSelection()} disabled={bulkLoading}>
            {bulkLoading ? "Creating..." : "Create trip from selected"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedRows(new Set())}>
            Clear selection
          </Button>
          {bulkNote ? <div className="text-xs text-[color:var(--color-text-muted)]">{bulkNote}</div> : null}
        </div>
      ) : null}

      {showFilters ? (
        <div className="mt-3">
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
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-[color:var(--color-text-muted)]">Columns</summary>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {DISPATCH_OPTIONAL_COLUMNS.map((column) => (
                  <label key={column} className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
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
                    {column}
                  </label>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-[color:var(--color-text-muted)]">
                Required operational columns stay visible by system rule.
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
        </div>
      ) : null}

      {partialFailureMessages.length > 0 ? (
        <div className="mt-3 rounded-[var(--radius-control)] border border-[color:var(--color-warning)]/45 bg-[color:var(--color-warning)]/10 px-3 py-2 text-xs text-[color:var(--color-warning)]">
          Partial sync warning: {partialFailureMessages.join(" · ")}
        </div>
      ) : null}
      {dispatchError ? (
        <div className="mt-3 border-l-2 border-[color:var(--color-warning)] pl-3 text-sm text-[color:var(--color-warning)]">
          <div>{dispatchError}</div>
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => void loadDispatchLoads(filters, pageIndex)} disabled={queueLoading}>
              Retry queue refresh
            </Button>
          </div>
        </div>
      ) : null}
      {dispatchActionNote ? <div className="mt-2 text-xs text-[color:var(--color-success)]">{dispatchActionNote}</div> : null}
      {showInitialQueueLoadingState ? (
        <div className="mt-3">
          <Card>
            <EmptyState title="Loading dispatch queue..." description="Preparing trip-first execution rows." />
          </Card>
        </div>
      ) : null}
      {showQueueEmptyState ? (
        <div className="mt-3">
          <Card>
            <EmptyState title="No queue rows match this view." description="Adjust filters or switch queue/lens to continue triage." />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setFilters(defaultFilters);
                  setActiveWorkflowQueueId("");
                  setGridFilters(DEFAULT_GRID_STATE.filters);
                  setPageIndex(0);
                  void loadDispatchLoads(defaultFilters, 0);
                }}
              >
                Reset filters
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void loadDispatchLoads(filters, pageIndex)}>
                Retry
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
      {showQueueCanvas ? (
      <div className="mt-4" style={{ display: "grid", gap: "12px", gridTemplateColumns: dispatchGridTemplateColumns }}>
        {showExceptionsPanel && panelLayout.exceptionsDock === "left" ? (
          <RefinePanel className="max-h-[62vh] overflow-auto">
            <SectionHeader
              title="Exceptions"
              subtitle={exceptionSubtitle}
            />
            <div className="mt-2 space-y-2">
              {exceptionRows.length ? (
                exceptionRows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-2 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => openInspectorForLoad(row.loadId, "exceptions")}
                      className="w-full text-left hover:text-[color:var(--color-text)]"
                    >
                      <div className="font-semibold text-ink">{row.loadNumber}</div>
                      <div className="text-[color:var(--color-text-muted)]">{row.title}</div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text-subtle)]">
                        {row.status} · {row.severity} · {row.owner}
                      </div>
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">{formatExceptionAge(row.createdAt)}</div>
                    </button>
                    {row.actionable ? (
                      <div className="mt-2 flex gap-2">
                        {row.status !== "ACKNOWLEDGED" ? (
                          <Button size="sm" variant="ghost" onClick={() => void acknowledgeException(row.id)}>
                            Ack
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => void resolveException(row.id)}>
                          Resolve
                        </Button>
                        {row.status === "ACKNOWLEDGED" ? (
                          <Button size="sm" variant="ghost" onClick={() => void reopenException(row.id)}>
                            Reopen
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="text-xs text-[color:var(--color-text-muted)]">No open exceptions.</div>
              )}
            </div>
          </RefinePanel>
        ) : null}

        <div className="space-y-3">
          <DispatchSpreadsheetGrid
            rows={gridRows}
            filters={gridFilters}
            sortRules={gridSortRules}
            selectedLoadId={selectedLoadId}
            selectedRowIds={selectedRows}
            columnVisibility={normalizeViewColumns(columnVisibility)}
            density={gridDensity}
            loadingCellKey={cellSavingKey}
            readOnly={isQueueReadOnly}
            onSelectLoad={selectLoad}
            onToggleRowSelection={toggleRowSelection}
            onToggleAllRows={toggleAllRows}
            onFiltersChange={(nextFilters) => {
              setActiveWorkflowQueueId("");
              setGridFilters(nextFilters);
            }}
            onSortRulesChange={setGridSortRules}
            onInlineEdit={handleInlineEdit}
            onQuickAssign={(loadId) => openInspectorForLoad(loadId, "assignment")}
            onQuickOpenInspector={openInspectorForLoad}
            onQuickUploadPod={openUploadPodForLoad}
            workflowMacros={WORKFLOW_QUEUE_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))}
            onApplyWorkflowMacro={(macroId) => applyWorkflowQueuePreset(macroId as WorkflowQueuePresetId)}
          />
          {showDriverLanesPanel ? (
            <DriverLanesPanel
              drivers={availableDrivers}
              loads={gridRows}
              assigningLaneKey={laneAssigningKey}
              onAssignLoadToDriver={assignLoadFromLane}
            />
          ) : null}
        </div>

        {showInspectorPanel || showTripInspectorPanel ? (
          <div className="min-h-0 max-h-[calc(100dvh-24rem)] space-y-3 overflow-y-auto">
            {showInspectorPanel
              ? (workbenchRightPane ?? (
                  <Card>
                    <EmptyState title="Loading load..." description="Fetching assignment and stop details." />
                  </Card>
                ))
              : null}
            {showTripInspectorPanel ? tripInspectorPanel : null}
          </div>
        ) : null}

        {showExceptionsPanel && panelLayout.exceptionsDock === "right" ? (
          <RefinePanel className="max-h-[62vh] overflow-auto">
            <SectionHeader
              title="Exceptions"
              subtitle={exceptionSubtitle}
            />
            <div className="mt-2 space-y-2">
              {exceptionRows.length ? (
                exceptionRows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-2 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => openInspectorForLoad(row.loadId, "exceptions")}
                      className="w-full text-left hover:text-[color:var(--color-text)]"
                    >
                      <div className="font-semibold text-ink">{row.loadNumber}</div>
                      <div className="text-[color:var(--color-text-muted)]">{row.title}</div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text-subtle)]">
                        {row.status} · {row.severity} · {row.owner}
                      </div>
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">{formatExceptionAge(row.createdAt)}</div>
                    </button>
                    {row.actionable ? (
                      <div className="mt-2 flex gap-2">
                        {row.status !== "ACKNOWLEDGED" ? (
                          <Button size="sm" variant="ghost" onClick={() => void acknowledgeException(row.id)}>
                            Ack
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => void resolveException(row.id)}>
                          Resolve
                        </Button>
                        {row.status === "ACKNOWLEDGED" ? (
                          <Button size="sm" variant="ghost" onClick={() => void reopenException(row.id)}>
                            Reopen
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="text-xs text-[color:var(--color-text-muted)]">No open exceptions.</div>
              )}
            </div>
          </RefinePanel>
        ) : null}
      </div>
      ) : null}

      {showQueueCanvas ? (
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
      ) : null}

      <DispatchDocUploadDrawer
        open={Boolean(docUploadTarget)}
        loadId={docUploadTarget?.loadId ?? null}
        loadNumber={docUploadTarget?.loadNumber ?? null}
        onClose={() => setDocUploadTarget(null)}
        onUploaded={(payload) => void handleDocUploaded({ loadId: payload.loadId, docType: payload.docType })}
      />

    </AppShell>
  );
}

function DispatchTripsContent({
  workspace,
  onWorkspaceChange,
}: {
  workspace: DispatchWorkspace;
  onWorkspaceChange: (next: DispatchWorkspace) => void;
}) {
  return (
    <AppShell title="Dispatch" subtitle="Trip-first assignment and execution">
      <div className="sticky top-0 z-20 -mx-2 rounded-[var(--radius-card)] border-b border-[color:var(--color-divider)] bg-[color:var(--color-bg)]/95 px-2 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink">Dispatch Trips Workspace</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Trip execution is primary in carrier mode.
            </div>
          </div>
          <SegmentedControl
            value={workspace}
            options={[
              { label: "Trips", value: "trips" },
              { label: "Loads", value: "loads" },
            ]}
            onChange={(value) => onWorkspaceChange(value as DispatchWorkspace)}
          />
        </div>
      </div>
      <TripsWorkspace />
    </AppShell>
  );
}

function DispatchWorkspaceRouter() {
  const { user, org, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const workspaceParam = searchParams.get("workspace");
  const workspace = workspaceParam === "trips" || workspaceParam === "loads" ? workspaceParam : null;

  const setWorkspace = useCallback(
    (next: DispatchWorkspace) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("workspace", next);
      if (next === "trips") {
        params.delete("loadId");
      } else {
        params.delete("tripId");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (loading || workspace) return;
    setWorkspace(
      getDefaultDispatchWorkspace({
        role: user?.role,
        operatingMode: (org?.operatingMode as "CARRIER" | "BROKER" | "BOTH" | null | undefined) ?? null,
      })
    );
  }, [loading, org?.operatingMode, setWorkspace, user?.role, workspace]);

  if (loading || !workspace) {
    return (
      <AppShell title="Dispatch" subtitle="Trip-first assignment and execution">
        <EmptyState title="Loading dispatch workspace..." description="Applying your role-based default view." />
      </AppShell>
    );
  }

  const capabilities = getRoleCapabilities(user?.role);
  if (!capabilities.canAccessDispatch) {
    return (
      <AppShell title="Dispatch" subtitle="Trip-first assignment and execution">
        <NoAccess title="No access to Dispatch" description="You do not have permission to view dispatch execution." />
      </AppShell>
    );
  }

  if (workspace === "trips") {
    return <DispatchTripsContent workspace={workspace} onWorkspaceChange={setWorkspace} />;
  }

  return <DispatchPageContent workspace={workspace} onWorkspaceChange={setWorkspace} />;
}

export default function DispatchPage() {
  return (
    <Suspense fallback={null}>
      <DispatchWorkspaceRouter />
    </Suspense>
  );
}

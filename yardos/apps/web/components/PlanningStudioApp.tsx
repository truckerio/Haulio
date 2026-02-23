import { useEffect, useMemo, useRef, useState } from "react";
import type { Load, LoadImportMode, Placement, PlanSummary, SuggestedPlan, TrailerSpec } from "@yardos/contracts";
import {
  applyPlan,
  getContext,
  getEvents,
  getSuggestedPlans,
  importLoadsFile,
  previewPlan,
  rejectPlan,
  saveTrailerSpec,
} from "../lib/api";

const viewModes = ["Side", "Top", "Rear", "3D"] as const;

type ViewMode = (typeof viewModes)[number];
type LoadSortBy = "id" | "weight" | "pallets";
type LoadSortDir = "asc" | "desc";
type AssignedFilter = "all" | "assigned" | "unassigned";
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const FALLBACK_TRAILER_SPEC: TrailerSpec = {
  interiorLengthM: 16,
  interiorWidthM: 2.46,
  interiorHeightM: 2.67,
  laneCount: 2,
  slotCount: 20,
  legalWeightLbs: 44000,
};
const TRAILER_SPEC_LIMITS = {
  laneCount: { min: 1, max: 6, label: "Lanes" },
  slotCount: { min: 8, max: 64, label: "Slots" },
  legalWeightLbs: { min: 10000, max: 80000, label: "Legal lbs" },
} as const;
type TrailerSpecEditableField = keyof Pick<TrailerSpec, "laneCount" | "slotCount" | "legalWeightLbs">;
type TrailerSpecForm = Record<TrailerSpecEditableField, string>;

function trailerSpecToForm(spec: TrailerSpec): TrailerSpecForm {
  return {
    laneCount: String(spec.laneCount),
    slotCount: String(spec.slotCount),
    legalWeightLbs: String(spec.legalWeightLbs),
  };
}

function parseNumericField(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

function mergeSpecForm(baseSpec: TrailerSpec, form: TrailerSpecForm | null): TrailerSpec {
  if (!form) return baseSpec;
  const laneCount = parseNumericField(form.laneCount);
  const slotCount = parseNumericField(form.slotCount);
  const legalWeightLbs = parseNumericField(form.legalWeightLbs);
  return {
    ...baseSpec,
    laneCount:
      laneCount == null
        ? baseSpec.laneCount
        : clamp(laneCount, TRAILER_SPEC_LIMITS.laneCount.min, TRAILER_SPEC_LIMITS.laneCount.max),
    slotCount:
      slotCount == null
        ? baseSpec.slotCount
        : clamp(slotCount, TRAILER_SPEC_LIMITS.slotCount.min, TRAILER_SPEC_LIMITS.slotCount.max),
    legalWeightLbs:
      legalWeightLbs == null
        ? baseSpec.legalWeightLbs
        : clamp(
            legalWeightLbs,
            TRAILER_SPEC_LIMITS.legalWeightLbs.min,
            TRAILER_SPEC_LIMITS.legalWeightLbs.max
          ),
  };
}

function validateSpecForm(form: TrailerSpecForm | null) {
  if (!form) return null;
  const fieldOrder: TrailerSpecEditableField[] = ["laneCount", "slotCount", "legalWeightLbs"];
  for (const field of fieldOrder) {
    const value = parseNumericField(form[field]);
    const bounds = TRAILER_SPEC_LIMITS[field];
    if (value == null) {
      return `${bounds.label} is required.`;
    }
    if (value < bounds.min || value > bounds.max) {
      return `${bounds.label} must be between ${compactNumber(bounds.min)} and ${compactNumber(bounds.max)}.`;
    }
  }
  return null;
}

function sanitizeNumericInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function dollars(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatTime(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString();
}

function loadColor(loadId: string) {
  const palette = ["#f4d35e", "#6ea4bf", "#7fb685", "#ee964b", "#d95d39", "#a2d2ff", "#b8c480", "#9d79bc"];
  let hash = 0;
  for (let i = 0; i < loadId.length; i += 1) hash = (hash * 31 + loadId.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function riskTone(risk: SuggestedPlan["risk"]) {
  if (risk === "LOW") return "good";
  if (risk === "MEDIUM") return "warn";
  return "bad";
}

function summarizePlanViolations(summary?: PlanSummary | null) {
  if (!summary) return { high: 0, warning: 0 };
  return {
    high: (summary.violationsBySeverity.high ?? 0) + (summary.violationsBySeverity.critical ?? 0),
    warning: summary.violationsBySeverity.warning ?? 0,
  };
}

function PlannerGrid({
  trailerSpec,
  placements,
  selectedLoadId,
  hoveredLoadId,
  onHoverLoad,
}: {
  trailerSpec: TrailerSpec;
  placements: Placement[];
  selectedLoadId: string | null;
  hoveredLoadId: string | null;
  onHoverLoad: (loadId: string | null) => void;
}) {
  const map = useMemo(() => {
    const next = new Map<string, Placement>();
    for (const placement of placements) {
      next.set(`${placement.slotIndex}:${placement.laneIndex}`, placement);
    }
    return next;
  }, [placements]);

  const rows = Math.max(1, trailerSpec.laneCount);
  const cols = Math.max(1, trailerSpec.slotCount);

  return (
    <div className="planner-grid-wrap">
      <div className="planner-grid" style={{ gridTemplateColumns: `repeat(${cols}, 22px)` }}>
        {Array.from({ length: rows }).map((_, laneIndex) =>
          Array.from({ length: cols }).map((_, slotIndex) => {
            const cell = map.get(`${slotIndex}:${laneIndex}`);
            const active = Boolean(cell && (cell.loadId === selectedLoadId || cell.loadId === hoveredLoadId));
            return (
              <div
                key={`${slotIndex}:${laneIndex}`}
                className={`slot-cell ${cell ? "filled" : "empty"} ${active ? "active" : ""}`}
                style={cell ? { backgroundColor: loadColor(cell.loadId) } : undefined}
                onMouseEnter={() => onHoverLoad(cell?.loadId ?? null)}
                onMouseLeave={() => onHoverLoad(null)}
                title={
                  cell
                    ? `${cell.loadId} • pallet #${cell.palletIndex + 1} • ${compactNumber(cell.weightLbs)} lbs • seq ${cell.sequenceIndex ?? "-"}`
                    : `Slot ${slotIndex + 1} / Lane ${laneIndex + 1}`
                }
              />
            );
          })
        )}
      </div>
      <div className="grid-meta">
        <span>{cols} slots</span>
        <span>{rows} lanes</span>
        <span>{placements.length} pallets planned</span>
      </div>
    </div>
  );
}

export default function PlanningStudioApp() {
  const [viewMode, setViewMode] = useState<ViewMode>("Side");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [loads, setLoads] = useState<Load[]>([]);
  const [trailers, setTrailers] = useState<Array<{ id: string; unit?: string | null; type?: string | null; status?: string | null }>>([]);
  const [trailerSpecDefaults, setTrailerSpecDefaults] = useState<TrailerSpec | null>(null);
  const [draftTrailerSpec, setDraftTrailerSpec] = useState<TrailerSpec | null>(null);
  const [draftTrailerSpecForm, setDraftTrailerSpecForm] = useState<TrailerSpecForm | null>(null);
  const [savingSpec, setSavingSpec] = useState(false);

  const [selectedLoadIds, setSelectedLoadIds] = useState<string[]>([]);
  const [selectedTrailerId, setSelectedTrailerId] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [laneFilter, setLaneFilter] = useState("all");
  const [destinationFilter, setDestinationFilter] = useState("all");
  const [constraintFilter, setConstraintFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState<AssignedFilter>("all");
  const [sortBy, setSortBy] = useState<LoadSortBy>("id");
  const [sortDir, setSortDir] = useState<LoadSortDir>("asc");

  const [plans, setPlans] = useState<SuggestedPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [previewNotesByPlan, setPreviewNotesByPlan] = useState<Record<string, string[]>>({});
  const [previewSummaryByPlan, setPreviewSummaryByPlan] = useState<Record<string, PlanSummary>>({});
  const [previewedByPlan, setPreviewedByPlan] = useState<Record<string, boolean>>({});

  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const [applyNote, setApplyNote] = useState("Applied from Planning Studio");
  const [rejectReason, setRejectReason] = useState("Not operationally feasible");

  const [hoveredLoadId, setHoveredLoadId] = useState<string | null>(null);
  const [selectedLoadFocusId, setSelectedLoadFocusId] = useState<string | null>(null);

  const [events, setEvents] = useState<Array<{ id: string; createdAt: string; type: string; message: string }>>([]);
  const [eventsCursor, setEventsCursor] = useState<string | null>(null);
  const eventsCursorRef = useRef<string | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<LoadImportMode>("upsert");
  const [importing, setImporting] = useState(false);

  const activePlan = useMemo(() => plans.find((plan) => plan.planId === activePlanId) ?? null, [plans, activePlanId]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const load of loads) {
      if (load.status) set.add(load.status);
    }
    return ["all", ...Array.from(set).sort()];
  }, [loads]);

  const lanes = useMemo(() => {
    const set = new Set<string>();
    for (const load of loads) {
      if (load.lane) set.add(load.lane);
    }
    return ["all", ...Array.from(set).sort()];
  }, [loads]);

  const destinations = useMemo(() => {
    const set = new Set<string>();
    for (const load of loads) {
      if (load.destinationCode) set.add(load.destinationCode);
    }
    return ["all", ...Array.from(set).sort()];
  }, [loads]);

  const constraints = useMemo(() => {
    const set = new Set<string>();
    for (const load of loads) {
      load.constraints.forEach((c) => set.add(c));
    }
    return ["all", ...Array.from(set).sort()];
  }, [loads]);

  const filteredLoads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    let next = loads.filter((load) => {
      if (normalizedSearch) {
        const hay = `${load.id} ${load.loadNumber ?? ""} ${load.lane ?? ""} ${load.destinationCode ?? ""}`.toLowerCase();
        if (!hay.includes(normalizedSearch)) return false;
      }
      if (statusFilter !== "all" && (load.status ?? "") !== statusFilter) return false;
      if (laneFilter !== "all" && (load.lane ?? "") !== laneFilter) return false;
      if (destinationFilter !== "all" && (load.destinationCode ?? "") !== destinationFilter) return false;
      if (constraintFilter !== "all" && !load.constraints.includes(constraintFilter as Load["constraints"][number])) return false;
      if (assignedFilter === "assigned" && !load.trailerId) return false;
      if (assignedFilter === "unassigned" && load.trailerId) return false;
      return true;
    });

    next = [...next].sort((a, b) => {
      if (sortBy === "weight") {
        return sortDir === "asc" ? a.weightLbs - b.weightLbs : b.weightLbs - a.weightLbs;
      }
      if (sortBy === "pallets") {
        return sortDir === "asc" ? a.pallets - b.pallets : b.pallets - a.pallets;
      }
      const cmp = (a.loadNumber ?? a.id).localeCompare(b.loadNumber ?? b.id);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return next;
  }, [loads, search, statusFilter, laneFilter, destinationFilter, constraintFilter, assignedFilter, sortBy, sortDir]);

  const selectedLoads = useMemo(() => {
    const idSet = new Set(selectedLoadIds);
    return loads.filter((load) => idSet.has(load.id));
  }, [loads, selectedLoadIds]);

  const baseTrailerSpec: TrailerSpec = draftTrailerSpec ?? trailerSpecDefaults ?? FALLBACK_TRAILER_SPEC;
  const effectiveTrailerSpec = useMemo(
    () => mergeSpecForm(baseTrailerSpec, draftTrailerSpecForm),
    [baseTrailerSpec, draftTrailerSpecForm]
  );

  const activeSummary: PlanSummary | null = useMemo(() => {
    if (!activePlan) return null;
    return previewSummaryByPlan[activePlan.planId] ?? activePlan.summary;
  }, [activePlan, previewSummaryByPlan]);

  const focusedLoad = useMemo(() => {
    const targetId = selectedLoadFocusId ?? hoveredLoadId;
    if (!targetId) return null;
    return loads.find((load) => load.id === targetId) ?? null;
  }, [loads, selectedLoadFocusId, hoveredLoadId]);

  const focusedLoadPlacements = useMemo(() => {
    if (!activePlan || !focusedLoad) return [] as Placement[];
    return activePlan.placements.filter((placement) => placement.loadId === focusedLoad.id);
  }, [activePlan, focusedLoad]);

  async function loadContext() {
    const context = await getContext({ limit: 500 });
    const contextSpec = context.trailerSpecDefaults ?? FALLBACK_TRAILER_SPEC;
    setLoads(context.loads);
    setTrailers(context.trailers);
    setTrailerSpecDefaults(context.trailerSpecDefaults);
    setDraftTrailerSpec((prev) => prev ?? contextSpec);
    setDraftTrailerSpecForm((prev) => prev ?? trailerSpecToForm(contextSpec));
    setSelectedLoadIds((prev) => {
      const valid = new Set(context.loads.map((l) => l.id));
      const kept = prev.filter((id) => valid.has(id));
      if (kept.length > 0) return kept;
      return context.loads.slice(0, Math.min(3, context.loads.length)).map((l) => l.id);
    });
    setSelectedTrailerId((prev) => {
      if (prev && context.trailers.some((t) => t.id === prev)) return prev;
      return context.trailers[0]?.id ?? "";
    });
  }

  async function loadInitialEvents() {
    const feed = await getEvents();
    const mapped = feed.events.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      type: item.type,
      message: item.message,
    }));
    setEvents(mapped);
    const cursor = mapped[mapped.length - 1]?.createdAt ?? null;
    setEventsCursor(cursor);
    eventsCursorRef.current = cursor;
  }

  async function boot() {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([loadContext(), loadInitialEvents()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    eventsCursorRef.current = eventsCursor;
  }, [eventsCursor]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const feed = await getEvents(eventsCursorRef.current ?? undefined);
        if (!feed.events.length) return;
        const mapped = feed.events.map((item) => ({
          id: item.id,
          createdAt: item.createdAt,
          type: item.type,
          message: item.message,
        }));
        const lastCursor = mapped[mapped.length - 1]?.createdAt ?? eventsCursorRef.current;
        setEventsCursor(lastCursor ?? null);
        setEvents((prev) => {
          const seen = new Set(prev.map((event) => event.id));
          const appended = mapped.filter((event) => !seen.has(event.id));
          return appended.length ? [...prev, ...appended] : prev;
        });
      } catch {
        // non-blocking polling
      }
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  const generatePlans = async () => {
    if (selectedLoadIds.length === 0) {
      setError("Select at least one load to generate plans.");
      return;
    }

    try {
      setGenerating(true);
      setStatus("Generating suggested consolidation plans...");
      setError(null);
      const response = await getSuggestedPlans({
        loadIds: selectedLoadIds,
        trailerId: selectedTrailerId || null,
        trailerSpec: effectiveTrailerSpec,
      });
      setPlans(response.plans);
      setActivePlanId(response.plans[0]?.planId ?? null);
      setPreviewedByPlan({});
      setPreviewNotesByPlan({});
      setPreviewSummaryByPlan({});
      setStatus(`Generated ${response.plans.length} plan options.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const previewActivePlan = async () => {
    if (!activePlan) return;
    try {
      setPreviewing(true);
      setStatus(`Previewing ${activePlan.name}...`);
      setError(null);
      const response = await previewPlan({
        planId: activePlan.planId,
        trailerId: selectedTrailerId || null,
        trailerSpec: effectiveTrailerSpec,
        loads: activePlan.loads,
        placements: activePlan.placements,
        violations: activePlan.violations,
        source: "yardos.web",
      });
      setPreviewedByPlan((prev) => ({ ...prev, [activePlan.planId]: true }));
      setPreviewNotesByPlan((prev) => ({ ...prev, [activePlan.planId]: response.notes }));
      setPreviewSummaryByPlan((prev) => ({ ...prev, [activePlan.planId]: response.summary }));
      setStatus(`${activePlan.name} preview completed.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const applyActivePlan = async () => {
    if (!activePlan) return;
    if (!previewedByPlan[activePlan.planId]) {
      setError("Preview this plan before applying.");
      return;
    }
    try {
      setApplying(true);
      setStatus(`Applying ${activePlan.name}...`);
      setError(null);
      const response = await applyPlan({
        planId: activePlan.planId,
        trailerId: selectedTrailerId || null,
        trailerSpec: effectiveTrailerSpec,
        loads: activePlan.loads,
        placements: activePlan.placements,
        violations: activePlan.violations,
        source: "yardos.web",
        note: applyNote.trim() || undefined,
      });
      setStatus(`Applied ${activePlan.name}. Updated ${response.touchedLoads.length} load(s).`);
      await loadContext();
      const feed = await getEvents(eventsCursorRef.current ?? undefined);
      if (feed.events.length > 0) {
        const mapped = feed.events.map((item) => ({
          id: item.id,
          createdAt: item.createdAt,
          type: item.type,
          message: item.message,
        }));
        const cursor = mapped[mapped.length - 1]?.createdAt ?? eventsCursorRef.current;
        setEventsCursor(cursor ?? null);
        setEvents((prev) => {
          const seen = new Set(prev.map((event) => event.id));
          const appended = mapped.filter((event) => !seen.has(event.id));
          return [...prev, ...appended];
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const rejectActivePlan = async () => {
    if (!activePlan) return;
    if (rejectReason.trim().length < 3) {
      setError("Enter a clear rejection reason.");
      return;
    }
    try {
      setRejecting(true);
      setStatus(`Rejecting ${activePlan.name}...`);
      setError(null);
      await rejectPlan({
        planId: activePlan.planId,
        reason: rejectReason.trim(),
        source: "yardos.web",
        loadIds: activePlan.loads.map((load) => load.id),
      });
      setStatus(`Rejected ${activePlan.name}.`);
      const feed = await getEvents(eventsCursorRef.current ?? undefined);
      if (feed.events.length > 0) {
        const mapped = feed.events.map((item) => ({
          id: item.id,
          createdAt: item.createdAt,
          type: item.type,
          message: item.message,
        }));
        const cursor = mapped[mapped.length - 1]?.createdAt ?? eventsCursorRef.current;
        setEventsCursor(cursor ?? null);
        setEvents((prev) => {
          const seen = new Set(prev.map((event) => event.id));
          const appended = mapped.filter((event) => !seen.has(event.id));
          return [...prev, ...appended];
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRejecting(false);
    }
  };

  const importLoadFile = async () => {
    if (!importFile) {
      setError("Select a CSV or JSON load file first.");
      return;
    }
    try {
      setImporting(true);
      setError(null);
      setStatus(`Importing ${importFile.name}...`);
      const result = await importLoadsFile(importFile, importMode);
      setStatus(`Import complete: ${result.imported} added, ${result.updated} updated, ${result.skipped} skipped.`);
      if (result.errors.length > 0) {
        const first = result.errors[0];
        setError(`Some rows failed. Row ${first.row}: ${first.message}`);
      }
      setImportFile(null);
      await loadContext();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const saveSpec = async () => {
    const validationError = validateSpecForm(draftTrailerSpecForm);
    if (validationError) {
      setError(validationError);
      return;
    }
    const normalized = mergeSpecForm(baseTrailerSpec, draftTrailerSpecForm);
    try {
      setSavingSpec(true);
      setError(null);
      const response = await saveTrailerSpec(normalized);
      setTrailerSpecDefaults(response.trailerSpecDefaults);
      setDraftTrailerSpec(response.trailerSpecDefaults);
      setDraftTrailerSpecForm(trailerSpecToForm(response.trailerSpecDefaults));
      setStatus("Trailer default spec saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingSpec(false);
    }
  };

  const resetSpec = () => {
    const resetValue = trailerSpecDefaults ?? FALLBACK_TRAILER_SPEC;
    setDraftTrailerSpec(resetValue);
    setDraftTrailerSpecForm(trailerSpecToForm(resetValue));
    setStatus("Trailer spec reset to current defaults.");
  };

  const updateSpecForm = (field: TrailerSpecEditableField, value: string) => {
    const next = sanitizeNumericInput(value);
    setDraftTrailerSpecForm((prev) => ({
      ...(prev ?? trailerSpecToForm(baseTrailerSpec)),
      [field]: next,
    }));
  };

  const selectedCount = selectedLoadIds.length;
  const visibleSelectedCount = filteredLoads.filter((load) => selectedLoadIds.includes(load.id)).length;
  const loadIdsInView = useMemo(() => new Set(filteredLoads.map((load) => load.id)), [filteredLoads]);

  const selectAllVisible = () => {
    setSelectedLoadIds((prev) => [...new Set([...prev, ...filteredLoads.map((load) => load.id)])]);
  };

  const clearVisible = () => {
    setSelectedLoadIds((prev) => prev.filter((id) => !loadIdsInView.has(id)));
  };

  const clearAllSelected = () => setSelectedLoadIds([]);

  const focusedViolations = useMemo(() => {
    if (!activePlan || !focusedLoad) return [] as string[];
    return activePlan.violations.filter((v) => v.loadId === focusedLoad.id).map((v) => `${v.type}: ${v.reason}`);
  }, [activePlan, focusedLoad]);

  const refreshLoads = async () => {
    try {
      await loadContext();
      setStatus("Loads refreshed.");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) {
    return <div className="splash">Loading YardOS Planning Studio...</div>;
  }

  return (
    <div className="app-shell">
      <aside className="nav-rail">
        <div className="brand">Yard OS</div>
        <nav>
          <button className="nav-item">Dashboard</button>
          <button className="nav-item active">Planning Studio</button>
          <button className="nav-item">Execution</button>
          <button className="nav-item">Storage</button>
          <button className="nav-item">Billing</button>
          <button className="nav-item">Tracking</button>
          <button className="nav-item">Audit</button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <input className="search" placeholder="Search loads, lanes, destination..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="field" value={selectedTrailerId} onChange={(e) => setSelectedTrailerId(e.target.value)}>
            {trailers.map((trailer) => (
              <option key={trailer.id} value={trailer.id}>
                {trailer.unit ?? trailer.id}
              </option>
            ))}
          </select>
          <button className="action soft" onClick={() => void refreshLoads()}>
            Refresh Loads
          </button>
          <button className="action" onClick={generatePlans} disabled={generating || selectedCount === 0}>
            {generating ? "Generating..." : "Suggest plans"}
          </button>
        </header>

        {error ? <div className="banner error">{error}</div> : null}
        {status ? <div className="banner ok">{status}</div> : null}

        <section className="studio-grid">
          <div className="panel load-pool">
            <div className="panel-title">Load Pool</div>

            <div className="import-panel">
              <div className="import-title">Load File Import</div>
              <div className="import-row">
                <input type="file" accept=".csv,.json" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} />
              </div>
              <div className="import-row">
                <select value={importMode} onChange={(event) => setImportMode(event.target.value as LoadImportMode)}>
                  <option value="upsert">Upsert (recommended)</option>
                  <option value="append">Append only</option>
                  <option value="replace">Replace all loads</option>
                </select>
                <button className="action" onClick={importLoadFile} disabled={!importFile || importing}>
                  {importing ? "Importing..." : "Import file"}
                </button>
              </div>
              <a
                className="template-link"
                href={`${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4100"}/integrations/yardos/import-template.csv`}
                target="_blank"
                rel="noreferrer"
              >
                Download CSV template
              </a>
            </div>

            <div className="filter-grid">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status === "all" ? "All Statuses" : status}
                  </option>
                ))}
              </select>
              <select value={laneFilter} onChange={(e) => setLaneFilter(e.target.value)}>
                {lanes.map((lane) => (
                  <option key={lane} value={lane}>
                    {lane === "all" ? "All Lanes" : lane}
                  </option>
                ))}
              </select>
              <select value={destinationFilter} onChange={(e) => setDestinationFilter(e.target.value)}>
                {destinations.map((destination) => (
                  <option key={destination} value={destination}>
                    {destination === "all" ? "All Destinations" : destination}
                  </option>
                ))}
              </select>
              <select value={constraintFilter} onChange={(e) => setConstraintFilter(e.target.value)}>
                {constraints.map((constraint) => (
                  <option key={constraint} value={constraint}>
                    {constraint === "all" ? "All Constraints" : constraint}
                  </option>
                ))}
              </select>
              <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value as AssignedFilter)}>
                <option value="all">All Assignment</option>
                <option value="assigned">Assigned</option>
                <option value="unassigned">Unassigned</option>
              </select>
              <div className="inline-sort">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as LoadSortBy)}>
                  <option value="id">Sort: ID</option>
                  <option value="weight">Sort: Weight</option>
                  <option value="pallets">Sort: Pallets</option>
                </select>
                <button className="action soft" onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}>
                  {sortDir.toUpperCase()}
                </button>
              </div>
            </div>

            <div className="selection-row">
              <span>{visibleSelectedCount} / {filteredLoads.length} visible selected</span>
              <div className="selection-actions">
                <button className="chip-btn" onClick={selectAllVisible}>Select visible</button>
                <button className="chip-btn" onClick={clearVisible}>Clear visible</button>
                <button className="chip-btn" onClick={clearAllSelected}>Clear all</button>
              </div>
            </div>

            <div className="stack small-gap load-list">
              {filteredLoads.map((load) => {
                const selected = selectedLoadIds.includes(load.id);
                return (
                  <label key={load.id} className={`load-row ${selected ? "selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => {
                        setSelectedLoadIds((prev) => {
                          if (event.target.checked) return [...new Set([...prev, load.id])];
                          return prev.filter((id) => id !== load.id);
                        });
                      }}
                    />
                    <button
                      type="button"
                      className="load-focus"
                      onMouseEnter={() => setHoveredLoadId(load.id)}
                      onMouseLeave={() => setHoveredLoadId(null)}
                      onClick={() => setSelectedLoadFocusId((prev) => (prev === load.id ? null : load.id))}
                    >
                      <div className="line strong">ID: {load.loadNumber ?? load.id}</div>
                      <div className="line muted">{load.pallets} pallets • {compactNumber(load.weightLbs)} lbs • {load.status ?? "PLANNED"}</div>
                      <div className="line muted">{load.lane ?? "No lane"}</div>
                    </button>
                  </label>
                );
              })}
              {filteredLoads.length === 0 ? <div className="empty-hint">No loads match current filters.</div> : null}
            </div>
          </div>

          <div className="panel center-canvas">
            <div className="canvas-header">
              <div className="tabs">
                {viewModes.map((mode) => (
                  <button key={mode} className={`tab ${viewMode === mode ? "active" : ""}`} onClick={() => setViewMode(mode)}>
                    {mode}
                  </button>
                ))}
              </div>
              <div className="canvas-note">{viewMode} view</div>
            </div>

            <div className="spec-editor">
              <div className="spec-title">Trailer Spec</div>
              <div className="spec-grid">
                <label>
                  Lanes
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={1}
                    max={6}
                    value={draftTrailerSpecForm?.laneCount ?? String(baseTrailerSpec.laneCount)}
                    onChange={(e) => updateSpecForm("laneCount", e.target.value)}
                  />
                </label>
                <label>
                  Slots
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={8}
                    max={64}
                    value={draftTrailerSpecForm?.slotCount ?? String(baseTrailerSpec.slotCount)}
                    onChange={(e) => updateSpecForm("slotCount", e.target.value)}
                  />
                </label>
                <label>
                  Legal lbs
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={10000}
                    max={80000}
                    value={draftTrailerSpecForm?.legalWeightLbs ?? String(baseTrailerSpec.legalWeightLbs)}
                    onChange={(e) => updateSpecForm("legalWeightLbs", e.target.value)}
                  />
                </label>
              </div>
              <div className="spec-actions">
                <button className="action soft spec-btn" onClick={saveSpec} disabled={savingSpec}>
                  {savingSpec ? "Saving..." : "Save trailer spec"}
                </button>
                <button className="chip-btn spec-reset" onClick={resetSpec}>
                  Reset
                </button>
              </div>
            </div>

            {activePlan ? (
              <>
                <PlannerGrid
                  trailerSpec={effectiveTrailerSpec}
                  placements={activePlan.placements}
                  selectedLoadId={selectedLoadFocusId}
                  hoveredLoadId={hoveredLoadId}
                  onHoverLoad={setHoveredLoadId}
                />
                <div className="legend">
                  {selectedLoads.map((load) => (
                    <div key={load.id} className="legend-item">
                      <span className="swatch" style={{ backgroundColor: loadColor(load.id) }} />
                      <span>{load.loadNumber ?? load.id}</span>
                    </div>
                  ))}
                </div>
                {focusedLoad ? (
                  <div className="focus-card">
                    <div className="focus-title">Focused Load: {focusedLoad.loadNumber ?? focusedLoad.id}</div>
                    <div className="line muted">
                      Planned pallets: {focusedLoadPlacements.length} • Weight: {compactNumber(focusedLoad.weightLbs)} lbs • Destination: {focusedLoad.destinationCode ?? "-"}
                    </div>
                    {focusedViolations.length > 0 ? (
                      <ul className="focus-violations">
                        {focusedViolations.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="line muted">No violations on focused load.</div>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-canvas">Select loads and click "Suggest plans".</div>
            )}
          </div>

          <div className="panel suggested">
            <div className="panel-title">Suggested Plans</div>
            <div className="stack">
              {plans.map((plan) => {
                const active = plan.planId === activePlanId;
                const notes = previewNotesByPlan[plan.planId] ?? plan.notes;
                const summary = previewSummaryByPlan[plan.planId] ?? plan.summary;
                const violations = summarizePlanViolations(summary);
                return (
                  <div key={plan.planId} className={`plan-card ${active ? "active" : ""}`}>
                    <button type="button" className="plan-select" onClick={() => setActivePlanId(plan.planId)}>
                      <div className="line spread">
                        <strong>{plan.name}</strong>
                        <span>Score: {plan.score}</span>
                      </div>
                      <div className="line muted">Fill: {summary.fillPct}% • Savings: {dollars(plan.savingsUsd)}</div>
                      <div className={`risk ${riskTone(plan.risk)}`}>Risk: {plan.risk}</div>
                      <div className="line muted">
                        Violations: {violations.high} high, {violations.warning} warning
                      </div>
                      <ul>
                        {notes.slice(0, 3).map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </button>
                  </div>
                );
              })}
              {plans.length === 0 ? <div className="empty-hint">No plans generated yet.</div> : null}
            </div>

            <div className="action-form">
              <label>
                Apply note
                <textarea value={applyNote} onChange={(e) => setApplyNote(e.target.value)} rows={2} />
              </label>
              <label>
                Reject reason
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} />
              </label>
            </div>

            <div className="button-row">
              <button className="action soft" onClick={previewActivePlan} disabled={!activePlan || previewing}>
                {previewing ? "Previewing..." : "Preview"}
              </button>
              <button className="action good" onClick={applyActivePlan} disabled={!activePlan || applying}>
                {applying ? "Applying..." : "Apply"}
              </button>
              <button className="action bad" onClick={rejectActivePlan} disabled={!activePlan || rejecting}>
                {rejecting ? "Rejecting..." : "Reject"}
              </button>
            </div>
            {activePlan && !previewedByPlan[activePlan.planId] ? (
              <div className="preview-hint">Preview required before apply.</div>
            ) : null}
          </div>
        </section>

        <section className="bottom-strip">
          <div className="metric">
            <div className="label">Pallet Fill</div>
            <div className="value">{activeSummary ? `${activeSummary.fillPct}%` : "-"}</div>
          </div>
          <div className="metric">
            <div className="label">Weight</div>
            <div className="value">
              {activeSummary
                ? `${compactNumber(activeSummary.totalWeightLbs)} / ${compactNumber(activeSummary.legalWeightLbs)} lbs`
                : "-"}
            </div>
          </div>
          <div className="metric">
            <div className="label">Axle Balance</div>
            <div className="value">{activeSummary?.axleBalance.status ?? "-"}</div>
          </div>
          <div className="metric events">
            <div className="label">Recent Events</div>
            <div className="events-list">
              {events.slice(-6).reverse().map((event) => (
                <div key={event.id} className="event-row" title={formatTime(event.createdAt)}>
                  {event.type}: {event.message}
                </div>
              ))}
              {events.length === 0 ? <div className="event-row">No events yet.</div> : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { ErrorBanner } from "@/components/ui/error-banner";
import { apiFetch } from "@/lib/api";
import { applyFailClosedCapability, getRoleCapabilities, isForbiddenError } from "@/lib/capabilities";
import { formatDateTime } from "@/lib/date-time";
import { buildGroupedTripLoads, isLtlLikeMovementMode } from "../trip-load-grouping";

const NOTE_TYPES = ["OPERATIONAL", "BILLING", "COMPLIANCE", "INTERNAL", "CUSTOMER_VISIBLE"] as const;
const NOTE_PRIORITIES = ["NORMAL", "IMPORTANT", "ALERT"] as const;
const TRIP_EDIT_REASON_CODES = [
  "DATA_CORRECTION",
  "CUSTOMER_CHANGE",
  "APPOINTMENT_CHANGE",
  "ROUTE_CHANGE",
  "OPS_OVERRIDE",
  "OTHER",
] as const;

function formatCents(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function formatMiles(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(1)} mi`;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offsetMinutes * 60_000);
  return localDate.toISOString().slice(0, 16);
}

type TripPayload = {
  id: string;
  tripNumber: string;
  status: string;
  movementMode: string;
  origin?: string | null;
  destination?: string | null;
  plannedDepartureAt?: string | null;
  plannedArrivalAt?: string | null;
  driver?: { id: string; name?: string | null } | null;
  truck?: { id: string; unit?: string | null } | null;
  trailer?: { id: string; unit?: string | null } | null;
  loads: Array<{
    id: string;
    sequence: number;
    load: {
      id: string;
      loadNumber: string;
      status: string;
      customerName?: string | null;
    };
  }>;
};

type LoadDetails = {
  id: string;
  loadNumber: string;
  status: string;
  movementMode?: string | null;
  miles?: number | null;
  paidMiles?: number | null;
  paidMilesSource?: string | null;
  palletCount?: number | null;
  weightLbs?: number | null;
  stops?: Array<{
    id: string;
    sequence: number;
    type: string;
    name?: string | null;
    city?: string | null;
    state?: string | null;
    appointmentStart?: string | null;
    appointmentEnd?: string | null;
    arrivedAt?: string | null;
    departedAt?: string | null;
  }>;
  docs?: Array<{ id: string; type: string; status: string; uploadedAt?: string | null }>;
  accessorials?: Array<{ id: string; amount?: string | number | null }>;
};

type TimelineEntry = {
  id: string;
  kind: "NOTE" | "SYSTEM_EVENT" | "EXCEPTION" | "DOCUMENT_EVENT";
  message?: string;
  type?: string;
  timestamp?: string;
  time?: string;
  payload?: Record<string, unknown>;
};

type SettlementPreview = {
  tripId: string;
  plannedMiles: number;
  paidMiles: number | null;
  milesVariance: number | null;
  milesSource: string | null;
  totalPallets: number;
  totalWeightLbs: number;
  accessorialTotalCents: number;
  deductionsTotalCents: number;
  netPayPreviewCents: number | null;
};

export default function TripDetailPage() {
  const params = useParams();
  const tripId = params?.id as string | undefined;
  const [trip, setTrip] = useState<TripPayload | null>(null);
  const [loadDetails, setLoadDetails] = useState<Record<string, LoadDetails>>({});
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [settlementPreview, setSettlementPreview] = useState<SettlementPreview | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [expandedLoadId, setExpandedLoadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerRestricted, setComposerRestricted] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteType, setNoteType] = useState<(typeof NOTE_TYPES)[number]>("OPERATIONAL");
  const [notePriority, setNotePriority] = useState<(typeof NOTE_PRIORITIES)[number]>("NORMAL");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [tripEditing, setTripEditing] = useState(false);
  const [tripSaving, setTripSaving] = useState(false);
  const [tripEditError, setTripEditError] = useState<string | null>(null);
  const [tripReasonCode, setTripReasonCode] = useState<(typeof TRIP_EDIT_REASON_CODES)[number]>("DATA_CORRECTION");
  const [tripReasonNote, setTripReasonNote] = useState("");
  const [tripForm, setTripForm] = useState({
    origin: "",
    destination: "",
    plannedDepartureAt: "",
    plannedArrivalAt: "",
    movementMode: "FTL",
  });

  const loadData = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const [mePayload, tripPayload, timelinePayload] = await Promise.all([
        apiFetch<{ user: { role?: string } }>("/auth/me"),
        apiFetch<{ trip: TripPayload }>(`/trips/${tripId}`),
        apiFetch<{ timeline: TimelineEntry[] }>(`/timeline?entityType=TRIP&entityId=${encodeURIComponent(tripId)}`),
      ]);

      const role = mePayload.user?.role ?? null;
      setUserRole(role);
      setTrip(tripPayload.trip);
      setTimeline(timelinePayload.timeline ?? []);
      setExpandedLoadId((prev) => prev ?? tripPayload.trip.loads?.[0]?.load.id ?? null);

      const detailEntries = await Promise.all(
        (tripPayload.trip.loads ?? []).map(async (row) => {
          try {
            const payload = await apiFetch<{ load: LoadDetails }>(`/loads/${row.load.id}`);
            return [row.load.id, payload.load] as const;
          } catch {
            return [row.load.id, null] as const;
          }
        })
      );
      setLoadDetails(
        detailEntries.reduce<Record<string, LoadDetails>>((acc, [loadId, value]) => {
          if (value) acc[loadId] = value;
          return acc;
        }, {})
      );
      if (getRoleCapabilities(role).canViewSettlementPreview) {
        try {
          const payload = await apiFetch<{ preview: SettlementPreview }>(`/trips/${tripId}/settlement-preview`);
          setSettlementPreview(payload.preview ?? null);
        } catch {
          setSettlementPreview(null);
        }
      } else {
        setSettlementPreview(null);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Unable to load trip.");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!trip) {
      setExpandedLoadId(null);
      return;
    }
    if (expandedLoadId && trip.loads.some((row) => row.load.id === expandedLoadId)) {
      return;
    }
    setExpandedLoadId(trip.loads[0]?.load.id ?? null);
  }, [trip, expandedLoadId]);

  useEffect(() => {
    if (!trip || tripEditing) return;
    setTripForm({
      origin: trip.origin ?? "",
      destination: trip.destination ?? "",
      plannedDepartureAt: toDateTimeLocal(trip.plannedDepartureAt),
      plannedArrivalAt: toDateTimeLocal(trip.plannedArrivalAt),
      movementMode: trip.movementMode ?? "FTL",
    });
  }, [trip, tripEditing]);

  const capabilities = useMemo(() => getRoleCapabilities(userRole), [userRole]);
  const canCreateNotes = applyFailClosedCapability(capabilities.canCreateLoadNotes, composerRestricted);
  const canViewSettlementPreview = capabilities.canViewSettlementPreview;
  const canEditTrip = userRole === "ADMIN" || userRole === "DISPATCHER" || userRole === "HEAD_DISPATCHER";
  const transitLimitedEdit = trip?.status === "IN_TRANSIT" && userRole !== "ADMIN";

  const stopRows = useMemo(() => {
    if (!trip) return [];
    const rows: Array<{
      key: string;
      loadNumber: string;
      sequence: number;
      type: string;
      name: string;
      city: string;
      state: string;
      appointmentStart?: string | null;
      appointmentEnd?: string | null;
      arrivedAt?: string | null;
      departedAt?: string | null;
    }> = [];
    for (const loadRow of trip.loads) {
      const details = loadDetails[loadRow.load.id];
      for (const stop of details?.stops ?? []) {
        rows.push({
          key: `${loadRow.load.id}:${stop.id}`,
          loadNumber: loadRow.load.loadNumber,
          sequence: stop.sequence ?? 0,
          type: stop.type,
          name: stop.name ?? "-",
          city: stop.city ?? "-",
          state: stop.state ?? "",
          appointmentStart: stop.appointmentStart,
          appointmentEnd: stop.appointmentEnd,
          arrivedAt: stop.arrivedAt,
          departedAt: stop.departedAt,
        });
      }
    }
    return rows.sort((left, right) => {
      if (left.loadNumber !== right.loadNumber) return left.loadNumber.localeCompare(right.loadNumber);
      return left.sequence - right.sequence;
    });
  }, [trip, loadDetails]);

  const noteTimeline = useMemo(() => timeline.filter((item) => item.kind === "NOTE"), [timeline]);
  const activityTimeline = useMemo(() => timeline.filter((item) => item.kind !== "NOTE").slice(0, 12), [timeline]);

  const docsSummary = useMemo(() => {
    const stats = { pod: 0, bol: 0, rateCon: 0, totalDocs: 0 };
    for (const details of Object.values(loadDetails)) {
      for (const doc of details.docs ?? []) {
        stats.totalDocs += 1;
        if (doc.type === "POD") stats.pod += 1;
        if (doc.type === "BOL") stats.bol += 1;
        if (doc.type === "RATECON" || doc.type === "RATE_CONFIRMATION") stats.rateCon += 1;
      }
    }
    return stats;
  }, [loadDetails]);

  const blockers = useMemo(() => {
    if (!trip) return [];
    const list: string[] = [];
    if (!trip.driver?.id) list.push("Trip has no assigned driver.");
    if (!trip.truck?.id) list.push("Trip has no assigned truck.");
    if (!trip.trailer?.id) list.push("Trip has no assigned trailer.");
    const hasUndocumentedLoad = trip.loads.some((row) => (loadDetails[row.load.id]?.docs ?? []).length === 0);
    if (hasUndocumentedLoad) list.push("One or more loads have no documents uploaded.");
    return list;
  }, [trip, loadDetails]);

  const financeSummary = useMemo(() => {
    if (!trip) return { delivered: 0, ready: 0, invoiced: 0, paid: 0 };
    return trip.loads.reduce(
      (acc, row) => {
        const status = row.load.status;
        if (status === "DELIVERED") acc.delivered += 1;
        if (status === "READY_TO_INVOICE") acc.ready += 1;
        if (status === "INVOICED") acc.invoiced += 1;
        if (status === "PAID") acc.paid += 1;
        return acc;
      },
      { delivered: 0, ready: 0, invoiced: 0, paid: 0 }
    );
  }, [trip]);

  const isLtlLike = isLtlLikeMovementMode(trip?.movementMode);

  const groupedTripLoads = useMemo(() => {
    if (!trip) return [];
    return buildGroupedTripLoads({
      movementMode: trip.movementMode,
      loads: trip.loads,
      loadDetails,
    });
  }, [trip, loadDetails]);

  const saveNote = async () => {
    if (!trip) return;
    const body = noteBody.trim();
    if (!body) {
      setNoteError("Note body is required.");
      return;
    }
    setNoteSaving(true);
    setNoteError(null);
    setNoteStatus(null);
    try {
      await apiFetch("/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "TRIP",
          entityId: trip.id,
          body,
          noteType,
          priority: notePriority,
        }),
      });
      setNoteBody("");
      setNoteStatus("Saved");
      await loadData();
    } catch (err) {
      if (isForbiddenError(err)) {
        setComposerRestricted(true);
        setNoteError("Restricted: you cannot create trip notes.");
      } else {
        setNoteError((err as Error).message || "Unable to save note.");
      }
    } finally {
      setNoteSaving(false);
    }
  };

  const saveTripEdits = async () => {
    if (!trip) return;
    setTripSaving(true);
    setTripEditError(null);
    try {
      await apiFetch<{ trip: TripPayload }>(`/trips/${trip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: tripForm.origin.trim() || null,
          destination: tripForm.destination.trim() || null,
          plannedDepartureAt: tripForm.plannedDepartureAt ? new Date(tripForm.plannedDepartureAt).toISOString() : null,
          plannedArrivalAt: tripForm.plannedArrivalAt ? new Date(tripForm.plannedArrivalAt).toISOString() : null,
          movementMode: tripForm.movementMode,
          reasonCode: tripReasonCode,
          reasonNote: tripReasonNote.trim() || undefined,
        }),
      });
      setTripEditing(false);
      setTripReasonCode("DATA_CORRECTION");
      setTripReasonNote("");
      await loadData();
    } catch (err) {
      if (isForbiddenError(err)) {
        setTripEditError("Restricted: you cannot edit this trip.");
      } else {
        setTripEditError((err as Error).message || "Unable to update trip.");
      }
    } finally {
      setTripSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Trip Detail" subtitle="Execution cockpit">
        <EmptyState title="Loading trip..." description="Pulling trip execution data." />
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell title="Trip Detail" subtitle="Execution cockpit">
        <EmptyState title="Trip not found" description="This trip may have been deleted or you may not have access." />
      </AppShell>
    );
  }

  return (
    <AppShell title="Trip Detail" subtitle="Execution cockpit">
      {error ? <ErrorBanner message={error} /> : null}
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Trip</div>
            <div className="text-2xl font-semibold text-ink">{trip.tripNumber}</div>
          </div>
          <StatusChip label={trip.status} tone={trip.status === "IN_TRANSIT" ? "info" : "neutral"} />
        </div>
        <div className="text-sm text-[color:var(--color-text-muted)]">
          {trip.origin ?? "-"}
          {" -> "}
          {trip.destination ?? "-"} · {trip.movementMode}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1.4fr_1fr]">
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="text-sm font-semibold text-ink">Stops & appointments</div>
            {stopRows.length === 0 ? (
              <EmptyState title="No stops available" description="Stops appear once load details are available." />
            ) : (
              <div className="space-y-2">
                {stopRows.map((stop) => (
                  <div key={stop.key} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {stop.loadNumber} · {stop.type}
                    </div>
                    <div className="text-sm font-semibold text-ink">{stop.name}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {stop.city}
                      {stop.state ? `, ${stop.state}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                      Appointment: {formatDateTime(stop.appointmentStart, "-")} - {formatDateTime(stop.appointmentEnd, "-")}
                    </div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      Check in: {formatDateTime(stop.arrivedAt, "-")} · Check out: {formatDateTime(stop.departedAt, "-")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="text-sm font-semibold text-ink">Notes</div>
            {canCreateNotes ? (
              <div className="space-y-2">
                <textarea
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  className="min-h-[96px] w-full rounded-[var(--radius-input)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-base)] px-3 py-2 text-sm text-ink"
                  placeholder="Add operational context for this trip"
                />
                <div className="flex flex-wrap items-end gap-2">
                  <FormField label="Type" htmlFor="tripNoteType">
                    <Select
                      id="tripNoteType"
                      value={noteType}
                      onChange={(event) => setNoteType(event.target.value as (typeof NOTE_TYPES)[number])}
                    >
                      {NOTE_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Priority" htmlFor="tripNotePriority">
                    <Select
                      id="tripNotePriority"
                      value={notePriority}
                      onChange={(event) => setNotePriority(event.target.value as (typeof NOTE_PRIORITIES)[number])}
                    >
                      {NOTE_PRIORITIES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <Button size="sm" onClick={saveNote} disabled={noteSaving}>
                    {noteSaving ? "Saving..." : "Save note"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[color:var(--color-text-muted)]">Restricted: you cannot create trip notes.</div>
            )}
            {noteStatus ? <div className="text-xs text-[color:var(--color-text-muted)]">{noteStatus}</div> : null}
            {noteError ? <div className="text-xs text-[color:var(--color-danger)]">{noteError}</div> : null}
            <div className="space-y-2">
              {noteTimeline.length === 0 ? (
                <div className="text-sm text-[color:var(--color-text-muted)]">No notes yet.</div>
              ) : (
                noteTimeline.map((item) => (
                  <div key={item.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {String(item.payload?.noteType ?? "INTERNAL")} · {String(item.payload?.priority ?? "NORMAL")} ·{" "}
                      {formatDateTime(item.timestamp ?? item.time, "-")}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-ink">
                      {String(item.payload?.body ?? item.payload?.text ?? item.message ?? "")}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="text-sm font-semibold text-ink">Recent activity</div>
            {activityTimeline.length === 0 ? (
              <div className="text-sm text-[color:var(--color-text-muted)]">No activity events yet.</div>
            ) : (
              <div className="space-y-2">
                {activityTimeline.map((item) => (
                  <div key={item.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {item.kind} · {item.type ?? "EVENT"} · {formatDateTime(item.timestamp ?? item.time, "-")}
                    </div>
                    <div className="text-sm text-ink">{item.message ?? "-"}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-ink">Command rail</div>
              {canEditTrip ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (tripEditing) {
                      setTripEditing(false);
                      setTripReasonCode("DATA_CORRECTION");
                      setTripReasonNote("");
                      setTripEditError(null);
                    } else {
                      setTripEditing(true);
                    }
                  }}
                >
                  {tripEditing ? "Cancel" : "Edit trip"}
                </Button>
              ) : null}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Driver: {trip.driver?.name ?? "Unassigned"} · Truck: {trip.truck?.unit ?? "-"} · Trailer:{" "}
              {trip.trailer?.unit ?? "-"}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Departure: {formatDateTime(trip.plannedDepartureAt, "-")} · Arrival: {formatDateTime(trip.plannedArrivalAt, "-")}
            </div>
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
              Execution updates are managed in <span className="font-medium text-ink">Trip/Dispatch</span>. Billing
              actions are managed in <span className="font-medium text-ink">Load/Finance</span>.
            </div>
            {tripEditing ? (
              <div className="space-y-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-3">
                <FormField label="Origin" htmlFor="tripEditOrigin">
                  <Input
                    id="tripEditOrigin"
                    value={tripForm.origin}
                    onChange={(event) => setTripForm((prev) => ({ ...prev, origin: event.target.value }))}
                    disabled={transitLimitedEdit}
                  />
                </FormField>
                <FormField label="Destination" htmlFor="tripEditDestination">
                  <Input
                    id="tripEditDestination"
                    value={tripForm.destination}
                    onChange={(event) => setTripForm((prev) => ({ ...prev, destination: event.target.value }))}
                  />
                </FormField>
                <FormField label="Planned departure" htmlFor="tripEditPlannedDepartureAt">
                  <Input
                    id="tripEditPlannedDepartureAt"
                    type="datetime-local"
                    value={tripForm.plannedDepartureAt}
                    onChange={(event) => setTripForm((prev) => ({ ...prev, plannedDepartureAt: event.target.value }))}
                    disabled={transitLimitedEdit}
                  />
                </FormField>
                <FormField label="Planned arrival" htmlFor="tripEditPlannedArrivalAt">
                  <Input
                    id="tripEditPlannedArrivalAt"
                    type="datetime-local"
                    value={tripForm.plannedArrivalAt}
                    onChange={(event) => setTripForm((prev) => ({ ...prev, plannedArrivalAt: event.target.value }))}
                  />
                </FormField>
                <FormField label="Movement mode" htmlFor="tripEditMovementMode">
                  <Select
                    id="tripEditMovementMode"
                    value={tripForm.movementMode}
                    onChange={(event) => setTripForm((prev) => ({ ...prev, movementMode: event.target.value }))}
                    disabled={transitLimitedEdit}
                  >
                    <option value="FTL">FTL</option>
                    <option value="LTL">LTL</option>
                    <option value="POOL_DISTRIBUTION">POOL_DISTRIBUTION</option>
                  </Select>
                </FormField>
                <FormField label="Reason code" htmlFor="tripEditReasonCode">
                  <Select
                    id="tripEditReasonCode"
                    value={tripReasonCode}
                    onChange={(event) => setTripReasonCode(event.target.value as (typeof TRIP_EDIT_REASON_CODES)[number])}
                  >
                    {TRIP_EDIT_REASON_CODES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Reason note (optional)" htmlFor="tripEditReasonNote">
                  <Input
                    id="tripEditReasonNote"
                    value={tripReasonNote}
                    onChange={(event) => setTripReasonNote(event.target.value)}
                    placeholder="What changed and why"
                  />
                </FormField>
                <Button size="sm" onClick={saveTripEdits} disabled={tripSaving}>
                  {tripSaving ? "Saving..." : "Save trip edits"}
                </Button>
                {tripEditError ? <div className="text-xs text-[color:var(--color-danger)]">{tripEditError}</div> : null}
                {transitLimitedEdit ? (
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    In transit: only destination and planned arrival are editable.
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card className="space-y-2">
            <div className="text-sm font-semibold text-ink">Execution blockers</div>
            {blockers.length === 0 ? (
              <div className="text-xs text-[color:var(--color-text-muted)]">No blockers detected.</div>
            ) : (
              <ul className="space-y-1 text-xs text-[color:var(--color-text-muted)]">
                {blockers.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-2">
            <div className="text-sm font-semibold text-ink">Docs handoff</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              POD: {docsSummary.pod} · BOL: {docsSummary.bol} · RateCon: {docsSummary.rateCon}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Total uploaded docs: {docsSummary.totalDocs}</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Use load detail documents when dispatch needs billing handoff evidence.
            </div>
          </Card>

          <Card className="space-y-2">
            <div className="text-sm font-semibold text-ink">Commercial snapshot (read-only)</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Delivered: {financeSummary.delivered} · Ready: {financeSummary.ready}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Invoiced: {financeSummary.invoiced} · Paid: {financeSummary.paid}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Commercial mutations happen in load billing and finance workspaces.
            </div>
          </Card>

          {canViewSettlementPreview ? (
            <>
              <Card className="space-y-2">
                <div className="text-sm font-semibold text-ink">Trip miles</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Planned: {formatMiles(settlementPreview?.plannedMiles)}
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Paid: {formatMiles(settlementPreview?.paidMiles)}
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Variance: {formatMiles(settlementPreview?.milesVariance)}
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Source: {settlementPreview?.milesSource ?? "-"}
                </div>
              </Card>

              <Card className="space-y-2">
                <div className="text-sm font-semibold text-ink">Settlement preview</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Accessorials: {formatCents(settlementPreview?.accessorialTotalCents)}
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Deductions: {formatCents(settlementPreview?.deductionsTotalCents)}
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Net pay preview: {formatCents(settlementPreview?.netPayPreviewCents)}
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Pallets: {settlementPreview?.totalPallets ?? 0} · Weight: {settlementPreview?.totalWeightLbs ?? 0} lbs
                </div>
              </Card>
            </>
          ) : null}

        </div>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink">Loads in trip</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setExpandedLoadId(null)}>
              Collapse all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExpandedLoadId(trip.loads[0]?.load.id ?? null)}>
              Expand first
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {groupedTripLoads.map((group) => (
            <div key={group.key} className="space-y-2">
              {isLtlLike ? (
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">
                  {group.label} · {group.loads.length} loads · {group.pallets} pallets · {group.weightLbs} lbs
                </div>
              ) : null}
              {group.loads.map((row) => {
                const details = loadDetails[row.load.id];
                const isExpanded = expandedLoadId === row.load.id;
                return (
                  <div key={row.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setExpandedLoadId((prev) => (prev === row.load.id ? null : row.load.id))}
                    >
                      <div className="text-sm font-semibold text-ink">
                        {row.sequence}. {row.load.loadNumber} · {row.load.status} · {row.load.customerName ?? "Customer"}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        Pallets: {details?.palletCount ?? 0} · Weight: {details?.weightLbs ?? 0} lbs · Miles:{" "}
                        {formatMiles(details?.miles ?? null)}
                      </div>
                    </button>
                    {isExpanded ? (
                      <div className="mt-3 grid gap-2 text-xs text-[color:var(--color-text-muted)] md:grid-cols-2">
                        <div>Stops: {details?.stops?.length ?? 0}</div>
                        <div>Docs: {details?.docs?.length ?? 0}</div>
                        <div>Paid miles: {formatMiles(details?.paidMiles ?? null)}</div>
                        <div>Miles source: {details?.paidMilesSource ?? "-"}</div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { ErrorBanner } from "@/components/ui/error-banner";
import { apiFetch } from "@/lib/api";
import { applyFailClosedCapability, getRoleCapabilities, isForbiddenError } from "@/lib/capabilities";
import { formatDateTime } from "@/lib/date-time";

const NOTE_TYPES = ["OPERATIONAL", "BILLING", "COMPLIANCE", "INTERNAL", "CUSTOMER_VISIBLE"] as const;
const NOTE_PRIORITIES = ["NORMAL", "IMPORTANT", "ALERT"] as const;

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

export default function TripDetailPage() {
  const params = useParams();
  const tripId = params?.id as string | undefined;
  const [trip, setTrip] = useState<TripPayload | null>(null);
  const [loadDetails, setLoadDetails] = useState<Record<string, LoadDetails>>({});
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerRestricted, setComposerRestricted] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteType, setNoteType] = useState<(typeof NOTE_TYPES)[number]>("OPERATIONAL");
  const [notePriority, setNotePriority] = useState<(typeof NOTE_PRIORITIES)[number]>("NORMAL");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const [mePayload, tripPayload, timelinePayload] = await Promise.all([
        apiFetch<{ user: { role?: string } }>("/auth/me"),
        apiFetch<{ trip: TripPayload }>(`/trips/${tripId}`),
        apiFetch<{ timeline: TimelineEntry[] }>(`/timeline?entityType=TRIP&entityId=${encodeURIComponent(tripId)}`),
      ]);

      setUserRole(mePayload.user?.role ?? null);
      setTrip(tripPayload.trip);
      setTimeline(timelinePayload.timeline ?? []);

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

  const capabilities = useMemo(() => getRoleCapabilities(userRole), [userRole]);
  const canCreateNotes = applyFailClosedCapability(capabilities.canCreateLoadNotes, composerRestricted);

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
            <div className="text-sm font-semibold text-ink">Command rail</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Driver: {trip.driver?.name ?? "Unassigned"} · Truck: {trip.truck?.unit ?? "-"} · Trailer:{" "}
              {trip.trailer?.unit ?? "-"}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Departure: {formatDateTime(trip.plannedDepartureAt, "-")} · Arrival: {formatDateTime(trip.plannedArrivalAt, "-")}
            </div>
          </Card>

          <Card className="space-y-2">
            <div className="text-sm font-semibold text-ink">Docs/POD status</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              POD: {docsSummary.pod} · BOL: {docsSummary.bol} · RateCon: {docsSummary.rateCon}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Total uploaded docs: {docsSummary.totalDocs}</div>
          </Card>

          <Card className="space-y-2">
            <div className="text-sm font-semibold text-ink">Financial snapshot</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Delivered: {financeSummary.delivered} · Ready: {financeSummary.ready}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Invoiced: {financeSummary.invoiced} · Paid: {financeSummary.paid}
            </div>
          </Card>

          <Card className="space-y-2">
            <div className="text-sm font-semibold text-ink">Blockers</div>
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
        </div>
      </div>

      <Card className="space-y-3">
        <div className="text-sm font-semibold text-ink">Loads in trip</div>
        <div className="space-y-2">
          {trip.loads.map((row) => {
            const details = loadDetails[row.load.id];
            return (
              <details key={row.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
                <summary className="cursor-pointer text-sm font-semibold text-ink">
                  {row.sequence}. {row.load.loadNumber} · {row.load.status} · {row.load.customerName ?? "Customer"}
                </summary>
                <div className="mt-3 grid gap-2 text-xs text-[color:var(--color-text-muted)] md:grid-cols-2">
                  <div>Stops: {details?.stops?.length ?? 0}</div>
                  <div>Docs: {details?.docs?.length ?? 0}</div>
                </div>
              </details>
            );
          })}
        </div>
      </Card>
    </AppShell>
  );
}

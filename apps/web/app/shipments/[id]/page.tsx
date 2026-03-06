"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ErrorBanner } from "@/components/ui/error-banner";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Timeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import { applyFailClosedCapability, getRoleCapabilities, isForbiddenError } from "@/lib/capabilities";
import { formatDate as formatDate24, formatDateTime as formatDateTime24, formatTime as formatTime24 } from "@/lib/date-time";
import { formatDocStatusLabel, formatInvoiceStatusLabel, formatStatusLabel } from "@/lib/status-format";

const NOTE_TYPES = ["INTERNAL", "OPERATIONAL", "BILLING", "COMPLIANCE", "CUSTOMER_VISIBLE"] as const;
const NOTE_PRIORITIES = ["NORMAL", "IMPORTANT", "ALERT"] as const;
const EXECUTION_REASON_CODES = [
  "DATA_CORRECTION",
  "APPOINTMENT_CHANGE",
  "ROUTE_CHANGE",
  "OPS_OVERRIDE",
  "OTHER",
] as const;
const COMMERCIAL_REASON_CODES = [
  "DATA_CORRECTION",
  "CUSTOMER_CHANGE",
  "BILLING_ADJUSTMENT",
  "OPS_OVERRIDE",
  "OTHER",
] as const;
const TRIP_STATUS_OPTIONS = ["PLANNED", "ASSIGNED", "IN_TRANSIT", "ARRIVED", "COMPLETE", "CANCELLED"] as const;

type ShipmentEnvelope = {
  id: string;
  loadId: string;
  tripId: string | null;
  load: any;
  trip: any | null;
  ownershipQueue?: string | null;
  executionAuthority?: string;
  commercialAuthority?: string;
};

type ExceptionRow = {
  id: string;
  type: string;
  title: string;
  detail?: string | null;
  severity: string;
  owner: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

type TimelineEntry = {
  id: string;
  kind: "NOTE" | "SYSTEM_EVENT" | "DOCUMENT_EVENT" | "EXCEPTION";
  type?: string;
  message?: string;
  timestamp?: string;
  time?: string;
  payload?: Record<string, any>;
};

type ShipmentRiskPayload = {
  shipmentId: string;
  loadNumber: string | null;
  movementMode: string;
  risk: {
    score: number;
    band: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    factors: Array<{ code: string; weight: number; detail: string }>;
    recommendedActions: Array<{ code: string; label: string; reason: string; confidence: number }>;
  };
  context: {
    openExceptions: number;
    blockingExceptions: number;
    trackingOffInTransit: boolean;
    hasDriver: boolean;
    hasTruck: boolean;
    hasTrailer: boolean;
    lastPingAt?: string | null;
  };
};

type FocusSection = "summary" | "execution" | "commercial" | "stops" | "documents" | "exceptions" | "notes" | "timeline" | "tasks";

function formatDateTime(value?: string | null, fallback = "-") {
  return formatDateTime24(value, fallback);
}

function formatStopWindow(valueStart?: string | null, valueEnd?: string | null) {
  const from = valueStart ?? valueEnd ?? null;
  const to = valueEnd ?? valueStart ?? null;
  return {
    dateRange: `${formatDate24(from, "-")} → ${formatDate24(to, "-")}`,
    timeRange: `${formatTime24(from, "-")} → ${formatTime24(to, "-")}`,
  };
}

function formatCurrency(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numeric);
}

function formatMiles(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${numeric.toFixed(1)} mi`;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offsetMinutes * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function notePriorityBadgeClass(priority?: string | null) {
  if (priority === "ALERT") return "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]";
  if (priority === "IMPORTANT") return "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]";
  return "bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]";
}

function statusTone(status?: string | null): "neutral" | "info" | "warning" | "danger" | "success" {
  if (!status) return "neutral";
  if (["PAID", "COMPLETE", "DELIVERED", "INVOICED", "RESOLVED", "VERIFIED"].includes(status)) return "success";
  if (["IN_TRANSIT", "ARRIVED"].includes(status)) return "info";
  if (["READY_TO_INVOICE", "POD_RECEIVED", "ACKNOWLEDGED"].includes(status)) return "warning";
  if (["BLOCKER", "REJECTED", "CANCELLED", "OPEN"].includes(status)) return "danger";
  return "neutral";
}

function riskTone(band?: ShipmentRiskPayload["risk"]["band"] | null): "neutral" | "info" | "warning" | "danger" | "success" {
  if (!band) return "neutral";
  if (band === "LOW") return "success";
  if (band === "MEDIUM") return "warning";
  if (band === "HIGH" || band === "CRITICAL") return "danger";
  return "neutral";
}

export default function ShipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shipmentId = params?.id as string | undefined;

  const [shipment, setShipment] = useState<ShipmentEnvelope | null>(null);
  const [loadDetails, setLoadDetails] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [tracking, setTracking] = useState<{ session: any | null; ping: any | null } | null>(null);
  const [risk, setRisk] = useState<ShipmentRiskPayload | null>(null);
  const [user, setUser] = useState<{ role?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<(typeof NOTE_TYPES)[number]>("INTERNAL");
  const [notePriority, setNotePriority] = useState<(typeof NOTE_PRIORITIES)[number]>("NORMAL");
  const [noteReplyTargetId, setNoteReplyTargetId] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<string | null>(null);

  const [executionSaving, setExecutionSaving] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionReasonCode, setExecutionReasonCode] = useState<(typeof EXECUTION_REASON_CODES)[number]>("DATA_CORRECTION");
  const [executionReasonNote, setExecutionReasonNote] = useState("");
  const [executionForm, setExecutionForm] = useState({
    status: "PLANNED",
    plannedDepartureAt: "",
    plannedArrivalAt: "",
  });

  const [commercialSaving, setCommercialSaving] = useState(false);
  const [commercialError, setCommercialError] = useState<string | null>(null);
  const [commercialReasonCode, setCommercialReasonCode] = useState<(typeof COMMERCIAL_REASON_CODES)[number]>("DATA_CORRECTION");
  const [commercialReasonNote, setCommercialReasonNote] = useState("");
  const [commercialForm, setCommercialForm] = useState({
    customerName: "",
    customerRef: "",
    shipperReferenceNumber: "",
    consigneeReferenceNumber: "",
    rate: "",
    miles: "",
  });

  const [restrictedActions, setRestrictedActions] = useState({
    createNotes: false,
    executionEdit: false,
    commercialEdit: false,
    exceptionActions: false,
  });

  const summaryRef = useRef<HTMLDivElement | null>(null);
  const executionRef = useRef<HTMLDivElement | null>(null);
  const commercialRef = useRef<HTMLDivElement | null>(null);
  const stopsRef = useRef<HTMLDivElement | null>(null);
  const documentsRef = useRef<HTMLDivElement | null>(null);
  const exceptionsRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const tasksRef = useRef<HTMLDivElement | null>(null);

  const loadData = useCallback(async () => {
    if (!shipmentId) return;
    setLoading(true);
    try {
      const [mePayload, shipmentPayload, loadPayload, timelinePayload, exceptionPayload, trackingPayload, riskPayload] = await Promise.all([
        apiFetch<{ user: { role?: string | null } }>("/auth/me"),
        apiFetch<{ shipment: ShipmentEnvelope }>(`/shipments/${shipmentId}`),
        apiFetch<{ load: any; settings?: any | null; billingReadiness?: any }>(`/loads/${shipmentId}`),
        apiFetch<{ timeline: TimelineEntry[] }>(`/loads/${shipmentId}/timeline`),
        apiFetch<{ exceptions: ExceptionRow[] }>(`/dispatch/exceptions?status=ALL&loadId=${encodeURIComponent(shipmentId)}`),
        apiFetch<{ session: any | null; ping: any | null }>(`/tracking/load/${shipmentId}/latest`),
        apiFetch<ShipmentRiskPayload>(`/dispatch/shipments/${shipmentId}/risk-score`).catch(() => null),
      ]);
      setUser(mePayload.user ?? null);
      setShipment(shipmentPayload.shipment ?? null);
      setLoadDetails(loadPayload ?? null);
      setTimeline(Array.isArray(timelinePayload.timeline) ? timelinePayload.timeline : []);
      setExceptions(Array.isArray(exceptionPayload.exceptions) ? exceptionPayload.exceptions : []);
      setTracking(trackingPayload ?? null);
      setRisk(riskPayload);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Unable to load shipment.");
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const load = loadDetails?.load ?? shipment?.load ?? null;
  const trip = shipment?.trip ?? null;
  const roleCapabilities = useMemo(() => getRoleCapabilities(user?.role), [user?.role]);
  const canCreateNotes = applyFailClosedCapability(roleCapabilities.canCreateLoadNotes, restrictedActions.createNotes);
  const canExecutionEdit = applyFailClosedCapability(roleCapabilities.canDispatchExecution, restrictedActions.executionEdit);
  const canCommercialEdit = applyFailClosedCapability(roleCapabilities.canEditLoad, restrictedActions.commercialEdit);
  const canExceptionActions = applyFailClosedCapability(roleCapabilities.canDispatchExecution, restrictedActions.exceptionActions);
  const isLtl = (load?.movementMode ?? "") === "LTL";

  useEffect(() => {
    if (!trip) return;
    setExecutionForm({
      status: trip.status ?? "PLANNED",
      plannedDepartureAt: toDateTimeLocal(trip.plannedDepartureAt),
      plannedArrivalAt: toDateTimeLocal(trip.plannedArrivalAt),
    });
  }, [trip?.id, trip?.status, trip?.plannedDepartureAt, trip?.plannedArrivalAt]);

  useEffect(() => {
    if (!load) return;
    setCommercialForm({
      customerName: load.customerName ?? load.customer?.name ?? "",
      customerRef: load.customerRef ?? "",
      shipperReferenceNumber: load.shipperReferenceNumber ?? "",
      consigneeReferenceNumber: load.consigneeReferenceNumber ?? "",
      rate: load.rate != null ? String(load.rate) : "",
      miles: load.miles != null ? String(load.miles) : "",
    });
  }, [
    load?.id,
    load?.customerName,
    load?.customer?.name,
    load?.customerRef,
    load?.shipperReferenceNumber,
    load?.consigneeReferenceNumber,
    load?.rate,
    load?.miles,
  ]);

  const setFocus = useCallback(
    (focus: FocusSection) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("focus", focus);
      router.replace(`/shipments/${shipmentId}?${params.toString()}`);
      const map: Record<FocusSection, React.RefObject<HTMLDivElement>> = {
        summary: summaryRef,
        execution: executionRef,
        commercial: commercialRef,
        stops: stopsRef,
        documents: documentsRef,
        exceptions: exceptionsRef,
        notes: notesRef,
        timeline: timelineRef,
        tasks: tasksRef,
      };
      map[focus].current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [router, searchParams, shipmentId]
  );

  useEffect(() => {
    const focus = (searchParams?.get("focus") ?? "").toLowerCase();
    const map: Record<string, React.RefObject<HTMLDivElement>> = {
      summary: summaryRef,
      execution: executionRef,
      commercial: commercialRef,
      stops: stopsRef,
      documents: documentsRef,
      exceptions: exceptionsRef,
      notes: notesRef,
      timeline: timelineRef,
      tasks: tasksRef,
    };
    const target = map[focus];
    if (!target?.current) return;
    const timeout = window.setTimeout(() => {
      target.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [searchParams, shipment?.id]);

  const noteThreads = useMemo(() => {
    const notes = Array.isArray(load?.loadNotes) ? [...load.loadNotes] : [];
    notes.sort((left: any, right: any) => {
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      if (leftTime !== rightTime) return rightTime - leftTime;
      return String(right.id).localeCompare(String(left.id));
    });
    const repliesByParent = new Map<string, any[]>();
    const roots: any[] = [];
    for (const note of notes) {
      const parentId = note.replyToNoteId ? String(note.replyToNoteId) : null;
      if (!parentId) {
        roots.push(note);
        continue;
      }
      const bucket = repliesByParent.get(parentId) ?? [];
      bucket.push(note);
      repliesByParent.set(parentId, bucket);
    }
    for (const [key, replies] of repliesByParent.entries()) {
      replies.sort((left: any, right: any) => {
        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();
        if (leftTime !== rightTime) return leftTime - rightTime;
        return String(left.id).localeCompare(String(right.id));
      });
      repliesByParent.set(key, replies);
    }
    return roots.map((root) => ({
      root,
      replies: repliesByParent.get(root.id) ?? [],
    }));
  }, [load?.loadNotes]);

  const timelineItems = useMemo(
    () =>
      timeline
        .filter((item) => item.kind !== "NOTE")
        .map((item) => ({
          id: item.id,
          title: item.message || item.payload?.message || item.type || "System event",
          subtitle: item.type || item.kind,
          time: formatDateTime(item.timestamp || item.time),
        })),
    [timeline]
  );

  const saveNote = async () => {
    if (!load?.id) return;
    const body = noteText.trim();
    if (!body) {
      setNoteError("Note text is required.");
      return;
    }
    setNoteSaving(true);
    setNoteError(null);
    setNoteStatus(null);
    try {
      await apiFetch(`/loads/${load.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          noteType,
          priority: notePriority,
          replyToNoteId: noteReplyTargetId,
        }),
      });
      setNoteText("");
      setNoteType("INTERNAL");
      setNotePriority("NORMAL");
      setNoteReplyTargetId(null);
      setNoteStatus("Saved");
      await loadData();
    } catch (err) {
      if (isForbiddenError(err)) {
        setRestrictedActions((prev) => ({ ...prev, createNotes: true }));
      }
      setNoteError((err as Error).message || "Failed to save note.");
    } finally {
      setNoteSaving(false);
      window.setTimeout(() => setNoteStatus(null), 2000);
    }
  };

  const saveExecution = async () => {
    if (!load?.id || !trip?.id) return;
    setExecutionSaving(true);
    setExecutionError(null);
    try {
      if (isLtl) {
        await apiFetch(`/shipments/${load.id}/execution`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: executionForm.status,
            plannedDepartureAt: executionForm.plannedDepartureAt
              ? new Date(executionForm.plannedDepartureAt).toISOString()
              : null,
            plannedArrivalAt: executionForm.plannedArrivalAt ? new Date(executionForm.plannedArrivalAt).toISOString() : null,
            reasonCode: executionReasonCode,
            reasonNote: executionReasonNote.trim() || undefined,
          }),
        });
      } else {
        await apiFetch(`/trips/${trip.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plannedDepartureAt: executionForm.plannedDepartureAt
              ? new Date(executionForm.plannedDepartureAt).toISOString()
              : null,
            plannedArrivalAt: executionForm.plannedArrivalAt ? new Date(executionForm.plannedArrivalAt).toISOString() : null,
            movementMode: trip.movementMode,
            origin: trip.origin ?? null,
            destination: trip.destination ?? null,
            reasonCode: executionReasonCode,
            reasonNote: executionReasonNote.trim() || undefined,
          }),
        });
      }
      await loadData();
    } catch (err) {
      if (isForbiddenError(err)) {
        setRestrictedActions((prev) => ({ ...prev, executionEdit: true }));
      }
      setExecutionError((err as Error).message || "Failed to update execution fields.");
    } finally {
      setExecutionSaving(false);
    }
  };

  const saveCommercial = async () => {
    if (!load?.id) return;
    setCommercialSaving(true);
    setCommercialError(null);
    try {
      const payload: Record<string, unknown> = {
        reasonCode: commercialReasonCode,
      };
      if (commercialReasonNote.trim()) {
        payload.reasonNote = commercialReasonNote.trim();
      }
      payload.customerName = commercialForm.customerName.trim();
      payload.customerRef = commercialForm.customerRef.trim() || null;
      payload.shipperReferenceNumber = commercialForm.shipperReferenceNumber.trim() || null;
      payload.consigneeReferenceNumber = commercialForm.consigneeReferenceNumber.trim() || null;
      if (commercialForm.rate.trim()) {
        payload.rate = commercialForm.rate.trim();
      }
      if (commercialForm.miles.trim()) {
        const miles = Number(commercialForm.miles.trim());
        if (Number.isFinite(miles)) payload.miles = miles;
      }

      if (isLtl) {
        await apiFetch(`/shipments/${load.id}/commercial`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/loads/${load.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      await loadData();
    } catch (err) {
      if (isForbiddenError(err)) {
        setRestrictedActions((prev) => ({ ...prev, commercialEdit: true }));
      }
      setCommercialError((err as Error).message || "Failed to update commercial fields.");
    } finally {
      setCommercialSaving(false);
    }
  };

  const runExceptionAction = async (id: string, action: "acknowledge" | "resolve") => {
    try {
      await apiFetch(`/dispatch/exceptions/${id}/${action}`, { method: "POST" });
      await loadData();
    } catch (err) {
      if (isForbiddenError(err)) {
        setRestrictedActions((prev) => ({ ...prev, exceptionActions: true }));
      }
      setError((err as Error).message || "Failed to update exception.");
    }
  };

  const openDoc = (doc: any) => {
    const name = doc.filename?.split("/").pop();
    if (!name) return;
    window.open(`${API_BASE}/files/docs/${name}`, "_blank");
  };

  if (loading) {
    return (
      <AppShell title="Shipment Detail" subtitle="Unified execution and commercial workspace">
        <EmptyState title="Loading shipment..." description="Collecting execution, commercial, notes, and timeline." />
      </AppShell>
    );
  }

  if (!shipment || !load) {
    return (
      <AppShell title="Shipment Detail" subtitle="Unified execution and commercial workspace">
        <EmptyState title="Shipment not found" description="This shipment may have been deleted or you may not have access." />
      </AppShell>
    );
  }

  const invoice = Array.isArray(load?.invoices) ? load.invoices[0] : null;
  const unresolvedExceptions = exceptions.filter((item) => item.status !== "RESOLVED");
  const focusValue = (searchParams?.get("focus") as FocusSection | null) ?? "summary";

  return (
    <AppShell title="Shipment Detail" subtitle="Unified execution and commercial workspace">
      {error ? <ErrorBanner message={error} /> : null}

      <Card ref={summaryRef} className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Shipment</div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-2xl font-semibold text-ink">{load.loadNumber}</div>
              <StatusChip label={formatStatusLabel(load.status)} tone={statusTone(load.status)} />
              <Badge className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">{load.movementMode ?? "FTL"}</Badge>
              <Badge className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">Exec: {shipment.executionAuthority ?? "TRIP"}</Badge>
              <Badge className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">Commercial: {shipment.commercialAuthority ?? "LOAD"}</Badge>
            </div>
            <div className="mt-1 text-sm text-[color:var(--color-text-muted)]">
              {load.customer?.name ?? load.customerName ?? "Customer"} · {load.stops?.[0]?.city ?? "-"}
              {load.stops?.[0]?.state ? `, ${load.stops[0].state}` : ""} → {load.stops?.at(-1)?.city ?? "-"}
              {load.stops?.at(-1)?.state ? `, ${load.stops.at(-1).state}` : ""}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Trip: {trip?.tripNumber ?? "Not assigned"} · Ownership queue: {shipment.ownershipQueue ?? "-"}
            </div>
            {risk ? (
              <div className="mt-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={`Risk ${risk.risk.band}`} tone={riskTone(risk.risk.band)} />
                  <span className="text-xs text-[color:var(--color-text-muted)]">Score {risk.risk.score}/100</span>
                  <span className="text-xs text-[color:var(--color-text-muted)]">
                    Open exceptions {risk.context.openExceptions} · Blockers {risk.context.blockingExceptions}
                  </span>
                </div>
                {risk.risk.factors.length > 0 ? (
                  <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    Top factor: {risk.risk.factors[0]?.detail}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => router.push(`/dispatch?loadId=${load.id}`)}>
              Open dispatch
            </Button>
            <Button size="sm" variant="secondary" onClick={() => router.push(`/finance?tab=receivables&search=${encodeURIComponent(load.loadNumber ?? "")}`)}>
              Open finance
            </Button>
          </div>
        </div>
        <SegmentedControl
          value={focusValue}
          options={[
            { label: "Summary", value: "summary" },
            { label: "Execution", value: "execution" },
            { label: "Commercial", value: "commercial" },
            { label: "Stops", value: "stops" },
            { label: "Docs", value: "documents" },
            { label: "Exceptions", value: "exceptions" },
            { label: "Notes", value: "notes" },
            { label: "Timeline", value: "timeline" },
            { label: "Tasks", value: "tasks" },
          ]}
          onChange={(value) => setFocus(value as FocusSection)}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card ref={executionRef} className="space-y-3">
          <SectionHeader title="Execution (Trip authority)" subtitle="Dispatch status, assignment, and schedule" />
          {!trip ? (
            <EmptyState title="No trip assignment yet" description="Execution commands unlock once this shipment is attached to a trip." />
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
                  <div className="text-xs text-[color:var(--color-text-muted)]">Trip</div>
                  <div className="text-sm font-semibold text-ink">{trip.tripNumber}</div>
                </div>
                <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
                  <div className="text-xs text-[color:var(--color-text-muted)]">Status</div>
                  <div className="text-sm font-semibold text-ink">{formatStatusLabel(trip.status)}</div>
                </div>
                <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
                  <div className="text-xs text-[color:var(--color-text-muted)]">Driver</div>
                  <div className="text-sm font-semibold text-ink">{trip.driver?.name ?? "Unassigned"}</div>
                </div>
                <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
                  <div className="text-xs text-[color:var(--color-text-muted)]">Truck / Trailer</div>
                  <div className="text-sm font-semibold text-ink">{trip.truck?.unit ?? "-"} · {trip.trailer?.unit ?? "-"}</div>
                </div>
                <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
                  <div className="text-xs text-[color:var(--color-text-muted)]">Planned depart</div>
                  <div className="text-sm font-semibold text-ink">{formatDateTime(trip.plannedDepartureAt)}</div>
                </div>
                <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
                  <div className="text-xs text-[color:var(--color-text-muted)]">Planned arrive</div>
                  <div className="text-sm font-semibold text-ink">{formatDateTime(trip.plannedArrivalAt)}</div>
                </div>
              </div>

              {canExecutionEdit ? (
                <div className="grid gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">
                    Update execution
                    {!isLtl ? " (FTL fallback: trip route)" : ""}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <FormField label="Status" htmlFor="shipmentExecutionStatus">
                      <Select
                        id="shipmentExecutionStatus"
                        value={executionForm.status}
                        onChange={(event) => setExecutionForm((prev) => ({ ...prev, status: event.target.value }))}
                      >
                        {TRIP_STATUS_OPTIONS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Reason" htmlFor="shipmentExecutionReason">
                      <Select
                        id="shipmentExecutionReason"
                        value={executionReasonCode}
                        onChange={(event) =>
                          setExecutionReasonCode(event.target.value as (typeof EXECUTION_REASON_CODES)[number])
                        }
                      >
                        {EXECUTION_REASON_CODES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Planned departure" htmlFor="shipmentExecutionPlannedDepartureAt">
                      <Input
                        id="shipmentExecutionPlannedDepartureAt"
                        type="datetime-local"
                        value={executionForm.plannedDepartureAt}
                        onChange={(event) =>
                          setExecutionForm((prev) => ({ ...prev, plannedDepartureAt: event.target.value }))
                        }
                      />
                    </FormField>
                    <FormField label="Planned arrival" htmlFor="shipmentExecutionPlannedArrivalAt">
                      <Input
                        id="shipmentExecutionPlannedArrivalAt"
                        type="datetime-local"
                        value={executionForm.plannedArrivalAt}
                        onChange={(event) =>
                          setExecutionForm((prev) => ({ ...prev, plannedArrivalAt: event.target.value }))
                        }
                      />
                    </FormField>
                  </div>
                  <FormField label="Reason note (optional)" htmlFor="shipmentExecutionReasonNote">
                    <Input
                      id="shipmentExecutionReasonNote"
                      value={executionReasonNote}
                      onChange={(event) => setExecutionReasonNote(event.target.value)}
                      placeholder="What changed and why"
                    />
                  </FormField>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={saveExecution} disabled={executionSaving}>
                      {executionSaving ? "Saving..." : "Save execution"}
                    </Button>
                    {executionError ? <div className="text-xs text-[color:var(--color-danger)]">{executionError}</div> : null}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[color:var(--color-text-muted)]">Restricted: you cannot edit execution fields.</div>
              )}
            </>
          )}
        </Card>

        <Card ref={commercialRef} className="space-y-3">
          <SectionHeader title="Commercial (Load authority)" subtitle="Customer, references, billing, and amount basis" />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
              <div className="text-xs text-[color:var(--color-text-muted)]">Billing status</div>
              <div className="text-sm font-semibold text-ink">{load.billingStatus ?? "BLOCKED"}</div>
            </div>
            <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
              <div className="text-xs text-[color:var(--color-text-muted)]">Invoice status</div>
              <div className="text-sm font-semibold text-ink">{formatInvoiceStatusLabel(invoice?.status)}</div>
            </div>
            <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
              <div className="text-xs text-[color:var(--color-text-muted)]">Rate</div>
              <div className="text-sm font-semibold text-ink">{formatCurrency(load.rate)}</div>
            </div>
            <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
              <div className="text-xs text-[color:var(--color-text-muted)]">Miles</div>
              <div className="text-sm font-semibold text-ink">{formatMiles(load.miles)}</div>
            </div>
          </div>

          {canCommercialEdit ? (
            <div className="grid gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-3">
              <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">
                Update commercial
                {!isLtl ? " (FTL fallback: load route)" : ""}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <FormField label="Customer name" htmlFor="shipmentCommercialCustomerName">
                  <Input
                    id="shipmentCommercialCustomerName"
                    value={commercialForm.customerName}
                    onChange={(event) => setCommercialForm((prev) => ({ ...prev, customerName: event.target.value }))}
                  />
                </FormField>
                <FormField label="Customer reference" htmlFor="shipmentCommercialCustomerRef">
                  <Input
                    id="shipmentCommercialCustomerRef"
                    value={commercialForm.customerRef}
                    onChange={(event) => setCommercialForm((prev) => ({ ...prev, customerRef: event.target.value }))}
                  />
                </FormField>
                <FormField label="Shipper reference" htmlFor="shipmentCommercialShipperRef">
                  <Input
                    id="shipmentCommercialShipperRef"
                    value={commercialForm.shipperReferenceNumber}
                    onChange={(event) =>
                      setCommercialForm((prev) => ({ ...prev, shipperReferenceNumber: event.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Consignee reference" htmlFor="shipmentCommercialConsigneeRef">
                  <Input
                    id="shipmentCommercialConsigneeRef"
                    value={commercialForm.consigneeReferenceNumber}
                    onChange={(event) =>
                      setCommercialForm((prev) => ({ ...prev, consigneeReferenceNumber: event.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Rate" htmlFor="shipmentCommercialRate">
                  <Input
                    id="shipmentCommercialRate"
                    value={commercialForm.rate}
                    onChange={(event) => setCommercialForm((prev) => ({ ...prev, rate: event.target.value }))}
                  />
                </FormField>
                <FormField label="Miles" htmlFor="shipmentCommercialMiles">
                  <Input
                    id="shipmentCommercialMiles"
                    value={commercialForm.miles}
                    onChange={(event) => setCommercialForm((prev) => ({ ...prev, miles: event.target.value }))}
                  />
                </FormField>
                <FormField label="Reason" htmlFor="shipmentCommercialReason">
                  <Select
                    id="shipmentCommercialReason"
                    value={commercialReasonCode}
                    onChange={(event) =>
                      setCommercialReasonCode(event.target.value as (typeof COMMERCIAL_REASON_CODES)[number])
                    }
                  >
                    {COMMERCIAL_REASON_CODES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <FormField label="Reason note (optional)" htmlFor="shipmentCommercialReasonNote">
                <Input
                  id="shipmentCommercialReasonNote"
                  value={commercialReasonNote}
                  onChange={(event) => setCommercialReasonNote(event.target.value)}
                  placeholder="What changed and why"
                />
              </FormField>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={saveCommercial} disabled={commercialSaving}>
                  {commercialSaving ? "Saving..." : "Save commercial"}
                </Button>
                {commercialError ? <div className="text-xs text-[color:var(--color-danger)]">{commercialError}</div> : null}
              </div>
            </div>
          ) : (
            <div className="text-xs text-[color:var(--color-text-muted)]">Restricted: you cannot edit commercial fields.</div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card ref={stopsRef} className="space-y-3">
          <SectionHeader title="Stops" subtitle="Single stop sequence for execution + commercial context" />
          <div className="space-y-2">
            {(load.stops ?? []).map((stop: any) => (
              <div key={stop.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                  {stop.type} · Seq {stop.sequence}
                </div>
                <div className="text-sm font-semibold text-ink">{stop.name ?? "Stop"}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {[stop.address, stop.city, stop.state, stop.zip].filter(Boolean).join(", ") || "-"}
                </div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  {(() => {
                    const window = formatStopWindow(stop.appointmentStart, stop.appointmentEnd);
                    return (
                      <>
                        Appointment date: {window.dateRange}
                        <br />
                        Appointment time: {window.timeRange}
                      </>
                    );
                  })()}
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Arrived: {formatDateTime(stop.arrivedAt)} · Departed: {formatDateTime(stop.departedAt)}
                </div>
              </div>
            ))}
            {(load.stops ?? []).length === 0 ? <EmptyState title="No stops yet." /> : null}
          </div>
        </Card>

        <Card ref={documentsRef} className="space-y-3">
          <SectionHeader title="Documents" subtitle="Single shipment document thread" />
          <div className="space-y-2">
            {(load.docs ?? []).map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
                <div>
                  <div className="text-sm font-semibold text-ink">{doc.type}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {formatDocStatusLabel(doc.status)} · {formatDateTime(doc.uploadedAt)}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => openDoc(doc)}>
                  Open
                </Button>
              </div>
            ))}
            {(load.docs ?? []).length === 0 ? <EmptyState title="No documents yet." /> : null}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card ref={exceptionsRef} className="space-y-3">
          <SectionHeader title="Exceptions" subtitle="Single exception queue for this shipment" />
          <div className="space-y-2">
            {unresolvedExceptions.map((item) => (
              <div key={item.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={item.severity} tone={statusTone(item.severity)} />
                  <StatusChip label={item.status} tone={statusTone(item.status)} />
                  <Badge>{item.owner}</Badge>
                </div>
                <div className="mt-2 text-sm font-semibold text-ink">{item.title}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">{item.type}</div>
                {item.detail ? <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{item.detail}</div> : null}
                <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">Created: {formatDateTime(item.createdAt)}</div>
                {canExceptionActions ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.status === "OPEN" ? (
                      <Button size="sm" variant="secondary" onClick={() => void runExceptionAction(item.id, "acknowledge")}>Ack</Button>
                    ) : null}
                    {item.status !== "RESOLVED" ? (
                      <Button size="sm" variant="ghost" onClick={() => void runExceptionAction(item.id, "resolve")}>Resolve</Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {unresolvedExceptions.length === 0 ? <EmptyState title="No open exceptions." /> : null}
          </div>
        </Card>

        <Card ref={tasksRef} className="space-y-3">
          <SectionHeader title="Tasks" subtitle="Operational tasks tied to this shipment" />
          <div className="space-y-2">
            {(load.tasks ?? []).map((task: any) => (
              <div key={task.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={task.status ?? "OPEN"} tone={statusTone(task.status)} />
                  <Badge>{task.type ?? "TASK"}</Badge>
                </div>
                <div className="mt-2 text-sm font-semibold text-ink">{task.title ?? "Task"}</div>
                {task.description ? <div className="text-xs text-[color:var(--color-text-muted)]">{task.description}</div> : null}
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">Created: {formatDateTime(task.createdAt)}</div>
                {task.completedAt ? (
                  <div className="text-xs text-[color:var(--color-text-muted)]">Completed: {formatDateTime(task.completedAt)}</div>
                ) : null}
              </div>
            ))}
            {(load.tasks ?? []).length === 0 ? <EmptyState title="No tasks on this shipment." /> : null}
          </div>
        </Card>
      </div>

      <Card ref={notesRef} className="space-y-3">
        <SectionHeader title="Notes" subtitle="Single notes thread; timeline does not duplicate note cards" />
        {canCreateNotes ? (
          <div className="grid gap-3 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-3">
            <FormField label="Add note" htmlFor="shipmentNoteText">
              <textarea
                id="shipmentNoteText"
                className="min-h-[84px] w-full rounded-[var(--radius-input)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-base)] px-3 py-2 text-sm text-ink"
                placeholder="Add dispatch, billing, or compliance context"
                value={noteText}
                onChange={(event) => {
                  setNoteText(event.target.value);
                  if (noteError) setNoteError(null);
                }}
              />
            </FormField>
            {noteReplyTargetId ? (
              <div className="rounded-[var(--radius-input)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                Reply mode enabled.
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-2"
                  onClick={() => setNoteReplyTargetId(null)}
                  disabled={noteSaving}
                >
                  Clear
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <FormField label="Type" htmlFor="shipmentNoteType">
                <Select
                  id="shipmentNoteType"
                  value={noteType}
                  onChange={(event) => setNoteType(event.target.value as (typeof NOTE_TYPES)[number])}
                >
                  {NOTE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Priority" htmlFor="shipmentNotePriority">
                <Select
                  id="shipmentNotePriority"
                  value={notePriority}
                  onChange={(event) => setNotePriority(event.target.value as (typeof NOTE_PRIORITIES)[number])}
                >
                  {NOTE_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </Select>
              </FormField>
              <Button size="sm" onClick={saveNote} disabled={noteSaving}>
                {noteSaving ? "Saving..." : "Save note"}
              </Button>
              {noteStatus ? <div className="text-xs text-[color:var(--color-text-muted)]">{noteStatus}</div> : null}
            </div>
          </div>
        ) : (
          <div className="text-xs text-[color:var(--color-text-muted)]">Restricted: you cannot create notes on this shipment.</div>
        )}
        {noteError ? <ErrorBanner message={noteError} /> : null}

        <div className="space-y-2">
          {noteThreads.map(({ root, replies }) => (
            <div key={root.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {(root.createdBy?.name || "User")} · {root.source} · {formatDateTime(root.createdAt)}
                </div>
                {canCreateNotes ? (
                  <Button size="sm" variant="ghost" onClick={() => setNoteReplyTargetId(root.id)} disabled={noteSaving}>
                    Reply
                  </Button>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge>{root.noteType ?? "INTERNAL"}</Badge>
                <Badge className={notePriorityBadgeClass(root.priority)}>{root.priority ?? "NORMAL"}</Badge>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-ink">{root.body ?? root.text}</div>
              {replies.length > 0 ? (
                <div className="mt-3 space-y-2 border-l border-[color:var(--color-divider)] pl-3">
                  {replies.map((reply: any) => (
                    <div key={reply.id} className="rounded-[var(--radius-input)] bg-[color:var(--color-bg-muted)] px-3 py-2">
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {(reply.createdBy?.name || "User")} · {reply.source} · {formatDateTime(reply.createdAt)}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge>{reply.noteType ?? "INTERNAL"}</Badge>
                        <Badge className={notePriorityBadgeClass(reply.priority)}>{reply.priority ?? "NORMAL"}</Badge>
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-ink">{reply.body ?? reply.text}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {noteThreads.length === 0 ? <div className="text-sm text-[color:var(--color-text-muted)]">No notes yet.</div> : null}
        </div>
      </Card>

      <Card ref={timelineRef} className="space-y-3">
        <SectionHeader title="Timeline" subtitle="System and document events without duplicating note cards" />
        <Timeline items={timelineItems} />
      </Card>

      <Card className="space-y-2">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Tracking snapshot</div>
        <div className="text-sm text-[color:var(--color-text-muted)]">Status: {tracking?.session?.status ?? "OFF"}</div>
        <div className="text-sm text-[color:var(--color-text-muted)]">Last ping: {formatDateTime(tracking?.ping?.capturedAt)}</div>
      </Card>
    </AppShell>
  );
}

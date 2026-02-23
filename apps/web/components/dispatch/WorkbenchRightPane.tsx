"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SuggestedAssignments, type AssignmentSuggestion } from "@/components/assignment-assist/SuggestedAssignments";
import { formatDocStatusLabel } from "@/lib/status-format";
import { apiFetch } from "@/lib/api";
import { AddLegDrawer } from "@/components/dispatch/AddLegDrawer";

export type WorkbenchAssignmentProps = {
  form: { driverId: string; truckId: string; trailerId: string };
  setForm: (next: { driverId: string; truckId: string; trailerId: string }) => void;
  availableDrivers: Array<{ id: string; name?: string | null; reason?: string | null }>;
  unavailableDrivers: Array<{ id: string; name?: string | null; reason?: string | null }>;
  availableTrucks: Array<{ id: string; unit?: string | null; reason?: string | null }>;
  unavailableTrucks: Array<{ id: string; unit?: string | null; reason?: string | null }>;
  availableTrailers: Array<{ id: string; unit?: string | null; reason?: string | null }>;
  unavailableTrailers: Array<{ id: string; unit?: string | null; reason?: string | null }>;
  showUnavailable: boolean;
  setShowUnavailable: (value: boolean) => void;
  assignDisabled: boolean;
  assignError?: string | null;
  assign: () => Promise<void>;
  unassign: () => Promise<void>;
  assignFromSuggestion: (driverId: string, truckId?: string | null) => Promise<void>;
  suggestions: AssignmentSuggestion[];
  suggestionsLoading: boolean;
  suggestionsError?: string | null;
  assignmentNotSuggested: boolean;
  assistOverrideReason: string;
  setAssistOverrideReason: (value: string) => void;
  canOverride: boolean;
  overrideReason: string;
  setOverrideReason: (value: string) => void;
  rateConMissing: boolean;
  hasConflicts: boolean;
  conflictMessages: string[];
  confirmReassign: boolean;
  assignedSummary?: {
    driverName?: string | null;
    truckUnit?: string | null;
    trailerUnit?: string | null;
  };
};

type WorkbenchLoadSummary = {
  id: string;
  loadNumber: string;
  status: string;
  customerName?: string | null;
  route?: { shipperCity?: string | null; shipperState?: string | null; consigneeCity?: string | null; consigneeState?: string | null };
  riskFlags?: {
    needsAssignment: boolean;
    trackingOffInTransit: boolean;
    overdueStopWindow: boolean;
    atRisk: boolean;
  };
  assignment?: {
    driver?: { id: string; name: string } | null;
    truck?: { id: string; unit: string } | null;
    trailer?: { id: string; unit: string } | null;
  };
};

const stopStatusLabel = (stop: any) => {
  if (stop.departedAt) return "Departed";
  if (stop.arrivedAt) return "Arrived";
  if (stop.status === "SKIPPED") return "Skipped";
  return "Planned";
};

const stopStatusTone = (stop: any) => {
  if (stop.departedAt) return "success" as const;
  if (stop.arrivedAt) return "info" as const;
  if (stop.status === "SKIPPED") return "warning" as const;
  return "neutral" as const;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
};

const buildOptions = <T extends { id: string; name?: string | null; unit?: string | null; reason?: string | null }>(
  available: T[],
  unavailable: T[],
  showAll: boolean
) => {
  if (showAll) return [...available, ...unavailable];
  return available;
};

export function WorkbenchRightPane({
  load,
  loadSummary,
  statusTone,
  readOnly,
  onClose,
  onRefresh,
  assignment,
  showStopActions,
  onToggleStopActions,
  onMarkArrive,
  onMarkDepart,
  onUpdateDelay,
  legDrawerOpen,
  onOpenLegDrawer,
  onCloseLegDrawer,
  legDrawerContent,
  legAddedNote,
  canStartTracking,
  yardOsLaunch,
  teamAssignment,
}: {
  load: any;
  loadSummary: WorkbenchLoadSummary | null;
  statusTone: (status: string) => "neutral" | "success" | "warning" | "danger" | "info";
  readOnly?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  assignment: WorkbenchAssignmentProps;
  showStopActions: boolean;
  onToggleStopActions: () => void;
  onMarkArrive: (loadId: string, stopId: string) => void;
  onMarkDepart: (loadId: string, stopId: string) => void;
  onUpdateDelay: (stopId: string, delayReason?: string | null, delayNotes?: string | null) => void;
  legDrawerOpen: boolean;
  onOpenLegDrawer: () => void;
  onCloseLegDrawer: () => void;
  legDrawerContent?: ReactNode;
  legAddedNote?: string | null;
  canStartTracking: boolean;
  yardOsLaunch?: {
    href: string;
    onOpen: () => void;
  };
  teamAssignment?: {
    enabled: boolean;
    teams: Array<{ id: string; name: string }>;
    value: string;
    onChange: (teamId: string) => void;
    loading?: boolean;
    error?: string | null;
  };
}) {
  const [activeTab, setActiveTab] = useState<"stops" | "documents" | "tracking">("stops");
  const [assignmentExpanded, setAssignmentExpanded] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const readOnlyHint = readOnly ? "Read-only in History view" : undefined;
  const primaryTrip = load?.tripLoads?.[0]?.trip ?? null;

  const assignedSummary = assignment.assignedSummary ?? {
    driverName: loadSummary?.assignment?.driver?.name ?? null,
    truckUnit: loadSummary?.assignment?.truck?.unit ?? null,
    trailerUnit: loadSummary?.assignment?.trailer?.unit ?? null,
  };

  const isAssigned = Boolean(assignedSummary.driverName || assignedSummary.truckUnit || assignedSummary.trailerUnit);
  const driverLabel = assignedSummary.driverName ?? "Driver";
  const driverUnavailableSelected =
    Boolean(assignment.form.driverId) && !assignment.availableDrivers.find((driver) => driver.id === assignment.form.driverId);
  const truckUnavailableSelected =
    Boolean(assignment.form.truckId) && !assignment.availableTrucks.find((truck) => truck.id === assignment.form.truckId);
  const trailerUnavailableSelected =
    Boolean(assignment.form.trailerId) && !assignment.availableTrailers.find((trailer) => trailer.id === assignment.form.trailerId);

  useEffect(() => {
    setAssignmentExpanded(!isAssigned);
  }, [load?.id, isAssigned]);

  useEffect(() => {
    setShowMoreSuggestions(false);
  }, [load?.id]);

  const laneLabel = useMemo(() => {
    const shipper = loadSummary?.route?.shipperCity;
    const consignee = loadSummary?.route?.consigneeCity;
    if (shipper || consignee) {
      return `${shipper ?? "-"}${loadSummary?.route?.shipperState ? `, ${loadSummary.route.shipperState}` : ""} → ${consignee ?? "-"}${loadSummary?.route?.consigneeState ? `, ${loadSummary.route.consigneeState}` : ""}`;
    }
    const pickup = load?.stops?.find((stop: any) => stop.type === "PICKUP");
    const delivery = load?.stops?.slice().reverse().find((stop: any) => stop.type === "DELIVERY");
    if (pickup || delivery) {
      const left = pickup ? `${pickup.city ?? pickup.name ?? "-"}` : "-";
      const right = delivery ? `${delivery.city ?? delivery.name ?? "-"}` : "-";
      return `${left} → ${right}`;
    }
    return "Lane unavailable";
  }, [loadSummary?.route, load?.stops]);

  const trackingState = load?.trackingSessions?.[0]?.status ?? "OFF";
  const lastPingAt = load?.locationPings?.[0]?.capturedAt ?? null;

  const hasPod = (load?.docs ?? []).some((doc: any) => doc.type === "POD");
  const actionChips = [
    loadSummary?.riskFlags?.needsAssignment ? "Needs assignment" : null,
    loadSummary?.riskFlags?.atRisk ? "At risk" : null,
    loadSummary?.riskFlags?.trackingOffInTransit || trackingState === "OFF" ? "Tracking off" : null,
    !hasPod ? "Missing POD" : null,
  ].filter(Boolean) as string[];

  const stops = load?.stops ?? [];

  const showSuggestions = assignmentExpanded || !isAssigned;
  const suggestionLimit = showMoreSuggestions ? 3 : 1;

  return (
    <div className="relative">
      <div className="sticky top-0 z-10 space-y-3 border-b border-[color:var(--color-divider)] bg-white/95 px-4 py-4 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
              {primaryTrip ? "Trip" : "Load"}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-lg font-semibold text-ink">{primaryTrip?.tripNumber ?? loadSummary?.loadNumber ?? "Load"}</div>
              {loadSummary?.status ? (
                <StatusChip
                  label={loadSummary.status}
                  tone={statusTone(loadSummary.status)}
                  className="bg-[color:var(--color-bg-muted)]/70"
                />
              ) : null}
          </div>
          <div className="text-sm text-[color:var(--color-text-muted)]">{laneLabel}</div>
          <div className="text-xs text-[color:var(--color-text-muted)]">{loadSummary?.customerName ?? "Customer"}</div>
          {teamAssignment?.enabled ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Team</div>
              <Select
                value={teamAssignment.value}
                onChange={(event) => teamAssignment.onChange(event.target.value)}
                className="w-auto min-w-[160px]"
                disabled={teamAssignment.loading}
              >
                <option value="">{teamAssignment.loading ? "Loading..." : "Assign team"}</option>
                {teamAssignment.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
              {teamAssignment.error ? (
                <div className="text-xs text-[color:var(--color-danger)]">{teamAssignment.error}</div>
              ) : null}
            </div>
          ) : null}
        </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAssignmentExpanded(true)}
              disabled={readOnly}
              title={readOnlyHint}
            >
              {primaryTrip ? "Assign trip" : "Assign"}
            </Button>
            <Button size="sm" variant="secondary" onClick={onOpenLegDrawer} disabled={readOnly} title={readOnlyHint}>
              Add leg
            </Button>
            {stops.length ? (
              <Button size="sm" variant="secondary" onClick={onToggleStopActions} disabled={readOnly} title={readOnlyHint}>
                {showStopActions ? "Hide stop actions" : "Update stop"}
              </Button>
            ) : null}
            <Link href={`/loads/${loadSummary?.id ?? load.id}`}>
              <Button size="sm">View full load</Button>
            </Link>
            {primaryTrip?.id ? (
              <Link href={`/dispatch?tab=trips&tripId=${primaryTrip.id}`}>
                <Button size="sm" variant="secondary">
                  Open trip
                </Button>
              </Link>
            ) : null}
            {yardOsLaunch ? (
              <Button size="sm" variant="secondary" onClick={yardOsLaunch.onOpen} title={yardOsLaunch.href}>
                Open in Yard OS
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {actionChips.length ? (
          <div className="flex flex-wrap gap-2">
            {actionChips.map((chip) => (
              <Badge key={chip} className="bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]">
                {chip}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Trip assignment</div>
              {isAssigned && !assignmentExpanded ? (
                <div className="text-sm text-ink">
                  {driverLabel} · Truck {assignedSummary.truckUnit ?? "-"} · Trailer {assignedSummary.trailerUnit ?? "-"}
                </div>
              ) : (
                <div className="text-sm text-[color:var(--color-text-muted)]">Select primary driver and equipment</div>
              )}
            </div>
            {isAssigned && !assignmentExpanded ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setAssignmentExpanded(true)}
                disabled={readOnly}
                title={readOnlyHint}
              >
                Change
              </Button>
            ) : null}
          </div>

          {assignmentExpanded ? (
            <div className="mt-3 grid gap-3">
              {assignment.hasConflicts ? (
                <div className="rounded-[var(--radius-card)] border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                  <div className="text-sm font-semibold text-ink">Reassignment required</div>
                  <div className="mt-1 grid gap-1">
                    {assignment.conflictMessages.map((message) => (
                      <div key={message}>{message}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {assignment.rateConMissing ? (
                <div className="rounded-[var(--radius-card)] border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                  Rate confirmation required before dispatch.
                </div>
              ) : null}

              {showSuggestions ? (
                <div className="space-y-2">
                  <SuggestedAssignments
                    suggestions={assignment.suggestions.slice(0, suggestionLimit)}
                    loading={assignment.suggestionsLoading}
                    error={assignment.suggestionsError}
                    onAssign={assignment.assignFromSuggestion}
                    readOnly={readOnly}
                  />
                  {assignment.suggestions.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-[color:var(--color-text-muted)] hover:text-ink"
                      onClick={() => setShowMoreSuggestions((prev) => !prev)}
                    >
                      {showMoreSuggestions ? "Show less" : "Show more"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/80 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                  Assignment is trip-first: one primary driver with truck and trailer for all loads in the trip.
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <FormField label="Primary driver" htmlFor="workbenchAssignDriver">
                  <Select
                    id="workbenchAssignDriver"
                    value={assignment.form.driverId}
                    onChange={(event) => assignment.setForm({ ...assignment.form, driverId: event.target.value })}
                    disabled={readOnly}
                  >
                    <option value="">Select driver</option>
                    {buildOptions(
                      assignment.availableDrivers,
                      assignment.unavailableDrivers,
                      assignment.showUnavailable || driverUnavailableSelected
                    ).map((driver) => (
                      <option
                        key={driver.id}
                        value={driver.id}
                        disabled={Boolean(driver.reason) && !assignment.showUnavailable && driver.id !== assignment.form.driverId}
                      >
                        {driver.name ?? "Driver"}
                        {driver.reason ? ` (Unavailable: ${driver.reason})` : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Truck" htmlFor="workbenchAssignTruck">
                  <Select
                    id="workbenchAssignTruck"
                    value={assignment.form.truckId}
                    onChange={(event) => assignment.setForm({ ...assignment.form, truckId: event.target.value })}
                    disabled={readOnly}
                  >
                    <option value="">Select truck</option>
                    {buildOptions(
                      assignment.availableTrucks,
                      assignment.unavailableTrucks,
                      assignment.showUnavailable || truckUnavailableSelected
                    ).map((truck) => (
                      <option
                        key={truck.id}
                        value={truck.id}
                        disabled={Boolean(truck.reason) && !assignment.showUnavailable && truck.id !== assignment.form.truckId}
                      >
                        {truck.unit ?? "Truck"}
                        {truck.reason ? ` (Unavailable: ${truck.reason})` : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Trailer" htmlFor="workbenchAssignTrailer">
                  <Select
                    id="workbenchAssignTrailer"
                    value={assignment.form.trailerId}
                    onChange={(event) => assignment.setForm({ ...assignment.form, trailerId: event.target.value })}
                    disabled={readOnly}
                  >
                    <option value="">Select trailer</option>
                    {buildOptions(
                      assignment.availableTrailers,
                      assignment.unavailableTrailers,
                      assignment.showUnavailable || trailerUnavailableSelected
                    ).map((trailer) => (
                      <option
                        key={trailer.id}
                        value={trailer.id}
                        disabled={Boolean(trailer.reason) && !assignment.showUnavailable && trailer.id !== assignment.form.trailerId}
                      >
                        {trailer.unit ?? "Trailer"}
                        {trailer.reason ? ` (Unavailable: ${trailer.reason})` : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>

              {assignment.assignmentNotSuggested ? (
                <FormField label="Suggestion override" htmlFor="workbenchAssistOverride" hint="Optional">
                  <Select
                    id="workbenchAssistOverride"
                    value={assignment.assistOverrideReason}
                    onChange={(event) => assignment.setAssistOverrideReason(event.target.value)}
                  >
                    <option value="">Select reason (optional)</option>
                    <option value="Driver requested">Driver requested</option>
                    <option value="Equipment mismatch">Equipment mismatch</option>
                    <option value="Better lane fit">Better lane fit</option>
                    <option value="Other">Other</option>
                  </Select>
                </FormField>
              ) : null}

              {assignment.canOverride && (assignment.rateConMissing || assignment.hasConflicts) ? (
                <FormField label="Override reason" htmlFor="workbenchAssignOverride" hint="Required for admin overrides">
                  <Input
                    id="workbenchAssignOverride"
                    value={assignment.overrideReason}
                    onChange={(event) => assignment.setOverrideReason(event.target.value)}
                    placeholder="Document why this override is needed"
                    disabled={readOnly}
                  />
                </FormField>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={assignment.assign}
                  disabled={assignment.assignDisabled || readOnly}
                  title={readOnly ? readOnlyHint : undefined}
                >
                  {assignment.hasConflicts && assignment.confirmReassign ? "Confirm reassignment" : "Assign trip"}
                </Button>
                {isAssigned ? (
                  <Button variant="secondary" onClick={assignment.unassign} disabled={readOnly} title={readOnlyHint}>
                    Unassign
                  </Button>
                ) : null}
                <CheckboxField
                  id="workbenchShowUnavailable"
                  label="Show unavailable"
                  checked={assignment.showUnavailable}
                  onChange={(event) => assignment.setShowUnavailable(event.target.checked)}
                  disabled={readOnly}
                />
              </div>

              {assignment.assignError ? <div className="text-sm text-[color:var(--color-danger)]">{assignment.assignError}</div> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-4">
        <SegmentedControl
          value={activeTab}
          options={[
            { label: "Stops", value: "stops" },
            { label: "Documents", value: "documents" },
            { label: "Tracking", value: "tracking" },
          ]}
          onChange={(value) => setActiveTab(value as "stops" | "documents" | "tracking")}
        />

        {activeTab === "stops" ? (
          <div className="mt-4 space-y-3">
            {legAddedNote ? (
              <div className="text-xs font-medium text-[color:var(--color-success)]">{legAddedNote}</div>
            ) : null}
            {stops.length ? (
              stops.map((stop: any) => (
                <Card key={stop.id} className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                        {stop.type === "PICKUP" ? "Shipper" : stop.type === "DELIVERY" ? "Consignee" : "Stop"}
                      </div>
                      <div className="text-sm font-semibold text-ink">{stop.name ?? "Stop"}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {stop.city ?? "-"}{stop.state ? `, ${stop.state}` : ""}
                      </div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {stop.appointmentStart || stop.appointmentEnd
                          ? `${formatDateTime(stop.appointmentStart)} → ${formatDateTime(stop.appointmentEnd)}`
                          : "No appointment window"}
                      </div>
                      {stop.address ? (
                        <details className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                          <summary className="cursor-pointer">Address</summary>
                          <div className="mt-1">
                            {stop.address}, {stop.city ?? ""} {stop.state ?? ""} {stop.zip ?? ""}
                          </div>
                        </details>
                      ) : null}
                    </div>
                    <StatusChip label={stopStatusLabel(stop)} tone={stopStatusTone(stop)} />
                  </div>
                  {showStopActions ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {!stop.arrivedAt ? (
                        <Button size="sm" variant="secondary" onClick={() => onMarkArrive(load.id, stop.id)} disabled={readOnly} title={readOnlyHint}>
                          Mark arrived
                        </Button>
                      ) : null}
                      {stop.arrivedAt && !stop.departedAt ? (
                        <Button size="sm" variant="secondary" onClick={() => onMarkDepart(load.id, stop.id)} disabled={readOnly} title={readOnlyHint}>
                          Mark departed
                        </Button>
                      ) : null}
                      <FormField label="Delay reason" htmlFor={`workbenchDelayReason-${stop.id}`}>
                        <Select id={`workbenchDelayReason-${stop.id}`} defaultValue={stop.delayReason ?? ""} disabled={readOnly}>
                          <option value="">Delay reason</option>
                          <option value="SHIPPER_DELAY">Shipper delay</option>
                          <option value="RECEIVER_DELAY">Receiver delay</option>
                          <option value="TRAFFIC">Traffic</option>
                          <option value="WEATHER">Weather</option>
                          <option value="BREAKDOWN">Breakdown</option>
                          <option value="OTHER">Other</option>
                        </Select>
                      </FormField>
                      <FormField label="Delay notes" htmlFor={`workbenchDelayNotes-${stop.id}`}>
                        <Textarea
                          className="min-h-[60px]"
                          defaultValue={stop.delayNotes ?? ""}
                          placeholder="Add context if needed"
                          id={`workbenchDelayNotes-${stop.id}`}
                          disabled={readOnly}
                        />
                      </FormField>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          const parent = event.currentTarget.parentElement;
                          const select = parent?.querySelector("select") as HTMLSelectElement | null;
                          const notes = parent?.querySelector("textarea") as HTMLTextAreaElement | null;
                          onUpdateDelay(stop.id, select?.value || null, notes?.value || null);
                        }}
                        disabled={readOnly}
                        title={readOnlyHint}
                      >
                        Save delay
                      </Button>
                    </div>
                  ) : null}
                </Card>
              ))
            ) : (
              <EmptyState title="No stops yet" description="Add a stop to start tracking progress." />
            )}
          </div>
        ) : null}

        {activeTab === "documents" ? (
          <div className="mt-4 space-y-3">
            <SectionHeader title="Documents" subtitle="POD and RateCon status" />
            <div className="grid gap-2">
              {(load?.docs ?? []).map((doc: any) => (
                <Card key={doc.id} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink">{doc.type}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">{formatDocStatusLabel(doc.status)}</div>
                  </div>
                  <Link href={`/loads/${loadSummary?.id ?? load.id}?tab=documents`}>
                    <Button size="sm" variant="secondary">View</Button>
                  </Link>
                </Card>
              ))}
              {(load?.docs ?? []).length === 0 ? <EmptyState title="No documents yet." /> : null}
            </div>
            <Link href={`/loads/${loadSummary?.id ?? load.id}?tab=documents`}>
              <Button variant="secondary">Open full document view</Button>
            </Link>
          </div>
        ) : null}

        {activeTab === "tracking" ? (
          <div className="mt-4 space-y-3">
            <SectionHeader title="Tracking" subtitle="Latest ping and status" />
            <Card className="space-y-2">
              <div className="text-sm text-[color:var(--color-text-muted)]">Status: {trackingState}</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">Last ping: {lastPingAt ? formatDateTime(lastPingAt) : "-"}</div>
              {trackingError ? <div className="text-xs text-[color:var(--color-danger)]">{trackingError}</div> : null}
              {trackingState === "OFF" && canStartTracking ? (
                <Button
                  size="sm"
                  disabled={readOnly}
                  title={readOnlyHint}
                  onClick={async () => {
                    if (readOnly) return;
                    try {
                      setTrackingError(null);
                      await apiFetch(`/tracking/load/${load.id}/start`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ providerType: "PHONE" }),
                      });
                      onRefresh();
                    } catch (err) {
                      setTrackingError((err as Error).message);
                    }
                  }}
                >
                  Start tracking
                </Button>
              ) : null}
              {trackingState === "ON" && canStartTracking ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={readOnly}
                  title={readOnlyHint}
                  onClick={async () => {
                    if (readOnly) return;
                    try {
                      setTrackingError(null);
                      await apiFetch(`/tracking/load/${load.id}/stop`, { method: "POST" });
                      onRefresh();
                    } catch (err) {
                      setTrackingError((err as Error).message);
                    }
                  }}
                >
                  Stop tracking
                </Button>
              ) : null}
            </Card>
          </div>
        ) : null}
      </div>
      <AddLegDrawer open={legDrawerOpen} onClose={onCloseLegDrawer}>
        {legDrawerContent}
      </AddLegDrawer>
    </div>
  );
}

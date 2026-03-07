"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DispatchDocUploadDrawer } from "@/components/dispatch/DispatchDocUploadDrawer";
import {
  createDispatchPack,
  createTripWithLoad,
  fetchDispatchAvailability,
  findFirstActionableStop,
  findFirstRejectableDoc,
  findFirstVerifiableDoc,
  markStopArrived,
  markStopDeparted,
  optimizeTrip,
  postLoadMessage,
  rejectDocument,
  updateStopDelay,
  verifyDocument,
  assignTripResources,
  type DetailAvailability,
} from "@/components/detail-workspace/detail-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { getRoleCapabilities } from "@/lib/capabilities";
import { formatDateTime, formatMiles, formatMoney, getLoadNextEta, isLoadPartial } from "@/lib/detail-workspace/model";
import type {
  DetailCommandKey,
  DetailDoc,
  DetailLens,
  DetailLoad,
  DetailStop,
  DetailWorkspaceModel,
} from "@/lib/detail-workspace/types";
import { toast } from "@/lib/toast";

type ExecutionTab = "stops" | "documents" | "tracking" | "timeline";
type SecondaryTab = "freight" | "accessorials" | "history" | "notes";

type CommandResolution = {
  enabled: boolean;
  reason?: string | null;
};

type CommandButton = {
  key: DetailCommandKey;
  label: string;
  onClick: () => void;
};

const HANDOFF_STAGES: Array<DetailWorkspaceModel["handoffStage"]> = [
  "DELIVERED",
  "DOCS_REVIEW",
  "READY",
  "INVOICED",
  "COLLECTED",
  "SETTLED",
];

const EXECUTION_TAB_OPTIONS = [
  { value: "stops", label: "Stops" },
  { value: "documents", label: "Documents" },
  { value: "tracking", label: "Tracking" },
  { value: "timeline", label: "Timeline" },
] as const;

const SECONDARY_TAB_OPTIONS = [
  { value: "freight", label: "Freight" },
  { value: "accessorials", label: "Accessorials" },
  { value: "history", label: "History" },
  { value: "notes", label: "Notes" },
] as const;

const STOP_DELAY_REASONS = ["SHIPPER_DELAY", "RECEIVER_DELAY", "TRAFFIC", "WEATHER", "BREAKDOWN", "OTHER"] as const;

function toneForBlocker(severity?: string | null) {
  if (severity === "danger") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  if (severity === "info") return "info" as const;
  return "neutral" as const;
}

function toneForDocStatus(status?: string | null) {
  const upper = String(status ?? "").toUpperCase();
  if (upper === "VERIFIED") return "success" as const;
  if (upper === "REJECTED") return "danger" as const;
  if (upper === "PENDING" || upper === "UPLOADED") return "warning" as const;
  return "neutral" as const;
}

function stopLabel(stop: DetailStop) {
  const place = [stop.city, stop.state].filter(Boolean).join(", ") || "-";
  return `${stop.loadNumber} · ${stop.name ?? "Stop"} · ${place}`;
}

function resolveCommandState(
  key: DetailCommandKey,
  model: DetailWorkspaceModel,
  capabilities: ReturnType<typeof getRoleCapabilities>
): CommandResolution {
  const base = model.commandState[key];
  if (!base.enabled) {
    return { enabled: false, reason: base.reason ?? "Not available for this shipment state." };
  }

  if ((key === "assign" || key === "updateStop" || key === "optimizeTrip") && !capabilities.canDispatchExecution) {
    return { enabled: false, reason: "Dispatch execution permission required." };
  }
  if (key === "uploadPod" && !capabilities.canUploadLoadDocs) {
    return { enabled: false, reason: "Document upload permission required." };
  }
  if ((key === "verifyDocs" || key === "rejectDocs") && !capabilities.canVerifyDocs) {
    return { enabled: false, reason: "Document verification permission required." };
  }
  if ((key === "message" || key === "dispatchPack") && !capabilities.canCreateLoadNotes) {
    return { enabled: false, reason: "Notes permission required." };
  }
  if ((key === "openReceivables" || key === "openBillingPreflight") && !capabilities.canAccessFinance) {
    return { enabled: false, reason: "Finance access required." };
  }
  if (key === "openPayablesContext" && !capabilities.canBillActions) {
    return { enabled: false, reason: "Billing permission required." };
  }

  return { enabled: true };
}

function joinHref(path: string) {
  if (typeof window === "undefined") return;
  window.location.href = path;
}

function SectionCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex min-h-0 flex-col overflow-hidden border border-[color:var(--color-divider)] ${className ?? ""}`}>
      <div className="border-b border-[color:var(--color-divider)] px-3 py-2">
        <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">{title}</div>
        {subtitle ? <div className="mt-0.5 text-xs text-[color:var(--color-text-subtle)]">{subtitle}</div> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </Card>
  );
}

export function DetailWorkspaceShell({
  model,
  onRefresh,
}: {
  model: DetailWorkspaceModel;
  onRefresh?: () => Promise<void>;
}) {
  const [executionTab, setExecutionTab] = useState<ExecutionTab>("stops");
  const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>("freight");
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [commandBusy, setCommandBusy] = useState<string | null>(null);
  const [commandNotice, setCommandNotice] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteType, setNoteType] = useState<"INTERNAL" | "CUSTOMER_VISIBLE" | "OPERATIONAL">("INTERNAL");
  const [availability, setAvailability] = useState<DetailAvailability | null>(null);
  const [assignment, setAssignment] = useState({ driverId: "", truckId: "", trailerId: "" });

  const executionLaneRef = useRef<HTMLDivElement | null>(null);
  const decisionRailRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  const capabilities = useMemo(() => getRoleCapabilities(currentRole), [currentRole]);

  const primaryLoad = useMemo(
    () => model.loads.find((item) => item.id === model.primaryLoadId) ?? model.loads[0] ?? null,
    [model.loads, model.primaryLoadId]
  );

  const allStops = useMemo(
    () => model.loads.flatMap((load) => load.stops).sort((a, b) => a.sequence - b.sequence),
    [model.loads]
  );
  const allDocs = useMemo(() => model.loads.flatMap((load) => load.docs), [model.loads]);
  const accessorials = useMemo(() => model.loads.flatMap((load) => load.accessorials), [model.loads]);
  const totalPallets = useMemo(() => model.loads.reduce((sum, load) => sum + Number(load.palletCount ?? 0), 0), [model.loads]);
  const totalWeight = useMemo(() => model.loads.reduce((sum, load) => sum + Number(load.weightLbs ?? 0), 0), [model.loads]);
  const totalRate = useMemo(() => model.loads.reduce((sum, load) => sum + Number(load.rate ?? 0), 0), [model.loads]);

  useEffect(() => {
    let active = true;
    apiFetch<{ user?: { role?: string | null } }>("/auth/me")
      .then((payload) => {
        if (!active) return;
        setCurrentRole(payload.user?.role ?? null);
      })
      .catch(() => {
        if (!active) return;
        setCurrentRole(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!primaryLoad?.id || !capabilities.canDispatchExecution) {
      setAvailability(null);
      return;
    }
    let active = true;
    fetchDispatchAvailability(primaryLoad.id)
      .then((payload) => {
        if (!active) return;
        setAvailability(payload);
      })
      .catch(() => {
        if (!active) return;
        setAvailability(null);
      });
    return () => {
      active = false;
    };
  }, [capabilities.canDispatchExecution, primaryLoad?.id]);

  const refreshModel = async () => {
    if (!onRefresh) return;
    await onRefresh();
  };

  const runCommand = async (key: string, handler: () => Promise<void>) => {
    setCommandNotice(null);
    setCommandBusy(key);
    try {
      await handler();
      await refreshModel();
    } catch (error) {
      const message = (error as Error).message || "Action failed.";
      setCommandNotice(message);
      toast.error(message);
    } finally {
      setCommandBusy(null);
    }
  };

  const focusDecisionRail = () => {
    decisionRailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    decisionRailRef.current?.focus();
  };

  const focusExecutionStops = () => {
    setExecutionTab("stops");
    executionLaneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openMessageComposer = () => {
    setExecutionTab("timeline");
    executionLaneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => messageInputRef.current?.focus(), 140);
  };

  const primaryCommands: CommandButton[] = [
    {
      key: "assign",
      label: "Assign",
      onClick: () => {
        if (!primaryLoad) return;
        void runCommand("assign", async () => {
          if (model.trip?.id) {
            await assignTripResources({
              tripId: model.trip.id,
              driverId: assignment.driverId || null,
              truckId: assignment.truckId || null,
              trailerId: assignment.trailerId || null,
            });
          } else {
            await createTripWithLoad({
              loadNumber: primaryLoad.loadNumber,
              movementMode: primaryLoad.movementMode ?? model.movementMode,
              driverId: assignment.driverId || null,
              truckId: assignment.truckId || null,
              trailerId: assignment.trailerId || null,
            });
          }
          toast.success("Assignment saved");
        });
      },
    },
    {
      key: "updateStop",
      label: "Update stop",
      onClick: focusExecutionStops,
    },
    {
      key: "message",
      label: "Message",
      onClick: openMessageComposer,
    },
    {
      key: "uploadPod",
      label: "Upload POD",
      onClick: () => setDocUploadOpen(true),
    },
    {
      key: "verifyDocs",
      label: "Verify docs",
      onClick: () => {
        const doc = findFirstVerifiableDoc(model.loads);
        if (!doc) {
          setCommandNotice("No pending document to verify.");
          return;
        }
        void runCommand("verify-doc", async () => {
          await verifyDocument(doc.id);
          toast.success(`${doc.type} verified`);
        });
      },
    },
    {
      key: "rejectDocs",
      label: "Reject docs",
      onClick: () => {
        const doc = findFirstRejectableDoc(model.loads);
        if (!doc) {
          setCommandNotice("No document available for rejection.");
          return;
        }
        const reason = window.prompt("Reject reason", doc.rejectReason ?? "Missing signature")?.trim();
        if (!reason) return;
        void runCommand("reject-doc", async () => {
          await rejectDocument(doc.id, reason);
          toast.success(`${doc.type} rejected`);
        });
      },
    },
    {
      key: "dispatchPack",
      label: "Dispatch pack",
      onClick: () => {
        if (!primaryLoad) return;
        void runCommand("dispatch-pack", async () => {
          await createDispatchPack(primaryLoad, model.trip?.tripNumber ?? null);
          toast.success("Dispatch pack logged to notes");
        });
      },
    },
    {
      key: "openInspector",
      label: "Open inspector",
      onClick: focusDecisionRail,
    },
  ];

  const conditionalCommands: CommandButton[] = [
    {
      key: "openReceivables",
      label: "Open receivables",
      onClick: () => {
        const search = encodeURIComponent(primaryLoad?.loadNumber ?? model.entityNumber);
        joinHref(`/finance?tab=receivables&search=${search}`);
      },
    },
    {
      key: "openBillingPreflight",
      label: "Open billing preflight",
      onClick: () => {
        if (!primaryLoad) return;
        joinHref(`/loads/${primaryLoad.id}?tab=billing#billing-commercial`);
      },
    },
    {
      key: "openPayablesContext",
      label: "Open payables context",
      onClick: () => {
        if (!primaryLoad) return;
        joinHref(`/finance?tab=payables&loadId=${encodeURIComponent(primaryLoad.id)}&search=${encodeURIComponent(primaryLoad.loadNumber)}`);
      },
    },
    {
      key: "optimizeTrip",
      label: "Optimize trip",
      onClick: () => {
        if (!model.trip?.id) return;
        void runCommand("optimize", async () => {
          await optimizeTrip(model.trip!.id);
          toast.success("Trip optimization completed");
        });
      },
    },
  ];

  const moreCommands: CommandButton[] = [
    {
      key: "copyShipmentLink",
      label: "Copy shipment link",
      onClick: () => {
        if (typeof window === "undefined") return;
        void navigator.clipboard.writeText(window.location.href).then(() => toast.success("Link copied"));
      },
    },
    {
      key: "openTrip",
      label: "Open trip",
      onClick: () => {
        if (!model.trip?.id) return;
        joinHref(`/trips/${model.trip.id}`);
      },
    },
  ];

  const primaryCommandStates = useMemo(
    () =>
      primaryCommands.map((command) => ({
        ...command,
        resolution: resolveCommandState(command.key, model, capabilities),
      })),
    [capabilities, model]
  );

  const conditionalCommandStates = useMemo(
    () =>
      conditionalCommands.map((command) => ({
        ...command,
        resolution: resolveCommandState(command.key, model, capabilities),
      })),
    [capabilities, model]
  );

  const moreCommandStates = useMemo(
    () =>
      moreCommands.map((command) => ({
        ...command,
        resolution: resolveCommandState(command.key, model, capabilities),
      })),
    [capabilities, model]
  );

  const disabledPrimaryReasons = primaryCommandStates
    .filter((item) => !item.resolution.enabled)
    .map((item) => `${item.label}: ${item.resolution.reason ?? "Blocked"}`);

  const submitTimelineMessage = async () => {
    if (!primaryLoad || !noteBody.trim()) return;
    await runCommand("message", async () => {
      await postLoadMessage({
        loadId: primaryLoad.id,
        body: noteBody.trim(),
        noteType,
        priority: noteType === "OPERATIONAL" ? "IMPORTANT" : "NORMAL",
      });
      setNoteBody("");
      toast.success("Message posted");
    });
  };

  const submitStopDelay = async (stop: DetailStop) => {
    const reason = window
      .prompt(`Delay reason for ${stop.loadNumber}`, stop.delayReason ?? "SHIPPER_DELAY")
      ?.trim()
      .toUpperCase();
    if (!reason) return;
    if (!STOP_DELAY_REASONS.includes(reason as (typeof STOP_DELAY_REASONS)[number])) {
      setCommandNotice("Delay reason must be one of SHIPPER_DELAY, RECEIVER_DELAY, TRAFFIC, WEATHER, BREAKDOWN, OTHER.");
      return;
    }
    const notes = window.prompt("Delay notes", stop.delayNotes ?? "")?.trim() ?? "";
    await runCommand(`delay-${stop.id}`, async () => {
      await updateStopDelay({
        stopId: stop.id,
        delayReason: reason as (typeof STOP_DELAY_REASONS)[number],
        delayNotes: notes || null,
      });
      toast.success("Delay updated");
    });
  };

  const renderExecutionLane = () => {
    if (executionTab === "stops") {
      return (
        <div className="space-y-2">
          {allStops.length === 0 ? <EmptyState title="No stops available" /> : null}
          {allStops.map((stop) => {
            const commandState = resolveCommandState("updateStop", model, capabilities);
            return (
              <Card key={stop.id} className="space-y-2 border border-[color:var(--color-divider)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">
                      {stop.type === "PICKUP" ? "Pickup" : stop.type === "DELIVERY" ? "Delivery" : "Stop"}
                    </div>
                    <div className="text-sm font-medium text-ink">{stopLabel(stop)}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      Seq {stop.sequence} · Window {formatDateTime(stop.appointmentStart)} → {formatDateTime(stop.appointmentEnd)}
                    </div>
                  </div>
                  <StatusChip label={stop.status ?? "PENDING"} tone="neutral" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!stop.arrivedAt ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!commandState.enabled || commandBusy === `arrive-${stop.id}`}
                      onClick={() => {
                        void runCommand(`arrive-${stop.id}`, async () => {
                          await markStopArrived(stop.loadId, stop.id);
                          toast.success("Stop marked arrived");
                        });
                      }}
                    >
                      Mark arrived
                    </Button>
                  ) : null}
                  {stop.arrivedAt && !stop.departedAt ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!commandState.enabled || commandBusy === `depart-${stop.id}`}
                      onClick={() => {
                        void runCommand(`depart-${stop.id}`, async () => {
                          await markStopDeparted(stop.loadId, stop.id);
                          toast.success("Stop marked departed");
                        });
                      }}
                    >
                      Mark departed
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!commandState.enabled || commandBusy === `delay-${stop.id}`}
                    onClick={() => {
                      void submitStopDelay(stop);
                    }}
                  >
                    Save delay
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      );
    }

    if (executionTab === "documents") {
      const uploadState = resolveCommandState("uploadPod", model, capabilities);
      const verifyState = resolveCommandState("verifyDocs", model, capabilities);
      const rejectState = resolveCommandState("rejectDocs", model, capabilities);

      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-[color:var(--color-text-muted)]">Upload, verify, or reject docs from one queue.</div>
            <Button size="sm" variant="secondary" disabled={!uploadState.enabled} onClick={() => setDocUploadOpen(true)}>
              Upload document
            </Button>
          </div>
          {allDocs.length === 0 ? <EmptyState title="No documents uploaded" /> : null}
          {allDocs.map((doc) => (
            <Card key={doc.id} className="space-y-2 border border-[color:var(--color-divider)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-ink">{doc.type} · {doc.loadNumber}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {formatDateTime(doc.uploadedAt)} {doc.filename ? `· ${doc.filename}` : ""}
                  </div>
                  {doc.rejectReason ? (
                    <div className="text-xs text-[color:var(--color-danger)]">Reject reason: {doc.rejectReason}</div>
                  ) : null}
                </div>
                <StatusChip label={doc.status ?? "PENDING"} tone={toneForDocStatus(doc.status)} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!verifyState.enabled || commandBusy === `verify-${doc.id}` || doc.status === "VERIFIED"}
                  onClick={() => {
                    void runCommand(`verify-${doc.id}`, async () => {
                      await verifyDocument(doc.id);
                      toast.success("Document verified");
                    });
                  }}
                >
                  Verify
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!rejectState.enabled || commandBusy === `reject-${doc.id}` || doc.status === "REJECTED"}
                  onClick={() => {
                    const reason = window.prompt("Reject reason", doc.rejectReason ?? "Missing signature")?.trim();
                    if (!reason) return;
                    void runCommand(`reject-${doc.id}`, async () => {
                      await rejectDocument(doc.id, reason);
                      toast.success("Document rejected");
                    });
                  }}
                >
                  Reject
                </Button>
              </div>
            </Card>
          ))}
        </div>
      );
    }

    if (executionTab === "tracking") {
      return (
        <div className="space-y-2">
          {model.loads.map((load) => {
            const isPartial = isLoadPartial(load, model.partialGroups);
            const etaRows = model.etaRows.filter((row) => row.loadId === load.id);
            return (
              <Card key={load.id} className="space-y-2 border border-[color:var(--color-divider)] p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-ink">{load.loadNumber}</div>
                  <div className="flex items-center gap-1.5">
                    {isPartial ? <Badge>Partial</Badge> : null}
                    <StatusChip label={load.status} tone="neutral" />
                  </div>
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Next ETA: {formatDateTime(getLoadNextEta(load))}
                </div>
                <div className="space-y-1">
                  {etaRows.map((row) => (
                    <div key={`${row.loadId}-${row.stopId}`} className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-xs text-[color:var(--color-text-muted)]">
                      {row.stopType} · {row.stopName ?? "Stop"} · {[row.city, row.state].filter(Boolean).join(", ") || "-"} · ETA {formatDateTime(row.eta)}
                    </div>
                  ))}
                  {etaRows.length === 0 ? <EmptyState title="No ETA rows" /> : null}
                </div>
              </Card>
            );
          })}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Card className="space-y-3 border border-[color:var(--color-divider)] p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px_auto] lg:items-end">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">New note</div>
              <Textarea
                ref={messageInputRef}
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="Operational update, customer message, or finance context"
                className="min-h-[84px]"
              />
            </div>
            <Select value={noteType} onChange={(event) => setNoteType(event.target.value as typeof noteType)}>
              <option value="INTERNAL">Internal</option>
              <option value="CUSTOMER_VISIBLE">Customer visible</option>
              <option value="OPERATIONAL">Operational</option>
            </Select>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Post message to timeline and keep audit trail linked to this load.
            </div>
            <Button size="sm" disabled={!noteBody.trim() || commandBusy === "message"} onClick={() => void submitTimelineMessage()}>
              {commandBusy === "message" ? "Posting..." : "Post message"}
            </Button>
          </div>
        </Card>

        {model.timeline.map((entry) => (
          <Card key={entry.id} className="space-y-1 border border-[color:var(--color-divider)] p-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">{entry.kind ?? entry.type ?? "EVENT"}</div>
            <div className="text-sm text-ink">{entry.message ?? "-"}</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">{formatDateTime(entry.time)}</div>
          </Card>
        ))}
        {model.timeline.length === 0 ? <EmptyState title="No timeline events" /> : null}
      </div>
    );
  };

  const renderSecondaryTab = () => {
    if (secondaryTab === "freight") {
      return (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="space-y-1 border border-[color:var(--color-divider)] p-3 text-sm">
            <div>Total loads: {model.loads.length}</div>
            <div>Total pallets: {totalPallets.toLocaleString()}</div>
            <div>Total weight: {totalWeight.toLocaleString()} lbs</div>
            <div>Total miles: {formatMiles(model.loads.reduce((sum, load) => sum + Number(load.miles ?? 0), 0))}</div>
            <div>Total rate: {formatMoney(totalRate)}</div>
          </Card>
          <Card className="space-y-2 border border-[color:var(--color-divider)] p-3">
            {model.loads.map((load) => (
              <details key={load.id} className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5">
                <summary className="cursor-pointer text-sm font-medium text-ink">{load.loadNumber}</summary>
                <div className="mt-1 space-y-0.5 text-xs text-[color:var(--color-text-muted)]">
                  <div>Status: {load.status}</div>
                  <div>Customer: {load.customerName ?? "-"}</div>
                  <div>Rate: {formatMoney(load.rate)}</div>
                  <div>Miles: {formatMiles(load.miles ?? null)}</div>
                  <div>Paid miles: {formatMiles(load.paidMiles ?? null)}</div>
                </div>
              </details>
            ))}
          </Card>
        </div>
      );
    }

    if (secondaryTab === "accessorials") {
      return (
        <div className="space-y-2">
          {accessorials.length === 0 ? <EmptyState title="No accessorials" /> : null}
          {accessorials.map((item) => (
            <Card key={item.id} className="flex items-center justify-between gap-2 border border-[color:var(--color-divider)] p-3">
              <div className="text-sm text-ink">{item.loadNumber} · {item.type ?? "ACCESSORIAL"}</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">{item.status ?? "-"} · {formatMoney(item.amount)}</div>
            </Card>
          ))}
        </div>
      );
    }

    if (secondaryTab === "history") {
      return (
        <div className="space-y-2">
          {model.timeline.length === 0 ? <EmptyState title="No history records" /> : null}
          {model.timeline.map((entry) => (
            <Card key={entry.id} className="space-y-1 border border-[color:var(--color-divider)] p-3">
              <div className="text-sm font-medium text-ink">{entry.kind ?? entry.type ?? "EVENT"}</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">{entry.message ?? "-"}</div>
              <div className="text-xs text-[color:var(--color-text-subtle)]">{formatDateTime(entry.time)}</div>
            </Card>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {model.notes.length === 0 ? <EmptyState title="No notes" /> : null}
        {model.notes.map((note) => (
          <Card key={note.id} className="space-y-1 border border-[color:var(--color-divider)] p-3">
            <div className="text-sm font-medium text-ink">
              {note.sourceLoadNumber ? `${note.sourceLoadNumber} · ` : ""}
              {note.priority ?? "NORMAL"}
            </div>
            <div className="text-sm text-[color:var(--color-text-muted)]">{note.text}</div>
            <div className="text-xs text-[color:var(--color-text-subtle)]">{formatDateTime(note.createdAt)}</div>
          </Card>
        ))}
      </div>
    );
  };

  const firstActionableStop = findFirstActionableStop(model.loads);

  return (
    <div data-testid="detail-workspace-shell" className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)]">
      <section data-testid="detail-context-strip" className="sticky top-0 z-20 border-b border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="text-sm font-semibold text-ink">
                {model.entityLabel} {model.entityNumber}
              </div>
              {model.status ? <StatusChip label={model.status} tone="neutral" /> : null}
              {model.movementMode ? <Badge>{model.movementMode}</Badge> : null}
              {model.blockers.slice(0, 2).map((blocker) => (
                <StatusChip key={blocker.code} label={blocker.label} tone={toneForBlocker(blocker.severity)} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
              <span data-testid="detail-now-block">Now: {model.now.label}</span>
              {model.now.subtitle ? <span>{model.now.subtitle}</span> : null}
              <span data-testid="detail-blockers-block">Blockers: {model.blockers.length || 0}</span>
              <span data-testid="detail-next-action-block">Next: {model.nextAction.label}</span>
            </div>
          </div>

          <div className="flex min-w-[340px] max-w-[980px] flex-wrap items-center justify-end gap-1.5">
            {primaryCommandStates.map((command) => (
              <Button
                key={command.key}
                size="sm"
                variant={command.key === "openInspector" ? "secondary" : "ghost"}
                disabled={!command.resolution.enabled || commandBusy === command.key}
                title={command.resolution.enabled ? undefined : command.resolution.reason ?? undefined}
                onClick={command.onClick}
              >
                {command.label}
              </Button>
            ))}

            <details data-testid="detail-command-more" className="relative">
              <summary className="list-none">
                <Button size="sm" variant="ghost">More</Button>
              </summary>
              <div className="absolute right-0 top-9 z-30 w-56 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] p-2 shadow-[var(--shadow-subtle)]">
                {moreCommandStates.map((command) => (
                  <button
                    key={command.key}
                    type="button"
                    disabled={!command.resolution.enabled}
                    className="flex w-full items-center rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm text-ink hover:bg-[color:var(--color-bg-muted)] disabled:cursor-not-allowed disabled:text-[color:var(--color-text-subtle)]"
                    onClick={command.onClick}
                    title={command.resolution.enabled ? undefined : command.resolution.reason ?? undefined}
                  >
                    {command.label}
                  </button>
                ))}
                <div className="mt-1 border-t border-[color:var(--color-divider)] pt-1">
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm text-[color:var(--color-text-subtle)]"
                  >
                    Admin operations (coming soon)
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {conditionalCommandStates.map((command) => (
            <Button
              key={command.key}
              size="sm"
              variant="secondary"
              disabled={!command.resolution.enabled || commandBusy === command.key}
              title={command.resolution.enabled ? undefined : command.resolution.reason ?? undefined}
              onClick={command.onClick}
            >
              {command.label}
            </Button>
          ))}
        </div>

        {disabledPrimaryReasons.length ? (
          <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
            {disabledPrimaryReasons.join(" · ")}
          </div>
        ) : null}
        {commandNotice ? <div className="mt-2 text-xs text-[color:var(--color-warning)]">{commandNotice}</div> : null}
      </section>

      <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section data-testid="detail-execution-lane" ref={executionLaneRef} className="min-h-0 overflow-auto space-y-3">
          <Card className="space-y-3 border border-[color:var(--color-divider)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SegmentedControl
                value={executionTab}
                options={EXECUTION_TAB_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                onChange={(value) => setExecutionTab(value as ExecutionTab)}
              />
              {firstActionableStop ? (
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Next stop: {firstActionableStop.loadNumber} · {firstActionableStop.type} · {formatDateTime(firstActionableStop.appointmentStart)}
                </div>
              ) : null}
            </div>
            {renderExecutionLane()}
          </Card>

          <Card data-testid="detail-secondary-tabs" className="space-y-3 border border-[color:var(--color-divider)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SegmentedControl
                value={secondaryTab}
                options={SECONDARY_TAB_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                onChange={(value) => setSecondaryTab(value as SecondaryTab)}
              />
              <div className="text-xs text-[color:var(--color-text-muted)]">Deep metadata is grouped in these tabs.</div>
            </div>
            {renderSecondaryTab()}
          </Card>
        </section>

        <aside
          data-testid="detail-decision-rail"
          ref={decisionRailRef}
          tabIndex={-1}
          className="sticky top-2 min-h-0 self-start space-y-3 overflow-auto rounded-[var(--radius-card)] outline-none"
        >
          <SectionCard title="Assignment" subtitle="Driver · truck · trailer">
            <div className="space-y-2 text-xs">
              <div className="text-[color:var(--color-text-muted)]">
                Current: {model.trip?.driverName ?? primaryLoad?.driverName ?? "Unassigned"} · {model.trip?.truckUnit ?? primaryLoad?.truckUnit ?? "-"} · {model.trip?.trailerUnit ?? primaryLoad?.trailerUnit ?? "-"}
              </div>
              <div className="grid gap-2">
                <Select value={assignment.driverId} onChange={(event) => setAssignment((prev) => ({ ...prev, driverId: event.target.value }))}>
                  <option value="">Select driver</option>
                  {availability?.availableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>{driver.name ?? driver.id}</option>
                  ))}
                  {availability?.unavailableDrivers.map((driver) => (
                    <option key={`unavailable-driver-${driver.id}`} value={driver.id}>{driver.name ?? driver.id} · busy</option>
                  ))}
                </Select>
                <Select value={assignment.truckId} onChange={(event) => setAssignment((prev) => ({ ...prev, truckId: event.target.value }))}>
                  <option value="">Select truck</option>
                  {availability?.availableTrucks.map((truck) => (
                    <option key={truck.id} value={truck.id}>{truck.unit ?? truck.id}</option>
                  ))}
                  {availability?.unavailableTrucks.map((truck) => (
                    <option key={`unavailable-truck-${truck.id}`} value={truck.id}>{truck.unit ?? truck.id} · busy</option>
                  ))}
                </Select>
                <Select value={assignment.trailerId} onChange={(event) => setAssignment((prev) => ({ ...prev, trailerId: event.target.value }))}>
                  <option value="">Select trailer</option>
                  {availability?.availableTrailers.map((trailer) => (
                    <option key={trailer.id} value={trailer.id}>{trailer.unit ?? trailer.id}</option>
                  ))}
                  {availability?.unavailableTrailers.map((trailer) => (
                    <option key={`unavailable-trailer-${trailer.id}`} value={trailer.id}>{trailer.unit ?? trailer.id} · busy</option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  disabled={!resolveCommandState("assign", model, capabilities).enabled || commandBusy === "assign"}
                  onClick={() => primaryCommands.find((command) => command.key === "assign")?.onClick()}
                >
                  Assign everything
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Exceptions" subtitle="Now / blockers / next">
            <div className="space-y-2 text-xs">
              <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2">
                <div className="font-medium text-ink">Now</div>
                <div className="text-[color:var(--color-text-muted)]">{model.now.label}</div>
              </div>
              {model.blockers.map((blocker) => (
                <div key={blocker.code} className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2">
                  <div className="flex items-center gap-1.5">
                    <StatusChip label={blocker.severity.toUpperCase()} tone={toneForBlocker(blocker.severity)} />
                    <div className="font-medium text-ink">{blocker.label}</div>
                  </div>
                  {blocker.hint ? <div className="mt-1 text-[color:var(--color-text-muted)]">{blocker.hint}</div> : null}
                </div>
              ))}
              {model.blockers.length === 0 ? <EmptyState title="No active blockers" /> : null}
              <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2">
                <div className="font-medium text-ink">Next action</div>
                <div className="text-[color:var(--color-text-muted)]">{model.nextAction.label}</div>
                {model.nextAction.reason ? <div className="text-[color:var(--color-text-subtle)]">{model.nextAction.reason}</div> : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Finance Handoff" subtitle="Dispatch to money spine">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {HANDOFF_STAGES.map((stage) => (
                  <StatusChip key={stage} label={stage.replace(/_/g, " ")} tone={stage === model.handoffStage ? "success" : "neutral"} className="text-[10px]" />
                ))}
              </div>
              <div className="text-xs text-[color:var(--color-text-muted)]">
                Primary load: {model.primaryLoadNumber} · Billing status {primaryLoad?.billingStatus ?? "-"}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Authority" subtitle="Domain boundaries">
            <div className="space-y-1 text-xs text-[color:var(--color-text-muted)]">
              <div>Execution authority: <span className="font-medium text-ink">Trip/Dispatch</span></div>
              <div>Commercial authority: <span className="font-medium text-ink">Load/Finance</span></div>
              <div>Lens: <span className="font-medium text-ink">{model.lens.toUpperCase()}</span></div>
              {model.trip?.id ? (
                <div>
                  Trip: <Link className="font-medium text-[color:var(--color-accent)]" href={`/trips/${model.trip.id}`}>{model.trip.tripNumber}</Link>
                </div>
              ) : null}
            </div>
          </SectionCard>
        </aside>
      </div>

      <DispatchDocUploadDrawer
        open={docUploadOpen}
        loadId={primaryLoad?.id ?? null}
        loadNumber={primaryLoad?.loadNumber ?? null}
        onClose={() => setDocUploadOpen(false)}
        onUploaded={() => {
          toast.success("Document uploaded");
          void refreshModel();
        }}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppShellActivity } from "@/components/app-shell";
import { useUser } from "@/components/auth/user-context";
import { NoAccess } from "@/components/rbac/no-access";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { apiFetch } from "@/lib/api";
import { toneFromSemantic } from "@/lib/status-semantics";

type WorkbenchKind = "safety" | "support";

type LoadRecord = {
  id: string;
  loadNumber: string;
  status: string;
  customerName?: string | null;
  shipperCity?: string | null;
  shipperState?: string | null;
  consigneeCity?: string | null;
  consigneeState?: string | null;
  podStatus?: "MISSING" | "UPLOADED" | "VERIFIED" | "REJECTED" | null;
  trackingState?: "ON" | "OFF" | null;
};

type TripRecord = {
  id: string;
  tripNumber: string;
  status: string;
  movementMode?: string | null;
  origin?: string | null;
  destination?: string | null;
  loads?: Array<{ id: string }>;
  driver?: { name?: string | null } | null;
};

type TaskItem = {
  id: string;
  title: string;
  priority: string;
  status: string;
  deepLink: string;
  primaryActionLabel: string;
};

type LoadResponse = { loads: LoadRecord[]; total: number };
type TripResponse = { trips: TripRecord[]; total: number };
type TaskResponse = { items: TaskItem[]; total: number };
type ActivityItem = {
  id: string;
  title: string;
  severity: "ALERT" | "IMPORTANT" | "INFO";
  domain: "DISPATCH" | "BILLING" | "SAFETY" | "SYSTEM";
  timestamp: string;
  count?: number;
  cta: { label: string; href: string };
};
type ActivitySummary = {
  now: ActivityItem[];
  week: ActivityItem[];
  history?: ActivityItem[];
};

type WorkbenchData = {
  primaryLoads: LoadRecord[];
  secondaryLoads: LoadRecord[];
  tertiaryLoads: LoadRecord[];
  trips: TripRecord[];
  tasks: TaskItem[];
  activity: ActivityItem[];
  primaryTotal: number;
  secondaryTotal: number;
  tertiaryTotal: number;
  tripTotal: number;
  taskTotal: number;
  warnings: string[];
};

const EMPTY_DATA: WorkbenchData = {
  primaryLoads: [],
  secondaryLoads: [],
  tertiaryLoads: [],
  trips: [],
  tasks: [],
  activity: [],
  primaryTotal: 0,
  secondaryTotal: 0,
  tertiaryTotal: 0,
  tripTotal: 0,
  taskTotal: 0,
  warnings: [],
};

const WORKBENCH_CONFIG: Record<
  WorkbenchKind,
  {
    role: "SAFETY" | "SUPPORT";
    title: string;
    subtitle: string;
    primaryQueueLabel: string;
    secondaryQueueLabel: string;
    tertiaryQueueLabel: string;
    primaryChip: string;
    secondaryChip: string;
    tertiaryChip: string;
  }
> = {
  safety: {
    role: "SAFETY",
    title: "Safety Workbench",
    subtitle: "Compliance and operational risk monitoring for active loads and trips",
    primaryQueueLabel: "Tracking-risk loads",
    secondaryQueueLabel: "Missing POD loads",
    tertiaryQueueLabel: "Compliance-expired loads",
    primaryChip: "tracking-off",
    secondaryChip: "missing-pod",
    tertiaryChip: "issue:COMPLIANCE_EXPIRED",
  },
  support: {
    role: "SUPPORT",
    title: "Support Workbench",
    subtitle: "Read-only troubleshooting workspace across dispatch and execution timelines",
    primaryQueueLabel: "Delivered-unbilled loads",
    secondaryQueueLabel: "Active loads",
    tertiaryQueueLabel: "QBO-failed loads",
    primaryChip: "delivered-unbilled",
    secondaryChip: "active",
    tertiaryChip: "qbo-failed",
  },
};

function toneFromStatus(status: string) {
  const value = status.toUpperCase();
  if (value.includes("CANCELLED") || value.includes("BLOCKED") || value.includes("REJECT")) {
    return toneFromSemantic("blocked");
  }
  if (value.includes("PAID") || value.includes("COMPLETE") || value.includes("DELIVERED") || value.includes("VERIFIED")) {
    return toneFromSemantic("complete");
  }
  if (value.includes("IN_TRANSIT") || value.includes("ACTIVE") || value.includes("OPEN")) {
    return toneFromSemantic("info");
  }
  if (value.includes("ASSIGNED") || value.includes("READY")) {
    return toneFromSemantic("attention");
  }
  return toneFromSemantic("neutral");
}

function formatLane(load: LoadRecord) {
  const origin = [load.shipperCity, load.shipperState].filter(Boolean).join(", ");
  const destination = [load.consigneeCity, load.consigneeState].filter(Boolean).join(", ");
  if (!origin && !destination) return "Route not set";
  return `${origin || "-"} -> ${destination || "-"}`;
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / (60 * 1000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function activityTone(severity: ActivityItem["severity"]) {
  if (severity === "ALERT") return toneFromSemantic("blocked");
  if (severity === "IMPORTANT") return toneFromSemantic("attention");
  return toneFromSemantic("neutral");
}

function ActivityIconButton() {
  const activity = useAppShellActivity();
  if (!activity?.canUseActivity) return null;
  return (
    <button
      type="button"
      aria-label="Open activity"
      onClick={activity.openActivityDrawer}
      className="relative inline-flex h-[var(--icon-button-size-toolbar)] w-[var(--icon-button-size-toolbar)] items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] text-[color:var(--color-text-muted)] shadow-[var(--shadow-subtle)] transition hover:bg-[color:var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[var(--icon-size-toolbar)] w-[var(--icon-size-toolbar)]" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M15 17H9a2 2 0 0 1-2-2v-4a5 5 0 1 1 10 0v4a2 2 0 0 1-2 2Z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      {activity.activityBadgeCount > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--color-danger)] px-1 text-[10px] font-semibold text-white">
          {activity.activityBadgeCount > 99 ? "99+" : activity.activityBadgeCount}
        </span>
      ) : null}
    </button>
  );
}

function QueueTable({
  title,
  subtitle,
  loads,
  emptyText,
}: {
  title: string;
  subtitle: string;
  loads: LoadRecord[];
  emptyText: string;
}) {
  return (
    <Card className="!p-3">
      <SectionHeader title={title} subtitle={subtitle} />
      {loads.length === 0 ? (
        <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
          {emptyText}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">
              <tr className="border-b border-[color:var(--color-divider)]">
                <th className="px-2 py-2">Load</th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Route</th>
                <th className="px-2 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loads.map((load) => (
                <tr key={load.id} className="border-b border-[color:var(--color-divider)]/70">
                  <td className="px-2 py-2 font-semibold text-ink">{load.loadNumber}</td>
                  <td className="px-2 py-2 text-[color:var(--color-text-muted)]">{load.customerName ?? "Customer"}</td>
                  <td className="px-2 py-2">
                    <StatusChip tone={toneFromStatus(load.status)} label={load.status.replaceAll("_", " ")} />
                  </td>
                  <td className="px-2 py-2 text-[color:var(--color-text-muted)]">{formatLane(load)}</td>
                  <td className="px-2 py-2 text-right">
                    <Link href={`/loads/${load.id}`} className="text-[color:var(--color-accent)] hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TripTable({ trips }: { trips: TripRecord[] }) {
  return (
    <Card className="!p-3">
      <SectionHeader title="Trip watchlist" subtitle="Recent trips for investigation and escalation context" />
      {trips.length === 0 ? (
        <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
          No trips found for this slice.
        </div>
      ) : (
        <div className="space-y-2">
          {trips.map((trip) => (
            <div
              key={trip.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-2"
            >
              <div className="space-y-1">
                <div className="text-sm font-semibold text-ink">{trip.tripNumber}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {(trip.origin ?? "-") + " -> " + (trip.destination ?? "-")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip tone={toneFromStatus(trip.status)} label={trip.status.replaceAll("_", " ")} />
                <span className="text-xs text-[color:var(--color-text-muted)]">{trip.loads?.length ?? 0} loads</span>
                <Link href={`/trips/${trip.id}`} className="text-xs text-[color:var(--color-accent)] hover:underline">
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TaskTable({ tasks }: { tasks: TaskItem[] }) {
  return (
    <Card className="!p-3">
      <SectionHeader title="Role task inbox" subtitle="Assigned role tasks to investigate and close" />
      {tasks.length === 0 ? (
        <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
          No open tasks for this role.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-2"
            >
              <div className="space-y-1">
                <div className="text-sm font-medium text-ink">{task.title}</div>
                <div className="flex items-center gap-2">
                  <StatusChip tone={toneFromStatus(task.priority)} label={task.priority} />
                  <span className="text-xs text-[color:var(--color-text-muted)]">{task.status}</span>
                </div>
              </div>
              <Link href={task.deepLink} className="text-xs text-[color:var(--color-accent)] hover:underline">
                {task.primaryActionLabel}
              </Link>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ActivityTimelineCard({ items, kind }: { items: ActivityItem[]; kind: WorkbenchKind }) {
  return (
    <Card className="!p-3">
      <SectionHeader
        title={kind === "safety" ? "Safety timeline" : "Cross-system timeline"}
        subtitle={
          kind === "safety"
            ? "Compliance and exception signals from dispatch + safety domains"
            : "Support triage stream across dispatch, billing, safety, and system events"
        }
      />
      {items.length === 0 ? (
        <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
          Timeline unavailable.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-2"
            >
              <div className="min-w-0 space-y-1">
                <div className="truncate text-sm font-medium text-ink">{item.title}</div>
                <div className="flex items-center gap-2 text-[11px] text-[color:var(--color-text-muted)]">
                  <StatusChip tone={activityTone(item.severity)} label={item.severity} />
                  <span>{item.domain}</span>
                  <span>{formatRelativeTime(item.timestamp)}</span>
                </div>
              </div>
              <Link href={item.cta?.href ?? "/dispatch"} className="text-xs text-[color:var(--color-accent)] hover:underline">
                {item.cta?.label ?? "Open"}
              </Link>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function ReadOnlyOpsWorkbench({ kind }: { kind: WorkbenchKind }) {
  const { user, loading: userLoading, capabilities } = useUser();
  const [data, setData] = useState<WorkbenchData>(EMPTY_DATA);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const config = WORKBENCH_CONFIG[kind];

  const hasRoleAccess = useMemo(
    () => capabilities.canonicalRole === config.role || capabilities.canonicalRole === "ADMIN",
    [capabilities.canonicalRole, config.role]
  );

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    const taskTab = kind === "safety" ? "role" : "mine";
    const tertiaryLoadUrl =
      config.tertiaryChip.startsWith("issue:")
        ? `/loads?issuePreset=${encodeURIComponent(config.tertiaryChip.replace("issue:", ""))}&limit=8`
        : `/loads?chip=${encodeURIComponent(config.tertiaryChip)}&limit=8`;
    const [primaryLoadResult, secondaryLoadResult, tertiaryLoadResult, tripResult, taskResult, activityResult] =
      await Promise.allSettled([
        apiFetch<LoadResponse>(`/loads?chip=${encodeURIComponent(config.primaryChip)}&limit=8`),
        apiFetch<LoadResponse>(`/loads?chip=${encodeURIComponent(config.secondaryChip)}&limit=8`),
        apiFetch<LoadResponse>(tertiaryLoadUrl),
      apiFetch<TripResponse>("/trips?status=IN_TRANSIT"),
      apiFetch<TaskResponse>(`/tasks/inbox?tab=${taskTab}&limit=8`),
        apiFetch<ActivitySummary>("/activity/summary?range=all&domain=all"),
      ]);

    const warnings: string[] = [];
    const nextData: WorkbenchData = { ...EMPTY_DATA };

    if (primaryLoadResult.status === "fulfilled") {
      nextData.primaryLoads = primaryLoadResult.value.loads.slice(0, 8);
      nextData.primaryTotal = primaryLoadResult.value.total ?? primaryLoadResult.value.loads.length;
    } else {
      warnings.push(`${config.primaryQueueLabel} unavailable`);
    }
    if (secondaryLoadResult.status === "fulfilled") {
      nextData.secondaryLoads = secondaryLoadResult.value.loads.slice(0, 8);
      nextData.secondaryTotal = secondaryLoadResult.value.total ?? secondaryLoadResult.value.loads.length;
    } else {
      warnings.push(`${config.secondaryQueueLabel} unavailable`);
    }
    if (tertiaryLoadResult.status === "fulfilled") {
      nextData.tertiaryLoads = tertiaryLoadResult.value.loads.slice(0, 8);
      nextData.tertiaryTotal = tertiaryLoadResult.value.total ?? tertiaryLoadResult.value.loads.length;
    } else {
      warnings.push(`${config.tertiaryQueueLabel} unavailable`);
    }
    if (tripResult.status === "fulfilled") {
      nextData.trips = tripResult.value.trips.slice(0, 8);
      nextData.tripTotal = tripResult.value.total ?? tripResult.value.trips.length;
    } else {
      warnings.push("Trip watchlist unavailable");
    }
    if (taskResult.status === "fulfilled") {
      nextData.tasks = taskResult.value.items.slice(0, 8);
      nextData.taskTotal = taskResult.value.total ?? taskResult.value.items.length;
    } else {
      warnings.push("Task inbox unavailable");
    }
    if (activityResult.status === "fulfilled") {
      const pool = [...(activityResult.value.now ?? []), ...(activityResult.value.week ?? []), ...(activityResult.value.history ?? [])];
      nextData.activity = pool
        .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
        .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
        .slice(0, 8);
    } else {
      warnings.push("Activity timeline unavailable");
    }
    nextData.warnings = warnings;
    setData(nextData);
    if (warnings.length >= 5) {
      setError("Unable to load workbench data.");
    }
    setLoadingData(false);
  }, [
    config.primaryChip,
    config.primaryQueueLabel,
    config.secondaryChip,
    config.secondaryQueueLabel,
    config.tertiaryChip,
    config.tertiaryQueueLabel,
    kind,
  ]);

  useEffect(() => {
    if (!hasRoleAccess) {
      setLoadingData(false);
      return;
    }
    void fetchData();
  }, [fetchData, hasRoleAccess]);

  if (!userLoading && user && !hasRoleAccess) {
    return (
      <NoAccess
        title={`No access to ${config.title}`}
        description="This workspace is restricted to the assigned role."
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card className="!p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <SectionHeader title={config.title} subtitle={config.subtitle} />
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={toneFromSemantic("attention")} label="Read-only" />
              <span className="text-xs text-[color:var(--color-text-muted)]">
                Mutation controls are hidden for this role. Use queue drilldowns to investigate and escalate.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ActivityIconButton />
            <Button size="sm" variant="secondary" onClick={() => void fetchData()} disabled={loadingData}>
              {loadingData ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 text-xs">
            <div className="text-[color:var(--color-text-muted)]">{config.primaryQueueLabel}</div>
            <div className="font-semibold text-ink">{data.primaryTotal}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 text-xs">
            <div className="text-[color:var(--color-text-muted)]">{config.secondaryQueueLabel}</div>
            <div className="font-semibold text-ink">{data.secondaryTotal}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 text-xs">
            <div className="text-[color:var(--color-text-muted)]">{config.tertiaryQueueLabel}</div>
            <div className="font-semibold text-ink">{data.tertiaryTotal}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 text-xs">
            <div className="text-[color:var(--color-text-muted)]">In-transit trips</div>
            <div className="font-semibold text-ink">{data.tripTotal}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 text-xs">
            <div className="text-[color:var(--color-text-muted)]">Open tasks</div>
            <div className="font-semibold text-ink">{data.taskTotal}</div>
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="!p-3 text-sm text-[color:var(--color-danger)]">
          {error}
        </Card>
      ) : null}

      {data.warnings.length > 0 ? (
        <Card className="!p-3 text-xs text-[color:var(--color-warning)]">
          Partial sync warning: {data.warnings.join(" · ")}
        </Card>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        <QueueTable
          title={config.primaryQueueLabel}
          subtitle="Read-heavy queue for prioritization"
          loads={data.primaryLoads}
          emptyText="No loads in this queue."
        />
        <QueueTable
          title={config.secondaryQueueLabel}
          subtitle="Secondary queue for follow-up"
          loads={data.secondaryLoads}
          emptyText="No loads in this queue."
        />
      </div>

      <QueueTable
        title={config.tertiaryQueueLabel}
        subtitle={kind === "safety" ? "Escalation queue for urgent compliance breaks" : "Fallback queue for active troubleshooting"}
        loads={data.tertiaryLoads}
        emptyText="No loads in this queue."
      />

      <div className="grid gap-3 xl:grid-cols-2">
        <TripTable trips={data.trips} />
        <TaskTable tasks={data.tasks} />
      </div>

      <ActivityTimelineCard items={data.activity} kind={kind} />
    </div>
  );
}

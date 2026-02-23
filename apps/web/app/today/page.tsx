"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";

type TodayItem = {
  severity: "block" | "warning" | "info";
  title: string;
  detail?: string | null;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ruleId?: string | null;
};

type TodayData = {
  blocks: TodayItem[];
  warnings: TodayItem[];
  info: TodayItem[];
  teamsEnabled?: boolean;
  scope?: "org" | "team";
  warningSummary?: Record<string, number>;
  teamBreakdown?: Array<{ teamId: string; teamName: string; warnings: Record<string, number> }>;
};

type OnboardingState = {
  status?: "NOT_ACTIVATED" | "OPERATIONAL";
  percentComplete?: number;
  completedSteps?: string[];
};

type WarningDetailLoad = {
  id: string;
  loadNumber?: string | null;
  tripId?: string | null;
  tripNumber?: string | null;
  customerName?: string | null;
  status?: string | null;
  warningReason: string;
  ageMinutes?: number | null;
  assignedDriverName?: string | null;
  stopSummary?: string | null;
};

type WarningDetails = {
  teamsEnabled: boolean;
  scope: "org" | "team";
  type: string;
  team?: { teamId: string; teamName: string };
  loads: WarningDetailLoad[];
  pageInfo?: { nextCursor?: string | null };
};

const SECTION_META = [
  {
    key: "blocks",
    label: "Blocks",
    subtitle: "Must resolve before the next step",
    tone: "danger",
  },
  {
    key: "warnings",
    label: "Warnings",
    subtitle: "Needs eyes within the next shift",
    tone: "warning",
  },
  {
    key: "info",
    label: "Info",
    subtitle: "Nice to close out today",
    tone: "info",
  },
] as const;

const WARNING_META = [
  { key: "dispatch_unassigned_loads", label: "Unassigned trips", title: "Unassigned trips need coverage" },
  { key: "dispatch_stuck_in_transit", label: "Stuck in transit", title: "Trips stuck in transit" },
] as const;

const TONE_CLASS: Record<(typeof SECTION_META)[number]["tone"], string> = {
  danger: "border-0 border-l-4 border-l-[color:var(--color-danger)] bg-white",
  warning: "border-0 border-l-4 border-l-[color:var(--color-warning)] bg-white",
  info: "border-0 bg-white",
};

const GLOSSY_SURFACE =
  "bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_6px_16px_rgba(12,12,12,0.04)]";

const SETUP_STEPS: Array<{ key: string; label: string }> = [
  { key: "basics", label: "Company basics" },
  { key: "operating", label: "Operating entities" },
  { key: "team", label: "Invite team" },
  { key: "drivers", label: "Add drivers" },
  { key: "fleet", label: "Add fleet" },
  { key: "preferences", label: "Document rules" },
  { key: "tracking", label: "Tracking setup" },
  { key: "finance", label: "Finance defaults" },
];

function TodayContent() {
  const router = useRouter();
  const { user } = useUser();
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"company" | "teams">("company");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsData, setDetailsData] = useState<WarningDetails | null>(null);
  const [detailsLoads, setDetailsLoads] = useState<WarningDetailLoad[]>([]);
  const [detailsNextCursor, setDetailsNextCursor] = useState<string | null>(null);
  const [detailsQuery, setDetailsQuery] = useState<{ type: string; teamId?: string | null } | null>(null);
  const [showAllTeams, setShowAllTeams] = useState(false);

  const loadToday = async () => {
    setLoading(true);
    try {
      const payload = await apiFetch<TodayData>("/today");
      setData(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadToday();
  }, []);

  const canSeeTeamsView = Boolean(data?.teamsEnabled && (user?.role === "ADMIN" || user?.role === "HEAD_DISPATCHER"));

  useEffect(() => {
    if (!canSeeTeamsView) {
      setViewMode("company");
    }
  }, [canSeeTeamsView]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") {
      setOnboarding(null);
      return;
    }
    apiFetch<{ state: OnboardingState }>("/onboarding/state")
      .then((payload) => {
        setOnboarding(payload.state);
        setOnboardingError(null);
      })
      .catch((err) => {
        setOnboarding(null);
        setOnboardingError((err as Error).message);
      });
  }, [user]);

  const totalItems = useMemo(() => {
    if (!data) return 0;
    return data.blocks.length + data.warnings.length + data.info.length;
  }, [data]);

  const baseSubtitle = user?.role ? `${user.role.toLowerCase()} focus` : "Your attention stack";
  const showTeamToggle = Boolean(data?.teamsEnabled && canSeeTeamsView);
  const subtitle = showTeamToggle
    ? viewMode === "teams"
      ? "Team focus"
      : "Company focus"
    : data?.teamsEnabled && data.scope === "team"
      ? "Your team focus"
      : baseSubtitle;
  const showSetup = onboarding?.status === "NOT_ACTIVATED";
  const completedSteps = new Set(onboarding?.completedSteps ?? []);
  const remainingSteps = SETUP_STEPS.filter((step) => !completedSteps.has(step.key));
  const setupPreview = remainingSteps.slice(0, 3);
  const isDispatcherRole = user?.role === "DISPATCHER" || user?.role === "HEAD_DISPATCHER";
  const teamTotals = useMemo(() => {
    const teams = data?.teamBreakdown ?? [];
    return teams
      .map((team) => {
        const total = WARNING_META.reduce((sum, warning) => sum + (team.warnings?.[warning.key] ?? 0), 0);
        return { ...team, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [data]);
  const visibleTeams = showAllTeams ? teamTotals : teamTotals.slice(0, 6);
  const totalTeams = teamTotals.length;
  const totalWarnings = teamTotals.reduce((sum, team) => sum + team.total, 0);

  const resolveItemHref = (item: TodayItem) => {
    if (!item.href) return null;
    if (isDispatcherRole) {
      if (item.href.startsWith("/trips")) {
        return item.entityType === "trip" && item.entityId
          ? `/dispatch?tab=trips&tripId=${item.entityId}`
          : "/dispatch?tab=trips";
      }
      if (item.entityType === "trip" && item.entityId) {
        return `/dispatch?tab=trips&tripId=${item.entityId}`;
      }
      if (item.entityType === "load" && item.entityId) {
        return `/dispatch?loadId=${item.entityId}`;
      }
      if (item.href.startsWith("/loads")) {
        return "/dispatch?tab=trips";
      }
    }
    return item.href;
  };

  const handleFixNow = async (item: TodayItem) => {
    if (item.ruleId) {
      apiFetch("/learning/attention-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId: item.ruleId,
          severity: item.severity,
          entityType: item.entityType ?? null,
          outcome: "FIXED",
        }),
      }).catch(() => null);
    }
    const href = resolveItemHref(item);
    if (href) {
      router.push(href);
    }
  };

  const fetchWarningDetails = async (params: { type: string; teamId?: string | null; cursor?: string | null; append?: boolean }) => {
    const query = new URLSearchParams();
    query.set("type", params.type);
    query.set("limit", "25");
    if (params.teamId) query.set("teamId", params.teamId);
    if (params.cursor) query.set("cursor", params.cursor);
    const payload = await apiFetch<WarningDetails>(`/today/warnings/details?${query.toString()}`);
    setDetailsData(payload);
    setDetailsNextCursor(payload.pageInfo?.nextCursor ?? null);
    if (params.append) {
      setDetailsLoads((prev) => [...prev, ...(payload.loads ?? [])]);
    } else {
      setDetailsLoads(payload.loads ?? []);
    }
  };

  const openWarningDetails = async (type: string, teamId?: string | null) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsError(null);
    setDetailsQuery({ type, teamId });
    try {
      await fetchWarningDetails({ type, teamId });
    } catch (err) {
      setDetailsError((err as Error).message);
    } finally {
      setDetailsLoading(false);
    }
  };

  const loadMoreDetails = async () => {
    if (!detailsQuery || !detailsNextCursor) return;
    setDetailsLoading(true);
    try {
      await fetchWarningDetails({
        type: detailsQuery.type,
        teamId: detailsQuery.teamId ?? null,
        cursor: detailsNextCursor,
        append: true,
      });
    } catch (err) {
      setDetailsError((err as Error).message);
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className={`rounded-[var(--radius-card)] border-0 px-6 py-4 ${GLOSSY_SURFACE}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">Today</div>
            <div className="text-xl font-semibold text-ink">Priority stack</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">{subtitle}</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {showTeamToggle ? (
              <SegmentedControl
                value={viewMode}
                options={[
                  { label: "Company", value: "company" },
                  { label: "Teams", value: "teams" },
                ]}
                onChange={(value) => setViewMode(value as "company" | "teams")}
              />
            ) : null}
            <Button variant="secondary" onClick={loadToday} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
      </div>

      <div className="border-t border-[color:var(--color-divider)]" />

      {error ? <ErrorBanner message={error} /> : null}

      {user?.role === "ADMIN" && onboardingError ? <ErrorBanner message={onboardingError} /> : null}

      {showSetup ? (
        <Card className="space-y-3 border border-[color:var(--color-divider)] bg-white/90">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Setup actions</div>
              <div className="text-lg font-semibold">Activate your workspace</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {onboarding?.percentComplete ?? 0}% complete · Finish setup to unlock full operations.
              </div>
            </div>
            <Button onClick={() => router.push("/onboarding")}>Finish setup</Button>
          </div>
          <div className="grid gap-2 text-sm text-[color:var(--color-text-muted)]">
            {setupPreview.length > 0 ? (
              setupPreview.map((step) => (
                <div key={step.key} className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2">
                  <span>{step.label}</span>
                  <Button size="sm" variant="secondary" onClick={() => router.push("/onboarding")}>
                    Continue
                  </Button>
                </div>
              ))
            ) : (
              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2">
                Review your setup and activate the workspace.
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {!loading && data && totalItems === 0 ? (
        <EmptyState title="All clear." description="No urgent actions detected right now." />
      ) : null}

      <div className="grid gap-7 lg:grid-cols-3">
        {SECTION_META.map((section) => {
          const items = data ? data[section.key] : [];
          const isWarnings = section.key === "warnings";
          const warningSubtitle = isWarnings && showTeamToggle ? (viewMode === "teams" ? "Team view" : "Company view") : section.subtitle;
          return (
            <div key={section.key} className="space-y-3">
              <SectionHeader title={section.label} subtitle={warningSubtitle} />
              {loading ? (
                <Card className={`min-h-[130px] border-0 p-4 text-sm text-[color:var(--color-text-muted)] ${GLOSSY_SURFACE}`}>
                  Loading…
                </Card>
              ) : isWarnings && showTeamToggle && viewMode === "teams" ? (
                teamTotals.length === 0 ? (
                  <Card className={`min-h-[130px] border-0 p-4 text-sm text-[color:var(--color-text-muted)] ${GLOSSY_SURFACE}`}>
                    Nothing here right now.
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {totalTeams} teams · {totalWarnings} warnings
                    </div>
                    <div className="space-y-2">
                      {visibleTeams.map((team) => (
                        <Card key={team.teamId} className={`space-y-3 border-0 p-4 ${GLOSSY_SURFACE}`}>
                          <div className="text-sm font-semibold">{team.teamName}</div>
                          <div className="flex flex-wrap gap-2">
                            {WARNING_META.map((warning) => {
                              const count = team.warnings?.[warning.key] ?? 0;
                              return (
                                <button
                                  key={warning.key}
                                  type="button"
                                  disabled={count === 0}
                                  className={`rounded-full border px-3 py-1 text-xs ${
                                    count === 0
                                      ? "border-[color:var(--color-divider)] text-[color:var(--color-text-muted)]"
                                      : "border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] text-ink"
                                  }`}
                                  onClick={() => openWarningDetails(warning.key, team.teamId)}
                                >
                                  {warning.label} · {count}
                                </button>
                              );
                            })}
                          </div>
                        </Card>
                      ))}
                    </div>
                    {totalTeams > 6 ? (
                      <Button variant="secondary" onClick={() => setShowAllTeams((prev) => !prev)}>
                        {showAllTeams ? "Show fewer teams" : "View all teams"}
                      </Button>
                    ) : null}
                  </div>
                )
              ) : items.length === 0 ? (
                <Card className={`min-h-[130px] border-0 p-4 text-sm text-[color:var(--color-text-muted)] ${GLOSSY_SURFACE}`}>
                  Nothing here right now.
                </Card>
              ) : (
                items.map((item, index) => (
                  <Card
                    key={`${item.title}-${index}`}
                    className={`min-h-[130px] space-y-2 p-4 ${TONE_CLASS[section.tone]} ${GLOSSY_SURFACE}`}
                  >
                    <div className="text-sm font-medium text-ink">{item.title}</div>
                    {item.detail ? <div className="text-xs text-[color:var(--color-text-muted)]">{item.detail}</div> : null}
                    {item.href ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (isWarnings && item.ruleId) {
                            openWarningDetails(item.ruleId);
                          } else {
                            handleFixNow(item);
                          }
                        }}
                      >
                        Fix now
                      </Button>
                    ) : null}
                  </Card>
                ))
              )}
            </div>
          );
        })}
      </div>
      {detailsOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-black/20"
            onClick={() => setDetailsOpen(false)}
            aria-label="Close details"
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-[var(--shadow-subtle)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Warnings</div>
                <div className="text-lg font-semibold">
                  {WARNING_META.find((warning) => warning.key === detailsData?.type)?.title ?? "Details"}
                </div>
                {detailsData?.team?.teamName ? (
                  <div className="text-xs text-[color:var(--color-text-muted)]">Team {detailsData.team.teamName}</div>
                ) : null}
              </div>
              <Button variant="secondary" onClick={() => setDetailsOpen(false)}>
                Close
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {detailsLoading ? (
                <Card className="text-sm text-[color:var(--color-text-muted)]">Loading details…</Card>
              ) : detailsError ? (
                <ErrorBanner message={detailsError} />
              ) : detailsLoads.length === 0 ? (
                <Card className="text-sm text-[color:var(--color-text-muted)]">No matching loads.</Card>
              ) : (
                detailsLoads.map((load) => (
                  <Card
                    key={load.id}
                    className="space-y-1 border border-[color:var(--color-divider)] pl-5 pr-4"
                  >
                    <div className="text-sm font-semibold">
                      {load.tripNumber ? `${load.tripNumber} · ` : ""}
                      {load.loadNumber ?? "Load"}
                    </div>
                    {load.customerName ? <div className="text-xs text-[color:var(--color-text-muted)]">{load.customerName}</div> : null}
                    <div className="text-xs text-[color:var(--color-text-muted)]">{load.warningReason}</div>
                    {load.stopSummary ? (
                      <div className="text-xs text-[color:var(--color-text-muted)]">{load.stopSummary}</div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-[color:var(--color-text-muted)]">
                      <span>{load.assignedDriverName ? `Driver ${load.assignedDriverName}` : "Unassigned driver"}</span>
                      {load.ageMinutes !== null && load.ageMinutes !== undefined ? (
                        <span>{load.ageMinutes} min</span>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        router.push(
                          isDispatcherRole
                            ? load.tripId
                              ? `/dispatch?tab=trips&tripId=${load.tripId}`
                              : `/dispatch?loadId=${load.id}`
                            : `/loads/${load.id}`
                        )
                      }
                    >
                      {isDispatcherRole ? (load.tripId ? "Open trip" : "Open load") : "Open load"}
                    </Button>
                  </Card>
                ))
              )}
              {detailsNextCursor ? (
                <Button variant="secondary" onClick={loadMoreDetails} disabled={detailsLoading}>
                  Load more
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TodayPage() {
  return (
    <AppShell title="Today" subtitle="Priority stack" hideHeader>
      <TodayContent />
    </AppShell>
  );
}

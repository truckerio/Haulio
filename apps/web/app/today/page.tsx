"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import {
  compactRelativeTime,
  filterActivityItems,
  roleDefaultDomain,
  selectActivityBucket,
  type ActivityDomain,
  type ActivityDomainFilter,
  type ActivitySeverity,
  type ActivitySummaryData,
  type ActivityTimeFilter,
} from "./activity-view";

type OnboardingState = {
  status?: "NOT_ACTIVATED" | "OPERATIONAL";
  percentComplete?: number;
};

const GLOSSY_SURFACE =
  "bg-[color:var(--color-surface-elevated)] shadow-[var(--shadow-surface-gloss)]";

const SEVERITY_BADGE: Record<ActivitySeverity, string> = {
  ALERT: "border-[color:var(--color-danger)] text-[color:var(--color-danger)]",
  IMPORTANT: "border-[color:var(--color-warning)] text-[color:var(--color-warning)]",
  INFO: "border-[color:var(--color-divider-strong)] text-[color:var(--color-text-muted)]",
};

const DOMAIN_LABEL: Record<ActivityDomain, string> = {
  DISPATCH: "Dispatch",
  BILLING: "Billing",
  SAFETY: "Safety",
  SYSTEM: "System",
};

const TIME_TABS: Array<{ key: ActivityTimeFilter; label: string }> = [
  { key: "now", label: "Now" },
  { key: "week", label: "This week" },
  { key: "history", label: "History" },
];

const DOMAIN_FILTERS: Array<{ key: ActivityDomainFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "dispatch", label: "Dispatch" },
  { key: "billing", label: "Billing" },
  { key: "safety", label: "Safety" },
];

const SEVERITY_FILTERS: Array<{ key: ActivitySeverity; label: string }> = [
  { key: "ALERT", label: "Alert" },
  { key: "IMPORTANT", label: "Important" },
  { key: "INFO", label: "Info" },
];

function countLabel(count?: number) {
  const value = count ?? 1;
  return `${value} item${value === 1 ? "" : "s"}`;
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">{label}</div>
      <div className="text-lg font-semibold text-ink">{value}</div>
    </Card>
  );
}

function ActivityContent() {
  const router = useRouter();
  const { user } = useUser();
  const [data, setData] = useState<ActivitySummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<ActivityTimeFilter>("now");
  const [domainFilter, setDomainFilter] = useState<ActivityDomainFilter>("all");
  const [search, setSearch] = useState("");
  const [severities, setSeverities] = useState<Set<ActivitySeverity>>(new Set(["ALERT", "IMPORTANT"]));

  const loadActivity = async () => {
    setLoading(true);
    try {
      const payload = await apiFetch<ActivitySummaryData>("/activity/summary");
      setData(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();
  }, []);

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

  useEffect(() => {
    if (domainFilter !== "all") return;
    if (data?.defaultDomain) {
      setDomainFilter(data.defaultDomain);
      return;
    }
    setDomainFilter(roleDefaultDomain(user?.role));
  }, [data?.defaultDomain, user?.role, domainFilter]);

  const bucketItems = useMemo(() => selectActivityBucket(data, timeFilter), [data, timeFilter]);
  const filteredItems = useMemo(
    () =>
      filterActivityItems({
        items: bucketItems,
        domain: domainFilter,
        severities,
        search,
      }),
    [bucketItems, domainFilter, severities, search]
  );

  const hasBlockers = useMemo(() => (data?.now ?? []).some((item) => item.severity === "ALERT"), [data?.now]);
  const showSetup = onboarding?.status === "NOT_ACTIVATED";

  const toggleSeverity = (severity: ActivitySeverity) => {
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) {
        next.delete(severity);
      } else {
        next.add(severity);
      }
      return next.size === 0 ? new Set(["ALERT"]) : next;
    });
  };

  const subtitle = user?.role ? `${user.role.toLowerCase()} focus` : "Role-aware action stack";

  const kpis = data?.kpis ?? {
    openAlerts: 0,
    openExceptions: 0,
    dueToday: 0,
    dueThisWeek: 0,
    missingPod: 0,
    unassignedLoads: 0,
    atRiskStops: 0,
  };

  return (
    <div className="w-full space-y-4">
      <div className={`rounded-[var(--radius-card)] border-0 px-4 py-3 ${GLOSSY_SURFACE}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">Activity</div>
            <div className="text-lg font-semibold text-ink">Priority stack</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">{subtitle}</div>
          </div>
          <Button size="sm" variant="secondary" onClick={loadActivity} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="border-t border-[color:var(--color-divider)]" />

      {error ? <ErrorBanner message={error} /> : null}
      {user?.role === "ADMIN" && onboardingError ? <ErrorBanner message={onboardingError} /> : null}

      {showSetup ? (
        <Card className="space-y-2 border border-[color:var(--color-divider)] bg-white/90 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Setup actions</div>
              <div className="text-base font-semibold">Activate your workspace</div>
              <div className="text-xs text-[color:var(--color-text-muted)]">
                {onboarding?.percentComplete ?? 0}% complete · Finish setup to unlock full operations.
              </div>
            </div>
            <Button size="sm" onClick={() => router.push("/onboarding")}>
              Finish setup
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Open alerts" value={kpis.openAlerts} />
        <KpiCard label="Open exceptions" value={kpis.openExceptions} />
        <KpiCard label="Due today" value={kpis.dueToday} />
        <KpiCard label="Due this week" value={kpis.dueThisWeek} />
        {user?.role === "BILLING" ? <KpiCard label="Missing POD" value={kpis.missingPod} /> : null}
        {user?.role === "DISPATCHER" || user?.role === "HEAD_DISPATCHER" ? (
          <>
            <KpiCard label="Unassigned loads" value={kpis.unassignedLoads} />
            <KpiCard label="At-risk stops" value={kpis.atRiskStops} />
          </>
        ) : null}
      </div>

      {!loading && (data?.now?.length ?? 0) > 0 && !hasBlockers ? (
        <Card className="border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
          No blocking issues right now.
        </Card>
      ) : null}

      <Card className="space-y-3 border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          {TIME_TABS.map((tab) => (
            <Button
              key={tab.key}
              size="sm"
              variant={timeFilter === tab.key ? "primary" : "secondary"}
              onClick={() => setTimeFilter(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search activity"
            className="h-9"
          />
          <div className="flex flex-wrap gap-1">
            {DOMAIN_FILTERS.map((option) => (
              <Button
                key={option.key}
                size="sm"
                variant={domainFilter === option.key ? "primary" : "secondary"}
                onClick={() => setDomainFilter(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {SEVERITY_FILTERS.map((option) => (
              <Button
                key={option.key}
                size="sm"
                variant={severities.has(option.key) ? "primary" : "secondary"}
                onClick={() => toggleSeverity(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {!loading && filteredItems.length === 0 ? (
        <EmptyState title="Nothing needs attention right now." description="No activity items match the current filters." />
      ) : null}

      {filteredItems.length > 0 ? (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <Card key={item.id} className={`border border-[color:var(--color-divider)] px-3 py-2.5 ${GLOSSY_SURFACE}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-ink">{item.title}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {countLabel(item.count)} · {compactRelativeTime(item.timestamp)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${SEVERITY_BADGE[item.severity]}`}
                    >
                      {item.severity}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]">
                      {DOMAIN_LABEL[item.domain]}
                    </span>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => router.push(item.cta.href)}>
                  {item.cta.label}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ActivityPage() {
  return (
    <AppShell title="Activity" subtitle="Role-aware action queue" hideHeader>
      <ActivityContent />
    </AppShell>
  );
}

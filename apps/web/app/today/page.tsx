"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
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
};

type OnboardingState = {
  status?: "NOT_ACTIVATED" | "OPERATIONAL";
  percentComplete?: number;
  completedSteps?: string[];
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

const TONE_CLASS: Record<(typeof SECTION_META)[number]["tone"], string> = {
  danger: "border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)]/30",
  warning: "border-[color:var(--color-warning-soft)] bg-[color:var(--color-warning-soft)]/30",
  info: "border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30",
};

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

  const subtitle = user?.role ? `${user.role.toLowerCase()} focus` : "Your attention stack";
  const showSetup = onboarding?.status === "NOT_ACTIVATED";
  const completedSteps = new Set(onboarding?.completedSteps ?? []);
  const remainingSteps = SETUP_STEPS.filter((step) => !completedSteps.has(step.key));
  const setupPreview = remainingSteps.slice(0, 3);

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
    if (item.href) {
      router.push(item.href);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Today</div>
          <div className="text-2xl font-semibold">Your priority stack</div>
          <div className="text-sm text-[color:var(--color-text-muted)]">{subtitle}</div>
        </div>
        <Button variant="secondary" onClick={loadToday} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

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

      <div className="grid gap-6 lg:grid-cols-3">
        {SECTION_META.map((section) => {
          const items = data ? data[section.key] : [];
          return (
            <div key={section.key} className="space-y-3">
              <SectionHeader title={section.label} subtitle={section.subtitle} />
              {loading ? (
                <Card className="text-sm text-[color:var(--color-text-muted)]">Loading…</Card>
              ) : items.length === 0 ? (
                <Card className="text-sm text-[color:var(--color-text-muted)]">Nothing here right now.</Card>
              ) : (
                items.map((item, index) => (
                  <Card key={`${item.title}-${index}`} className={`space-y-2 border ${TONE_CLASS[section.tone]}`}>
                    <div className="text-sm font-semibold">{item.title}</div>
                    {item.detail ? <div className="text-xs text-[color:var(--color-text-muted)]">{item.detail}</div> : null}
                    {item.href ? (
                      <Button size="sm" variant="secondary" onClick={() => handleFixNow(item)}>
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
    </div>
  );
}

export default function TodayPage() {
  return (
    <AppShell title="Today" subtitle="What needs attention right now">
      <TodayContent />
    </AppShell>
  );
}

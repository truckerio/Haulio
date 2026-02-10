"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { NoAccess } from "@/components/rbac/no-access";
import { apiFetch } from "@/lib/api";
import { useUser } from "@/components/auth/user-context";

type BillingLoad = {
  id: string;
  loadNumber: string;
  status: string;
  customerName?: string | null;
  stops?: any[];
  billingStatus: "BLOCKED" | "READY" | "INVOICED";
  billingBlockingReasons: string[];
};

const REASONS = {
  missingPod: "Missing POD",
  missingRateCon: "Missing Rate Confirmation",
  accessorialPending: "Accessorial pending resolution",
  accessorialProof: "Accessorial missing proof",
} as const;

const TABS = [
  { key: "READY", label: "Ready to Bill" },
  { key: "MISSING_POD", label: "Missing POD" },
  { key: "MISSING_RATECON", label: "Missing Rate Confirmation" },
  { key: "ACCESSORIAL", label: "Accessorial Issues" },
  { key: "OTHER", label: "Other Blocked" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const getTabKey = (load: BillingLoad): TabKey => {
  if (load.billingStatus === "READY") return "READY";
  if (load.billingStatus === "INVOICED") return "OTHER";
  const reasons = load.billingBlockingReasons ?? [];
  if (reasons.includes(REASONS.missingPod)) return "MISSING_POD";
  if (reasons.includes(REASONS.missingRateCon)) return "MISSING_RATECON";
  if (reasons.includes(REASONS.accessorialPending) || reasons.includes(REASONS.accessorialProof)) {
    return "ACCESSORIAL";
  }
  return "OTHER";
};

const getTone = (load: BillingLoad) => {
  if (load.billingStatus === "READY") return "success";
  return "warning";
};

const formatRoute = (stops: any[] | undefined) => {
  if (!stops || stops.length === 0) return "Route unavailable";
  const pickup = stops.find((stop) => stop.type === "PICKUP");
  const deliveryStops = stops.filter((stop) => stop.type === "DELIVERY");
  const delivery = deliveryStops.length ? deliveryStops[deliveryStops.length - 1] : null;
  if (!pickup || !delivery) return "Route unavailable";
  return `${pickup.city ?? "-"}, ${pickup.state ?? "-"} → ${delivery.city ?? "-"}, ${delivery.state ?? "-"}`;
};

export default function BillingReadinessPage() {
  return (
    <AppShell title="Billing Readiness" subtitle="POD, rate confirmation, accessorials, disputes">
      <BillingReadinessContent />
    </AppShell>
  );
}

function BillingReadinessContent() {
  const { user } = useUser();
  const canAccess = Boolean(user && ["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"].includes(user.role));
  const [loads, setLoads] = useState<BillingLoad[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("READY");

  useEffect(() => {
    if (!canAccess) return;
    apiFetch<{ loads: BillingLoad[] }>("/billing/readiness")
      .then((data) => {
        setLoads(data.loads ?? []);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  }, [canAccess]);

  const grouped = useMemo(() => {
    const groups: Record<TabKey, BillingLoad[]> = {
      READY: [],
      MISSING_POD: [],
      MISSING_RATECON: [],
      ACCESSORIAL: [],
      OTHER: [],
    };
    for (const load of loads) {
      const key = getTabKey(load);
      if (load.billingStatus === "INVOICED" && key === "OTHER") continue;
      groups[key].push(load);
    }
    return groups;
  }, [loads]);

  if (!canAccess) {
    return <NoAccess title="Billing readiness" />;
  }

  const activeLoads = grouped[activeTab] ?? [];

  return (
    <>
      {error ? <ErrorBanner message={error} /> : null}
      <Card className="space-y-4">
        <SectionHeader
          title="Readiness queue"
          subtitle="Focus on what is blocking billing"
          action={
            <SegmentedControl
              value={activeTab}
              options={TABS.map((tab) => ({
                label: `${tab.label} (${grouped[tab.key]?.length ?? 0})`,
                value: tab.key,
              }))}
              onChange={(value) => setActiveTab(value as TabKey)}
            />
          }
        />
        <div className="grid gap-3">
          {activeLoads.map((load) => (
            <Link
              key={load.id}
              href={`/loads/${load.id}?tab=billing`}
              className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3 transition hover:border-[color:var(--color-divider-strong)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                    {load.status}
                  </div>
                  <div className="text-lg font-semibold text-ink">{load.loadNumber}</div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">{load.customerName ?? "Customer"}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">{formatRoute(load.stops)}</div>
                </div>
                <StatusChip
                  label={load.billingStatus === "READY" ? "Ready" : load.billingBlockingReasons[0] ?? "Blocked"}
                  tone={getTone(load)}
                />
              </div>
            </Link>
          ))}
          {activeLoads.length === 0 ? <EmptyState title="No loads in this view." /> : null}
        </div>
      </Card>
    </>
  );
}

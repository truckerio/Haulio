"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, useAppShellActivity } from "@/components/app-shell";
import { useUser } from "@/components/auth/user-context";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FinanceWorkflowCockpit } from "@/components/finance/FinanceWorkflowCockpit";
import { FinanceSummaryRail } from "@/components/finance/FinanceSummaryRail";
import type { FinanceCommandLaneId } from "@/components/finance/FinanceCommandPanel";
import { FinanceSpreadsheetPanel } from "@/components/finance/FinanceSpreadsheetPanel";
import { ReceivablesPanel } from "@/components/finance/ReceivablesPanel";
import { FinanceDisputesPanel } from "@/components/finance/FinanceDisputesPanel";
import { FinanceCashApplicationPanel } from "@/components/finance/FinanceCashApplicationPanel";
import { PayablesPanel } from "@/components/finance/PayablesPanel";
import { FinanceVendorPayablesPanel } from "@/components/finance/FinanceVendorPayablesPanel";
import { FinanceFactoringPanel } from "@/components/finance/FinanceFactoringPanel";
import { FinanceJournalsPanel } from "@/components/finance/FinanceJournalsPanel";
import { FinanceSettingsPanel } from "@/components/finance/FinanceSettingsPanel";
import { FinanceContractsPanel } from "@/components/finance/FinanceContractsPanel";
import { getRoleLastWorkspaceStorageKey, getRoleNoAccessCta } from "@/lib/capabilities";

const TAB_OPTIONS = [
  { label: "Spreadsheet", value: "spreadsheet" },
  { label: "Receivables", value: "receivables" },
  { label: "Disputes", value: "disputes" },
  { label: "Cash App", value: "cash-app" },
  { label: "Factoring", value: "factoring" },
  { label: "Payables", value: "payables" },
  { label: "Vendor AP", value: "vendor-ap" },
  { label: "Contracts", value: "contracts" },
  { label: "Journals", value: "journals" },
  { label: "Settings", value: "settings" },
] as const;

type FinanceTab = (typeof TAB_OPTIONS)[number]["value"];

const COMMAND_LANE_VALUES: FinanceCommandLaneId[] = [
  "GENERATE_INVOICE",
  "RETRY_QBO_SYNC",
  "FOLLOW_UP_COLLECTION",
  "GENERATE_SETTLEMENT",
];

function FinanceHeaderCard() {
  const activity = useAppShellActivity();

  return (
    <Card className="!p-2.5 sm:!p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[20px] font-semibold text-ink">Finance</h2>
          <p className="text-xs text-[color:var(--color-text-muted)]">Spreadsheet-first command center for receivables and payables</p>
        </div>
        {activity?.canUseActivity ? (
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
        ) : null}
      </div>
    </Card>
  );
}

function FinanceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, capabilities } = useUser();
  const fallback = useMemo(() => getRoleNoAccessCta(user?.role), [user?.role]);

  const visibleTabOptions = useMemo(() => {
    return TAB_OPTIONS.filter((option) => {
      if (option.value === "payables" || option.value === "settings") {
        return capabilities.canBillActions;
      }
      if (option.value === "cash-app" || option.value === "vendor-ap" || option.value === "factoring") {
        return capabilities.canBillActions;
      }
      if (option.value === "journals") {
        return capabilities.canViewSettlementPreview;
      }
      return true;
    });
  }, [capabilities.canBillActions, capabilities.canViewSettlementPreview]);

  const rolePreferredTab = useMemo<FinanceTab>(() => {
    if (user?.role === "BILLING") return "receivables";
    if (user?.role === "DISPATCHER" || user?.role === "HEAD_DISPATCHER") return "receivables";
    if (user?.role === "ADMIN") return "receivables";
    return "receivables";
  }, [capabilities.canBillActions, user?.role]);

  const resumedFinanceTab = useMemo<FinanceTab | null>(() => {
    if (typeof window === "undefined") return null;
    const storageKey = getRoleLastWorkspaceStorageKey(user?.role);
    if (!storageKey) return null;
    const resumeTarget = window.localStorage.getItem(storageKey);
    if (!resumeTarget || !resumeTarget.startsWith("/finance")) return null;
    let resumedTab: string | null = null;
    try {
      resumedTab = new URL(resumeTarget, window.location.origin).searchParams.get("tab");
    } catch {
      resumedTab = null;
    }
    if (!resumedTab) return null;
    if (!visibleTabOptions.some((option) => option.value === resumedTab)) return null;
    return resumedTab as FinanceTab;
  }, [user?.role, visibleTabOptions]);

  const fallbackTab: FinanceTab = useMemo(() => {
    if (resumedFinanceTab && visibleTabOptions.some((option) => option.value === resumedFinanceTab)) {
      return resumedFinanceTab;
    }
    if (visibleTabOptions.some((option) => option.value === rolePreferredTab)) return rolePreferredTab;
    return (visibleTabOptions[0]?.value ?? "spreadsheet") as FinanceTab;
  }, [resumedFinanceTab, rolePreferredTab, visibleTabOptions]);

  const activeTab = useMemo<FinanceTab>(() => {
    const requested = (searchParams.get("tab") ?? fallbackTab) as string;
    const normalized = requested === "commands" ? "receivables" : requested;
    return visibleTabOptions.some((option) => option.value === normalized) ? (normalized as FinanceTab) : fallbackTab;
  }, [fallbackTab, searchParams, visibleTabOptions]);

  const commandLane = useMemo<FinanceCommandLaneId | null>(() => {
    const lane = searchParams.get("commandLane") ?? searchParams.get("lane");
    if (!lane) return null;
    return COMMAND_LANE_VALUES.includes(lane as FinanceCommandLaneId) ? (lane as FinanceCommandLaneId) : null;
  }, [searchParams]);

  const focusReadiness = searchParams.get("focus") === "readiness";
  const receivablesSearch = searchParams.get("search") ?? "";
  const payablesLoadId = searchParams.get("loadId");

  useEffect(() => {
    if (loading || capabilities.canAccessFinance) return;
    router.replace(fallback.href);
  }, [capabilities.canAccessFinance, fallback.href, loading, router]);

  useEffect(() => {
    if (loading || !capabilities.canAccessFinance) return;
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    const currentTab = searchParams.get("tab");
    if (!currentTab || !visibleTabOptions.some((option) => option.value === currentTab)) {
      if (currentTab === "commands") {
        params.set("tab", "receivables");
      } else {
        params.set("tab", fallbackTab);
      }
      changed = true;
    }
    const effectiveTab = (params.get("tab") ?? fallbackTab) as FinanceTab;
    if (effectiveTab !== "receivables" && params.has("focus")) {
      params.delete("focus");
      changed = true;
    }
    if (effectiveTab !== "receivables" && params.has("commandLane")) {
      params.delete("commandLane");
      changed = true;
    }
    if (effectiveTab !== "receivables" && params.has("lane")) {
      params.delete("lane");
      changed = true;
    }
    if (effectiveTab === "receivables" && params.has("lane") && !params.has("commandLane")) {
      params.set("commandLane", params.get("lane") ?? "");
      params.delete("lane");
      changed = true;
    }
    if (!changed) return;
    const query = params.toString();
    router.replace(query ? `/finance?${query}` : "/finance");
  }, [capabilities.canAccessFinance, fallbackTab, loading, router, searchParams, visibleTabOptions]);

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    if (value !== "receivables") {
      params.delete("focus");
      params.delete("commandLane");
    }
    router.replace(`/finance?${params.toString()}`);
  };

  if (loading) {
    return <Card className="text-sm text-[color:var(--color-text-muted)]">Checking access...</Card>;
  }

  if (!capabilities.canAccessFinance) {
    return <Card className="text-sm text-[color:var(--color-text-muted)]">Redirecting...</Card>;
  }

  return (
    <div className="space-y-3">
      <FinanceHeaderCard />
      <FinanceWorkflowCockpit />
      <SegmentedControl value={activeTab} options={visibleTabOptions as unknown as Array<{ label: string; value: string }>} onChange={handleTabChange} />
      {activeTab === "spreadsheet" ? (
        <>
          <FinanceSpreadsheetPanel />
          <FinanceSummaryRail />
        </>
      ) : null}
      {activeTab !== "spreadsheet" ? <FinanceSummaryRail /> : null}
      {activeTab === "receivables" ? (
        <ReceivablesPanel focusReadiness={focusReadiness} initialSearch={receivablesSearch} commandLane={commandLane} />
      ) : null}
      {activeTab === "disputes" ? <FinanceDisputesPanel /> : null}
      {activeTab === "cash-app" ? <FinanceCashApplicationPanel /> : null}
      {activeTab === "factoring" ? <FinanceFactoringPanel /> : null}
      {activeTab === "payables" ? <PayablesPanel focusLoadId={payablesLoadId} receivablesSearch={receivablesSearch} /> : null}
      {activeTab === "vendor-ap" ? <FinanceVendorPayablesPanel /> : null}
      {activeTab === "contracts" ? <FinanceContractsPanel /> : null}
      {activeTab === "journals" ? <FinanceJournalsPanel /> : null}
      {activeTab === "settings" ? <FinanceSettingsPanel /> : null}
    </div>
  );
}

export default function FinancePage() {
  return (
    <AppShell
      title="Finance"
      subtitle="Spreadsheet-first command center for receivables and payables"
      hideHeader
      hideTopActivityTrigger
    >
      <Suspense fallback={<div className="text-sm text-[color:var(--color-text-muted)]">Loading finance...</div>}>
        <FinanceContent />
      </Suspense>
    </AppShell>
  );
}

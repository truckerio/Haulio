"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, useAppShellActivity } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FinanceSummaryRail } from "@/components/finance/FinanceSummaryRail";
import { FinanceSpreadsheetPanel } from "@/components/finance/FinanceSpreadsheetPanel";
import { ReceivablesPanel } from "@/components/finance/ReceivablesPanel";
import { PayablesPanel } from "@/components/finance/PayablesPanel";
import { FinanceJournalsPanel } from "@/components/finance/FinanceJournalsPanel";
import { FinanceSettingsPanel } from "@/components/finance/FinanceSettingsPanel";

const TAB_OPTIONS = [
  { label: "Spreadsheet", value: "spreadsheet" },
  { label: "Receivables", value: "receivables" },
  { label: "Payables", value: "payables" },
  { label: "Journals", value: "journals" },
  { label: "Settings", value: "settings" },
];

export default function FinancePage() {
  return (
    <AppShell
      title="Finance"
      subtitle="Spreadsheet-first receivables and payables in one view"
      hideHeader
      hideTopActivityTrigger
    >
      <Suspense fallback={<div className="text-sm text-[color:var(--color-text-muted)]">Loading finance...</div>}>
        <FinanceContent />
      </Suspense>
    </AppShell>
  );
}

function FinanceHeaderCard() {
  const activity = useAppShellActivity();

  return (
    <Card className="!p-3 sm:!p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[21px] font-semibold text-ink">Finance</h2>
          <p className="text-sm text-[color:var(--color-text-muted)]">Spreadsheet-first receivables and payables in one view</p>
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
  const activeTab = useMemo(() => {
    const tab = searchParams.get("tab") ?? "spreadsheet";
    return TAB_OPTIONS.some((option) => option.value === tab) ? tab : "spreadsheet";
  }, [searchParams]);
  const focusReadiness = searchParams.get("focus") === "readiness";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    if (value !== "receivables") {
      params.delete("focus");
    }
    router.replace(`/finance?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <FinanceHeaderCard />
      <FinanceSummaryRail />
      <SegmentedControl value={activeTab} options={TAB_OPTIONS} onChange={handleTabChange} />
      {activeTab === "spreadsheet" ? <FinanceSpreadsheetPanel /> : null}
      {activeTab === "receivables" ? <ReceivablesPanel focusReadiness={focusReadiness} /> : null}
      {activeTab === "payables" ? <PayablesPanel /> : null}
      {activeTab === "journals" ? <FinanceJournalsPanel /> : null}
      {activeTab === "settings" ? <FinanceSettingsPanel /> : null}
    </div>
  );
}

"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ReceivablesPanel } from "@/components/finance/ReceivablesPanel";
import { PayablesPanel } from "@/components/finance/PayablesPanel";
import { FinanceSettingsPanel } from "@/components/finance/FinanceSettingsPanel";

const TAB_OPTIONS = [
  { label: "Receivables", value: "receivables" },
  { label: "Payables", value: "payables" },
  { label: "Settings", value: "settings" },
];

export default function FinancePage() {
  return (
    <AppShell title="Finance" subtitle="Receivables and payables in one view">
      <Suspense fallback={<div className="text-sm text-[color:var(--color-text-muted)]">Loading finance...</div>}>
        <FinanceContent />
      </Suspense>
    </AppShell>
  );
}

function FinanceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = useMemo(() => {
    const tab = searchParams.get("tab") ?? "receivables";
    return TAB_OPTIONS.some((option) => option.value === tab) ? tab : "receivables";
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
    <div className="space-y-6">
      <SegmentedControl value={activeTab} options={TAB_OPTIONS} onChange={handleTabChange} />
      {activeTab === "receivables" ? <ReceivablesPanel focusReadiness={focusReadiness} /> : null}
      {activeTab === "payables" ? <PayablesPanel /> : null}
      {activeTab === "settings" ? <FinanceSettingsPanel /> : null}
    </div>
  );
}

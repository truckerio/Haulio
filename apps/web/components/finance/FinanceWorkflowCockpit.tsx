"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";

type ReceivableWorkflowRow = {
  loadId: string;
  loadNumber: string;
  amountCents: number;
  billingStage: "DELIVERED" | "DOCS_REVIEW" | "READY" | "INVOICE_SENT" | "COLLECTED" | "SETTLED";
  readinessSnapshot: { isReady: boolean };
  integrations: {
    quickbooks: {
      syncStatus: "NOT_CONNECTED" | "NOT_SYNCED" | "SYNCING" | "SYNCED" | "FAILED";
    };
  };
  actions: {
    primaryAction: string;
    allowedActions: string[];
  };
};

type ReceivablesResponse = {
  items?: ReceivableWorkflowRow[];
  rows?: ReceivableWorkflowRow[];
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

export function FinanceWorkflowCockpit() {
  const router = useRouter();
  const { capabilities } = useUser();
  const canAccessFinance = capabilities.canAccessFinance;
  const canMutateFinance = capabilities.canBillActions;
  const [rows, setRows] = useState<ReceivableWorkflowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const loadRows = useCallback(async () => {
    if (!canAccessFinance) return;
    setLoading(true);
    try {
      const data = await apiFetch<ReceivablesResponse>("/finance/receivables?limit=250");
      setRows(data.items ?? data.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [canAccessFinance]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const stats = useMemo(() => {
    let docsReview = 0;
    let readyToInvoice = 0;
    let qboFailed = 0;
    let collections = 0;
    let settlementReady = 0;
    let readyAmountCents = 0;

    for (const row of rows) {
      if (row.billingStage === "DOCS_REVIEW") docsReview += 1;
      if (row.actions?.allowedActions?.includes("GENERATE_INVOICE")) {
        readyToInvoice += 1;
        readyAmountCents += Number(row.amountCents || 0);
      }
      if (row.integrations?.quickbooks?.syncStatus === "FAILED") qboFailed += 1;
      if (row.billingStage === "INVOICE_SENT") collections += 1;
      if (row.actions?.allowedActions?.includes("GENERATE_SETTLEMENT") || row.billingStage === "COLLECTED") {
        settlementReady += 1;
      }
    }

    return { docsReview, readyToInvoice, qboFailed, collections, settlementReady, readyAmountCents };
  }, [rows]);

  const openReceivables = useCallback((query: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    params.set("tab", "receivables");
    for (const [key, value] of Object.entries(query)) {
      if (!value) continue;
      params.set(key, value);
    }
    router.push(`/finance?${params.toString()}`);
  }, [router]);

  const runSearch = useCallback(() => {
    const token = search.trim();
    if (!token) {
      openReceivables({});
      return;
    }
    openReceivables({ search: token });
  }, [openReceivables, search]);

  if (!canAccessFinance) return null;

  return (
    <Card className="space-y-3 border-[color:var(--color-divider-strong)] bg-[linear-gradient(125deg,rgba(16,24,40,0.03),rgba(16,24,40,0.0))] !p-3 sm:!p-4">
      <SectionHeader
        title="Workflow cockpit"
        subtitle="One-command surface for docs blockers, invoicing, collections, and settlement handoff"
        action={
          <Button size="sm" variant="secondary" onClick={loadRows} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find by load #, customer, invoice #"
          onKeyDown={(event) => {
            if (event.key === "Enter") runSearch();
          }}
        />
        <Button onClick={runSearch}>Open queue</Button>
      </div>
      {rows.length === 0 && !loading ? <EmptyState title="No finance rows in scope." /> : null}
      {rows.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <button
            type="button"
            className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2 text-left hover:bg-[color:var(--color-bg-muted)]"
            onClick={() => openReceivables({ focus: "readiness", view: "urgent" })}
          >
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">Docs Review</div>
            <div className="mt-1 text-lg font-semibold text-ink">{stats.docsReview}</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Resolve POD/BOL/RateCon blockers</div>
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2 text-left hover:bg-[color:var(--color-bg-muted)]"
            onClick={() => openReceivables({ commandLane: "GENERATE_INVOICE" })}
          >
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">Invoice Ready</div>
            <div className="mt-1 text-lg font-semibold text-ink">{stats.readyToInvoice}</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">{formatCurrency(stats.readyAmountCents)} ready to bill</div>
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2 text-left hover:bg-[color:var(--color-bg-muted)]"
            onClick={() => openReceivables({ commandLane: "RETRY_QBO_SYNC" })}
          >
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">QBO Failed</div>
            <div className="mt-1 text-lg font-semibold text-ink">{stats.qboFailed}</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Retry accounting sync lane</div>
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2 text-left hover:bg-[color:var(--color-bg-muted)]"
            onClick={() => openReceivables({ commandLane: "FOLLOW_UP_COLLECTION" })}
          >
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">Collections</div>
            <div className="mt-1 text-lg font-semibold text-ink">{stats.collections}</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Invoice sent and awaiting cash</div>
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2 text-left hover:bg-[color:var(--color-bg-muted)]"
            onClick={() => router.push("/finance?tab=payables")}
          >
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">Settlement Ready</div>
            <div className="mt-1 text-lg font-semibold text-ink">{stats.settlementReady}</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Move from collected to payout</div>
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
        <StatusChip tone={canMutateFinance ? "success" : "warning"} label={canMutateFinance ? "Mutation mode" : "Read-only mode"} />
        {canMutateFinance
          ? "Billing/Admin can execute command lanes directly from receivables."
          : "Dispatch/Safety/Support can review blockers and handoff state without finance mutations."}
      </div>
    </Card>
  );
}

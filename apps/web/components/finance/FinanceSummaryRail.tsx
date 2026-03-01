"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/date-time";
import { isForbiddenError } from "@/lib/capabilities";

type WalletRow = {
  account: string;
  debitCents: number;
  creditCents: number;
  netCents: number;
};

type WalletResponse = {
  orgId: string;
  asOf: string;
  totals: {
    debitCents: number;
    creditCents: number;
    netCents: number;
  };
  balances: WalletRow[];
};

type JournalEntry = {
  id: string;
  entityType: "PAYABLE_RUN" | "SETTLEMENT";
  entityId: string;
  eventType: "PAYABLE_RUN_PAID" | "SETTLEMENT_PAID";
  idempotencyKey: string;
  totalDebitCents: number;
  totalCreditCents: number;
  createdAt: string;
  lines: Array<{ account: string; side: "DEBIT" | "CREDIT"; amountCents: number }>;
};

type JournalsResponse = {
  orgId: string;
  entries: JournalEntry[];
};

type SummaryState = {
  wallets: WalletResponse | null;
  journals: JournalEntry[];
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function entryAmountCents(entry: JournalEntry) {
  return Number(entry.totalDebitCents || 0);
}

export function FinanceSummaryRail() {
  const { capabilities } = useUser();
  const canAccess = capabilities.canViewSettlementPreview;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restrictedBy403, setRestrictedBy403] = useState(false);
  const [state, setState] = useState<SummaryState>({ wallets: null, journals: [] });

  const loadSummary = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const [wallets, journalsResponse] = await Promise.all([
        apiFetch<WalletResponse>("/finance/wallets"),
        apiFetch<JournalsResponse>("/finance/journals?limit=40"),
      ]);
      setState({ wallets, journals: journalsResponse.entries ?? [] });
      setError(null);
      setRestrictedBy403(false);
    } catch (err) {
      if (isForbiddenError(err)) {
        setRestrictedBy403(true);
        setError(null);
        setState({ wallets: null, journals: [] });
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const walletByAccount = useMemo(() => {
    return new Map((state.wallets?.balances ?? []).map((row) => [row.account, row]));
  }, [state.wallets?.balances]);

  const latestPayouts = useMemo(() => (state.journals ?? []).slice(0, 5), [state.journals]);

  const health = useMemo(() => {
    const journals = state.journals ?? [];
    let unbalanced = 0;
    let incompleteLines = 0;
    const idempotencyCounts = new Map<string, number>();
    for (const entry of journals) {
      if (Number(entry.totalDebitCents || 0) !== Number(entry.totalCreditCents || 0)) {
        unbalanced += 1;
      }
      if (!entry.lines || entry.lines.length < 2) {
        incompleteLines += 1;
      }
      idempotencyCounts.set(entry.idempotencyKey, (idempotencyCounts.get(entry.idempotencyKey) ?? 0) + 1);
    }
    const duplicateIdempotency = Array.from(idempotencyCounts.values()).filter((count) => count > 1).length;
    return {
      unbalanced,
      incompleteLines,
      duplicateIdempotency,
      total: journals.length,
      hasFlags: unbalanced > 0 || incompleteLines > 0 || duplicateIdempotency > 0,
    };
  }, [state.journals]);

  if (!canAccess || restrictedBy403) {
    return (
      <Card className="space-y-3">
        <SectionHeader title="Finance summary" subtitle="Wallets, payouts, and journal health" />
        <div className="flex items-center gap-2">
          <StatusChip tone="warning" label="Restricted" />
          <span className="text-sm text-[color:var(--color-text-muted)]">Restricted: you do not have access to finance summary signals.</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorBanner message={error} /> : null}
      <SectionHeader
        title="Finance summary rail"
        subtitle="Read-only wallet state, payout stream, and ledger health"
        action={
          <Button size="sm" variant="secondary" onClick={loadSummary} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />
      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Wallet snapshot</div>
          {loading && !state.wallets ? <EmptyState title="Loading wallets..." /> : null}
          {!loading && !state.wallets ? <EmptyState title="No wallet data available." /> : null}
          {state.wallets ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--color-text-muted)]">Driver payable</span>
                <span className="font-semibold text-ink">{formatMoney(walletByAccount.get("DRIVER_PAYABLE")?.netCents ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--color-text-muted)]">Cash clearing</span>
                <span className="font-semibold text-ink">{formatMoney(walletByAccount.get("CASH_CLEARING")?.netCents ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[color:var(--color-divider)] pt-2">
                <span className="text-[color:var(--color-text-muted)]">Ledger net</span>
                <span className="font-semibold text-ink">{formatMoney(state.wallets.totals.netCents ?? 0)}</span>
              </div>
              <div className="text-xs text-[color:var(--color-text-muted)]">As of {formatDateTime(state.wallets.asOf)}</div>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Latest payouts</div>
          {loading && latestPayouts.length === 0 ? <EmptyState title="Loading payout events..." /> : null}
          {!loading && latestPayouts.length === 0 ? <EmptyState title="No payout events yet." /> : null}
          {latestPayouts.length > 0 ? (
            <div className="space-y-2">
              {latestPayouts.map((entry) => (
                <div key={entry.id} className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <StatusChip tone={entry.eventType === "SETTLEMENT_PAID" ? "info" : "success"} label={entry.eventType === "SETTLEMENT_PAID" ? "Settlement paid" : "Payable paid"} />
                    <span className="font-semibold text-ink">{formatMoney(entryAmountCents(entry))}</span>
                  </div>
                  <div className="mt-1 text-[color:var(--color-text-muted)]">
                    {entry.entityType} · {entry.entityId}
                  </div>
                  <div className="text-[color:var(--color-text-muted)]">{formatDateTime(entry.createdAt)}</div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Journal health flags</div>
          <div className="flex items-center gap-2">
            <StatusChip tone={health.hasFlags ? "warning" : "success"} label={health.hasFlags ? "Needs review" : "Healthy"} />
            <span className="text-xs text-[color:var(--color-text-muted)]">{health.total} entries checked</span>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[color:var(--color-text-muted)]">Unbalanced totals</span>
              <span className="font-semibold text-ink">{health.unbalanced}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[color:var(--color-text-muted)]">Incomplete line sets</span>
              <span className="font-semibold text-ink">{health.incompleteLines}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[color:var(--color-text-muted)]">Duplicate idempotency keys</span>
              <span className="font-semibold text-ink">{health.duplicateIdempotency}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

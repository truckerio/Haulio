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

type SummaryPartialState = {
  walletsError: string | null;
  journalsError: string | null;
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
  const [partialState, setPartialState] = useState<SummaryPartialState>({ walletsError: null, journalsError: null });
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const [walletsResult, journalsResult] = await Promise.allSettled([
        apiFetch<WalletResponse>("/finance/wallets"),
        apiFetch<JournalsResponse>("/finance/journals?limit=40"),
      ]);
      const nextState: SummaryState = { wallets: null, journals: [] };
      const nextPartial: SummaryPartialState = { walletsError: null, journalsError: null };

      if (walletsResult.status === "fulfilled") {
        nextState.wallets = walletsResult.value;
      } else if (isForbiddenError(walletsResult.reason)) {
        setRestrictedBy403(true);
        setError(null);
        setState({ wallets: null, journals: [] });
        setPartialState({ walletsError: null, journalsError: null });
        return;
      } else {
        nextPartial.walletsError = (walletsResult.reason as Error)?.message ?? "Unable to load wallet snapshot.";
      }

      if (journalsResult.status === "fulfilled") {
        nextState.journals = journalsResult.value.entries ?? [];
      } else if (isForbiddenError(journalsResult.reason)) {
        setRestrictedBy403(true);
        setError(null);
        setState({ wallets: null, journals: [] });
        setPartialState({ walletsError: null, journalsError: null });
        return;
      } else {
        nextPartial.journalsError = (journalsResult.reason as Error)?.message ?? "Unable to load journal stream.";
      }

      setRestrictedBy403(false);
      setState(nextState);
      setPartialState(nextPartial);
      setLastRefreshedAt(new Date().toISOString());
      if (nextPartial.walletsError && nextPartial.journalsError) {
        setError("Unable to load finance summary data right now.");
      } else {
        setError(null);
      }
    } catch (err) {
      if (isForbiddenError(err)) {
        setRestrictedBy403(true);
        setError(null);
        setState({ wallets: null, journals: [] });
        setPartialState({ walletsError: null, journalsError: null });
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [canAccess]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const walletByAccount = useMemo(() => {
    return new Map((state.wallets?.balances ?? []).map((row) => [row.account, row]));
  }, [state.wallets?.balances]);

  const latestPayouts = useMemo(() => (state.journals ?? []).slice(0, 3), [state.journals]);

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
  const hasPartialFailure = Boolean(partialState.walletsError || partialState.journalsError);
  const hasHardFailure = Boolean(error && !hasPartialFailure);

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
    <div className="space-y-1.5">
      {hasHardFailure ? <ErrorBanner message={error ?? "Unable to load finance summary data right now."} /> : null}
      {hasPartialFailure ? (
        <div className="rounded-[var(--radius-control)] border border-[color:var(--color-warning)]/45 bg-[color:var(--color-warning)]/10 px-3 py-2 text-xs text-[color:var(--color-warning)]">
          Partial sync warning:
          {partialState.walletsError ? ` wallets (${partialState.walletsError})` : ""}
          {partialState.walletsError && partialState.journalsError ? " ·" : ""}
          {partialState.journalsError ? ` journals (${partialState.journalsError})` : ""}
        </div>
      ) : null}
      <SectionHeader
        title="Finance summary rail"
        subtitle="Read-only wallet, payout stream, and ledger health"
        action={
          <Button size="sm" variant="secondary" onClick={loadSummary} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />
      <div className="text-[11px] text-[color:var(--color-text-muted)]">
        {lastRefreshedAt ? `Last refresh ${formatDateTime(lastRefreshedAt)}` : loadedOnce ? "Not refreshed yet" : "Loading summary..."}
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        <Card className="space-y-1.5 !p-2.5 sm:!p-3 min-h-[180px]">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Wallet snapshot</div>
          {loading && !state.wallets ? <EmptyState title="Loading wallets..." /> : null}
          {!loading && !state.wallets ? <EmptyState title="No wallet data available." /> : null}
          {state.wallets ? (
            <div className="space-y-1.5 text-sm">
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
              <div className="text-[11px] text-[color:var(--color-text-muted)]">As of {formatDateTime(state.wallets.asOf)}</div>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-1.5 !p-2.5 sm:!p-3 min-h-[180px]">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Latest payouts</div>
          {loading && latestPayouts.length === 0 ? <EmptyState title="Loading payout events..." /> : null}
          {!loading && latestPayouts.length === 0 ? <EmptyState title="No payout events yet." /> : null}
          {latestPayouts.length > 0 ? (
            <div className="space-y-1.5">
              {latestPayouts.map((entry) => (
                <div key={entry.id} className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 text-xs">
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

        <Card className="space-y-1.5 !p-2.5 sm:!p-3 min-h-[180px]">
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

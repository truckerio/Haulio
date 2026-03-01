"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { NoAccess } from "@/components/rbac/no-access";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/date-time";
import { isForbiddenError } from "@/lib/capabilities";

type JournalLine = {
  account: string;
  side: "DEBIT" | "CREDIT";
  amountCents: number;
  memo: string | null;
  createdAt: string;
};

type JournalEntry = {
  id: string;
  entityType: "PAYABLE_RUN" | "SETTLEMENT";
  entityId: string;
  eventType: "PAYABLE_RUN_PAID" | "SETTLEMENT_PAID";
  idempotencyKey: string;
  adapter: string | null;
  externalPayoutId: string | null;
  externalPayoutReference: string | null;
  totalDebitCents: number;
  totalCreditCents: number;
  currency: string;
  metadata: unknown;
  createdAt: string;
  createdBy: { id: string; name?: string | null; email?: string | null } | null;
  lines: JournalLine[];
};

type JournalsResponse = {
  orgId: string;
  filters: {
    entityType: string | null;
    eventType: string | null;
    entityId: string | null;
    limit: number;
  };
  entries: JournalEntry[];
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function entryTone(eventType: JournalEntry["eventType"]) {
  if (eventType === "SETTLEMENT_PAID") return "info" as const;
  return "success" as const;
}

export function FinanceJournalsPanel() {
  const { capabilities } = useUser();
  const canAccess = capabilities.canViewSettlementPreview;
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restrictedBy403, setRestrictedBy403] = useState(false);
  const [entityType, setEntityType] = useState("");
  const [eventType, setEventType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [limit, setLimit] = useState("50");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    const parsedLimit = Number(limit);
    const nextLimit = Number.isFinite(parsedLimit) ? Math.min(Math.max(Math.floor(parsedLimit), 1), 200) : 50;
    params.set("limit", String(nextLimit));
    if (entityType) params.set("entityType", entityType);
    if (eventType) params.set("eventType", eventType);
    if (entityId.trim()) params.set("entityId", entityId.trim());
    return params.toString();
  }, [entityId, entityType, eventType, limit]);

  const loadEntries = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const data = await apiFetch<JournalsResponse>(`/finance/journals?${query}`);
      setEntries(data.entries ?? []);
      setError(null);
      setRestrictedBy403(false);
    } catch (err) {
      if (isForbiddenError(err)) {
        setRestrictedBy403(true);
        setEntries([]);
        setError(null);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [canAccess, query]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  if (!canAccess || restrictedBy403) {
    return (
      <Card className="space-y-3">
        <SectionHeader title="Journals" subtitle="Immutable payout ledger stream" />
        <div className="flex items-center gap-2">
          <StatusChip tone="warning" label="Restricted" />
          <span className="text-sm text-[color:var(--color-text-muted)]">You do not have access to finance journals.</span>
        </div>
        {!canAccess ? <NoAccess title="Finance journals" description="This view is restricted by role capability." ctaHref="/finance" ctaLabel="Open Finance" /> : null}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner message={error} /> : null}
      <Card className="space-y-3">
        <SectionHeader
          title="Journal filters"
          subtitle="Read-only immutable finance entries"
          action={
            <Button variant="secondary" size="sm" onClick={loadEntries} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">Entity type</div>
            <Select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="">All</option>
              <option value="PAYABLE_RUN">Payable run</option>
              <option value="SETTLEMENT">Settlement</option>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">Event type</div>
            <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">All</option>
              <option value="PAYABLE_RUN_PAID">Payable run paid</option>
              <option value="SETTLEMENT_PAID">Settlement paid</option>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">Entity ID</div>
            <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="Optional entity id" />
          </div>
          <div>
            <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">Limit</div>
            <Input type="number" min={1} max={200} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <SectionHeader title="Journal stream" subtitle="Newest first with line-level details" />
        {loading ? <EmptyState title="Loading journals..." /> : null}
        {!loading && entries.length === 0 ? <EmptyState title="No journal entries found." /> : null}
        {!loading && entries.length > 0 ? (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusChip tone={entryTone(entry.eventType)} label={entry.eventType.replaceAll("_", " ")} />
                    <span className="text-sm font-semibold text-ink">{entry.entityType.replaceAll("_", " ")} · {entry.entityId}</span>
                  </div>
                  <span className="text-xs text-[color:var(--color-text-muted)]">{formatDateTime(entry.createdAt)}</span>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-[color:var(--color-text-muted)] md:grid-cols-3">
                  <div>Idempotency: <span className="font-mono">{entry.idempotencyKey}</span></div>
                  <div>Total debit: <span className="font-semibold text-ink">{formatMoney(entry.totalDebitCents)}</span></div>
                  <div>Total credit: <span className="font-semibold text-ink">{formatMoney(entry.totalCreditCents)}</span></div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-[color:var(--color-text-muted)]">
                      <tr>
                        <th className="px-2 py-1">Account</th>
                        <th className="px-2 py-1">Side</th>
                        <th className="px-2 py-1">Amount</th>
                        <th className="px-2 py-1">Memo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.lines.map((line, index) => (
                        <tr key={`${entry.id}-${index}`} className="border-t border-[color:var(--color-divider)]">
                          <td className="px-2 py-1 font-mono">{line.account}</td>
                          <td className="px-2 py-1">{line.side}</td>
                          <td className="px-2 py-1">{formatMoney(line.amountCents)}</td>
                          <td className="px-2 py-1 text-[color:var(--color-text-muted)]">{line.memo ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

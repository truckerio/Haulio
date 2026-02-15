"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { NoAccess } from "@/components/rbac/no-access";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";

type FinanceReceivableRow = {
  loadId: string;
  loadNumber: string;
  customer: string | null;
  billTo: string | null;
  amountCents: number;
  deliveredAt: string | null;
  billingStage: "DELIVERED" | "DOCS_REVIEW" | "READY" | "INVOICE_SENT" | "COLLECTED" | "SETTLED";
  readinessSnapshot: {
    isReady: boolean;
    blockers: Array<{ code: string; severity: "error" | "warning"; message: string; meta: Record<string, unknown> }>;
    computedAt: string;
    version: number;
  };
  invoice: {
    invoiceId: string | null;
    invoiceNumber: string | null;
    invoiceSentAt: string | null;
    dueDate: string | null;
  };
  collections: {
    daysOutstanding: number | null;
    agingBucket: "0_30" | "31_60" | "61_90" | "90_plus" | "unknown";
  };
  integrations: {
    quickbooks: {
      syncStatus: "NOT_CONNECTED" | "NOT_SYNCED" | "SYNCING" | "SYNCED" | "FAILED";
      qboInvoiceId: string | null;
      lastError: string | null;
      syncedAt: string | null;
    };
  };
  factoring: {
    lastSubmission: {
      id: string;
      status: "SENT" | "FAILED";
      toEmail: string;
      createdAt: string;
      errorMessage: string | null;
      attachmentMode: string;
    } | null;
  };
  actions: {
    primaryAction: string;
    allowedActions: string[];
  };
};

type ReceivablesResponse = {
  items?: FinanceReceivableRow[];
  rows?: FinanceReceivableRow[];
  nextCursor?: string | null;
  summaryCounters?: {
    total: number;
    ready: number;
    blocked: number;
  };
  pageInfo?: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

const SAVED_VIEWS = [
  { key: "urgent", label: "Urgent", stage: "DOCS_REVIEW,READY", readiness: "BLOCKED" },
  { key: "today", label: "Today", stage: "READY,INVOICE_SENT", readiness: "" },
  { key: "week", label: "This Week", stage: "DOCS_REVIEW,READY,INVOICE_SENT", readiness: "" },
  { key: "waiting", label: "Waiting", stage: "DOCS_REVIEW,INVOICE_SENT", readiness: "" },
  { key: "done", label: "Done", stage: "COLLECTED,SETTLED", readiness: "" },
] as const;

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function stageTone(stage: FinanceReceivableRow["billingStage"]) {
  if (stage === "READY" || stage === "COLLECTED" || stage === "SETTLED") return "success" as const;
  if (stage === "INVOICE_SENT") return "info" as const;
  if (stage === "DOCS_REVIEW") return "warning" as const;
  return "neutral" as const;
}

function stageLabel(stage: FinanceReceivableRow["billingStage"]) {
  if (stage === "DOCS_REVIEW") return "Docs review";
  if (stage === "INVOICE_SENT") return "Invoice sent";
  return stage.replace("_", " ");
}

function syncTone(sync: FinanceReceivableRow["integrations"]["quickbooks"]["syncStatus"]) {
  if (sync === "SYNCED") return "success" as const;
  if (sync === "FAILED") return "danger" as const;
  if (sync === "SYNCING") return "warning" as const;
  if (sync === "NOT_CONNECTED") return "neutral" as const;
  return "info" as const;
}

function actionLabel(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((token) => token.slice(0, 1).toUpperCase() + token.slice(1))
    .join(" ");
}

export function ReceivablesPanel({ focusReadiness: _focusReadiness = false }: { focusReadiness?: boolean }) {
  const { user, loading } = useUser();
  const canAccess = Boolean(user && ["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"].includes(user.role));

  const [rows, setRows] = useState<FinanceReceivableRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [view, setView] = useState<(typeof SAVED_VIEWS)[number]["key"]>("urgent");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [blockerCode, setBlockerCode] = useState("");
  const [agingBucket, setAgingBucket] = useState("");
  const [qboSyncStatus, setQboSyncStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedView = useMemo(() => SAVED_VIEWS.find((item) => item.key === view) ?? SAVED_VIEWS[0], [view]);

  const fetchRows = useCallback(
    async ({ append, cursor }: { append: boolean; cursor?: string | null }) => {
      setLoadingRows(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "50");
        params.set("stage", selectedView.stage);
        if (selectedView.readiness) {
          params.set("readiness", selectedView.readiness);
        }
        if (appliedSearch) {
          params.set("search", appliedSearch);
        }
        if (blockerCode) params.set("blockerCode", blockerCode);
        if (agingBucket) params.set("agingBucket", agingBucket);
        if (qboSyncStatus) params.set("qboSyncStatus", qboSyncStatus);
        if (append && cursor) {
          params.set("cursor", cursor);
        }
        const data = await apiFetch<ReceivablesResponse>(`/finance/receivables?${params.toString()}`);
        const nextItems = data.items ?? data.rows ?? [];
        const nextCursorValue = data.nextCursor ?? data.pageInfo?.nextCursor ?? null;
        setRows((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setNextCursor(nextCursorValue);
        setHasMore(Boolean(nextCursorValue));
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoadingRows(false);
      }
    },
    [agingBucket, appliedSearch, blockerCode, qboSyncStatus, selectedView.readiness, selectedView.stage]
  );

  useEffect(() => {
    setSelectedId(null);
    setNextCursor(null);
    fetchRows({ append: false });
  }, [fetchRows, view]);

  const selected = useMemo(() => rows.find((row) => row.loadId === selectedId) ?? null, [rows, selectedId]);

  const runAction = useCallback(
    async (row: FinanceReceivableRow, action: string) => {
      setActionError(null);
      setActionNote(null);
      setRunningActionId(`${row.loadId}:${action}`);
      try {
        if (action === "OPEN_INVOICE" || action === "VIEW_INVOICE") {
          if (row.invoice.invoiceId) {
            window.open(`${API_BASE}/invoices/${row.invoice.invoiceId}/pdf`, "_blank", "noopener,noreferrer");
            return;
          }
          window.location.href = `/loads/${row.loadId}?tab=billing`;
          return;
        }
        if (action === "OPEN_LOAD") {
          window.location.href = `/loads/${row.loadId}`;
          return;
        }
        if (action === "UPLOAD_DOCS") {
          window.location.href = `/loads/${row.loadId}?tab=documents`;
          return;
        }
        if (action === "SEND_TO_FACTORING") {
          await apiFetch(`/billing/loads/${row.loadId}/send-to-factoring`, { method: "POST" });
          setActionNote(`Factoring packet submitted for ${row.loadNumber}.`);
          await fetchRows({ append: false });
          return;
        }
        if (action === "GENERATE_INVOICE") {
          await apiFetch(`/billing/invoices/${row.loadId}/generate`, { method: "POST" });
          setActionNote(`Invoice generation started for ${row.loadNumber}.`);
          await fetchRows({ append: false });
          return;
        }
        window.location.href = `/loads/${row.loadId}?tab=billing`;
      } catch (err) {
        setActionError((err as Error).message);
      } finally {
        setRunningActionId(null);
      }
    },
    [fetchRows]
  );

  if (loading) {
    return <EmptyState title="Checking access..." />;
  }

  if (!canAccess) {
    return <NoAccess title="Receivables" />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_360px]">
      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {actionNote ? (
        <div className="lg:col-span-3 rounded-[var(--radius-card)] border border-[color:var(--color-success)] bg-[color:var(--color-success-soft)] px-3 py-2 text-sm text-[color:var(--color-success)]">
          {actionNote}
        </div>
      ) : null}

      <Card className="space-y-3">
        <SectionHeader title="Saved views" subtitle="Server-side filters" />
        <div className="grid gap-2">
          {SAVED_VIEWS.map((item) => (
            <Button
              key={item.key}
              variant={view === item.key ? "primary" : "secondary"}
              className="justify-start"
              onClick={() => setView(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Search</div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Load #, customer"
            onKeyDown={(event) => {
              if (event.key === "Enter") setAppliedSearch(search.trim());
            }}
          />
          <Button variant="secondary" onClick={() => setAppliedSearch(search.trim())}>
            Apply
          </Button>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Filters</div>
          <Select value={blockerCode} onChange={(e) => setBlockerCode(e.target.value)}>
            <option value="">All blockers</option>
            <option value="POD_MISSING">POD missing</option>
            <option value="BOL_MISSING">BOL missing</option>
            <option value="RATECON_MISSING">RateCon missing</option>
            <option value="ACCESSORIAL_PROOF_MISSING">Accessorial proof missing</option>
          </Select>
          <Select value={agingBucket} onChange={(e) => setAgingBucket(e.target.value)}>
            <option value="">All aging</option>
            <option value="0_30">0-30 days</option>
            <option value="31_60">31-60 days</option>
            <option value="61_90">61-90 days</option>
            <option value="90_plus">90+ days</option>
            <option value="unknown">Unknown</option>
          </Select>
          <Select value={qboSyncStatus} onChange={(e) => setQboSyncStatus(e.target.value)}>
            <option value="">All QBO sync</option>
            <option value="NOT_CONNECTED">Not connected</option>
            <option value="NOT_SYNCED">Not synced</option>
            <option value="SYNCED">Synced</option>
            <option value="FAILED">Failed</option>
          </Select>
        </div>
      </Card>

      <Card className="space-y-3 overflow-hidden">
        <SectionHeader title="Receivables board" subtitle="Canonical billing workspace" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-divider)] text-left text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
                <th className="px-3 py-2">Load</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Readiness</th>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Aging</th>
                <th className="px-3 py-2">QBO</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.loadId}
                  className={`cursor-pointer border-b border-[color:var(--color-divider)] transition hover:bg-[color:var(--color-surface-muted)] ${
                    selectedId === row.loadId ? "bg-[color:var(--color-surface-muted)]" : ""
                  }`}
                  onClick={() => setSelectedId(row.loadId)}
                >
                  <td className="px-3 py-3">
                    <div className="font-semibold text-ink">{row.loadNumber}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">Delivered {formatDate(row.deliveredAt)}</div>
                  </td>
                  <td className="px-3 py-3">{row.customer ?? "-"}</td>
                  <td className="px-3 py-3">{formatCurrency(row.amountCents)}</td>
                  <td className="px-3 py-3">
                    <StatusChip tone={stageTone(row.billingStage)} label={stageLabel(row.billingStage)} />
                  </td>
                  <td className="px-3 py-3">
                    {row.readinessSnapshot.isReady ? (
                      <StatusChip tone="success" label="Ready" />
                    ) : (
                      <StatusChip tone="warning" label={`${row.readinessSnapshot.blockers.length} blocker(s)`} />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {row.invoice.invoiceNumber ? (
                      <div>
                        <div>{row.invoice.invoiceNumber}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">Sent {formatDate(row.invoice.invoiceSentAt)}</div>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-3">{row.collections.agingBucket === "unknown" ? "-" : row.collections.agingBucket}</td>
                  <td className="px-3 py-3">
                    <StatusChip tone={syncTone(row.integrations.quickbooks.syncStatus)} label={row.integrations.quickbooks.syncStatus} />
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={runningActionId === `${row.loadId}:${row.actions.primaryAction}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        runAction(row, row.actions.primaryAction);
                      }}
                    >
                      {actionLabel(row.actions.primaryAction)}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loadingRows && rows.length === 0 ? <EmptyState title="No receivables in this view." /> : null}
        </div>
        {hasMore ? (
          <div className="px-3 pb-3">
            <Button variant="secondary" onClick={() => fetchRows({ append: true, cursor: nextCursor })} disabled={loadingRows}>
              {loadingRows ? "Loading..." : "Load more"}
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <SectionHeader title="Details" subtitle={selected ? selected.loadNumber : "Select a receivable"} />
        {!selected ? <EmptyState title="Pick a row to inspect blockers and actions." /> : null}
        {selected ? (
          <>
            <div className="space-y-1 text-sm text-[color:var(--color-text-muted)]">
              <div>Customer: {selected.customer ?? "-"}</div>
              <div>Amount: {formatCurrency(selected.amountCents)}</div>
              <div>Stage: {stageLabel(selected.billingStage)}</div>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Readiness blockers</div>
              {selected.readinessSnapshot.blockers.length === 0 ? (
                <StatusChip tone="success" label="No blockers" />
              ) : (
                <div className="grid gap-2">
                  {selected.readinessSnapshot.blockers.map((blocker) => (
                    <div
                      key={`${selected.loadId}-${blocker.code}-${blocker.message}`}
                      className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2"
                    >
                      <div className="text-sm font-medium text-ink">{blocker.message}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">{blocker.code}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Factoring</div>
              {selected.factoring.lastSubmission ? (
                <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2 text-sm">
                  <div className="font-medium text-ink">{selected.factoring.lastSubmission.status}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {selected.factoring.lastSubmission.toEmail} · {formatDate(selected.factoring.lastSubmission.createdAt)}
                  </div>
                  {selected.factoring.lastSubmission.errorMessage ? (
                    <div className="text-xs text-[color:var(--color-danger)]">{selected.factoring.lastSubmission.errorMessage}</div>
                  ) : null}
                </div>
              ) : (
                <StatusChip tone="neutral" label="No factoring submission yet" />
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Allowed actions</div>
              <div className="flex flex-wrap gap-2">
                {selected.actions.allowedActions.map((action) => (
                  <Button
                    key={action}
                    size="sm"
                    variant={action === selected.actions.primaryAction ? "primary" : "secondary"}
                    disabled={runningActionId === `${selected.loadId}:${action}`}
                    onClick={() => runAction(selected, action)}
                  >
                    {actionLabel(action)}
                  </Button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}

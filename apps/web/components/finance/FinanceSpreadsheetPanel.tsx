"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { formatDateTime } from "@/lib/date-time";
import { isForbiddenError } from "@/lib/capabilities";

type FinanceRow = {
  loadId: string;
  loadNumber: string;
  customer: string | null;
  amountCents: number;
  deliveredAt: string | null;
  billingStage: "DELIVERED" | "DOCS_REVIEW" | "READY" | "INVOICE_SENT" | "COLLECTED" | "SETTLED";
  readinessSnapshot: {
    isReady: boolean;
    blockers: Array<{ code: string; severity: "error" | "warning"; message: string }>;
  };
  topBlocker: { code: string; severity: "error" | "warning"; message: string } | null;
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
  items?: FinanceRow[];
  rows?: FinanceRow[];
};

const LANE_LABELS = {
  GENERATE_INVOICE: "Invoice now",
  RETRY_QBO_SYNC: "Retry QBO",
  FOLLOW_UP_COLLECTION: "Collections",
  GENERATE_SETTLEMENT: "Settlement",
} as const;

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function stageTone(stage: FinanceRow["billingStage"]) {
  if (stage === "READY" || stage === "COLLECTED" || stage === "SETTLED") return "success" as const;
  if (stage === "INVOICE_SENT") return "info" as const;
  if (stage === "DOCS_REVIEW") return "warning" as const;
  return "neutral" as const;
}

function stageLabel(stage: FinanceRow["billingStage"]) {
  if (stage === "DOCS_REVIEW") return "Docs review";
  if (stage === "INVOICE_SENT") return "Invoice sent";
  return stage.replaceAll("_", " ");
}

function actionLabel(action: string) {
  if (action === "MARK_COLLECTED") return "Record payment";
  if (action === "GENERATE_SETTLEMENT") return "Create pay run";
  if (action === "VIEW_SETTLEMENT") return "Open payables";
  if (action === "FOLLOW_UP_COLLECTION") return "Collections follow-up";
  return action
    .toLowerCase()
    .split("_")
    .map((token) => token.slice(0, 1).toUpperCase() + token.slice(1))
    .join(" ");
}

export function FinanceSpreadsheetPanel() {
  const router = useRouter();
  const { user, capabilities } = useUser();
  const canAccess = capabilities.canAccessFinance;
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restrictedBy403, setRestrictedBy403] = useState(false);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [readiness, setReadiness] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSpreadsheetMaximized, setIsSpreadsheetMaximized] = useState(false);

  const loadRows = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (search.trim()) params.set("search", search.trim());
      if (stage) params.set("stage", stage);
      if (readiness) params.set("readiness", readiness);
      const data = await apiFetch<ReceivablesResponse>(`/finance/receivables?${params.toString()}`);
      const nextRows = data.items ?? data.rows ?? [];
      setRows(nextRows);
      setSelectedId((prev) => (prev && nextRows.some((row) => row.loadId === prev) ? prev : nextRows[0]?.loadId ?? null));
      setPage(1);
      setError(null);
      setRestrictedBy403(false);
    } catch (err) {
      if (isForbiddenError(err)) {
        setRestrictedBy403(true);
        setRows([]);
        setError(null);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [canAccess, readiness, search, stage]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!isSpreadsheetMaximized || typeof window === "undefined") {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSpreadsheetMaximized(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSpreadsheetMaximized]);

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const normalizedPage = Math.min(page, totalPages);
  const pageStart = (normalizedPage - 1) * rowsPerPage;
  const visibleRows = useMemo(() => rows.slice(pageStart, pageStart + rowsPerPage), [pageStart, rows, rowsPerPage]);
  const selected = useMemo(() => rows.find((row) => row.loadId === selectedId) ?? null, [rows, selectedId]);
  const laneCounts = useMemo(() => {
    const counts = Object.fromEntries(Object.keys(LANE_LABELS).map((key) => [key, 0])) as Record<string, number>;
    for (const row of rows) {
      for (const action of row.actions?.allowedActions ?? []) {
        if (action in counts) {
          counts[action] += 1;
        }
      }
    }
    return counts;
  }, [rows]);
  const rowPaddingClass = "px-2.5 py-1.5";
  const tableTextClass = "text-xs";
  const cardPaddingClass = "!p-2.5 sm:!p-3";

  if (!canAccess || restrictedBy403) {
    return (
      <Card className="space-y-3">
        <SectionHeader title="Finance spreadsheet" subtitle="Dense queue for billing and settlement operations" />
        <div className="flex items-center gap-2">
          <StatusChip tone="warning" label="Restricted" />
          <span className="text-sm text-[color:var(--color-text-muted)]">Restricted: you do not have access to finance spreadsheet actions.</span>
        </div>
        {!canAccess ? <NoAccess title="Finance spreadsheet" description="This surface is restricted by role capability." ctaHref="/finance" ctaLabel="Open Finance" /> : null}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorBanner message={error} /> : null}
      <Card className={`space-y-2 ${cardPaddingClass}`}>
        <SectionHeader
          title="Spreadsheet filters"
          subtitle="Filters stay attached to table controls for fast triage"
          action={
            <Button variant="secondary" size="sm" onClick={loadRows} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <div className="grid gap-2 md:grid-cols-4">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search load/customer" />
          <Select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All stages</option>
            <option value="DELIVERED,DOCS_REVIEW,READY">Open billing</option>
            <option value="INVOICE_SENT">Invoice sent</option>
            <option value="COLLECTED,SETTLED">Closed</option>
          </Select>
          <Select value={readiness} onChange={(e) => setReadiness(e.target.value)}>
            <option value="">All readiness</option>
            <option value="READY">Ready</option>
            <option value="BLOCKED">Blocked</option>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[color:var(--color-text-muted)]">Rows/page</span>
            <Select value={String(rowsPerPage)} onChange={(e) => setRowsPerPage(Number(e.target.value) || 25)}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className={`space-y-2 ${cardPaddingClass}`}>
        <SectionHeader title="Command queue snapshot" subtitle="Lane counts from current spreadsheet scope" />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(LANE_LABELS).map(([action, label]) => {
            const count = laneCounts[action] ?? 0;
            return (
              <button
                key={action}
                type="button"
                onClick={() => router.push(`/finance?tab=commands`)}
                className="flex items-center justify-between rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2.5 py-2 text-left text-xs transition hover:bg-[color:var(--color-bg-muted)]"
              >
                <span className="font-medium text-ink">{label}</span>
                <StatusChip tone={count > 0 ? "warning" : "neutral"} label={String(count)} />
              </button>
            );
          })}
        </div>
      </Card>

      <div
        className={
          isSpreadsheetMaximized
            ? "fixed inset-3 z-40 overflow-y-auto rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] p-3 shadow-[var(--shadow-card)] sm:inset-4 sm:p-4 lg:inset-6"
            : ""
        }
      >
        <Card className={`space-y-2 ${cardPaddingClass}`}>
          <SectionHeader
            title="Finance spreadsheet"
            subtitle={`Showing ${visibleRows.length} of ${rows.length} rows · page ${normalizedPage}/${totalPages}`}
            action={
              <Button
                size="sm"
                variant="secondary"
                aria-label={isSpreadsheetMaximized ? "Exit full screen" : "Maximize spreadsheet"}
                title={isSpreadsheetMaximized ? "Exit full screen" : "Maximize spreadsheet"}
                onClick={() => setIsSpreadsheetMaximized((prev) => !prev)}
                className="h-8 w-8 p-0"
              >
                {isSpreadsheetMaximized ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M9 9H5V5M15 9h4V5M9 15H5v4M15 15h4v4" />
                    <path d="M8 8l3 3M16 8l-3 3M8 16l3-3M16 16l-3-3" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4" />
                    <path d="M9 5L5 9M15 5l4 4M9 19l-4-4M15 19l4-4" />
                  </svg>
                )}
              </Button>
            }
          />
          {loading ? <EmptyState title="Loading finance rows..." /> : null}
          {!loading && rows.length === 0 ? <EmptyState title="No finance rows found." /> : null}
          {!loading && rows.length > 0 ? (
            <div className={isSpreadsheetMaximized ? "max-h-[calc(100dvh-16rem)] overflow-auto" : "max-h-[58vh] overflow-auto"}>
              <table className={`min-w-[980px] border-separate border-spacing-0 ${tableTextClass}`}>
                <colgroup>
                  <col className="w-[160px]" />
                  <col className="w-[130px]" />
                  <col className="w-[280px]" />
                  <col className="w-[120px]" />
                  <col className="w-[150px]" />
                  <col className="w-[120px]" />
                  <col className="w-[130px]" />
                  <col className="w-[130px]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
                  <tr>
                    <th className={`sticky left-0 z-20 border-b border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] text-left ${rowPaddingClass}`}>Load #</th>
                    <th className={`border-b border-[color:var(--color-divider)] text-left ${rowPaddingClass}`}>Stage</th>
                    <th className={`border-b border-[color:var(--color-divider)] text-left ${rowPaddingClass}`}>Customer</th>
                    <th className={`border-b border-[color:var(--color-divider)] text-right ${rowPaddingClass}`}>Amount</th>
                    <th className={`border-b border-[color:var(--color-divider)] text-left ${rowPaddingClass}`}>Delivered</th>
                    <th className={`border-b border-[color:var(--color-divider)] text-left ${rowPaddingClass}`}>Blockers</th>
                    <th className={`border-b border-[color:var(--color-divider)] text-left ${rowPaddingClass}`}>QBO</th>
                    <th className={`border-b border-[color:var(--color-divider)] text-left ${rowPaddingClass}`}>Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const active = row.loadId === selectedId;
                    const blockerCount = row.readinessSnapshot?.blockers?.length ?? 0;
                    return (
                      <tr
                        key={row.loadId}
                        onClick={() => setSelectedId(row.loadId)}
                        className={`cursor-pointer ${active ? "bg-[color:var(--color-accent-soft)]/20" : ""}`}
                      >
                        <td className={`sticky left-0 z-10 border-b border-[color:var(--color-divider)] font-semibold text-ink ${rowPaddingClass} ${active ? "bg-[color:var(--color-accent-soft)]/20" : "bg-white"}`}>
                          {row.loadNumber}
                        </td>
                        <td className={`border-b border-[color:var(--color-divider)] ${rowPaddingClass}`}>
                          <StatusChip tone={stageTone(row.billingStage)} label={stageLabel(row.billingStage)} />
                        </td>
                        <td className={`border-b border-[color:var(--color-divider)] ${rowPaddingClass}`}>{row.customer ?? "-"}</td>
                        <td className={`border-b border-[color:var(--color-divider)] text-right font-semibold text-ink ${rowPaddingClass}`}>{formatCurrency(row.amountCents)}</td>
                        <td className={`border-b border-[color:var(--color-divider)] ${rowPaddingClass}`}>{formatDateTime(row.deliveredAt)}</td>
                        <td className={`border-b border-[color:var(--color-divider)] ${rowPaddingClass}`}>
                          {blockerCount > 0 ? (
                            <StatusChip tone="warning" label={`${blockerCount} blocker(s)`} />
                          ) : (
                            <StatusChip tone="success" label="Ready" />
                          )}
                        </td>
                        <td className={`border-b border-[color:var(--color-divider)] ${rowPaddingClass}`}>{row.integrations?.quickbooks?.syncStatus ?? "UNKNOWN"}</td>
                        <td className={`border-b border-[color:var(--color-divider)] ${rowPaddingClass}`}>{actionLabel(row.actions?.primaryAction ?? "VIEW")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {rows.length > 0 ? (
            <div className="flex items-center justify-between gap-2 border-t border-[color:var(--color-divider)] pt-2">
              <div className="text-xs text-[color:var(--color-text-muted)]">
                {pageStart + 1}-{Math.min(pageStart + rowsPerPage, rows.length)} of {rows.length}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={normalizedPage <= 1}>
                  Prev
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={normalizedPage >= totalPages}>
                  Next
                </Button>
              </div>
            </div>
          ) : null}
          <div className="space-y-2 border-t border-[color:var(--color-divider)] pt-2">
            <SectionHeader
              title="Selected row details"
              subtitle={selected ? `${selected.loadNumber} · ${stageLabel(selected.billingStage)}` : "Select a row in the spreadsheet"}
            />
            {!selected ? <EmptyState title="Pick a finance row to inspect details." /> : null}
            {selected ? (
              <div className="space-y-3">
                <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 sm:block sm:space-y-1">
                    <span className="text-[color:var(--color-text-muted)]">Customer</span>
                    <div className="font-semibold text-ink">{selected.customer ?? "-"}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 sm:block sm:space-y-1">
                    <span className="text-[color:var(--color-text-muted)]">Amount</span>
                    <div className="font-semibold text-ink">{formatCurrency(selected.amountCents)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 sm:block sm:space-y-1">
                    <span className="text-[color:var(--color-text-muted)]">Delivered</span>
                    <div className="text-ink">{formatDateTime(selected.deliveredAt)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 sm:block sm:space-y-1">
                    <span className="text-[color:var(--color-text-muted)]">QBO</span>
                    <div className="text-ink">{selected.integrations?.quickbooks?.syncStatus ?? "UNKNOWN"}</div>
                  </div>
                </div>

                <div className="space-y-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Readiness blockers</div>
                  {(selected.readinessSnapshot?.blockers ?? []).length === 0 ? (
                    <StatusChip tone="success" label="No blockers" />
                  ) : (
                    (selected.readinessSnapshot?.blockers ?? []).slice(0, 3).map((blocker) => (
                      <div key={`${selected.loadId}-${blocker.code}`} className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2 text-xs">
                        <div className="flex items-center gap-2">
                          <StatusChip tone={blocker.severity === "error" ? "danger" : "warning"} label={blocker.code} />
                        </div>
                        <div className="mt-1 text-[color:var(--color-text-muted)]">{blocker.message}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => router.push(`/loads/${selected.loadId}`)}>
                    Open load
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => router.push(`/finance?tab=receivables&search=${encodeURIComponent(selected.loadNumber)}`)}>
                    Open receivables board
                  </Button>
                  {user?.role === "BILLING" || user?.role === "ADMIN" ? (
                    <Button size="sm" onClick={() => router.push(`/finance?tab=payables&loadId=${selected.loadId}`)}>
                      Open payables context
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

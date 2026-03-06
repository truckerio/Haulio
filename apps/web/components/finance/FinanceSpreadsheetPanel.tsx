"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { toneFromSemantic, toneFromSeverity } from "@/lib/status-semantics";

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

type SortKey = "loadNumber" | "billingStage" | "customer" | "amountCents" | "deliveredAt" | "blockers" | "qbo" | "action";
type SortDirection = "asc" | "desc";
type LaneFilter = "all" | "disputes" | "shortPay" | "qboFailed";

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
  if (stage === "READY" || stage === "COLLECTED" || stage === "SETTLED") return toneFromSemantic("complete");
  if (stage === "INVOICE_SENT") return toneFromSemantic("info");
  if (stage === "DOCS_REVIEW") return toneFromSemantic("attention");
  return toneFromSemantic("neutral");
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

function hasSignalByCode(row: FinanceRow, hints: string[]) {
  const values = [
    row.topBlocker?.code ?? "",
    row.topBlocker?.message ?? "",
    ...(row.readinessSnapshot?.blockers ?? []).flatMap((blocker) => [blocker.code, blocker.message]),
  ]
    .join(" ")
    .toUpperCase();
  return hints.some((hint) => values.includes(hint.toUpperCase()));
}

function matchesLaneFilter(row: FinanceRow, lane: LaneFilter) {
  if (lane === "all") return true;
  if (lane === "qboFailed") return row.integrations?.quickbooks?.syncStatus === "FAILED";
  if (lane === "disputes") return hasSignalByCode(row, ["DISPUTE", "CHARGEBACK", "CUSTOMER_DISPUTE"]);
  if (lane === "shortPay") return hasSignalByCode(row, ["SHORT_PAY", "PARTIAL_PAYMENT", "UNDERPAID", "COLLECTION"]);
  return true;
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

function stageSortRank(stage: FinanceRow["billingStage"]) {
  switch (stage) {
    case "DELIVERED":
      return 0;
    case "DOCS_REVIEW":
      return 1;
    case "READY":
      return 2;
    case "INVOICE_SENT":
      return 3;
    case "COLLECTED":
      return 4;
    case "SETTLED":
      return 5;
    default:
      return 99;
  }
}

function blockerCount(row: FinanceRow) {
  return row.readinessSnapshot?.blockers?.length ?? 0;
}

function nextSortDirection(key: SortKey): SortDirection {
  if (key === "amountCents" || key === "deliveredAt" || key === "blockers") return "desc";
  return "asc";
}

function parseLaneFilter(value: string | null): LaneFilter {
  if (value === "disputes" || value === "shortPay" || value === "qboFailed") return value;
  return "all";
}

function countActiveSpreadsheetFilters(params: { search: string; stage: string; readiness: string; laneFilter: LaneFilter }) {
  let count = 0;
  if (params.search.trim()) count += 1;
  if (params.stage) count += 1;
  if (params.readiness) count += 1;
  if (params.laneFilter !== "all") count += 1;
  return count;
}

export function FinanceSpreadsheetPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, capabilities } = useUser();
  const canAccess = capabilities.canAccessFinance;
  const initialSearch = searchParams.get("sheetSearch") ?? "";
  const initialStage = searchParams.get("sheetStage") ?? "";
  const initialReadiness = searchParams.get("sheetReadiness") ?? "";
  const initialLaneFilter = parseLaneFilter(searchParams.get("sheetLane"));
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restrictedBy403, setRestrictedBy403] = useState(false);
  const [search, setSearch] = useState(initialSearch);
  const [stage, setStage] = useState(initialStage);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSpreadsheetMaximized, setIsSpreadsheetMaximized] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("deliveredAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [laneFilter, setLaneFilter] = useState<LaneFilter>(initialLaneFilter);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

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
      setLastRefreshedAt(new Date().toISOString());
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
    setPage(1);
  }, [laneFilter, rowsPerPage]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setStage("");
    setReadiness("");
    setLaneFilter("all");
    setPage(1);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    const nextSearch = search.trim();
    if (nextSearch) {
      if (params.get("sheetSearch") !== nextSearch) {
        params.set("sheetSearch", nextSearch);
        changed = true;
      }
    } else if (params.has("sheetSearch")) {
      params.delete("sheetSearch");
      changed = true;
    }
    if (stage) {
      if (params.get("sheetStage") !== stage) {
        params.set("sheetStage", stage);
        changed = true;
      }
    } else if (params.has("sheetStage")) {
      params.delete("sheetStage");
      changed = true;
    }
    if (readiness) {
      if (params.get("sheetReadiness") !== readiness) {
        params.set("sheetReadiness", readiness);
        changed = true;
      }
    } else if (params.has("sheetReadiness")) {
      params.delete("sheetReadiness");
      changed = true;
    }
    if (laneFilter !== "all") {
      if (params.get("sheetLane") !== laneFilter) {
        params.set("sheetLane", laneFilter);
        changed = true;
      }
    } else if (params.has("sheetLane")) {
      params.delete("sheetLane");
      changed = true;
    }
    if (!changed) return;
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [laneFilter, pathname, readiness, router, search, searchParams, stage]);

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

  const scopedRows = useMemo(() => rows.filter((row) => matchesLaneFilter(row, laneFilter)), [laneFilter, rows]);

  const sortedRows = useMemo(() => {
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...scopedRows].sort((a, b) => {
      let result = 0;
      if (sortKey === "loadNumber") result = compareText(a.loadNumber, b.loadNumber);
      if (sortKey === "billingStage") result = stageSortRank(a.billingStage) - stageSortRank(b.billingStage);
      if (sortKey === "customer") result = compareText(a.customer, b.customer);
      if (sortKey === "amountCents") result = Number(a.amountCents || 0) - Number(b.amountCents || 0);
      if (sortKey === "deliveredAt") result = Number(new Date(a.deliveredAt ?? 0)) - Number(new Date(b.deliveredAt ?? 0));
      if (sortKey === "blockers") result = blockerCount(a) - blockerCount(b);
      if (sortKey === "qbo") result = compareText(a.integrations?.quickbooks?.syncStatus, b.integrations?.quickbooks?.syncStatus);
      if (sortKey === "action") result = compareText(a.actions?.primaryAction, b.actions?.primaryAction);
      if (result === 0) {
        result = compareText(a.loadNumber, b.loadNumber);
      }
      return result * factor;
    });
  }, [scopedRows, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));
  const normalizedPage = Math.min(page, totalPages);
  const pageStart = (normalizedPage - 1) * rowsPerPage;
  const visibleRows = useMemo(() => sortedRows.slice(pageStart, pageStart + rowsPerPage), [pageStart, rowsPerPage, sortedRows]);
  const selected = useMemo(() => sortedRows.find((row) => row.loadId === selectedId) ?? null, [sortedRows, selectedId]);
  const laneCounts = useMemo(() => {
    const counts = Object.fromEntries(Object.keys(LANE_LABELS).map((key) => [key, 0])) as Record<string, number>;
    for (const row of sortedRows) {
      for (const action of row.actions?.allowedActions ?? []) {
        if (action in counts) {
          counts[action] += 1;
        }
      }
    }
    return counts;
  }, [sortedRows]);
  const riskLaneCounts = useMemo(
    () => ({
      disputes: rows.filter((row) => matchesLaneFilter(row, "disputes")).length,
      shortPay: rows.filter((row) => matchesLaneFilter(row, "shortPay")).length,
      qboFailed: rows.filter((row) => matchesLaneFilter(row, "qboFailed")).length,
    }),
    [rows]
  );
  const summaryStats = useMemo(() => {
    let blocked = 0;
    let ready = 0;
    let totalAmountCents = 0;
    for (const row of sortedRows) {
      const blockers = blockerCount(row);
      if (blockers > 0) blocked += 1;
      else ready += 1;
      totalAmountCents += Number(row.amountCents || 0);
    }
    return { blocked, ready, totalAmountCents };
  }, [sortedRows]);
  const activeFilterCount = useMemo(
    () => countActiveSpreadsheetFilters({ search, stage, readiness, laneFilter }),
    [laneFilter, readiness, search, stage]
  );
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(nextSortDirection(key));
  };
  const sortGlyph = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  };
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
        <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--color-divider)] pt-2 text-xs">
          <StatusChip tone={activeFilterCount > 0 ? "warning" : "neutral"} label={activeFilterCount > 0 ? `${activeFilterCount} active filter(s)` : "No active filters"} />
          <Button size="sm" variant="secondary" onClick={clearFilters} disabled={activeFilterCount === 0}>
            Clear filters
          </Button>
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
                onClick={() =>
                  router.push(
                    capabilities.canBillActions
                      ? `/finance?tab=receivables&commandLane=${encodeURIComponent(action)}`
                      : "/finance?tab=receivables&focus=readiness"
                  )
                }
                className="flex items-center justify-between rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2.5 py-2 text-left text-xs transition hover:bg-[color:var(--color-bg-muted)]"
              >
                <span className="font-medium text-ink">{label}</span>
                <StatusChip tone={count > 0 ? "warning" : "neutral"} label={String(count)} />
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--color-divider)] pt-2 text-xs">
          <span className="font-medium text-[color:var(--color-text-muted)]">Risk lanes</span>
          <button
            type="button"
            onClick={() => setLaneFilter("all")}
            className={`rounded-full border px-2 py-1 ${laneFilter === "all" ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]" : "border-[color:var(--color-divider)] text-[color:var(--color-text-muted)]"}`}
          >
            All ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setLaneFilter("disputes")}
            className={`rounded-full border px-2 py-1 ${laneFilter === "disputes" ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]" : "border-[color:var(--color-divider)] text-[color:var(--color-text-muted)]"}`}
          >
            Disputes ({riskLaneCounts.disputes})
          </button>
          <button
            type="button"
            onClick={() => setLaneFilter("shortPay")}
            className={`rounded-full border px-2 py-1 ${laneFilter === "shortPay" ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]" : "border-[color:var(--color-divider)] text-[color:var(--color-text-muted)]"}`}
          >
            Short pay ({riskLaneCounts.shortPay})
          </button>
          <button
            type="button"
            onClick={() => setLaneFilter("qboFailed")}
            className={`rounded-full border px-2 py-1 ${laneFilter === "qboFailed" ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]" : "border-[color:var(--color-divider)] text-[color:var(--color-text-muted)]"}`}
          >
            QBO failed ({riskLaneCounts.qboFailed})
          </button>
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
            subtitle={`Showing ${visibleRows.length} of ${sortedRows.length} rows · page ${normalizedPage}/${totalPages}`}
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
          <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--color-divider)] pb-2 text-xs">
            <StatusChip tone={summaryStats.blocked > 0 ? "warning" : "success"} label={`Blocked ${summaryStats.blocked}`} />
            <StatusChip tone="success" label={`Ready ${summaryStats.ready}`} />
            <StatusChip tone="info" label={`Amount ${formatCurrency(summaryStats.totalAmountCents)}`} />
            <StatusChip tone="neutral" label={`Lane ${laneFilter === "all" ? "All" : laneFilter === "shortPay" ? "Short pay" : laneFilter === "qboFailed" ? "QBO failed" : "Disputes"}`} />
            <span className="ml-auto text-[color:var(--color-text-muted)]">{lastRefreshedAt ? `Last refresh ${formatDateTime(lastRefreshedAt)}` : "Not refreshed yet"}</span>
          </div>
          {loading ? <EmptyState title="Loading finance rows..." /> : null}
          {!loading && rows.length === 0 ? (
            <EmptyState
              title="No finance rows found."
              description="Adjust filters, clear the lane scope, or refresh data."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={clearFilters} disabled={activeFilterCount === 0}>
                    Clear filters
                  </Button>
                  <Button size="sm" variant="secondary" onClick={loadRows} disabled={loading}>
                    Refresh
                  </Button>
                </div>
              }
            />
          ) : null}
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
                    <th className={`sticky left-0 z-20 border-b border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] text-left ${rowPaddingClass}`}>
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort("loadNumber")}>
                        Load #<span aria-hidden="true">{sortGlyph("loadNumber")}</span>
                      </button>
                    </th>
                    <th className={`sticky left-[160px] z-20 border-b border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] text-left ${rowPaddingClass}`}>
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort("billingStage")}>
                        Stage <span aria-hidden="true">{sortGlyph("billingStage")}</span>
                      </button>
                    </th>
                    <th className={`border-b border-[color:var(--color-divider)] text-left ${rowPaddingClass}`}>
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort("customer")}>
                        Customer <span aria-hidden="true">{sortGlyph("customer")}</span>
                      </button>
                    </th>
                    <th className={`border-b border-[color:var(--color-divider)] text-right ${rowPaddingClass}`}>
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort("amountCents")}>
                        Amount <span aria-hidden="true">{sortGlyph("amountCents")}</span>
                      </button>
                    </th>
                    <th className={`border-b border-[color:var(--color-divider)] text-left ${rowPaddingClass}`}>
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort("deliveredAt")}>
                        Delivered <span aria-hidden="true">{sortGlyph("deliveredAt")}</span>
                      </button>
                    </th>
                    <th className={`border-b border-[color:var(--color-divider)] text-left ${rowPaddingClass}`}>
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort("blockers")}>
                        Blockers <span aria-hidden="true">{sortGlyph("blockers")}</span>
                      </button>
                    </th>
                    <th className={`border-b border-[color:var(--color-divider)] text-left ${rowPaddingClass}`}>
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort("qbo")}>
                        QBO <span aria-hidden="true">{sortGlyph("qbo")}</span>
                      </button>
                    </th>
                    <th className={`border-b border-[color:var(--color-divider)] text-left ${rowPaddingClass}`}>
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort("action")}>
                        Next action <span aria-hidden="true">{sortGlyph("action")}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, index) => {
                    const active = row.loadId === selectedId;
                    const blockerCount = row.readinessSnapshot?.blockers?.length ?? 0;
                    const striped = index % 2 === 1 ? "bg-[color:var(--color-bg-muted)]/35" : "bg-white";
                    const rowTone = active ? "bg-[color:var(--color-accent-soft)]/20" : striped;
                    return (
                      <tr
                        key={row.loadId}
                        onClick={() => setSelectedId(row.loadId)}
                        className={`cursor-pointer transition-colors hover:bg-[color:var(--color-accent-soft)]/15 ${rowTone}`}
                      >
                        <td className={`sticky left-0 z-10 border-b border-[color:var(--color-divider)] font-semibold text-ink ${rowPaddingClass} ${rowTone}`}>
                          {row.loadNumber}
                        </td>
                        <td className={`sticky left-[160px] z-10 border-b border-[color:var(--color-divider)] ${rowPaddingClass} ${rowTone}`}>
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
                {pageStart + 1}-{Math.min(pageStart + rowsPerPage, sortedRows.length)} of {sortedRows.length}
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
                          <StatusChip tone={toneFromSeverity(blocker.severity)} label={blocker.code} />
                        </div>
                        <div className="mt-1 text-[color:var(--color-text-muted)]">{blocker.message}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => router.push(`/shipments/${selected.loadId}`)}>
                    Open shipment
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => router.push(`/finance?tab=receivables&search=${encodeURIComponent(selected.loadNumber)}`)}>
                    Open receivables board
                  </Button>
                  {user?.role === "BILLING" || user?.role === "ADMIN" ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        router.push(
                          `/finance?tab=payables&loadId=${encodeURIComponent(selected.loadId)}&search=${encodeURIComponent(selected.loadNumber)}`
                        )
                      }
                    >
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

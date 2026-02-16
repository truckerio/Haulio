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
  topBlocker: { code: string; severity: "error" | "warning"; message: string; meta: Record<string, unknown> } | null;
  invoice: {
    invoiceId: string | null;
    invoiceNumber: string | null;
    invoiceSentAt: string | null;
    dueDate: string | null;
    pdfPath?: string | null;
    packetPath?: string | null;
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
    factorReady?: boolean;
    factorReadyReasonCodes?: string[];
    lastSubmission: {
      id: string;
      status: "SENT" | "FAILED";
      toEmail: string;
      createdAt: string;
      errorMessage: string | null;
      attachmentMode: string;
    } | null;
  };
  factorReady?: boolean;
  factorReadyReasonCodes?: string[];
  nextBestAction?: string;
  nextBestActionReasonCodes?: string[];
  priorityScore?: number;
  blockerOwner?: "DISPATCH" | "DRIVER" | "BILLING" | "CUSTOMER" | "SYSTEM" | null;
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

type InvoicePaymentRecord = {
  id: string;
  invoiceId: string;
  amountCents: number;
  method: "ACH" | "WIRE" | "CHECK" | "CASH" | "FACTORING" | "OTHER";
  reference: string | null;
  notes: string | null;
  receivedAt: string;
  createdAt: string;
  createdBy?: { id: string; name: string | null; email: string };
};

type BulkMutationResult = {
  dryRun: boolean;
  summary: { total: number; ok: number; failed: number };
  results: Array<{ loadId: string; ok: boolean; message: string; invoiceId?: string | null; jobId?: string | null }>;
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
  if (action === "MARK_COLLECTED") return "Record payment";
  if (action === "GENERATE_SETTLEMENT") return "Create pay run";
  if (action === "VIEW_SETTLEMENT") return "Open payables";
  if (action === "FOLLOW_UP_COLLECTION") return "Open collections";
  return action
    .toLowerCase()
    .split("_")
    .map((token) => token.slice(0, 1).toUpperCase() + token.slice(1))
    .join(" ");
}

export function ReceivablesPanel({ focusReadiness = false }: { focusReadiness?: boolean }) {
  const { user, loading } = useUser();
  const canAccess = Boolean(user && ["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"].includes(user.role));
  const canRecordPayment = Boolean(user && ["ADMIN", "BILLING"].includes(user.role));

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkMutationResult | null>(null);
  const [manualPaymentLoadId, setManualPaymentLoadId] = useState<string | null>(null);
  const [manualPaymentMode, setManualPaymentMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [manualPaymentAmount, setManualPaymentAmount] = useState("");
  const [manualPaymentMethod, setManualPaymentMethod] = useState<InvoicePaymentRecord["method"]>("ACH");
  const [manualPaymentReference, setManualPaymentReference] = useState("");
  const [manualPaymentNotes, setManualPaymentNotes] = useState("");
  const [manualPaymentReceivedAt, setManualPaymentReceivedAt] = useState("");
  const [submittingManualPayment, setSubmittingManualPayment] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<Record<string, InvoicePaymentRecord[]>>({});
  const [loadingPaymentHistoryFor, setLoadingPaymentHistoryFor] = useState<string | null>(null);

  const selectedView = useMemo(() => SAVED_VIEWS.find((item) => item.key === view) ?? SAVED_VIEWS[0], [view]);

  const fetchRows = useCallback(
    async ({ append, cursor }: { append: boolean; cursor?: string | null }) => {
      setLoadingRows(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "50");
        params.set("stage", selectedView.stage);
        if (focusReadiness) {
          params.set("readiness", "BLOCKED");
        } else if (selectedView.readiness) {
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
    [agingBucket, appliedSearch, blockerCode, focusReadiness, qboSyncStatus, selectedView.readiness, selectedView.stage]
  );

  useEffect(() => {
    setSelectedId(null);
    setSelectedIds([]);
    setBulkResult(null);
    setNextCursor(null);
    fetchRows({ append: false });
  }, [fetchRows, view]);

  const selected = useMemo(() => rows.find((row) => row.loadId === selectedId) ?? null, [rows, selectedId]);
  const selectedPaymentHistory = selected ? paymentHistory[selected.loadId] ?? [] : [];

  useEffect(() => {
    if (!actionNote) return;
    const timer = window.setTimeout(() => setActionNote(null), 2000);
    return () => window.clearTimeout(timer);
  }, [actionNote]);

  const loadPaymentHistory = useCallback(async (loadId: string) => {
    setLoadingPaymentHistoryFor(loadId);
    try {
      const response = await apiFetch<{ payments: InvoicePaymentRecord[] }>(
        `/finance/receivables/${loadId}/payments`
      );
      setPaymentHistory((prev) => ({ ...prev, [loadId]: response.payments ?? [] }));
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setLoadingPaymentHistoryFor((prev) => (prev === loadId ? null : prev));
    }
  }, []);

  useEffect(() => {
    if (!selected?.loadId) return;
    if (paymentHistory[selected.loadId]) return;
    loadPaymentHistory(selected.loadId);
  }, [selected?.loadId, paymentHistory, loadPaymentHistory]);

  useEffect(() => {
    if (!manualPaymentLoadId) return;
    if (selectedId !== manualPaymentLoadId) {
      setManualPaymentLoadId(null);
    }
  }, [manualPaymentLoadId, selectedId]);

  const toggleSelected = useCallback((loadId: string) => {
    setSelectedIds((prev) => (prev.includes(loadId) ? prev.filter((id) => id !== loadId) : [...prev, loadId]));
  }, []);

  const toggleSelectAllPage = useCallback(() => {
    setSelectedIds((prev) => {
      const pageIds = rows.map((row) => row.loadId);
      const allSelected = pageIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !pageIds.includes(id));
      }
      return Array.from(new Set([...prev, ...pageIds]));
    });
  }, [rows]);

  const openManualPayment = useCallback(
    async (row: FinanceReceivableRow) => {
      setManualPaymentLoadId(row.loadId);
      setManualPaymentMode("FULL");
      setManualPaymentAmount(row.amountCents > 0 ? (row.amountCents / 100).toFixed(2) : "");
      setManualPaymentMethod("ACH");
      setManualPaymentReference("");
      setManualPaymentNotes("");
      const now = new Date();
      now.setSeconds(0, 0);
      setManualPaymentReceivedAt(now.toISOString().slice(0, 16));
      setActionError(null);
      await loadPaymentHistory(row.loadId);
    },
    [loadPaymentHistory]
  );

  const submitManualPayment = useCallback(async () => {
    if (!manualPaymentLoadId) return;
    const row = rows.find((candidate) => candidate.loadId === manualPaymentLoadId);
    if (!row) return;
    setSubmittingManualPayment(true);
    setActionError(null);
    setActionNote(null);
    try {
      const payload: {
        mode: "FULL" | "PARTIAL";
        method: InvoicePaymentRecord["method"];
        amountCents?: number;
        reference?: string;
        notes?: string;
        receivedAt?: string;
      } = {
        mode: manualPaymentMode,
        method: manualPaymentMethod,
      };
      if (manualPaymentMode === "PARTIAL") {
        const numeric = Number(manualPaymentAmount);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          throw new Error("Enter a valid partial payment amount.");
        }
        payload.amountCents = Math.round(numeric * 100);
      }
      const reference = manualPaymentReference.trim();
      if (reference) payload.reference = reference;
      const notes = manualPaymentNotes.trim();
      if (notes) payload.notes = notes;
      if (manualPaymentReceivedAt) {
        const receivedAt = new Date(manualPaymentReceivedAt);
        if (Number.isNaN(receivedAt.getTime())) {
          throw new Error("Enter a valid received date/time.");
        }
        payload.receivedAt = receivedAt.toISOString();
      }

      await apiFetch(`/finance/receivables/${manualPaymentLoadId}/manual-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setActionNote(`Manual payment recorded for ${row.loadNumber}.`);
      await Promise.all([fetchRows({ append: false }), loadPaymentHistory(manualPaymentLoadId)]);
      setManualPaymentLoadId(null);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSubmittingManualPayment(false);
    }
  }, [
    fetchRows,
    loadPaymentHistory,
    manualPaymentAmount,
    manualPaymentLoadId,
    manualPaymentMethod,
    manualPaymentMode,
    manualPaymentNotes,
    manualPaymentReceivedAt,
    manualPaymentReference,
    rows,
  ]);

  const runBulkAction = useCallback(
    async (
      endpoint: "/finance/receivables/bulk/generate-invoices" | "/finance/receivables/bulk/qbo-sync" | "/finance/receivables/bulk/send-reminders",
      dryRun: boolean,
      label: string
    ) => {
      if (selectedIds.length === 0) {
        setActionError("Select at least one receivable.");
        return;
      }
      setActionError(null);
      setActionNote(null);
      setBulkBusy(`${endpoint}:${dryRun ? "preview" : "execute"}`);
      try {
        const result = await apiFetch<BulkMutationResult>(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loadIds: selectedIds, dry_run: dryRun }),
        });
        setBulkResult(result);
        setActionNote(
          dryRun
            ? `${label} preview ready: ${result.summary.ok}/${result.summary.total} valid`
            : `${label} completed: ${result.summary.ok}/${result.summary.total} succeeded`
        );
        if (!dryRun) {
          await fetchRows({ append: false });
        }
      } catch (err) {
        setActionError((err as Error).message);
      } finally {
        setBulkBusy(null);
      }
    },
    [fetchRows, selectedIds]
  );

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
        if (action === "DOWNLOAD_INVOICE_PDF") {
          if (!row.invoice.invoiceId) {
            throw new Error("Invoice PDF is not available");
          }
          window.open(`${API_BASE}/invoices/${row.invoice.invoiceId}/pdf`, "_blank", "noopener,noreferrer");
          setActionNote(`Opened invoice PDF for ${row.loadNumber}.`);
          return;
        }
        if (action === "DOWNLOAD_PACKET") {
          const packetPath = row.invoice.packetPath ?? null;
          if (!packetPath) {
            throw new Error("Invoice packet is not available");
          }
          const normalized = packetPath.replace(/^\/+/, "");
          window.open(`${API_BASE}/files/${normalized}`, "_blank", "noopener,noreferrer");
          setActionNote(`Opened invoice packet for ${row.loadNumber}.`);
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
        if (action === "RETRY_FACTORING") {
          await apiFetch(`/billing/loads/${row.loadId}/factoring/retry`, { method: "POST" });
          setActionNote(`Factoring retry submitted for ${row.loadNumber}.`);
          await fetchRows({ append: false });
          return;
        }
        if (action === "RETRY_QBO_SYNC") {
          await apiFetch("/finance/receivables/bulk/qbo-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ loadIds: [row.loadId], dry_run: false }),
          });
          setActionNote(`Queued QuickBooks sync for ${row.loadNumber}.`);
          await fetchRows({ append: false });
          return;
        }
        if (action === "GENERATE_INVOICE") {
          await apiFetch(`/billing/invoices/${row.loadId}/generate`, { method: "POST" });
          setActionNote(`Invoice generation started for ${row.loadNumber}.`);
          await fetchRows({ append: false });
          return;
        }
        if (action === "MARK_COLLECTED") {
          if (!canRecordPayment) {
            throw new Error("Only admin or billing can record payments.");
          }
          if (!row.invoice.invoiceId) {
            throw new Error("Generate invoice before recording payment.");
          }
          await openManualPayment(row);
          return;
        }
        if (action === "GENERATE_SETTLEMENT" || action === "VIEW_SETTLEMENT") {
          window.location.href = `/finance?tab=payables&loadId=${row.loadId}`;
          return;
        }
        if (action === "FOLLOW_UP_COLLECTION") {
          window.location.href = `/loads/${row.loadId}?tab=billing`;
          return;
        }
        window.location.href = `/loads/${row.loadId}?tab=billing`;
      } catch (err) {
        setActionError((err as Error).message);
      } finally {
        setRunningActionId(null);
      }
    },
    [canRecordPayment, fetchRows, openManualPayment]
  );

  if (loading) {
    return <EmptyState title="Checking access..." />;
  }

  if (!canAccess) {
    return <NoAccess title="Receivables" />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)_360px]">
      {error ? (
        <div className="xl:col-span-2 2xl:col-span-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}
      {actionError ? (
        <div className="xl:col-span-2 2xl:col-span-3">
          <ErrorBanner message={actionError} />
        </div>
      ) : null}
      {actionNote ? (
        <div className="xl:col-span-2 2xl:col-span-3 rounded-[var(--radius-card)] border border-[color:var(--color-success)] bg-[color:var(--color-success-soft)] px-3 py-2 text-sm text-[color:var(--color-success)]">
          {actionNote}
        </div>
      ) : null}

      <Card className="space-y-3">
        <SectionHeader title="Saved views" subtitle="Server-side filters" />
        {focusReadiness ? (
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] px-3 py-2 text-xs text-[color:var(--color-warning)]">
            Readiness focus enabled: showing blocked receivables only.
          </div>
        ) : null}
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
            <option value="SYNCING">Syncing</option>
            <option value="SYNCED">Synced</option>
            <option value="FAILED">Failed</option>
          </Select>
        </div>
      </Card>

      <Card className="space-y-3 overflow-hidden">
        <SectionHeader title="Receivables board" subtitle="Canonical billing workspace" />
        <div className="flex flex-wrap items-center gap-2 px-1">
          <Button size="sm" variant="secondary" onClick={toggleSelectAllPage}>
            {rows.length > 0 && rows.every((row) => selectedIds.includes(row.loadId)) ? "Unselect page" : "Select page"}
          </Button>
          <div className="text-xs text-[color:var(--color-text-muted)]">{selectedIds.length} selected</div>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkBusy !== null}
            onClick={() => runBulkAction("/finance/receivables/bulk/generate-invoices", true, "Generate invoices")}
          >
            {bulkBusy === "/finance/receivables/bulk/generate-invoices:preview" ? "Previewing..." : "Preview invoices"}
          </Button>
          <Button
            size="sm"
            disabled={bulkBusy !== null}
            onClick={() => runBulkAction("/finance/receivables/bulk/generate-invoices", false, "Generate invoices")}
          >
            {bulkBusy === "/finance/receivables/bulk/generate-invoices:execute" ? "Running..." : "Generate invoices"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkBusy !== null}
            onClick={() => runBulkAction("/finance/receivables/bulk/qbo-sync", true, "QBO sync")}
          >
            {bulkBusy === "/finance/receivables/bulk/qbo-sync:preview" ? "Previewing..." : "Preview QBO"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkBusy !== null}
            onClick={() => runBulkAction("/finance/receivables/bulk/qbo-sync", false, "QBO sync")}
          >
            {bulkBusy === "/finance/receivables/bulk/qbo-sync:execute" ? "Queueing..." : "Queue QBO"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkBusy !== null}
            onClick={() => runBulkAction("/finance/receivables/bulk/send-reminders", true, "Reminders")}
          >
            {bulkBusy === "/finance/receivables/bulk/send-reminders:preview" ? "Previewing..." : "Preview reminders"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkBusy !== null}
            onClick={() => runBulkAction("/finance/receivables/bulk/send-reminders", false, "Reminders")}
          >
            {bulkBusy === "/finance/receivables/bulk/send-reminders:execute" ? "Sending..." : "Send reminders"}
          </Button>
        </div>
        {bulkResult ? (
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
            <div className="font-medium text-ink">
              Bulk {bulkResult.dryRun ? "preview" : "execution"}: {bulkResult.summary.ok}/{bulkResult.summary.total} ok
            </div>
            <div className="mt-1">
              {bulkResult.results
                .slice(0, 4)
                .map((result) => `${result.loadId}: ${result.ok ? "OK" : "FAIL"} (${result.message})`)
                .join(" · ")}
            </div>
          </div>
        ) : null}
        <div className="grid gap-3 md:hidden">
          {rows.map((row) => (
            <div
              key={row.loadId}
              className={`cursor-pointer rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-3 ${
                selectedId === row.loadId ? "bg-[color:var(--color-bg-muted)]" : ""
              }`}
              onClick={() => setSelectedId(row.loadId)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <input
                    type="checkbox"
                    className="mr-2 align-middle"
                    checked={selectedIds.includes(row.loadId)}
                    onChange={(event) => {
                      event.stopPropagation();
                      toggleSelected(row.loadId);
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <div className="font-semibold text-ink">{row.loadNumber}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">{row.customer ?? "-"}</div>
                </div>
                <div className="text-sm font-medium text-ink">{formatCurrency(row.amountCents)}</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusChip tone={stageTone(row.billingStage)} label={stageLabel(row.billingStage)} />
                {row.readinessSnapshot.isReady ? (
                  <StatusChip tone="success" label="Ready" />
                ) : (
                  <StatusChip tone="warning" label={`${row.readinessSnapshot.blockers.length} blocker(s)`} />
                )}
              </div>
              <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                Delivered {formatDate(row.deliveredAt)} · QBO {row.integrations.quickbooks.syncStatus}
              </div>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  disabled={runningActionId === `${row.loadId}:${row.actions.primaryAction}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    runAction(row, row.actions.primaryAction);
                  }}
                >
                  {actionLabel(row.actions.primaryAction)}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-divider)] text-left text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((row) => selectedIds.includes(row.loadId))}
                    onChange={(event) => {
                      event.stopPropagation();
                      toggleSelectAllPage();
                    }}
                  />
                </th>
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
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.loadId)}
                      onChange={(event) => {
                        event.stopPropagation();
                        toggleSelected(row.loadId);
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
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
        </div>
        {!loadingRows && rows.length === 0 ? <EmptyState title="No receivables in this view." /> : null}
        {hasMore ? (
          <div className="px-3 pb-3">
            <Button variant="secondary" onClick={() => fetchRows({ append: true, cursor: nextCursor })} disabled={loadingRows}>
              {loadingRows ? "Loading..." : "Load more"}
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3 xl:col-span-2 2xl:col-span-1">
        <SectionHeader title="Details" subtitle={selected ? selected.loadNumber : "Select a receivable"} />
        {!selected ? <EmptyState title="Pick a row to inspect blockers and actions." /> : null}
        {selected ? (
          <>
            <div className="space-y-1 text-sm text-[color:var(--color-text-muted)]">
              <div>Customer: {selected.customer ?? "-"}</div>
              <div>Amount: {formatCurrency(selected.amountCents)}</div>
              <div>Stage: {stageLabel(selected.billingStage)}</div>
              <div>Next action: {actionLabel(selected.nextBestAction || selected.actions.primaryAction)}</div>
              <div>Priority score: {selected.priorityScore ?? 0}</div>
              <div>Blocker owner: {selected.blockerOwner ?? "-"}</div>
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
              {selected.factorReady === false ? (
                <div className="rounded-[var(--radius-control)] border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] px-3 py-2 text-xs text-[color:var(--color-warning)]">
                  Factor-ready blockers: {(selected.factorReadyReasonCodes ?? []).join(", ") || "Unknown"}
                </div>
              ) : null}
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
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Manual payments</div>
                {canRecordPayment && selected.actions.allowedActions.includes("MARK_COLLECTED") ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={submittingManualPayment}
                    onClick={() => openManualPayment(selected)}
                  >
                    Record payment
                  </Button>
                ) : null}
              </div>
              {loadingPaymentHistoryFor === selected.loadId ? (
                <div className="text-xs text-[color:var(--color-text-muted)]">Loading payment history...</div>
              ) : null}
              {selectedPaymentHistory.length === 0 && loadingPaymentHistoryFor !== selected.loadId ? (
                <StatusChip tone="neutral" label="No manual payments recorded" />
              ) : null}
              {selectedPaymentHistory.length > 0 ? (
                <div className="grid gap-2">
                  {selectedPaymentHistory.slice(0, 5).map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2 text-sm"
                    >
                      <div className="font-medium text-ink">
                        {formatCurrency(payment.amountCents)} · {payment.method}
                      </div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {formatDate(payment.receivedAt)}{payment.reference ? ` · ${payment.reference}` : ""}
                      </div>
                      {payment.notes ? (
                        <div className="text-xs text-[color:var(--color-text-muted)]">{payment.notes}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {manualPaymentLoadId === selected.loadId ? (
                <div className="grid gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">Mode</div>
                      <Select value={manualPaymentMode} onChange={(event) => setManualPaymentMode(event.target.value as "FULL" | "PARTIAL")}>
                        <option value="FULL">Full payment</option>
                        <option value="PARTIAL">Partial payment</option>
                      </Select>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">Method</div>
                      <Select value={manualPaymentMethod} onChange={(event) => setManualPaymentMethod(event.target.value as InvoicePaymentRecord["method"])}>
                        <option value="ACH">ACH</option>
                        <option value="WIRE">Wire</option>
                        <option value="CHECK">Check</option>
                        <option value="CASH">Cash</option>
                        <option value="FACTORING">Factoring</option>
                        <option value="OTHER">Other</option>
                      </Select>
                    </div>
                  </div>
                  {manualPaymentMode === "PARTIAL" ? (
                    <div>
                      <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">Amount (USD)</div>
                      <Input
                        value={manualPaymentAmount}
                        onChange={(event) => setManualPaymentAmount(event.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  ) : null}
                  <div>
                    <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">Received at</div>
                    <Input
                      type="datetime-local"
                      value={manualPaymentReceivedAt}
                      onChange={(event) => setManualPaymentReceivedAt(event.target.value)}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">Reference (optional)</div>
                    <Input
                      value={manualPaymentReference}
                      onChange={(event) => setManualPaymentReference(event.target.value)}
                      placeholder="Check # / ACH trace"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">Notes (optional)</div>
                    <Input
                      value={manualPaymentNotes}
                      onChange={(event) => setManualPaymentNotes(event.target.value)}
                      placeholder="Manual payment details"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={submittingManualPayment} onClick={submitManualPayment}>
                      {submittingManualPayment ? "Saving..." : "Save payment"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={submittingManualPayment}
                      onClick={() => setManualPaymentLoadId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Allowed actions</div>
              <div className="flex flex-wrap gap-2">
                {selected.actions.allowedActions
                  .filter((action) => (action === "MARK_COLLECTED" ? canRecordPayment : true))
                  .map((action) => (
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

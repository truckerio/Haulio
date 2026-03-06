"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { FinanceCommandLaneId } from "@/components/finance/FinanceCommandPanel";
import { apiFetch } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import { formatDate as formatDate24 } from "@/lib/date-time";

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
  commercial?: {
    chargeLineCount: number;
    chargeTypes: string[];
    accessorialCount: number;
    unresolvedAccessorialCount: number;
    accessorialProofMissingCount: number;
    hasLinehaulCharge: boolean;
    hasDetentionSignal: boolean;
    hasLayoverSignal: boolean;
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

type InvoicePreflightResponse = {
  ok: boolean;
  blockingReasons: string[];
  warnings: string[];
  metrics: {
    detentionMinutesTotal: number;
    chargeLineCount: number;
    accessorialCount: number;
    unresolvedAccessorialCount: number;
    proofMissingAccessorialCount: number;
    hasLinehaulCharge: boolean;
  };
};

const SAVED_VIEWS = [
  { key: "urgent", label: "Urgent", stage: "DOCS_REVIEW,READY", readiness: "BLOCKED" },
  { key: "today", label: "Today", stage: "READY,INVOICE_SENT", readiness: "" },
  { key: "week", label: "This Week", stage: "DOCS_REVIEW,READY,INVOICE_SENT", readiness: "" },
  { key: "waiting", label: "Waiting", stage: "DOCS_REVIEW,INVOICE_SENT", readiness: "" },
  { key: "done", label: "Done", stage: "COLLECTED,SETTLED", readiness: "" },
] as const;
const DEFAULT_SAVED_VIEW = SAVED_VIEWS[0].key;

const COMMAND_LANE_META: Record<FinanceCommandLaneId, { label: string; endpoint: string | null }> = {
  GENERATE_INVOICE: {
    label: "Invoice now",
    endpoint: "/finance/receivables/bulk/generate-invoices",
  },
  RETRY_QBO_SYNC: {
    label: "Retry QBO sync",
    endpoint: "/finance/receivables/bulk/qbo-sync",
  },
  FOLLOW_UP_COLLECTION: {
    label: "Collections follow-up",
    endpoint: "/finance/receivables/bulk/send-reminders",
  },
  GENERATE_SETTLEMENT: {
    label: "Settlement handoff",
    endpoint: null,
  },
};

const MUTATING_RECEIVABLE_ACTIONS = new Set([
  "SEND_TO_FACTORING",
  "RETRY_FACTORING",
  "RETRY_QBO_SYNC",
  "MARK_COLLECTED",
  "GENERATE_SETTLEMENT",
]);

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function formatDate(value: string | null) {
  return formatDate24(value, "-");
}

function csvEscape(value: string) {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
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
  if (action === "GENERATE_INVOICE") return "Open invoice preflight";
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

function parseSavedViewKey(value: string | null): (typeof SAVED_VIEWS)[number]["key"] {
  if (!value) return DEFAULT_SAVED_VIEW;
  return SAVED_VIEWS.some((item) => item.key === value)
    ? (value as (typeof SAVED_VIEWS)[number]["key"])
    : DEFAULT_SAVED_VIEW;
}

function countActiveReceivablesFilters(params: {
  view: (typeof SAVED_VIEWS)[number]["key"];
  search: string;
  blockerCode: string;
  agingBucket: string;
  qboSyncStatus: string;
  commercialFocus: string;
}) {
  let count = 0;
  if (params.view !== DEFAULT_SAVED_VIEW) count += 1;
  if (params.search.trim()) count += 1;
  if (params.blockerCode) count += 1;
  if (params.agingBucket) count += 1;
  if (params.qboSyncStatus) count += 1;
  if (params.commercialFocus) count += 1;
  return count;
}

type ReceivablesPanelProps = {
  focusReadiness?: boolean;
  initialSearch?: string;
  commandLane?: FinanceCommandLaneId | null;
};

export function ReceivablesPanel({ focusReadiness = false, initialSearch = "", commandLane = null }: ReceivablesPanelProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useUser();
  const canAccess = Boolean(user && ["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"].includes(user.role));
  const canRecordPayment = Boolean(user && ["ADMIN", "BILLING"].includes(user.role));
  const canMutateFinance = Boolean(user && ["ADMIN", "BILLING"].includes(user.role));
  const initialView = parseSavedViewKey(searchParams.get("view"));
  const initialUrlSearch = searchParams.get("search") ?? initialSearch;
  const initialBlockerCode = searchParams.get("blockerCode") ?? "";
  const initialAgingBucket = searchParams.get("agingBucket") ?? "";
  const initialQboSyncStatus = searchParams.get("qboSyncStatus") ?? "";
  const initialCommercialFocus = searchParams.get("commercialFocus") ?? "";

  const [rows, setRows] = useState<FinanceReceivableRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [view, setView] = useState<(typeof SAVED_VIEWS)[number]["key"]>(initialView);
  const [search, setSearch] = useState(initialUrlSearch);
  const [appliedSearch, setAppliedSearch] = useState(initialUrlSearch);
  const [blockerCode, setBlockerCode] = useState(initialBlockerCode);
  const [agingBucket, setAgingBucket] = useState(initialAgingBucket);
  const [qboSyncStatus, setQboSyncStatus] = useState(initialQboSyncStatus);
  const [commercialFocus, setCommercialFocus] = useState(initialCommercialFocus);
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
  const [manualPaymentAchValidated, setManualPaymentAchValidated] = useState(false);
  const [manualPaymentAchReturnCode, setManualPaymentAchReturnCode] = useState("");
  const [manualPaymentSanctionsOverrideReason, setManualPaymentSanctionsOverrideReason] = useState("");
  const [submittingManualPayment, setSubmittingManualPayment] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<Record<string, InvoicePaymentRecord[]>>({});
  const [loadingPaymentHistoryFor, setLoadingPaymentHistoryFor] = useState<string | null>(null);
  const [exportingPreset, setExportingPreset] = useState<"ar" | "readiness" | "factoring" | null>(null);
  const [preflightByLoadId, setPreflightByLoadId] = useState<Record<string, InvoicePreflightResponse>>({});
  const [loadingPreflightFor, setLoadingPreflightFor] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedView = useMemo(() => SAVED_VIEWS.find((item) => item.key === view) ?? SAVED_VIEWS[0], [view]);
  const commandLaneConfig = commandLane ? COMMAND_LANE_META[commandLane] : null;
  const commandLaneEligibleIds = useMemo(
    () =>
      commandLane
        ? rows
            .filter((row) => row.actions?.allowedActions?.includes(commandLane))
            .filter((row) => (canMutateFinance ? true : !MUTATING_RECEIVABLE_ACTIONS.has(commandLane)))
            .map((row) => row.loadId)
        : [],
    [canMutateFinance, commandLane, rows]
  );
  const commandLaneSearchSuffix = appliedSearch ? `&search=${encodeURIComponent(appliedSearch)}` : "";

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
        if (commercialFocus) params.set("commercialFocus", commercialFocus);
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
    [agingBucket, appliedSearch, blockerCode, commercialFocus, focusReadiness, qboSyncStatus, selectedView.readiness, selectedView.stage]
  );

  useEffect(() => {
    setSelectedId(null);
    setSelectedIds([]);
    setBulkResult(null);
    setNextCursor(null);
    fetchRows({ append: false });
  }, [fetchRows, view]);

  useEffect(() => {
    setSearch(initialSearch);
    setAppliedSearch(initialSearch);
  }, [initialSearch]);

  const clearFilters = useCallback(() => {
    setView(DEFAULT_SAVED_VIEW);
    setSearch("");
    setAppliedSearch("");
    setBlockerCode("");
    setAgingBucket("");
    setQboSyncStatus("");
    setCommercialFocus("");
    setSelectedIds([]);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    if (view !== DEFAULT_SAVED_VIEW) {
      if (params.get("view") !== view) {
        params.set("view", view);
        changed = true;
      }
    } else if (params.has("view")) {
      params.delete("view");
      changed = true;
    }
    const nextSearch = appliedSearch.trim();
    if (nextSearch) {
      if (params.get("search") !== nextSearch) {
        params.set("search", nextSearch);
        changed = true;
      }
    } else if (params.has("search")) {
      params.delete("search");
      changed = true;
    }
    if (blockerCode) {
      if (params.get("blockerCode") !== blockerCode) {
        params.set("blockerCode", blockerCode);
        changed = true;
      }
    } else if (params.has("blockerCode")) {
      params.delete("blockerCode");
      changed = true;
    }
    if (agingBucket) {
      if (params.get("agingBucket") !== agingBucket) {
        params.set("agingBucket", agingBucket);
        changed = true;
      }
    } else if (params.has("agingBucket")) {
      params.delete("agingBucket");
      changed = true;
    }
    if (qboSyncStatus) {
      if (params.get("qboSyncStatus") !== qboSyncStatus) {
        params.set("qboSyncStatus", qboSyncStatus);
        changed = true;
      }
    } else if (params.has("qboSyncStatus")) {
      params.delete("qboSyncStatus");
      changed = true;
    }
    if (commercialFocus) {
      if (params.get("commercialFocus") !== commercialFocus) {
        params.set("commercialFocus", commercialFocus);
        changed = true;
      }
    } else if (params.has("commercialFocus")) {
      params.delete("commercialFocus");
      changed = true;
    }
    if (!changed) return;
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [agingBucket, appliedSearch, blockerCode, commercialFocus, pathname, qboSyncStatus, router, searchParams, view]);

  const selected = useMemo(() => rows.find((row) => row.loadId === selectedId) ?? null, [rows, selectedId]);
  const selectedPaymentHistory = selected ? paymentHistory[selected.loadId] ?? [] : [];
  const selectedPreflight = selected ? preflightByLoadId[selected.loadId] ?? null : null;
  const visibleActions = useMemo(() => {
    if (!selected) return [];
    return selected.actions.allowedActions.filter((action) => {
      if (action === "MARK_COLLECTED") return canRecordPayment;
      if (!canMutateFinance && MUTATING_RECEIVABLE_ACTIONS.has(action)) return false;
      return true;
    });
  }, [canMutateFinance, canRecordPayment, selected]);
  const activeFilterCount = useMemo(
    () =>
      countActiveReceivablesFilters({
        view,
        search: appliedSearch,
        blockerCode,
        agingBucket,
        qboSyncStatus,
        commercialFocus,
      }),
    [agingBucket, appliedSearch, blockerCode, commercialFocus, qboSyncStatus, view]
  );
  const selectionStats = useMemo(() => {
    const selectedRows = rows.filter((row) => selectedIds.includes(row.loadId));
    const totalAmountCents = selectedRows.reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
    const blockedCount = selectedRows.filter((row) => !row.readinessSnapshot.isReady).length;
    return { count: selectedRows.length, blockedCount, totalAmountCents };
  }, [rows, selectedIds]);

  useEffect(() => {
    if (!actionNote) return;
    const timer = window.setTimeout(() => setActionNote(null), 2000);
    return () => window.clearTimeout(timer);
  }, [actionNote]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openQueue = useCallback(
    (query: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "receivables");
      for (const [key, value] of Object.entries(query)) {
        params.set(key, value);
      }
      router.replace(`/finance?${params.toString()}`);
    },
    [router, searchParams]
  );

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
    if (!selected?.loadId) return;
    if (preflightByLoadId[selected.loadId]) return;
    let cancelled = false;
    setLoadingPreflightFor(selected.loadId);
    void apiFetch<InvoicePreflightResponse>(`/billing/invoices/${selected.loadId}/preflight`)
      .then((response) => {
        if (cancelled) return;
        setPreflightByLoadId((prev) => ({ ...prev, [selected.loadId]: response }));
      })
      .catch((err) => {
        if (cancelled) return;
        setActionError((err as Error).message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingPreflightFor((prev) => (prev === selected.loadId ? null : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [preflightByLoadId, selected?.loadId]);

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
      setManualPaymentAchValidated(false);
      setManualPaymentAchReturnCode("");
      setManualPaymentSanctionsOverrideReason("");
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
        compliance?: {
          achAccountValidated?: boolean;
          achReturnCode?: string;
          sanctionsOverrideReason?: string;
        };
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
      if (manualPaymentMethod === "ACH") {
        payload.compliance = {
          achAccountValidated: manualPaymentAchValidated,
        };
        const achReturnCode = manualPaymentAchReturnCode.trim().toUpperCase();
        if (achReturnCode) {
          payload.compliance.achReturnCode = achReturnCode;
        }
      }
      const overrideReason = manualPaymentSanctionsOverrideReason.trim();
      if (overrideReason) {
        payload.compliance = {
          ...(payload.compliance ?? {}),
          sanctionsOverrideReason: overrideReason,
        };
      }
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
    manualPaymentAchValidated,
    manualPaymentAchReturnCode,
    manualPaymentSanctionsOverrideReason,
    rows,
  ]);

  const runBulkAction = useCallback(
    async (
      endpoint: "/finance/receivables/bulk/generate-invoices" | "/finance/receivables/bulk/qbo-sync" | "/finance/receivables/bulk/send-reminders",
      dryRun: boolean,
      label: string,
      targetIds?: string[]
    ) => {
      if (!canMutateFinance) {
        setActionError("Finance mutations are restricted to admin and billing roles.");
        return;
      }
      const resolvedTargetIds = targetIds && targetIds.length > 0 ? targetIds : selectedIds;
      if (resolvedTargetIds.length === 0) {
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
          body: JSON.stringify({ loadIds: resolvedTargetIds, dry_run: dryRun }),
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
    [canMutateFinance, fetchRows, selectedIds]
  );

  const runFocusedLane = useCallback(
    (dryRun: boolean) => {
      if (!commandLane || !commandLaneConfig) return;
      if (!commandLaneConfig.endpoint) {
        router.push(`/finance?tab=payables${commandLaneSearchSuffix}`);
        return;
      }
      if (!canMutateFinance) {
        setActionError("Finance mutations are restricted to admin and billing roles.");
        return;
      }
      void runBulkAction(
        commandLaneConfig.endpoint as "/finance/receivables/bulk/generate-invoices" | "/finance/receivables/bulk/qbo-sync" | "/finance/receivables/bulk/send-reminders",
        dryRun,
        commandLaneConfig.label,
        commandLaneEligibleIds
      );
    },
    [canMutateFinance, commandLane, commandLaneConfig, commandLaneEligibleIds, commandLaneSearchSuffix, router, runBulkAction]
  );

  const clearCommandLaneFocus = useCallback(() => {
    const next = new URLSearchParams();
    next.set("tab", "receivables");
    if (focusReadiness) next.set("focus", "readiness");
    if (appliedSearch) next.set("search", appliedSearch);
    const query = next.toString();
    router.replace(`/finance?${query}`);
  }, [appliedSearch, focusReadiness, router]);

  const runAction = useCallback(
    async (row: FinanceReceivableRow, action: string) => {
      setActionError(null);
      setActionNote(null);
      setRunningActionId(`${row.loadId}:${action}`);
      try {
        if (!canMutateFinance && MUTATING_RECEIVABLE_ACTIONS.has(action)) {
          throw new Error("Finance mutations are restricted to admin and billing roles.");
        }
        if (action === "OPEN_INVOICE" || action === "VIEW_INVOICE") {
          if (row.invoice.invoiceId) {
            window.open(`${API_BASE}/invoices/${row.invoice.invoiceId}/pdf`, "_blank", "noopener,noreferrer");
            return;
          }
          router.push(`/shipments/${row.loadId}?focus=commercial`);
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
          router.push(`/shipments/${row.loadId}`);
          return;
        }
        if (action === "UPLOAD_DOCS") {
          router.push(`/shipments/${row.loadId}?focus=documents`);
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
          router.push(`/loads/${row.loadId}?tab=billing#billing-commercial`);
          setActionNote(`Opened invoice preflight for ${row.loadNumber}.`);
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
          router.push(`/finance?tab=payables&loadId=${encodeURIComponent(row.loadId)}&search=${encodeURIComponent(row.loadNumber)}`);
          return;
        }
        if (action === "FOLLOW_UP_COLLECTION") {
          router.push(`/shipments/${row.loadId}?focus=commercial`);
          return;
        }
        router.push(`/shipments/${row.loadId}?focus=commercial`);
      } catch (err) {
        setActionError((err as Error).message);
      } finally {
        setRunningActionId(null);
      }
    },
    [canMutateFinance, canRecordPayment, fetchRows, openManualPayment, router]
  );

  const exportPreset = useCallback(
    async (preset: "ar" | "readiness" | "factoring") => {
      if (!rows.length) {
        setActionError("No receivables in the current view to export.");
        return;
      }
      setExportingPreset(preset);
      setActionError(null);
      try {
        const headersByPreset: Record<"ar" | "readiness" | "factoring", string[]> = {
          ar: [
            "Load #",
            "Customer",
            "Amount",
            "Stage",
            "Invoice #",
            "Invoice Sent",
            "Due Date",
            "Aging",
            "Days Outstanding",
            "QBO Sync",
          ],
          readiness: [
            "Load #",
            "Customer",
            "Ready",
            "Blocker Owner",
            "Blockers",
            "Top Blocker",
            "Next Action",
            "Priority Score",
            "Delivered At",
          ],
          factoring: [
            "Load #",
            "Customer",
            "Amount",
            "Factor Ready",
            "Factor Ready Reasons",
            "Last Submission Status",
            "Last Submission At",
            "Last Submission Error",
          ],
        };
        const rowsByPreset: Record<"ar" | "readiness" | "factoring", string[][]> = {
          ar: rows.map((row) => [
            row.loadNumber,
            row.customer ?? "",
            formatCurrency(row.amountCents),
            stageLabel(row.billingStage),
            row.invoice.invoiceNumber ?? "",
            formatDate(row.invoice.invoiceSentAt),
            formatDate(row.invoice.dueDate),
            row.collections.agingBucket,
            row.collections.daysOutstanding === null ? "" : String(row.collections.daysOutstanding),
            row.integrations.quickbooks.syncStatus,
          ]),
          readiness: rows.map((row) => [
            row.loadNumber,
            row.customer ?? "",
            row.readinessSnapshot.isReady ? "READY" : "BLOCKED",
            row.blockerOwner ?? "",
            row.readinessSnapshot.blockers.map((blocker) => blocker.code).join(" | "),
            row.topBlocker?.message ?? "",
            actionLabel(row.nextBestAction || row.actions.primaryAction),
            String(row.priorityScore ?? 0),
            formatDate(row.deliveredAt),
          ]),
          factoring: rows.map((row) => [
            row.loadNumber,
            row.customer ?? "",
            formatCurrency(row.amountCents),
            row.factorReady === false ? "NO" : "YES",
            (row.factorReadyReasonCodes ?? []).join(" | "),
            row.factoring.lastSubmission?.status ?? "",
            formatDate(row.factoring.lastSubmission?.createdAt ?? null),
            row.factoring.lastSubmission?.errorMessage ?? "",
          ]),
        };
        const headers = headersByPreset[preset];
        const bodyRows = rowsByPreset[preset];
        const lines = [headers.map(csvEscape).join(",")];
        for (const line of bodyRows) {
          lines.push(line.map((value) => csvEscape(value)).join(","));
        }
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const datePart = new Date().toISOString().slice(0, 10);
        const filename = `receivables_${preset}_${selectedView.key}_${datePart}.csv`;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setActionNote(`Exported ${bodyRows.length} receivable row(s) for ${preset.toUpperCase()}.`);
      } catch (err) {
        setActionError((err as Error).message || "Failed to export receivables.");
      } finally {
        setExportingPreset(null);
      }
    },
    [rows, selectedView.key]
  );

  if (loading) {
    return <EmptyState title="Checking access..." />;
  }

  if (!canAccess) {
    return <NoAccess title="Receivables" />;
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[210px_minmax(0,1fr)] 2xl:grid-cols-[210px_minmax(0,1fr)_340px]">
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

      <Card className="space-y-3 !p-3 sm:!p-4">
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
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Load #, customer, invoice #, detention, layover"
            onKeyDown={(event) => {
              if (event.key === "Enter") setAppliedSearch(search.trim());
            }}
          />
          <Button variant="secondary" onClick={() => setAppliedSearch(search.trim())}>
            Apply
          </Button>
          <div className="text-[11px] text-[color:var(--color-text-muted)]">Shortcut: press `/` to focus search</div>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Filters</div>
          <Select value={blockerCode} onChange={(e) => setBlockerCode(e.target.value)}>
            <option value="">All blockers</option>
            <option value="DELIVERY_INCOMPLETE">Delivery incomplete</option>
            <option value="POD_MISSING">POD missing</option>
            <option value="BOL_MISSING">BOL missing</option>
            <option value="RATECON_MISSING">RateCon missing</option>
            <option value="ACCESSORIAL_PROOF_MISSING">Accessorial proof missing</option>
            <option value="ACCESSORIAL_PENDING">Accessorial pending</option>
            <option value="INVOICE_REQUIRED">Invoice required policy</option>
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
          <Select value={commercialFocus} onChange={(e) => setCommercialFocus(e.target.value)}>
            <option value="">All commercial focus</option>
            <option value="DETENTION">Detention lines</option>
            <option value="LAYOVER">Layover lines</option>
            <option value="PROOF_GAP">Proof gaps</option>
            <option value="ACCESSORIAL_PENDING">Pending accessorials</option>
            <option value="MISSING_LINEHAUL">Missing linehaul</option>
          </Select>
        </div>
      </Card>

      <Card className="space-y-3 overflow-hidden !p-3 sm:!p-4">
        <SectionHeader title="Receivables board" subtitle="Canonical billing workspace" />
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-2 py-2">
          <div className="text-xs font-medium text-ink">Quick queues</div>
          <Button size="sm" variant="secondary" onClick={() => openQueue({ view: "urgent", focus: "readiness" })}>
            Docs blockers
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openQueue({ commandLane: "GENERATE_INVOICE" })}>
            Invoice now
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openQueue({ commandLane: "RETRY_QBO_SYNC" })}>
            QBO retries
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openQueue({ blockerCode: "ACCESSORIAL_PROOF_MISSING" })}>
            Proof gaps
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openQueue({ commercialFocus: "DETENTION" })}>
            Detention review
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openQueue({ commercialFocus: "LAYOVER" })}>
            Layover review
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openQueue({ commandLane: "FOLLOW_UP_COLLECTION" })}>
            Collections
          </Button>
        </div>
        {commandLane && commandLaneConfig ? (
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-info)] bg-[color:var(--color-info-soft)] px-3 py-2 text-xs text-[color:var(--color-info)]">
            <div className="font-medium text-ink">
              Command lane focus: {commandLaneConfig.label} ({commandLaneEligibleIds.length} eligible)
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {commandLaneConfig.endpoint ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={bulkBusy !== null || !canMutateFinance}
                    onClick={() => runFocusedLane(true)}
                  >
                    {bulkBusy === `${commandLaneConfig.endpoint}:preview` ? "Previewing..." : "Preview lane"}
                  </Button>
                  <Button size="sm" disabled={bulkBusy !== null || !canMutateFinance} onClick={() => runFocusedLane(false)}>
                    {bulkBusy === `${commandLaneConfig.endpoint}:execute` ? "Running..." : "Run lane"}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => router.push(`/finance?tab=payables${commandLaneSearchSuffix}`)}>
                  Open payables
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(commandLaneEligibleIds)} disabled={commandLaneEligibleIds.length === 0}>
                Select lane rows
              </Button>
              <Button size="sm" variant="ghost" onClick={clearCommandLaneFocus}>
                Clear lane focus
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 px-1">
          <Button size="sm" variant="secondary" onClick={toggleSelectAllPage}>
            {rows.length > 0 && rows.every((row) => selectedIds.includes(row.loadId)) ? "Unselect page" : "Select page"}
          </Button>
          <div className="text-xs text-[color:var(--color-text-muted)]">{selectedIds.length} selected</div>
          <StatusChip tone={activeFilterCount > 0 ? "warning" : "neutral"} label={activeFilterCount > 0 ? `${activeFilterCount} active filter(s)` : "No active filters"} />
          <Button size="sm" variant="secondary" onClick={clearFilters} disabled={activeFilterCount === 0}>
            Clear filters
          </Button>
          <Button size="sm" variant="secondary" onClick={() => fetchRows({ append: false })} disabled={loadingRows}>
            {loadingRows ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={exportingPreset !== null || rows.length === 0}
            onClick={() => void exportPreset("ar")}
          >
            {exportingPreset === "ar" ? "Exporting..." : "Export AR"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={exportingPreset !== null || rows.length === 0}
            onClick={() => void exportPreset("readiness")}
          >
            {exportingPreset === "readiness" ? "Exporting..." : "Export readiness"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={exportingPreset !== null || rows.length === 0}
            onClick={() => void exportPreset("factoring")}
          >
            {exportingPreset === "factoring" ? "Exporting..." : "Export factoring"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkBusy !== null || !canMutateFinance}
            onClick={() => runBulkAction("/finance/receivables/bulk/generate-invoices", true, "Generate invoices")}
          >
            {bulkBusy === "/finance/receivables/bulk/generate-invoices:preview" ? "Previewing..." : "Preview invoices"}
          </Button>
          <Button
            size="sm"
            disabled={bulkBusy !== null || !canMutateFinance}
            onClick={() => runBulkAction("/finance/receivables/bulk/generate-invoices", false, "Generate invoices")}
          >
            {bulkBusy === "/finance/receivables/bulk/generate-invoices:execute" ? "Running..." : "Generate invoices"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkBusy !== null || !canMutateFinance}
            onClick={() => runBulkAction("/finance/receivables/bulk/qbo-sync", true, "QBO sync")}
          >
            {bulkBusy === "/finance/receivables/bulk/qbo-sync:preview" ? "Previewing..." : "Preview QBO"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkBusy !== null || !canMutateFinance}
            onClick={() => runBulkAction("/finance/receivables/bulk/qbo-sync", false, "QBO sync")}
          >
            {bulkBusy === "/finance/receivables/bulk/qbo-sync:execute" ? "Queueing..." : "Queue QBO"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkBusy !== null || !canMutateFinance}
            onClick={() => runBulkAction("/finance/receivables/bulk/send-reminders", true, "Reminders")}
          >
            {bulkBusy === "/finance/receivables/bulk/send-reminders:preview" ? "Previewing..." : "Preview reminders"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkBusy !== null || !canMutateFinance}
            onClick={() => runBulkAction("/finance/receivables/bulk/send-reminders", false, "Reminders")}
          >
            {bulkBusy === "/finance/receivables/bulk/send-reminders:execute" ? "Sending..." : "Send reminders"}
          </Button>
        </div>
        {selectionStats.count > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-2 text-xs text-[color:var(--color-text-muted)]">
            <StatusChip tone="info" label={`${selectionStats.count} selected`} />
            <span>Amount {formatCurrency(selectionStats.totalAmountCents)}</span>
            <span>{selectionStats.blockedCount} blocked</span>
            <span>{selectionStats.count - selectionStats.blockedCount} ready</span>
          </div>
        ) : null}
        {!canMutateFinance ? (
          <div className="px-1 text-xs text-[color:var(--color-text-muted)]">
            Read-only mode: dispatch roles can review blockers and preflight, but finance mutations are disabled.
          </div>
        ) : null}
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
        <div className="grid gap-2 md:hidden">
          {rows.map((row) => (
            <div
              key={row.loadId}
              className={`cursor-pointer rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2.5 ${
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
          <table className="w-full min-w-[820px] text-xs">
            <thead>
              <tr className="border-b border-[color:var(--color-divider)] text-left text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
                <th className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((row) => selectedIds.includes(row.loadId))}
                    onChange={(event) => {
                      event.stopPropagation();
                      toggleSelectAllPage();
                    }}
                  />
                </th>
                <th className="px-2 py-1.5">Load</th>
                <th className="px-2 py-1.5">Customer</th>
                <th className="px-2 py-1.5">Amount</th>
                <th className="px-2 py-1.5">Stage</th>
                <th className="px-2 py-1.5">Readiness</th>
                <th className="px-2 py-1.5">Invoice</th>
                <th className="px-2 py-1.5">Aging</th>
                <th className="px-2 py-1.5">QBO</th>
                <th className="px-2 py-1.5">Action</th>
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
                  <td className="px-2 py-2">
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
                  <td className="px-2 py-2">
                    <div className="font-semibold text-ink">{row.loadNumber}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">Delivered {formatDate(row.deliveredAt)}</div>
                  </td>
                  <td className="px-2 py-2">{row.customer ?? "-"}</td>
                  <td className="px-2 py-2">{formatCurrency(row.amountCents)}</td>
                  <td className="px-2 py-2">
                    <StatusChip tone={stageTone(row.billingStage)} label={stageLabel(row.billingStage)} />
                  </td>
                  <td className="px-2 py-2">
                    {row.readinessSnapshot.isReady ? (
                      <StatusChip tone="success" label="Ready" />
                    ) : (
                      <StatusChip tone="warning" label={`${row.readinessSnapshot.blockers.length} blocker(s)`} />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {row.invoice.invoiceNumber ? (
                      <div>
                        <div>{row.invoice.invoiceNumber}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">Sent {formatDate(row.invoice.invoiceSentAt)}</div>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-2 py-2">{row.collections.agingBucket === "unknown" ? "-" : row.collections.agingBucket}</td>
                  <td className="px-2 py-2">
                    <StatusChip tone={syncTone(row.integrations.quickbooks.syncStatus)} label={row.integrations.quickbooks.syncStatus} />
                  </td>
                  <td className="px-2 py-2">
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
        {!loadingRows && rows.length === 0 ? (
          <EmptyState
            title="No receivables in this view."
            description="Try clearing filters or refreshing this queue."
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={clearFilters} disabled={activeFilterCount === 0}>
                  Clear filters
                </Button>
                <Button size="sm" variant="secondary" onClick={() => fetchRows({ append: false })} disabled={loadingRows}>
                  Refresh
                </Button>
              </div>
            }
          />
        ) : null}
        {hasMore ? (
          <div className="px-2 pb-2">
            <Button variant="secondary" onClick={() => fetchRows({ append: true, cursor: nextCursor })} disabled={loadingRows}>
              {loadingRows ? "Loading..." : "Load more"}
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3 !p-3 sm:!p-4 xl:col-span-2 2xl:col-span-1">
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
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Commercial preflight</div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => router.push(`/loads/${selected.loadId}?tab=billing#billing-commercial`)}
                >
                  Open billing preflight
                </Button>
              </div>
              {loadingPreflightFor === selected.loadId ? (
                <div className="text-xs text-[color:var(--color-text-muted)]">Loading preflight snapshot...</div>
              ) : null}
              {selectedPreflight?.blockingReasons?.length ? (
                <div className="grid gap-1 text-xs text-[color:var(--color-danger)]">
                  {selectedPreflight.blockingReasons.map((reason) => (
                    <div key={`${selected.loadId}-preflight-blocker-${reason}`}>Blocker: {reason}</div>
                  ))}
                </div>
              ) : null}
              {selectedPreflight?.warnings?.length ? (
                <div className="grid gap-1 text-xs text-[color:var(--color-warning)]">
                  {selectedPreflight.warnings.map((warning) => (
                    <div key={`${selected.loadId}-preflight-warning-${warning}`}>Warning: {warning}</div>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-2 text-xs text-[color:var(--color-text-muted)]">
                <div>Charge lines: {selectedPreflight?.metrics.chargeLineCount ?? selected.commercial?.chargeLineCount ?? 0}</div>
                <div>Accessorials: {selectedPreflight?.metrics.accessorialCount ?? selected.commercial?.accessorialCount ?? 0}</div>
                <div>
                  Pending accessorials:{" "}
                  {selectedPreflight?.metrics.unresolvedAccessorialCount ?? selected.commercial?.unresolvedAccessorialCount ?? 0}
                </div>
                <div>
                  Proof missing:{" "}
                  {selectedPreflight?.metrics.proofMissingAccessorialCount ?? selected.commercial?.accessorialProofMissingCount ?? 0}
                </div>
                <div>Detention minutes: {selectedPreflight?.metrics.detentionMinutesTotal ?? 0}</div>
              </div>
              {(selected.commercial?.chargeTypes?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {selected.commercial?.chargeTypes.slice(0, 5).map((type) => (
                    <StatusChip key={`${selected.loadId}-${type}`} tone="neutral" label={type} />
                  ))}
                </div>
              ) : (
                <StatusChip
                  tone={selectedPreflight?.metrics.hasLinehaulCharge ? "neutral" : "warning"}
                  label={selectedPreflight?.metrics.hasLinehaulCharge ? "Linehaul present" : "No charge lines yet"}
                />
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
                  {manualPaymentMethod === "ACH" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                        <input
                          type="checkbox"
                          checked={manualPaymentAchValidated}
                          onChange={(event) => setManualPaymentAchValidated(event.target.checked)}
                        />
                        ACH account validated
                      </label>
                      <div>
                        <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">ACH return code (optional)</div>
                        <Input
                          value={manualPaymentAchReturnCode}
                          onChange={(event) => setManualPaymentAchReturnCode(event.target.value)}
                          placeholder="R01, R29..."
                        />
                      </div>
                    </div>
                  ) : null}
                  {user?.role === "ADMIN" ? (
                    <div>
                      <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">Sanctions override reason (admin)</div>
                      <Input
                        value={manualPaymentSanctionsOverrideReason}
                        onChange={(event) => setManualPaymentSanctionsOverrideReason(event.target.value)}
                        placeholder="Only used when sanctions policy blocks and override is enabled"
                      />
                    </div>
                  ) : null}
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
                {visibleActions.map((action) => (
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

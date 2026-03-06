"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-banner";
import { RouteGuard } from "@/components/rbac/route-guard";
import { apiFetch } from "@/lib/api";
import { formatDate as formatDate24 } from "@/lib/date-time";

type PayableRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: "PAYABLE_READY" | "RUN_DRAFT" | "RUN_PREVIEWED" | "RUN_FINALIZED" | "PAID";
  previewChecksum: string | null;
  finalizedChecksum: string | null;
  holdReasonCode?: string | null;
  holdOwner?: "DISPATCH" | "DRIVER" | "BILLING" | "SYSTEM" | null;
  holdNotes?: string | null;
  anomalyCount?: number;
  finalizedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  createdBy?: { id: string; name?: string | null; email?: string | null } | null;
  totals: {
    earningsCents: number;
    deductionsCents: number;
    reimbursementsCents: number;
    netCents: number;
  };
  lineItemCount: number;
};

type PayableAnomaly = {
  code: string;
  severity: "warning" | "critical";
  message: string;
  partyId?: string;
  meta?: Record<string, unknown>;
};

type PayableLineItem = {
  id: string;
  partyType: "DRIVER" | "CARRIER" | "VENDOR";
  partyId: string;
  loadId: string | null;
  type: "EARNING" | "DEDUCTION" | "REIMBURSEMENT";
  amountCents: number;
  paidMiles?: string | number | null;
  ratePerMile?: string | number | null;
  milesSource?: "PLANNED" | "APPROVED_ACTUAL" | "MANUAL_OVERRIDE" | null;
  milesVariancePct?: string | number | null;
  requiresReview?: boolean;
  reviewReasonCode?: string | null;
  memo: string | null;
};

type Statement = {
  partyId: string;
  partyName: string;
  totals: {
    earningsCents: number;
    deductionsCents: number;
    reimbursementsCents: number;
    netCents: number;
  };
  items: PayableLineItem[];
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function formatNumber(value: string | number | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num.toFixed(fractionDigits);
}

function runStatusTone(status: PayableRun["status"]) {
  if (status === "PAID") return "success" as const;
  if (status === "RUN_FINALIZED") return "info" as const;
  if (status === "RUN_PREVIEWED") return "warning" as const;
  if (status === "PAYABLE_READY") return "neutral" as const;
  if (status === "RUN_DRAFT") return "neutral" as const;
  return "neutral" as const;
}

function runStatusLabel(status: PayableRun["status"]) {
  if (status === "PAYABLE_READY") return "Needs Review";
  if (status === "RUN_DRAFT") return "Approved";
  if (status === "RUN_PREVIEWED") return "In Run";
  if (status === "RUN_FINALIZED") return "Finalized";
  if (status === "PAID") return "Paid";
  return String(status).replaceAll("_", " ");
}

type PayablesPanelProps = {
  focusLoadId?: string | null;
  receivablesSearch?: string;
};

export function PayablesPanel({ focusLoadId = null, receivablesSearch = "" }: PayablesPanelProps) {
  const router = useRouter();
  const [runs, setRuns] = useState<PayableRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteTone, setNoteTone] = useState<"info" | "success" | "warning">("info");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<PayableLineItem[]>([]);
  const [previewAnomalies, setPreviewAnomalies] = useState<PayableAnomaly[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [form, setForm] = useState({ periodStart: "", periodEnd: "" });

  const selectedRun = useMemo(() => runs.find((run) => run.id === selectedRunId) ?? null, [runs, selectedRunId]);
  const runStats = useMemo(() => {
    let needsReview = 0;
    let approved = 0;
    let inRun = 0;
    let finalized = 0;
    let paid = 0;
    let holds = 0;
    for (const run of runs) {
      if (run.status === "PAYABLE_READY") needsReview += 1;
      if (run.status === "RUN_DRAFT") approved += 1;
      if (run.status === "RUN_PREVIEWED") inRun += 1;
      if (run.status === "RUN_FINALIZED") finalized += 1;
      if (run.status === "PAID") paid += 1;
      if (run.holdReasonCode) holds += 1;
    }
    return { needsReview, approved, inRun, finalized, paid, holds };
  }, [runs]);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ runs: PayableRun[] }>("/payables/runs");
      setRuns(data.runs ?? []);
      if (!selectedRunId && data.runs?.length) {
        setSelectedRunId(data.runs[0]?.id ?? null);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedRunId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 2600);
    return () => window.clearTimeout(timer);
  }, [note]);

  const isMutating = actionBusy !== null;

  const createRun = async () => {
    if (!form.periodStart || !form.periodEnd) return;
    setNote(null);
    setError(null);
    setActionBusy("create");
    try {
      const response = await apiFetch<{ run: PayableRun }>("/payables/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSelectedRunId(response.run.id);
      setForm({ periodStart: "", periodEnd: "" });
      setNoteTone("success");
      setNote("Run created. Preview to generate deterministic line items.");
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  const previewRun = async (runId: string) => {
    setNote(null);
    setError(null);
    setActionBusy(`preview:${runId}`);
    try {
      const response = await apiFetch<{
        lineItems: PayableLineItem[];
        previewChecksum: string;
        diff: { added: number; removed: number };
        anomalies?: PayableAnomaly[];
        hold?: { reasonCode: string | null; owner: string | null };
      }>(
        `/payables/runs/${runId}/preview`,
        { method: "POST" }
      );
      setPreviewItems(response.lineItems ?? []);
      setPreviewAnomalies(response.anomalies ?? []);
      const anomalyText = (response.anomalies ?? []).length > 0 ? ` · ${response.anomalies?.length} anomaly(s)` : "";
      setNoteTone((response.anomalies ?? []).length > 0 ? "warning" : "success");
      setNote(`Preview ready. Checksum ${response.previewChecksum.slice(0, 12)}… · +${response.diff.added} / -${response.diff.removed}${anomalyText}`);
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  const finalizeRun = async (runId: string) => {
    setNote(null);
    setError(null);
    setActionBusy(`finalize:${runId}`);
    try {
      const response = await apiFetch<{ idempotent: boolean }>(`/payables/runs/${runId}/finalize`, { method: "POST" });
      setNoteTone(response.idempotent ? "warning" : "success");
      setNote(response.idempotent ? "Run was already finalized." : "Run finalized.");
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  const markPaid = async (runId: string) => {
    setNote(null);
    setError(null);
    setActionBusy(`markPaid:${runId}`);
    try {
      await apiFetch(`/payables/runs/${runId}/mark-paid`, { method: "POST" });
      setNoteTone("success");
      setNote("Run marked as paid.");
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  const putRunOnHold = async (runId: string) => {
    setNote(null);
    setError(null);
    setActionBusy(`hold:${runId}`);
    try {
      await apiFetch(`/payables/runs/${runId}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reasonCode: "MANUAL_REVIEW",
          owner: "BILLING",
          notes: "Manual hold set from payables workspace.",
        }),
      });
      setNoteTone("warning");
      setNote("Run put on hold.");
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  const releaseHold = async (runId: string) => {
    setNote(null);
    setError(null);
    setActionBusy(`releaseHold:${runId}`);
    try {
      await apiFetch(`/payables/runs/${runId}/release-hold`, { method: "POST" });
      setNoteTone("success");
      setNote("Run hold released.");
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  const loadStatements = async (runId: string) => {
    setError(null);
    setActionBusy(`statements:${runId}`);
    try {
      const response = await apiFetch<{ statements: Statement[] }>(`/payables/runs/${runId}/statements`);
      setStatements(response.statements ?? []);
      setNoteTone("info");
      setNote(`Loaded ${response.statements?.length ?? 0} statement(s).`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <RouteGuard allowedRoles={["ADMIN", "BILLING"]}>
      {error ? <ErrorBanner message={error} /> : null}
      {note ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-muted)]">
          <StatusChip
            tone={noteTone}
            label={
              noteTone === "success"
                ? "Saved"
                : noteTone === "warning"
                  ? "Needs attention"
                  : "Update"
            }
          />
          <span>{note}</span>
          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" onClick={() => setNote(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}
      {focusLoadId ? (
        <Card className="space-y-3">
          <SectionHeader title="Receivables handoff" subtitle={`Settlement context for load ${focusLoadId}`} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => router.push(`/shipments/${focusLoadId}?focus=commercial`)}>
              Open shipment
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                router.push(
                  receivablesSearch
                    ? `/finance?tab=receivables&search=${encodeURIComponent(receivablesSearch)}`
                    : "/finance?tab=receivables"
                )
              }
            >
              Back to receivables
            </Button>
            <Button size="sm" variant="secondary" onClick={() => router.push("/finance?tab=payables")}>
              Clear context
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-3">
        <SectionHeader title="Payables workflow" subtitle="Track run lifecycle and jump to the next queue" />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">Needs review</div>
            <div className="mt-1 text-lg font-semibold text-ink">{runStats.needsReview}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">Approved</div>
            <div className="mt-1 text-lg font-semibold text-ink">{runStats.approved}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">In run</div>
            <div className="mt-1 text-lg font-semibold text-ink">{runStats.inRun}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">Finalized</div>
            <div className="mt-1 text-lg font-semibold text-ink">{runStats.finalized}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">Paid</div>
            <div className="mt-1 text-lg font-semibold text-ink">{runStats.paid}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">On hold</div>
            <div className="mt-1 text-lg font-semibold text-ink">{runStats.holds}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              router.push(
                receivablesSearch
                  ? `/finance?tab=receivables&commandLane=GENERATE_SETTLEMENT&search=${encodeURIComponent(receivablesSearch)}`
                  : "/finance?tab=receivables&commandLane=GENERATE_SETTLEMENT"
              )
            }
          >
            Open settlement handoff queue
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              router.push(
                receivablesSearch
                  ? `/finance?tab=receivables&search=${encodeURIComponent(receivablesSearch)}`
                  : "/finance?tab=receivables"
              )
            }
          >
            Back to receivables triage
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <SectionHeader title="Create run" subtitle="Choose settlement period" />
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Period start" htmlFor="payablePeriodStart">
            <Input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
          </FormField>
          <FormField label="Period end" htmlFor="payablePeriodEnd">
            <Input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
          </FormField>
        </div>
        <Button onClick={createRun} disabled={!form.periodStart || !form.periodEnd || isMutating}>
          {actionBusy === "create" ? "Creating..." : "Create run"}
        </Button>
      </Card>

      <Card className="space-y-4">
        <SectionHeader title="Payable runs" subtitle="Preview, finalize, and pay" />
        {loading ? <EmptyState title="Loading runs..." /> : null}
        {!loading && runs.length === 0 ? (
          <EmptyState
            title="No runs yet."
            description="Create your first payable run."
            action={
              <Button size="sm" variant="secondary" onClick={loadRuns} disabled={loading || isMutating}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
            }
          />
        ) : null}
        <div className="grid gap-3">
          {runs.map((run) => (
            <div
              key={run.id}
              className={`rounded-[var(--radius-card)] border px-4 py-3 ${
                run.id === selectedRunId
                  ? "border-[color:var(--color-divider-strong)] bg-[color:var(--color-surface-muted)]"
                  : "border-[color:var(--color-divider)] bg-[color:var(--color-surface)]"
              }`}
              onClick={() => setSelectedRunId(run.id)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-ink">
                  {formatDate24(run.periodStart)} - {formatDate24(run.periodEnd)}
                </div>
                <StatusChip label={runStatusLabel(run.status)} tone={runStatusTone(run.status)} />
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                {run.lineItemCount} lines · Net {formatCurrency(run.totals.netCents)}
              </div>
              {run.holdReasonCode ? (
                <div className="mt-1 text-xs text-[color:var(--color-danger)]">
                  Hold: {run.holdReasonCode} ({run.holdOwner ?? "BILLING"})
                </div>
              ) : null}
              {(run.anomalyCount ?? 0) > 0 ? (
                <div className="mt-1 text-xs text-[color:var(--color-warning)]">
                  {(run.anomalyCount ?? 0)} anomaly(s) flagged in preview
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={(e) => {
                  e.stopPropagation();
                  previewRun(run.id);
                }} disabled={isMutating}>
                  {actionBusy === `preview:${run.id}` ? "Previewing..." : "Preview"}
                </Button>
                <Button size="sm" onClick={(e) => {
                  e.stopPropagation();
                  finalizeRun(run.id);
                }} disabled={isMutating}>
                  {actionBusy === `finalize:${run.id}` ? "Finalizing..." : "Finalize"}
                </Button>
                <Button size="sm" variant="secondary" onClick={(e) => {
                  e.stopPropagation();
                  markPaid(run.id);
                }} disabled={isMutating}>
                  {actionBusy === `markPaid:${run.id}` ? "Updating..." : "Mark paid"}
                </Button>
                <Button size="sm" variant="secondary" onClick={(e) => {
                  e.stopPropagation();
                  loadStatements(run.id);
                }} disabled={isMutating}>
                  {actionBusy === `statements:${run.id}` ? "Loading..." : "Driver statements"}
                </Button>
                <Button size="sm" variant="secondary" onClick={(e) => {
                  e.stopPropagation();
                  putRunOnHold(run.id);
                }} disabled={isMutating}>
                  {actionBusy === `hold:${run.id}` ? "Holding..." : "Hold"}
                </Button>
                <Button size="sm" variant="secondary" onClick={(e) => {
                  e.stopPropagation();
                  releaseHold(run.id);
                }} disabled={isMutating}>
                  {actionBusy === `releaseHold:${run.id}` ? "Releasing..." : "Release hold"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <SectionHeader title="Preview" subtitle={selectedRun ? `Run ${selectedRun.id}` : "Select a run"} />
        {previewAnomalies.length > 0 ? (
          <div className="grid gap-2">
            {previewAnomalies.map((anomaly, idx) => (
              <div
                key={`${anomaly.code}-${idx}`}
                className={`rounded-[var(--radius-control)] border px-3 py-2 text-xs ${
                  anomaly.severity === "critical"
                    ? "border-[color:var(--color-danger)] bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]"
                    : "border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]"
                }`}
              >
                <div className="font-medium">{anomaly.code}</div>
                <div>{anomaly.message}</div>
              </div>
            ))}
          </div>
        ) : null}
        {previewItems.length === 0 ? (
          <EmptyState title="No preview loaded." description="Run preview to generate deterministic line items." />
        ) : (
          <div className="grid gap-2">
            {previewItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-ink">{item.memo || item.type}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">{item.partyType} · {item.partyId}</div>
                  {item.paidMiles ? (
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {formatNumber(item.paidMiles)} mi @ ${formatNumber(item.ratePerMile, 4) ?? "0.0000"}/mi · {item.milesSource ?? "PLANNED"}
                      {item.milesVariancePct ? ` · variance ${formatNumber(item.milesVariancePct)}%` : ""}
                    </div>
                  ) : null}
                  {item.requiresReview ? (
                    <div className="text-xs text-[color:var(--color-warning)]">
                      Review needed: {item.reviewReasonCode ?? "MILES_REVIEW_REQUIRED"}
                    </div>
                  ) : null}
                </div>
                <div>{formatCurrency(item.amountCents)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <SectionHeader title="Driver statements" subtitle="Load breakdown + deductions" />
        {statements.length === 0 ? <EmptyState title="No statements loaded." /> : null}
        <div className="grid gap-3">
          {statements.map((statement) => (
            <div key={statement.partyId} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-4 py-3">
              <div className="text-sm font-semibold text-ink">{statement.partyName}</div>
              <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                Earnings {formatCurrency(statement.totals.earningsCents)} · Deductions {formatCurrency(statement.totals.deductionsCents)} · Net {formatCurrency(statement.totals.netCents)}
              </div>
              <div className="mt-2 grid gap-2">
                {statement.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2 text-sm">
                    <span>
                      {item.memo || item.type}
                      {item.paidMiles ? (
                        <span className="ml-2 text-xs text-[color:var(--color-text-muted)]">
                          ({formatNumber(item.paidMiles)} mi)
                        </span>
                      ) : null}
                    </span>
                    <span>{formatCurrency(item.amountCents)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </RouteGuard>
  );
}

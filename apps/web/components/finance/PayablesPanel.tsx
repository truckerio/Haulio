"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export function PayablesPanel() {
  const [runs, setRuns] = useState<PayableRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<PayableLineItem[]>([]);
  const [previewAnomalies, setPreviewAnomalies] = useState<PayableAnomaly[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [form, setForm] = useState({ periodStart: "", periodEnd: "" });

  const selectedRun = useMemo(() => runs.find((run) => run.id === selectedRunId) ?? null, [runs, selectedRunId]);

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

  const createRun = async () => {
    if (!form.periodStart || !form.periodEnd) return;
    setNote(null);
    try {
      const response = await apiFetch<{ run: PayableRun }>("/payables/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSelectedRunId(response.run.id);
      setForm({ periodStart: "", periodEnd: "" });
      setNote("Run created. Preview to generate deterministic line items.");
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const previewRun = async (runId: string) => {
    setNote(null);
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
      setNote(`Preview ready. Checksum ${response.previewChecksum.slice(0, 12)}… · +${response.diff.added} / -${response.diff.removed}${anomalyText}`);
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const finalizeRun = async (runId: string) => {
    setNote(null);
    try {
      const response = await apiFetch<{ idempotent: boolean }>(`/payables/runs/${runId}/finalize`, { method: "POST" });
      setNote(response.idempotent ? "Run was already finalized." : "Run finalized.");
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const markPaid = async (runId: string) => {
    setNote(null);
    try {
      await apiFetch(`/payables/runs/${runId}/mark-paid`, { method: "POST" });
      setNote("Run marked as paid.");
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const putRunOnHold = async (runId: string) => {
    setNote(null);
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
      setNote("Run put on hold.");
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const releaseHold = async (runId: string) => {
    setNote(null);
    try {
      await apiFetch(`/payables/runs/${runId}/release-hold`, { method: "POST" });
      setNote("Run hold released.");
      await loadRuns();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadStatements = async (runId: string) => {
    try {
      const response = await apiFetch<{ statements: Statement[] }>(`/payables/runs/${runId}/statements`);
      setStatements(response.statements ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <RouteGuard allowedRoles={["ADMIN", "BILLING"]}>
      {error ? <ErrorBanner message={error} /> : null}
      {note ? (
        <div className="rounded-[var(--radius-card)] border border-[color:var(--color-info)] bg-[color:var(--color-info-soft)] px-3 py-2 text-sm text-[color:var(--color-info)]">
          {note}
        </div>
      ) : null}

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
        <Button onClick={createRun} disabled={!form.periodStart || !form.periodEnd}>
          Create run
        </Button>
      </Card>

      <Card className="space-y-4">
        <SectionHeader title="Payable runs" subtitle="Preview, finalize, and pay" />
        {loading ? <EmptyState title="Loading runs..." /> : null}
        {!loading && runs.length === 0 ? <EmptyState title="No runs yet." description="Create your first payable run." /> : null}
        <div className="grid gap-3">
          {runs.map((run) => (
            <div
              key={run.id}
              className={`rounded-[var(--radius-card)] border px-4 py-3 ${
                run.id === selectedRunId
                  ? "border-[color:var(--color-divider-strong)] bg-[color:var(--color-surface-muted)]"
                  : "border-[color:var(--color-divider)] bg-white"
              }`}
              onClick={() => setSelectedRunId(run.id)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-ink">
                  {new Date(run.periodStart).toLocaleDateString()} - {new Date(run.periodEnd).toLocaleDateString()}
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
                }}>
                  Preview
                </Button>
                <Button size="sm" onClick={(e) => {
                  e.stopPropagation();
                  finalizeRun(run.id);
                }}>
                  Finalize
                </Button>
                <Button size="sm" variant="secondary" onClick={(e) => {
                  e.stopPropagation();
                  markPaid(run.id);
                }}>
                  Mark paid
                </Button>
                <Button size="sm" variant="secondary" onClick={(e) => {
                  e.stopPropagation();
                  loadStatements(run.id);
                }}>
                  Driver statements
                </Button>
                <Button size="sm" variant="secondary" onClick={(e) => {
                  e.stopPropagation();
                  putRunOnHold(run.id);
                }}>
                  Hold
                </Button>
                <Button size="sm" variant="secondary" onClick={(e) => {
                  e.stopPropagation();
                  releaseHold(run.id);
                }}>
                  Release hold
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
            <div key={statement.partyId} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3">
              <div className="text-sm font-semibold text-ink">{statement.partyName}</div>
              <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                Earnings {formatCurrency(statement.totals.earningsCents)} · Deductions {formatCurrency(statement.totals.deductionsCents)} · Net {formatCurrency(statement.totals.netCents)}
              </div>
              <div className="mt-2 grid gap-2">
                {statement.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2 text-sm">
                    <span>{item.memo || item.type}</span>
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

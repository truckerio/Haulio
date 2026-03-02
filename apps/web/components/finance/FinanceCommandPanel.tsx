"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { NoAccess } from "@/components/rbac/no-access";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { isForbiddenError } from "@/lib/capabilities";

type FinanceRow = {
  loadId: string;
  loadNumber: string;
  customer: string | null;
  amountCents: number;
  billingStage: "DELIVERED" | "DOCS_REVIEW" | "READY" | "INVOICE_SENT" | "COLLECTED" | "SETTLED";
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

type BulkMutationResult = {
  dryRun: boolean;
  summary: { total: number; ok: number; failed: number };
  results: Array<{ loadId: string; ok: boolean; message: string }>;
};

type CommandLane = {
  id: "GENERATE_INVOICE" | "RETRY_QBO_SYNC" | "FOLLOW_UP_COLLECTION" | "GENERATE_SETTLEMENT";
  label: string;
  subtitle: string;
  endpoint: string | null;
};

const COMMAND_LANES: CommandLane[] = [
  {
    id: "GENERATE_INVOICE",
    label: "Invoice now",
    subtitle: "Ready loads waiting for invoice generation",
    endpoint: "/finance/receivables/bulk/generate-invoices",
  },
  {
    id: "RETRY_QBO_SYNC",
    label: "Retry QBO sync",
    subtitle: "Invoice rows with QuickBooks sync failures",
    endpoint: "/finance/receivables/bulk/qbo-sync",
  },
  {
    id: "FOLLOW_UP_COLLECTION",
    label: "Collections follow-up",
    subtitle: "Sent invoices that need reminder outreach",
    endpoint: "/finance/receivables/bulk/send-reminders",
  },
  {
    id: "GENERATE_SETTLEMENT",
    label: "Settlement handoff",
    subtitle: "Collected rows ready for settlement workflow",
    endpoint: null,
  },
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function stageLabel(stage: FinanceRow["billingStage"]) {
  if (stage === "DOCS_REVIEW") return "Docs review";
  if (stage === "INVOICE_SENT") return "Invoice sent";
  return stage.replaceAll("_", " ");
}

function stageTone(stage: FinanceRow["billingStage"]) {
  if (stage === "READY" || stage === "COLLECTED" || stage === "SETTLED") return "success" as const;
  if (stage === "INVOICE_SENT") return "info" as const;
  if (stage === "DOCS_REVIEW") return "warning" as const;
  return "neutral" as const;
}

export function FinanceCommandPanel() {
  const router = useRouter();
  const { capabilities } = useUser();
  const canAccess = capabilities.canAccessFinance;
  const canMutate = capabilities.canBillActions;
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [activeLane, setActiveLane] = useState<CommandLane["id"]>("GENERATE_INVOICE");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mutationRestricted, setMutationRestricted] = useState(false);
  const [result, setResult] = useState<BulkMutationResult | null>(null);

  const loadRows = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const data = await apiFetch<ReceivablesResponse>("/finance/receivables?limit=200");
      setRows(data.items ?? data.rows ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const laneRows = useMemo(() => {
    return rows.filter((row) => row.actions?.allowedActions?.includes(activeLane));
  }, [activeLane, rows]);

  useEffect(() => {
    setSelectedIds([]);
    setResult(null);
  }, [activeLane]);

  const laneCounts = useMemo(() => {
    const map = new Map<CommandLane["id"], number>();
    for (const lane of COMMAND_LANES) {
      map.set(lane.id, rows.filter((row) => row.actions?.allowedActions?.includes(lane.id)).length);
    }
    return map;
  }, [rows]);

  const activeLaneConfig = useMemo(
    () => COMMAND_LANES.find((lane) => lane.id === activeLane) ?? COMMAND_LANES[0]!,
    [activeLane]
  );

  const selectedRows = useMemo(() => laneRows.filter((row) => selectedIds.includes(row.loadId)), [laneRows, selectedIds]);
  const actionTargetIds = selectedRows.length > 0 ? selectedRows.map((row) => row.loadId) : laneRows.map((row) => row.loadId);

  const toggleSelected = useCallback((loadId: string) => {
    setSelectedIds((prev) => (prev.includes(loadId) ? prev.filter((id) => id !== loadId) : [...prev, loadId]));
  }, []);

  const toggleSelectAllLane = useCallback(() => {
    setSelectedIds((prev) => {
      const laneIds = laneRows.map((row) => row.loadId);
      const allSelected = laneIds.length > 0 && laneIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !laneIds.includes(id));
      }
      return Array.from(new Set([...prev, ...laneIds]));
    });
  }, [laneRows]);

  const runLaneAction = useCallback(
    async (dryRun: boolean) => {
      if (!activeLaneConfig.endpoint) return;
      if (!canMutate || mutationRestricted) return;
      if (actionTargetIds.length === 0) {
        setError("No rows available in this command lane.");
        return;
      }
      setRunning(`${activeLaneConfig.id}:${dryRun ? "preview" : "execute"}`);
      setResult(null);
      setError(null);
      try {
        const payload = await apiFetch<BulkMutationResult>(activeLaneConfig.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loadIds: actionTargetIds, dryRun }),
        });
        setResult(payload);
        if (!dryRun) {
          await loadRows();
        }
      } catch (err) {
        if (isForbiddenError(err)) {
          setMutationRestricted(true);
          setError("Restricted: finance command mutation is not permitted for this role.");
          return;
        }
        setError((err as Error).message);
      } finally {
        setRunning(null);
      }
    },
    [actionTargetIds, activeLaneConfig.endpoint, activeLaneConfig.id, canMutate, loadRows, mutationRestricted]
  );

  if (!canAccess) {
    return <NoAccess title="Finance commands" description="This surface is restricted by role capability." ctaHref="/finance" ctaLabel="Open Finance" />;
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorBanner message={error} /> : null}

      <Card className="space-y-2 !p-3 sm:!p-4">
        <SectionHeader
          title="Command lanes"
          subtitle="Action-first billing queues on top of current receivables APIs"
          action={
            <Button variant="secondary" size="sm" onClick={loadRows} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {COMMAND_LANES.map((lane) => {
            const active = lane.id === activeLane;
            const count = laneCounts.get(lane.id) ?? 0;
            return (
              <button
                key={lane.id}
                type="button"
                onClick={() => setActiveLane(lane.id)}
                className={`rounded-[var(--radius-control)] border px-3 py-2 text-left transition ${
                  active
                    ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]/20"
                    : "border-[color:var(--color-divider)] hover:bg-[color:var(--color-bg-muted)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink">{lane.label}</div>
                  <StatusChip tone={count > 0 ? "warning" : "success"} label={String(count)} />
                </div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{lane.subtitle}</div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-2 !p-3 sm:!p-4">
        <SectionHeader
          title={activeLaneConfig.label}
          subtitle={`${laneRows.length} row(s) in lane · ${selectedRows.length} selected`}
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={toggleSelectAllLane}>
                {laneRows.length > 0 && laneRows.every((row) => selectedIds.includes(row.loadId)) ? "Unselect lane" : "Select lane"}
              </Button>
              {activeLaneConfig.endpoint ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canMutate || mutationRestricted || running !== null}
                    onClick={() => void runLaneAction(true)}
                  >
                    {running === `${activeLaneConfig.id}:preview` ? "Previewing..." : "Preview"}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!canMutate || mutationRestricted || running !== null}
                    onClick={() => void runLaneAction(false)}
                  >
                    {running === `${activeLaneConfig.id}:execute` ? "Running..." : "Execute"}
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => router.push("/finance?tab=payables")}>
                  Open payables
                </Button>
              )}
            </div>
          }
        />

        {!canMutate ? (
          <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-2 text-xs text-[color:var(--color-text-muted)]">
            <StatusChip tone="warning" label="Restricted" />
            Billing mutations are restricted for this role. Command lanes are read-only.
          </div>
        ) : null}

        {laneRows.length === 0 ? <EmptyState title="No rows in this lane." description="Switch lanes or refresh to re-evaluate queue eligibility." /> : null}

        {laneRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead>
                <tr className="border-b border-[color:var(--color-divider)] text-left uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
                  <th className="px-2 py-1.5" />
                  <th className="px-2 py-1.5">Load</th>
                  <th className="px-2 py-1.5">Customer</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                  <th className="px-2 py-1.5">Stage</th>
                  <th className="px-2 py-1.5">QBO</th>
                  <th className="px-2 py-1.5">Primary</th>
                </tr>
              </thead>
              <tbody>
                {laneRows.map((row) => (
                  <tr key={row.loadId} className="border-b border-[color:var(--color-divider)]">
                    <td className="px-2 py-1.5">
                      <input type="checkbox" checked={selectedIds.includes(row.loadId)} onChange={() => toggleSelected(row.loadId)} />
                    </td>
                    <td className="px-2 py-1.5 font-semibold text-ink">{row.loadNumber}</td>
                    <td className="px-2 py-1.5">{row.customer ?? "-"}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-ink">{formatCurrency(row.amountCents)}</td>
                    <td className="px-2 py-1.5">
                      <StatusChip tone={stageTone(row.billingStage)} label={stageLabel(row.billingStage)} />
                    </td>
                    <td className="px-2 py-1.5">{row.integrations?.quickbooks?.syncStatus ?? "UNKNOWN"}</td>
                    <td className="px-2 py-1.5">{row.actions?.primaryAction ?? "OPEN_LOAD"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {result ? (
          <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
            <div className="font-medium text-ink">
              {result.dryRun ? "Preview" : "Execution"}: {result.summary.ok}/{result.summary.total} ok
            </div>
            <div className="mt-1">
              {(result.results ?? [])
                .slice(0, 4)
                .map((item) => `${item.loadId}: ${item.ok ? "OK" : "FAIL"} (${item.message})`)
                .join(" · ")}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

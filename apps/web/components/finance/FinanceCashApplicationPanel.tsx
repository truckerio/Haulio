"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { formatDate as formatDate24 } from "@/lib/date-time";

type CashMatchStatus = "SUGGESTED" | "MATCHED" | "POSTED" | "REJECTED";
type CashBatchStatus = "IMPORTED" | "POSTED";

type CashApplicationMatch = {
  id: string;
  status: CashMatchStatus;
  amountCents: number;
  confidence: string | number;
  invoiceId: string | null;
  loadId: string | null;
  remittanceRef: string | null;
  notes?: string | null;
  postedPaymentId?: string | null;
  createdAt: string;
  invoice?: { id: string; invoiceNumber: string; status: string; totalAmount: string | number | null } | null;
  load?: { id: string; loadNumber: string; status: string } | null;
};

type CashApplicationBatch = {
  id: string;
  status: CashBatchStatus;
  sourceFileName: string | null;
  importedAt: string;
  postedAt: string | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
  matches: CashApplicationMatch[];
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function formatDate(value: string | null | undefined) {
  return formatDate24(value ?? null, "-");
}

function statusTone(status: CashBatchStatus | CashMatchStatus) {
  if (status === "POSTED" || status === "MATCHED") return "success" as const;
  if (status === "SUGGESTED") return "warning" as const;
  return "neutral" as const;
}

type ParsedEntry = {
  invoiceNumber?: string;
  amountCents: number;
  remittanceRef?: string;
  notes?: string;
};

function parseEntriesFromCsv(raw: string): { entries: ParsedEntry[]; error: string | null } {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { entries: [], error: "No rows provided." };
  const entries: ParsedEntry[] = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const row = lines[idx] ?? "";
    const cols = row.split(",").map((cell) => cell.trim());
    if (cols.length < 2) {
      return { entries: [], error: `Row ${idx + 1} is invalid. Use invoiceNumber,amountCents,remittanceRef,notes` };
    }
    const amountCents = Number(cols[1] ?? "");
    if (!Number.isFinite(amountCents) || amountCents <= 0 || !Number.isInteger(amountCents)) {
      return { entries: [], error: `Row ${idx + 1} amount must be a positive integer (cents).` };
    }
    entries.push({
      invoiceNumber: cols[0] || undefined,
      amountCents,
      remittanceRef: cols[2] || undefined,
      notes: cols.slice(3).join(",") || undefined,
    });
  }
  return { entries, error: null };
}

export function FinanceCashApplicationPanel() {
  const { capabilities } = useUser();
  const canMutate = capabilities.canBillActions;
  const [batches, setBatches] = useState<CashApplicationBatch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState("");
  const [entriesCsv, setEntriesCsv] = useState("");

  const selected = useMemo(() => batches.find((batch) => batch.id === selectedId) ?? null, [batches, selectedId]);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ batches: CashApplicationBatch[] }>("/finance/cash-app/batches");
      setBatches(data.batches ?? []);
      if (!selectedId && (data.batches?.length ?? 0) > 0) {
        setSelectedId(data.batches?.[0]?.id ?? null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 2500);
    return () => window.clearTimeout(timer);
  }, [note]);

  const importBatch = async () => {
    if (!canMutate) return;
    const parsed = parseEntriesFromCsv(entriesCsv);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setBusyKey("import");
    setError(null);
    try {
      const payload = {
        sourceFileName: sourceFileName.trim() || undefined,
        entries: parsed.entries,
      };
      const result = await apiFetch<{
        batch: { id: string };
      }>("/finance/cash-app/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setEntriesCsv("");
      setSourceFileName("");
      setSelectedId(result.batch.id);
      setNote("Cash application batch imported.");
      await loadBatches();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  const openBatch = async (batchId: string) => {
    setBusyKey(`open:${batchId}`);
    setError(null);
    try {
      const data = await apiFetch<{ batch: CashApplicationBatch }>(`/finance/cash-app/batches/${batchId}`);
      setBatches((prev) => {
        const next = prev.filter((batch) => batch.id !== data.batch.id);
        return [data.batch, ...next];
      });
      setSelectedId(batchId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  const postBatch = async (batchId: string) => {
    if (!canMutate) return;
    setBusyKey(`post:${batchId}`);
    setError(null);
    try {
      const result = await apiFetch<{ posted: number; skipped: number; idempotent?: boolean }>(`/finance/cash-app/batches/${batchId}/post`, {
        method: "POST",
      });
      setNote(result.idempotent ? "Batch already posted." : `Batch posted. ${result.posted} payment(s) created, ${result.skipped} skipped.`);
      await loadBatches();
      await openBatch(batchId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  const batchStats = useMemo(() => {
    let imported = 0;
    let posted = 0;
    let matches = 0;
    for (const batch of batches) {
      if (batch.status === "IMPORTED") imported += 1;
      if (batch.status === "POSTED") posted += 1;
      matches += batch.matches?.length ?? 0;
    }
    return { imported, posted, matches };
  }, [batches]);

  return (
    <div className="space-y-3">
      {error ? <ErrorBanner message={error} /> : null}
      {note ? <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">{note}</div> : null}

      <Card className="space-y-3 !p-3 sm:!p-4">
        <SectionHeader title="Cash Application" subtitle="Import remittance rows, match to invoices, and post payments to AR + ledger." />
        <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
          <StatusChip label={`Imported ${batchStats.imported}`} tone="warning" />
          <StatusChip label={`Posted ${batchStats.posted}`} tone="success" />
          <StatusChip label={`Rows ${batchStats.matches}`} tone="neutral" />
          <Button size="sm" variant="secondary" onClick={loadBatches} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </Card>

      {canMutate ? (
        <Card className="space-y-3 !p-3 sm:!p-4">
          <SectionHeader title="Import Remittance" subtitle="CSV-like rows: invoiceNumber,amountCents,remittanceRef,notes" />
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <FormField label="Source file" htmlFor="cashAppSourceFile">
              <Input id="cashAppSourceFile" value={sourceFileName} onChange={(event) => setSourceFileName(event.target.value)} placeholder="remittance-2026-03-06.csv" />
            </FormField>
            <div className="flex items-end">
              <Button onClick={importBatch} disabled={busyKey !== null || !entriesCsv.trim()}>
                {busyKey === "import" ? "Importing..." : "Import batch"}
              </Button>
            </div>
          </div>
          <FormField label="Remittance rows" htmlFor="cashAppRows">
            <Textarea
              id="cashAppRows"
              rows={7}
              value={entriesCsv}
              onChange={(event) => setEntriesCsv(event.target.value)}
              placeholder="INV-1001,320000,ACH-REF-1001,March remittance&#10;INV-1002,215000,ACH-REF-1002,Partial"
            />
          </FormField>
        </Card>
      ) : (
        <Card className="!p-3 text-sm text-[color:var(--color-text-muted)]">Read-only mode: Billing/Admin can import and post remittance batches.</Card>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <Card className="space-y-3 !p-3 sm:!p-4">
          <SectionHeader title="Batches" subtitle={`${batches.length} batch(es)`} />
          {batches.length === 0 ? (
            <EmptyState title={loading ? "Loading batches..." : "No cash application batches yet"} />
          ) : (
            <div className="overflow-auto rounded-[var(--radius-card)] border border-[color:var(--color-divider)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
                  <tr>
                    <th className="px-2 py-2 text-left">Batch</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Rows</th>
                    <th className="px-2 py-2 text-left">Imported</th>
                    <th className="px-2 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className={`border-t border-[color:var(--color-divider)] ${selectedId === batch.id ? "bg-[color:var(--color-bg-muted)]" : ""}`}>
                      <td className="px-2 py-2">
                        <div className="font-medium text-ink">{batch.sourceFileName || batch.id}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">{batch.id}</div>
                      </td>
                      <td className="px-2 py-2">
                        <StatusChip label={batch.status} tone={statusTone(batch.status)} />
                      </td>
                      <td className="px-2 py-2 text-sm text-[color:var(--color-text-muted)]">{batch.matches?.length ?? 0}</td>
                      <td className="px-2 py-2 text-sm text-[color:var(--color-text-muted)]">{formatDate(batch.importedAt)}</td>
                      <td className="px-2 py-2">
                        <Button size="sm" variant="ghost" onClick={() => openBatch(batch.id)} disabled={busyKey !== null}>
                          {busyKey === `open:${batch.id}` ? "Opening..." : "Open"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="space-y-3 !p-3 sm:!p-4">
          <SectionHeader title="Batch Detail" subtitle={selected ? selected.id : "Select a batch"} />
          {!selected ? (
            <EmptyState title="Open a batch to review match rows and post." />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip label={selected.status} tone={statusTone(selected.status)} />
                <span className="text-xs text-[color:var(--color-text-muted)]">
                  Imported {formatDate(selected.importedAt)} · Posted {formatDate(selected.postedAt)}
                </span>
              </div>
              {canMutate ? (
                <Button
                  size="sm"
                  onClick={() => postBatch(selected.id)}
                  disabled={busyKey !== null || selected.status === "POSTED"}
                >
                  {busyKey === `post:${selected.id}` ? "Posting..." : selected.status === "POSTED" ? "Already posted" : "Post batch"}
                </Button>
              ) : null}
              {selected.matches && selected.matches.length > 0 ? (
                <div className="max-h-[46vh] overflow-auto rounded-[var(--radius-card)] border border-[color:var(--color-divider)]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
                      <tr>
                        <th className="px-2 py-2 text-left">Invoice</th>
                        <th className="px-2 py-2 text-left">Load</th>
                        <th className="px-2 py-2 text-left">Amount</th>
                        <th className="px-2 py-2 text-left">Status</th>
                        <th className="px-2 py-2 text-left">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.matches.map((match) => (
                        <tr key={match.id} className="border-t border-[color:var(--color-divider)]">
                          <td className="px-2 py-2 text-xs">
                            {match.invoice?.invoiceNumber ?? match.invoiceId ?? "Unmatched"}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {match.load?.loadNumber ?? match.loadId ?? "-"}
                          </td>
                          <td className="px-2 py-2">{formatCurrency(match.amountCents)}</td>
                          <td className="px-2 py-2">
                            <StatusChip label={match.status} tone={statusTone(match.status)} />
                          </td>
                          <td className="px-2 py-2 text-xs text-[color:var(--color-text-muted)]">
                            {Number(match.confidence || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No match rows in this batch." />
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}


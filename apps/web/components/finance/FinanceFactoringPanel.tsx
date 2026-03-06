"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { formatDate as formatDate24 } from "@/lib/date-time";

type FactoringType = "ADVANCE" | "RESERVE_RELEASE" | "FEE" | "RECOURSE" | "ADJUSTMENT";

type FactoringTransaction = {
  id: string;
  loadId: string;
  invoiceId: string | null;
  submissionId: string | null;
  type: FactoringType;
  amountCents: number;
  occurredAt: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function formatDate(value: string | null | undefined) {
  return formatDate24(value ?? null, "-");
}

function factoringTone(type: FactoringType) {
  if (type === "FEE" || type === "RECOURSE") return "warning" as const;
  if (type === "ADVANCE" || type === "RESERVE_RELEASE") return "success" as const;
  return "neutral" as const;
}

export function FinanceFactoringPanel() {
  const { capabilities } = useUser();
  const canMutate = capabilities.canBillActions;
  const [loadId, setLoadId] = useState("");
  const [transactions, setTransactions] = useState<FactoringTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "ADVANCE" as FactoringType,
    amountCents: "",
    invoiceId: "",
    submissionId: "",
    occurredAt: "",
    reference: "",
    notes: "",
  });

  const loadTransactions = async (targetLoadId?: string) => {
    const effectiveLoadId = (targetLoadId ?? loadId).trim();
    if (!effectiveLoadId) {
      setError("Load ID is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ transactions: FactoringTransaction[] }>(`/billing/loads/${encodeURIComponent(effectiveLoadId)}/factoring/transactions`);
      setTransactions(data.transactions ?? []);
      setNote(`Loaded ${data.transactions?.length ?? 0} factoring transaction(s).`);
    } catch (err) {
      setError((err as Error).message);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const createTransaction = async () => {
    if (!canMutate) return;
    const effectiveLoadId = loadId.trim();
    if (!effectiveLoadId) {
      setError("Load ID is required.");
      return;
    }
    const amountCents = Number(form.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      setError("Amount must be a positive integer (cents).");
      return;
    }
    setBusy("create");
    setError(null);
    try {
      await apiFetch(`/billing/loads/${encodeURIComponent(effectiveLoadId)}/factoring/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          amountCents,
          invoiceId: form.invoiceId.trim() || undefined,
          submissionId: form.submissionId.trim() || undefined,
          occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
          reference: form.reference.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      setForm({
        type: "ADVANCE",
        amountCents: "",
        invoiceId: "",
        submissionId: "",
        occurredAt: "",
        reference: "",
        notes: "",
      });
      setNote("Factoring transaction recorded.");
      await loadTransactions(effectiveLoadId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {error ? <ErrorBanner message={error} /> : null}
      {note ? <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">{note}</div> : null}

      <Card className="space-y-3 !p-3 sm:!p-4">
        <SectionHeader title="Factoring Ledger" subtitle="Track advance, reserve, fee, and recourse transactions per load." />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <FormField label="Load ID" htmlFor="factoringLoadId">
            <Input id="factoringLoadId" value={loadId} onChange={(event) => setLoadId(event.target.value)} placeholder="cma..." />
          </FormField>
          <div className="flex items-end">
            <Button variant="secondary" onClick={() => loadTransactions()} disabled={loading}>
              {loading ? "Loading..." : "Load transactions"}
            </Button>
          </div>
        </div>
      </Card>

      {canMutate ? (
        <Card className="space-y-3 !p-3 sm:!p-4">
          <SectionHeader title="Record Transaction" subtitle="Post factoring money movement with journal write-through." />
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
            <FormField label="Type" htmlFor="factoringType">
              <Select id="factoringType" value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as FactoringType }))}>
                <option value="ADVANCE">Advance</option>
                <option value="RESERVE_RELEASE">Reserve release</option>
                <option value="FEE">Fee</option>
                <option value="RECOURSE">Recourse</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </Select>
            </FormField>
            <FormField label="Amount (cents)" htmlFor="factoringAmount">
              <Input id="factoringAmount" type="number" min={1} value={form.amountCents} onChange={(event) => setForm((prev) => ({ ...prev, amountCents: event.target.value }))} />
            </FormField>
            <FormField label="Invoice ID" htmlFor="factoringInvoiceId">
              <Input id="factoringInvoiceId" value={form.invoiceId} onChange={(event) => setForm((prev) => ({ ...prev, invoiceId: event.target.value }))} />
            </FormField>
            <FormField label="Submission ID" htmlFor="factoringSubmissionId">
              <Input id="factoringSubmissionId" value={form.submissionId} onChange={(event) => setForm((prev) => ({ ...prev, submissionId: event.target.value }))} />
            </FormField>
            <FormField label="Occurred at" htmlFor="factoringOccurredAt">
              <Input id="factoringOccurredAt" type="datetime-local" value={form.occurredAt} onChange={(event) => setForm((prev) => ({ ...prev, occurredAt: event.target.value }))} />
            </FormField>
            <FormField label="Reference" htmlFor="factoringReference">
              <Input id="factoringReference" value={form.reference} onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))} />
            </FormField>
            <div className="flex items-end">
              <Button onClick={createTransaction} disabled={busy !== null || !loadId.trim() || !form.amountCents.trim()}>
                {busy === "create" ? "Recording..." : "Record"}
              </Button>
            </div>
          </div>
          <FormField label="Notes" htmlFor="factoringNotes">
            <Input id="factoringNotes" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
          </FormField>
        </Card>
      ) : (
        <Card className="!p-3 text-sm text-[color:var(--color-text-muted)]">Read-only mode: Billing/Admin can record factoring transactions.</Card>
      )}

      <Card className="space-y-3 !p-3 sm:!p-4">
        <SectionHeader title="Transactions" subtitle={loadId.trim() ? `Load ${loadId.trim()}` : "Select a load"} />
        {transactions.length === 0 ? (
          <EmptyState title={loading ? "Loading transactions..." : "No transactions yet for this load"} />
        ) : (
          <div className="overflow-auto rounded-[var(--radius-card)] border border-[color:var(--color-divider)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-left">Amount</th>
                  <th className="px-2 py-2 text-left">Invoice / Submission</th>
                  <th className="px-2 py-2 text-left">Occurred</th>
                  <th className="px-2 py-2 text-left">Reference</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((row) => (
                  <tr key={row.id} className="border-t border-[color:var(--color-divider)]">
                    <td className="px-2 py-2">
                      <StatusChip label={row.type.replace("_", " ")} tone={factoringTone(row.type)} />
                    </td>
                    <td className="px-2 py-2">{formatCurrency(row.amountCents)}</td>
                    <td className="px-2 py-2 text-xs text-[color:var(--color-text-muted)]">
                      <div>{row.invoiceId || "-"}</div>
                      <div>{row.submissionId || "-"}</div>
                    </td>
                    <td className="px-2 py-2 text-xs text-[color:var(--color-text-muted)]">{formatDate(row.occurredAt)}</td>
                    <td className="px-2 py-2 text-xs text-[color:var(--color-text-muted)]">{row.reference || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}


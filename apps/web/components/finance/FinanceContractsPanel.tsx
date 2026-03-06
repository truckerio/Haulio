"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/ui/status-chip";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";

type MoveContractRow = {
  id: string;
  code: string;
  name: string;
  template: "CPM" | "FLAT_TRIP" | "REVENUE_SHARE" | "HOURLY" | "HYBRID_BEST_OF";
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  currentVersion: number;
  latestVersion: {
    id: string;
    version: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    scope?: Record<string, unknown> | null;
    rules?: Record<string, unknown> | null;
  } | null;
};

type ContractsResponse = {
  contracts: MoveContractRow[];
};

type PreviewResponse = {
  loadId: string;
  loadNumber: string | null;
  contract: {
    id: string;
    code: string;
    name: string;
    versionId: string;
    version: number;
  };
  preview: {
    baseModel: string;
    amountCents: number;
    amount: string;
    paidMiles: number;
    ratePerMile: number | null;
    addonCents: number;
  };
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function templateLabel(template: MoveContractRow["template"]) {
  if (template === "FLAT_TRIP") return "Flat Trip";
  if (template === "REVENUE_SHARE") return "Revenue Share";
  if (template === "HYBRID_BEST_OF") return "Hybrid (Best Of)";
  return template;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offsetMinutes * 60_000);
  return local.toISOString().slice(0, 16);
}

export function FinanceContractsPanel() {
  const { capabilities } = useUser();
  const canMutate = capabilities.canBillActions;
  const [rows, setRows] = useState<MoveContractRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [versionBusy, setVersionBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    template: "CPM" as MoveContractRow["template"],
    status: "ACTIVE" as MoveContractRow["status"],
    ratePerMileCents: "65",
    flatAmountCents: "",
    revenueSharePct: "",
  });
  const [previewForm, setPreviewForm] = useState({
    loadId: "",
    contractId: "",
  });
  const [versionForm, setVersionForm] = useState({
    contractId: "",
    effectiveFrom: "",
    status: "ACTIVE" as MoveContractRow["status"],
    scopeJson: "{}",
    rulesJson: "{}",
  });

  const loadContracts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ContractsResponse>("/finance/move-contracts");
      setRows(data.contracts ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  useEffect(() => {
    if (rows.length === 0) return;
    const preferred = rows.find((row) => row.id === versionForm.contractId) ?? rows[0];
    if (!preferred) return;
    if (!versionForm.contractId) {
      setVersionForm((prev) => ({
        ...prev,
        contractId: preferred.id,
        effectiveFrom: prev.effectiveFrom || toDateTimeLocal(new Date().toISOString()),
        status: preferred.status === "ARCHIVED" ? "ACTIVE" : preferred.status,
        scopeJson: JSON.stringify(preferred.latestVersion?.scope ?? {}, null, 2),
        rulesJson: JSON.stringify(preferred.latestVersion?.rules ?? {}, null, 2),
      }));
    }
  }, [rows, versionForm.contractId]);

  const selectedContract = useMemo(
    () => rows.find((row) => row.id === previewForm.contractId) ?? null,
    [rows, previewForm.contractId]
  );
  const selectedVersionContract = useMemo(
    () => rows.find((row) => row.id === versionForm.contractId) ?? null,
    [rows, versionForm.contractId]
  );

  const createContract = async () => {
    if (!canMutate) return;
    if (!form.code.trim() || !form.name.trim()) return;
    setCreateBusy(true);
    setError(null);
    setNote(null);
    try {
      const rules: Record<string, unknown> = { base: { model: form.template } };
      if (form.template === "CPM") {
        (rules.base as Record<string, unknown>).ratePerMileCents = Number(form.ratePerMileCents || 0);
      } else if (form.template === "FLAT_TRIP") {
        (rules.base as Record<string, unknown>).flatAmountCents = Number(form.flatAmountCents || 0);
      } else if (form.template === "REVENUE_SHARE") {
        (rules.base as Record<string, unknown>).revenueSharePct = Number(form.revenueSharePct || 0);
      }
      await apiFetch("/finance/move-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          template: form.template,
          status: form.status,
          rules,
        }),
      });
      setNote(`Contract ${form.code.trim().toUpperCase()} created.`);
      setForm({
        code: "",
        name: "",
        template: "CPM",
        status: "ACTIVE",
        ratePerMileCents: "65",
        flatAmountCents: "",
        revenueSharePct: "",
      });
      await loadContracts();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreateBusy(false);
    }
  };

  const previewContract = async () => {
    if (!previewForm.loadId.trim()) return;
    setPreviewBusy(true);
    setError(null);
    setNote(null);
    try {
      const data = await apiFetch<PreviewResponse>("/finance/move-contracts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loadId: previewForm.loadId.trim(),
          contractId: previewForm.contractId || undefined,
        }),
      });
      setPreview(data);
      setNote(`Preview generated for ${data.loadNumber ?? data.loadId}.`);
    } catch (err) {
      setError((err as Error).message);
      setPreview(null);
    } finally {
      setPreviewBusy(false);
    }
  };

  const publishVersion = async () => {
    if (!canMutate || !versionForm.contractId) return;
    setVersionBusy(true);
    setError(null);
    setNote(null);
    try {
      let parsedScope: Record<string, unknown> = {};
      let parsedRules: Record<string, unknown> = {};
      try {
        parsedScope = versionForm.scopeJson.trim() ? (JSON.parse(versionForm.scopeJson) as Record<string, unknown>) : {};
      } catch {
        throw new Error("Scope JSON is invalid.");
      }
      try {
        parsedRules = versionForm.rulesJson.trim() ? (JSON.parse(versionForm.rulesJson) as Record<string, unknown>) : {};
      } catch {
        throw new Error("Rules JSON is invalid.");
      }
      const effectiveFromIso = versionForm.effectiveFrom
        ? new Date(versionForm.effectiveFrom).toISOString()
        : new Date().toISOString();
      await apiFetch(`/finance/move-contracts/${versionForm.contractId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          effectiveFrom: effectiveFromIso,
          status: versionForm.status,
          scope: parsedScope,
          rules: parsedRules,
        }),
      });
      setNote("Contract version published.");
      await loadContracts();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVersionBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {error ? <ErrorBanner message={error} /> : null}
      {note ? <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">{note}</div> : null}
      <Card className="space-y-3 !p-3 sm:!p-4">
        <SectionHeader title="Move Contracts" subtitle="Template + scope + preview contract library for driver pay." />
        {loading ? <EmptyState title="Loading contracts..." /> : null}
        {!loading && rows.length === 0 ? <EmptyState title="No move contracts yet." description="Create a base contract to replace hardcoded CPM-only logic." /> : null}
        {!loading && rows.length > 0 ? (
          <div className="overflow-auto rounded-[var(--radius-card)] border border-[color:var(--color-divider)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-2 py-2 text-left">Code</th>
                  <th className="px-2 py-2 text-left">Name</th>
                  <th className="px-2 py-2 text-left">Template</th>
                  <th className="px-2 py-2 text-left">Version</th>
                  <th className="px-2 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[color:var(--color-divider)]">
                    <td className="px-2 py-2 font-mono text-xs">{row.code}</td>
                    <td className="px-2 py-2">{row.name}</td>
                    <td className="px-2 py-2">{templateLabel(row.template)}</td>
                    <td className="px-2 py-2">{row.latestVersion?.version ?? row.currentVersion}</td>
                    <td className="px-2 py-2">
                      <StatusChip label={row.status} tone={row.status === "ACTIVE" ? "success" : row.status === "DRAFT" ? "warning" : "neutral"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3 !p-3 sm:!p-4">
        <SectionHeader title="Contract Preview" subtitle="Simulate pay from one load before running settlement preview." />
        <div className="grid gap-2 sm:grid-cols-3">
          <FormField label="Load ID" htmlFor="contractPreviewLoad">
            <Input id="contractPreviewLoad" value={previewForm.loadId} onChange={(event) => setPreviewForm((prev) => ({ ...prev, loadId: event.target.value }))} />
          </FormField>
          <FormField label="Contract override" htmlFor="contractPreviewContract">
            <Select
              id="contractPreviewContract"
              value={previewForm.contractId}
              onChange={(event) => setPreviewForm((prev) => ({ ...prev, contractId: event.target.value }))}
            >
              <option value="">Best matching contract</option>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.name}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="flex items-end">
            <Button onClick={previewContract} disabled={previewBusy || !previewForm.loadId.trim()}>
              {previewBusy ? "Previewing..." : "Preview pay"}
            </Button>
          </div>
        </div>
        {preview ? (
          <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] p-3 text-sm">
            <div className="font-medium text-ink">{preview.contract.code} · v{preview.contract.version}</div>
            <div className="mt-1 text-[color:var(--color-text-muted)]">
              Model: {preview.preview.baseModel} · Paid miles: {preview.preview.paidMiles} · Rate/mile: {preview.preview.ratePerMile ?? "-"}
            </div>
            <div className="mt-2 text-base font-semibold text-ink">
              Total pay: {formatCurrency(preview.preview.amountCents)}
              <span className="ml-2 text-xs font-normal text-[color:var(--color-text-muted)]">
                (Add-ons: {formatCurrency(preview.preview.addonCents)})
              </span>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3 !p-3 sm:!p-4">
        <SectionHeader title="Publish Version" subtitle="Create an effective-dated version so pay rules are traceable over time." />
        {!canMutate ? (
          <div className="text-sm text-[color:var(--color-text-muted)]">Read-only for your role. Billing/Admin can publish versions.</div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <FormField label="Contract" htmlFor="versionContractId">
                <Select
                  id="versionContractId"
                  value={versionForm.contractId}
                  onChange={(event) => {
                    const next = rows.find((row) => row.id === event.target.value);
                    setVersionForm((prev) => ({
                      ...prev,
                      contractId: event.target.value,
                      status: (next?.status === "ARCHIVED" ? "ACTIVE" : next?.status) ?? "ACTIVE",
                      scopeJson: JSON.stringify(next?.latestVersion?.scope ?? {}, null, 2),
                      rulesJson: JSON.stringify(next?.latestVersion?.rules ?? {}, null, 2),
                    }));
                  }}
                >
                  {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.code} · {row.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Effective from" htmlFor="versionEffectiveFrom">
                <Input
                  id="versionEffectiveFrom"
                  type="datetime-local"
                  value={versionForm.effectiveFrom}
                  onChange={(event) => setVersionForm((prev) => ({ ...prev, effectiveFrom: event.target.value }))}
                />
              </FormField>
              <FormField label="Contract status" htmlFor="versionStatus">
                <Select
                  id="versionStatus"
                  value={versionForm.status}
                  onChange={(event) => setVersionForm((prev) => ({ ...prev, status: event.target.value as MoveContractRow["status"] }))}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                </Select>
              </FormField>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              <FormField label="Scope JSON" htmlFor="versionScopeJson">
                <Textarea
                  id="versionScopeJson"
                  rows={8}
                  value={versionForm.scopeJson}
                  onChange={(event) => setVersionForm((prev) => ({ ...prev, scopeJson: event.target.value }))}
                />
              </FormField>
              <FormField label="Rules JSON" htmlFor="versionRulesJson">
                <Textarea
                  id="versionRulesJson"
                  rows={8}
                  value={versionForm.rulesJson}
                  onChange={(event) => setVersionForm((prev) => ({ ...prev, rulesJson: event.target.value }))}
                />
              </FormField>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={publishVersion} disabled={versionBusy || !versionForm.contractId}>
                {versionBusy ? "Publishing..." : "Publish version"}
              </Button>
              {selectedVersionContract?.latestVersion ? (
                <span className="text-xs text-[color:var(--color-text-muted)]">
                  Current v{selectedVersionContract.latestVersion.version} effective{" "}
                  {toDateTimeLocal(selectedVersionContract.latestVersion.effectiveFrom) || "-"}
                </span>
              ) : null}
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-3 !p-3 sm:!p-4">
        <SectionHeader title="Create Contract" subtitle="Use a template to define base pay before settlement." />
        {!canMutate ? (
          <div className="text-sm text-[color:var(--color-text-muted)]">Read-only for your role. Billing/Admin can create contracts.</div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <FormField label="Code" htmlFor="contractCode">
                <Input id="contractCode" value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="OO_CPM" />
              </FormField>
              <FormField label="Name" htmlFor="contractName">
                <Input id="contractName" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Owner Operator CPM" />
              </FormField>
              <FormField label="Template" htmlFor="contractTemplate">
                <Select id="contractTemplate" value={form.template} onChange={(event) => setForm((prev) => ({ ...prev, template: event.target.value as MoveContractRow["template"] }))}>
                  <option value="CPM">CPM</option>
                  <option value="FLAT_TRIP">Flat Trip</option>
                  <option value="REVENUE_SHARE">Revenue Share</option>
                  <option value="HOURLY">Hourly</option>
                  <option value="HYBRID_BEST_OF">Hybrid Best Of</option>
                </Select>
              </FormField>
              <FormField label="Status" htmlFor="contractStatus">
                <Select id="contractStatus" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MoveContractRow["status"] }))}>
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                </Select>
              </FormField>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {form.template === "CPM" ? (
                <FormField label="Rate per mile (cents)" htmlFor="contractRatePerMileCents">
                  <Input
                    id="contractRatePerMileCents"
                    type="number"
                    min={0}
                    value={form.ratePerMileCents}
                    onChange={(event) => setForm((prev) => ({ ...prev, ratePerMileCents: event.target.value }))}
                  />
                </FormField>
              ) : null}
              {form.template === "FLAT_TRIP" ? (
                <FormField label="Flat amount (cents)" htmlFor="contractFlatAmountCents">
                  <Input
                    id="contractFlatAmountCents"
                    type="number"
                    min={0}
                    value={form.flatAmountCents}
                    onChange={(event) => setForm((prev) => ({ ...prev, flatAmountCents: event.target.value }))}
                  />
                </FormField>
              ) : null}
              {form.template === "REVENUE_SHARE" ? (
                <FormField label="Revenue share (%)" htmlFor="contractRevenueSharePct">
                  <Input
                    id="contractRevenueSharePct"
                    type="number"
                    min={0}
                    max={100}
                    value={form.revenueSharePct}
                    onChange={(event) => setForm((prev) => ({ ...prev, revenueSharePct: event.target.value }))}
                  />
                </FormField>
              ) : null}
            </div>
            <div>
              <Button onClick={createContract} disabled={createBusy || !form.code.trim() || !form.name.trim()}>
                {createBusy ? "Creating..." : "Create contract"}
              </Button>
            </div>
          </>
        )}
        {selectedContract ? (
          <div className="text-xs text-[color:var(--color-text-muted)]">
            Preview override currently set to <span className="font-mono">{selectedContract.code}</span>.
          </div>
        ) : null}
      </Card>
    </div>
  );
}

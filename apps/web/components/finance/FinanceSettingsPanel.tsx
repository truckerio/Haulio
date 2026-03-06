"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { ErrorBanner } from "@/components/ui/error-banner";
import { getSaveButtonLabel, SaveFeedbackText } from "@/components/ui/save-feedback";
import { RouteGuard } from "@/components/rbac/route-guard";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/date-time";
import { useSaveFeedback } from "@/lib/use-save-feedback";

type QuickBooksStatus = {
  enabled: boolean;
  companyId: string | null;
};

type QboJob = {
  id: string;
  entityType: "CUSTOMER" | "INVOICE" | "PAYMENT";
  entityId: string;
  status: "QUEUED" | "SYNCING" | "SYNCED" | "FAILED";
  attemptCount: number;
  lastErrorMessage: string | null;
  updatedAt: string;
};

type CompliancePolicyResponse = {
  policy: {
    sanctions: {
      enforced: boolean;
      denylistTokens: string[];
      allowAdminOverride: boolean;
    };
    ach: {
      requireReference: boolean;
      requireAccountValidation: boolean;
      blockedReturnCodes: string[];
    };
    tax: {
      enforceVendorProfile: boolean;
      enforceDriverProfile: boolean;
    };
  };
  generatedAt: string;
  rails: Array<"ACH" | "WIRE" | "CHECK" | "CASH" | "FACTORING" | "OTHER">;
};

type ComplianceScreenResponse = {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  checks: {
    sanctions: { ok: boolean; matchedToken: string | null };
    ach: { ok: boolean; returnCode: string | null };
    taxProfile: { ok: boolean; required: boolean };
  };
  overrides: string[];
};

export function FinanceSettingsPanel() {
  const { user } = useUser();
  const canEditCompanyId = user?.role === "ADMIN";
  const [status, setStatus] = useState<QuickBooksStatus | null>(null);
  const [companyIdDraft, setCompanyIdDraft] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loadId, setLoadId] = useState("");
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<QboJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<CompliancePolicyResponse | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [screening, setScreening] = useState(false);
  const [screenResult, setScreenResult] = useState<ComplianceScreenResponse | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [screenForm, setScreenForm] = useState({
    direction: "PAYABLE" as "RECEIVABLE" | "PAYABLE",
    method: "ACH" as "ACH" | "WIRE" | "CHECK" | "CASH" | "FACTORING" | "OTHER",
    payeeType: "VENDOR" as "CUSTOMER" | "DRIVER" | "VENDOR",
    counterpartyName: "",
    counterpartyReference: "",
    achAccountValidated: false,
    achReturnCode: "",
    taxProfileVerified: false,
    taxFormType: "",
    sanctionsOverrideReason: "",
  });
  const { saveState, startSaving, markSaved, resetSaveState } = useSaveFeedback(1800);

  const loadFailedJobs = () => {
    setJobsLoading(true);
    apiFetch<{ jobs: QboJob[] }>("/finance/qbo/jobs?status=FAILED")
      .then((data) => {
        setJobs(data.jobs ?? []);
        setJobsError(null);
      })
      .catch((err) => setJobsError((err as Error).message))
      .finally(() => setJobsLoading(false));
  };

  useEffect(() => {
    apiFetch<QuickBooksStatus>("/integrations/quickbooks/status")
      .then((data) => {
        setStatus(data);
        setCompanyIdDraft(data.companyId ?? "");
        setStatusError(null);
      })
      .catch((err) => setStatusError((err as Error).message));
    apiFetch<CompliancePolicyResponse>("/finance/compliance/policy")
      .then((data) => {
        setPolicy(data);
        setPolicyError(null);
      })
      .catch((err) => setPolicyError((err as Error).message));
    loadFailedJobs();
  }, []);

  const saveCompanyId = async () => {
    if (!canEditCompanyId) return;
    startSaving();
    setStatusError(null);
    try {
      const next = companyIdDraft.trim();
      const data = await apiFetch<QuickBooksStatus>("/integrations/quickbooks/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: next.length > 0 ? next : null }),
      });
      setStatus(data);
      setCompanyIdDraft(data.companyId ?? "");
      markSaved();
    } catch (err) {
      resetSaveState();
      setStatusError((err as Error).message);
    }
  };

  const handlePush = async () => {
    if (!loadId.trim()) return;
    setLoading(true);
    setPushError(null);
    setPushStatus(null);
    try {
      const data = await apiFetch<{ externalInvoiceRef?: string }>(
        `/billing/readiness/${encodeURIComponent(loadId.trim())}/quickbooks`,
        { method: "POST" }
      );
      setPushStatus(data.externalInvoiceRef ? `Pushed to QuickBooks: ${data.externalInvoiceRef}` : "Pushed to QuickBooks");
      setLoadId("");
    } catch (err) {
      setPushError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const retryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    setJobsError(null);
    try {
      await apiFetch(`/finance/qbo/jobs/${jobId}/retry`, { method: "POST" });
      await apiFetch("/finance/qbo/retry-failed", { method: "POST" });
      loadFailedJobs();
    } catch (err) {
      setJobsError((err as Error).message);
    } finally {
      setRetryingJobId(null);
    }
  };

  const retryAllFailed = async () => {
    setRetryingJobId("__all__");
    setJobsError(null);
    try {
      await apiFetch("/finance/qbo/retry-failed", { method: "POST" });
      loadFailedJobs();
    } catch (err) {
      setJobsError((err as Error).message);
    } finally {
      setRetryingJobId(null);
    }
  };

  const runComplianceScreen = async () => {
    setScreening(true);
    setScreenError(null);
    try {
      const response = await apiFetch<ComplianceScreenResponse>("/finance/compliance/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: screenForm.direction,
          method: screenForm.method,
          payeeType: screenForm.payeeType,
          counterpartyName: screenForm.counterpartyName.trim() || undefined,
          counterpartyReference: screenForm.counterpartyReference.trim() || undefined,
          compliance: {
            achAccountValidated: screenForm.achAccountValidated,
            achReturnCode: screenForm.achReturnCode.trim() || undefined,
            taxProfileVerified: screenForm.taxProfileVerified,
            taxFormType: screenForm.taxFormType.trim() || undefined,
            sanctionsOverrideReason: screenForm.sanctionsOverrideReason.trim() || undefined,
          },
        }),
      });
      setScreenResult(response);
    } catch (err) {
      setScreenError((err as Error).message);
      setScreenResult(null);
    } finally {
      setScreening(false);
    }
  };

  return (
    <RouteGuard allowedRoles={["ADMIN", "BILLING"]}>
      <div className="space-y-6">
        {statusError ? <ErrorBanner message={statusError} /> : null}
        {jobsError ? <ErrorBanner message={jobsError} /> : null}
        {policyError ? <ErrorBanner message={policyError} /> : null}
        {screenError ? <ErrorBanner message={screenError} /> : null}
        <Card className="space-y-4">
          <SectionHeader title="QuickBooks integration" subtitle="Connection status and basic metadata" />
          <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--color-text-muted)]">
            <StatusChip
              label={status?.enabled ? "Enabled" : "Disabled"}
              tone={status?.enabled ? "success" : "neutral"}
            />
            <span>Company ID: {status?.companyId ?? "Not configured"}</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] items-end">
            <FormField label="QuickBooks Company ID" htmlFor="quickbooksCompanyId">
              <Input
                id="quickbooksCompanyId"
                value={companyIdDraft}
                placeholder="Enter company ID"
                onChange={(event) => {
                  setCompanyIdDraft(event.target.value);
                  if (saveState !== "saving") resetSaveState();
                }}
                disabled={!canEditCompanyId}
              />
            </FormField>
            <Button
              onClick={saveCompanyId}
              disabled={!canEditCompanyId || saveState === "saving" || (status?.companyId ?? "") === companyIdDraft.trim()}
            >
              {getSaveButtonLabel(saveState, "Save")}
            </Button>
          </div>
          {!canEditCompanyId ? (
            <div className="text-xs text-[color:var(--color-text-muted)]">Only admin can edit QuickBooks Company ID.</div>
          ) : null}
          <SaveFeedbackText saveState={saveState} label="Saved" />
        </Card>

        <Card className="space-y-4">
          <SectionHeader title="Test push" subtitle="Send a ready load to QuickBooks" />
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] items-end">
            <FormField label="Load ID" htmlFor="financeQuickbooksLoad">
              <Input id="financeQuickbooksLoad" value={loadId} onChange={(e) => setLoadId(e.target.value)} />
            </FormField>
            <Button onClick={handlePush} disabled={!loadId.trim() || loading}>
              {loading ? "Sending..." : "Send to QuickBooks"}
            </Button>
          </div>
          {pushStatus ? <div className="text-sm text-[color:var(--color-text-muted)]">{pushStatus}</div> : null}
          {pushError ? <div className="text-sm text-[color:var(--color-danger)]">{pushError}</div> : null}
        </Card>

        <Card className="space-y-4">
          <SectionHeader title="QBO error queue" subtitle="Retry failed sync jobs with full error details" />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={loadFailedJobs} disabled={jobsLoading}>
              {jobsLoading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button onClick={retryAllFailed} disabled={retryingJobId === "__all__" || jobs.length === 0}>
              {retryingJobId === "__all__" ? "Retrying..." : "Retry all failed"}
            </Button>
            <div className="text-xs text-[color:var(--color-text-muted)]">{jobs.length} failed job(s)</div>
          </div>
          {jobs.length === 0 ? (
            <div className="text-sm text-[color:var(--color-text-muted)]">No failed jobs.</div>
          ) : (
            <div className="grid gap-2">
              {jobs.map((job) => (
                <div key={job.id} className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-ink">{job.entityType} {job.entityId}</div>
                    <StatusChip tone="danger" label={job.status} />
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    Attempts: {job.attemptCount} · Updated: {formatDateTime(job.updatedAt)}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--color-danger)]">{job.lastErrorMessage ?? "Unknown error"}</div>
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={retryingJobId === job.id}
                      onClick={() => retryJob(job.id)}
                    >
                      {retryingJobId === job.id ? "Retrying..." : "Retry"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <SectionHeader title="Finance compliance policy" subtitle="Live policy gates used by payment and payout commands." />
          {!policy ? (
            <div className="text-sm text-[color:var(--color-text-muted)]">Loading policy...</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
                <div className="text-xs text-[color:var(--color-text-muted)]">Sanctions</div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusChip label={policy.policy.sanctions.enforced ? "Enforced" : "Disabled"} tone={policy.policy.sanctions.enforced ? "warning" : "neutral"} />
                </div>
              </div>
              <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
                <div className="text-xs text-[color:var(--color-text-muted)]">ACH validation</div>
                <div className="mt-1">
                  {policy.policy.ach.requireAccountValidation ? "Required" : "Optional"}
                </div>
              </div>
              <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
                <div className="text-xs text-[color:var(--color-text-muted)]">Tax profile</div>
                <div className="mt-1">
                  Vendor {policy.policy.tax.enforceVendorProfile ? "required" : "optional"} · Driver {policy.policy.tax.enforceDriverProfile ? "required" : "optional"}
                </div>
              </div>
              <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2">
                <div className="text-xs text-[color:var(--color-text-muted)]">Blocked ACH returns</div>
                <div className="mt-1">{policy.policy.ach.blockedReturnCodes.length > 0 ? policy.policy.ach.blockedReturnCodes.join(", ") : "None"}</div>
              </div>
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <SectionHeader title="Compliance screening test" subtitle="Validate a receivable/payable scenario before executing money movement." />
          <div className="grid gap-3 lg:grid-cols-3">
            <FormField label="Direction" htmlFor="complianceDirection">
              <Select id="complianceDirection" value={screenForm.direction} onChange={(event) => setScreenForm((prev) => ({ ...prev, direction: event.target.value as "RECEIVABLE" | "PAYABLE" }))}>
                <option value="RECEIVABLE">Receivable</option>
                <option value="PAYABLE">Payable</option>
              </Select>
            </FormField>
            <FormField label="Method" htmlFor="complianceMethod">
              <Select id="complianceMethod" value={screenForm.method} onChange={(event) => setScreenForm((prev) => ({ ...prev, method: event.target.value as "ACH" | "WIRE" | "CHECK" | "CASH" | "FACTORING" | "OTHER" }))}>
                <option value="ACH">ACH</option>
                <option value="WIRE">Wire</option>
                <option value="CHECK">Check</option>
                <option value="CASH">Cash</option>
                <option value="FACTORING">Factoring</option>
                <option value="OTHER">Other</option>
              </Select>
            </FormField>
            <FormField label="Payee type" htmlFor="compliancePayeeType">
              <Select id="compliancePayeeType" value={screenForm.payeeType} onChange={(event) => setScreenForm((prev) => ({ ...prev, payeeType: event.target.value as "CUSTOMER" | "DRIVER" | "VENDOR" }))}>
                <option value="CUSTOMER">Customer</option>
                <option value="DRIVER">Driver</option>
                <option value="VENDOR">Vendor</option>
              </Select>
            </FormField>
            <FormField label="Counterparty name" htmlFor="complianceName">
              <Input id="complianceName" value={screenForm.counterpartyName} onChange={(event) => setScreenForm((prev) => ({ ...prev, counterpartyName: event.target.value }))} />
            </FormField>
            <FormField label="Reference" htmlFor="complianceReference">
              <Input id="complianceReference" value={screenForm.counterpartyReference} onChange={(event) => setScreenForm((prev) => ({ ...prev, counterpartyReference: event.target.value }))} />
            </FormField>
            <FormField label="ACH return code" htmlFor="complianceAchReturnCode">
              <Input id="complianceAchReturnCode" value={screenForm.achReturnCode} onChange={(event) => setScreenForm((prev) => ({ ...prev, achReturnCode: event.target.value }))} />
            </FormField>
            <FormField label="Tax form type" htmlFor="complianceTaxForm">
              <Input id="complianceTaxForm" value={screenForm.taxFormType} onChange={(event) => setScreenForm((prev) => ({ ...prev, taxFormType: event.target.value }))} />
            </FormField>
            <FormField label="Override reason" htmlFor="complianceOverrideReason">
              <Input id="complianceOverrideReason" value={screenForm.sanctionsOverrideReason} onChange={(event) => setScreenForm((prev) => ({ ...prev, sanctionsOverrideReason: event.target.value }))} />
            </FormField>
            <div className="flex items-end">
              <Button onClick={runComplianceScreen} disabled={screening}>
                {screening ? "Screening..." : "Run screening"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={screenForm.achAccountValidated}
                onChange={(event) => setScreenForm((prev) => ({ ...prev, achAccountValidated: event.target.checked }))}
              />
              ACH account validated
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={screenForm.taxProfileVerified}
                onChange={(event) => setScreenForm((prev) => ({ ...prev, taxProfileVerified: event.target.checked }))}
              />
              Tax profile verified
            </label>
          </div>
          {screenResult ? (
            <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <StatusChip label={screenResult.ok ? "PASS" : "BLOCKED"} tone={screenResult.ok ? "success" : "danger"} />
                <span className="text-xs text-[color:var(--color-text-muted)]">
                  Sanctions {screenResult.checks.sanctions.ok ? "ok" : "blocked"} · ACH {screenResult.checks.ach.ok ? "ok" : "blocked"} · Tax {screenResult.checks.taxProfile.ok ? "ok" : "blocked"}
                </span>
              </div>
              {screenResult.blockers.length > 0 ? (
                <div className="mt-2 text-xs text-[color:var(--color-danger)]">Blockers: {screenResult.blockers.join("; ")}</div>
              ) : null}
              {screenResult.warnings.length > 0 ? (
                <div className="mt-1 text-xs text-[color:var(--color-warning)]">Warnings: {screenResult.warnings.join("; ")}</div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </RouteGuard>
  );
}

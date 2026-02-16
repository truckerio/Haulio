"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { ErrorBanner } from "@/components/ui/error-banner";
import { getSaveButtonLabel, SaveFeedbackText } from "@/components/ui/save-feedback";
import { RouteGuard } from "@/components/rbac/route-guard";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
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

  return (
    <RouteGuard allowedRoles={["ADMIN", "BILLING"]}>
      <div className="space-y-6">
        {statusError ? <ErrorBanner message={statusError} /> : null}
        {jobsError ? <ErrorBanner message={jobsError} /> : null}
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
                    Attempts: {job.attemptCount} · Updated: {new Date(job.updatedAt).toLocaleString()}
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
      </div>
    </RouteGuard>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { ErrorBanner } from "@/components/ui/error-banner";
import { RouteGuard } from "@/components/rbac/route-guard";
import { apiFetch } from "@/lib/api";

type QuickBooksStatus = {
  enabled: boolean;
  companyId: string | null;
};

export function FinanceSettingsPanel() {
  const [status, setStatus] = useState<QuickBooksStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loadId, setLoadId] = useState("");
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<QuickBooksStatus>("/integrations/quickbooks/status")
      .then((data) => {
        setStatus(data);
        setStatusError(null);
      })
      .catch((err) => setStatusError((err as Error).message));
  }, []);

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

  return (
    <RouteGuard allowedRoles={["ADMIN", "BILLING"]}>
      <div className="space-y-6">
        {statusError ? <ErrorBanner message={statusError} /> : null}
        <Card className="space-y-4">
          <SectionHeader title="QuickBooks integration" subtitle="Connection status and basic metadata" />
          <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--color-text-muted)]">
            <StatusChip
              label={status?.enabled ? "Enabled" : "Disabled"}
              tone={status?.enabled ? "success" : "neutral"}
            />
            <span>Company ID: {status?.companyId ?? "Not configured"}</span>
          </div>
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
      </div>
    </RouteGuard>
  );
}

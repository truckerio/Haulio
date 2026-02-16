"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/rbac/route-guard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";
import { ErrorBanner } from "@/components/ui/error-banner";
import { getSaveButtonLabel } from "@/components/ui/save-feedback";
import { AdminSettingsShell } from "@/components/admin-settings/AdminSettingsShell";
import { apiFetch } from "@/lib/api";
import { useSaveFeedback } from "@/lib/use-save-feedback";

export default function AutomationSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<any | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<any | null>(null);
  const { saveState, startSaving, markSaved, resetSaveState } = useSaveFeedback(2000);
  const [error, setError] = useState<string | null>(null);
  const [loadsFile, setLoadsFile] = useState<File | null>(null);
  const [stopsFile, setStopsFile] = useState<File | null>(null);
  const [wipeLoads, setWipeLoads] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      const settingsData = await apiFetch<{ settings: any }>("/admin/settings");
      setSettings(settingsData.settings ?? null);
      setSettingsDraft(
        settingsData.settings
          ? {
              ...settingsData.settings,
              requiredDocs: settingsData.settings.requiredDocs ?? [],
              requiredDriverDocs: settingsData.settings.requiredDriverDocs ?? [],
            }
          : null
      );
      setError(null);
    } catch (err) {
      setSettings(null);
      setSettingsDraft(null);
      setError((err as Error).message || "Failed to load automation settings.");
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (!settingsDraft && settings) {
      setSettingsDraft({
        ...settings,
        requiredDocs: settings.requiredDocs ?? [],
        requiredDriverDocs: settings.requiredDriverDocs ?? [],
      });
    }
  }, [settings, settingsDraft]);

  const updateSettings = async () => {
    if (!settingsDraft) return;
    startSaving();
    const toNumber = (value: any, fallback: number) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
    const toOptionalNumber = (value: any) => {
      if (value === undefined || value === null || value === "") return undefined;
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    };
    const currency =
      settingsDraft.currency && String(settingsDraft.currency).trim().length === 3
        ? String(settingsDraft.currency).toUpperCase()
        : undefined;
    const operatingMode = settingsDraft.operatingMode ? String(settingsDraft.operatingMode) : undefined;
    const trackingPreference = settingsDraft.trackingPreference ? String(settingsDraft.trackingPreference) : undefined;
    const settlementSchedule = settingsDraft.settlementSchedule ? String(settingsDraft.settlementSchedule) : undefined;
    const settlementTemplate = settingsDraft.settlementTemplate
      ? {
          includeLinehaul: Boolean(settingsDraft.settlementTemplate.includeLinehaul),
          includeFuelSurcharge: Boolean(settingsDraft.settlementTemplate.includeFuelSurcharge),
          includeAccessorials: Boolean(settingsDraft.settlementTemplate.includeAccessorials),
        }
      : undefined;
    const payload = {
      companyDisplayName: String(settingsDraft.companyDisplayName ?? ""),
      remitToAddress: String(settingsDraft.remitToAddress ?? ""),
      currency,
      operatingMode,
      invoiceTerms: String(settingsDraft.invoiceTerms ?? ""),
      invoiceTermsDays: toOptionalNumber(settingsDraft.invoiceTermsDays),
      invoiceFooter: String(settingsDraft.invoiceFooter ?? ""),
      invoicePrefix: String(settingsDraft.invoicePrefix ?? ""),
      nextInvoiceNumber: toNumber(settingsDraft.nextInvoiceNumber, 0),
      podRequireSignature: Boolean(settingsDraft.podRequireSignature),
      podRequirePrintedName: Boolean(settingsDraft.podRequirePrintedName),
      podRequireDeliveryDate: Boolean(settingsDraft.podRequireDeliveryDate),
      podMinPages: toNumber(settingsDraft.podMinPages, 1),
      requiredDocs: Array.isArray(settingsDraft.requiredDocs) ? settingsDraft.requiredDocs : [],
      requiredDriverDocs: Array.isArray(settingsDraft.requiredDriverDocs) ? settingsDraft.requiredDriverDocs : [],
      collectPodDueMinutes: toNumber(settingsDraft.collectPodDueMinutes, 0),
      missingPodAfterMinutes: toNumber(settingsDraft.missingPodAfterMinutes, 0),
      reminderFrequencyMinutes: toNumber(settingsDraft.reminderFrequencyMinutes, 0),
      requireRateConBeforeDispatch: Boolean(settingsDraft.requireRateConBeforeDispatch),
      trackingPreference,
      settlementSchedule,
      settlementTemplate,
      timezone: settingsDraft.timezone ? String(settingsDraft.timezone) : undefined,
      freeStorageMinutes: toNumber(settingsDraft.freeStorageMinutes, 0),
      storageRatePerDay: String(settingsDraft.storageRatePerDay ?? "0"),
      pickupFreeDetentionMinutes: toNumber(settingsDraft.pickupFreeDetentionMinutes, 0),
      deliveryFreeDetentionMinutes: toNumber(settingsDraft.deliveryFreeDetentionMinutes, 0),
      detentionRatePerHour:
        settingsDraft.detentionRatePerHour !== undefined && settingsDraft.detentionRatePerHour !== null
          ? String(settingsDraft.detentionRatePerHour)
          : undefined,
      driverRatePerMile: String(settingsDraft.driverRatePerMile ?? "0"),
      logoUrl: settingsDraft.logoUrl ? String(settingsDraft.logoUrl) : undefined,
    };
    try {
      await apiFetch("/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadSettings();
      markSaved();
    } catch (err) {
      resetSaveState();
      setError((err as Error).message || "Failed to save settings.");
    }
  };

  const runImport = async () => {
    setImportError(null);
    setImportResult(null);
    if (!loadsFile || !stopsFile) {
      setImportError("Please upload both loads.csv and stops.csv.");
      return;
    }
    const body = new FormData();
    body.append("loads", loadsFile);
    body.append("stops", stopsFile);
    if (wipeLoads) {
      body.append("wipe", "true");
    }
    try {
      const data = await apiFetch<{
        createdLoads: number;
        skippedLoads: number;
        createdStops: number;
        skippedStops: number;
      }>("/admin/import/loads", { method: "POST", body });
      setImportResult(
        `Imported ${data.createdLoads} loads / ${data.createdStops} stops. Skipped ${data.skippedLoads} loads / ${data.skippedStops} stops.`
      );
      setLoadsFile(null);
      setStopsFile(null);
      setWipeLoads(false);
    } catch (err) {
      setImportError((err as Error).message);
    }
  };

  return (
    <AppShell title="Settings" hideHeader={true}>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <AdminSettingsShell
          title="Automation"
          titleAlign="center"
          subtitle="POD thresholds and billing guardrails."
          backAction={
            <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full border border-[color:var(--color-divider)] bg-white/90 p-0" onClick={() => router.push("/admin")} aria-label="Back">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4L6 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          }
        >
          {error ? <ErrorBanner message={error} /> : null}

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Automation thresholds</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Collect POD due (minutes)" htmlFor="collectPodDueMinutes">
                <Input
                  placeholder=""
                  value={settingsDraft?.collectPodDueMinutes ? settingsDraft.collectPodDueMinutes : ""}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, collectPodDueMinutes: e.target.value })}
                />
              </FormField>
              <FormField label="Missing POD after (minutes)" htmlFor="missingPodAfterMinutes">
                <Input
                  placeholder=""
                  value={settingsDraft?.missingPodAfterMinutes ? settingsDraft.missingPodAfterMinutes : ""}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, missingPodAfterMinutes: e.target.value })}
                />
              </FormField>
              <FormField label="Reminder frequency (minutes)" htmlFor="reminderFrequencyMinutes">
                <Input
                  placeholder=""
                  value={settingsDraft?.reminderFrequencyMinutes ? settingsDraft.reminderFrequencyMinutes : ""}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, reminderFrequencyMinutes: e.target.value })}
                />
              </FormField>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Driver pay</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Rate per mile" htmlFor="driverRatePerMile">
                <Input
                  placeholder=""
                  value={settingsDraft?.driverRatePerMile ? settingsDraft.driverRatePerMile : ""}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, driverRatePerMile: e.target.value })}
                />
              </FormField>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Tracking preference</div>
            <FormField label="Primary tracking method" htmlFor="trackingPreference">
              <Select
                value={settingsDraft?.trackingPreference ?? ""}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, trackingPreference: e.target.value })}
              >
                <option value="">Select method</option>
                <option value="MANUAL">Manual</option>
                <option value="SAMSARA">Samsara</option>
                <option value="MOTIVE">Motive</option>
                <option value="OTHER">Other</option>
              </Select>
            </FormField>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Settlement defaults</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Settlement schedule" htmlFor="settlementSchedule">
                <Select
                  value={settingsDraft?.settlementSchedule ?? ""}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, settlementSchedule: e.target.value })}
                >
                  <option value="">Select schedule</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="BIWEEKLY">Bi-weekly</option>
                  <option value="SEMI_MONTHLY">Semi-monthly</option>
                  <option value="MONTHLY">Monthly</option>
                </Select>
              </FormField>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Pay statement template</div>
                <CheckboxField
                  id="settlementTemplateLinehaul"
                  label="Include linehaul"
                  checked={Boolean(settingsDraft?.settlementTemplate?.includeLinehaul)}
                  onChange={(e) => {
                    const current = settingsDraft?.settlementTemplate ?? {};
                    setSettingsDraft({
                      ...settingsDraft,
                      settlementTemplate: { ...current, includeLinehaul: e.target.checked },
                    });
                  }}
                />
                <CheckboxField
                  id="settlementTemplateFuel"
                  label="Include fuel surcharge"
                  checked={Boolean(settingsDraft?.settlementTemplate?.includeFuelSurcharge)}
                  onChange={(e) => {
                    const current = settingsDraft?.settlementTemplate ?? {};
                    setSettingsDraft({
                      ...settingsDraft,
                      settlementTemplate: { ...current, includeFuelSurcharge: e.target.checked },
                    });
                  }}
                />
                <CheckboxField
                  id="settlementTemplateAccessorials"
                  label="Include accessorials"
                  checked={Boolean(settingsDraft?.settlementTemplate?.includeAccessorials)}
                  onChange={(e) => {
                    const current = settingsDraft?.settlementTemplate ?? {};
                    setSettingsDraft({
                      ...settingsDraft,
                      settlementTemplate: { ...current, includeAccessorials: e.target.checked },
                    });
                  }}
                />
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Bulk load import</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              Upload CSV templates from <code>data/import</code>. Loads can include miles. Stops should follow the yard to yard to consignee pattern.
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Loads CSV" htmlFor="adminLoadsCsv">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setLoadsFile(e.target.files?.[0] ?? null)}
                />
              </FormField>
              <FormField label="Stops CSV" htmlFor="adminStopsCsv">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setStopsFile(e.target.files?.[0] ?? null)}
                />
              </FormField>
            </div>
            <CheckboxField
              id="wipeLoadsAdmin"
              label="Wipe existing loads before import"
              checked={wipeLoads}
              onChange={(e) => setWipeLoads(e.target.checked)}
            />
            {importError ? <div className="text-sm text-[color:var(--color-danger)]">{importError}</div> : null}
            {importResult ? <div className="text-sm text-[color:var(--color-success)]">{importResult}</div> : null}
            <Button onClick={runImport}>Import CSV</Button>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button onClick={updateSettings} disabled={saveState === "saving"}>
              {getSaveButtonLabel(saveState)}
            </Button>
            <Button variant="secondary" onClick={() => setSettingsDraft(settings)}>
              Reset
            </Button>
          </div>
        </AdminSettingsShell>
      </RouteGuard>
    </AppShell>
  );
}

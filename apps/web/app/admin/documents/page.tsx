"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/rbac/route-guard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { CheckboxField } from "@/components/ui/checkbox";
import { ErrorBanner } from "@/components/ui/error-banner";
import { AdminSettingsShell } from "@/components/admin-settings/AdminSettingsShell";
import { apiFetch } from "@/lib/api";

const DOC_TYPES = ["POD", "RATECON", "BOL", "LUMPER", "SCALE", "DETENTION", "OTHER"];
const DRIVER_DOC_TYPES = ["CDL", "MED_CARD", "MVR", "W9", "INSURANCE", "OTHER"];

export default function DocumentsSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<any | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<any | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError((err as Error).message || "Failed to load document settings.");
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
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
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveState("saving");
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
      setSaveState("saved");
      saveTimerRef.current = window.setTimeout(() => {
        setSaveState("idle");
      }, 2000);
    } catch (err) {
      setSaveState("idle");
      setError((err as Error).message || "Failed to save settings.");
    }
  };

  return (
    <AppShell title="Settings" hideHeader={true}>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <AdminSettingsShell
          title="Documents"
          titleAlign="center"
          subtitle="Proof of delivery rules and required documents."
          backAction={
            <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full border border-[color:var(--color-divider)] bg-white/90 p-0" onClick={() => router.push("/admin")} aria-label="Back">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4L6 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          }
        >
          {error ? <ErrorBanner message={error} /> : null}

          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Document Vault</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">Company, truck, and driver compliance files.</div>
            </div>
            <Link
              href="/admin/documents/vault"
              className="inline-flex items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:border-[color:var(--color-divider-strong)] hover:bg-[color:var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)] focus-visible:ring-offset-2"
            >
              Open vault
            </Link>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Proof of delivery</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <CheckboxField
                id="podRequireSignature"
                label="Require signature"
                checked={Boolean(settingsDraft?.podRequireSignature)}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, podRequireSignature: e.target.checked })}
              />
              <CheckboxField
                id="podRequirePrintedName"
                label="Require printed name"
                checked={Boolean(settingsDraft?.podRequirePrintedName)}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, podRequirePrintedName: e.target.checked })}
              />
              <CheckboxField
                id="podRequireDeliveryDate"
                label="Require consignee date"
                checked={Boolean(settingsDraft?.podRequireDeliveryDate)}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, podRequireDeliveryDate: e.target.checked })}
              />
              <FormField label="Minimum POD pages" htmlFor="podMinPages">
                <Input
                  placeholder=""
                  value={settingsDraft?.podMinPages ? settingsDraft.podMinPages : ""}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, podMinPages: e.target.value })}
                />
              </FormField>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Required documents</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Invoice docs</div>
                {DOC_TYPES.map((docType) => (
                  <CheckboxField
                    key={docType}
                    id={`requiredDoc-${docType}`}
                    label={docType}
                    checked={settingsDraft?.requiredDocs?.includes(docType) ?? false}
                    onChange={(e) => {
                      const current = settingsDraft?.requiredDocs ?? [];
                      const next = e.target.checked
                        ? [...current, docType]
                        : current.filter((item: string) => item !== docType);
                      setSettingsDraft({ ...settingsDraft, requiredDocs: next });
                    }}
                  />
                ))}
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Driver docs</div>
                {DRIVER_DOC_TYPES.map((docType) => (
                  <CheckboxField
                    key={docType}
                    id={`requiredDriverDoc-${docType}`}
                    label={docType}
                    checked={settingsDraft?.requiredDriverDocs?.includes(docType) ?? false}
                    onChange={(e) => {
                      const current = settingsDraft?.requiredDriverDocs ?? [];
                      const next = e.target.checked
                        ? [...current, docType]
                        : current.filter((item: string) => item !== docType);
                      setSettingsDraft({ ...settingsDraft, requiredDriverDocs: next });
                    }}
                  />
                ))}
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Dispatch rules</div>
            <CheckboxField
              id="requireRateConBeforeDispatch"
              label="Require rate confirmation before dispatch"
              checked={Boolean(settingsDraft?.requireRateConBeforeDispatch)}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, requireRateConBeforeDispatch: e.target.checked })}
            />
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button onClick={updateSettings} disabled={saveState === "saving"}>
              {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Save"}
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

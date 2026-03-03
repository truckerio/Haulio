"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/rbac/route-guard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { StatusChip } from "@/components/ui/status-chip";
import { AdminSettingsShell } from "@/components/admin-settings/AdminSettingsShell";
import { apiFetch } from "@/lib/api";

function buildAdminSettingsPayload(settings: any) {
  const toNumber = (value: any, fallback: number) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };
  const toOptionalNumber = (value: any) => {
    if (value === undefined || value === null || value === "") return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  };

  return {
    companyDisplayName: String(settings?.companyDisplayName ?? ""),
    remitToAddress: String(settings?.remitToAddress ?? ""),
    currency:
      settings?.currency && String(settings.currency).trim().length === 3
        ? String(settings.currency).toUpperCase()
        : undefined,
    operatingMode: settings?.operatingMode ? String(settings.operatingMode) : undefined,
    invoiceTerms: String(settings?.invoiceTerms ?? ""),
    invoiceTermsDays: toOptionalNumber(settings?.invoiceTermsDays),
    invoiceFooter: String(settings?.invoiceFooter ?? ""),
    invoicePrefix: String(settings?.invoicePrefix ?? ""),
    nextInvoiceNumber: toNumber(settings?.nextInvoiceNumber, 0),
    podRequireSignature: Boolean(settings?.podRequireSignature),
    podRequirePrintedName: Boolean(settings?.podRequirePrintedName),
    podRequireDeliveryDate: Boolean(settings?.podRequireDeliveryDate),
    podMinPages: toNumber(settings?.podMinPages, 1),
    requiredDocs: Array.isArray(settings?.requiredDocs) ? settings.requiredDocs : [],
    requiredDriverDocs: Array.isArray(settings?.requiredDriverDocs) ? settings.requiredDriverDocs : [],
    collectPodDueMinutes: toNumber(settings?.collectPodDueMinutes, 0),
    missingPodAfterMinutes: toNumber(settings?.missingPodAfterMinutes, 0),
    reminderFrequencyMinutes: toNumber(settings?.reminderFrequencyMinutes, 0),
    requireRateConBeforeDispatch: Boolean(settings?.requireRateConBeforeDispatch),
    inboundRateconEmailEnabled: Boolean(settings?.inboundRateconEmailEnabled),
    trackingPreference: settings?.trackingPreference ? String(settings.trackingPreference) : undefined,
    settlementSchedule: settings?.settlementSchedule ? String(settings.settlementSchedule) : undefined,
    settlementTemplate: settings?.settlementTemplate
      ? {
          includeLinehaul: Boolean(settings.settlementTemplate.includeLinehaul),
          includeFuelSurcharge: Boolean(settings.settlementTemplate.includeFuelSurcharge),
          includeAccessorials: Boolean(settings.settlementTemplate.includeAccessorials),
        }
      : undefined,
    timezone: settings?.timezone ? String(settings.timezone) : undefined,
    freeStorageMinutes: toNumber(settings?.freeStorageMinutes, 0),
    storageRatePerDay: String(settings?.storageRatePerDay ?? "0"),
    pickupFreeDetentionMinutes: toNumber(settings?.pickupFreeDetentionMinutes, 0),
    deliveryFreeDetentionMinutes: toNumber(settings?.deliveryFreeDetentionMinutes, 0),
    detentionRatePerHour:
      settings?.detentionRatePerHour !== undefined && settings?.detentionRatePerHour !== null
        ? String(settings.detentionRatePerHour)
        : undefined,
    driverRatePerMile: String(settings?.driverRatePerMile ?? "0"),
    logoUrl: settings?.logoUrl ? String(settings.logoUrl) : undefined,
  };
}

export default function IntegrationsSettingsPage() {
  const router = useRouter();
  const [samsaraStatus, setSamsaraStatus] = useState<any | null>(null);
  const [samsaraToken, setSamsaraToken] = useState("");
  const [truckMappings, setTruckMappings] = useState<any[]>([]);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [mappingEdits, setMappingEdits] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<any | null>(null);
  const [aliases, setAliases] = useState<any[]>([]);
  const [newAliasAddress, setNewAliasAddress] = useState("");
  const [inboundSaving, setInboundSaving] = useState(false);
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasUpdatingId, setAliasUpdatingId] = useState<string | null>(null);
  const [quickbooksStatus, setQuickbooksStatus] = useState<{ enabled: boolean; companyId: string | null } | null>(null);
  const [fuelStatus, setFuelStatus] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleTruckCount, setVisibleTruckCount] = useState(5);

  const loadData = async () => {
    try {
        const results = await Promise.allSettled([
          apiFetch<{ integration: any }>("/api/integrations/samsara/status"),
          apiFetch<{ mappings: any[] }>("/api/integrations/samsara/truck-mappings"),
          apiFetch<{ trucks: any[] }>("/admin/trucks"),
          apiFetch<{ status: string }>("/admin/fuel/status"),
          apiFetch<{ enabled: boolean; companyId: string | null }>("/integrations/quickbooks/status"),
          apiFetch<{ settings: any }>("/admin/settings"),
          apiFetch<{ aliases: any[] }>("/admin/inbound-email-aliases"),
        ]);
      const [samsaraResult, mappingResult, trucksResult, fuelResult, quickbooksResult, settingsResult, aliasesResult] =
        results;

      if (samsaraResult.status === "fulfilled") setSamsaraStatus(samsaraResult.value.integration ?? null);
      if (mappingResult.status === "fulfilled") setTruckMappings(mappingResult.value.mappings ?? []);
      if (trucksResult.status === "fulfilled") setTrucks(trucksResult.value.trucks ?? []);
      if (fuelResult.status === "fulfilled") setFuelStatus(fuelResult.value ?? null);
      if (quickbooksResult.status === "fulfilled") setQuickbooksStatus(quickbooksResult.value ?? null);
      if (settingsResult.status === "fulfilled") setSettings(settingsResult.value.settings ?? null);
      if (aliasesResult.status === "fulfilled") setAliases(aliasesResult.value.aliases ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Failed to load integrations.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const next: Record<string, string> = {};
    truckMappings.forEach((mapping) => {
      if (mapping.truckId && mapping.externalId) {
        next[mapping.truckId] = mapping.externalId;
      }
    });
    setMappingEdits((prev) => ({ ...next, ...prev }));
  }, [truckMappings]);

  const connectSamsara = async () => {
    await apiFetch("/api/integrations/samsara/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiToken: samsaraToken }),
    });
    setSamsaraToken("");
    loadData();
  };

  const disconnectSamsara = async () => {
    await apiFetch("/api/integrations/samsara/disconnect", { method: "POST" });
    loadData();
  };

  const saveTruckMapping = async (truckId: string) => {
    await apiFetch("/api/integrations/samsara/map-truck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ truckId, externalId: mappingEdits[truckId] ?? "" }),
    });
    loadData();
  };

  const updateInboundEnabled = async (enabled: boolean) => {
    if (!settings) return;
    setInboundSaving(true);
    try {
      const payload = {
        ...buildAdminSettingsPayload(settings),
        inboundRateconEmailEnabled: enabled,
      };
      await apiFetch("/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadData();
    } catch (err) {
      setError((err as Error).message || "Failed to update inbound email setting.");
    } finally {
      setInboundSaving(false);
    }
  };

  const createAlias = async () => {
    const address = newAliasAddress.trim().toLowerCase();
    if (!address) return;
    setAliasSaving(true);
    try {
      await apiFetch("/admin/inbound-email-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, isActive: true }),
      });
      setNewAliasAddress("");
      await loadData();
    } catch (err) {
      setError((err as Error).message || "Failed to create inbound alias.");
    } finally {
      setAliasSaving(false);
    }
  };

  const toggleAlias = async (alias: { id: string; isActive: boolean }) => {
    setAliasUpdatingId(alias.id);
    try {
      await apiFetch(`/admin/inbound-email-aliases/${alias.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !alias.isActive }),
      });
      await loadData();
    } catch (err) {
      setError((err as Error).message || "Failed to update alias.");
    } finally {
      setAliasUpdatingId(null);
    }
  };

  const visibleTrucks = trucks.slice(0, visibleTruckCount);
  const lastFuelSyncAt = fuelStatus?.lastFuelSyncAt ? new Date(fuelStatus.lastFuelSyncAt) : null;
  const lastFuelSyncError = fuelStatus?.lastFuelSyncError ?? null;
  const fuelStale = !lastFuelSyncAt || Date.now() - lastFuelSyncAt.getTime() > 12 * 60 * 60 * 1000;
  const fuelNeedsAttention = Boolean(lastFuelSyncError) || fuelStale;
  const inboundEnabled = Boolean(settings?.inboundRateconEmailEnabled);

  return (
    <AppShell title="Settings" hideHeader={true}>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <AdminSettingsShell
          title="Integrations"
          titleAlign="center"
          subtitle="Telematics and connected services."
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
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Integrations</div>
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Samsara</div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">Status: {samsaraStatus?.status ?? "DISCONNECTED"}</div>
                  {samsaraStatus?.errorMessage ? (
                    <div className="text-xs text-[color:var(--color-danger)]">{samsaraStatus.errorMessage}</div>
                  ) : null}
                  {fuelStatus ? (
                    <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip label={fuelNeedsAttention ? "Needs attention" : "Healthy"} tone={fuelNeedsAttention ? "warning" : "success"} />
                        <span>
                          Vehicles mapped {fuelStatus.mappedCount ?? 0}/{fuelStatus.totalTrucks ?? 0} ·
                          {lastFuelSyncAt ? ` Last sync ${lastFuelSyncAt.toLocaleString()}` : " No fuel sync yet"}
                        </span>
                      </div>
                      {fuelNeedsAttention && lastFuelSyncError ? (
                        <div className="mt-1 text-[11px] text-[color:var(--color-danger)]">{lastFuelSyncError}</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => router.push("/admin/integrations/samsara/fuel")}>
                    View fuel summary
                  </Button>
                  <Button size="sm" variant="secondary" onClick={disconnectSamsara}>
                    Disconnect
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-[1fr,auto]">
                <FormField label="Samsara API token" htmlFor="samsaraToken">
                  <Input
                    placeholder=""
                    value={samsaraToken}
                    onChange={(e) => setSamsaraToken(e.target.value)}
                  />
                </FormField>
                <Button onClick={connectSamsara} disabled={!samsaraToken}>
                  Connect
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Truck mappings</div>
              <div className="grid gap-2">
                {visibleTrucks.map((truck) => (
                  <div
                    key={truck.id}
                    className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-3 py-2"
                  >
                    <div className="text-sm font-semibold">{truck.unit}</div>
                    <FormField label="Samsara vehicle/device ID" htmlFor={`mapping-${truck.id}`}>
                      <Input
                        placeholder=""
                        value={mappingEdits[truck.id] ?? ""}
                        onChange={(e) => setMappingEdits({ ...mappingEdits, [truck.id]: e.target.value })}
                      />
                    </FormField>
                    <Button size="sm" variant="secondary" onClick={() => saveTruckMapping(truck.id)}>
                      Save
                    </Button>
                  </div>
                ))}
                {trucks.length === 0 ? <EmptyState title="No trucks available." /> : null}
                {trucks.length > visibleTruckCount ? (
                  <Button variant="ghost" size="sm" onClick={() => setVisibleTruckCount((prev) => prev + 5)}>
                    Load more
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Inbound ratecon email</div>
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Email forwarding setup</div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">Forward customer rate confirmations to your org alias.</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                    <StatusChip label={inboundEnabled ? "Enabled" : "Disabled"} tone={inboundEnabled ? "success" : "warning"} />
                    <span>{aliases.length} alias{aliases.length === 1 ? "" : "es"} configured</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!settings || inboundSaving}
                    onClick={() => updateInboundEnabled(!inboundEnabled)}
                  >
                    {inboundEnabled ? "Disable inbound email" : "Enable inbound email"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => router.push("/loads/confirmations")}>
                    Open RC Inbox
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 lg:grid-cols-[1fr,auto]">
                <FormField
                  label="Inbound alias address"
                  htmlFor="newInboundAlias"
                  hint="Example: ratecon+wrath@inbound.haulio.us"
                >
                  <Input
                    value={newAliasAddress}
                    placeholder=""
                    onChange={(e) => setNewAliasAddress(e.target.value)}
                  />
                </FormField>
                <Button onClick={createAlias} disabled={aliasSaving || !newAliasAddress.trim()}>
                  {aliasSaving ? "Saving..." : "Add alias"}
                </Button>
              </div>

              <div className="mt-3 grid gap-2">
                {aliases.length === 0 ? (
                  <div className="text-sm text-[color:var(--color-text-muted)]">No aliases configured yet.</div>
                ) : (
                  aliases.map((alias) => (
                    <div
                      key={alias.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-white/80 px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-semibold text-ink">{alias.address}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          Updated {new Date(alias.updatedAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusChip label={alias.isActive ? "Active" : "Inactive"} tone={alias.isActive ? "success" : "neutral"} />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={aliasUpdatingId === alias.id}
                          onClick={() => toggleAlias(alias)}
                        >
                          {alias.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Accounting</div>
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">QuickBooks</div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">
                    Status: {quickbooksStatus?.enabled ? "ENABLED" : "DISABLED"}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                    <StatusChip label={quickbooksStatus?.enabled ? "Configured" : "Needs setup"} tone={quickbooksStatus?.enabled ? "success" : "warning"} />
                    <span>Company ID: {quickbooksStatus?.companyId ?? "Not configured"}</span>
                  </div>
                  <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">
                    Configure via env vars: <code>QUICKBOOKS_ENABLED</code>, <code>QUICKBOOKS_ACCESS_TOKEN</code>.
                    Set org QuickBooks Company ID in Finance settings.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => router.push("/finance")}>
                    Open Finance settings
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </AdminSettingsShell>
      </RouteGuard>
    </AppShell>
  );
}

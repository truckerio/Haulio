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

export default function IntegrationsSettingsPage() {
  const router = useRouter();
  const [samsaraStatus, setSamsaraStatus] = useState<any | null>(null);
  const [samsaraToken, setSamsaraToken] = useState("");
  const [truckMappings, setTruckMappings] = useState<any[]>([]);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [mappingEdits, setMappingEdits] = useState<Record<string, string>>({});
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
      ]);
      const [samsaraResult, mappingResult, trucksResult, fuelResult] = results;

      if (samsaraResult.status === "fulfilled") setSamsaraStatus(samsaraResult.value.integration ?? null);
      if (mappingResult.status === "fulfilled") setTruckMappings(mappingResult.value.mappings ?? []);
      if (trucksResult.status === "fulfilled") setTrucks(trucksResult.value.trucks ?? []);
      if (fuelResult.status === "fulfilled") setFuelStatus(fuelResult.value ?? null);
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

  const visibleTrucks = trucks.slice(0, visibleTruckCount);
  const lastFuelSyncAt = fuelStatus?.lastFuelSyncAt ? new Date(fuelStatus.lastFuelSyncAt) : null;
  const lastFuelSyncError = fuelStatus?.lastFuelSyncError ?? null;
  const fuelStale = !lastFuelSyncAt || Date.now() - lastFuelSyncAt.getTime() > 12 * 60 * 60 * 1000;
  const fuelNeedsAttention = Boolean(lastFuelSyncError) || fuelStale;

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
        </AdminSettingsShell>
      </RouteGuard>
    </AppShell>
  );
}

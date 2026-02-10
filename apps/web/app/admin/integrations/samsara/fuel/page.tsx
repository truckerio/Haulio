"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/rbac/route-guard";
import { AdminSettingsShell } from "@/components/admin-settings/AdminSettingsShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ErrorBanner } from "@/components/ui/error-banner";
import { StatusChip } from "@/components/ui/status-chip";
import { apiFetch } from "@/lib/api";

type FuelRow = {
  id: string;
  truckId: string;
  truckUnit?: string | null;
  truckVin?: string | null;
  fuelUsed?: number | null;
  distance?: number | null;
  fuelEfficiency?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  lastSyncedAt?: string | null;
  source?: string | null;
};

type SummaryPayload = {
  rows: FuelRow[];
  periodStart?: string | null;
  periodEnd?: string | null;
  lastSyncedAt?: string | null;
};

type FuelStatus = {
  status?: string;
  mappedCount?: number;
  totalTrucks?: number;
  lastFuelSyncAt?: string | null;
  lastFuelSyncError?: string | null;
};

const formatNumber = (value?: number | null, decimals = 1) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(decimals);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

export default function FuelSummaryPage() {
  const router = useRouter();
  const [range, setRange] = useState("7d");
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [status, setStatus] = useState<FuelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, statusRes] = await Promise.all([
        apiFetch<SummaryPayload>(`/admin/fuel/summary?range=${range}`),
        apiFetch<FuelStatus>("/admin/fuel/status"),
      ]);
      setSummary(summaryRes);
      setStatus(statusRes);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Failed to load fuel summary.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rows = summary?.rows ?? [];
  const lastFuelSyncAt = status?.lastFuelSyncAt ? new Date(status.lastFuelSyncAt) : null;
  const lastFuelSyncError = status?.lastFuelSyncError ?? null;
  const fuelStale = !lastFuelSyncAt || Date.now() - lastFuelSyncAt.getTime() > 12 * 60 * 60 * 1000;
  const fuelNeedsAttention = Boolean(lastFuelSyncError) || fuelStale;
  const healthLabel = fuelNeedsAttention ? "Needs attention" : "Healthy";
  const healthTone = fuelNeedsAttention ? "warning" : "success";
  const mappedCount = status?.mappedCount ?? 0;

  return (
    <AppShell title="Settings" hideHeader={true}>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <AdminSettingsShell
          title="Fuel Summary"
          titleAlign="center"
          subtitle="Samsara fuel usage snapshots for mapped trucks."
          backAction={
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-full border border-[color:var(--color-divider)] bg-white/90 p-0"
              onClick={() => router.push("/admin/integrations")}
              aria-label="Back"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4L6 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          }
        >
          {error ? <ErrorBanner message={error} /> : null}

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Fuel summary</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {status ? `Vehicles mapped ${mappedCount}/${status.totalTrucks ?? 0}` : "Mapping status unavailable"}
                  {" · "}
                  Last synced {formatDateTime(status?.lastFuelSyncAt ?? null)}
                </div>
                {fuelNeedsAttention && lastFuelSyncError ? (
                  <div className="mt-1 text-[11px] text-[color:var(--color-danger)]">{lastFuelSyncError}</div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip label={healthLabel} tone={healthTone} />
                <Select value={range} onChange={(event) => setRange(event.target.value)}>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </Select>
                <div className="text-xs text-[color:var(--color-text-muted)]">Data source: Samsara</div>
              </div>
            </div>

            {mappedCount === 0 ? (
              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/80 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
                Map vehicles in Samsara to see fuel data.
                <Button variant="ghost" size="sm" className="ml-2" onClick={() => router.push("/admin/integrations")}>
                  Go to mappings
                </Button>
              </div>
            ) : null}

            {loading ? (
              <div className="text-sm text-[color:var(--color-text-muted)]">Loading fuel summary…</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-[color:var(--color-text-muted)]">No fuel data yet. Connect Samsara and wait for sync.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Truck</th>
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Fuel used</th>
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Distance</th>
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Efficiency</th>
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Last sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-[color:var(--color-divider)] last:border-0">
                        <td className="px-3 py-3 font-semibold text-ink">
                          {row.truckUnit ? `Truck ${row.truckUnit}` : row.truckVin ?? row.truckId}
                        </td>
                        <td className="px-3 py-3">{formatNumber(row.fuelUsed, 2)}</td>
                        <td className="px-3 py-3">{formatNumber(row.distance, 1)}</td>
                        <td className="px-3 py-3">{formatNumber(row.fuelEfficiency, 2)}</td>
                        <td className="px-3 py-3">{formatDateTime(row.lastSyncedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </AdminSettingsShell>
      </RouteGuard>
    </AppShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { RouteGuard } from "@/components/rbac/route-guard";
import { apiFetch } from "@/lib/api";

type SettingsRowProps = {
  title: string;
  description: string;
  value: string;
  onClick: () => void;
};

function SettingsRow({ title, description, value, onClick }: SettingsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[56px] w-full items-center justify-between gap-4 px-5 py-3 text-left transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
    >
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-ink">{title}</div>
        <div className="mt-1 text-[12px] text-[color:var(--color-text-muted)]">{description}</div>
      </div>
      <div className="flex items-center gap-3 text-[13px] text-[color:var(--color-text-muted)]">
        <span className="max-w-[160px] text-right">{value}</span>
        <span className="text-[14px] text-[color:var(--color-text-subtle)]">&gt;</span>
      </div>
    </button>
  );
}

const pluralize = (count: number, singular: string, plural: string) => (count === 1 ? singular : plural);

export default function AdminPage() {
  const router = useRouter();
  const [operatingEntities, setOperatingEntities] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [trailers, setTrailers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any | null>(null);
  const [samsaraStatus, setSamsaraStatus] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const results = await Promise.allSettled([
          apiFetch<{ entities: any[] }>("/api/operating-entities"),
          apiFetch<{ users: any[] }>("/admin/users"),
          apiFetch<{ drivers: any[] }>("/admin/drivers"),
          apiFetch<{ trucks: any[] }>("/admin/trucks"),
          apiFetch<{ trailers: any[] }>("/admin/trailers"),
          apiFetch<{ settings: any }>("/admin/settings"),
          apiFetch<{ integration: any }>("/api/integrations/samsara/status"),
        ]);

        const [entitiesResult, usersResult, driversResult, trucksResult, trailersResult, settingsResult, samsaraResult] = results;

        if (entitiesResult.status === "fulfilled") setOperatingEntities(entitiesResult.value.entities ?? []);
        if (usersResult.status === "fulfilled") setUsers(usersResult.value.users ?? []);
        if (driversResult.status === "fulfilled") setDrivers(driversResult.value.drivers ?? []);
        if (trucksResult.status === "fulfilled") setTrucks(trucksResult.value.trucks ?? []);
        if (trailersResult.status === "fulfilled") setTrailers(trailersResult.value.trailers ?? []);
        if (settingsResult.status === "fulfilled") setSettings(settingsResult.value.settings ?? null);
        if (samsaraResult.status === "fulfilled") setSamsaraStatus(samsaraResult.value.integration ?? null);
        setError(null);
      } catch (err) {
        setError((err as Error).message || "Failed to load settings.");
      }
    };

    load();
  }, []);

  const employeeCount = useMemo(
    () => users.filter((user) => user.role !== "DRIVER").length,
    [users]
  );
  const requiredDocsCount = useMemo(() => {
    const requiredDocs = Array.isArray(settings?.requiredDocs) ? settings?.requiredDocs.length : 0;
    const driverDocs = Array.isArray(settings?.requiredDriverDocs) ? settings?.requiredDriverDocs.length : 0;
    return requiredDocs + driverDocs;
  }, [settings]);

  const companyValue = `${operatingEntities.length} ${pluralize(
    operatingEntities.length,
    "operating entity",
    "operating entities"
  )}`;
  const docsValue = requiredDocsCount > 0 ? `${requiredDocsCount} required documents` : "Not configured";
  const integrationValue = samsaraStatus?.status === "CONNECTED" ? "Connected" : "Not connected";
  const automationValue = settings ? "Configured" : "Not configured";
  const fleetCount = trucks.length + trailers.length;
  const fleetValue = `${fleetCount} trucks & trailers`;
  const employeesValue = `${employeeCount} ${pluralize(employeeCount, "employee", "employees")}`;
  const driversValue = `${drivers.length} ${pluralize(drivers.length, "driver", "drivers")}`;

  return (
    <AppShell title="Settings">
      <RouteGuard allowedRoles={["ADMIN"]}>
        <div className="space-y-6">
          {error ? <ErrorBanner message={error} /> : null}

          <Card className="divide-y divide-[color:var(--color-divider)] bg-white/90 p-0 overflow-hidden">
            <SettingsRow
              title="Company"
              description="Identity, billing, and operating entities."
              value={companyValue}
              onClick={() => router.push("/admin/company")}
            />
            <SettingsRow
              title="Documents"
              description="POD rules and required paperwork."
              value={docsValue}
              onClick={() => router.push("/admin/documents")}
            />
            <SettingsRow
              title="Integrations"
              description="Telematics and external connections."
              value={integrationValue}
              onClick={() => router.push("/admin/integrations")}
            />
            <SettingsRow
              title="Automation"
              description="POD thresholds and billing guardrails."
              value={automationValue}
              onClick={() => router.push("/admin/automation")}
            />
            <SettingsRow
              title="Fleet"
              description="Trucks, trailers, and bulk imports."
              value={fleetValue}
              onClick={() => router.push("/admin/fleet")}
            />
          </Card>

          <Card className="space-y-3 bg-white/90 p-0 overflow-hidden">
            <div className="px-5 pt-4 text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">People & Access</div>
            <div className="divide-y divide-[color:var(--color-divider)]">
              <SettingsRow
                title="Employees"
                description="Dispatchers, billing, and admins."
                value={employeesValue}
                onClick={() => router.push("/admin/people/employees")}
              />
              <SettingsRow
                title="Drivers"
                description="Driver profiles and access."
                value={driversValue}
                onClick={() => router.push("/admin/people/drivers")}
              />
            </div>
          </Card>
        </div>
      </RouteGuard>
    </AppShell>
  );
}

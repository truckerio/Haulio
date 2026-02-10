"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/rbac/route-guard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { ErrorBanner } from "@/components/ui/error-banner";
import { ImportWizard } from "@/components/ImportWizard";
import { apiFetch } from "@/lib/api";
import { AdminSettingsShell } from "@/components/admin-settings/AdminSettingsShell";
import { AdminDrawer } from "@/components/admin-settings/AdminDrawer";

const DRIVER_TEMPLATE = "name,phone,license,payRatePerMile,licenseExpiresAt,medCardExpiresAt\n";
const DRIVER_STATUS_OPTIONS = ["AVAILABLE", "ON_LOAD", "UNAVAILABLE"] as const;
const SORT_OPTIONS = [
  { value: "name", label: "Name (A-Z)" },
  { value: "recent", label: "Recently created" },
] as const;

function DriversPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [driverError, setDriverError] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    search: "",
    status: "",
    team: "",
    sort: "name",
  });
  const [visibleCount, setVisibleCount] = useState(5);

  const [driverForm, setDriverForm] = useState({
    name: "",
    email: "",
    phone: "",
    license: "",
    licenseState: "",
    licenseExpiresAt: "",
    medCardExpiresAt: "",
    payRatePerMile: "",
    password: "",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [driverData, teamData] = await Promise.all([
          apiFetch<{ drivers: any[] }>("/admin/drivers"),
          apiFetch<{ teams: any[] }>("/admin/teams"),
        ]);
        setDrivers(driverData.drivers);
        setTeams(teamData.teams ?? []);
      } catch (err) {
        setError((err as Error).message || "Failed to load drivers.");
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (searchParams.get("add") === "driver") {
      setDrawerOpen(true);
    }
  }, [searchParams]);

  const userTeams = useMemo(() => {
    const map = new Map<string, string[]>();
    teams.forEach((team) => {
      (team.members ?? []).forEach((member: any) => {
        const list = map.get(member.id) ?? [];
        list.push(team.name);
        map.set(member.id, list);
      });
    });
    return map;
  }, [teams]);

  const filteredDrivers = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const status = filters.status;
    const team = filters.team;

    let result = drivers.filter((driver) => {
      if (search) {
        const haystack = `${driver.name ?? ""} ${driver.phone ?? ""} ${driver.user?.email ?? ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (status) {
        if (status === "ARCHIVED" && !driver.archivedAt) return false;
        if (status !== "ARCHIVED" && driver.archivedAt) return false;
        if (status !== "ARCHIVED" && driver.status !== status) return false;
      }
      if (team) {
        const teamNames = driver.userId ? userTeams.get(driver.userId) ?? [] : [];
        if (!teamNames.includes(team)) return false;
      }
      return true;
    });

    if (filters.sort === "recent") {
      result = result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      result = result.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    return result;
  }, [drivers, filters, userTeams]);

  const visibleDrivers = filteredDrivers.slice(0, visibleCount);

  const resetDrawer = () => {
    setDriverForm({
      name: "",
      email: "",
      phone: "",
      license: "",
      licenseState: "",
      licenseExpiresAt: "",
      medCardExpiresAt: "",
      payRatePerMile: "",
      password: "",
    });
    setEditingDriverId(null);
    setDriverError(null);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    resetDrawer();
    router.replace("/admin/people/drivers");
  };

  const openEditDrawer = (driver: any) => {
    const toDateInput = (value?: string | Date | null) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return date.toISOString().slice(0, 10);
    };
    setEditingDriverId(driver.id);
    setDriverForm({
      name: driver.name ?? "",
      email: driver.user?.email ?? "",
      phone: driver.phone ?? "",
      license: driver.license ?? "",
      licenseState: driver.licenseState ?? "",
      licenseExpiresAt: toDateInput(driver.licenseExpiresAt),
      medCardExpiresAt: toDateInput(driver.medCardExpiresAt),
      payRatePerMile: driver.payRatePerMile ? String(driver.payRatePerMile) : "",
      password: "",
    });
    setDrawerOpen(true);
  };

  const saveDriver = async () => {
    setDriverError(null);
    const payload = {
      name: driverForm.name,
      email: driverForm.email || undefined,
      phone: driverForm.phone || undefined,
      license: driverForm.license || undefined,
      licenseState: driverForm.licenseState || undefined,
      licenseExpiresAt: driverForm.licenseExpiresAt || undefined,
      medCardExpiresAt: driverForm.medCardExpiresAt || undefined,
      payRatePerMile: driverForm.payRatePerMile || undefined,
      password: driverForm.password || undefined,
    };
    try {
      if (editingDriverId) {
        await apiFetch(`/admin/drivers/${editingDriverId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/drivers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      resetDrawer();
      setDrawerOpen(false);
      const refreshed = await apiFetch<{ drivers: any[] }>("/admin/drivers");
      setDrivers(refreshed.drivers);
    } catch (err) {
      setDriverError((err as Error).message || "Failed to save driver.");
    }
  };

  const updateDriverStatus = async (driverId: string, status: string) => {
    await apiFetch(`/admin/drivers/${driverId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const refreshed = await apiFetch<{ drivers: any[] }>("/admin/drivers");
    setDrivers(refreshed.drivers);
  };

  const toggleDriverArchive = async (driverId: string, archivedAt?: string | null) => {
    const action = archivedAt ? "restore" : "archive";
    const confirmText = archivedAt ? "Restore this driver?" : "Archive this driver? They will be removed from dispatch lists.";
    if (!window.confirm(confirmText)) return;
    await apiFetch(`/admin/drivers/${driverId}/${action}`, { method: "POST" });
    const refreshed = await apiFetch<{ drivers: any[] }>("/admin/drivers");
    setDrivers(refreshed.drivers);
  };

  return (
    <AppShell title="Settings" hideHeader={true}>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <AdminSettingsShell
          title="Drivers"
          titleAlign="center"
          subtitle="Driver profiles, availability, and access."
          backAction={
            <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full border border-[color:var(--color-divider)] bg-white/90 p-0" onClick={() => router.push("/admin")} aria-label="Back">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4L6 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          }
          actions={
            <Button variant="primary" onClick={() => setDrawerOpen(true)}>
              Add driver
            </Button>
          }
        >
          {error ? <ErrorBanner message={error} /> : null}

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Drivers</div>
                <div className="text-[12px] text-[color:var(--color-text-muted)]">{filteredDrivers.length} drivers</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Search name, phone, or email"
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                />
                <Select
                  value={filters.status}
                  onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="">All status</option>
                  {DRIVER_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                  <option value="ARCHIVED">Archived</option>
                </Select>
                <Select
                  value={filters.team}
                  onChange={(event) => setFilters((prev) => ({ ...prev, team: event.target.value }))}
                >
                  <option value="">All teams</option>
                  {[...new Set(teams.map((team) => team.name))].map((teamName) => (
                    <option key={teamName} value={teamName}>
                      {teamName}
                    </option>
                  ))}
                </Select>
                <Select
                  value={filters.sort}
                  onChange={(event) => setFilters((prev) => ({ ...prev, sort: event.target.value }))}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Name</th>
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Phone</th>
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Email</th>
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Status</th>
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Truck</th>
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDrivers.map((driver) => (
                    <tr key={driver.id} className="border-b border-[color:var(--color-divider)] last:border-0">
                      <td className="px-3 py-3 font-semibold text-ink">{driver.name}</td>
                      <td className="px-3 py-3">{driver.phone ?? "-"}</td>
                      <td className="px-3 py-3">{driver.user?.email ?? "-"}</td>
                      <td className="px-3 py-3">
                        {driver.archivedAt ? (
                          <span className="text-[color:var(--color-text-muted)]">Archived</span>
                        ) : (
                          <Select
                            value={driver.status ?? "AVAILABLE"}
                            onChange={(event) => updateDriverStatus(driver.id, event.target.value)}
                          >
                            {DRIVER_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </Select>
                        )}
                      </td>
                      <td className="px-3 py-3">-</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEditDrawer(driver)}>
                            Edit
                          </Button>
                          <Button
                            variant={driver.archivedAt ? "primary" : "secondary"}
                            size="sm"
                            onClick={() => toggleDriverArchive(driver.id, driver.archivedAt)}
                          >
                            {driver.archivedAt ? "Restore" : "Archive"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {visibleDrivers.length < filteredDrivers.length ? (
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setVisibleCount((prev) => prev + 5)}>
                  Load more
                </Button>
              </div>
            ) : null}
          </Card>

          <ImportWizard
            type="drivers"
            title="Bulk import drivers"
            description="Upload drivers.csv to create or update driver records."
            templateCsv={DRIVER_TEMPLATE}
            onImported={() => {
              apiFetch<{ drivers: any[] }>("/admin/drivers").then((data) => setDrivers(data.drivers)).catch(() => null);
            }}
          />
        </AdminSettingsShell>

        <AdminDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          title={editingDriverId ? "Edit driver" : "Add driver"}
          subtitle={editingDriverId ? "Update driver details and availability." : "Create a driver profile and login."}
          footer={
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={saveDriver}
                disabled={!driverForm.name || (!editingDriverId && Boolean(driverForm.email) && !driverForm.password)}
              >
                {editingDriverId ? "Save" : "Create"}
              </Button>
              <Button variant="secondary" onClick={closeDrawer}>
                Cancel
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Driver name" htmlFor="driverName" required>
                <Input
                  id="driverName"
                  value={driverForm.name}
                  onChange={(event) => setDriverForm({ ...driverForm, name: event.target.value })}
                />
              </FormField>
              <FormField label="Driver email" htmlFor="driverEmail" hint="Required for a login.">
                <Input
                  id="driverEmail"
                  value={driverForm.email}
                  onChange={(event) => setDriverForm({ ...driverForm, email: event.target.value })}
                  disabled={Boolean(editingDriverId)}
                />
              </FormField>
              <FormField label="Phone" htmlFor="driverPhone">
                <Input
                  id="driverPhone"
                  value={driverForm.phone}
                  onChange={(event) => setDriverForm({ ...driverForm, phone: event.target.value })}
                />
              </FormField>
              <FormField label="Temporary password" htmlFor="driverPassword" hint="Required when creating a login.">
                <Input
                  id="driverPassword"
                  value={driverForm.password}
                  onChange={(event) => setDriverForm({ ...driverForm, password: event.target.value })}
                  disabled={Boolean(editingDriverId)}
                />
              </FormField>
            </div>

            <details className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-3 py-2">
              <summary className="cursor-pointer list-none text-sm font-semibold text-ink">More details</summary>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <FormField label="License" htmlFor="driverLicense">
                  <Input
                    id="driverLicense"
                    value={driverForm.license}
                    onChange={(event) => setDriverForm({ ...driverForm, license: event.target.value })}
                  />
                </FormField>
                <FormField label="License state" htmlFor="driverLicenseState">
                  <Input
                    id="driverLicenseState"
                    value={driverForm.licenseState}
                    onChange={(event) => setDriverForm({ ...driverForm, licenseState: event.target.value })}
                  />
                </FormField>
                <FormField label="License expires" htmlFor="driverLicenseExpires">
                  <Input
                    id="driverLicenseExpires"
                    type="date"
                    value={driverForm.licenseExpiresAt}
                    onChange={(event) => setDriverForm({ ...driverForm, licenseExpiresAt: event.target.value })}
                  />
                </FormField>
                <FormField label="Med card expires" htmlFor="driverMedCardExpires">
                  <Input
                    id="driverMedCardExpires"
                    type="date"
                    value={driverForm.medCardExpiresAt}
                    onChange={(event) => setDriverForm({ ...driverForm, medCardExpiresAt: event.target.value })}
                  />
                </FormField>
                <FormField label="Pay rate per mile" htmlFor="driverPayRate">
                  <Input
                    id="driverPayRate"
                    value={driverForm.payRatePerMile}
                    onChange={(event) => setDriverForm({ ...driverForm, payRatePerMile: event.target.value })}
                  />
                </FormField>
              </div>
            </details>

            {driverError ? <ErrorBanner message={driverError} /> : null}
          </div>
        </AdminDrawer>
      </RouteGuard>
    </AppShell>
  );
}

export default function DriversPage() {
  return (
    <Suspense fallback={null}>
      <DriversPageContent />
    </Suspense>
  );
}

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
import { useUser } from "@/components/auth/user-context";

const EMPLOYEE_TEMPLATE = "email,role,name,phone,timezone\n";
const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "HEAD_DISPATCHER", label: "Head Dispatcher" },
  { value: "DISPATCHER", label: "Dispatcher" },
  { value: "BILLING", label: "Billing" },
] as const;
const EDITABLE_ROLE_OPTIONS = ["DISPATCHER", "HEAD_DISPATCHER", "BILLING"] as const;

const SORT_OPTIONS = [
  { value: "name", label: "Name (A-Z)" },
  { value: "recent", label: "Recently created" },
  { value: "role", label: "Role" },
] as const;

function EmployeesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser } = useUser();
  const [users, setUsers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [employeeInviteUrl, setEmployeeInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [mfaResetError, setMfaResetError] = useState<string | null>(null);
  const [mfaResettingId, setMfaResettingId] = useState<string | null>(null);
  const [employeeImportResult, setEmployeeImportResult] = useState<any | null>(null);
  const [employeeInvites, setEmployeeInvites] = useState<any[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [filters, setFilters] = useState({
    search: "",
    role: "",
    status: "",
    team: "",
    sort: "name",
  });
  const [visibleCount, setVisibleCount] = useState(5);

  const [employeeForm, setEmployeeForm] = useState({
    email: "",
    role: "DISPATCHER",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [userData, teamData] = await Promise.all([
          apiFetch<{ users: any[] }>("/admin/users"),
          apiFetch<{ teams: any[] }>("/admin/teams"),
        ]);
        setUsers(userData.users);
        setTeams(teamData.teams ?? []);
      } catch (err) {
        setError((err as Error).message || "Failed to load employees.");
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (searchParams.get("add") === "employee") {
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

  const filteredUsers = useMemo(() => {
    const list = users.filter((user) => user.role !== "DRIVER");
    const search = filters.search.trim().toLowerCase();
    const role = filters.role;
    const status = filters.status;
    const team = filters.team;

    let result = list.filter((user) => {
      if (search) {
        const haystack = `${user.name ?? ""} ${user.email ?? ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (role && user.role !== role) return false;
      if (status) {
        const active = user.isActive ? "active" : "inactive";
        if (active !== status) return false;
      }
      if (team) {
        const teamsForUser = userTeams.get(user.id) ?? [];
        if (!teamsForUser.includes(team)) return false;
      }
      return true;
    });

    if (filters.sort === "recent") {
      result = result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (filters.sort === "role") {
      result = result.sort((a, b) => String(a.role).localeCompare(String(b.role)));
    } else {
      result = result.sort((a, b) => String(a.name ?? a.email).localeCompare(String(b.name ?? b.email)));
    }

    return result;
  }, [filters, users, userTeams]);

  const visibleUsers = filteredUsers.slice(0, visibleCount);

  const resetDrawer = () => {
    setEmployeeForm({
      email: "",
      role: "DISPATCHER",
    });
    setEmployeeInviteUrl(null);
    setEmployeeError(null);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    resetDrawer();
    router.replace("/admin/people/employees");
  };

  const createEmployee = async (copyInvite: boolean) => {
    setEmployeeSaving(true);
    setEmployeeError(null);
    setEmployeeInviteUrl(null);
    try {
      const data = await apiFetch<{ invite: { inviteUrl?: string } }>("/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: employeeForm.email,
          role: employeeForm.role,
        }),
      });
      const inviteUrl = data.invite?.inviteUrl;
      if (inviteUrl) {
        setEmployeeInviteUrl(inviteUrl);
        if (copyInvite) {
          try {
            await navigator.clipboard.writeText(inviteUrl);
          } catch {
            // Clipboard not available.
          }
        }
      }
      setEmployeeForm({ email: "", role: "DISPATCHER" });
    } catch (err) {
      setEmployeeError((err as Error).message || "Failed to create invite.");
    } finally {
      setEmployeeSaving(false);
    }
  };

  const updateUserRole = async (userId: string, role: string) => {
    setRoleError(null);
    setRoleSavingId(userId);
    try {
      const data = await apiFetch<{ user: any }>(`/admin/members/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      setUsers((prev) => prev.map((item) => (item.id === userId ? { ...item, role: data.user.role } : item)));
    } catch (err) {
      setRoleError((err as Error).message || "Failed to update role.");
    } finally {
      setRoleSavingId(null);
    }
  };

  const toggleUserStatus = async (userId: string, isActive: boolean) => {
    if (!window.confirm(`${isActive ? "Deactivate" : "Reactivate"} this account?`)) return;
    const endpoint = isActive ? `/admin/users/${userId}/deactivate` : `/admin/users/${userId}/reactivate`;
    await apiFetch(endpoint, { method: "POST" });
    const refreshed = await apiFetch<{ users: any[] }>("/admin/users");
    setUsers(refreshed.users);
  };

  const sendInvite = async (user: { email: string; role: string }) => {
    setInviteError(null);
    try {
      const data = await apiFetch<{ invite: { inviteUrl?: string } }>("/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, role: user.role }),
      });
      if (data.invite?.inviteUrl) {
        await navigator.clipboard.writeText(data.invite.inviteUrl);
      }
    } catch (err) {
      setInviteError((err as Error).message || "Failed to copy invite.");
    }
  };

  const resetUserMfa = async (userId: string) => {
    if (!window.confirm("Reset two-factor authentication for this user?")) return;
    setMfaResetError(null);
    setMfaResettingId(userId);
    try {
      await apiFetch(`/admin/users/${userId}/mfa/reset`, { method: "POST" });
    } catch (err) {
      setMfaResetError((err as Error).message || "Failed to reset 2FA.");
    } finally {
      setMfaResettingId(null);
    }
  };

  const generateEmployeeInvites = async () => {
    if (!employeeImportResult?.created?.length) return;
    try {
      const invites = await Promise.all(
        employeeImportResult.created.map(async (item: any) => {
          const data = await apiFetch<{ invite: any }>("/admin/invites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: item.email, role: item.role || "DISPATCHER" }),
          });
          return data.invite;
        })
      );
      setEmployeeInvites(invites.filter(Boolean));
    } catch (err) {
      setInviteError((err as Error).message || "Failed to generate invites.");
    }
  };

  const copyInviteLinks = async () => {
    if (employeeInvites.length === 0) return;
    const text = employeeInvites.map((invite) => `${invite.email}: ${invite.inviteUrl}`).join("\n");
    await navigator.clipboard.writeText(text);
  };

  const content = (
    <AppShell title="Settings" hideHeader={true}>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <AdminSettingsShell
          title="Employees"
          titleAlign="center"
          subtitle="Employee accounts, roles, and invite links."
          backAction={
            <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full border border-[color:var(--color-divider)] bg-white/90 p-0" onClick={() => router.push("/admin")} aria-label="Back">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4L6 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          }
          actions={
            <Button variant="primary" onClick={() => setDrawerOpen(true)}>
              Invite employee
            </Button>
          }
        >
          {error ? <ErrorBanner message={error} /> : null}

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Employees</div>
                <div className="text-[12px] text-[color:var(--color-text-muted)]">{filteredUsers.length} employees</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Search name or email"
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                />
                <Select
                  value={filters.role}
                  onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}
                >
                  <option value="">All roles</option>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={filters.status}
                  onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="">All status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
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

            {roleError ? <ErrorBanner message={roleError} /> : null}
            {inviteError ? <ErrorBanner message={inviteError} /> : null}
            {mfaResetError ? <ErrorBanner message={mfaResetError} /> : null}

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Name</th>
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Email</th>
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Role</th>
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Status</th>
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Phone</th>
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Team</th>
                    <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => {
                    const teamNames = userTeams.get(user.id) ?? [];
                    return (
                      <tr key={user.id} className="border-b border-[color:var(--color-divider)] last:border-0">
                        <td className="px-3 py-3 font-semibold text-ink">{user.name ?? "-"}</td>
                        <td className="px-3 py-3">{user.email}</td>
                        <td className="px-3 py-3">
                          {EDITABLE_ROLE_OPTIONS.includes(user.role) ? (
                            <Select
                              value={user.role}
                              onChange={(event) => updateUserRole(user.id, event.target.value)}
                              disabled={roleSavingId === user.id}
                            >
                              {EDITABLE_ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role}>
                                  {role === "HEAD_DISPATCHER" ? "Head Dispatcher" : role}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <div className="text-xs text-[color:var(--color-text-muted)]">
                              {user.role === "ADMIN" ? "Admin" : user.role}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={user.isActive ? "text-[color:var(--color-success)]" : "text-[color:var(--color-danger)]"}>
                            {user.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-3">{user.phone ?? "-"}</td>
                        <td className="px-3 py-3">{teamNames.length ? teamNames.join(", ") : "-"}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button variant="ghost" size="sm" onClick={() => sendInvite(user)}>
                              Copy invite
                            </Button>
                            <Button
                              variant={user.isActive ? "secondary" : "primary"}
                              size="sm"
                              onClick={() => toggleUserStatus(user.id, user.isActive)}
                            >
                              {user.isActive ? "Deactivate" : "Reactivate"}
                            </Button>
                            {currentUser?.id && currentUser.id !== user.id ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => resetUserMfa(user.id)}
                                disabled={mfaResettingId === user.id}
                              >
                                {mfaResettingId === user.id ? "Resetting 2FA..." : "Reset 2FA"}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {visibleUsers.length < filteredUsers.length ? (
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setVisibleCount((prev) => prev + 5)}>
                  Load more
                </Button>
              </div>
            ) : null}
          </Card>

          <ImportWizard
            type="employees"
            title="Bulk import employees"
            description="Upload employees.csv to create dispatch and billing users. Invite links appear after import."
            templateCsv={EMPLOYEE_TEMPLATE}
            onImported={(result) => {
              setEmployeeImportResult(result);
              setEmployeeInvites([]);
              apiFetch<{ users: any[] }>("/admin/users").then((data) => setUsers(data.users)).catch(() => null);
            }}
          />

          {employeeImportResult?.created?.length ? (
            <Card className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Invite new employees</div>
              <div className="text-[13px] text-[color:var(--color-text-muted)]">
                Generate one-time invite links for newly created accounts.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={generateEmployeeInvites}>Generate invites</Button>
                {employeeInvites.length ? (
                  <Button variant="secondary" onClick={copyInviteLinks}>Copy all</Button>
                ) : null}
              </div>
              {employeeInvites.length ? (
                <div className="grid gap-2">
                  {employeeInvites.map((invite) => (
                    <div key={invite.id ?? invite.email} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-2 text-sm">
                      <div className="font-semibold">{invite.email}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">{invite.inviteUrl}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}
        </AdminSettingsShell>

        <AdminDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          title="Invite employee"
          subtitle="Invite an employee and assign a role."
          footer={
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => createEmployee(false)}
                disabled={employeeSaving || !employeeForm.email}
              >
                {employeeSaving ? "Saving..." : "Create invite"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => createEmployee(true)}
                disabled={employeeSaving || !employeeForm.email}
              >
                Create & copy invite
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Email" htmlFor="employeeEmail" required>
                <Input
                  id="employeeEmail"
                  value={employeeForm.email}
                  onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })}
                />
              </FormField>
              <FormField label="Role" htmlFor="employeeRole">
                <Select
                  id="employeeRole"
                  value={employeeForm.role}
                  onChange={(event) => setEmployeeForm({ ...employeeForm, role: event.target.value })}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            {employeeError ? <ErrorBanner message={employeeError} /> : null}
            {employeeInviteUrl ? (
              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-3 py-2 text-xs break-all">
                Invite link: {employeeInviteUrl}
              </div>
            ) : null}
          </div>
        </AdminDrawer>
      </RouteGuard>
    </AppShell>
  );

  return content;
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={null}>
      <EmployeesPageContent />
    </Suspense>
  );
}

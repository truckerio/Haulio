"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/rbac/route-guard";
import { AdminSettingsShell } from "@/components/admin-settings/AdminSettingsShell";
import { AdminDrawer } from "@/components/admin-settings/AdminDrawer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { CheckboxField } from "@/components/ui/checkbox";
import { ErrorBanner } from "@/components/ui/error-banner";
import { apiFetch } from "@/lib/api";

type TeamMember = {
  id: string;
  name?: string | null;
  email: string;
  role: string;
};

type Team = {
  id: string;
  name: string;
  active: boolean;
  members: TeamMember[];
};

type UserRow = {
  id: string;
  name?: string | null;
  email: string;
  role: string;
  isActive?: boolean;
};

const DEFAULT_TEAM_NAME = "Default";

export default function AdminTeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftActive, setDraftActive] = useState(true);
  const [draftMemberIds, setDraftMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) =>
      String(a.name ?? a.email).localeCompare(String(b.name ?? b.email))
    );
  }, [users]);

  const loadData = async () => {
    const [teamData, userData] = await Promise.all([
      apiFetch<{ teams: Team[] }>("/admin/teams"),
      apiFetch<{ users: UserRow[] }>("/admin/users"),
    ]);
    const nextTeams = teamData.teams ?? [];
    const nextUsers = userData.users ?? [];
    setTeams(nextTeams);
    setUsers(nextUsers);
    return { teams: nextTeams, users: nextUsers };
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        await loadData();
        if (!active) return;
        setError(null);
      } catch (err) {
        if (!active) return;
        setError((err as Error).message || "Failed to load teams.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const openTeam = (team: Team) => {
    setSelectedTeamId(team.id);
    setDraftName(team.name);
    setDraftActive(Boolean(team.active));
    setDraftMemberIds((team.members ?? []).map((member) => member.id));
    setDrawerError(null);
  };

  const closeDrawer = () => {
    setSelectedTeamId(null);
    setDraftName("");
    setDraftActive(true);
    setDraftMemberIds([]);
    setDrawerError(null);
  };

  const createTeam = async () => {
    const name = createName.trim();
    if (name.length < 2) {
      setError("Team name must be at least 2 characters.");
      return;
    }
    setCreating(true);
    try {
      const response = await apiFetch<{ team: Team }>("/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setCreateName("");
      setError(null);
      const loaded = await loadData();
      const createdTeam = loaded.teams.find((team) => team.id === response.team.id);
      if (createdTeam) {
        openTeam(createdTeam);
      }
    } catch (err) {
      setError((err as Error).message || "Failed to create team.");
    } finally {
      setCreating(false);
    }
  };

  const saveTeam = async () => {
    if (!selectedTeam) return;
    const name = draftName.trim();
    if (name.length < 2) {
      setDrawerError("Team name must be at least 2 characters.");
      return;
    }

    setSaving(true);
    setDrawerError(null);
    try {
      if (name !== selectedTeam.name || draftActive !== selectedTeam.active) {
        await apiFetch<{ team: Team }>(`/admin/teams/${selectedTeam.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, active: draftActive }),
        });
      }

      const currentMemberIds = new Set((selectedTeam.members ?? []).map((member) => member.id));
      const nextMemberIds = new Set(draftMemberIds);
      const addIds = [...nextMemberIds].filter((id) => !currentMemberIds.has(id));
      const removeIds = [...currentMemberIds].filter((id) => !nextMemberIds.has(id));

      if (addIds.length > 0) {
        await Promise.all(
          addIds.map((userId) =>
            apiFetch("/admin/teams/" + selectedTeam.id + "/members", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId }),
            })
          )
        );
      }

      if (removeIds.length > 0) {
        await Promise.all(
          removeIds.map((userId) =>
            apiFetch(`/admin/teams/${selectedTeam.id}/members/${userId}`, {
              method: "DELETE",
            })
          )
        );
      }

      const loaded = await loadData();
      const refreshed = loaded.teams.find((team) => team.id === selectedTeam.id);
      if (refreshed) {
        openTeam(refreshed);
      } else {
        closeDrawer();
      }
      setError(null);
    } catch (err) {
      setDrawerError((err as Error).message || "Failed to save team changes.");
    } finally {
      setSaving(false);
    }
  };

  const deleteTeam = async (team: Team) => {
    if (team.name === DEFAULT_TEAM_NAME) return;
    if (!window.confirm(`Delete team "${team.name}"? Members and assignments will be moved to Default.`)) return;
    setDeletingTeamId(team.id);
    try {
      await apiFetch(`/admin/teams/${team.id}`, { method: "DELETE" });
      if (selectedTeamId === team.id) {
        closeDrawer();
      }
      await loadData();
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Failed to delete team.");
    } finally {
      setDeletingTeamId(null);
    }
  };

  const toggleDraftMember = (userId: string, checked: boolean) => {
    setDraftMemberIds((prev) =>
      checked ? Array.from(new Set([...prev, userId])) : prev.filter((id) => id !== userId)
    );
  };

  return (
    <AppShell title="Teams (Ops)" hideHeader={true}>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <AdminSettingsShell
          title="Team Settings"
          titleAlign="center"
          subtitle="Create, manage, and assign internal teams for operations."
          backAction={
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-full border border-[color:var(--color-divider)] bg-white/90 p-0"
              onClick={() => router.push("/teams")}
              aria-label="Back"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4L6 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          }
        >
          {error ? <ErrorBanner message={error} /> : null}

          <Card className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Create team</div>
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Team name" htmlFor="teamName" className="min-w-[260px] flex-1">
                <Input
                  id="teamName"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Night Dispatch"
                />
              </FormField>
              <Button onClick={createTeam} disabled={creating}>
                {creating ? "Creating..." : "Create team"}
              </Button>
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              The <strong>Default</strong> team is system-managed and cannot be deleted.
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="hidden md:grid md:grid-cols-[1fr,110px,90px,220px] md:items-center md:gap-3 border-b border-[color:var(--color-divider)] px-4 py-3 text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
              <div>Team</div>
              <div>Status</div>
              <div>Members</div>
              <div className="text-right">Actions</div>
            </div>
            {loading ? (
              <div className="px-4 py-6 text-sm text-[color:var(--color-text-muted)]">Loading teams...</div>
            ) : teams.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[color:var(--color-text-muted)]">No teams yet.</div>
            ) : (
              teams.map((team) => (
                <div
                  key={team.id}
                  className="flex flex-col gap-2 border-b border-[color:var(--color-divider)] px-4 py-3 last:border-b-0 md:grid md:grid-cols-[1fr,110px,90px,220px] md:items-center md:gap-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{team.name}</div>
                    {team.name === DEFAULT_TEAM_NAME ? (
                      <div className="text-xs text-[color:var(--color-text-muted)]">System default team</div>
                    ) : null}
                  </div>
                  <div className="text-xs text-[color:var(--color-text-muted)] md:text-xs">Status: {team.active ? "Active" : "Inactive"}</div>
                  <div className="text-sm text-ink">Members: {team.members?.length ?? 0}</div>
                  <div className="flex items-center justify-start gap-2 md:justify-end">
                    <Button size="sm" variant="secondary" onClick={() => openTeam(team)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => deleteTeam(team)}
                      disabled={team.name === DEFAULT_TEAM_NAME || deletingTeamId === team.id}
                      className="text-[color:var(--color-danger)]"
                    >
                      {deletingTeamId === team.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </Card>
        </AdminSettingsShell>

        <AdminDrawer
          open={Boolean(selectedTeam)}
          onClose={closeDrawer}
          eyebrow="People & Access"
          title={selectedTeam ? `Edit ${selectedTeam.name}` : "Edit team"}
          subtitle="Update team details and membership."
          footer={
            <>
              <Button variant="secondary" onClick={closeDrawer}>
                Cancel
              </Button>
              <Button onClick={saveTeam} disabled={!selectedTeam || saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </>
          }
        >
          {drawerError ? <ErrorBanner message={drawerError} /> : null}

          {selectedTeam ? (
            <div className="space-y-5">
              <FormField label="Team name" htmlFor="editTeamName">
                <Input id="editTeamName" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
              </FormField>

              <CheckboxField
                id="editTeamActive"
                label="Team is active"
                checked={draftActive}
                disabled={selectedTeam.name === DEFAULT_TEAM_NAME}
                onChange={(e) => setDraftActive(e.target.checked)}
                hint={selectedTeam.name === DEFAULT_TEAM_NAME ? "Default team is always active." : "Inactive teams are hidden from Ops pages."}
              />

              <div className="space-y-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Members</div>
                <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-3">
                  {sortedUsers.length === 0 ? (
                    <div className="text-sm text-[color:var(--color-text-muted)]">No employees found.</div>
                  ) : (
                    sortedUsers.map((user) => {
                      const checked = draftMemberIds.includes(user.id);
                      return (
                        <label
                          key={user.id}
                          className="flex cursor-pointer items-start justify-between gap-3 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-ink">{user.name || user.email}</div>
                            <div className="truncate text-xs text-[color:var(--color-text-muted)]">{user.email}</div>
                            <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text-subtle)]">{user.role}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleDraftMember(user.id, e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border border-[color:var(--color-divider)]"
                          />
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </AdminDrawer>
      </RouteGuard>
    </AppShell>
  );
}

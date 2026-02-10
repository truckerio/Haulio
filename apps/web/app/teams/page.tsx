"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useUser } from "@/components/auth/user-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { NoAccess } from "@/components/rbac/no-access";

type Team = { id: string; name: string; active?: boolean };

type TeamCounts = {
  total: number;
  needsAssignment: number;
  atRisk: number;
};

const emptyCounts: TeamCounts = { total: 0, needsAssignment: 0, atRisk: 0 };

export default function TeamsOpsPage() {
  return (
    <AppShell title="Teams (Ops)" subtitle="Distribute loads across teams without leaving dispatch.">
      <TeamsOpsContent />
    </AppShell>
  );
}

function TeamsOpsContent() {
  const { user, loading } = useUser();
  const canAccess = Boolean(user && (user.role === "ADMIN" || user.role === "HEAD_DISPATCHER"));
  const [teams, setTeams] = useState<Team[]>([]);
  const [counts, setCounts] = useState<Record<string, TeamCounts>>({});
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const teamsEnabled = useMemo(() => teams.some((team) => team.name && team.name !== "Default"), [teams]);

  useEffect(() => {
    if (!canAccess) {
      setTeams([]);
      setLoadingTeams(false);
      return;
    }
    let active = true;
    setLoadingTeams(true);
    apiFetch<{ teams: Team[] }>("/teams")
      .then((data) => {
        if (!active) return;
        setTeams(data.teams ?? []);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setTeams([]);
        setError((err as Error).message || "Failed to load teams.");
      })
      .finally(() => {
        if (!active) return;
        setLoadingTeams(false);
      });
    return () => {
      active = false;
    };
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess || teams.length === 0 || !teamsEnabled) {
      setCounts({});
      return;
    }
    let active = true;
    setLoadingCounts(true);
    const fetchCounts = async (teamId: string) => {
      const base = new URLSearchParams({
        view: "dispatch",
        teamId,
        page: "1",
        limit: "10",
      }).toString();
      const [total, needsAssignment, atRisk] = await Promise.all([
        apiFetch<{ total: number }>(`/loads?${base}`),
        apiFetch<{ total: number }>(`/loads?${base}&needsAssignment=true`),
        apiFetch<{ total: number }>(`/loads?${base}&atRisk=true`),
      ]);
      return {
        total: total.total ?? 0,
        needsAssignment: needsAssignment.total ?? 0,
        atRisk: atRisk.total ?? 0,
      };
    };
    (async () => {
      try {
        const entries = await Promise.all(
          teams.map(async (team) => {
            const teamCounts = await fetchCounts(team.id);
            return [team.id, teamCounts] as const;
          })
        );
        if (!active) return;
        setCounts(Object.fromEntries(entries));
      } catch (err) {
        if (!active) return;
        setError((err as Error).message || "Failed to load team counts.");
      } finally {
        if (!active) return;
        setLoadingCounts(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [canAccess, teams, teamsEnabled]);

  const showManageLink = Boolean(user?.role === "ADMIN");

  const content = useMemo(() => {
    if (loading || loadingTeams) {
      return <EmptyState title="Loading teams..." />;
    }
    if (!canAccess) {
      return <NoAccess />;
    }
    if (!teamsEnabled) {
      return (
        <EmptyState
          title="Teams are not enabled."
          description="Ask an admin to set up teams before distributing loads."
        />
      );
    }
    return (
      <div className="space-y-4">
        {error ? <ErrorBanner message={error} /> : null}
        {teams.filter((team) => team.name !== "Default").map((team) => {
          const teamCounts = counts[team.id] ?? emptyCounts;
          return (
            <Card key={team.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <div className="text-lg font-semibold text-ink">{team.name}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">Active team</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
                  Loads {teamCounts.total}
                </Badge>
                <Badge className="bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]">
                  Needs assignment {teamCounts.needsAssignment}
                </Badge>
                <Badge className="bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]">
                  At risk {teamCounts.atRisk}
                </Badge>
                <Link href={`/teams/${team.id}`}>
                  <Button size="sm">Open</Button>
                </Link>
              </div>
            </Card>
          );
        })}
        {loadingCounts ? (
          <div className="text-xs text-[color:var(--color-text-muted)]">Updating counts…</div>
        ) : null}
      </div>
    );
  }, [loading, loadingTeams, canAccess, teamsEnabled, teams, counts, error, loadingCounts]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-[color:var(--color-text-muted)]">Operations</div>
          <div className="text-lg font-semibold text-ink">Team distribution</div>
        </div>
        {showManageLink ? (
          <Link href="/admin">
            <Button size="sm" variant="secondary">
              Manage teams
            </Button>
          </Link>
        ) : null}
      </div>
      {content}
    </>
  );
}

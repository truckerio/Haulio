"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useUser } from "@/components/auth/user-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { NoAccess } from "@/components/rbac/no-access";
import { formatStatusLabel } from "@/lib/status-format";

type Team = { id: string; name: string };

type DispatchLoad = {
  id: string;
  loadNumber?: string | null;
  status?: string | null;
  customerName?: string | null;
  route?: {
    shipperCity?: string | null;
    shipperState?: string | null;
    consigneeCity?: string | null;
    consigneeState?: string | null;
  };
  riskFlags?: {
    needsAssignment?: boolean;
    trackingOffInTransit?: boolean;
    overdueStopWindow?: boolean;
    atRisk?: boolean;
  };
};

export default function TeamLoadsPage() {
  return (
    <AppShell title="Teams (Ops)" subtitle="Move loads between teams without changing dispatch.">
      <TeamLoadsContent />
    </AppShell>
  );
}

function TeamLoadsContent() {
  const params = useParams();
  const router = useRouter();
  const teamId = params?.teamId as string | undefined;
  const { user, loading } = useUser();
  const canAccess = Boolean(user && (user.role === "ADMIN" || user.role === "HEAD_DISPATCHER"));
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamName, setTeamName] = useState<string>("");
  const [loads, setLoads] = useState<DispatchLoad[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingLoads, setLoadingLoads] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveTargetTeamId, setMoveTargetTeamId] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveProgress, setMoveProgress] = useState<{ done: number; total: number } | null>(null);
  const [moveNote, setMoveNote] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    if (!canAccess) {
      setLoadingTeams(false);
      return;
    }
    setLoadingTeams(true);
    try {
      const data = await apiFetch<{ teams: Team[] }>("/teams");
      setTeams(data.teams ?? []);
      const current = data.teams?.find((team) => team.id === teamId);
      setTeamName(current?.name ?? "Team");
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Failed to load teams.");
    } finally {
      setLoadingTeams(false);
    }
  }, [canAccess, teamId]);

  const loadTeamLoads = useCallback(async () => {
    if (!canAccess || !teamId) {
      setLoadingLoads(false);
      return;
    }
    setLoadingLoads(true);
    try {
      const query = new URLSearchParams({
        view: "dispatch",
        teamId,
        page: "1",
        limit: "100",
      }).toString();
      const data = await apiFetch<{ items: DispatchLoad[] }>(`/loads?${query}`);
      setLoads(data.items ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Failed to load team loads.");
    } finally {
      setLoadingLoads(false);
    }
  }, [canAccess, teamId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    loadTeamLoads();
  }, [loadTeamLoads]);

  useEffect(() => {
    if (!teamId) {
      router.replace("/teams");
    }
  }, [router, teamId]);

  const filteredLoads = useMemo(() => {
    if (!search.trim()) return loads;
    const query = search.trim().toLowerCase();
    return loads.filter((load) => {
      const loadNumber = load.loadNumber ?? load.id;
      const customer = load.customerName ?? "";
      const origin = load.route?.shipperCity ?? "";
      const dest = load.route?.consigneeCity ?? "";
      return [loadNumber, customer, origin, dest].some((value) => value.toLowerCase().includes(query));
    });
  }, [loads, search]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredLoads.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredLoads.map((load) => load.id)));
  };

  const applyMove = async () => {
    if (!teamId || !moveTargetTeamId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const idSet = new Set(ids);
    setMoving(true);
    setMoveProgress({ done: 0, total: ids.length });
    setMoveNote(null);
    setError(null);
    const batchSize = 10;
    try {
      for (let index = 0; index < ids.length; index += batchSize) {
        const batch = ids.slice(index, index + batchSize);
        await apiFetch("/teams/assign-loads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: moveTargetTeamId,
            loadIds: batch,
          }),
        });
        setMoveProgress((prev) => (prev ? { ...prev, done: Math.min(prev.done + batch.length, prev.total) } : null));
      }
      if (moveTargetTeamId !== teamId) {
        setLoads((prev) => prev.filter((load) => !idSet.has(load.id)));
      }
      setSelectedIds(new Set());
      setMoveTargetTeamId("");
      setMoveNote("✓ Updated");
    } catch (err) {
      const message = (err as Error).message || "Failed to move loads.";
      if (message.toLowerCase().includes("forbidden") || message.toLowerCase().includes("not authorized")) {
        setError("You don’t have permission to reassign loads. Ask an admin.");
      } else {
        setError(message);
      }
    } finally {
      setMoving(false);
      setMoveProgress(null);
    }
  };

  const selectionCount = selectedIds.size;

  const renderContent = () => {
    if (loading || loadingTeams || loadingLoads) {
      return <EmptyState title="Loading team loads..." />;
    }
    if (!canAccess) {
      return <NoAccess />;
    }
    if (filteredLoads.length === 0) {
      return <EmptyState title="No loads in this team." description="Assign loads from Dispatch or Teams Ops." />;
    }
    return (
      <div className="space-y-3">
        {error ? <ErrorBanner message={error} /> : null}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[color:var(--color-divider)] px-4 py-3 text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selectionCount > 0 && selectionCount === filteredLoads.length} onChange={toggleAll} />
              Select all
            </label>
            <span className="ml-auto">{filteredLoads.length} loads</span>
          </div>
          <div className="divide-y divide-[color:var(--color-divider)]">
            {filteredLoads.map((load) => {
              const lane = `${load.route?.shipperCity ?? "-"}, ${load.route?.shipperState ?? ""} → ${
                load.route?.consigneeCity ?? "-"
              }, ${load.route?.consigneeState ?? ""}`;
              const risks = [];
              if (load.riskFlags?.needsAssignment) risks.push("Needs assignment");
              if (load.riskFlags?.atRisk) risks.push("At risk");
              if (load.riskFlags?.trackingOffInTransit) risks.push("Tracking off");
              if (load.riskFlags?.overdueStopWindow) risks.push("Stop overdue");
              return (
                <div key={load.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(load.id)}
                    onChange={() => toggleSelection(load.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-ink">{load.loadNumber ?? load.id}</div>
                      {load.status ? (
                        <Badge className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
                          {formatStatusLabel(load.status)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {load.customerName ?? "Customer"} · {lane}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {risks.map((risk) => (
                      <Badge key={risk} className="bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]">
                        {risk}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/teams" className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
            Teams
          </Link>
          <div className="text-lg font-semibold text-ink">{teamName}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search loads"
            className="w-48"
          />
        </div>
      </div>

      {selectionCount > 0 ? (
        <Card className="flex flex-wrap items-center gap-3 p-3">
          <div className="text-sm text-ink">{selectionCount} selected</div>
          <Select value={moveTargetTeamId} onChange={(event) => setMoveTargetTeamId(event.target.value)}>
            <option value="">Move to team...</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={applyMove} disabled={!moveTargetTeamId || moving}>
            {moving ? "Moving..." : "Apply"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setSelectedIds(new Set());
              setMoveTargetTeamId("");
            }}
            disabled={moving}
          >
            Clear
          </Button>
          {moveProgress ? (
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Moving {moveProgress.done}/{moveProgress.total}
            </div>
          ) : null}
          {moveNote ? <div className="text-xs text-[color:var(--color-text-muted)]">{moveNote}</div> : null}
        </Card>
      ) : null}

      {renderContent()}
    </>
  );
}

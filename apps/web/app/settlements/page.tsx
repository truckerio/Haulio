"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { RefinePanel } from "@/components/ui/refine-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-banner";
import { RouteGuard } from "@/components/rbac/route-guard";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { formatSettlementStatusLabel } from "@/lib/status-format";

export default function SettlementsPage() {
  return (
    <AppShell title="Settlements" subtitle="Driver pay loop">
      <SettlementsContent />
    </AppShell>
  );
}

function SettlementsContent() {
  const { user } = useUser();
  const canAccess = Boolean(user && (user.role === "ADMIN" || user.role === "BILLING"));
  const [settlements, setSettlements] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [totals, setTotals] = useState<{ count: number; net: string } | null>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [form, setForm] = useState({ driverId: "", periodStart: "", periodEnd: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: "ALL",
    from: "",
    to: "",
    week: "",
    groupBy: "week",
    driverId: "",
  });
  const [selected, setSelected] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startDate = form.periodStart ? new Date(form.periodStart) : null;
  const endDate = form.periodEnd ? new Date(form.periodEnd) : null;
  const invalidRange = Boolean(startDate && endDate && startDate.getTime() > endDate.getTime());

  const settlementTone = (status?: string | null) => {
    if (status === "PAID") return "success" as const;
    if (status === "FINALIZED") return "success" as const;
    if (status === "DRAFT") return "warning" as const;
    return "neutral" as const;
  };

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.week) params.set("week", filters.week);
    if (filters.groupBy) params.set("groupBy", filters.groupBy);
    if (filters.driverId) params.set("driverId", filters.driverId);
    return params.toString();
  }, [filters]);

  const loadData = useCallback(async () => {
    try {
      const query = buildParams();
      const meData = await apiFetch<{ user: { role: string } }>("/auth/me");
      setUserRole(meData.user.role);
      const settlementData = await apiFetch<any>(`/settlements${query ? `?${query}` : ""}`);
      setSettlements(settlementData.settlements ?? []);
      setGroups(settlementData.groups ?? []);
      setTotals(settlementData.totals ?? null);
      setWeeks(settlementData.weeks ?? []);
      if (["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"].includes(meData.user.role)) {
        const driverData = await apiFetch<{ drivers: any[] }>("/assets/drivers");
        setDrivers(driverData.drivers);
      } else {
        setDrivers([]);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [buildParams]);

  useEffect(() => {
    if (!canAccess) return;
    loadData();
  }, [canAccess, loadData]);

  const generateSettlement = async () => {
    if (!form.driverId || !form.periodStart || !form.periodEnd || invalidRange) return;
    try {
      await apiFetch("/settlements/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ driverId: "", periodStart: "", periodEnd: "" });
      setFormError(null);
      loadData();
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  const finalizeSettlement = async (id: string) => {
    await apiFetch(`/settlements/${id}/finalize`, { method: "POST" });
    loadData();
  };

  const markPaid = async (id: string) => {
    await apiFetch(`/settlements/${id}/paid`, { method: "POST" });
    loadData();
  };

  const viewSettlement = async (id: string) => {
    const data = await apiFetch<{ settlement: any }>(`/settlements/${id}`);
    setSelected(data.settlement);
  };

  return (
    <RouteGuard allowedRoles={["ADMIN", "BILLING"]}>
      {error ? <ErrorBanner message={error} /> : null}
      {userRole && userRole !== "DRIVER" ? (
        <Card className="space-y-3">
          <SectionHeader title="Generate settlement" subtitle="Select driver and pay period" />
          <div className="grid gap-3 lg:grid-cols-3">
            <FormField label="Driver" htmlFor="settlementDriver">
              <Select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                <option value="">Driver</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Period start" htmlFor="settlementStart">
              <Input
                type="date"
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
              />
            </FormField>
            <FormField label="Period end" htmlFor="settlementEnd">
              <Input
                type="date"
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
              />
            </FormField>
          </div>
          {invalidRange ? (
            <div className="text-sm text-[color:var(--color-danger)]">End date must be after start date.</div>
          ) : null}
          {formError ? (
            <div className="text-sm text-[color:var(--color-danger)]">{formError}</div>
          ) : null}
          <Button onClick={generateSettlement} disabled={!form.driverId || !form.periodStart || !form.periodEnd || invalidRange}>
            Generate
          </Button>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <SectionHeader title="Settlements" subtitle="Generate, review, and finalize driver pay" />
        <RefinePanel>
          <div className="grid gap-3 lg:grid-cols-6">
            <FormField label="Status" htmlFor="filterStatus">
              <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="ALL">All</option>
                <option value="PENDING">Pending</option>
                <option value="DRAFT">Pending</option>
                <option value="FINALIZED">Approved</option>
                <option value="PAID">Paid</option>
              </Select>
            </FormField>
            <FormField label="From" htmlFor="filterFrom">
              <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
            </FormField>
            <FormField label="To" htmlFor="filterTo">
              <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
            </FormField>
            <FormField label="Week" htmlFor="filterWeek">
              <Select value={filters.week} onChange={(e) => setFilters({ ...filters, week: e.target.value })}>
                <option value="">Week</option>
                {weeks.map((week: any) => (
                  <option key={week.weekKey} value={week.weekKey}>
                    {week.weekLabel}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Group by" htmlFor="filterGroupBy">
              <Select value={filters.groupBy} onChange={(e) => setFilters({ ...filters, groupBy: e.target.value })}>
                <option value="week">Group by week</option>
                <option value="none">Flat list</option>
              </Select>
            </FormField>
            {userRole && ["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"].includes(userRole) ? (
              <FormField label="Driver" htmlFor="filterDriver">
                <Select value={filters.driverId} onChange={(e) => setFilters({ ...filters, driverId: e.target.value })}>
                  <option value="">Driver</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
          </div>
        </RefinePanel>
        {totals ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--color-text-muted)]">
            <span>{totals.count} settlements</span>
            <span>Net ${totals.net}</span>
          </div>
        ) : null}
        <div className="grid gap-4">
          {groups.length > 0 ? (
            groups.map((group) => {
              const groupLabel = group.label ?? group.weekLabel ?? group.weekKey ?? "Period";
              const groupCount = group.count ?? group.totals?.count ?? group.settlements?.length ?? 0;
              const groupItems = group.items ?? group.settlements ?? [];
              return (
              <div key={group.key ?? group.weekKey ?? groupLabel} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink">{groupLabel}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">{groupCount} settlements</div>
                </div>
                <div className="mt-3 grid gap-3">
                  {groupItems.map((settlement: any) => (
                    <div
                      key={settlement.id}
                      className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-white py-3 pl-5 pr-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-ink">{settlement.periodLabel}</div>
                          <div className="text-xs text-[color:var(--color-text-muted)]">{settlement.driverName}</div>
                        </div>
                        <StatusChip label={formatSettlementStatusLabel(settlement.status)} tone={settlementTone(settlement.status)} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-[color:var(--color-text-muted)]">
                        <div>Net ${settlement.net}</div>
                        <div>{settlement.loadCount} loads</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => viewSettlement(settlement.id)}>
                          View
                        </Button>
                        {settlement.status === "DRAFT" ? (
                          <Button size="sm" onClick={() => finalizeSettlement(settlement.id)}>
                            Finalize
                          </Button>
                        ) : null}
                        {settlement.status === "FINALIZED" ? (
                          <Button size="sm" variant="secondary" onClick={() => markPaid(settlement.id)}>
                            Mark paid
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );})
          ) : settlements.length > 0 ? (
            settlements.map((settlement) => (
              <div
                key={settlement.id}
                className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white py-4 pl-6 pr-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-ink">{settlement.periodLabel}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">{settlement.driverName}</div>
                  </div>
                  <StatusChip label={formatSettlementStatusLabel(settlement.status)} tone={settlementTone(settlement.status)} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-[color:var(--color-text-muted)]">
                  <div>Net ${settlement.net}</div>
                  <div>{settlement.loadCount} loads</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => viewSettlement(settlement.id)}>
                    View
                  </Button>
                  {settlement.status === "DRAFT" ? (
                    <Button size="sm" onClick={() => finalizeSettlement(settlement.id)}>
                      Finalize
                    </Button>
                  ) : null}
                  {settlement.status === "FINALIZED" ? (
                    <Button size="sm" variant="secondary" onClick={() => markPaid(settlement.id)}>
                      Mark paid
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="No settlements yet." description="Generate settlements once loads are completed." />
          )}
        </div>
      </Card>

      {selected ? (
        <Card className="space-y-2">
          <SectionHeader title="Settlement details" subtitle={selected.periodLabel} />
          <div className="text-sm text-[color:var(--color-text-muted)]">Driver: {selected.driverName}</div>
          <div className="text-sm text-[color:var(--color-text-muted)]">
            Status: {formatSettlementStatusLabel(selected.status)}
          </div>
          <div className="text-sm text-[color:var(--color-text-muted)]">Net: ${selected.net}</div>
          {selected.items?.length ? (
            <div className="mt-2 space-y-2 text-sm">
              {selected.items.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-2"
                >
                  <div>
                    <div className="text-sm text-ink">{item.description}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">{item.type}</div>
                  </div>
                  <div className="text-sm text-ink">${item.amount}</div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}
    </RouteGuard>
  );
}

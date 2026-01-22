"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export default function SettlementsPage() {
  const [settlements, setSettlements] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [totals, setTotals] = useState<{ count: number; net: string } | null>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [form, setForm] = useState({ driverId: "", periodStart: "", periodEnd: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: "PENDING",
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

  const buildParams = () => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.week) params.set("week", filters.week);
    if (filters.groupBy) params.set("groupBy", filters.groupBy);
    if (filters.driverId) params.set("driverId", filters.driverId);
    return params.toString();
  };

  const loadData = async () => {
    try {
      const query = buildParams();
      const meData = await apiFetch<{ user: { role: string } }>("/auth/me");
      setUserRole(meData.user.role);
      const settlementData = await apiFetch<any>(`/settlements${query ? `?${query}` : ""}`);
      setSettlements(settlementData.settlements ?? []);
      setGroups(settlementData.groups ?? []);
      setTotals(settlementData.totals ?? null);
      setWeeks(settlementData.weeks ?? []);
      if (["ADMIN", "DISPATCHER", "BILLING"].includes(meData.user.role)) {
        const driverData = await apiFetch<{ drivers: any[] }>("/assets/drivers");
        setDrivers(driverData.drivers);
      } else {
        setDrivers([]);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadData();
  }, [filters]);

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
    <AppShell title="Settlements" subtitle="Driver pay loop">
      {error ? <Card><div className="text-sm text-red-600">{error}</div></Card> : null}
      {userRole && userRole !== "DRIVER" ? (
        <Card className="space-y-3">
          <div className="text-xs uppercase tracking-widest text-black/50">Generate settlement</div>
          <div className="grid gap-3 lg:grid-cols-3">
            <select
              className="rounded-2xl border border-black/10 bg-white px-3 py-2"
              value={form.driverId}
              onChange={(e) => setForm({ ...form, driverId: e.target.value })}
            >
              <option value="">Driver</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="rounded-2xl border border-black/10 bg-white px-3 py-2"
              value={form.periodStart}
              onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
            />
            <input
              type="date"
              className="rounded-2xl border border-black/10 bg-white px-3 py-2"
              value={form.periodEnd}
              onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
            />
          </div>
          {invalidRange ? (
            <div className="text-sm text-red-600">End date must be after start date.</div>
          ) : null}
          {formError ? (
            <div className="text-sm text-red-600">{formError}</div>
          ) : null}
          <Button onClick={generateSettlement} disabled={!form.driverId || !form.periodStart || !form.periodEnd || invalidRange}>
            Generate
          </Button>
        </Card>
      ) : null}

      <Card className="space-y-3">
        <div className="text-xs uppercase tracking-widest text-black/50">Settlements</div>
        <div className="grid gap-3 lg:grid-cols-6">
          <select
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="PENDING">Pending</option>
            <option value="DRAFT">Draft</option>
            <option value="FINALIZED">Finalized</option>
            <option value="PAID">Paid</option>
          </select>
          <input
            type="date"
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
          <input
            type="date"
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
          <select
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            value={filters.week}
            onChange={(e) => setFilters({ ...filters, week: e.target.value })}
          >
            <option value="">Week</option>
            {weeks.map((week: any) => (
              <option key={week.weekKey} value={week.weekKey}>
                {week.weekLabel}
              </option>
            ))}
          </select>
          <select
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            value={filters.groupBy}
            onChange={(e) => setFilters({ ...filters, groupBy: e.target.value })}
          >
            <option value="week">Group by week</option>
            <option value="none">Flat list</option>
          </select>
          {userRole && ["ADMIN", "DISPATCHER", "BILLING"].includes(userRole) ? (
            <select
              className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              value={filters.driverId}
              onChange={(e) => setFilters({ ...filters, driverId: e.target.value })}
            >
              <option value="">Driver</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {totals ? (
          <div className="text-sm text-black/60">
            {filters.status === "PENDING" ? "Pending total" : "Total"}: ${totals.net} · {totals.count} settlement(s)
          </div>
        ) : null}
        <div className="grid gap-3">
          {filters.groupBy === "week"
            ? groups.map((group) => (
              <div key={group.weekKey} className="rounded-2xl border border-black/10 bg-white/70 p-4">
                <div className="text-xs uppercase tracking-widest text-black/50">{group.weekLabel}</div>
                <div className="text-sm text-black/60">Net ${group.totals?.net ?? "0.00"} · {group.totals?.count ?? 0} settlement(s)</div>
                <div className="mt-3 grid gap-2">
                  {group.settlements.map((settlement: any) => (
                    <div key={settlement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-4 py-2">
                      <div>
                        <div className="text-xs uppercase tracking-widest text-black/50">{settlement.status}</div>
                        <div className="text-lg font-semibold">{settlement.driver?.name ?? "Driver"}</div>
                        <div className="text-sm text-black/60">
                          {new Date(settlement.periodStart).toLocaleDateString()} → {new Date(settlement.periodEnd).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-sm text-black/60">
                        Net ${settlement.net ?? settlement.gross ?? "0.00"}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => viewSettlement(settlement.id)}>View</Button>
                        {settlement.status === "DRAFT" ? (
                          <Button onClick={() => finalizeSettlement(settlement.id)}>Finalize</Button>
                        ) : null}
                        {settlement.status === "FINALIZED" ? (
                          <Button onClick={() => markPaid(settlement.id)}>Mark paid</Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
            : settlements.map((settlement) => (
              <div key={settlement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white/70 px-4 py-2">
                <div>
                  <div className="text-xs uppercase tracking-widest text-black/50">{settlement.status}</div>
                  <div className="text-lg font-semibold">{settlement.driver?.name ?? "Driver"}</div>
                  <div className="text-sm text-black/60">
                    {new Date(settlement.periodStart).toLocaleDateString()} → {new Date(settlement.periodEnd).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-sm text-black/60">
                  Net ${settlement.net ?? settlement.gross ?? "0.00"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => viewSettlement(settlement.id)}>View</Button>
                  {settlement.status === "DRAFT" ? (
                    <Button onClick={() => finalizeSettlement(settlement.id)}>Finalize</Button>
                  ) : null}
                  {settlement.status === "FINALIZED" ? (
                    <Button onClick={() => markPaid(settlement.id)}>Mark paid</Button>
                  ) : null}
                </div>
              </div>
            ))}
          {filters.groupBy === "week" && groups.length === 0 ? (
            <div className="text-sm text-black/60">No settlements yet.</div>
          ) : null}
          {filters.groupBy === "none" && settlements.length === 0 ? (
            <div className="text-sm text-black/60">No settlements yet.</div>
          ) : null}
        </div>
      </Card>

      {selected ? (
        <Card className="space-y-3">
          <div className="text-xs uppercase tracking-widest text-black/50">Settlement detail</div>
          <div className="text-lg font-semibold">{selected.driver?.name}</div>
          <div className="grid gap-2">
            {selected.items?.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl border border-black/10 bg-white/70 px-4 py-2">
                <div>
                  <div className="text-xs uppercase tracking-widest text-black/50">{item.code}</div>
                  <div className="text-sm text-black/60">{item.description ?? item.loadId ?? "-"}</div>
                </div>
                <div className="text-sm font-semibold">${item.amount}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </AppShell>
  );
}

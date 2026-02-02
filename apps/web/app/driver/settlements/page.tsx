"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DriverShell } from "@/components/driver/driver-shell";
import { DriverStatusChip } from "@/components/driver/driver-status-chip";
import { InlineHelper } from "@/components/driver/inline-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type SettlementStatus = "DRAFT" | "FINALIZED" | "PAID";

type DriverSettlement = {
  id: string;
  status: SettlementStatus;
  periodStart: string;
  periodEnd: string;
  weekLabel?: string | null;
  net?: string | number | null;
  gross?: string | number | null;
  paidAt?: string | null;
};

function startOfIsoWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - (day - 1));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function DriverSettlementsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [totals, setTotals] = useState<{ count: number; net: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatMoney = (value: DriverSettlement["net"] | DriverSettlement["gross"]) => {
    if (value === null || value === undefined) return "0.00";
    if (typeof value === "number") return value.toFixed(2);
    return value;
  };

  const filters = useMemo(() => {
    return {
      status: searchParams.get("status") ?? "PENDING",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    };
  }, [searchParams]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== "ALL") params.set("status", filters.status);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("groupBy", "none");
    return params.toString();
  }, [filters]);

  const setRange = (range: "this" | "last" | "last4") => {
    const today = new Date();
    let from = startOfIsoWeek(today);
    let to = new Date(today);
    if (range === "last") {
      from = new Date(from);
      from.setDate(from.getDate() - 7);
      to = new Date(from);
      to.setDate(to.getDate() + 6);
    } else if (range === "last4") {
      from = new Date(today);
      from.setDate(from.getDate() - 28);
    }
    const params = new URLSearchParams();
    params.set("status", "PENDING");
    params.set("from", formatDate(from));
    params.set("to", formatDate(to));
    router.push(`/driver/settlements?${params.toString()}`);
  };

  const setStatus = (status: string) => {
    const params = new URLSearchParams();
    params.set("status", status);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    router.push(`/driver/settlements?${params.toString()}`);
  };

  const openSettlement = (id: string) => {
    router.push(`/driver/settlements/${id}`);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const query = buildParams();
        const data = await apiFetch<{ settlements?: DriverSettlement[]; totals?: { count: number; net: string } }>(
          `/settlements?${query}`
        );
        setSettlements(data.settlements ?? []);
        setTotals(data.totals ?? null);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    loadData();
  }, [buildParams]);

  return (
    <DriverShell>
      <Card className="space-y-3">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Pay</div>
        <div className="text-2xl font-semibold">Settlements</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => router.push("/driver")}>
            Back to driver home
          </Button>
          <Button variant={filters.status === "PENDING" ? "primary" : "secondary"} onClick={() => setStatus("PENDING")}>
            Pending
          </Button>
          <Button variant={filters.status === "PAID" ? "primary" : "secondary"} onClick={() => setStatus("PAID")}>
            Paid
          </Button>
          <Button variant={filters.status === "ALL" ? "primary" : "secondary"} onClick={() => setStatus("ALL")}>
            All
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setRange("this")}>
            This week
          </Button>
          <Button variant="secondary" onClick={() => setRange("last")}>
            Last week
          </Button>
          <Button variant="secondary" onClick={() => setRange("last4")}>
            Last 4 weeks
          </Button>
        </div>
      </Card>

      {error ? (
        <Card>
          <div className="text-sm text-[color:var(--color-danger)]">{error}</div>
        </Card>
      ) : null}

      <Card className="space-y-3">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
          {filters.status === "PENDING" ? "Pending total" : "Total"}: ${totals?.net ?? "0.00"} · {totals?.count ?? 0} settlement(s)
        </div>
        {settlements.length === 0 ? (
          <div className="text-sm text-[color:var(--color-text-muted)]">No settlements found.</div>
        ) : (
          settlements.map((settlement) => (
            <button
              key={settlement.id}
              type="button"
              onClick={() => openSettlement(settlement.id)}
              className="w-full rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 py-3 pl-6 pr-4 text-left text-sm transition hover:border-[color:var(--color-divider-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)] focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{settlement.weekLabel ?? "Pay period"}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {new Date(settlement.periodStart).toLocaleDateString()} →{" "}
                    {new Date(settlement.periodEnd).toLocaleDateString()}
                  </div>
                </div>
                <DriverStatusChip status={settlement.status} />
              </div>
              <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">
                Net ${formatMoney(settlement.net ?? settlement.gross)}
              </div>
              {settlement.paidAt ? (
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Paid on {new Date(settlement.paidAt).toLocaleDateString()}
                </div>
              ) : (
                <InlineHelper text="Why pending?" href="/driver/pay#blockers" className="mt-1 inline-block" />
              )}
            </button>
          ))
        )}
      </Card>
    </DriverShell>
  );
}

export default function DriverSettlementsPage() {
  return (
      <Suspense
        fallback={
          <DriverShell>
            <Card>
              <div className="text-sm text-[color:var(--color-text-muted)]">Loading settlements...</div>
            </Card>
          </DriverShell>
        }
      >
      <DriverSettlementsContent />
    </Suspense>
  );
}

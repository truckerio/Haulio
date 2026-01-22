"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

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

export default function DriverSettlementsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [settlements, setSettlements] = useState<any[]>([]);
  const [totals, setTotals] = useState<{ count: number; net: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(() => {
    return {
      status: searchParams.get("status") ?? "PENDING",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    };
  }, [searchParams]);

  const buildParams = () => {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== "ALL") params.set("status", filters.status);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("groupBy", "none");
    return params.toString();
  };

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

  useEffect(() => {
    const loadData = async () => {
      try {
        const query = buildParams();
        const data = await apiFetch<any>(`/settlements?${query}`);
        setSettlements(data.settlements ?? []);
        setTotals(data.totals ?? null);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    loadData();
  }, [filters]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand via-white to-clay px-6 py-10">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <Card className="space-y-3">
          <div className="text-xs uppercase tracking-widest text-black/50">Pay</div>
          <div className="text-2xl font-semibold">Settlements</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => router.push("/driver")}>Back to driver home</Button>
            <Button variant={filters.status === "PENDING" ? "default" : "secondary"} onClick={() => setStatus("PENDING")}>
              Pending
            </Button>
            <Button variant={filters.status === "PAID" ? "default" : "secondary"} onClick={() => setStatus("PAID")}>
              Paid
            </Button>
            <Button variant={filters.status === "ALL" ? "default" : "secondary"} onClick={() => setStatus("ALL")}>
              All
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setRange("this")}>This week</Button>
            <Button variant="secondary" onClick={() => setRange("last")}>Last week</Button>
            <Button variant="secondary" onClick={() => setRange("last4")}>Last 4 weeks</Button>
          </div>
        </Card>

        {error ? (
          <Card>
            <div className="text-sm text-red-600">{error}</div>
          </Card>
        ) : null}

        <Card className="space-y-3">
          <div className="text-xs uppercase tracking-widest text-black/50">
            {filters.status === "PENDING" ? "Pending total" : "Total"}: ${totals?.net ?? "0.00"} · {totals?.count ?? 0} settlement(s)
          </div>
          {settlements.length === 0 ? (
            <div className="text-sm text-black/60">No settlements found.</div>
          ) : (
            settlements.map((settlement) => (
              <div key={settlement.id} className="rounded-2xl border border-black/10 bg-white/70 px-4 py-2 text-sm">
                <div className="text-xs uppercase tracking-widest text-black/50">{settlement.status}</div>
                <div className="font-semibold">{settlement.weekLabel ?? "Pay period"}</div>
                <div className="text-xs text-black/60">
                  {new Date(settlement.periodStart).toLocaleDateString()} → {new Date(settlement.periodEnd).toLocaleDateString()}
                </div>
                <div className="text-sm text-black/70">Net ${settlement.net ?? settlement.gross ?? "0.00"}</div>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

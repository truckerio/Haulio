"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type TodayData = {
  todayLoads: any[];
  actionTasks: any[];
  invoices: Array<{ invoice: any; dueDate: string; overdue: boolean }>;
  cashPosition: { outstandingCount: number; overdueCount: number; outstandingTotal: string };
};

export default function TodayPage() {
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const payload = await apiFetch<TodayData>("/today");
      setData(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const cashTotal = data?.cashPosition?.outstandingTotal
    ? Number(data.cashPosition.outstandingTotal).toFixed(2)
    : "0.00";

  return (
    <AppShell title="Today" subtitle="Action-only view for ops">
      {error ? <Card><div className="text-sm text-red-600">{error}</div></Card> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="text-xs uppercase tracking-widest text-black/50">Outstanding cash</div>
          <div className="mt-2 text-3xl font-semibold">${cashTotal}</div>
          <div className="text-sm text-black/60">
            {data?.cashPosition?.outstandingCount ?? 0} invoices · {data?.cashPosition?.overdueCount ?? 0} overdue
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-widest text-black/50">Today&apos;s loads</div>
          <div className="mt-2 text-3xl font-semibold">{data?.todayLoads?.length ?? 0}</div>
          <div className="text-sm text-black/60">Created since midnight</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-widest text-black/50">Drivers needing action</div>
          <div className="mt-2 text-3xl font-semibold">{data?.actionTasks?.length ?? 0}</div>
          <div className="text-sm text-black/60">Missing PODs & delays</div>
        </Card>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-black/50">Today&apos;s loads</div>
            <div className="text-lg font-semibold">In motion</div>
          </div>
          <Button variant="ghost" onClick={loadData}>Refresh</Button>
        </div>
        <div className="grid gap-2">
          {(data?.todayLoads ?? []).map((load) => (
            <div key={load.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-white/70 px-4 py-2">
              <div>
                <div className="text-xs uppercase tracking-widest text-black/50">{load.status}</div>
                <div className="text-lg font-semibold">{load.loadNumber}</div>
                <div className="text-sm text-black/60">{load.customer?.name ?? load.customerName ?? "Customer"}</div>
              </div>
              <div className="text-sm text-black/60">
                Driver: {load.driver?.name ?? "Unassigned"}
              </div>
            </div>
          ))}
          {(data?.todayLoads?.length ?? 0) === 0 ? (
            <div className="text-sm text-black/60">No new loads today.</div>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="text-xs uppercase tracking-widest text-black/50">Drivers needing action</div>
        <div className="grid gap-2">
          {(data?.actionTasks ?? []).map((task) => (
            <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-white/70 px-4 py-2">
              <div>
                <div className="text-xs uppercase tracking-widest text-black/50">{task.type}</div>
                <div className="text-lg font-semibold">{task.title}</div>
                <div className="text-sm text-black/60">Load {task.load?.loadNumber ?? "-"}</div>
              </div>
              <div className="text-sm text-black/60">Driver: {task.driver?.name ?? "-"}</div>
            </div>
          ))}
          {(data?.actionTasks?.length ?? 0) === 0 ? (
            <div className="text-sm text-black/60">No action items right now.</div>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="text-xs uppercase tracking-widest text-black/50">Invoices attention</div>
        <div className="grid gap-2">
          {(data?.invoices ?? []).map((entry) => (
            <div key={entry.invoice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-white/70 px-4 py-2">
              <div>
                <div className="text-xs uppercase tracking-widest text-black/50">{entry.invoice.status}</div>
                <div className="text-lg font-semibold">{entry.invoice.invoiceNumber}</div>
                <div className="text-sm text-black/60">Load {entry.invoice.loadId}</div>
              </div>
              <div className={`text-sm ${entry.overdue ? "text-red-600" : "text-black/60"}`}>
                Due {new Date(entry.dueDate).toLocaleDateString()} {entry.overdue ? "· Overdue" : ""}
              </div>
            </div>
          ))}
          {(data?.invoices?.length ?? 0) === 0 ? (
            <div className="text-sm text-black/60">No unpaid invoices.</div>
          ) : null}
        </div>
      </Card>
    </AppShell>
  );
}

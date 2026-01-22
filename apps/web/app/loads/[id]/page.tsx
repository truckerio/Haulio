"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export default function LoadTimelinePage() {
  const params = useParams();
  const loadId = params?.id as string | undefined;
  const [load, setLoad] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!loadId) return;
    try {
      const data = await apiFetch<{ load: any; timeline: any[] }>(`/loads/${loadId}/timeline`);
      setLoad(data.load);
      setTimeline(data.timeline);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadId]);

  return (
    <AppShell title="Load Timeline" subtitle="Load → POD → Invoice → Settlement">
      {error ? <Card><div className="text-sm text-red-600">{error}</div></Card> : null}
      <Card className="space-y-2">
        <div className="text-xs uppercase tracking-widest text-black/50">Load</div>
        <div className="text-2xl font-semibold">{load?.loadNumber ?? loadId}</div>
        <div className="text-sm text-black/60">{load?.customer?.name ?? load?.customerName ?? "Customer"}</div>
        {load ? (
          <div className="text-sm text-black/60">
            {load.shipperReferenceNumber ? `Shipper ref ${load.shipperReferenceNumber}` : "Shipper ref -"}
            {" · "}
            {load.consigneeReferenceNumber ? `Consignee ref ${load.consigneeReferenceNumber}` : "Consignee ref -"}
            {" · "}
            {load.palletCount !== null && load.palletCount !== undefined ? `${load.palletCount} pallets` : "Pallets -"}
            {" · "}
            {load.weightLbs !== null && load.weightLbs !== undefined ? `${load.weightLbs} lbs` : "Weight -"}
          </div>
        ) : null}
        <Button variant="ghost" onClick={loadData}>Refresh</Button>
      </Card>
      <Card className="space-y-3">
        <div className="text-xs uppercase tracking-widest text-black/50">Timeline</div>
        <div className="grid gap-2">
          {timeline.map((item) => (
            <div key={item.id} className="rounded-2xl border border-black/10 bg-white/70 px-4 py-2">
              <div className="text-xs uppercase tracking-widest text-black/50">{item.type}</div>
              <div className="text-lg font-semibold">{item.message}</div>
              <div className="text-sm text-black/60">{new Date(item.time).toLocaleString()}</div>
            </div>
          ))}
          {timeline.length === 0 ? <div className="text-sm text-black/60">No activity yet.</div> : null}
        </div>
      </Card>
    </AppShell>
  );
}

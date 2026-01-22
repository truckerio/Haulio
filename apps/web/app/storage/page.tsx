"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export default function StoragePage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loadId, setLoadId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadRecords = async () => {
    try {
      const data = await apiFetch<{ records: any[] }>("/storage");
      setRecords(data.records);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const checkIn = async () => {
    try {
      await apiFetch("/storage/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loadId: loadId || undefined }),
      });
      setLoadId("");
      loadRecords();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const checkOut = async (id: string) => {
    try {
      await apiFetch(`/storage/${id}/checkout`, { method: "POST" });
      loadRecords();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <AppShell title="Storage" subtitle="Check-in/out and dwell charges">
      {error ? (
        <Card>
          <div className="text-sm text-red-600">{error}</div>
        </Card>
      ) : null}
      <Card className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input placeholder="Load ID (optional)" value={loadId} onChange={(e) => setLoadId(e.target.value)} />
        <Button onClick={checkIn}>Check in</Button>
      </Card>
      <div className="grid gap-3">
        {records.map((record) => (
          <Card key={record.id} className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm uppercase tracking-widest text-black/50">Storage</div>
              <div className="text-lg font-semibold">{record.loadId ?? "Unlinked"}</div>
              <div className="text-sm text-black/60">Check-in: {new Date(record.checkInAt).toLocaleString()}</div>
              {record.checkOutAt ? (
                <div className="text-sm text-black/60">Check-out: {new Date(record.checkOutAt).toLocaleString()}</div>
              ) : null}
              {record.suggestedCharge ? (
                <div className="text-sm text-black/70">Suggested charge: ${record.suggestedCharge}</div>
              ) : null}
            </div>
            {!record.checkOutAt ? <Button onClick={() => checkOut(record.id)}>Check out</Button> : null}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

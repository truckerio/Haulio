"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export default function AuditPage() {
  const [audits, setAudits] = useState<any[]>([]);
  const [loadNumber, setLoadNumber] = useState("");

  const loadAudits = async () => {
    const params = loadNumber ? `?loadNumber=${encodeURIComponent(loadNumber)}` : "";
    const data = await apiFetch<{ audits: any[] }>(`/audit${params}`);
    setAudits(data.audits);
  };

  useEffect(() => {
    loadAudits();
  }, []);

  return (
    <AppShell title="Audit" subtitle="Dispute-ready action trail">
      <Card className="flex flex-wrap items-center gap-3">
        <Input placeholder="Filter by load number" value={loadNumber} onChange={(e) => setLoadNumber(e.target.value)} />
        <Button onClick={loadAudits}>Filter</Button>
      </Card>
      <div className="grid gap-3">
        {audits.map((audit) => (
          <Card key={audit.id} className="space-y-1">
            <div className="text-sm uppercase tracking-widest text-black/50">{audit.action}</div>
            <div className="text-lg font-semibold">{audit.summary}</div>
            <div className="text-sm text-black/60">
              {audit.user?.name ?? audit.user?.email} · {new Date(audit.createdAt).toLocaleString()}
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { RouteGuard } from "@/components/rbac/route-guard";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";

export default function AuditPage() {
  const { user } = useUser();
  const canAccess = Boolean(user && user.role === "ADMIN");
  const [audits, setAudits] = useState<any[]>([]);
  const [loadNumber, setLoadNumber] = useState("");

  const loadAudits = useCallback(async () => {
    const params = loadNumber ? `?loadNumber=${encodeURIComponent(loadNumber)}` : "";
    const data = await apiFetch<{ audits: any[] }>(`/audit${params}`);
    setAudits(data.audits);
  }, [loadNumber]);

  useEffect(() => {
    if (!canAccess) return;
    loadAudits();
  }, [canAccess, loadAudits]);

  const grouped = audits.reduce<Record<string, any[]>>((acc, audit) => {
    const dateKey = new Date(audit.createdAt).toLocaleDateString();
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(audit);
    return acc;
  }, {});

  return (
    <AppShell title="Audit" subtitle="Dispute-ready action trail">
      <RouteGuard allowedRoles={["ADMIN"]}>
      <Card className="flex flex-wrap items-center gap-3">
        <SectionHeader title="Audit feed" subtitle="Search by load number" />
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Filter by load number" value={loadNumber} onChange={(e) => setLoadNumber(e.target.value)} />
          <Button onClick={loadAudits}>Filter</Button>
        </div>
      </Card>
      <div className="grid gap-4">
        {Object.keys(grouped).length === 0 ? (
          <EmptyState title="No audit entries yet." description="System events will appear here." />
        ) : (
          Object.entries(grouped).map(([dateKey, items]) => (
            <Card key={dateKey} className="space-y-3">
              <div className="text-xs uppercase tracking-[0.24em] text-[color:var(--color-text-subtle)]">{dateKey}</div>
              <div className="space-y-3">
                {items.map((audit) => (
                  <div key={audit.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">{audit.action}</div>
                    <div className="text-sm font-semibold text-ink">{audit.summary}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {audit.user?.name ?? audit.user?.email} · {new Date(audit.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>
      </RouteGuard>
    </AppShell>
  );
}

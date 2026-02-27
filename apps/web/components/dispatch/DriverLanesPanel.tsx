"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DispatchGridRow } from "@/components/dispatch/DispatchSpreadsheetGrid";

type DriverRecord = {
  id: string;
  name?: string | null;
};

export function DriverLanesPanel({
  drivers,
  loads,
  assigningLaneKey,
  onAssignLoadToDriver,
}: {
  drivers: DriverRecord[];
  loads: DispatchGridRow[];
  assigningLaneKey?: string | null;
  onAssignLoadToDriver: (params: { loadId: string; driverId: string }) => Promise<void>;
}) {
  const [activeLaneId, setActiveLaneId] = useState<string | null>(null);

  const loadsByDriver = useMemo(() => {
    const map = new Map<string, DispatchGridRow[]>();
    for (const driver of drivers) {
      map.set(driver.id, []);
    }
    for (const load of loads) {
      const driverId = load.assignment?.driver?.id;
      if (!driverId) continue;
      const bucket = map.get(driverId);
      if (bucket) {
        bucket.push(load);
      }
    }
    return map;
  }, [drivers, loads]);

  return (
    <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[color:var(--color-divider)] px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-ink">Driver lanes</div>
          <div className="text-xs text-[color:var(--color-text-muted)]">Drag a load row onto a lane to assign primary driver</div>
        </div>
        <Badge className="bg-[color:var(--color-bg-muted)] px-2 py-0.5 text-[10px] tracking-[0.12em] text-[color:var(--color-text-muted)]">
          {drivers.length} drivers
        </Badge>
      </div>
      <div className="max-h-[34vh] overflow-auto p-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {drivers.map((driver) => {
            const assigned = loadsByDriver.get(driver.id) ?? [];
            const laneKey = activeLaneId === driver.id ? `lane:${driver.id}` : null;
            const isSaving = assigningLaneKey === laneKey;
            return (
              <div
                key={driver.id}
                className={cn(
                  "rounded-[var(--radius-control)] border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)]/40 px-3 py-3 transition",
                  activeLaneId === driver.id ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]" : ""
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  setActiveLaneId(driver.id);
                }}
                onDragLeave={() => {
                  if (activeLaneId === driver.id) setActiveLaneId(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setActiveLaneId(null);
                  const loadId = event.dataTransfer.getData("text/haulio-load-id");
                  if (!loadId) return;
                  void onAssignLoadToDriver({ loadId, driverId: driver.id });
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold text-ink">{driver.name ?? "Unnamed driver"}</div>
                  <Badge className="px-2 py-0.5 text-[10px] tracking-[0.12em]">{assigned.length} loads</Badge>
                </div>
                <div className="mt-2 space-y-1 text-xs text-[color:var(--color-text-muted)]">
                  {assigned.slice(0, 4).map((load) => (
                    <div key={load.id} className="truncate">
                      {load.loadNumber} · {load.status}
                    </div>
                  ))}
                  {assigned.length > 4 ? <div>+{assigned.length - 4} more</div> : null}
                  {!assigned.length ? <div>No active loads</div> : null}
                </div>
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isSaving}
                    onClick={() => setActiveLaneId(activeLaneId === driver.id ? null : driver.id)}
                  >
                    {isSaving ? "Assigning..." : "Drop target"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

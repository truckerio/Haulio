"use client";

import { useState, type MouseEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type Asset = { id: string; name?: string; unit?: string };

export function LegsPanel({
  load,
  drivers,
  trucks,
  trailers,
  onUpdated,
}: {
  load: any;
  drivers: Asset[];
  trucks: Asset[];
  trailers: Asset[];
  onUpdated: () => void;
}) {
  const [form, setForm] = useState({
    type: "LINEHAUL",
    startStopSequence: "",
    endStopSequence: "",
    driverId: "",
    truckId: "",
    trailerId: "",
    setActive: false,
  });

  const createLeg = async () => {
    await apiFetch(`/loads/${load.id}/legs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        startStopSequence: form.startStopSequence ? Number(form.startStopSequence) : undefined,
        endStopSequence: form.endStopSequence ? Number(form.endStopSequence) : undefined,
        driverId: form.driverId || undefined,
        truckId: form.truckId || undefined,
        trailerId: form.trailerId || undefined,
        setActive: form.setActive,
      }),
    });
    setForm({
      type: "LINEHAUL",
      startStopSequence: "",
      endStopSequence: "",
      driverId: "",
      truckId: "",
      trailerId: "",
      setActive: false,
    });
    onUpdated();
  };

  const assignLeg = async (legId: string, setActive: boolean, event: MouseEvent<HTMLButtonElement>) => {
    const parent = event.currentTarget.parentElement;
    const selects = parent?.querySelectorAll("select") || [];
    const driverId = (selects[0] as HTMLSelectElement | undefined)?.value;
    const truckId = (selects[1] as HTMLSelectElement | undefined)?.value;
    const trailerId = (selects[2] as HTMLSelectElement | undefined)?.value;
    await apiFetch(`/legs/${legId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driverId: driverId || undefined,
        truckId: truckId || undefined,
        trailerId: trailerId || undefined,
        setActive,
      }),
    });
    onUpdated();
  };

  const setStatus = async (legId: string, status: string) => {
    await apiFetch(`/legs/${legId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onUpdated();
  };

  return (
    <Card className="space-y-3">
      <div className="text-xs uppercase tracking-widest text-black/50">Leg plan</div>
      <div className="grid gap-3 lg:grid-cols-4">
        <select
          className="rounded-2xl border border-black/10 bg-white px-3 py-2"
          value={form.type}
          onChange={(event) => setForm({ ...form, type: event.target.value })}
        >
          <option value="PICKUP">Pickup leg</option>
          <option value="LINEHAUL">Linehaul leg</option>
          <option value="DELIVERY">Delivery leg</option>
        </select>
        <Input
          placeholder="Start stop #"
          value={form.startStopSequence}
          onChange={(event) => setForm({ ...form, startStopSequence: event.target.value })}
        />
        <Input
          placeholder="End stop #"
          value={form.endStopSequence}
          onChange={(event) => setForm({ ...form, endStopSequence: event.target.value })}
        />
        <label className="flex items-center gap-2 text-sm text-black/60">
          <input
            type="checkbox"
            checked={form.setActive}
            onChange={(event) => setForm({ ...form, setActive: event.target.checked })}
          />
          Set active
        </label>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        <select
          className="rounded-2xl border border-black/10 bg-white px-3 py-2"
          value={form.driverId}
          onChange={(event) => setForm({ ...form, driverId: event.target.value })}
        >
          <option value="">Driver</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-2xl border border-black/10 bg-white px-3 py-2"
          value={form.truckId}
          onChange={(event) => setForm({ ...form, truckId: event.target.value })}
        >
          <option value="">Truck</option>
          {trucks.map((truck) => (
            <option key={truck.id} value={truck.id}>
              {truck.unit}
            </option>
          ))}
        </select>
        <select
          className="rounded-2xl border border-black/10 bg-white px-3 py-2"
          value={form.trailerId}
          onChange={(event) => setForm({ ...form, trailerId: event.target.value })}
        >
          <option value="">Trailer</option>
          {trailers.map((trailer) => (
            <option key={trailer.id} value={trailer.id}>
              {trailer.unit}
            </option>
          ))}
        </select>
        <Button onClick={createLeg}>Add leg</Button>
      </div>

      <div className="grid gap-3">
        {load.legs?.length ? (
          load.legs.map((leg: any) => (
            <div key={leg.id} className="rounded-2xl border border-black/10 bg-white/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm uppercase tracking-widest text-black/50">{leg.status}</div>
                  <div className="text-sm font-semibold">{leg.type} leg</div>
                  <div className="text-xs text-black/60">
                    Stops {leg.startStopSequence ?? "-"} → {leg.endStopSequence ?? "-"}
                  </div>
                </div>
                <div className="text-xs text-black/60">
                  Driver: {leg.driver?.name ?? "Unassigned"} · Truck {leg.truck?.unit ?? "-"} · Trailer {leg.trailer?.unit ?? "-"}
                </div>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-5">
                <select className="rounded-2xl border border-black/10 bg-white px-3 py-2" defaultValue={leg.driverId ?? ""}>
                  <option value="">Driver</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
                <select className="rounded-2xl border border-black/10 bg-white px-3 py-2" defaultValue={leg.truckId ?? ""}>
                  <option value="">Truck</option>
                  {trucks.map((truck) => (
                    <option key={truck.id} value={truck.id}>
                      {truck.unit}
                    </option>
                  ))}
                </select>
                <select className="rounded-2xl border border-black/10 bg-white px-3 py-2" defaultValue={leg.trailerId ?? ""}>
                  <option value="">Trailer</option>
                  {trailers.map((trailer) => (
                    <option key={trailer.id} value={trailer.id}>
                      {trailer.unit}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" onClick={(event) => assignLeg(leg.id, false, event)}>
                  Assign
                </Button>
                <Button variant="secondary" onClick={(event) => assignLeg(leg.id, true, event)}>
                  Assign + active
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setStatus(leg.id, "IN_PROGRESS")}>
                  Set active
                </Button>
                <Button variant="ghost" onClick={() => setStatus(leg.id, "COMPLETE")}>
                  Mark complete
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-black/60">No legs created yet.</div>
        )}
      </div>
    </Card>
  );
}

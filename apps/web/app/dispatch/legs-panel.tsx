"use client";

import { useState, type MouseEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";
import { apiFetch } from "@/lib/api";

type Asset = { id: string; name?: string | null; unit?: string | null; reason?: string | null };

export function LegsPanel({
  load,
  drivers,
  trucks,
  trailers,
  rateConMissing,
  canOverride,
  overrideReason,
  onUpdated,
}: {
  load: any;
  drivers: Asset[];
  trucks: Asset[];
  trailers: Asset[];
  rateConMissing: boolean;
  canOverride: boolean;
  overrideReason: string;
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
  const [error, setError] = useState<string | null>(null);

  const overrideBlocked = rateConMissing && (!canOverride || !overrideReason.trim());

  const createLeg = async () => {
    if (overrideBlocked) {
      setError("Rate confirmation required. Upload it first or add an admin override reason.");
      return;
    }
    try {
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
          overrideReason: overrideReason?.trim() || undefined,
        }),
      });
      setError(null);
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
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const assignLeg = async (legId: string, setActive: boolean, event: MouseEvent<HTMLButtonElement>) => {
    if (overrideBlocked) {
      setError("Rate confirmation required. Upload it first or add an admin override reason.");
      return;
    }
    const parent = event.currentTarget.parentElement;
    const selects = parent?.querySelectorAll("select") || [];
    const driverId = (selects[0] as HTMLSelectElement | undefined)?.value;
    const truckId = (selects[1] as HTMLSelectElement | undefined)?.value;
    const trailerId = (selects[2] as HTMLSelectElement | undefined)?.value;
    try {
      await apiFetch(`/legs/${legId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: driverId || undefined,
          truckId: truckId || undefined,
          trailerId: trailerId || undefined,
          setActive,
          overrideReason: overrideReason?.trim() || undefined,
        }),
      });
      setError(null);
      onUpdated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setStatus = async (legId: string, status: string) => {
    if (overrideBlocked) {
      setError("Rate confirmation required. Upload it first or add an admin override reason.");
      return;
    }
    try {
      await apiFetch(`/legs/${legId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, overrideReason: overrideReason?.trim() || undefined }),
      });
      setError(null);
      onUpdated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Leg plan</div>
      {error ? <div className="text-xs text-[color:var(--color-danger)]">{error}</div> : null}
      <div className="grid gap-3 lg:grid-cols-4">
        <FormField label="Leg type" htmlFor="legType">
          <Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            <option value="PICKUP">Shipper leg</option>
            <option value="LINEHAUL">Linehaul leg</option>
            <option value="DELIVERY">Consignee leg</option>
          </Select>
        </FormField>
        <FormField label="Start stop #" htmlFor="startStopSequence">
          <Input
            placeholder="1"
            value={form.startStopSequence}
            onChange={(event) => setForm({ ...form, startStopSequence: event.target.value })}
          />
        </FormField>
        <FormField label="End stop #" htmlFor="endStopSequence">
          <Input
            placeholder="2"
            value={form.endStopSequence}
            onChange={(event) => setForm({ ...form, endStopSequence: event.target.value })}
          />
        </FormField>
        <CheckboxField
          id="setActiveLeg"
          label="Set active"
          checked={form.setActive}
          onChange={(event) => setForm({ ...form, setActive: event.target.checked })}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        <FormField label="Driver" htmlFor="legDriver">
          <Select value={form.driverId} onChange={(event) => setForm({ ...form, driverId: event.target.value })}>
            <option value="">Driver</option>
            {drivers.map((driver: any) => (
              <option key={driver.id} value={driver.id} disabled={Boolean(driver.reason)}>
                {driver.name}
                {driver.reason ? ` (Unavailable: ${driver.reason})` : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Truck" htmlFor="legTruck">
          <Select value={form.truckId} onChange={(event) => setForm({ ...form, truckId: event.target.value })}>
            <option value="">Truck</option>
            {trucks.map((truck: any) => (
              <option key={truck.id} value={truck.id} disabled={Boolean(truck.reason)}>
                {truck.unit}
                {truck.reason ? ` (Unavailable: ${truck.reason})` : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Trailer" htmlFor="legTrailer">
          <Select value={form.trailerId} onChange={(event) => setForm({ ...form, trailerId: event.target.value })}>
            <option value="">Trailer</option>
            {trailers.map((trailer: any) => (
              <option key={trailer.id} value={trailer.id} disabled={Boolean(trailer.reason)}>
                {trailer.unit}
                {trailer.reason ? ` (Unavailable: ${trailer.reason})` : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <Button onClick={createLeg} disabled={overrideBlocked}>Add leg</Button>
      </div>

      <div className="grid gap-3">
        {load.legs?.length ? (
          load.legs.map((leg: any) => (
            <div key={leg.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">{leg.status}</div>
                  <div className="text-sm font-semibold">{leg.type} leg</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    Stops {leg.startStopSequence ?? "-"} {"->"} {leg.endStopSequence ?? "-"}
                  </div>
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Driver: {leg.driver?.name ?? "Unassigned"} - Truck {leg.truck?.unit ?? "-"} - Trailer {leg.trailer?.unit ?? "-"}
                </div>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-5">
                <FormField label="Driver" htmlFor={`legDriver-${leg.id}`}>
                  <Select defaultValue={leg.driverId ?? ""}>
                    <option value="">Driver</option>
                    {drivers.map((driver: any) => (
                      <option key={driver.id} value={driver.id} disabled={Boolean(driver.reason)}>
                        {driver.name}
                        {driver.reason ? ` (Unavailable: ${driver.reason})` : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Truck" htmlFor={`legTruck-${leg.id}`}>
                  <Select defaultValue={leg.truckId ?? ""}>
                    <option value="">Truck</option>
                    {trucks.map((truck: any) => (
                      <option key={truck.id} value={truck.id} disabled={Boolean(truck.reason)}>
                        {truck.unit}
                        {truck.reason ? ` (Unavailable: ${truck.reason})` : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Trailer" htmlFor={`legTrailer-${leg.id}`}>
                  <Select defaultValue={leg.trailerId ?? ""}>
                    <option value="">Trailer</option>
                    {trailers.map((trailer: any) => (
                      <option key={trailer.id} value={trailer.id} disabled={Boolean(trailer.reason)}>
                        {trailer.unit}
                        {trailer.reason ? ` (Unavailable: ${trailer.reason})` : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <Button variant="secondary" onClick={(event) => assignLeg(leg.id, false, event)} disabled={overrideBlocked}>
                  Assign
                </Button>
                <Button variant="secondary" onClick={(event) => assignLeg(leg.id, true, event)} disabled={overrideBlocked}>
                  Assign + active
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setStatus(leg.id, "IN_PROGRESS")} disabled={overrideBlocked}>
                  Set active
                </Button>
                <Button variant="ghost" onClick={() => setStatus(leg.id, "COMPLETE")} disabled={overrideBlocked}>
                  Mark complete
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-[color:var(--color-text-muted)]">No legs created yet.</div>
        )}
      </div>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";

type Asset = { id: string; name?: string | null; unit?: string | null; reason?: string | null };

const statuses = ["PLANNED", "LOADED", "IN_TRANSIT", "ARRIVED", "UNLOADED", "COMPLETE"];

export function ManifestPanel({
  trailers,
  trucks,
  drivers,
}: {
  trailers: Asset[];
  trucks: Asset[];
  drivers: Asset[];
}) {
  const [manifests, setManifests] = useState<any[]>([]);
  const [form, setForm] = useState({
    trailerId: "",
    truckId: "",
    driverId: "",
    origin: "",
    destination: "",
    plannedDepartureAt: "",
    plannedArrivalAt: "",
    loadNumbers: "",
  });
  const [loadInputs, setLoadInputs] = useState<Record<string, string>>({});

  const loadData = async () => {
    const data = await apiFetch<{ manifests: any[] }>("/manifests");
    setManifests(data.manifests);
  };

  useEffect(() => {
    loadData();
  }, []);

  const parseLoadNumbers = (value: string) =>
    value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const createManifest = async () => {
    if (!form.trailerId) return;
    await apiFetch("/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trailerId: form.trailerId,
        truckId: form.truckId || undefined,
        driverId: form.driverId || undefined,
        origin: form.origin || undefined,
        destination: form.destination || undefined,
        plannedDepartureAt: form.plannedDepartureAt || undefined,
        plannedArrivalAt: form.plannedArrivalAt || undefined,
        loadNumbers: parseLoadNumbers(form.loadNumbers),
      }),
    });
    setForm({
      trailerId: "",
      truckId: "",
      driverId: "",
      origin: "",
      destination: "",
      plannedDepartureAt: "",
      plannedArrivalAt: "",
      loadNumbers: "",
    });
    loadData();
  };

  const updateStatus = async (manifestId: string, status: string) => {
    await apiFetch(`/manifests/${manifestId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadData();
  };

  const addLoads = async (manifestId: string) => {
    const entry = loadInputs[manifestId] || "";
    if (!entry.trim()) return;
    await apiFetch(`/manifests/${manifestId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loadNumbers: parseLoadNumbers(entry) }),
    });
    setLoadInputs((prev) => ({ ...prev, [manifestId]: "" }));
    loadData();
  };

  const removeLoad = async (manifestId: string, loadId: string) => {
    await apiFetch(`/manifests/${manifestId}/items/${loadId}`, { method: "DELETE" });
    loadData();
  };

  return (
    <div className="grid gap-4">
      <Card className="space-y-3">
        <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Trailer manifests</div>
        <div className="grid gap-3 lg:grid-cols-3">
          <FormField label="Trailer" htmlFor="manifestTrailer" required>
            <Select value={form.trailerId} onChange={(event) => setForm({ ...form, trailerId: event.target.value })}>
              <option value="">Select trailer</option>
              {trailers.map((trailer) => (
                <option key={trailer.id} value={trailer.id}>
                  {trailer.unit}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Truck" htmlFor="manifestTruck">
            <Select value={form.truckId} onChange={(event) => setForm({ ...form, truckId: event.target.value })}>
              <option value="">Truck (optional)</option>
              {trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.unit}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Driver" htmlFor="manifestDriver">
            <Select value={form.driverId} onChange={(event) => setForm({ ...form, driverId: event.target.value })}>
              <option value="">Driver (optional)</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <FormField label="Origin yard or hub" htmlFor="manifestOrigin">
            <Input placeholder="Origin yard" value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })} />
          </FormField>
          <FormField label="Destination yard or hub" htmlFor="manifestDestination">
            <Input
              placeholder="Destination yard"
              value={form.destination}
              onChange={(event) => setForm({ ...form, destination: event.target.value })}
            />
          </FormField>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <FormField label="Planned departure" htmlFor="manifestDeparture">
            <Input
              type="datetime-local"
              value={form.plannedDepartureAt}
              onChange={(event) => setForm({ ...form, plannedDepartureAt: event.target.value })}
            />
          </FormField>
          <FormField label="Planned arrival" htmlFor="manifestArrival">
            <Input
              type="datetime-local"
              value={form.plannedArrivalAt}
              onChange={(event) => setForm({ ...form, plannedArrivalAt: event.target.value })}
            />
          </FormField>
        </div>
        <FormField label="Load numbers" htmlFor="manifestLoadNumbers" hint="Comma or new line separated">
          <Input
            placeholder="LD-1001, LD-1002"
            value={form.loadNumbers}
            onChange={(event) => setForm({ ...form, loadNumbers: event.target.value })}
          />
        </FormField>
        <Button onClick={createManifest}>Create manifest</Button>
      </Card>

      {manifests.map((manifest) => (
        <Card key={manifest.id} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">{manifest.status}</div>
              <div className="text-lg font-semibold">Trailer {manifest.trailer?.unit}</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {manifest.origin || "Origin yard"} {"->"} {manifest.destination || "Destination yard"}
              </div>
            </div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              Driver: {manifest.driver?.name ?? "Unassigned"} - Truck {manifest.truck?.unit ?? "-"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <FormField label="Manifest status" htmlFor={`manifestStatus-${manifest.id}`}>
              <Select defaultValue={manifest.status}>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button
              variant="secondary"
              onClick={(event) => {
                const select = event.currentTarget.parentElement?.querySelector("select") as HTMLSelectElement | null;
                if (select?.value) {
                  updateStatus(manifest.id, select.value);
                }
              }}
            >
              Update status
            </Button>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Loads on trailer</div>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {manifest.items?.length ? (
                manifest.items.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-full border border-[color:var(--color-divider)] bg-white px-3 py-1">
                    <span>{item.load?.loadNumber}</span>
                    <button
                      className="rounded-full text-xs text-[color:var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
                      onClick={() => removeLoad(manifest.id, item.loadId)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-sm text-[color:var(--color-text-muted)]">No loads attached yet.</div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <FormField label="Add load numbers" htmlFor={`manifestAddLoads-${manifest.id}`}>
                <Input
                  placeholder="LD-1003, LD-1004"
                  value={loadInputs[manifest.id] ?? ""}
                  onChange={(event) => setLoadInputs((prev) => ({ ...prev, [manifest.id]: event.target.value }))}
                />
              </FormField>
              <Button variant="secondary" onClick={() => addLoads(manifest.id)}>
                Add loads
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

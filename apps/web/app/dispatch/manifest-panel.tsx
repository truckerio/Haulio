"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type Asset = { id: string; name?: string; unit?: string };

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
        <div className="text-sm uppercase tracking-widest text-black/50">Trailer manifests</div>
        <div className="grid gap-3 lg:grid-cols-3">
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
          <select
            className="rounded-2xl border border-black/10 bg-white px-3 py-2"
            value={form.truckId}
            onChange={(event) => setForm({ ...form, truckId: event.target.value })}
          >
            <option value="">Truck (optional)</option>
            {trucks.map((truck) => (
              <option key={truck.id} value={truck.id}>
                {truck.unit}
              </option>
            ))}
          </select>
          <select
            className="rounded-2xl border border-black/10 bg-white px-3 py-2"
            value={form.driverId}
            onChange={(event) => setForm({ ...form, driverId: event.target.value })}
          >
            <option value="">Driver (optional)</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input placeholder="Origin yard or hub" value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })} />
          <Input
            placeholder="Destination yard or hub"
            value={form.destination}
            onChange={(event) => setForm({ ...form, destination: event.target.value })}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            type="datetime-local"
            value={form.plannedDepartureAt}
            onChange={(event) => setForm({ ...form, plannedDepartureAt: event.target.value })}
          />
          <Input
            type="datetime-local"
            value={form.plannedArrivalAt}
            onChange={(event) => setForm({ ...form, plannedArrivalAt: event.target.value })}
          />
        </div>
        <Input
          placeholder="Load numbers (comma or new line separated)"
          value={form.loadNumbers}
          onChange={(event) => setForm({ ...form, loadNumbers: event.target.value })}
        />
        <Button onClick={createManifest}>Create manifest</Button>
      </Card>

      {manifests.map((manifest) => (
        <Card key={manifest.id} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm uppercase tracking-widest text-black/50">{manifest.status}</div>
              <div className="text-lg font-semibold">Trailer {manifest.trailer?.unit}</div>
              <div className="text-sm text-black/60">
                {manifest.origin || "Origin yard"} → {manifest.destination || "Destination yard"}
              </div>
            </div>
            <div className="text-sm text-black/60">
              Driver: {manifest.driver?.name ?? "Unassigned"} · Truck {manifest.truck?.unit ?? "-"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select className="rounded-2xl border border-black/10 bg-white px-3 py-2" defaultValue={manifest.status}>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
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
          <div className="rounded-2xl border border-black/10 bg-white/70 p-3">
            <div className="text-xs uppercase tracking-widest text-black/50">Loads on trailer</div>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {manifest.items?.length ? (
                manifest.items.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1">
                    <span>{item.load?.loadNumber}</span>
                    <button className="text-xs text-black/60" onClick={() => removeLoad(manifest.id, item.loadId)}>
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-sm text-black/60">No loads attached yet.</div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                placeholder="Add load numbers"
                value={loadInputs[manifest.id] ?? ""}
                onChange={(event) => setLoadInputs((prev) => ({ ...prev, [manifest.id]: event.target.value }))}
              />
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

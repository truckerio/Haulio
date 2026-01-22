"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { ManifestPanel } from "./manifest-panel";
import { LegsPanel } from "./legs-panel";

export default function DispatchPage() {
  const [loads, setLoads] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [trailers, setTrailers] = useState<any[]>([]);
  const defaultFilters = {
    search: "",
    status: "",
    driverId: "",
    truckId: "",
    trailerId: "",
    assigned: "all",
    fromDate: "",
    toDate: "",
    destSearch: "",
    minRate: "",
    maxRate: "",
  };
  const [filters, setFilters] = useState(defaultFilters);
  const [view, setView] = useState<"cards" | "board" | "compact">("cards");
  const [showFilters, setShowFilters] = useState(false);

  const buildParams = (nextFilters = filters) => {
    const params = new URLSearchParams();
    if (nextFilters.search) params.set("search", nextFilters.search);
    if (nextFilters.status) params.set("status", nextFilters.status);
    if (nextFilters.driverId) params.set("driverId", nextFilters.driverId);
    if (nextFilters.truckId) params.set("truckId", nextFilters.truckId);
    if (nextFilters.trailerId) params.set("trailerId", nextFilters.trailerId);
    if (nextFilters.destSearch) params.set("destSearch", nextFilters.destSearch);
    if (nextFilters.minRate) params.set("minRate", nextFilters.minRate);
    if (nextFilters.maxRate) params.set("maxRate", nextFilters.maxRate);
    if (nextFilters.assigned !== "all") {
      params.set("assigned", nextFilters.assigned === "assigned" ? "true" : "false");
    }
    if (nextFilters.fromDate) params.set("fromDate", nextFilters.fromDate);
    if (nextFilters.toDate) params.set("toDate", nextFilters.toDate);
    return params.toString();
  };

  const loadData = async (nextFilters = filters) => {
    const query = buildParams(nextFilters);
    const loadsUrl = query ? `/loads?${query}` : "/loads";
    const [loadsData, driversData, trucksData, trailersData] = await Promise.all([
      apiFetch<{ loads: any[] }>(loadsUrl),
      apiFetch<{ drivers: any[] }>("/assets/drivers"),
      apiFetch<{ trucks: any[] }>("/assets/trucks"),
      apiFetch<{ trailers: any[] }>("/assets/trailers"),
    ]);
    setLoads(loadsData.loads);
    setDrivers(driversData.drivers);
    setTrucks(trucksData.trucks);
    setTrailers(trailersData.trailers);
  };

  useEffect(() => {
    loadData();
  }, []);

  const assign = async (loadId: string, driverId: string, truckId?: string, trailerId?: string) => {
    await apiFetch(`/loads/${loadId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId, truckId, trailerId }),
    });
    loadData();
  };

  const unassign = async (loadId: string) => {
    await apiFetch(`/loads/${loadId}/unassign`, { method: "POST" });
    loadData();
  };

  const markArrive = async (loadId: string, stopId: string) => {
    await apiFetch(`/loads/${loadId}/stops/${stopId}/arrive`, { method: "POST" });
    loadData();
  };

  const markDepart = async (loadId: string, stopId: string) => {
    await apiFetch(`/loads/${loadId}/stops/${stopId}/depart`, { method: "POST" });
    loadData();
  };

  const updateDelay = async (stopId: string, delayReason?: string | null, delayNotes?: string | null) => {
    await apiFetch(`/stops/${stopId}/delay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        delayReason: delayReason || undefined,
        delayNotes: delayNotes || undefined,
      }),
    });
    loadData();
  };

  return (
    <AppShell title="Dispatch" subtitle="Assign assets and monitor driver updates">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest ${
              showFilters ? "border-black/30 bg-black text-white" : "border-black/10 bg-white/70 text-black/70"
            }`}
            onClick={() => setShowFilters((prev) => !prev)}
          >
            Filters
          </button>
          <span className="text-xs text-black/50">Refine the list</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={view === "cards" ? "primary" : "secondary"} onClick={() => setView("cards")}>
            Cards
          </Button>
          <Button size="sm" variant={view === "board" ? "primary" : "secondary"} onClick={() => setView("board")}>
            Board
          </Button>
          <Button size="sm" variant={view === "compact" ? "primary" : "secondary"} onClick={() => setView("compact")}>
            Compact
          </Button>
        </div>
      </div>
      {showFilters ? (
        <div className="border-b border-black/10 pb-4">
          <div className="mt-3 grid gap-3 lg:grid-cols-4">
            <Input
              placeholder="Search load or customer"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
            <select
              className="rounded-2xl border border-black/10 bg-white px-3 py-2"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All statuses</option>
              <option value="PLANNED">Planned</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_TRANSIT">In transit</option>
              <option value="DELIVERED">Delivered</option>
              <option value="READY_TO_INVOICE">Ready to invoice</option>
              <option value="INVOICED">Invoiced</option>
            </select>
            <select
              className="rounded-2xl border border-black/10 bg-white px-3 py-2"
              value={filters.driverId}
              onChange={(e) => setFilters({ ...filters, driverId: e.target.value })}
            >
              <option value="">All drivers</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-2xl border border-black/10 bg-white px-3 py-2"
              value={filters.assigned}
              onChange={(e) => setFilters({ ...filters, assigned: e.target.value })}
            >
              <option value="all">All assignments</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <select
              className="rounded-2xl border border-black/10 bg-white px-3 py-2"
              value={filters.truckId}
              onChange={(e) => setFilters({ ...filters, truckId: e.target.value })}
            >
              <option value="">All trucks</option>
              {trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.unit}
                </option>
              ))}
            </select>
            <select
              className="rounded-2xl border border-black/10 bg-white px-3 py-2"
              value={filters.trailerId}
              onChange={(e) => setFilters({ ...filters, trailerId: e.target.value })}
            >
              <option value="">All trailers</option>
              {trailers.map((trailer) => (
                <option key={trailer.id} value={trailer.id}>
                  {trailer.unit}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={filters.fromDate}
                onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
              />
              <Input
                type="date"
                value={filters.toDate}
                onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Input
              placeholder="Destination (name, city, state, zip)"
              value={filters.destSearch}
              onChange={(e) => setFilters({ ...filters, destSearch: e.target.value })}
            />
            <Input
              placeholder="Min rate"
              value={filters.minRate}
              onChange={(e) => setFilters({ ...filters, minRate: e.target.value })}
            />
            <Input
              placeholder="Max rate"
              value={filters.maxRate}
              onChange={(e) => setFilters({ ...filters, maxRate: e.target.value })}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => loadData()}>
              Apply
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setFilters(defaultFilters);
                loadData(defaultFilters);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      ) : null}
      <ManifestPanel trailers={trailers} trucks={trucks} drivers={drivers} />
      {view === "compact" ? (
        <Card>
          <div className="grid gap-3">
            <div className="hidden grid-cols-7 gap-2 text-xs uppercase tracking-widest text-black/40 lg:grid">
              <div>Status</div>
              <div>Load</div>
              <div>Customer</div>
              <div>Driver</div>
              <div>Trailer</div>
              <div>Miles</div>
              <div>Rate</div>
            </div>
            {loads.map((load) => (
              <div key={load.id} className="grid grid-cols-1 gap-2 rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm lg:grid-cols-7">
                <div className="text-xs uppercase tracking-widest text-black/50">{load.status}</div>
                <div className="font-semibold">{load.loadNumber}</div>
                <div>{load.customer?.name ?? load.customerName}</div>
                <div>{load.driver?.name ?? "Unassigned"}</div>
                <div>{load.trailer?.unit ?? "-"}</div>
                <div>{load.miles ?? "-"}</div>
                <div>{load.rate ?? "-"}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div className={view === "board" ? "grid gap-4 lg:grid-cols-3" : "grid gap-4"}>
          {(view === "board"
            ? [
                { status: "PLANNED", title: "Planned" },
                { status: "ASSIGNED", title: "Assigned" },
                { status: "IN_TRANSIT", title: "In transit" },
                { status: "DELIVERED", title: "Delivered" },
                { status: "READY_TO_INVOICE", title: "Ready to invoice" },
                { status: "INVOICED", title: "Invoiced" },
              ]
            : [{ status: "ALL", title: "All loads" }]
          ).map((bucket) => {
            const bucketLoads = bucket.status === "ALL" ? loads : loads.filter((load) => load.status === bucket.status);
            if (view === "board" && bucketLoads.length === 0) {
              return null;
            }
            return (
              <div key={bucket.status} className="grid gap-4">
                {view === "board" ? (
                  <div className="text-xs uppercase tracking-widest text-black/40">{bucket.title}</div>
                ) : null}
                {bucketLoads.map((load) => (
                  <Card key={load.id} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="text-sm uppercase tracking-widest text-black/50">{load.status}</div>
                        <div className="text-xl font-semibold">{load.loadNumber}</div>
                        <div className="text-sm text-black/60">{load.customer?.name ?? load.customerName}</div>
                      </div>
                      <div className="text-sm text-black/60">
                        Last update: {load.events?.[0]?.createdAt ? new Date(load.events[0].createdAt).toLocaleString() : "-"}
                      </div>
                    </div>
                    <div className="text-sm text-black/60">
                      Assigned: {load.driver?.name ?? "Unassigned"} · Truck {load.truck?.unit ?? "-"} · Trailer {load.trailer?.unit ?? "-"} · Miles{" "}
                      {load.miles ?? "-"} · Rate {load.rate ?? "-"}
                    </div>
                    <div className="grid gap-3 lg:grid-cols-4">
                      <select className="rounded-2xl border border-black/10 bg-white px-3 py-2" defaultValue="">
                        <option value="" disabled>
                          Driver
                        </option>
                        {drivers.map((driver) => (
                          <option key={driver.id} value={driver.id}>
                            {driver.name}
                          </option>
                        ))}
                      </select>
                      <select className="rounded-2xl border border-black/10 bg-white px-3 py-2" defaultValue="">
                        <option value="" disabled>
                          Truck
                        </option>
                        {trucks.map((truck) => (
                          <option key={truck.id} value={truck.id}>
                            {truck.unit}
                          </option>
                        ))}
                      </select>
                      <select className="rounded-2xl border border-black/10 bg-white px-3 py-2" defaultValue="">
                        <option value="" disabled>
                          Trailer
                        </option>
                        {trailers.map((trailer) => (
                          <option key={trailer.id} value={trailer.id}>
                            {trailer.unit}
                          </option>
                        ))}
                      </select>
                      <Button
                        onClick={(event) => {
                          const selects = (event.currentTarget.parentElement?.querySelectorAll("select") ||
                            []) as NodeListOf<HTMLSelectElement>;
                          const driverId = selects[0]?.value;
                          const truckId = selects[1]?.value;
                          const trailerId = selects[2]?.value;
                          if (driverId) {
                            assign(load.id, driverId, truckId || undefined, trailerId || undefined);
                          }
                        }}
                      >
                        Assign
                      </Button>
                      {load.assignedDriverId ? (
                        <Button variant="ghost" onClick={() => unassign(load.id)}>
                          Unassign
                        </Button>
                      ) : null}
                    </div>
                    <LegsPanel load={load} drivers={drivers} trucks={trucks} trailers={trailers} onUpdated={loadData} />
                    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
                      <div className="text-xs uppercase tracking-widest text-black/50">Manual stop updates</div>
                      <div className="mt-3 grid gap-3">
                        {load.stops?.map((stop: any) => (
                          <div
                            key={stop.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-4 py-2"
                          >
                            <div>
                              <div className="text-sm font-semibold">
                                {stop.type} · {stop.name}
                              </div>
                              <div className="text-xs uppercase tracking-widest text-black/50">Status: {stop.status ?? "PLANNED"}</div>
                              <div className="text-xs text-black/60">
                                Arrived: {stop.arrivedAt ? new Date(stop.arrivedAt).toLocaleTimeString() : "-"} · Departed:{" "}
                                {stop.departedAt ? new Date(stop.departedAt).toLocaleTimeString() : "-"}
                              </div>
                              <div className="text-xs text-black/60">
                                Delay: {stop.delayReason ?? "None"} · Detention: {stop.detentionMinutes ?? 0} min
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button variant="secondary" onClick={() => markArrive(load.id, stop.id)}>
                                Mark arrived
                              </Button>
                              <Button variant="secondary" onClick={() => markDepart(load.id, stop.id)}>
                                Mark departed
                              </Button>
                              <select className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm" defaultValue={stop.delayReason ?? ""}>
                                <option value="">Delay reason</option>
                                <option value="SHIPPER_DELAY">Shipper delay</option>
                                <option value="RECEIVER_DELAY">Receiver delay</option>
                                <option value="TRAFFIC">Traffic</option>
                                <option value="WEATHER">Weather</option>
                                <option value="BREAKDOWN">Breakdown</option>
                                <option value="OTHER">Other</option>
                              </select>
                              <textarea
                                className="min-h-[60px] rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                                defaultValue={stop.delayNotes ?? ""}
                                placeholder="Delay notes"
                              />
                              <Button
                                variant="ghost"
                                onClick={(event) => {
                                  const parent = event.currentTarget.parentElement;
                                  const select = parent?.querySelector("select") as HTMLSelectElement | null;
                                  const notes = parent?.querySelector("textarea") as HTMLTextAreaElement | null;
                                  updateDelay(stop.id, select?.value || null, notes?.value || null);
                                }}
                              >
                                Save delay
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

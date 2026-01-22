"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { BulkLoadImport } from "@/components/BulkLoadImport";

export default function LoadsPage() {
  const [loads, setLoads] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [showImport, setShowImport] = useState(false);
  const defaultFilters = {
    search: "",
    status: "",
    driverId: "",
    assigned: "all",
    destSearch: "",
    minRate: "",
    maxRate: "",
  };
  const [filters, setFilters] = useState(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [form, setForm] = useState({
    loadNumber: "",
    customerName: "",
    customerRef: "",
    bolNumber: "",
    rate: "",
    miles: "",
    pickupName: "",
    pickupAddress: "",
    pickupCity: "",
    pickupState: "",
    pickupZip: "",
    originYardName: "",
    originYardAddress: "",
    originYardCity: "",
    originYardState: "",
    originYardZip: "",
    destinationYardName: "",
    destinationYardAddress: "",
    destinationYardCity: "",
    destinationYardState: "",
    destinationYardZip: "",
    deliveryName: "",
    deliveryAddress: "",
    deliveryCity: "",
    deliveryState: "",
    deliveryZip: "",
  });

  const buildParams = (nextFilters = filters) => {
    const params = new URLSearchParams();
    if (nextFilters.search) params.set("search", nextFilters.search);
    if (nextFilters.status) params.set("status", nextFilters.status);
    if (nextFilters.driverId) params.set("driverId", nextFilters.driverId);
    if (nextFilters.destSearch) params.set("destSearch", nextFilters.destSearch);
    if (nextFilters.minRate) params.set("minRate", nextFilters.minRate);
    if (nextFilters.maxRate) params.set("maxRate", nextFilters.maxRate);
    if (nextFilters.assigned !== "all") {
      params.set("assigned", nextFilters.assigned === "assigned" ? "true" : "false");
    }
    return params.toString();
  };

  const loadData = async (nextFilters = filters) => {
    const query = buildParams(nextFilters);
    const url = query ? `/loads?${query}` : "/loads";
    const [loadsData, driversData] = await Promise.all([
      apiFetch<{ loads: any[] }>(url),
      apiFetch<{ drivers: any[] }>("/assets/drivers"),
    ]);
    setDrivers(driversData.drivers);
    setLoads(loadsData.loads);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async () => {
    const stops: Array<Record<string, string | number>> = [
      {
        type: "PICKUP",
        name: form.pickupName,
        address: form.pickupAddress,
        city: form.pickupCity,
        state: form.pickupState,
        zip: form.pickupZip,
        sequence: 1,
      },
    ];

    const hasOriginYard = form.originYardName && form.originYardAddress;
    const hasDestinationYard = form.destinationYardName && form.destinationYardAddress;
    if (hasOriginYard) {
      stops.push({
        type: "YARD",
        name: form.originYardName,
        address: form.originYardAddress,
        city: form.originYardCity,
        state: form.originYardState,
        zip: form.originYardZip,
        sequence: stops.length + 1,
      });
    }
    if (hasDestinationYard) {
      stops.push({
        type: "YARD",
        name: form.destinationYardName,
        address: form.destinationYardAddress,
        city: form.destinationYardCity,
        state: form.destinationYardState,
        zip: form.destinationYardZip,
        sequence: stops.length + 1,
      });
    }
    stops.push({
      type: "DELIVERY",
      name: form.deliveryName,
      address: form.deliveryAddress,
      city: form.deliveryCity,
      state: form.deliveryState,
      zip: form.deliveryZip,
      sequence: stops.length + 1,
    });

    await apiFetch("/loads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loadNumber: form.loadNumber,
        customerName: form.customerName,
        customerRef: form.customerRef,
        bolNumber: form.bolNumber,
        rate: form.rate ? Number(form.rate) : undefined,
        miles: form.miles ? Number(form.miles) : undefined,
        stops,
      }),
    });
    setForm({
      loadNumber: "",
      customerName: "",
      customerRef: "",
      bolNumber: "",
      rate: "",
      miles: "",
      pickupName: "",
      pickupAddress: "",
      pickupCity: "",
      pickupState: "",
      pickupZip: "",
      originYardName: "",
      originYardAddress: "",
      originYardCity: "",
      originYardState: "",
      originYardZip: "",
      destinationYardName: "",
      destinationYardAddress: "",
      destinationYardCity: "",
      destinationYardState: "",
      destinationYardZip: "",
      deliveryName: "",
      deliveryAddress: "",
      deliveryCity: "",
      deliveryState: "",
      deliveryZip: "",
    });
    loadData();
  };

  return (
    <AppShell title="Loads" subtitle="Create and manage loads">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowImport((prev) => !prev)}>
            {showImport ? "Hide bulk import" : "Bulk import"}
          </Button>
          <span className="text-xs text-black/50">Upload loads.csv + stops.csv</span>
        </div>
      </div>
      {showImport ? <BulkLoadImport onImported={loadData} /> : null}
      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-widest text-black/50">Create load</div>
        <div className="grid gap-3 lg:grid-cols-3">
          <Input placeholder="Load number" value={form.loadNumber} onChange={(e) => setForm({ ...form, loadNumber: e.target.value })} />
          <Input placeholder="Customer" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          <Input placeholder="Customer ref / PO" value={form.customerRef} onChange={(e) => setForm({ ...form, customerRef: e.target.value })} />
          <Input placeholder="Rate" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          <Input placeholder="Miles" value={form.miles} onChange={(e) => setForm({ ...form, miles: e.target.value })} />
          <Input placeholder="BOL number" value={form.bolNumber} onChange={(e) => setForm({ ...form, bolNumber: e.target.value })} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input placeholder="Pickup name" value={form.pickupName} onChange={(e) => setForm({ ...form, pickupName: e.target.value })} />
          <Input placeholder="Delivery name" value={form.deliveryName} onChange={(e) => setForm({ ...form, deliveryName: e.target.value })} />
          <Input placeholder="Pickup address" value={form.pickupAddress} onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })} />
          <Input placeholder="Delivery address" value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} />
          <Input placeholder="Pickup city" value={form.pickupCity} onChange={(e) => setForm({ ...form, pickupCity: e.target.value })} />
          <Input placeholder="Delivery city" value={form.deliveryCity} onChange={(e) => setForm({ ...form, deliveryCity: e.target.value })} />
          <Input placeholder="Pickup state" value={form.pickupState} onChange={(e) => setForm({ ...form, pickupState: e.target.value })} />
          <Input placeholder="Delivery state" value={form.deliveryState} onChange={(e) => setForm({ ...form, deliveryState: e.target.value })} />
          <Input placeholder="Pickup zip" value={form.pickupZip} onChange={(e) => setForm({ ...form, pickupZip: e.target.value })} />
          <Input placeholder="Delivery zip" value={form.deliveryZip} onChange={(e) => setForm({ ...form, deliveryZip: e.target.value })} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input placeholder="Origin yard name (optional)" value={form.originYardName} onChange={(e) => setForm({ ...form, originYardName: e.target.value })} />
          <Input placeholder="Destination yard name (optional)" value={form.destinationYardName} onChange={(e) => setForm({ ...form, destinationYardName: e.target.value })} />
          <Input placeholder="Origin yard address" value={form.originYardAddress} onChange={(e) => setForm({ ...form, originYardAddress: e.target.value })} />
          <Input placeholder="Destination yard address" value={form.destinationYardAddress} onChange={(e) => setForm({ ...form, destinationYardAddress: e.target.value })} />
          <Input placeholder="Origin yard city" value={form.originYardCity} onChange={(e) => setForm({ ...form, originYardCity: e.target.value })} />
          <Input placeholder="Destination yard city" value={form.destinationYardCity} onChange={(e) => setForm({ ...form, destinationYardCity: e.target.value })} />
          <Input placeholder="Origin yard state" value={form.originYardState} onChange={(e) => setForm({ ...form, originYardState: e.target.value })} />
          <Input placeholder="Destination yard state" value={form.destinationYardState} onChange={(e) => setForm({ ...form, destinationYardState: e.target.value })} />
          <Input placeholder="Origin yard zip" value={form.originYardZip} onChange={(e) => setForm({ ...form, originYardZip: e.target.value })} />
          <Input placeholder="Destination yard zip" value={form.destinationYardZip} onChange={(e) => setForm({ ...form, destinationYardZip: e.target.value })} />
        </div>
        <Button onClick={handleCreate}>Create load</Button>
      </Card>

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

      <div className="grid gap-4">
        {loads.map((load) => (
          <Card key={load.id}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm uppercase tracking-widest text-black/50">{load.status}</div>
                <div className="text-xl font-semibold">{load.loadNumber}</div>
                <div className="text-sm text-black/60">{load.customer?.name ?? load.customerName}</div>
              </div>
              <div className="text-sm text-black/60">
                Driver: {load.driver?.name ?? "Unassigned"} · Miles: {load.miles ?? "-"} · Rate: {load.rate ?? "-"}
              </div>
              <Button variant="secondary" onClick={() => (window.location.href = `/loads/${load.id}`)}>
                Timeline
              </Button>
            </div>
          </Card>
        ))}
        {loads.length === 0 ? (
          <Card>
            <div className="text-sm text-black/60">Sorry, no load available with that number.</div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

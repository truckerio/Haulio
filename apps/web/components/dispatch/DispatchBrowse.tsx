"use client";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatStatusLabel } from "@/lib/status-format";

type DispatchItem = {
  id: string;
  loadNumber: string;
  status: string;
  trip?: {
    id: string;
    tripNumber: string;
    status: string;
  } | null;
  customerName?: string | null;
  rate?: string | number | null;
  miles?: number | null;
  assignment?: {
    driver?: { id: string; name: string } | null;
    truck?: { id: string; unit: string } | null;
    trailer?: { id: string; unit: string } | null;
  };
  route?: { shipperCity?: string | null; shipperState?: string | null; consigneeCity?: string | null; consigneeState?: string | null };
  nextStop?: {
    id: string;
    type: string;
    name: string;
    city: string;
    state: string;
  } | null;
  riskFlags?: {
    needsAssignment: boolean;
    trackingOffInTransit?: boolean;
    overdueStopWindow?: boolean;
    atRisk: boolean;
  };
};

export function DispatchBrowse({
  loads,
  selectedLoadId,
  onSelectLoad,
  lens,
  queueView,
}: {
  loads: DispatchItem[];
  selectedLoadId: string | null;
  onSelectLoad: (id: string) => void;
  lens: "board" | "list";
  queueView: "active" | "recent" | "history";
}) {
  if (!loads.length) {
    return <EmptyState title="No loads ready for dispatch." description="Assignments will appear once loads are planned or need attention." />;
  }

  if (lens === "list") {
    // QA checklist: status rail visible on known statuses; truncate cleanly; hover/selected subtle; no layout shift; right pane unchanged.
    return (
      <Card>
        <div className="grid gap-3">
          <div className="grid grid-cols-[96px_minmax(0,1.4fr)_minmax(0,1fr)_72px] gap-x-3 pl-6 pr-4 text-[11px] font-medium uppercase tracking-wide text-neutral-500 min-[420px]:grid-cols-[96px_minmax(0,1.4fr)_minmax(0,1fr)_72px_64px_64px]">
            <div className="min-w-0 truncate">Trip / Load</div>
            <div className="min-w-0 truncate">Customer</div>
            <div className="min-w-0 truncate">Driver</div>
            <div className="min-w-0 truncate">Status</div>
            <div className="hidden min-w-0 truncate text-right min-[420px]:block">Miles</div>
            <div className="hidden min-w-0 truncate text-right min-[420px]:block">Rate</div>
          </div>
          {loads.map((load) => {
            const showHistoryTag = queueView !== "active";
            const historyLabel = load.status === "CANCELLED" ? "Closed" : "Completed";
            return (
              <button
                key={load.id}
                type="button"
                onClick={() => onSelectLoad(load.id)}
                data-selected={selectedLoadId === load.id}
                className={`relative grid grid-cols-[96px_minmax(0,1.4fr)_minmax(0,1fr)_72px] gap-x-3 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] overflow-hidden py-3 pl-6 pr-4 text-left transition-colors duration-150 hover:bg-[color:var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)] min-[420px]:grid-cols-[96px_minmax(0,1.4fr)_minmax(0,1fr)_72px_64px_64px] ${
                  selectedLoadId === load.id ? "border-[color:var(--color-divider-strong)] bg-[color:var(--color-surface-hover)]" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-[color:var(--color-text-muted)]">{load.trip?.tripNumber ?? "No trip"}</div>
                  <div className="truncate text-[12px] font-medium text-ink">{load.loadNumber}</div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-ink">{load.customerName ?? "Customer"}</div>
                  <div className="mt-1 text-[12px] text-[color:var(--color-text-muted)] min-[420px]:hidden">
                    {load.miles ?? "-"} mi · {load.rate ?? "-"}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] text-[color:var(--color-text-muted)]">{load.assignment?.driver?.name ?? "Unassigned"}</div>
                </div>
                <div className="min-w-0 truncate text-[12px] text-[color:var(--color-text-muted)]">
                  {formatStatusLabel(load.status)}
                  {showHistoryTag ? (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-[color:var(--color-text-subtle)]">{historyLabel}</span>
                  ) : null}
                </div>
                <div className="hidden min-w-0 text-right text-[12px] text-[color:var(--color-text-muted)] min-[420px]:block">{load.miles ?? "-"}</div>
                <div className="hidden min-w-0 text-right text-[12px] text-[color:var(--color-text-muted)] min-[420px]:block">{load.rate ?? "-"}</div>
              </button>
            );
          })}
        </div>
      </Card>
    );
  }

  const buckets = [
    { status: "PLANNED", title: "Planned" },
    { status: "ASSIGNED", title: "Assigned" },
    { status: "IN_TRANSIT", title: "In transit" },
    { status: "DELIVERED", title: "Delivered" },
    { status: "POD_RECEIVED", title: "POD received" },
    { status: "READY_TO_INVOICE", title: "Ready to invoice" },
    { status: "INVOICED", title: "Invoiced" },
    { status: "PAID", title: "Paid" },
    { status: "CANCELLED", title: "Cancelled" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {buckets.map((bucket) => {
        const bucketLoads = loads.filter((load) => load.status === bucket.status);
        if (!bucketLoads.length) return null;
        return (
          <div key={bucket.status} className="grid gap-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">{bucket.title}</div>
            {bucketLoads.map((load) => (
              <Card
                key={load.id}
                data-selected={selectedLoadId === load.id}
                className={`p-0 overflow-hidden ${selectedLoadId === load.id ? "ring-2 ring-[color:var(--color-accent-soft)]" : ""}`}
              >
                <button type="button" className="w-full p-5 pl-6 text-left" onClick={() => onSelectLoad(load.id)}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      {load.trip?.tripNumber ? (
                        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">{load.trip.tripNumber}</div>
                      ) : null}
                      <div className="text-xl font-semibold">{load.loadNumber}</div>
                      <div className="text-sm text-[color:var(--color-text-muted)]">{load.customerName ?? "Customer"}</div>
                      {load.route?.shipperCity || load.route?.consigneeCity ? (
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          {load.route?.shipperCity ?? "-"}, {load.route?.shipperState ?? "-"} {"->"} {load.route?.consigneeCity ?? "-"}, {load.route?.consigneeState ?? "-"}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1 text-xs text-[color:var(--color-text-muted)]">
                      {load.riskFlags?.needsAssignment ? (
                        <span className="text-[color:var(--color-danger)]">Needs assignment</span>
                      ) : null}
                      {load.riskFlags?.trackingOffInTransit ? (
                        <span className="text-[color:var(--color-warning)]">Tracking off</span>
                      ) : null}
                      {load.riskFlags?.overdueStopWindow ? (
                        <span className="text-[color:var(--color-warning)]">Overdue stop window</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">
                    Assigned: {load.assignment?.driver?.name ?? "Unassigned"} - Truck {load.assignment?.truck?.unit ?? "-"} - Trailer {load.assignment?.trailer?.unit ?? "-"} - Miles {load.miles ?? "-"} - Rate {load.rate ?? "-"}
                  </div>
                  {load.nextStop ? (
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      Next stop: {load.nextStop.name} - {load.nextStop.city}, {load.nextStop.state}
                    </div>
                  ) : null}
                </button>
              </Card>
            ))}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/rbac/route-guard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { ImportWizard } from "@/components/ImportWizard";
import { AdminSettingsShell } from "@/components/admin-settings/AdminSettingsShell";
import { apiFetch } from "@/lib/api";

const TRUCK_TEMPLATE = "unit,vin,plate,plateState,status\n";
const TRAILER_TEMPLATE = "unit,type,plate,plateState,status\n";
const TRUCK_STATUS_OPTIONS = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"] as const;
const TRAILER_STATUS_OPTIONS = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"] as const;
const TRAILER_TYPE_OPTIONS = ["DRY_VAN", "REEFER", "FLATBED", "OTHER"] as const;

export default function FleetSettingsPage() {
  const router = useRouter();
  const [trucks, setTrucks] = useState<any[]>([]);
  const [trailers, setTrailers] = useState<any[]>([]);
  const [truckForm, setTruckForm] = useState({
    unit: "",
    vin: "",
    plate: "",
    plateState: "",
    status: "",
    active: true,
  });
  const [trailerForm, setTrailerForm] = useState({
    unit: "",
    type: "",
    plate: "",
    plateState: "",
    status: "",
    active: true,
  });
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null);
  const [editingTrailerId, setEditingTrailerId] = useState<string | null>(null);
  const [truckError, setTruckError] = useState<string | null>(null);
  const [trailerError, setTrailerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleTruckCount, setVisibleTruckCount] = useState(5);
  const [visibleTrailerCount, setVisibleTrailerCount] = useState(5);

  const loadData = async () => {
    try {
      const results = await Promise.allSettled([
        apiFetch<{ trucks: any[] }>("/admin/trucks"),
        apiFetch<{ trailers: any[] }>("/admin/trailers"),
      ]);
      const [trucksResult, trailersResult] = results;

      if (trucksResult.status === "fulfilled") setTrucks(trucksResult.value.trucks ?? []);
      if (trailersResult.status === "fulfilled") setTrailers(trailersResult.value.trailers ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Failed to load fleet.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetTruckForm = () => {
    setTruckForm({ unit: "", vin: "", plate: "", plateState: "", status: "", active: true });
    setEditingTruckId(null);
  };

  const saveTruck = async () => {
    try {
      setTruckError(null);
      const payload = { ...truckForm, active: Boolean(truckForm.active) };
      if (editingTruckId) {
        await apiFetch(`/admin/trucks/${editingTruckId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/trucks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      resetTruckForm();
      loadData();
    } catch (err) {
      setTruckError((err as Error).message || "Failed to save truck.");
    }
  };

  const editTruck = (truck: any) => {
    setEditingTruckId(truck.id);
    setTruckForm({
      unit: truck.unit ?? "",
      vin: truck.vin ?? "",
      plate: truck.plate ?? "",
      plateState: truck.plateState ?? "",
      status: truck.status ?? "",
      active: truck.active ?? true,
    });
  };

  const resetTrailerForm = () => {
    setTrailerForm({ unit: "", type: "", plate: "", plateState: "", status: "", active: true });
    setEditingTrailerId(null);
  };

  const saveTrailer = async () => {
    try {
      setTrailerError(null);
      const payload = { ...trailerForm, active: Boolean(trailerForm.active) };
      if (editingTrailerId) {
        await apiFetch(`/admin/trailers/${editingTrailerId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/trailers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      resetTrailerForm();
      loadData();
    } catch (err) {
      setTrailerError((err as Error).message || "Failed to save trailer.");
    }
  };

  const editTrailer = (trailer: any) => {
    setEditingTrailerId(trailer.id);
    setTrailerForm({
      unit: trailer.unit ?? "",
      type: trailer.type ?? "",
      plate: trailer.plate ?? "",
      plateState: trailer.plateState ?? "",
      status: trailer.status ?? "",
      active: trailer.active ?? true,
    });
  };

  const visibleTrucks = trucks.slice(0, visibleTruckCount);
  const visibleTrailers = trailers.slice(0, visibleTrailerCount);

  return (
    <AppShell title="Settings" hideHeader={true}>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <AdminSettingsShell
          title="Fleet"
          titleAlign="center"
          subtitle="Trucks, trailers, and bulk imports."
          backAction={
            <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full border border-[color:var(--color-divider)] bg-white/90 p-0" onClick={() => router.push("/admin")} aria-label="Back">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4L6 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          }
        >
          {error ? <ErrorBanner message={error} /> : null}

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Trucks</div>
            <div className="grid gap-2">
              {visibleTrucks.map((truck) => (
                <div key={truck.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/60 px-4 py-2">
                  <div>
                    <div className="font-semibold">{truck.unit}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {truck.vin ?? "VIN missing"} · {truck.plate ?? "No plate"} {truck.plateState ? `· ${truck.plateState}` : ""}
                    </div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {truck.status ?? "AVAILABLE"} · {truck.active ? "Active" : "Inactive"}
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => editTruck(truck)}>
                    Edit
                  </Button>
                </div>
              ))}
              {trucks.length === 0 ? <EmptyState title="No trucks yet." /> : null}
              {trucks.length > visibleTruckCount ? (
                <Button variant="ghost" size="sm" onClick={() => setVisibleTruckCount((prev) => prev + 5)}>
                  Load more
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Unit number" htmlFor="truckUnit" required>
                <Input
                  placeholder=""
                  value={truckForm.unit}
                  onChange={(e) => setTruckForm({ ...truckForm, unit: e.target.value })}
                />
              </FormField>
              <FormField label="VIN" htmlFor="truckVin" required>
                <Input
                  placeholder=""
                  value={truckForm.vin}
                  onChange={(e) => setTruckForm({ ...truckForm, vin: e.target.value })}
                />
              </FormField>
              <FormField label="Plate" htmlFor="truckPlate">
                <Input
                  placeholder=""
                  value={truckForm.plate}
                  onChange={(e) => setTruckForm({ ...truckForm, plate: e.target.value })}
                />
              </FormField>
              <FormField label="Plate state" htmlFor="truckPlateState">
                <Input
                  placeholder=""
                  value={truckForm.plateState}
                  onChange={(e) => setTruckForm({ ...truckForm, plateState: e.target.value })}
                />
              </FormField>
              <FormField label="Status" htmlFor="truckStatus">
                <Select
                  value={truckForm.status}
                  onChange={(e) => setTruckForm({ ...truckForm, status: e.target.value })}
                >
                  <option value="">Select status</option>
                  {TRUCK_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </Select>
              </FormField>
              <CheckboxField
                id="truckActive"
                label="Active"
                checked={truckForm.active}
                onChange={(e) => setTruckForm({ ...truckForm, active: e.target.checked })}
              />
            </div>
            {truckError ? <div className="text-sm text-[color:var(--color-danger)]">{truckError}</div> : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveTruck}>{editingTruckId ? "Update truck" : "Add truck"}</Button>
              {editingTruckId ? (
                <Button variant="secondary" onClick={resetTruckForm}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Trailers</div>
            <div className="grid gap-2">
              {visibleTrailers.map((trailer) => (
                <div key={trailer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/60 px-4 py-2">
                  <div>
                    <div className="font-semibold">{trailer.unit}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {trailer.type ?? "OTHER"} · {trailer.plate ?? "No plate"} {trailer.plateState ? `· ${trailer.plateState}` : ""}
                    </div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {trailer.status ?? "AVAILABLE"} · {trailer.active ? "Active" : "Inactive"}
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => editTrailer(trailer)}>
                    Edit
                  </Button>
                </div>
              ))}
              {trailers.length === 0 ? <EmptyState title="No trailers yet." /> : null}
              {trailers.length > visibleTrailerCount ? (
                <Button variant="ghost" size="sm" onClick={() => setVisibleTrailerCount((prev) => prev + 5)}>
                  Load more
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Unit number" htmlFor="trailerUnit" required>
                <Input
                  placeholder=""
                  value={trailerForm.unit}
                  onChange={(e) => setTrailerForm({ ...trailerForm, unit: e.target.value })}
                />
              </FormField>
              <FormField label="Trailer type" htmlFor="trailerType">
                <Select
                  value={trailerForm.type}
                  onChange={(e) => setTrailerForm({ ...trailerForm, type: e.target.value })}
                >
                  <option value="">Select type</option>
                  {TRAILER_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Plate" htmlFor="trailerPlate">
                <Input
                  placeholder=""
                  value={trailerForm.plate}
                  onChange={(e) => setTrailerForm({ ...trailerForm, plate: e.target.value })}
                />
              </FormField>
              <FormField label="Plate state" htmlFor="trailerPlateState">
                <Input
                  placeholder=""
                  value={trailerForm.plateState}
                  onChange={(e) => setTrailerForm({ ...trailerForm, plateState: e.target.value })}
                />
              </FormField>
              <FormField label="Status" htmlFor="trailerStatus">
                <Select
                  value={trailerForm.status}
                  onChange={(e) => setTrailerForm({ ...trailerForm, status: e.target.value })}
                >
                  <option value="">Select status</option>
                  {TRAILER_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </Select>
              </FormField>
              <CheckboxField
                id="trailerActive"
                label="Active"
                checked={trailerForm.active}
                onChange={(e) => setTrailerForm({ ...trailerForm, active: e.target.checked })}
              />
            </div>
            {trailerError ? <div className="text-sm text-[color:var(--color-danger)]">{trailerError}</div> : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveTrailer}>{editingTrailerId ? "Update trailer" : "Add trailer"}</Button>
              {editingTrailerId ? (
                <Button variant="secondary" onClick={resetTrailerForm}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </Card>

          <ImportWizard
            type="trucks"
            title="Bulk import trucks"
            description="Upload trucks.csv to create or update fleet trucks."
            templateCsv={TRUCK_TEMPLATE}
            onImported={() => loadData()}
          />

          <ImportWizard
            type="trailers"
            title="Bulk import trailers"
            description="Upload trailers.csv to create or update fleet trailers."
            templateCsv={TRAILER_TEMPLATE}
            onImported={() => loadData()}
          />
        </AdminSettingsShell>
      </RouteGuard>
    </AppShell>
  );
}
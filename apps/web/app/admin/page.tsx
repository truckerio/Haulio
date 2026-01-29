"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { RouteGuard } from "@/components/rbac/route-guard";
import { useUser } from "@/components/auth/user-context";
import { ErrorBanner } from "@/components/ui/error-banner";
import { apiFetch } from "@/lib/api";
import { ImportWizard } from "@/components/ImportWizard";

const DOC_TYPES = ["POD", "RATECON", "BOL", "LUMPER", "SCALE", "DETENTION", "OTHER"];
const DRIVER_DOC_TYPES = ["CDL", "MED_CARD", "MVR", "W9", "INSURANCE", "OTHER"];
const EMPLOYEE_TEMPLATE = "email,role,name,phone,timezone\n";
const DRIVER_TEMPLATE = "name,phone,license,payRatePerMile,licenseExpiresAt,medCardExpiresAt\n";
const TRUCK_TEMPLATE = "unit,vin,plate,plateState,status\n";
const TRAILER_TEMPLATE = "unit,type,plate,plateState,status\n";
const DRIVER_STATUS_OPTIONS = ["AVAILABLE", "ON_LOAD", "UNAVAILABLE"] as const;
const TRUCK_STATUS_OPTIONS = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"] as const;
const TRAILER_STATUS_OPTIONS = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"] as const;
const TRAILER_TYPE_OPTIONS = ["DRY_VAN", "REEFER", "FLATBED", "OTHER"] as const;

export default function AdminPage() {
  const { user } = useUser();
  const canAccess = Boolean(user && user.role === "ADMIN");
  const [settings, setSettings] = useState<any | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [showArchivedDrivers, setShowArchivedDrivers] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [operatingEntities, setOperatingEntities] = useState<any[]>([]);
  const [operatingForm, setOperatingForm] = useState({
    name: "",
    type: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    email: "",
    mcNumber: "",
    dotNumber: "",
    remitToName: "",
    remitToAddressLine1: "",
    remitToCity: "",
    remitToState: "",
    remitToZip: "",
    isDefault: false,
  });
  const [editingOperatingId, setEditingOperatingId] = useState<string | null>(null);
  const [samsaraStatus, setSamsaraStatus] = useState<any | null>(null);
  const [samsaraToken, setSamsaraToken] = useState("");
  const [truckMappings, setTruckMappings] = useState<any[]>([]);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [trailers, setTrailers] = useState<any[]>([]);
  const [mappingEdits, setMappingEdits] = useState<Record<string, string>>({});
  const [customerForm, setCustomerForm] = useState({
    name: "",
    billingEmail: "",
    billingPhone: "",
    remitToAddress: "",
    termsDays: "",
  });
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [driverForm, setDriverForm] = useState({
    name: "",
    email: "",
    phone: "",
    license: "",
    licenseState: "",
    licenseExpiresAt: "",
    medCardExpiresAt: "",
    payRatePerMile: "",
    password: "",
  });
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
  const [error, setError] = useState<string | null>(null);
  const [truckError, setTruckError] = useState<string | null>(null);
  const [trailerError, setTrailerError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [loadsFile, setLoadsFile] = useState<File | null>(null);
  const [stopsFile, setStopsFile] = useState<File | null>(null);
  const [wipeLoads, setWipeLoads] = useState(false);
  const [employeeImportResult, setEmployeeImportResult] = useState<any | null>(null);
  const [employeeInvites, setEmployeeInvites] = useState<any[]>([]);

  const loadSettings = async () => {
    try {
      const settingsData = await apiFetch<{ settings: any }>("/admin/settings");
      setSettings(settingsData.settings);
      setSettingsDraft(
        settingsData.settings
          ? {
              ...settingsData.settings,
              requiredDocs: settingsData.settings.requiredDocs ?? [],
              requiredDriverDocs: settingsData.settings.requiredDriverDocs ?? [],
            }
          : null
      );
      setError(null);
    } catch (err) {
      setSettings(null);
      setSettingsDraft(null);
      setError((err as Error).message || "Failed to load company settings.");
    }
  };

  const loadData = async () => {
    await loadSettings();
    const results = await Promise.allSettled([
      apiFetch<{ users: any[] }>("/admin/users"),
      apiFetch<{ drivers: any[] }>("/admin/drivers"),
      apiFetch<{ customers: any[] }>("/customers"),
      apiFetch<{ entities: any[] }>("/api/operating-entities"),
      apiFetch<{ integration: any }>("/api/integrations/samsara/status"),
      apiFetch<{ mappings: any[] }>("/api/integrations/samsara/truck-mappings"),
      apiFetch<{ trucks: any[] }>("/admin/trucks"),
      apiFetch<{ trailers: any[] }>("/admin/trailers"),
    ]);

    const [
      usersResult,
      driversResult,
      customersResult,
      entitiesResult,
      samsaraResult,
      mappingResult,
      trucksResult,
      trailersResult,
    ] = results;

    if (usersResult.status === "fulfilled") setUsers(usersResult.value.users);
    if (driversResult.status === "fulfilled") setDrivers(driversResult.value.drivers);
    if (customersResult.status === "fulfilled") {
      setCustomers(customersResult.value.customers);
    }
    if (entitiesResult.status === "fulfilled") {
      setOperatingEntities(entitiesResult.value.entities ?? []);
    }
    if (samsaraResult.status === "fulfilled") setSamsaraStatus(samsaraResult.value.integration ?? null);
    if (mappingResult.status === "fulfilled") setTruckMappings(mappingResult.value.mappings ?? []);
    if (trucksResult.status === "fulfilled") setTrucks(trucksResult.value.trucks ?? []);
    if (trailersResult.status === "fulfilled") setTrailers(trailersResult.value.trailers ?? []);
  };

  const generateEmployeeInvites = async () => {
    if (!employeeImportResult?.created?.length) return;
    const userIds = employeeImportResult.created.map((item: any) => item.id);
    const data = await apiFetch<{ invites: any[] }>("/users/invite-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    });
    setEmployeeInvites(data.invites ?? []);
  };

  const copyInviteLinks = async () => {
    if (employeeInvites.length === 0) return;
    const text = employeeInvites.map((invite) => `${invite.email}: ${invite.inviteUrl}`).join("\n");
    await navigator.clipboard.writeText(text);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!settingsDraft && settings) {
      setSettingsDraft({
        ...settings,
        requiredDocs: settings.requiredDocs ?? [],
        requiredDriverDocs: settings.requiredDriverDocs ?? [],
      });
    }
  }, [settings, settingsDraft]);

  useEffect(() => {
    const next: Record<string, string> = {};
    truckMappings.forEach((mapping) => {
      if (mapping.truckId && mapping.externalId) {
        next[mapping.truckId] = mapping.externalId;
      }
    });
    setMappingEdits((prev) => ({ ...next, ...prev }));
  }, [truckMappings]);

  const updateSettings = async () => {
    if (!settingsDraft) return;
    const payload = {
      ...settingsDraft,
      nextInvoiceNumber: Number(settingsDraft.nextInvoiceNumber || 0),
      podMinPages: Number(settingsDraft.podMinPages || 1),
      collectPodDueMinutes: Number(settingsDraft.collectPodDueMinutes || 0),
      missingPodAfterMinutes: Number(settingsDraft.missingPodAfterMinutes || 0),
      reminderFrequencyMinutes: Number(settingsDraft.reminderFrequencyMinutes || 0),
      freeStorageMinutes: Number(settingsDraft.freeStorageMinutes || 0),
      storageRatePerDay: Number(settingsDraft.storageRatePerDay || 0),
      pickupFreeDetentionMinutes: Number(settingsDraft.pickupFreeDetentionMinutes || 0),
      deliveryFreeDetentionMinutes: Number(settingsDraft.deliveryFreeDetentionMinutes || 0),
      detentionRatePerHour: settingsDraft.detentionRatePerHour ? Number(settingsDraft.detentionRatePerHour) : undefined,
      driverRatePerMile: Number(settingsDraft.driverRatePerMile || 0),
      invoiceTermsDays: settingsDraft.invoiceTermsDays ? Number(settingsDraft.invoiceTermsDays) : undefined,
    };
    await apiFetch("/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    loadSettings();
  };

  const saveCustomer = async () => {
    const payload = {
      name: customerForm.name,
      billingEmail: customerForm.billingEmail || undefined,
      billingPhone: customerForm.billingPhone || undefined,
      remitToAddress: customerForm.remitToAddress || undefined,
      termsDays: customerForm.termsDays ? Number(customerForm.termsDays) : undefined,
    };
    if (editingCustomerId) {
      await apiFetch(`/customers/${editingCustomerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch("/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setCustomerForm({ name: "", billingEmail: "", billingPhone: "", remitToAddress: "", termsDays: "" });
    setEditingCustomerId(null);
    loadData();
  };

  const createDriver = async () => {
    setError(null);
    try {
      await apiFetch("/admin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(driverForm),
      });
      setDriverForm({
        name: "",
        email: "",
        phone: "",
        license: "",
        licenseState: "",
        licenseExpiresAt: "",
        medCardExpiresAt: "",
        payRatePerMile: "",
        password: "",
      });
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleUserStatus = async (userId: string, isActive: boolean) => {
    if (!window.confirm(`${isActive ? "Deactivate" : "Reactivate"} this account?`)) return;
    const endpoint = isActive ? `/admin/users/${userId}/deactivate` : `/admin/users/${userId}/reactivate`;
    await apiFetch(endpoint, { method: "POST" });
    loadData();
  };

  const sendInvite = async (userId: string) => {
    const data = await apiFetch<{ invites: any[] }>("/users/invite-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [userId] }),
    });
    if (data.invites?.[0]?.inviteUrl) {
      await navigator.clipboard.writeText(data.invites[0].inviteUrl);
    }
  };

  const toggleDriverArchive = async (driverId: string, archivedAt?: string | null) => {
    const action = archivedAt ? "restore" : "archive";
    const confirmText = archivedAt ? "Restore this driver?" : "Archive this driver? They will be removed from dispatch lists.";
    if (!window.confirm(confirmText)) return;
    await apiFetch(`/admin/drivers/${driverId}/${action}`, { method: "POST" });
    loadData();
  };

  const updateDriverStatus = async (driverId: string, status: string) => {
    await apiFetch(`/admin/drivers/${driverId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadData();
  };

  const resetTruckForm = () => {
    setTruckForm({ unit: "", vin: "", plate: "", plateState: "", status: "", active: true });
    setEditingTruckId(null);
    setTruckError(null);
  };

  const saveTruck = async () => {
    setTruckError(null);
    const payload = {
      unit: truckForm.unit,
      vin: truckForm.vin,
      plate: truckForm.plate || undefined,
      plateState: truckForm.plateState || undefined,
      status: truckForm.status,
      active: truckForm.active,
    };
    try {
      if (editingTruckId) {
        await apiFetch(`/admin/trucks/${editingTruckId}`, {
          method: "PATCH",
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
      setTruckError((err as Error).message);
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
    setTrailerError(null);
  };

  const saveTrailer = async () => {
    setTrailerError(null);
    const payload = {
      unit: trailerForm.unit,
      type: trailerForm.type,
      plate: trailerForm.plate || undefined,
      plateState: trailerForm.plateState || undefined,
      status: trailerForm.status,
      active: trailerForm.active,
    };
    try {
      if (editingTrailerId) {
        await apiFetch(`/admin/trailers/${editingTrailerId}`, {
          method: "PATCH",
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
      setTrailerError((err as Error).message);
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

  const runImport = async () => {
    setImportError(null);
    setImportResult(null);
    if (!loadsFile || !stopsFile) {
      setImportError("Please upload both loads.csv and stops.csv.");
      return;
    }
    const body = new FormData();
    body.append("loads", loadsFile);
    body.append("stops", stopsFile);
    if (wipeLoads) {
      body.append("wipe", "true");
    }
    try {
      const data = await apiFetch<{
        createdLoads: number;
        skippedLoads: number;
        createdStops: number;
        skippedStops: number;
      }>("/admin/import/loads", { method: "POST", body });
      setImportResult(
        `Imported ${data.createdLoads} loads / ${data.createdStops} stops. Skipped ${data.skippedLoads} loads / ${data.skippedStops} stops.`
      );
      setLoadsFile(null);
      setStopsFile(null);
      setWipeLoads(false);
      loadData();
    } catch (err) {
      setImportError((err as Error).message);
    }
  };

  const resetOperatingForm = () => {
    setOperatingForm({
      name: "",
      type: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      email: "",
      mcNumber: "",
      dotNumber: "",
      remitToName: "",
      remitToAddressLine1: "",
      remitToCity: "",
      remitToState: "",
      remitToZip: "",
      isDefault: false,
    });
    setEditingOperatingId(null);
  };

  const saveOperatingEntity = async () => {
    const payload = { ...operatingForm };
    if (editingOperatingId) {
      await apiFetch(`/api/operating-entities/${editingOperatingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch("/api/operating-entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    resetOperatingForm();
    loadData();
  };

  const editOperatingEntity = (entity: any) => {
    setOperatingForm({
      name: entity.name ?? "",
      type: entity.type ?? "",
      addressLine1: entity.addressLine1 ?? "",
      addressLine2: entity.addressLine2 ?? "",
      city: entity.city ?? "",
      state: entity.state ?? "",
      zip: entity.zip ?? "",
      phone: entity.phone ?? "",
      email: entity.email ?? "",
      mcNumber: entity.mcNumber ?? "",
      dotNumber: entity.dotNumber ?? "",
      remitToName: entity.remitToName ?? "",
      remitToAddressLine1: entity.remitToAddressLine1 ?? "",
      remitToCity: entity.remitToCity ?? "",
      remitToState: entity.remitToState ?? "",
      remitToZip: entity.remitToZip ?? "",
      isDefault: entity.isDefault ?? false,
    });
    setEditingOperatingId(entity.id);
  };

  const makeDefaultEntity = async (entityId: string) => {
    await apiFetch(`/api/operating-entities/${entityId}/make-default`, { method: "POST" });
    loadData();
  };

  const connectSamsara = async () => {
    await apiFetch("/api/integrations/samsara/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiToken: samsaraToken }),
    });
    setSamsaraToken("");
    loadData();
  };

  const disconnectSamsara = async () => {
    await apiFetch("/api/integrations/samsara/disconnect", { method: "POST" });
    loadData();
  };

  const saveTruckMapping = async (truckId: string) => {
    await apiFetch("/api/integrations/samsara/map-truck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ truckId, externalId: mappingEdits[truckId] ?? "" }),
    });
    loadData();
  };

  return (
    <AppShell title="Admin Settings" subtitle="Users, roles, automation thresholds">
      <RouteGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        {error ? <ErrorBanner message={error} /> : null}
        <details open className="space-y-4">
          <summary className="cursor-pointer list-none rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3 text-sm font-semibold text-ink">
            Company
            <div className="text-xs text-[color:var(--color-text-muted)]">Identity, billing, and operating entities.</div>
          </summary>
          <div className="space-y-4">
            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Company</div>
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Company display name" htmlFor="companyDisplayName">
                  <Input
                    placeholder=""
                    value={settingsDraft?.companyDisplayName ?? ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, companyDisplayName: e.target.value })}
                  />
                </FormField>
                <FormField label="Invoice prefix" htmlFor="invoicePrefix">
                  <Input
                    placeholder=""
                    value={settingsDraft?.invoicePrefix ?? ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, invoicePrefix: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Next invoice number" htmlFor="nextInvoiceNumber">
                  <Input
                    placeholder=""
                    value={settingsDraft?.nextInvoiceNumber ? settingsDraft.nextInvoiceNumber : ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, nextInvoiceNumber: e.target.value })}
                  />
                </FormField>
                <FormField label="Invoice terms" htmlFor="invoiceTerms">
                  <Input
                    placeholder=""
                    value={settingsDraft?.invoiceTerms ?? ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, invoiceTerms: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Invoice terms days" htmlFor="invoiceTermsDays">
                  <Input
                    placeholder=""
                    value={settingsDraft?.invoiceTermsDays ?? ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, invoiceTermsDays: e.target.value })}
                  />
                </FormField>
                <FormField label="Timezone" htmlFor="timezone">
                  <Input
                    placeholder=""
                    value={settingsDraft?.timezone ?? ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, timezone: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Currency" htmlFor="currency">
                  <Select
                    value={settingsDraft?.currency ?? ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, currency: e.target.value })}
                  >
                    <option value="">Select currency</option>
                    <option value="USD">USD</option>
                    <option value="CAD">CAD</option>
                    <option value="SGD">SGD</option>
                    <option value="EUR">EUR</option>
                  </Select>
                </FormField>
                <FormField label="Operating mode" htmlFor="operatingMode">
                  <Select
                    value={settingsDraft?.operatingMode ?? ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, operatingMode: e.target.value })}
                  >
                    <option value="">Select mode</option>
                    <option value="CARRIER">Carrier</option>
                    <option value="BROKER">Broker</option>
                    <option value="BOTH">Carrier + Broker</option>
                  </Select>
                </FormField>
              </div>
              <FormField label="Remit-to address" htmlFor="remitToAddress">
                <Input
                  placeholder=""
                  value={settingsDraft?.remitToAddress ?? ""}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, remitToAddress: e.target.value })}
                />
              </FormField>
              <FormField label="Invoice footer" htmlFor="invoiceFooter" hint="Shown at the bottom of invoice PDFs">
                <Input
                  placeholder=""
                  value={settingsDraft?.invoiceFooter ?? ""}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, invoiceFooter: e.target.value })}
                />
              </FormField>
              <Button onClick={updateSettings}>Save settings</Button>
            </Card>

            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Operating entities</div>
              <div className="grid gap-3">
                {operatingEntities.map((entity) => (
                  <div key={entity.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold">{entity.name}</div>
                        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                          {entity.type} {entity.isDefault ? "· Default" : ""}
                        </div>
                        <div className="text-sm text-[color:var(--color-text-muted)]">{entity.addressLine1 ?? entity.remitToAddressLine1 ?? "-"}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => editOperatingEntity(entity)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={entity.isDefault}
                          onClick={() => makeDefaultEntity(entity.id)}
                        >
                          Make default
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {operatingEntities.length === 0 ? <EmptyState title="No operating entities yet." /> : null}
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Entity name" htmlFor="operatingEntityName" required>
                  <Input
                    placeholder=""
                    value={operatingForm.name}
                    onChange={(e) => setOperatingForm({ ...operatingForm, name: e.target.value })}
                  />
                </FormField>
                <FormField label="Entity type" htmlFor="operatingEntityType">
                  <Select
                    value={operatingForm.type}
                    onChange={(e) => setOperatingForm({ ...operatingForm, type: e.target.value })}
                  >
                    <option value="">Select type</option>
                    <option value="CARRIER">Carrier</option>
                    <option value="BROKER">Broker</option>
                  </Select>
                </FormField>
                <FormField label="Address line 1" htmlFor="operatingAddressLine1">
                  <Input
                    placeholder=""
                    value={operatingForm.addressLine1}
                    onChange={(e) => setOperatingForm({ ...operatingForm, addressLine1: e.target.value })}
                  />
                </FormField>
                <FormField label="Address line 2" htmlFor="operatingAddressLine2">
                  <Input
                    placeholder=""
                    value={operatingForm.addressLine2}
                    onChange={(e) => setOperatingForm({ ...operatingForm, addressLine2: e.target.value })}
                  />
                </FormField>
                <FormField label="City" htmlFor="operatingCity">
                  <Input
                    placeholder=""
                    value={operatingForm.city}
                    onChange={(e) => setOperatingForm({ ...operatingForm, city: e.target.value })}
                  />
                </FormField>
                <FormField label="State" htmlFor="operatingState">
                  <Input
                    placeholder=""
                    value={operatingForm.state}
                    onChange={(e) => setOperatingForm({ ...operatingForm, state: e.target.value })}
                  />
                </FormField>
                <FormField label="Zip" htmlFor="operatingZip">
                  <Input
                    placeholder=""
                    value={operatingForm.zip}
                    onChange={(e) => setOperatingForm({ ...operatingForm, zip: e.target.value })}
                  />
                </FormField>
                <FormField label="Phone" htmlFor="operatingPhone">
                  <Input
                    placeholder=""
                    value={operatingForm.phone}
                    onChange={(e) => setOperatingForm({ ...operatingForm, phone: e.target.value })}
                  />
                </FormField>
                <FormField label="Email" htmlFor="operatingEmail">
                  <Input
                    placeholder=""
                    value={operatingForm.email}
                    onChange={(e) => setOperatingForm({ ...operatingForm, email: e.target.value })}
                  />
                </FormField>
                <FormField label="MC number" htmlFor="operatingMcNumber">
                  <Input
                    placeholder=""
                    value={operatingForm.mcNumber}
                    onChange={(e) => setOperatingForm({ ...operatingForm, mcNumber: e.target.value })}
                  />
                </FormField>
                <FormField label="DOT number" htmlFor="operatingDotNumber">
                  <Input
                    placeholder=""
                    value={operatingForm.dotNumber}
                    onChange={(e) => setOperatingForm({ ...operatingForm, dotNumber: e.target.value })}
                  />
                </FormField>
                <FormField label="Remit-to name" htmlFor="remitToName">
                  <Input
                    placeholder=""
                    value={operatingForm.remitToName}
                    onChange={(e) => setOperatingForm({ ...operatingForm, remitToName: e.target.value })}
                  />
                </FormField>
                <FormField label="Remit-to address" htmlFor="remitToAddressLine1">
                  <Input
                    placeholder=""
                    value={operatingForm.remitToAddressLine1}
                    onChange={(e) => setOperatingForm({ ...operatingForm, remitToAddressLine1: e.target.value })}
                  />
                </FormField>
                <FormField label="Remit-to city" htmlFor="remitToCity">
                  <Input
                    placeholder=""
                    value={operatingForm.remitToCity}
                    onChange={(e) => setOperatingForm({ ...operatingForm, remitToCity: e.target.value })}
                  />
                </FormField>
                <FormField label="Remit-to state" htmlFor="remitToState">
                  <Input
                    placeholder=""
                    value={operatingForm.remitToState}
                    onChange={(e) => setOperatingForm({ ...operatingForm, remitToState: e.target.value })}
                  />
                </FormField>
                <FormField label="Remit-to zip" htmlFor="remitToZip">
                  <Input
                    placeholder=""
                    value={operatingForm.remitToZip}
                    onChange={(e) => setOperatingForm({ ...operatingForm, remitToZip: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveOperatingEntity}>{editingOperatingId ? "Update entity" : "Add entity"}</Button>
                {editingOperatingId ? (
                  <Button variant="secondary" onClick={resetOperatingForm}>
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Customers</div>
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Customer name" htmlFor="customerName" required>
                  <Input
                    placeholder=""
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                  />
                </FormField>
                <FormField label="Billing email" htmlFor="customerBillingEmail">
                  <Input
                    placeholder=""
                    value={customerForm.billingEmail}
                    onChange={(e) => setCustomerForm({ ...customerForm, billingEmail: e.target.value })}
                  />
                </FormField>
                <FormField label="Billing phone" htmlFor="customerBillingPhone">
                  <Input
                    placeholder=""
                    value={customerForm.billingPhone}
                    onChange={(e) => setCustomerForm({ ...customerForm, billingPhone: e.target.value })}
                  />
                </FormField>
                <FormField label="Terms days" htmlFor="customerTermsDays">
                  <Input
                    placeholder=""
                    value={customerForm.termsDays}
                    onChange={(e) => setCustomerForm({ ...customerForm, termsDays: e.target.value })}
                  />
                </FormField>
              </div>
              <FormField label="Remit-to address" htmlFor="customerRemitTo">
                <Input
                  placeholder=""
                  value={customerForm.remitToAddress}
                  onChange={(e) => setCustomerForm({ ...customerForm, remitToAddress: e.target.value })}
                />
              </FormField>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveCustomer}>{editingCustomerId ? "Update customer" : "Create customer"}</Button>
                {editingCustomerId ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingCustomerId(null);
                      setCustomerForm({ name: "", billingEmail: "", billingPhone: "", remitToAddress: "", termsDays: "" });
                    }}
                  >
                    Cancel edit
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-2">
                {customers.map((customer) => (
                  <div key={customer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/60 px-4 py-2">
                    <div>
                      <div className="font-semibold">{customer.name}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {customer.billingEmail ?? "No email"} · Terms {customer.termsDays ?? "-"}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditingCustomerId(customer.id);
                        setCustomerForm({
                          name: customer.name ?? "",
                          billingEmail: customer.billingEmail ?? "",
                          billingPhone: customer.billingPhone ?? "",
                          remitToAddress: customer.remitToAddress ?? "",
                          termsDays: customer.termsDays ? String(customer.termsDays) : "",
                        });
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                ))}
                {customers.length === 0 ? <EmptyState title="No customers yet." /> : null}
              </div>
            </Card>
          </div>
        </details>

        <details className="space-y-4">
          <summary className="cursor-pointer list-none rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3 text-sm font-semibold text-ink">
            Documents
            <div className="text-xs text-[color:var(--color-text-muted)]">POD rules and required document lists.</div>
          </summary>
          <div className="space-y-4">
            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">POD checklist</div>
              <div className="grid gap-3 lg:grid-cols-2">
                <CheckboxField
                  id="podRequireSignature"
                  label="Require signature"
                  checked={Boolean(settingsDraft?.podRequireSignature)}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, podRequireSignature: e.target.checked })}
                />
                <CheckboxField
                  id="podRequirePrintedName"
                  label="Require printed name"
                  checked={Boolean(settingsDraft?.podRequirePrintedName)}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, podRequirePrintedName: e.target.checked })}
                />
                <CheckboxField
                  id="podRequireDeliveryDate"
                  label="Require consignee date"
                  checked={Boolean(settingsDraft?.podRequireDeliveryDate)}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, podRequireDeliveryDate: e.target.checked })}
                />
                <FormField label="Minimum POD pages" htmlFor="podMinPages">
                  <Input
                    placeholder=""
                    value={settingsDraft?.podMinPages ? settingsDraft.podMinPages : ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, podMinPages: e.target.value })}
                  />
                </FormField>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Required docs</div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Invoice docs</div>
                  {DOC_TYPES.map((docType) => (
                    <CheckboxField
                      key={docType}
                      id={`requiredDoc-${docType}`}
                      label={docType}
                      checked={settingsDraft?.requiredDocs?.includes(docType) ?? false}
                      onChange={(e) => {
                        const current = settingsDraft?.requiredDocs ?? [];
                        const next = e.target.checked
                          ? [...current, docType]
                          : current.filter((item: string) => item !== docType);
                        setSettingsDraft({ ...settingsDraft, requiredDocs: next });
                      }}
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Driver docs</div>
                  {DRIVER_DOC_TYPES.map((docType) => (
                    <CheckboxField
                      key={docType}
                      id={`requiredDriverDoc-${docType}`}
                      label={docType}
                      checked={settingsDraft?.requiredDriverDocs?.includes(docType) ?? false}
                      onChange={(e) => {
                        const current = settingsDraft?.requiredDriverDocs ?? [];
                        const next = e.target.checked
                          ? [...current, docType]
                          : current.filter((item: string) => item !== docType);
                        setSettingsDraft({ ...settingsDraft, requiredDriverDocs: next });
                      }}
                    />
                  ))}
                </div>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Dispatch rules</div>
              <CheckboxField
                id="requireRateConBeforeDispatch"
                label="Require rate confirmation before dispatch"
                checked={Boolean(settingsDraft?.requireRateConBeforeDispatch)}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, requireRateConBeforeDispatch: e.target.checked })}
              />
            </Card>
          </div>
        </details>

        <details className="space-y-4">
          <summary className="cursor-pointer list-none rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3 text-sm font-semibold text-ink">
            Automation & Integrations
            <div className="text-xs text-[color:var(--color-text-muted)]">Ops reminders and telematics.</div>
          </summary>
          <div className="space-y-4">
            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Automation thresholds</div>
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Collect POD due (minutes)" htmlFor="collectPodDueMinutes">
                  <Input
                    placeholder=""
                    value={settingsDraft?.collectPodDueMinutes ? settingsDraft.collectPodDueMinutes : ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, collectPodDueMinutes: e.target.value })}
                  />
                </FormField>
                <FormField label="Missing POD after (minutes)" htmlFor="missingPodAfterMinutes">
                  <Input
                    placeholder=""
                    value={settingsDraft?.missingPodAfterMinutes ? settingsDraft.missingPodAfterMinutes : ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, missingPodAfterMinutes: e.target.value })}
                  />
                </FormField>
                <FormField label="Reminder frequency (minutes)" htmlFor="reminderFrequencyMinutes">
                  <Input
                    placeholder=""
                    value={settingsDraft?.reminderFrequencyMinutes ? settingsDraft.reminderFrequencyMinutes : ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, reminderFrequencyMinutes: e.target.value })}
                  />
                </FormField>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Driver pay</div>
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Rate per mile" htmlFor="driverRatePerMile">
                  <Input
                    placeholder=""
                    value={settingsDraft?.driverRatePerMile ? settingsDraft.driverRatePerMile : ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, driverRatePerMile: e.target.value })}
                  />
                </FormField>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Tracking preference</div>
              <FormField label="Primary tracking method" htmlFor="trackingPreference">
                <Select
                  value={settingsDraft?.trackingPreference ?? ""}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, trackingPreference: e.target.value })}
                >
                  <option value="">Select method</option>
                  <option value="MANUAL">Manual</option>
                  <option value="SAMSARA">Samsara</option>
                  <option value="MOTIVE">Motive</option>
                  <option value="OTHER">Other</option>
                </Select>
              </FormField>
            </Card>

            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Settlement defaults</div>
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Settlement schedule" htmlFor="settlementSchedule">
                  <Select
                    value={settingsDraft?.settlementSchedule ?? ""}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, settlementSchedule: e.target.value })}
                  >
                    <option value="">Select schedule</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="BIWEEKLY">Bi-weekly</option>
                    <option value="SEMI_MONTHLY">Semi-monthly</option>
                    <option value="MONTHLY">Monthly</option>
                  </Select>
                </FormField>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Pay statement template</div>
                  <CheckboxField
                    id="settlementTemplateLinehaul"
                    label="Include linehaul"
                    checked={Boolean(settingsDraft?.settlementTemplate?.includeLinehaul)}
                    onChange={(e) => {
                      const current = settingsDraft?.settlementTemplate ?? {};
                      setSettingsDraft({
                        ...settingsDraft,
                        settlementTemplate: { ...current, includeLinehaul: e.target.checked },
                      });
                    }}
                  />
                  <CheckboxField
                    id="settlementTemplateFuel"
                    label="Include fuel surcharge"
                    checked={Boolean(settingsDraft?.settlementTemplate?.includeFuelSurcharge)}
                    onChange={(e) => {
                      const current = settingsDraft?.settlementTemplate ?? {};
                      setSettingsDraft({
                        ...settingsDraft,
                        settlementTemplate: { ...current, includeFuelSurcharge: e.target.checked },
                      });
                    }}
                  />
                  <CheckboxField
                    id="settlementTemplateAccessorials"
                    label="Include accessorials"
                    checked={Boolean(settingsDraft?.settlementTemplate?.includeAccessorials)}
                    onChange={(e) => {
                      const current = settingsDraft?.settlementTemplate ?? {};
                      setSettingsDraft({
                        ...settingsDraft,
                        settlementTemplate: { ...current, includeAccessorials: e.target.checked },
                      });
                    }}
                  />
                </div>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Integrations</div>
              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Samsara</div>
                    <div className="text-sm text-[color:var(--color-text-muted)]">Status: {samsaraStatus?.status ?? "DISCONNECTED"}</div>
                    {samsaraStatus?.errorMessage ? (
                      <div className="text-xs text-[color:var(--color-danger)]">{samsaraStatus.errorMessage}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={disconnectSamsara}>
                      Disconnect
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-[1fr,auto]">
                  <FormField label="Samsara API token" htmlFor="samsaraToken">
                    <Input
                      placeholder=""
                      value={samsaraToken}
                      onChange={(e) => setSamsaraToken(e.target.value)}
                    />
                  </FormField>
                  <Button onClick={connectSamsara} disabled={!samsaraToken}>
                    Connect
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Truck mappings</div>
                <div className="grid gap-2">
                  {trucks.map((truck) => (
                    <div
                      key={truck.id}
                      className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-3 py-2"
                    >
                      <div className="text-sm font-semibold">{truck.unit}</div>
                      <FormField label="Samsara vehicle/device ID" htmlFor={`mapping-${truck.id}`}>
                        <Input
                          placeholder=""
                          value={mappingEdits[truck.id] ?? ""}
                          onChange={(e) => setMappingEdits({ ...mappingEdits, [truck.id]: e.target.value })}
                        />
                      </FormField>
                      <Button size="sm" variant="secondary" onClick={() => saveTruckMapping(truck.id)}>
                        Save
                      </Button>
                    </div>
                  ))}
                  {trucks.length === 0 ? <EmptyState title="No trucks available." /> : null}
                </div>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Bulk load import</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                Upload the CSV templates from <code>data/import</code>. Loads can include miles. Stops should follow the yard → yard → consignee pattern.
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Loads CSV" htmlFor="adminLoadsCsv">
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setLoadsFile(e.target.files?.[0] ?? null)}
                  />
                </FormField>
                <FormField label="Stops CSV" htmlFor="adminStopsCsv">
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setStopsFile(e.target.files?.[0] ?? null)}
                  />
                </FormField>
              </div>
              <CheckboxField
                id="wipeLoadsAdmin"
                label="Wipe existing loads before import"
                checked={wipeLoads}
                onChange={(e) => setWipeLoads(e.target.checked)}
              />
              {importError ? <div className="text-sm text-[color:var(--color-danger)]">{importError}</div> : null}
              {importResult ? <div className="text-sm text-[color:var(--color-success)]">{importResult}</div> : null}
              <Button onClick={runImport}>Import CSV</Button>
            </Card>
          </div>
        </details>

        <details className="space-y-4">
          <summary className="cursor-pointer list-none rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3 text-sm font-semibold text-ink">
            Fleet
            <div className="text-xs text-[color:var(--color-text-muted)]">Trucks, trailers, and bulk imports.</div>
          </summary>
          <div className="space-y-4">
            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Trucks</div>
              <div className="grid gap-2">
                {trucks.map((truck) => (
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
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Trailers</div>
              <div className="grid gap-2">
                {trailers.map((trailer) => (
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
          </div>
        </details>

        <details className="space-y-4">
          <summary className="cursor-pointer list-none rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3 text-sm font-semibold text-ink">
            Permissions & People
            <div className="text-xs text-[color:var(--color-text-muted)]">Users, drivers, and access controls.</div>
          </summary>
          <div className="space-y-4">
            <Card className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Create driver login</div>
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Driver name" htmlFor="driverName" required>
                  <Input
                    placeholder=""
                    value={driverForm.name}
                    onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
                  />
                </FormField>
                <FormField label="Driver email" htmlFor="driverEmail">
                  <Input
                    placeholder=""
                    value={driverForm.email}
                    onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })}
                  />
                </FormField>
                <FormField label="Phone" htmlFor="driverPhone">
                  <Input
                    placeholder=""
                    value={driverForm.phone}
                    onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
                  />
                </FormField>
                <FormField label="License" htmlFor="driverLicense">
                  <Input
                    placeholder=""
                    value={driverForm.license}
                    onChange={(e) => setDriverForm({ ...driverForm, license: e.target.value })}
                  />
                </FormField>
                <FormField label="License state" htmlFor="driverLicenseState">
                  <Input
                    placeholder=""
                    value={driverForm.licenseState}
                    onChange={(e) => setDriverForm({ ...driverForm, licenseState: e.target.value })}
                  />
                </FormField>
                <FormField label="License expires" htmlFor="driverLicenseExpires">
                  <Input
                    type="date"
                    value={driverForm.licenseExpiresAt}
                    onChange={(e) => setDriverForm({ ...driverForm, licenseExpiresAt: e.target.value })}
                  />
                </FormField>
                <FormField label="Med card expires" htmlFor="driverMedCardExpires">
                  <Input
                    type="date"
                    value={driverForm.medCardExpiresAt}
                    onChange={(e) => setDriverForm({ ...driverForm, medCardExpiresAt: e.target.value })}
                  />
                </FormField>
                <FormField label="Pay rate per mile" htmlFor="driverPayRate">
                  <Input
                    placeholder=""
                    value={driverForm.payRatePerMile}
                    onChange={(e) => setDriverForm({ ...driverForm, payRatePerMile: e.target.value })}
                  />
                </FormField>
                <FormField label="Temp password" htmlFor="driverTempPassword" hint="Share securely with the driver.">
                  <Input
                    placeholder=""
                    value={driverForm.password}
                    onChange={(e) => setDriverForm({ ...driverForm, password: e.target.value })}
                  />
                </FormField>
              </div>
              {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
              <Button onClick={createDriver}>Create driver</Button>
            </Card>

            <ImportWizard
              type="employees"
              title="Bulk import employees"
              description="Upload employees.csv to create dispatch and billing users (invite links generated after import)."
              templateCsv={EMPLOYEE_TEMPLATE}
              onImported={(result) => {
                setEmployeeImportResult(result);
                setEmployeeInvites([]);
                loadData();
              }}
            />
            {employeeImportResult?.created?.length ? (
              <Card className="space-y-3">
                <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Invite new employees</div>
                <div className="text-sm text-[color:var(--color-text-muted)]">
                  Generate one-time invite links for newly created accounts.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={generateEmployeeInvites}>Generate invites</Button>
                  {employeeInvites.length ? (
                    <Button variant="secondary" onClick={copyInviteLinks}>Copy all</Button>
                  ) : null}
                </div>
                {employeeInvites.length ? (
                  <div className="grid gap-2">
                    {employeeInvites.map((invite) => (
                      <div key={invite.userId} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-2 text-sm">
                        <div className="font-semibold">{invite.email}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">{invite.inviteUrl}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            ) : null}

            <ImportWizard
              type="drivers"
              title="Bulk import drivers"
              description="Upload drivers.csv to create or update driver records."
              templateCsv={DRIVER_TEMPLATE}
              onImported={() => loadData()}
            />

            <Card>
              <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Users</div>
              <div className="mt-3 grid gap-2">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/60 px-4 py-2">
                    <div>
                      <div className="font-semibold">{user.name ?? user.email}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {user.role} · {user.isActive ? "Active" : "Inactive"}
                      </div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {user.phone ?? "No phone"} · {user.timezone ?? "No timezone"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-xs text-[color:var(--color-text-muted)]">
                      <div>{user.email}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" size="sm" onClick={() => sendInvite(user.id)}>
                          Copy invite
                        </Button>
                        <Button
                          variant={user.isActive ? "secondary" : "primary"}
                          size="sm"
                          onClick={() => toggleUserStatus(user.id, user.isActive)}
                        >
                          {user.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Drivers</div>
                <CheckboxField
                  id="showArchivedDrivers"
                  label="Show archived"
                  checked={showArchivedDrivers}
                  onChange={(e) => setShowArchivedDrivers(e.target.checked)}
                />
              </div>
              <div className="mt-3 grid gap-2">
                {drivers
                  .filter((driver) => (showArchivedDrivers ? true : !driver.archivedAt))
                  .map((driver) => (
                  <div key={driver.id} className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/60 px-4 py-2">
                    <div>
                      <div className="font-semibold">{driver.name}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {driver.phone ?? "No phone"} · {driver.license ?? "No license"} ·{" "}
                        {driver.status ?? "AVAILABLE"} · {driver.archivedAt ? "Archived" : "Active"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-xs text-[color:var(--color-text-muted)]">
                      <div>{driver.user?.email ?? driver.userId ?? "Unlinked"}</div>
                      <Select
                        value={driver.status ?? "AVAILABLE"}
                        onChange={(e) => updateDriverStatus(driver.id, e.target.value)}
                      >
                        {DRIVER_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </Select>
                      <Button
                        variant={driver.archivedAt ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => toggleDriverArchive(driver.id, driver.archivedAt)}
                      >
                        {driver.archivedAt ? "Restore" : "Archive"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </details>
      </div>
      </RouteGuard>
    </AppShell>
  );
}

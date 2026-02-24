"use client";

import { useCallback, useEffect, useState } from "react";
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
import { getSaveButtonLabel } from "@/components/ui/save-feedback";
import { AdminSettingsShell } from "@/components/admin-settings/AdminSettingsShell";
import { apiFetch } from "@/lib/api";
import { useSaveFeedback } from "@/lib/use-save-feedback";

export default function CompanySettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<any | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<any | null>(null);
  const {
    saveState,
    startSaving: startSettingsSaving,
    markSaved: markSettingsSaved,
    resetSaveState: resetSettingsSaveState,
  } = useSaveFeedback(2000);
  const [sequence, setSequence] = useState<any | null>(null);
  const [sequenceDraft, setSequenceDraft] = useState<any | null>(null);
  const [sequenceError, setSequenceError] = useState<string | null>(null);
  const {
    saveState: sequenceSaveState,
    startSaving: startSequenceSaving,
    markSaved: markSequenceSaved,
    resetSaveState: resetSequenceSaveState,
  } = useSaveFeedback(2000);
  const [operatingEntities, setOperatingEntities] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
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
  const [customerForm, setCustomerForm] = useState({
    name: "",
    billingEmail: "",
    billingPhone: "",
    remitToAddress: "",
    termsDays: "",
  });
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [visibleEntityCount, setVisibleEntityCount] = useState(5);
  const [visibleCustomerCount, setVisibleCustomerCount] = useState(5);

  const loadSettings = useCallback(async () => {
    try {
      const settingsData = await apiFetch<{ settings: any }>("/admin/settings");
      setSettings(settingsData.settings ?? null);
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
  }, []);

  const loadSequences = useCallback(async () => {
    try {
      const data = await apiFetch<{ sequence: any }>("/admin/sequences");
      setSequence(data.sequence);
      setSequenceDraft(data.sequence);
      setSequenceError(null);
    } catch (err) {
      setSequence(null);
      setSequenceDraft(null);
      setSequenceError((err as Error).message || "Failed to load numbering settings.");
    }
  }, []);

  const loadData = useCallback(async () => {
    await loadSettings();
    await loadSequences();
    const results = await Promise.allSettled([
      apiFetch<{ customers: any[] }>("/customers"),
      apiFetch<{ entities: any[] }>("/api/operating-entities"),
    ]);
    const [customersResult, entitiesResult] = results;

    if (customersResult.status === "fulfilled") {
      setCustomers(customersResult.value.customers ?? []);
    }
    if (entitiesResult.status === "fulfilled") {
      setOperatingEntities(entitiesResult.value.entities ?? []);
    }
  }, [loadSequences, loadSettings]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    if (!sequenceDraft && sequence) {
      setSequenceDraft(sequence);
    }
  }, [sequence, sequenceDraft]);

  const updateSettings = async () => {
    if (!settingsDraft) return;
    startSettingsSaving();
    const toNumber = (value: any, fallback: number) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
    const toOptionalNumber = (value: any) => {
      if (value === undefined || value === null || value === "") return undefined;
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    };
    const currency =
      settingsDraft.currency && String(settingsDraft.currency).trim().length === 3
        ? String(settingsDraft.currency).toUpperCase()
        : undefined;
    const operatingMode = settingsDraft.operatingMode ? String(settingsDraft.operatingMode) : undefined;
    const trackingPreference = settingsDraft.trackingPreference ? String(settingsDraft.trackingPreference) : undefined;
    const settlementSchedule = settingsDraft.settlementSchedule ? String(settingsDraft.settlementSchedule) : undefined;
    const settlementTemplate = settingsDraft.settlementTemplate
      ? {
          includeLinehaul: Boolean(settingsDraft.settlementTemplate.includeLinehaul),
          includeFuelSurcharge: Boolean(settingsDraft.settlementTemplate.includeFuelSurcharge),
          includeAccessorials: Boolean(settingsDraft.settlementTemplate.includeAccessorials),
        }
      : undefined;
    const payload = {
      companyDisplayName: String(settingsDraft.companyDisplayName ?? ""),
      remitToAddress: String(settingsDraft.remitToAddress ?? ""),
      currency,
      operatingMode,
      invoiceTerms: String(settingsDraft.invoiceTerms ?? ""),
      invoiceTermsDays: toOptionalNumber(settingsDraft.invoiceTermsDays),
      invoiceFooter: String(settingsDraft.invoiceFooter ?? ""),
      invoicePrefix: String(settingsDraft.invoicePrefix ?? ""),
      nextInvoiceNumber: toNumber(settingsDraft.nextInvoiceNumber, 0),
      podRequireSignature: Boolean(settingsDraft.podRequireSignature),
      podRequirePrintedName: Boolean(settingsDraft.podRequirePrintedName),
      podRequireDeliveryDate: Boolean(settingsDraft.podRequireDeliveryDate),
      podMinPages: toNumber(settingsDraft.podMinPages, 1),
      requiredDocs: Array.isArray(settingsDraft.requiredDocs) ? settingsDraft.requiredDocs : [],
      requiredDriverDocs: Array.isArray(settingsDraft.requiredDriverDocs) ? settingsDraft.requiredDriverDocs : [],
      collectPodDueMinutes: toNumber(settingsDraft.collectPodDueMinutes, 0),
      missingPodAfterMinutes: toNumber(settingsDraft.missingPodAfterMinutes, 0),
      reminderFrequencyMinutes: toNumber(settingsDraft.reminderFrequencyMinutes, 0),
      requireRateConBeforeDispatch: Boolean(settingsDraft.requireRateConBeforeDispatch),
      trackingPreference,
      settlementSchedule,
      settlementTemplate,
      timezone: settingsDraft.timezone ? String(settingsDraft.timezone) : undefined,
      freeStorageMinutes: toNumber(settingsDraft.freeStorageMinutes, 0),
      storageRatePerDay: String(settingsDraft.storageRatePerDay ?? "0"),
      pickupFreeDetentionMinutes: toNumber(settingsDraft.pickupFreeDetentionMinutes, 0),
      deliveryFreeDetentionMinutes: toNumber(settingsDraft.deliveryFreeDetentionMinutes, 0),
      detentionRatePerHour:
        settingsDraft.detentionRatePerHour !== undefined && settingsDraft.detentionRatePerHour !== null
          ? String(settingsDraft.detentionRatePerHour)
          : undefined,
      driverRatePerMile: String(settingsDraft.driverRatePerMile ?? "0"),
      logoUrl: settingsDraft.logoUrl ? String(settingsDraft.logoUrl) : undefined,
    };
    try {
      await apiFetch("/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadSettings();
      markSettingsSaved();
    } catch (err) {
      resetSettingsSaveState();
      setError((err as Error).message || "Failed to save settings.");
    }
  };

  const updateSequences = async () => {
    if (!sequenceDraft) return;
    startSequenceSaving();
    setSequenceError(null);
    try {
      const payload = {
        loadPrefix: sequenceDraft.loadPrefix ?? "",
        tripPrefix: sequenceDraft.tripPrefix ?? "",
        nextLoadNumber: Number(sequenceDraft.nextLoadNumber || 0),
        nextTripNumber: Number(sequenceDraft.nextTripNumber || 0),
      };
      const data = await apiFetch<{ sequence: any }>("/admin/sequences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSequence(data.sequence);
      setSequenceDraft(data.sequence);
      markSequenceSaved();
    } catch (err) {
      resetSequenceSaveState();
      setSequenceError((err as Error).message || "Failed to update numbering settings.");
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
    try {
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
      await loadData();
    } catch (err) {
      setError((err as Error).message || "Failed to save operating entity.");
    }
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
    try {
      await apiFetch(`/api/operating-entities/${entityId}/make-default`, { method: "POST" });
      await loadData();
    } catch (err) {
      setError((err as Error).message || "Failed to update default operating entity.");
    }
  };

  const saveCustomer = async () => {
    const payload = {
      name: customerForm.name,
      billingEmail: customerForm.billingEmail,
      billingPhone: customerForm.billingPhone,
      remitToAddress: customerForm.remitToAddress,
      termsDays: customerForm.termsDays ? Number(customerForm.termsDays) : null,
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
    setEditingCustomerId(null);
    setCustomerForm({ name: "", billingEmail: "", billingPhone: "", remitToAddress: "", termsDays: "" });
    loadData();
  };

  const visibleEntities = operatingEntities.slice(0, visibleEntityCount);
  const visibleCustomers = customers.slice(0, visibleCustomerCount);

  return (
    <AppShell title="Settings" hideHeader={true}>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <AdminSettingsShell
          title="Company"
          subtitle="Identity, billing, and operating entities."
          titleAlign="center"
          backAction={
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-full border border-[color:var(--color-divider)] bg-white/90 p-0"
              onClick={() => router.push("/admin")}
              aria-label="Back"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4L6 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          }
        >
          {error ? <ErrorBanner message={error} /> : null}

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Company</div>
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
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Invoice remit-to name" htmlFor="invoiceRemitToName">
                <Input
                  placeholder=""
                  value={settingsDraft?.invoiceRemitToName ?? ""}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, invoiceRemitToName: e.target.value })}
                />
              </FormField>
              <FormField label="Invoice remit-to address" htmlFor="invoiceRemitToAddress">
                <Input
                  placeholder=""
                  value={settingsDraft?.invoiceRemitToAddress ?? ""}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, invoiceRemitToAddress: e.target.value })}
                />
              </FormField>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={updateSettings} disabled={saveState === "saving"}>
                {getSaveButtonLabel(saveState)}
              </Button>
              <Button variant="secondary" onClick={() => setSettingsDraft(settings)}>
                Reset
              </Button>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Numbering</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Load number prefix" htmlFor="loadPrefix">
                <Input
                  placeholder=""
                  value={sequenceDraft?.loadPrefix ?? ""}
                  onChange={(e) => setSequenceDraft({ ...sequenceDraft, loadPrefix: e.target.value })}
                />
              </FormField>
              <FormField label="Next load number" htmlFor="nextLoadNumber">
                <Input
                  placeholder=""
                  value={sequenceDraft?.nextLoadNumber ? sequenceDraft.nextLoadNumber : ""}
                  onChange={(e) => setSequenceDraft({ ...sequenceDraft, nextLoadNumber: e.target.value })}
                />
              </FormField>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={updateSequences} disabled={sequenceSaveState === "saving"}>
                {getSaveButtonLabel(sequenceSaveState)}
              </Button>
              {sequenceError ? <div className="text-sm text-[color:var(--color-danger)]">{sequenceError}</div> : null}
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Operating entities</div>
            <div className="grid gap-3">
              {visibleEntities.map((entity) => (
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
              {operatingEntities.length > visibleEntityCount ? (
                <Button variant="ghost" size="sm" onClick={() => setVisibleEntityCount((prev) => prev + 5)}>
                  Load more
                </Button>
              ) : null}
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
              <FormField label="Postal code" htmlFor="operatingZip">
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
              <FormField label="Remit-to name" htmlFor="operatingRemitToName">
                <Input
                  placeholder=""
                  value={operatingForm.remitToName}
                  onChange={(e) => setOperatingForm({ ...operatingForm, remitToName: e.target.value })}
                />
              </FormField>
              <FormField label="Remit-to address" htmlFor="operatingRemitToAddress">
                <Input
                  placeholder=""
                  value={operatingForm.remitToAddressLine1}
                  onChange={(e) => setOperatingForm({ ...operatingForm, remitToAddressLine1: e.target.value })}
                />
              </FormField>
              <FormField label="Remit-to city" htmlFor="operatingRemitToCity">
                <Input
                  placeholder=""
                  value={operatingForm.remitToCity}
                  onChange={(e) => setOperatingForm({ ...operatingForm, remitToCity: e.target.value })}
                />
              </FormField>
              <FormField label="Remit-to state" htmlFor="operatingRemitToState">
                <Input
                  placeholder=""
                  value={operatingForm.remitToState}
                  onChange={(e) => setOperatingForm({ ...operatingForm, remitToState: e.target.value })}
                />
              </FormField>
              <FormField label="Remit-to postal code" htmlFor="operatingRemitToZip">
                <Input
                  placeholder=""
                  value={operatingForm.remitToZip}
                  onChange={(e) => setOperatingForm({ ...operatingForm, remitToZip: e.target.value })}
                />
              </FormField>
              <CheckboxField
                id="operatingDefault"
                label="Default entity"
                checked={operatingForm.isDefault}
                onChange={(e) => setOperatingForm({ ...operatingForm, isDefault: e.target.checked })}
              />
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
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Customers</div>
            <div className="grid gap-2">
              {visibleCustomers.map((customer) => (
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
              {customers.length > visibleCustomerCount ? (
                <Button variant="ghost" size="sm" onClick={() => setVisibleCustomerCount((prev) => prev + 5)}>
                  Load more
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Customer name" htmlFor="customerName">
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
              <FormField label="Remit-to address" htmlFor="customerRemitToAddress">
                <Input
                  placeholder=""
                  value={customerForm.remitToAddress}
                  onChange={(e) => setCustomerForm({ ...customerForm, remitToAddress: e.target.value })}
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
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveCustomer}>{editingCustomerId ? "Update customer" : "Add customer"}</Button>
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
          </Card>
        </AdminSettingsShell>
      </RouteGuard>
    </AppShell>
  );
}

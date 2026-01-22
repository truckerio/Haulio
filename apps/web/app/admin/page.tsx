"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { ImportWizard } from "@/components/ImportWizard";

const DOC_TYPES = ["POD", "RATECON", "BOL", "LUMPER", "SCALE", "DETENTION", "OTHER"];
const DRIVER_DOC_TYPES = ["CDL", "MED_CARD", "MVR", "W9", "INSURANCE", "OTHER"];
const EMPLOYEE_TEMPLATE = "email,role,name,phone,timezone\n";
const DRIVER_TEMPLATE = "name,phone,license,payRatePerMile,licenseExpiresAt,medCardExpiresAt\n";

export default function AdminPage() {
  const [settings, setSettings] = useState<any | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
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
    password: "password123",
  });
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [loadsFile, setLoadsFile] = useState<File | null>(null);
  const [stopsFile, setStopsFile] = useState<File | null>(null);
  const [wipeLoads, setWipeLoads] = useState(false);
  const [employeeImportResult, setEmployeeImportResult] = useState<any | null>(null);
  const [employeeInvites, setEmployeeInvites] = useState<any[]>([]);

  const loadData = async () => {
    const [settingsData, usersData, driversData, customersData] = await Promise.all([
      apiFetch<{ settings: any }>("/admin/settings"),
      apiFetch<{ users: any[] }>("/admin/users"),
      apiFetch<{ drivers: any[] }>("/assets/drivers"),
      apiFetch<{ customers: any[] }>("/customers"),
    ]);
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
    setUsers(usersData.users);
    setDrivers(driversData.drivers);
    setCustomers(customersData.customers);
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
    loadData();
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
        password: "password123",
      });
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
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

  return (
    <AppShell title="Admin Settings" subtitle="Users, roles, automation thresholds">
      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-widest text-black/50">Company</div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            placeholder="Company display name"
            value={settingsDraft?.companyDisplayName ?? ""}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, companyDisplayName: e.target.value })}
          />
          <Input
            placeholder="Invoice prefix"
            value={settingsDraft?.invoicePrefix ?? ""}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, invoicePrefix: e.target.value })}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            placeholder="Next invoice number"
            value={settingsDraft?.nextInvoiceNumber ?? 0}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, nextInvoiceNumber: e.target.value })}
          />
          <Input
            placeholder="Invoice terms"
            value={settingsDraft?.invoiceTerms ?? ""}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, invoiceTerms: e.target.value })}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            placeholder="Invoice terms days"
            value={settingsDraft?.invoiceTermsDays ?? ""}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, invoiceTermsDays: e.target.value })}
          />
          <Input
            placeholder="Timezone"
            value={settingsDraft?.timezone ?? ""}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, timezone: e.target.value })}
          />
        </div>
        <Input
          placeholder="Remit-to address"
          value={settingsDraft?.remitToAddress ?? ""}
          onChange={(e) => setSettingsDraft({ ...settingsDraft, remitToAddress: e.target.value })}
        />
        <Input
          placeholder="Invoice footer"
          value={settingsDraft?.invoiceFooter ?? ""}
          onChange={(e) => setSettingsDraft({ ...settingsDraft, invoiceFooter: e.target.value })}
        />
      </Card>

      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-widest text-black/50">POD checklist</div>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(settingsDraft?.podRequireSignature)}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, podRequireSignature: e.target.checked })}
            />
            Require signature
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(settingsDraft?.podRequirePrintedName)}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, podRequirePrintedName: e.target.checked })}
            />
            Require printed name
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(settingsDraft?.podRequireDeliveryDate)}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, podRequireDeliveryDate: e.target.checked })}
            />
            Require delivery date
          </label>
          <Input
            placeholder="Minimum POD pages"
            value={settingsDraft?.podMinPages ?? 1}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, podMinPages: e.target.value })}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-widest text-black/50">Required docs</div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-black/40">Invoice docs</div>
            {DOC_TYPES.map((docType) => (
              <label key={docType} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settingsDraft?.requiredDocs?.includes(docType) ?? false}
                  onChange={(e) => {
                    const current = settingsDraft?.requiredDocs ?? [];
                    const next = e.target.checked
                      ? [...current, docType]
                      : current.filter((item: string) => item !== docType);
                    setSettingsDraft({ ...settingsDraft, requiredDocs: next });
                  }}
                />
                {docType}
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-black/40">Driver docs</div>
            {DRIVER_DOC_TYPES.map((docType) => (
              <label key={docType} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settingsDraft?.requiredDriverDocs?.includes(docType) ?? false}
                  onChange={(e) => {
                    const current = settingsDraft?.requiredDriverDocs ?? [];
                    const next = e.target.checked
                      ? [...current, docType]
                      : current.filter((item: string) => item !== docType);
                    setSettingsDraft({ ...settingsDraft, requiredDriverDocs: next });
                  }}
                />
                {docType}
              </label>
            ))}
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-widest text-black/50">Automation thresholds</div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            placeholder="Collect POD due (minutes)"
            value={settingsDraft?.collectPodDueMinutes ?? 0}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, collectPodDueMinutes: e.target.value })}
          />
          <Input
            placeholder="Missing POD after (minutes)"
            value={settingsDraft?.missingPodAfterMinutes ?? 0}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, missingPodAfterMinutes: e.target.value })}
          />
          <Input
            placeholder="Reminder frequency (minutes)"
            value={settingsDraft?.reminderFrequencyMinutes ?? 0}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, reminderFrequencyMinutes: e.target.value })}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-widest text-black/50">Storage charges</div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            placeholder="Free storage minutes"
            value={settingsDraft?.freeStorageMinutes ?? 0}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, freeStorageMinutes: e.target.value })}
          />
          <Input
            placeholder="Rate per day"
            value={settingsDraft?.storageRatePerDay ?? 0}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, storageRatePerDay: e.target.value })}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            placeholder="Pickup free detention (minutes)"
            value={settingsDraft?.pickupFreeDetentionMinutes ?? 120}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, pickupFreeDetentionMinutes: e.target.value })}
          />
          <Input
            placeholder="Delivery free detention (minutes)"
            value={settingsDraft?.deliveryFreeDetentionMinutes ?? 120}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, deliveryFreeDetentionMinutes: e.target.value })}
          />
        </div>
        <Input
          placeholder="Detention rate per hour"
          value={settingsDraft?.detentionRatePerHour ?? ""}
          onChange={(e) => setSettingsDraft({ ...settingsDraft, detentionRatePerHour: e.target.value })}
        />
      </Card>

      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-widest text-black/50">Driver pay</div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            placeholder="Rate per mile"
            value={settingsDraft?.driverRatePerMile ?? 0}
            onChange={(e) => setSettingsDraft({ ...settingsDraft, driverRatePerMile: e.target.value })}
          />
        </div>
        <Button onClick={updateSettings}>Save settings</Button>
      </Card>

      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-widest text-black/50">Create driver login</div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            placeholder="Driver name"
            value={driverForm.name}
            onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
          />
          <Input
            placeholder="Driver email"
            value={driverForm.email}
            onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })}
          />
          <Input
            placeholder="Phone"
            value={driverForm.phone}
            onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
          />
          <Input
            placeholder="License"
            value={driverForm.license}
            onChange={(e) => setDriverForm({ ...driverForm, license: e.target.value })}
          />
          <Input
            placeholder="License state"
            value={driverForm.licenseState}
            onChange={(e) => setDriverForm({ ...driverForm, licenseState: e.target.value })}
          />
          <Input
            type="date"
            placeholder="License expires"
            value={driverForm.licenseExpiresAt}
            onChange={(e) => setDriverForm({ ...driverForm, licenseExpiresAt: e.target.value })}
          />
          <Input
            type="date"
            placeholder="Med card expires"
            value={driverForm.medCardExpiresAt}
            onChange={(e) => setDriverForm({ ...driverForm, medCardExpiresAt: e.target.value })}
          />
          <Input
            placeholder="Pay rate per mile"
            value={driverForm.payRatePerMile}
            onChange={(e) => setDriverForm({ ...driverForm, payRatePerMile: e.target.value })}
          />
          <Input
            placeholder="Temp password"
            value={driverForm.password}
            onChange={(e) => setDriverForm({ ...driverForm, password: e.target.value })}
          />
        </div>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        <Button onClick={createDriver}>Create driver</Button>
      </Card>

      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-widest text-black/50">Bulk load import</div>
        <div className="text-sm text-black/60">
          Upload the CSV templates from <code>data/import</code>. Loads can include miles. Stops should follow the yard → yard → delivery pattern.
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="text-sm">
            Loads CSV
            <input
              type="file"
              accept=".csv"
              className="mt-2 block w-full text-sm"
              onChange={(e) => setLoadsFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="text-sm">
            Stops CSV
            <input
              type="file"
              accept=".csv"
              className="mt-2 block w-full text-sm"
              onChange={(e) => setStopsFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={wipeLoads} onChange={(e) => setWipeLoads(e.target.checked)} />
          Wipe existing loads before import
        </label>
        {importError ? <div className="text-sm text-red-600">{importError}</div> : null}
        {importResult ? <div className="text-sm text-emerald-700">{importResult}</div> : null}
        <Button onClick={runImport}>Import CSV</Button>
      </Card>

      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-widest text-black/50">Customers</div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            placeholder="Customer name"
            value={customerForm.name}
            onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
          />
          <Input
            placeholder="Billing email"
            value={customerForm.billingEmail}
            onChange={(e) => setCustomerForm({ ...customerForm, billingEmail: e.target.value })}
          />
          <Input
            placeholder="Billing phone"
            value={customerForm.billingPhone}
            onChange={(e) => setCustomerForm({ ...customerForm, billingPhone: e.target.value })}
          />
          <Input
            placeholder="Terms days"
            value={customerForm.termsDays}
            onChange={(e) => setCustomerForm({ ...customerForm, termsDays: e.target.value })}
          />
        </div>
        <Input
          placeholder="Remit-to address"
          value={customerForm.remitToAddress}
          onChange={(e) => setCustomerForm({ ...customerForm, remitToAddress: e.target.value })}
        />
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
            <div key={customer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-white/60 px-4 py-2">
              <div>
                <div className="font-semibold">{customer.name}</div>
                <div className="text-xs text-black/60">
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
          {customers.length === 0 ? <div className="text-sm text-black/60">No customers yet.</div> : null}
        </div>
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
          <div className="text-sm uppercase tracking-widest text-black/50">Invite new employees</div>
          <div className="text-sm text-black/60">
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
                <div key={invite.userId} className="rounded-2xl border border-black/10 bg-white/70 px-4 py-2 text-sm">
                  <div className="font-semibold">{invite.email}</div>
                  <div className="text-xs text-black/60">{invite.inviteUrl}</div>
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
        <div className="text-sm uppercase tracking-widest text-black/50">Users</div>
        <div className="mt-3 grid gap-2">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between rounded-2xl border border-black/10 bg-white/60 px-4 py-2">
              <div>
                <div className="font-semibold">{user.name ?? user.email}</div>
                <div className="text-xs text-black/60">{user.role}</div>
              </div>
              <div className="text-xs text-black/50">{user.email}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="text-sm uppercase tracking-widest text-black/50">Drivers</div>
        <div className="mt-3 grid gap-2">
          {drivers.map((driver) => (
            <div key={driver.id} className="flex items-center justify-between rounded-2xl border border-black/10 bg-white/60 px-4 py-2">
              <div>
                <div className="font-semibold">{driver.name}</div>
                <div className="text-xs text-black/60">{driver.phone ?? "No phone"}</div>
              </div>
              <div className="text-xs text-black/50">{driver.userId ?? "Unlinked"}</div>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}

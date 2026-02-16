"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/rbac/route-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ImportWizard } from "@/components/ImportWizard";
import { apiFetch } from "@/lib/api";

type OnboardingState = {
  completedSteps: string[];
  percentComplete: number;
  currentStep: number;
  completedAt?: string | null;
  status?: "NOT_ACTIVATED" | "OPERATIONAL";
};

const STEPS = [
  {
    key: "basics",
    title: "Company basics",
    subtitle: "Legal identity, timezone, and currency.",
  },
  {
    key: "operating",
    title: "Operating entities",
    subtitle: "Add carriers or broker entities as needed.",
  },
  {
    key: "team",
    title: "Invite team",
    subtitle: "Create dispatcher and billing access.",
  },
  {
    key: "drivers",
    title: "Drivers",
    subtitle: "Add drivers or import quickly.",
  },
  {
    key: "fleet",
    title: "Fleet",
    subtitle: "Register trucks and trailers.",
  },
  {
    key: "preferences",
    title: "Document rules",
    subtitle: "POD and rate confirmation requirements.",
  },
  {
    key: "tracking",
    title: "Tracking",
    subtitle: "Choose your preferred tracking method.",
  },
  {
    key: "finance",
    title: "Finance defaults",
    subtitle: "Settle drivers on a steady cadence.",
  },
] as const;

const DOC_TYPES = ["POD"] as const;

function OnboardingWizard() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<any | null>(null);
  const [entities, setEntities] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [trailers, setTrailers] = useState<any[]>([]);

  const [basicsForm, setBasicsForm] = useState({
    legalName: "",
    displayName: "",
    timezone: "",
    currency: "",
    operatingMode: "",
    dotNumber: "",
    mcNumber: "",
  });

  const [entityForm, setEntityForm] = useState({
    name: "",
    type: "",
    addressLine1: "",
    city: "",
    state: "",
    zip: "",
    dotNumber: "",
    mcNumber: "",
  });

  const [teamForm, setTeamForm] = useState({
    email: "",
    name: "",
    role: "",
    password: "",
  });

  const [driverForm, setDriverForm] = useState({
    name: "",
    email: "",
    phone: "",
    license: "",
    licenseState: "",
    payRatePerMile: "",
    password: "",
  });

  const [truckForm, setTruckForm] = useState({
    unit: "",
    vin: "",
    plate: "",
    plateState: "",
    status: "",
  });

  const [trailerForm, setTrailerForm] = useState({
    unit: "",
    type: "",
    plate: "",
    plateState: "",
    status: "",
  });

  const [preferences, setPreferences] = useState({
    requirePod: true,
    requireRateCon: false,
  });

  const [trackingChoice, setTrackingChoice] = useState("MANUAL");

  const [financeForm, setFinanceForm] = useState({
    settlementSchedule: "WEEKLY",
    includeLinehaul: true,
    includeFuelSurcharge: false,
    includeAccessorials: false,
  });

  const progress = state?.percentComplete ?? Math.round(((currentStep - 1) / STEPS.length) * 100);
  const current = STEPS[currentStep - 1];

  const completedSteps = new Set(state?.completedSteps ?? []);
  const detectedTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return "";
    }
  }, []);

  const loadOnboarding = useCallback(async () => {
    setLoading(true);
    try {
      const [stateData, settingsData, entitiesData, usersData, driversData, trucksData, trailersData] =
        await Promise.all([
          apiFetch<{ state: OnboardingState }>("/onboarding/state"),
          apiFetch<{ settings: any }>("/admin/settings"),
          apiFetch<{ entities: any[] }>("/api/operating-entities"),
          apiFetch<{ users: any[] }>("/admin/users"),
          apiFetch<{ drivers: any[] }>("/admin/drivers"),
          apiFetch<{ trucks: any[] }>("/admin/trucks"),
          apiFetch<{ trailers: any[] }>("/admin/trailers"),
        ]);
      setState(stateData.state);
      setCurrentStep(stateData.state.currentStep ?? 1);
      setSettings(settingsData.settings);
      setEntities(entitiesData.entities ?? []);
      setUsers(usersData.users ?? []);
      setDrivers(driversData.drivers ?? []);
      setTrucks(trucksData.trucks ?? []);
      setTrailers(trailersData.trailers ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOnboarding();
  }, [loadOnboarding]);

  useEffect(() => {
    if (!settings) return;
    const defaultEntity = entities.find((entity) => entity.isDefault) ?? entities[0];
    setBasicsForm((prev) => ({
      ...prev,
      legalName: prev.legalName || settings.companyDisplayName || "",
      displayName: prev.displayName || settings.companyDisplayName || "",
      timezone: prev.timezone || settings.timezone || detectedTimezone || "",
      currency: prev.currency || settings.currency || "USD",
      operatingMode: prev.operatingMode || settings.operatingMode || "CARRIER",
      dotNumber: prev.dotNumber || defaultEntity?.dotNumber || "",
      mcNumber: prev.mcNumber || defaultEntity?.mcNumber || "",
    }));
    setPreferences((prev) => ({
      ...prev,
      requirePod: settings.requiredDocs?.includes("POD") ?? prev.requirePod,
      requireRateCon: settings.requireRateConBeforeDispatch ?? prev.requireRateCon,
    }));
    setTrackingChoice(settings.trackingPreference ?? "MANUAL");
    setFinanceForm((prev) => ({
      ...prev,
      settlementSchedule: settings.settlementSchedule ?? prev.settlementSchedule,
      includeLinehaul: settings.settlementTemplate?.includeLinehaul ?? prev.includeLinehaul,
      includeFuelSurcharge: settings.settlementTemplate?.includeFuelSurcharge ?? prev.includeFuelSurcharge,
      includeAccessorials: settings.settlementTemplate?.includeAccessorials ?? prev.includeAccessorials,
    }));
  }, [settings, entities, detectedTimezone]);

  const markStepComplete = async (stepKey: string, nextStep?: number) => {
    const data = await apiFetch<{ state: OnboardingState }>("/onboarding/complete-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: stepKey, currentStep: nextStep }),
    });
    setState(data.state);
  };

  const handleNext = async () => {
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      if (current.key === "basics") {
        const payload = {
          legalName: basicsForm.legalName,
          displayName: basicsForm.displayName || undefined,
          timezone: basicsForm.timezone || undefined,
          currency: basicsForm.currency,
          operatingMode: basicsForm.operatingMode,
          dotNumber: basicsForm.dotNumber || undefined,
          mcNumber: basicsForm.mcNumber || undefined,
        };
        const data = await apiFetch<{ state: OnboardingState; settings?: any; operatingEntity?: any }>("/onboarding/basics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setState(data.state);
        if (data.settings) {
          setSettings(data.settings);
        }
        if (data.operatingEntity) {
          setEntities((prev) => {
            const existingIndex = prev.findIndex((entity) => entity.id === data.operatingEntity.id);
            if (existingIndex >= 0) {
              const next = [...prev];
              next[existingIndex] = data.operatingEntity;
              return next;
            }
            return [...prev, data.operatingEntity];
          });
        }
      } else if (current.key === "operating") {
        await markStepComplete("operating", currentStep + 1);
      } else if (current.key === "team") {
        await markStepComplete("team", currentStep + 1);
      } else if (current.key === "drivers") {
        await markStepComplete("drivers", currentStep + 1);
      } else if (current.key === "fleet") {
        await markStepComplete("fleet", currentStep + 1);
      } else if (current.key === "preferences") {
        const requiredDocs = preferences.requirePod ? [...DOC_TYPES] : [];
        const data = await apiFetch<{ state: OnboardingState }>("/onboarding/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requiredDocs,
            requireRateConBeforeDispatch: preferences.requireRateCon,
            currentStep: currentStep + 1,
          }),
        });
        setState(data.state);
      } else if (current.key === "tracking") {
        const data = await apiFetch<{ state: OnboardingState }>("/onboarding/tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackingPreference: trackingChoice, currentStep: currentStep + 1 }),
        });
        setState(data.state);
      } else if (current.key === "finance") {
        const data = await apiFetch<{ state: OnboardingState }>("/onboarding/finance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settlementSchedule: financeForm.settlementSchedule || undefined,
            settlementTemplate: {
              includeLinehaul: financeForm.includeLinehaul,
              includeFuelSurcharge: financeForm.includeFuelSurcharge,
              includeAccessorials: financeForm.includeAccessorials,
            },
            currentStep: currentStep < STEPS.length ? currentStep + 1 : undefined,
          }),
        });
        setState(data.state);
        await apiFetch<{ state: OnboardingState }>("/onboarding/activate", { method: "POST" });
        router.push("/onboarding/complete");
        return;
      }
      setCurrentStep((step) => Math.min(STEPS.length, step + 1));
      await loadOnboarding();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setCurrentStep((step) => Math.max(1, step - 1));
  };

  const addOperatingEntity = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/operating-entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entityForm),
      });
      setEntityForm({
        name: "",
        type: "CARRIER",
        addressLine1: "",
        city: "",
        state: "",
        zip: "",
        dotNumber: "",
        mcNumber: "",
      });
      await loadOnboarding();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [entityForm, loadOnboarding]);

  const addTeamMember = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(teamForm),
      });
      setTeamForm({ email: "", name: "", role: "DISPATCHER", password: "password123" });
      await loadOnboarding();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [teamForm, loadOnboarding]);

  const addDriver = useCallback(async () => {
    setSaving(true);
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
        payRatePerMile: "",
        password: "password123",
      });
      await loadOnboarding();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [driverForm, loadOnboarding]);

  const addTruck = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/admin/trucks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(truckForm),
      });
      setTruckForm({ unit: "", vin: "", plate: "", plateState: "", status: "AVAILABLE" });
      await loadOnboarding();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [truckForm, loadOnboarding]);

  const addTrailer = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/admin/trailers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trailerForm),
      });
      setTrailerForm({ unit: "", type: "OTHER", plate: "", plateState: "", status: "AVAILABLE" });
      await loadOnboarding();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [trailerForm, loadOnboarding]);

  const stepContent = useMemo(() => {
    if (!current) return null;
    if (current.key === "basics") {
      return (
        <div className="grid gap-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <FormField label="Legal company name" htmlFor="legalName" required>
              <Input
                value={basicsForm.legalName}
                onChange={(e) => setBasicsForm({ ...basicsForm, legalName: e.target.value })}
                placeholder=""
              />
            </FormField>
            <FormField label="Display name" htmlFor="displayName">
              <Input
                value={basicsForm.displayName}
                onChange={(e) => setBasicsForm({ ...basicsForm, displayName: e.target.value })}
                placeholder=""
              />
            </FormField>
            <FormField label="Timezone" htmlFor="timezone">
              <Input
                value={basicsForm.timezone}
                onChange={(e) => setBasicsForm({ ...basicsForm, timezone: e.target.value })}
                placeholder=""
              />
            </FormField>
            <FormField label="Currency" htmlFor="currency">
              <Select
                value={basicsForm.currency}
                onChange={(e) => setBasicsForm({ ...basicsForm, currency: e.target.value })}
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
                value={basicsForm.operatingMode}
                onChange={(e) => setBasicsForm({ ...basicsForm, operatingMode: e.target.value })}
              >
                <option value="">Select mode</option>
                <option value="CARRIER">Carrier</option>
                <option value="BROKER">Broker</option>
                <option value="BOTH">Carrier + Broker</option>
              </Select>
            </FormField>
            <FormField label="DOT number (optional)" htmlFor="dotNumber">
              <Input
                value={basicsForm.dotNumber}
                onChange={(e) => setBasicsForm({ ...basicsForm, dotNumber: e.target.value })}
                placeholder=""
              />
            </FormField>
            <FormField label="MC number (optional)" htmlFor="mcNumber">
              <Input
                value={basicsForm.mcNumber}
                onChange={(e) => setBasicsForm({ ...basicsForm, mcNumber: e.target.value })}
                placeholder=""
              />
            </FormField>
          </div>
        </div>
      );
    }

    if (current.key === "operating") {
      return (
        <div className="space-y-4">
          <div className="grid gap-2">
            {entities.map((entity) => (
              <div key={entity.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{entity.name}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {entity.type} {entity.isDefault ? "· Default" : ""}
                    </div>
                  </div>
                  <Badge className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
                    {entity.dotNumber || entity.mcNumber ? "Registered" : "Optional"}
                  </Badge>
                </div>
              </div>
            ))}
            {entities.length === 0 ? <EmptyState title="No operating entities yet." /> : null}
          </div>
          <Card className="space-y-3">
            <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
              Add operating entity
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Entity name" htmlFor="entityName">
                <Input
                  value={entityForm.name}
                  onChange={(e) => setEntityForm({ ...entityForm, name: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Type" htmlFor="entityType">
                <Select
                  value={entityForm.type}
                  onChange={(e) => setEntityForm({ ...entityForm, type: e.target.value })}
                >
                  <option value="">Select type</option>
                  <option value="CARRIER">Carrier</option>
                  <option value="BROKER">Broker</option>
                </Select>
              </FormField>
              <FormField label="Address line" htmlFor="entityAddress">
                <Input
                  value={entityForm.addressLine1}
                  onChange={(e) => setEntityForm({ ...entityForm, addressLine1: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="City" htmlFor="entityCity">
                <Input
                  value={entityForm.city}
                  onChange={(e) => setEntityForm({ ...entityForm, city: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="State" htmlFor="entityState">
                <Input
                  value={entityForm.state}
                  onChange={(e) => setEntityForm({ ...entityForm, state: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Postal code" htmlFor="entityZip">
                <Input
                  value={entityForm.zip}
                  onChange={(e) => setEntityForm({ ...entityForm, zip: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="DOT number" htmlFor="entityDot">
                <Input
                  value={entityForm.dotNumber}
                  onChange={(e) => setEntityForm({ ...entityForm, dotNumber: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="MC number" htmlFor="entityMc">
                <Input
                  value={entityForm.mcNumber}
                  onChange={(e) => setEntityForm({ ...entityForm, mcNumber: e.target.value })}
                  placeholder=""
                />
              </FormField>
            </div>
            <Button onClick={addOperatingEntity} disabled={!entityForm.name || saving}>
              Add entity
            </Button>
          </Card>
        </div>
      );
    }

    if (current.key === "team") {
      return (
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Add team member</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Email" htmlFor="teamEmail" required>
                <Input
                  value={teamForm.email}
                  onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Name" htmlFor="teamName">
                <Input
                  value={teamForm.name}
                  onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Role" htmlFor="teamRole">
                <Select
                  value={teamForm.role}
                  onChange={(e) => setTeamForm({ ...teamForm, role: e.target.value })}
                >
                  <option value="">Select role</option>
                  <option value="ADMIN">Admin</option>
                  <option value="DISPATCHER">Dispatcher</option>
                  <option value="BILLING">Billing</option>
                </Select>
              </FormField>
              <FormField label="Temp password" htmlFor="teamPassword">
                <Input
                  value={teamForm.password}
                  onChange={(e) => setTeamForm({ ...teamForm, password: e.target.value })}
                  placeholder=""
                />
              </FormField>
            </div>
            <Button onClick={addTeamMember} disabled={!teamForm.email || saving}>
              Add member
            </Button>
          </Card>

          <ImportWizard
            type="employees"
            title="Bulk import team"
            description="Upload employees.csv or paste rows to add dispatch and billing users."
            templateCsv="email,role,name,phone,timezone\n"
            onImported={() => loadOnboarding()}
          />

          <div className="grid gap-2">
            {users.map((user) => (
              <div key={user.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-2 text-sm">
                <div className="font-semibold">{user.name ?? user.email}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">{user.role}</div>
              </div>
            ))}
            {users.length === 0 ? <EmptyState title="No team members yet." /> : null}
          </div>
        </div>
      );
    }

    if (current.key === "drivers") {
      return (
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Add driver</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Driver name" htmlFor="driverName" required>
                <Input
                  value={driverForm.name}
                  onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Driver email" htmlFor="driverEmail" required>
                <Input
                  value={driverForm.email}
                  onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Phone" htmlFor="driverPhone">
                <Input
                  value={driverForm.phone}
                  onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="License" htmlFor="driverLicense">
                <Input
                  value={driverForm.license}
                  onChange={(e) => setDriverForm({ ...driverForm, license: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="License state" htmlFor="driverLicenseState">
                <Input
                  value={driverForm.licenseState}
                  onChange={(e) => setDriverForm({ ...driverForm, licenseState: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Pay rate per mile" htmlFor="driverPayRate">
                <Input
                  value={driverForm.payRatePerMile}
                  onChange={(e) => setDriverForm({ ...driverForm, payRatePerMile: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Temp password" htmlFor="driverPassword">
                <Input
                  value={driverForm.password}
                  onChange={(e) => setDriverForm({ ...driverForm, password: e.target.value })}
                  placeholder=""
                />
              </FormField>
            </div>
            <Button onClick={addDriver} disabled={!driverForm.name || !driverForm.email || saving}>
              Add driver
            </Button>
          </Card>

          <ImportWizard
            type="drivers"
            title="Bulk import drivers"
            description="Upload drivers.csv to create driver records."
            templateCsv="name,phone,license,payRatePerMile,licenseExpiresAt,medCardExpiresAt\n"
            onImported={() => loadOnboarding()}
          />

          <div className="grid gap-2">
            {drivers.map((driver) => (
              <div key={driver.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-2 text-sm">
                <div className="font-semibold">{driver.name}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">{driver.phone ?? "No phone"}</div>
              </div>
            ))}
            {drivers.length === 0 ? <EmptyState title="No drivers yet." /> : null}
          </div>
        </div>
      );
    }

    if (current.key === "fleet") {
      return (
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Add truck</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Unit" htmlFor="truckUnit" required>
                <Input
                  value={truckForm.unit}
                  onChange={(e) => setTruckForm({ ...truckForm, unit: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="VIN" htmlFor="truckVin" required>
                <Input
                  value={truckForm.vin}
                  onChange={(e) => setTruckForm({ ...truckForm, vin: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Plate" htmlFor="truckPlate">
                <Input
                  value={truckForm.plate}
                  onChange={(e) => setTruckForm({ ...truckForm, plate: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Plate state" htmlFor="truckPlateState">
                <Input
                  value={truckForm.plateState}
                  onChange={(e) => setTruckForm({ ...truckForm, plateState: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Status" htmlFor="truckStatus">
                <Select
                  value={truckForm.status}
                  onChange={(e) => setTruckForm({ ...truckForm, status: e.target.value })}
                >
                  <option value="">Select status</option>
                  <option value="AVAILABLE">Available</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="OUT_OF_SERVICE">Out of service</option>
                </Select>
              </FormField>
            </div>
            <Button onClick={addTruck} disabled={!truckForm.unit || !truckForm.vin || saving}>
              Add truck
            </Button>
          </Card>

          <Card className="space-y-3">
            <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Add trailer</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Unit" htmlFor="trailerUnit" required>
                <Input
                  value={trailerForm.unit}
                  onChange={(e) => setTrailerForm({ ...trailerForm, unit: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Type" htmlFor="trailerType">
                <Select
                  value={trailerForm.type}
                  onChange={(e) => setTrailerForm({ ...trailerForm, type: e.target.value })}
                >
                  <option value="">Select type</option>
                  <option value="DRY_VAN">Dry Van</option>
                  <option value="REEFER">Reefer</option>
                  <option value="FLATBED">Flatbed</option>
                  <option value="OTHER">Other</option>
                </Select>
              </FormField>
              <FormField label="Plate" htmlFor="trailerPlate">
                <Input
                  value={trailerForm.plate}
                  onChange={(e) => setTrailerForm({ ...trailerForm, plate: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Plate state" htmlFor="trailerPlateState">
                <Input
                  value={trailerForm.plateState}
                  onChange={(e) => setTrailerForm({ ...trailerForm, plateState: e.target.value })}
                  placeholder=""
                />
              </FormField>
              <FormField label="Status" htmlFor="trailerStatus">
                <Select
                  value={trailerForm.status}
                  onChange={(e) => setTrailerForm({ ...trailerForm, status: e.target.value })}
                >
                  <option value="">Select status</option>
                  <option value="AVAILABLE">Available</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="OUT_OF_SERVICE">Out of service</option>
                </Select>
              </FormField>
            </div>
            <Button onClick={addTrailer} disabled={!trailerForm.unit || saving}>
              Add trailer
            </Button>
          </Card>

          <ImportWizard
            type="trucks"
            title="Bulk import trucks"
            description="Upload trucks.csv to add or update the fleet."
            templateCsv="unit,vin,plate,plateState,status\n"
            onImported={() => loadOnboarding()}
          />

          <ImportWizard
            type="trailers"
            title="Bulk import trailers"
            description="Upload trailers.csv to add or update the fleet."
            templateCsv="unit,type,plate,plateState,status\n"
            onImported={() => loadOnboarding()}
          />

          <div className="grid gap-2">
            {trucks.slice(0, 4).map((truck) => (
              <div key={truck.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-2 text-sm">
                <div className="font-semibold">{truck.unit}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">{truck.vin ?? "VIN missing"}</div>
              </div>
            ))}
            {trucks.length === 0 ? <EmptyState title="No trucks yet." /> : null}
          </div>

          <div className="grid gap-2">
            {trailers.slice(0, 4).map((trailer) => (
              <div key={trailer.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-2 text-sm">
                <div className="font-semibold">{trailer.unit}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {(trailer.type || "Trailer").toString().replace(/_/g, " ")}
                </div>
              </div>
            ))}
            {trailers.length === 0 ? <EmptyState title="No trailers yet." /> : null}
          </div>
        </div>
      );
    }

    if (current.key === "preferences") {
      return (
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
              Invoice document rules
            </div>
            <CheckboxField
              id="requirePod"
              label="Require POD before invoicing"
              checked={preferences.requirePod}
              onChange={(e) => setPreferences({ ...preferences, requirePod: e.target.checked })}
            />
          </Card>
          <Card className="space-y-3">
            <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
              Dispatch rules
            </div>
            <CheckboxField
              id="requireRateCon"
              label="Require rate confirmation before dispatch"
              checked={preferences.requireRateCon}
              onChange={(e) => setPreferences({ ...preferences, requireRateCon: e.target.checked })}
            />
            <div className="text-xs text-[color:var(--color-text-muted)]">
              When enabled, dispatch will block until a Rate Confirmation is uploaded.
            </div>
          </Card>
        </div>
      );
    }

    if (current.key === "tracking") {
      return (
        <div className="grid gap-3 lg:grid-cols-2">
          {[
            { value: "MANUAL", label: "Manual check-ins", note: "Drivers update stops from the mobile portal." },
            { value: "SAMSARA", label: "Samsara", note: "Match loads to Samsara trucks when ready." },
            { value: "MOTIVE", label: "Motive", note: "Use Motive data once connected." },
            { value: "OTHER", label: "Other", note: "Select a custom tracking approach." },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTrackingChoice(option.value)}
              className={`rounded-[var(--radius-card)] border px-4 py-3 text-left transition ${
                trackingChoice === option.value
                  ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10"
                  : "border-[color:var(--color-divider)] bg-white"
              }`}
            >
              <div className="text-sm font-semibold text-ink">{option.label}</div>
              <div className="text-xs text-[color:var(--color-text-muted)]">{option.note}</div>
            </button>
          ))}
        </div>
      );
    }

    if (current.key === "finance") {
      return (
        <div className="space-y-4">
          <Card className="space-y-3">
            <FormField label="Settlement schedule" htmlFor="settlementSchedule">
              <Select
                value={financeForm.settlementSchedule}
                onChange={(e) => setFinanceForm({ ...financeForm, settlementSchedule: e.target.value })}
              >
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Bi-weekly</option>
                <option value="SEMI_MONTHLY">Semi-monthly</option>
                <option value="MONTHLY">Monthly</option>
              </Select>
            </FormField>
          </Card>
          <Card className="space-y-3">
            <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
              Pay statement template
            </div>
            <CheckboxField
              id="financeLinehaul"
              label="Include linehaul"
              checked={financeForm.includeLinehaul}
              onChange={(e) => setFinanceForm({ ...financeForm, includeLinehaul: e.target.checked })}
            />
            <CheckboxField
              id="financeFuel"
              label="Include fuel surcharge"
              checked={financeForm.includeFuelSurcharge}
              onChange={(e) => setFinanceForm({ ...financeForm, includeFuelSurcharge: e.target.checked })}
            />
            <CheckboxField
              id="financeAccessorials"
              label="Include accessorials"
              checked={financeForm.includeAccessorials}
              onChange={(e) => setFinanceForm({ ...financeForm, includeAccessorials: e.target.checked })}
            />
          </Card>
        </div>
      );
    }

    return null;
  }, [
    current,
    basicsForm,
    entityForm,
    teamForm,
    driverForm,
    truckForm,
    trailerForm,
    preferences,
    trackingChoice,
    financeForm,
    entities,
    trailers,
    users,
    drivers,
    trucks,
    saving,
    loadOnboarding,
    addDriver,
    addOperatingEntity,
    addTeamMember,
    addTrailer,
    addTruck,
  ]);

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-muted)] px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-subtle)]">Activate Workspace</div>
            <h1 className="text-3xl font-semibold text-ink">Bring your company online</h1>
            <p className="text-sm text-[color:var(--color-text-muted)]">
              Each step auto-saves. You can revisit or adjust later.
            </p>
          </div>
          <Badge className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
            Step {currentStep} of {STEPS.length}
          </Badge>
        </div>

        <div className="rounded-full bg-white/70 p-1 shadow-[var(--shadow-subtle)]">
          <div
            className="h-2 rounded-full bg-[color:var(--color-accent)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {error ? (
          <Card className="border-[color:var(--color-danger)] bg-[color:var(--color-danger-soft)]/30">
            <div className="text-sm text-[color:var(--color-danger)]">{error}</div>
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
          <aside className="space-y-3">
            {STEPS.map((step, index) => {
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isComplete = completedSteps.has(step.key);
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setCurrentStep(stepNumber)}
                  className={`w-full rounded-[var(--radius-card)] border px-3 py-3 text-left transition ${
                    isActive
                      ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10"
                      : "border-[color:var(--color-divider)] bg-white"
                  }`}
                >
                  <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-subtle)]">
                    Step {stepNumber}
                  </div>
                  <div className="text-sm font-semibold text-ink">{step.title}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">{step.subtitle}</div>
                  {isComplete ? (
                    <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-success)]">
                      Complete
                    </div>
                  ) : null}
                </button>
              );
            })}
          </aside>

          <Card className="space-y-6">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-subtle)]">
                {current?.title}
              </div>
              <div className="text-lg font-semibold text-ink">{current?.subtitle}</div>
            </div>

            {loading ? <EmptyState title="Loading onboarding..." /> : stepContent}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-divider)] pt-4">
              <Button variant="secondary" onClick={handleBack} disabled={currentStep === 1 || saving}>
                Back
              </Button>
              <div className="flex flex-wrap gap-2">
                {["operating", "team", "drivers", "fleet"].includes(current?.key ?? "") ? (
                  <Button variant="ghost" onClick={handleNext} disabled={saving}>
                    Skip for now
                  </Button>
                ) : null}
                <Button onClick={handleNext} disabled={saving}>
                  {current?.key === "finance" ? "Finish activation" : "Next"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <RouteGuard allowedRoles={["ADMIN"]}>
      <OnboardingWizard />
    </RouteGuard>
  );
}

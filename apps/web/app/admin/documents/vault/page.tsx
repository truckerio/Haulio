"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/rbac/route-guard";
import { AdminSettingsShell } from "@/components/admin-settings/AdminSettingsShell";
import { AdminDrawer } from "@/components/admin-settings/AdminDrawer";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ErrorBanner } from "@/components/ui/error-banner";
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, getApiBase } from "@/lib/api";

const DOC_TYPES = [
  { value: "INSURANCE", label: "Insurance" },
  { value: "CARGO_INSURANCE", label: "Cargo insurance" },
  { value: "LIABILITY", label: "Liability" },
  { value: "REGISTRATION", label: "Registration" },
  { value: "PERMIT", label: "Permit" },
  { value: "IFTA", label: "IFTA" },
  { value: "TITLE", label: "Title" },
  { value: "OTHER", label: "Other" },
];

const SCOPE_TYPES = [
  { value: "ORG", label: "Company" },
  { value: "TRUCK", label: "Truck" },
  { value: "DRIVER", label: "Driver" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All status" },
  { value: "VALID", label: "Valid" },
  { value: "EXPIRING_SOON", label: "Expiring soon" },
  { value: "EXPIRED", label: "Expired" },
  { value: "NEEDS_DETAILS", label: "Needs details" },
];

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  VALID: "success",
  EXPIRING_SOON: "warning",
  EXPIRED: "danger",
  NEEDS_DETAILS: "warning",
};

const VIEW_OPTIONS = [
  { value: "attention", label: "Needs attention" },
  { value: "all", label: "All documents" },
];

type VaultDoc = {
  id: string;
  docType: string;
  scopeType: string;
  scopeId?: string | null;
  scopeLabel: string;
  status: string;
  expiresAt?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  uploadedAt: string;
  updatedAt: string;
  uploadedBy?: { id: string; name?: string | null; email?: string | null } | null;
};

type Driver = { id: string; name?: string | null };
type Truck = { id: string; unit?: string | null; vin?: string | null };

type Filters = {
  search: string;
  type: string;
  scope: string;
  status: string;
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

const formatStatusLabel = (value: string) => {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
};

function VaultPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ search: "", type: "", scope: "", status: "" });
  const [visibleCount, setVisibleCount] = useState(5);
  const [viewMode, setViewMode] = useState<"attention" | "all">("attention");
  const [initialized, setInitialized] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    docType: "INSURANCE",
    scopeType: "ORG",
    scopeId: "",
    expiresAt: "",
    referenceNumber: "",
    notes: "",
    file: null as File | null,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [docsRes, driversRes, trucksRes] = await Promise.all([
        apiFetch<{ docs: VaultDoc[] }>("/admin/vault/docs"),
        apiFetch<{ drivers: Driver[] }>("/admin/drivers"),
        apiFetch<{ trucks: Truck[] }>("/admin/trucks"),
      ]);
      setDocs(docsRes.docs ?? []);
      setDrivers(driversRes.drivers ?? []);
      setTrucks(trucksRes.trucks ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Failed to load document vault.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setVisibleCount(5);
  }, [filters, docs, viewMode]);

  useEffect(() => {
    if (initialized) return;
    const viewParam = searchParams.get("view");
    const nextView = viewParam === "all" ? "all" : "attention";
    setViewMode(nextView);
    setFilters({
      search: searchParams.get("search") ?? "",
      type: searchParams.get("type") ?? "",
      scope: searchParams.get("scope") ?? "",
      status: searchParams.get("status") ?? "",
    });
    setInitialized(true);
  }, [initialized, searchParams]);

  useEffect(() => {
    if (!initialized) return;
    const params = new URLSearchParams();
    if (viewMode !== "attention") params.set("view", viewMode);
    if (filters.search) params.set("search", filters.search);
    if (filters.type) params.set("type", filters.type);
    if (filters.scope) params.set("scope", filters.scope);
    if (filters.status) params.set("status", filters.status);
    const query = params.toString();
    const next = query ? `?${query}` : window.location.pathname;
    router.replace(next, { scroll: false });
  }, [filters, viewMode, initialized, router]);

  const resetForm = () => {
    setFormState({
      docType: "INSURANCE",
      scopeType: "ORG",
      scopeId: "",
      expiresAt: "",
      referenceNumber: "",
      notes: "",
      file: null,
    });
    setUploadError(null);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    resetForm();
  };

  const filteredDocs = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return docs.filter((doc) => {
      if (filters.type && doc.docType !== filters.type) return false;
      if (filters.scope && doc.scopeType !== filters.scope) return false;
      if (filters.status && doc.status !== filters.status) return false;
      if (!search) return true;
      const haystack = [
        doc.originalName,
        doc.docType,
        doc.scopeLabel,
        doc.referenceNumber ?? "",
        doc.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [docs, filters]);

  const attentionSet = new Set(["EXPIRED", "EXPIRING_SOON", "NEEDS_DETAILS"]);
  const viewDocs =
    viewMode === "attention" ? filteredDocs.filter((doc) => attentionSet.has(doc.status)) : filteredDocs;
  const visibleDocs = viewDocs.slice(0, visibleCount);

  const docTypeLabel = (value: string) => DOC_TYPES.find((doc) => doc.value === value)?.label ?? value;

  const uploadDoc = async () => {
    if (!formState.file) {
      setUploadError("Please attach a file.");
      return;
    }
    if (formState.scopeType !== "ORG" && !formState.scopeId) {
      setUploadError("Please select a driver or truck.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", formState.file);
      body.append("docType", formState.docType);
      body.append("scopeType", formState.scopeType);
      if (formState.scopeId) body.append("scopeId", formState.scopeId);
      if (formState.expiresAt) body.append("expiresAt", formState.expiresAt);
      if (formState.referenceNumber) body.append("referenceNumber", formState.referenceNumber);
      if (formState.notes) body.append("notes", formState.notes);
      await apiFetch("/admin/vault/docs", { method: "POST", body });
      await loadData();
      closeDrawer();
    } catch (err) {
      setUploadError((err as Error).message || "Failed to upload document.");
    } finally {
      setUploading(false);
    }
  };

  const downloadDoc = (doc: VaultDoc) => {
    window.open(`${getApiBase()}/admin/vault/docs/${doc.id}/download`, "_blank");
  };

  return (
    <AppShell title="Settings" hideHeader={true}>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <AdminSettingsShell
          title="Document Vault"
          titleAlign="center"
          subtitle="Company, truck, and driver compliance documents."
          backAction={
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-full border border-[color:var(--color-divider)] bg-white/90 p-0"
              onClick={() => router.push("/admin/documents")}
              aria-label="Back"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4L6 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          }
          actions={
            <Button variant="primary" onClick={() => setDrawerOpen(true)}>
              Upload document
            </Button>
          }
        >
          {error ? <ErrorBanner message={error} /> : null}

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Vault</div>
                <div className="text-[12px] text-[color:var(--color-text-muted)]">{viewDocs.length} documents</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Search documents"
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                />
                <Select value={filters.type} onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}>
                  <option value="">All types</option>
                  {DOC_TYPES.map((doc) => (
                    <option key={doc.value} value={doc.value}>
                      {doc.label}
                    </option>
                  ))}
                </Select>
                <Select value={filters.scope} onChange={(event) => setFilters((prev) => ({ ...prev, scope: event.target.value }))}>
                  <option value="">All scopes</option>
                  {SCOPE_TYPES.map((scope) => (
                    <option key={scope.value} value={scope.value}>
                      {scope.label}
                    </option>
                  ))}
                </Select>
                <Select value={viewMode} onChange={(event) => setViewMode(event.target.value as "attention" | "all")}>
                  {VIEW_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-[color:var(--color-text-muted)]">Loading document vault…</div>
            ) : viewDocs.length === 0 ? (
              <div className="text-sm text-[color:var(--color-text-muted)]">No documents match these filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Document</th>
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Scope</th>
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Status</th>
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Expires</th>
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Uploaded by</th>
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Updated</th>
                      <th className="border-b border-[color:var(--color-divider)] px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDocs.map((doc) => (
                      <tr key={doc.id} className="border-b border-[color:var(--color-divider)] last:border-0">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-ink">{docTypeLabel(doc.docType)}</div>
                          <div className="text-xs text-[color:var(--color-text-muted)]">{doc.originalName}</div>
                        </td>
                        <td className="px-3 py-3">{doc.scopeLabel}</td>
                        <td className="px-3 py-3">
                          <StatusChip label={formatStatusLabel(doc.status)} tone={STATUS_TONE[doc.status] ?? "neutral"} />
                        </td>
                        <td className="px-3 py-3">{formatDate(doc.expiresAt)}</td>
                        <td className="px-3 py-3">{doc.uploadedBy?.name ?? doc.uploadedBy?.email ?? "—"}</td>
                        <td className="px-3 py-3">{formatDateTime(doc.updatedAt)}</td>
                        <td className="px-3 py-3">
                          <Button variant="ghost" size="sm" onClick={() => downloadDoc(doc)}>
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {visibleDocs.length < filteredDocs.length ? (
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setVisibleCount((prev) => prev + 5)}>
                  Load more
                </Button>
              </div>
            ) : null}
          </Card>
        </AdminSettingsShell>
      </RouteGuard>

      <AdminDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="Upload document"
        subtitle="Add compliance docs to the vault."
        eyebrow="Documents"
        footer={
          <div className="flex w-full items-center justify-between">
            <Button variant="secondary" onClick={closeDrawer}>
              Cancel
            </Button>
            <Button variant="primary" onClick={uploadDoc} disabled={uploading}>
              {uploading ? "Uploading…" : "Save document"}
            </Button>
          </div>
        }
      >
        {uploadError ? <ErrorBanner message={uploadError} /> : null}
        <div className="space-y-4">
          <FormField label="Document type" htmlFor="docType">
            <Select
              value={formState.docType}
              onChange={(event) => setFormState((prev) => ({ ...prev, docType: event.target.value }))}
            >
              {DOC_TYPES.map((doc) => (
                <option key={doc.value} value={doc.value}>
                  {doc.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Attach to" htmlFor="scopeType">
            <Select
              value={formState.scopeType}
              onChange={(event) => setFormState((prev) => ({ ...prev, scopeType: event.target.value, scopeId: "" }))}
            >
              {SCOPE_TYPES.map((scope) => (
                <option key={scope.value} value={scope.value}>
                  {scope.label}
                </option>
              ))}
            </Select>
          </FormField>
          {formState.scopeType === "TRUCK" ? (
            <FormField label="Truck" htmlFor="truckId">
              <Select
                value={formState.scopeId}
                onChange={(event) => setFormState((prev) => ({ ...prev, scopeId: event.target.value }))}
              >
                <option value="">Select truck</option>
                {trucks.map((truck) => (
                  <option key={truck.id} value={truck.id}>
                    {truck.unit ? `Truck ${truck.unit}` : truck.vin ?? truck.id}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          {formState.scopeType === "DRIVER" ? (
            <FormField label="Driver" htmlFor="driverId">
              <Select
                value={formState.scopeId}
                onChange={(event) => setFormState((prev) => ({ ...prev, scopeId: event.target.value }))}
              >
                <option value="">Select driver</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name ?? driver.id}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          <FormField label="Attach file" htmlFor="file">
            <Input
              id="file"
              type="file"
              accept="application/pdf,image/*"
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, file: event.target.files?.[0] ?? null }))
              }
            />
          </FormField>
          <details className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">More details</summary>
            <div className="mt-3 space-y-3">
              <FormField label="Expiration date" htmlFor="expiresAt" hint="Optional">
                <Input
                  id="expiresAt"
                  type="date"
                  value={formState.expiresAt}
                  onChange={(event) => setFormState((prev) => ({ ...prev, expiresAt: event.target.value }))}
                />
              </FormField>
              <FormField label="Policy / reference number" htmlFor="referenceNumber" hint="Optional">
                <Input
                  id="referenceNumber"
                  value={formState.referenceNumber}
                  onChange={(event) => setFormState((prev) => ({ ...prev, referenceNumber: event.target.value }))}
                />
              </FormField>
              <FormField label="Notes" htmlFor="notes" hint="Optional">
                <Textarea
                  id="notes"
                  rows={3}
                  value={formState.notes}
                  onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </FormField>
            </div>
          </details>
        </div>
      </AdminDrawer>
    </AppShell>
  );
}

export default function VaultPage() {
  return (
    <Suspense fallback={null}>
      <VaultPageContent />
    </Suspense>
  );
}

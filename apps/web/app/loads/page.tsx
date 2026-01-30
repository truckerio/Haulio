"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/ui/section-header";
import { Textarea } from "@/components/ui/textarea";
import { RefinePanel } from "@/components/ui/refine-panel";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { BlockedScreen } from "@/components/ui/blocked-screen";
import { Badge } from "@/components/ui/badge";
import { apiFetch, getApiBase } from "@/lib/api";
import { BulkLoadImport } from "@/components/BulkLoadImport";
import { ImportWizard } from "@/components/ImportWizard";
import {
  deriveBillingStatus,
  deriveBlocker,
  deriveDocsBlocker,
  deriveOpsStatus,
  derivePrimaryAction,
  deriveTrackingBadge,
} from "@/lib/load-derivations";

const PAGE_SIZE = 25;

const OPS_STATUSES = [
  "DRAFT",
  "PLANNED",
  "ASSIGNED",
  "IN_TRANSIT",
  "DELIVERED",
  "POD_RECEIVED",
  "READY_TO_INVOICE",
  "INVOICED",
  "PAID",
  "CANCELLED",
] as const;
const BILLING_STATUSES = ["DOCS_NEEDED", "READY_TO_INVOICE", "INVOICED", "PAID"] as const;

// TODO(QA): Open /loads, click a chip (e.g., Missing POD) to confirm list updates, then click a card to verify navigation.

const TMS_LOAD_SHEET_TEMPLATE =
  "Load,Trip,Status,Customer,Cust Ref,Unit,Trailer,As Wgt,Total Rev,PU Date F,PU Time F,PU Time T,Shipper,Ship City,Ship St,Del Date F,Del Time T,Consignee,Cons City,Cons St,Sales,Drop Name,Load Notes (Shipper),Load Notes (Consignee),Inv Date,Del Date T,Type\n" +
  "LD-1001,TRIP-9001,Planned,Acme Foods,PO-7788,TRK-101,TRL-201,42000,2500,01/20/2026,08:00,10:00,Acme DC,Chicago,IL,01/21/2026,16:00,Fresh Mart,Dallas,TX,A. Lee,Store 14,Handle with care,Deliver after 3 PM,,01/21/2026,Van\n";

type OpsStatus = (typeof OPS_STATUSES)[number];
type BillingStatus = (typeof BILLING_STATUSES)[number];

type RefineState = {
  opsStatuses: OpsStatus[];
  billingStatuses: BillingStatus[];
  customer: string;
  driverId: string;
  pickupFrom: string;
  pickupTo: string;
  deliveryFrom: string;
  deliveryTo: string;
  missingDocsOnly: boolean;
  trackingOffOnly: boolean;
  destSearch: string;
  minRate: string;
  maxRate: string;
};

const defaultRefine: RefineState = {
  opsStatuses: [],
  billingStatuses: [],
  customer: "",
  driverId: "",
  pickupFrom: "",
  pickupTo: "",
  deliveryFrom: "",
  deliveryTo: "",
  missingDocsOnly: false,
  trackingOffOnly: false,
  destSearch: "",
  minRate: "",
  maxRate: "",
};

export default function LoadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loads, setLoads] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [operatingEntities, setOperatingEntities] = useState<any[]>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; active?: boolean }>>([]);
  const [teamFilterId, setTeamFilterId] = useState("");
  const [user, setUser] = useState<any | null>(null);
  const [orgOperatingMode, setOrgOperatingMode] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [blocked, setBlocked] = useState<{ message?: string; ctaHref?: string } | null>(null);
  const [operational, setOperational] = useState<boolean | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeChip, setActiveChip] = useState("active");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportPreviewCount, setExportPreviewCount] = useState<number | null>(null);
  const [exportPreviewMax, setExportPreviewMax] = useState<number | null>(null);
  const [exportPreviewLoading, setExportPreviewLoading] = useState(false);
  const [exportPreviewError, setExportPreviewError] = useState<string | null>(null);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [importMode, setImportMode] = useState<"legacy" | "tms_load_sheet">("legacy");
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [refine, setRefine] = useState<RefineState>(defaultRefine);
  const [pageIndex, setPageIndex] = useState(0);
  const [customerSuggestion, setCustomerSuggestion] = useState<{
    customerId: string;
    customerName: string;
    confidence: number;
  } | null>(null);
  const [customerLearnedApplied, setCustomerLearnedApplied] = useState(false);
  const [pickupSuggestion, setPickupSuggestion] = useState<{
    address: string;
    city: string;
    state: string;
    zip: string;
  } | null>(null);
  const [pickupNameSuggestion, setPickupNameSuggestion] = useState<{
    address: string;
    city: string;
    state: string;
    zip: string;
  } | null>(null);
  const [deliverySuggestion, setDeliverySuggestion] = useState<{
    address: string;
    city: string;
    state: string;
    zip: string;
  } | null>(null);
  const [deliveryNameSuggestion, setDeliveryNameSuggestion] = useState<{
    address: string;
    city: string;
    state: string;
    zip: string;
  } | null>(null);
  const [pickupLearnedApplied, setPickupLearnedApplied] = useState(false);
  const [deliveryLearnedApplied, setDeliveryLearnedApplied] = useState(false);
  const lastCustomerQuery = useRef("");
  const lastPickupQuery = useRef("");
  const lastDeliveryQuery = useRef("");
  const lastPickupNameQuery = useRef("");
  const lastDeliveryNameQuery = useRef("");
  const [showStopDetails, setShowStopDetails] = useState(false);
  const [form, setForm] = useState({
    loadNumber: "",
    status: "PLANNED",
    loadType: "BROKERED",
    tripNumber: "",
    operatingEntityId: "",
    customerId: "",
    customerName: "",
    customerRef: "",
    truckUnit: "",
    trailerUnit: "",
    weightLbs: "",
    rate: "",
    miles: "",
    pickupDate: "",
    pickupTimeStart: "",
    pickupTimeEnd: "",
    pickupName: "",
    pickupAddress: "",
    pickupCity: "",
    pickupState: "",
    pickupZip: "",
    pickupNotes: "",
    deliveryDateStart: "",
    deliveryDateEnd: "",
    deliveryTimeEnd: "",
    deliveryName: "",
    deliveryAddress: "",
    deliveryCity: "",
    deliveryState: "",
    deliveryZip: "",
    deliveryNotes: "",
    salesRepName: "",
    dropName: "",
    desiredInvoiceDate: "",
  });

  const canImport = user?.role === "ADMIN" || user?.role === "DISPATCHER";
  const canSeeAllTeams = Boolean(user?.canSeeAllTeams);
  const archivedMode = activeChip === "archived";

  const buildParams = useCallback((options?: {
    rangeDays?: number;
    fromDate?: string;
    toDate?: string;
    includeChip?: boolean;
    page?: number;
    limit?: number;
    format?: string;
  }) => {
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    if (refine.driverId) params.set("driverId", refine.driverId);
    if (refine.customer) params.set("customer", refine.customer);
    if (refine.destSearch) params.set("destSearch", refine.destSearch);
    if (refine.minRate) params.set("minRate", refine.minRate);
    if (refine.maxRate) params.set("maxRate", refine.maxRate);
    params.set("archived", archivedMode ? "true" : "false");
    if (options?.includeChip) params.set("chip", activeChip);
    if (options?.page) params.set("page", String(options.page));
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.rangeDays) {
      params.set("rangeDays", String(options.rangeDays));
    }
    if (options?.fromDate) params.set("fromDate", options.fromDate);
    if (options?.toDate) params.set("toDate", options.toDate);
    if (options?.format) params.set("format", options.format);
    if (teamFilterId) params.set("teamId", teamFilterId);
    return params.toString();
  }, [
    searchTerm,
    refine.driverId,
    refine.customer,
    refine.destSearch,
    refine.minRate,
    refine.maxRate,
    archivedMode,
    activeChip,
    teamFilterId,
  ]);

  const loadData = useCallback(async () => {
    const query = buildParams({ page: pageIndex + 1, limit: PAGE_SIZE, includeChip: true });
    const url = query ? `/loads?${query}` : "/loads";
    const [loadsData, driversData] = await Promise.all([
      apiFetch<{ loads: any[]; page: number; totalPages: number; total: number }>(url),
      apiFetch<{ drivers: any[] }>("/assets/drivers"),
    ]);
    setDrivers(driversData.drivers);
    setLoads(loadsData.loads);
    setTotalPages(loadsData.totalPages ?? 1);
    setTotalCount(loadsData.total ?? loadsData.loads.length);
    try {
      const entitiesData = await apiFetch<{ entities: any[] }>("/api/operating-entities");
      setOperatingEntities(entitiesData.entities);
    } catch {
      setOperatingEntities([]);
    }
  }, [buildParams, pageIndex]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    apiFetch<{ user: any; org: { operatingMode?: string | null } | null }>("/auth/me")
      .then((data) => {
        setUser(data.user);
        setOrgOperatingMode(data.org?.operatingMode ?? null);
      })
      .catch(() => {
        setUser(null);
        setOrgOperatingMode(null);
      });
  }, []);

  useEffect(() => {
    if (!canSeeAllTeams) {
      setTeams([]);
      setTeamFilterId("");
      return;
    }
    apiFetch<{ teams: Array<{ id: string; name: string; active?: boolean }> }>("/teams")
      .then((data) => setTeams(data.teams ?? []))
      .catch(() => setTeams([]));
  }, [canSeeAllTeams]);
  useEffect(() => {
    if (searchParams?.get("create") === "1") {
      setShowCreate(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    apiFetch<{ state: { status?: string } }>("/onboarding/state")
      .then((payload) => {
        if (payload.state?.status === "NOT_ACTIVATED") {
          setOperational(false);
          setBlocked({ message: "Finish setup to create loads.", ctaHref: "/onboarding" });
        } else {
          setOperational(true);
          setBlocked(null);
        }
      })
      .catch(() => {
        // ignore onboarding checks for non-admins or unexpected errors
      });
  }, [user]);

  useEffect(() => {
    if (!canImport && showImport) {
      setShowImport(false);
    }
  }, [canImport, showImport]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadData();
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [loadData]);

  const downloadExport = async (query: string) => {
    setExportError(null);
    setExporting(true);
    try {
      const url = `${getApiBase()}/loads/export?${query}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Export failed" }));
        throw new Error(error.error || "Export failed");
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      const params = new URLSearchParams(query);
      const isTms = params.get("format") === "tms_load_sheet";
      link.href = objectUrl;
      link.download = isTms ? `loads-export-tms-load-sheet-${stamp}.csv` : `loads-export-${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setExportError((error as Error).message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const previewExport = async (query: string) => {
    setExportPreviewError(null);
    setExportPreviewLoading(true);
    try {
      const url = `${getApiBase()}/loads/export/preview?${query}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Preview failed" }));
        throw new Error(error.error || "Preview failed");
      }
      const data = await response.json();
      setExportPreviewCount(data.count ?? null);
      setExportPreviewMax(data.maxRows ?? null);
    } catch (error) {
      setExportPreviewError((error as Error).message || "Preview failed");
    } finally {
      setExportPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (operatingEntities.length === 0) return;
    setForm((prev) => {
      if (prev.operatingEntityId) return prev;
      const defaultEntity = operatingEntities.find((entity) => entity.isDefault) ?? operatingEntities[0];
      return { ...prev, operatingEntityId: defaultEntity?.id ?? "" };
    });
  }, [operatingEntities]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchTerm, activeChip, refine]);

  useEffect(() => {
    if (pageIndex > totalPages - 1) {
      setPageIndex(Math.max(0, totalPages - 1));
    }
  }, [pageIndex, totalPages]);

  const handleCreate = async () => {
    setFormError(null);
    if (
      !form.customerName.trim() ||
      !form.pickupName.trim() ||
      !form.pickupCity.trim() ||
      !form.pickupState.trim() ||
      !form.deliveryName.trim() ||
      !form.deliveryCity.trim() ||
      !form.deliveryState.trim() ||
      !form.pickupDate.trim() ||
      !form.deliveryDateStart.trim()
    ) {
      setFormError("Fill all required fields before creating the load.");
      return;
    }
    const combineDateTime = (date: string, time?: string) => {
      if (!date) return undefined;
      const cleanTime = time?.trim();
      return cleanTime ? `${date}T${cleanTime}` : `${date}T00:00`;
    };
    const pickupStart = combineDateTime(form.pickupDate, form.pickupTimeStart || undefined);
    const pickupEnd = combineDateTime(
      form.pickupDate,
      form.pickupTimeEnd || form.pickupTimeStart || undefined
    );
    const deliveryStart = combineDateTime(form.deliveryDateStart, undefined);
    const deliveryEnd = form.deliveryTimeEnd
      ? combineDateTime(form.deliveryDateEnd || form.deliveryDateStart, form.deliveryTimeEnd)
      : undefined;

    const stops: Array<Record<string, string | number | undefined | null>> = [
      {
        type: "PICKUP",
        name: form.pickupName,
        address: form.pickupAddress || "",
        city: form.pickupCity,
        state: form.pickupState,
        zip: form.pickupZip || "",
        notes: form.pickupNotes || undefined,
        appointmentStart: pickupStart,
        appointmentEnd: pickupEnd,
        sequence: 1,
      },
      {
        type: "DELIVERY",
        name: form.deliveryName,
        address: form.deliveryAddress || "",
        city: form.deliveryCity,
        state: form.deliveryState,
        zip: form.deliveryZip || "",
        notes: form.deliveryNotes || undefined,
        appointmentStart: deliveryStart,
        appointmentEnd: deliveryEnd,
        sequence: 2,
      },
    ];

    try {
      const resolvedBusinessType = form.loadType === "BROKERED" ? "BROKER" : "COMPANY";
      await apiFetch("/loads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loadNumber: form.loadNumber.trim() ? form.loadNumber : undefined,
          tripNumber: form.tripNumber.trim() ? form.tripNumber : undefined,
          status: form.status || undefined,
          loadType: form.loadType || undefined,
          businessType: resolvedBusinessType,
          operatingEntityId: form.operatingEntityId || undefined,
          customerId: form.customerId || undefined,
          customerName: form.customerName,
          customerRef: form.customerRef || undefined,
          truckUnit: form.truckUnit || undefined,
          trailerUnit: form.trailerUnit || undefined,
          weightLbs: form.weightLbs ? Number(form.weightLbs) : undefined,
          rate: form.rate ? Number(form.rate) : undefined,
          miles: form.miles ? Number(form.miles) : undefined,
          salesRepName: form.salesRepName || undefined,
          dropName: form.dropName || undefined,
          desiredInvoiceDate: form.desiredInvoiceDate || undefined,
          stops,
        }),
      });
      setForm({
        loadNumber: "",
        status: "PLANNED",
        loadType: form.loadType === "BROKERED" ? "BROKERED" : "COMPANY",
        tripNumber: "",
        operatingEntityId: form.operatingEntityId,
        customerId: "",
        customerName: "",
        customerRef: "",
        truckUnit: "",
        trailerUnit: "",
        weightLbs: "",
        rate: "",
        miles: "",
        pickupDate: "",
        pickupTimeStart: "",
        pickupTimeEnd: "",
        pickupName: "",
        pickupAddress: "",
        pickupCity: "",
        pickupState: "",
        pickupZip: "",
        pickupNotes: "",
        deliveryDateStart: "",
        deliveryDateEnd: "",
        deliveryTimeEnd: "",
        deliveryName: "",
        deliveryAddress: "",
        deliveryCity: "",
        deliveryState: "",
        deliveryZip: "",
        deliveryNotes: "",
        salesRepName: "",
        dropName: "",
        desiredInvoiceDate: "",
      });
      setCustomerSuggestion(null);
      setCustomerLearnedApplied(false);
      setPickupSuggestion(null);
      setPickupNameSuggestion(null);
      setDeliverySuggestion(null);
      setDeliveryNameSuggestion(null);
      setPickupLearnedApplied(false);
      setDeliveryLearnedApplied(false);
      loadData();
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "ORG_NOT_OPERATIONAL") {
        setOperational(false);
        setBlocked({
          message: (error as Error).message || "Finish setup to create loads.",
          ctaHref: (error as { ctaHref?: string }).ctaHref || "/onboarding",
        });
        return;
      }
      setFormError((error as Error).message || "Failed to create load");
    }
  };

  const requestCustomerSuggestion = async () => {
    const rawName = form.customerName.trim();
    if (!rawName) {
      setCustomerSuggestion(null);
      return;
    }
    const queryKey = rawName.toLowerCase();
    if (queryKey === lastCustomerQuery.current) return;
    lastCustomerQuery.current = queryKey;
    try {
      const payload = await apiFetch<{
        suggestion: { suggestionJson: Record<string, unknown> | null; confidence: number; reason: string[] };
      }>("/learning/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "MATCH_CUSTOMER",
          inputJson: { rawCustomerName: rawName },
        }),
      });
      const suggestion = payload.suggestion.suggestionJson as
        | { customerId?: string; customerName?: string }
        | null;
      if (suggestion?.customerId && suggestion?.customerName) {
        setCustomerSuggestion({
          customerId: suggestion.customerId,
          customerName: suggestion.customerName,
          confidence: payload.suggestion.confidence,
        });
      } else {
        setCustomerSuggestion(null);
      }
    } catch {
      setCustomerSuggestion(null);
    }
  };

  const requestAddressSuggestion = async (target: "pickup" | "delivery") => {
    const rawAddress =
      target === "pickup"
        ? [form.pickupAddress, form.pickupCity, form.pickupState, form.pickupZip].filter(Boolean).join(", ")
        : [form.deliveryAddress, form.deliveryCity, form.deliveryState, form.deliveryZip].filter(Boolean).join(", ");
    if (rawAddress.trim().length < 6) {
      if (target === "pickup") setPickupSuggestion(null);
      else setDeliverySuggestion(null);
      return;
    }
    const queryKey = rawAddress.toLowerCase();
    const lastRef = target === "pickup" ? lastPickupQuery : lastDeliveryQuery;
    if (queryKey === lastRef.current) return;
    lastRef.current = queryKey;
    try {
      const payload = await apiFetch<{
        suggestion: { suggestionJson: Record<string, unknown> | null; confidence: number; reason: string[] };
      }>("/learning/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "MATCH_ADDRESS",
          inputJson: { rawAddressString: rawAddress },
        }),
      });
      const suggestion = payload.suggestion.suggestionJson as
        | { normalized?: { address?: string; city?: string; state?: string; zip?: string } }
        | { address?: string; city?: string; state?: string; zip?: string }
        | null;
      const normalized = (suggestion as any)?.normalized ?? suggestion;
      if (normalized?.address || normalized?.city || normalized?.state || normalized?.zip) {
        const nextSuggestion = {
          address: String(normalized.address ?? ""),
          city: String(normalized.city ?? ""),
          state: String(normalized.state ?? ""),
          zip: String(normalized.zip ?? ""),
        };
        if (target === "pickup") setPickupSuggestion(nextSuggestion);
        else setDeliverySuggestion(nextSuggestion);
      } else if (target === "pickup") {
        setPickupSuggestion(null);
      } else {
        setDeliverySuggestion(null);
      }
    } catch {
      if (target === "pickup") setPickupSuggestion(null);
      else setDeliverySuggestion(null);
    }
  };

  const requestStopNameSuggestion = async (target: "pickup" | "delivery") => {
    const rawName = target === "pickup" ? form.pickupName.trim() : form.deliveryName.trim();
    if (!rawName) {
      if (target === "pickup") setPickupNameSuggestion(null);
      else setDeliveryNameSuggestion(null);
      return;
    }
    const queryKey = rawName.toLowerCase();
    const lastRef = target === "pickup" ? lastPickupNameQuery : lastDeliveryNameQuery;
    if (queryKey === lastRef.current) return;
    lastRef.current = queryKey;
    try {
      const payload = await apiFetch<{
        suggestion: { suggestionJson: Record<string, unknown> | null; confidence: number; reason: string[] };
      }>("/learning/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: target === "pickup" ? "MATCH_SHIPPER" : "MATCH_CONSIGNEE",
          inputJson: { rawName },
        }),
      });
      const suggestion = payload.suggestion.suggestionJson as
        | { address?: string; city?: string; state?: string; zip?: string }
        | null;
      if (suggestion?.address || suggestion?.city || suggestion?.state || suggestion?.zip) {
        const nextSuggestion = {
          address: String(suggestion.address ?? ""),
          city: String(suggestion.city ?? ""),
          state: String(suggestion.state ?? ""),
          zip: String(suggestion.zip ?? ""),
        };
        if (target === "pickup") setPickupNameSuggestion(nextSuggestion);
        else setDeliveryNameSuggestion(nextSuggestion);
      } else if (target === "pickup") {
        setPickupNameSuggestion(null);
      } else {
        setDeliveryNameSuggestion(null);
      }
    } catch {
      if (target === "pickup") setPickupNameSuggestion(null);
      else setDeliveryNameSuggestion(null);
    }
  };

  const customers = useMemo(() => {
    const names = loads
      .map((load) => load.customer?.name ?? load.customerName)
      .filter(Boolean) as string[];
    return Array.from(new Set(names)).sort();
  }, [loads]);

  const statusTone = (status: string) => {
    if (status === "PAID" || status === "DELIVERED" || status === "INVOICED") return "success";
    if (status === "IN_TRANSIT") return "info";
    if (status === "READY_TO_INVOICE" || status === "POD_RECEIVED") return "warning";
    if (status === "CANCELLED") return "danger";
    return "neutral";
  };

  const baseLoads = useMemo(() => {
    return loads.map((load) => {
      const opsStatus = deriveOpsStatus(load);
      const billingStatus = deriveBillingStatus(load);
      const docsBlocker = deriveDocsBlocker(load);
      const trackingBadge = deriveTrackingBadge(load);
      const blocker = deriveBlocker(load, docsBlocker, trackingBadge);
      const primaryAction = derivePrimaryAction(load, blocker, trackingBadge, user?.role);
      return { load, opsStatus, billingStatus, docsBlocker, trackingBadge, blocker, primaryAction };
    });
  }, [loads, user?.role]);

  const pickupDateForLoad = (load: any) => {
    return load.shipperApptStart ?? load.shipperApptEnd ?? null;
  };

  const deliveryDateForLoad = (load: any) => {
    return load.consigneeApptStart ?? load.consigneeApptEnd ?? null;
  };

  const withinRange = (value: string | null, from: string, to: string) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  };

  const searchFiltered = useMemo(() => baseLoads, [baseLoads]);

  const chipDefinitions = useMemo(
    () => [
      {
        id: "active",
        label: "Active",
        predicate: (entry: any) => !["INVOICED", "PAID", "CANCELLED"].includes(entry.opsStatus),
      },
      {
        id: "archived",
        label: "Archived",
        predicate: (entry: any) => ["INVOICED", "PAID", "CANCELLED"].includes(entry.opsStatus),
      },
      {
        id: "delivered-unbilled",
        label: "Delivered – Unbilled",
        predicate: (entry: any) =>
          ["DELIVERED", "POD_RECEIVED"].includes(entry.opsStatus) &&
          (entry.docsBlocker !== null || entry.billingStatus !== "INVOICED"),
      },
      {
        id: "ready-to-invoice",
        label: "Ready to invoice",
        predicate: (entry: any) => entry.opsStatus === "READY_TO_INVOICE",
      },
      {
        id: "tracking-off",
        label: "Tracking off",
        predicate: (entry: any) =>
          ["ASSIGNED", "IN_TRANSIT"].includes(entry.opsStatus) && entry.trackingBadge.state === "OFF",
      },
      {
        id: "missing-pod",
        label: "Missing POD",
        predicate: (entry: any) => entry.docsBlocker?.type === "POD_MISSING",
      },
    ],
    []
  );

  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    chipDefinitions.forEach((chip) => {
      counts[chip.id] = searchFiltered.filter(chip.predicate).length;
    });
    return counts;
  }, [chipDefinitions, searchFiltered]);

  const filteredLoads = useMemo(() => {
    let result = searchFiltered;
    const activeChipDef = chipDefinitions.find((chip) => chip.id === activeChip);
    if (activeChipDef) {
      result = result.filter(activeChipDef.predicate);
    }
    if (refine.opsStatuses.length > 0) {
      result = result.filter((entry) => refine.opsStatuses.includes(entry.opsStatus));
    }
    if (refine.billingStatuses.length > 0) {
      result = result.filter((entry) =>
        entry.billingStatus ? refine.billingStatuses.includes(entry.billingStatus as BillingStatus) : false
      );
    }
    if (refine.customer) {
      result = result.filter((entry) =>
        (entry.load.customer?.name ?? entry.load.customerName) === refine.customer
      );
    }
    if (refine.driverId) {
      result = result.filter((entry) => entry.load.driver?.id === refine.driverId);
    }
    if (refine.pickupFrom || refine.pickupTo) {
      result = result.filter((entry) =>
        withinRange(pickupDateForLoad(entry.load), refine.pickupFrom, refine.pickupTo)
      );
    }
    if (refine.deliveryFrom || refine.deliveryTo) {
      result = result.filter((entry) =>
        withinRange(deliveryDateForLoad(entry.load), refine.deliveryFrom, refine.deliveryTo)
      );
    }
    if (refine.missingDocsOnly) {
      result = result.filter((entry) => entry.docsBlocker !== null);
    }
    if (refine.trackingOffOnly) {
      result = result.filter((entry) => entry.trackingBadge.state === "OFF");
    }
    return result;
  }, [searchFiltered, activeChip, refine, chipDefinitions]);

  const pagedLoads = filteredLoads;

  const clearFilters = () => {
    setSearchTerm("");
    setActiveChip("active");
    setRefine(defaultRefine);
    setTeamFilterId("");
  };

  return (
    <AppShell title="Loads" subtitle="Create, import, and manage loads">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-[color:var(--color-text-muted)]">Exception-first load queue</div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowCreate((prev) => !prev)}>
            {showCreate ? "Close create" : "Create load"}
          </Button>
          {canImport ? (
            <Button variant="secondary" onClick={() => setShowImport((prev) => !prev)}>
              {showImport ? "Hide bulk import" : "Bulk import"}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setShowExport((prev) => !prev)}>
            {showExport ? "Hide export" : "Export"}
          </Button>
          <Button variant="ghost" onClick={() => (window.location.href = "/loads/confirmations")}>
            RC Inbox
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr,0.8fr]">
        <div>
          <label htmlFor="loadsSearch" className="sr-only">Search loads</label>
          <Input
            id="loadsSearch"
            placeholder="Search loads, refs, customers, drivers…"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-end">
          <Button variant="secondary" size="sm" onClick={() => setShowFilters((prev) => !prev)}>
            {showFilters ? "Hide refine" : "Refine"}
          </Button>
        </div>
      </div>

      <div className="sticky top-4 z-10 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 shadow-[var(--shadow-subtle)]">
        <div className="flex flex-wrap gap-2">
          {chipDefinitions.map((chip) => {
            const active = chip.id === activeChip;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setActiveChip(chip.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)] ${
                  active
                    ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)] text-white"
                    : "border-[color:var(--color-divider)] bg-white text-[color:var(--color-text-muted)]"
                }`}
              >
                {chip.label}
                {chipCounts[chip.id] !== undefined ? (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? "bg-white/20 text-white" : "bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]"}`}>
                    {chipCounts[chip.id]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {showImport && canImport ? (
        <Card>
          <SectionHeader title="Bulk import" subtitle="Choose a format and preview before committing." />
          <div className="mt-4 space-y-4">
            <FormField label="Import format" htmlFor="importFormat">
              <Select id="importFormat" value={importMode} onChange={(event) => setImportMode(event.target.value as any)}>
                <option value="legacy">Loads + Stops templates</option>
                <option value="tms_load_sheet">TMS Load Sheet (Standard)</option>
              </Select>
            </FormField>
            {importMode === "legacy" ? <BulkLoadImport onImported={loadData} /> : null}
            {importMode === "tms_load_sheet" ? (
              <ImportWizard
                type="tms_load_sheet"
                title="TMS Load Sheet (Standard)"
                description="Uses the standard TMS load sheet header. Preview shows row-level warnings before commit."
                templateCsv={TMS_LOAD_SHEET_TEMPLATE}
                onImported={() => loadData()}
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      {showExport ? (
        <Card className="space-y-4">
          <SectionHeader title="Export loads" subtitle="Download a CSV for the current view or a date range." />
          {exportError ? (
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)]/80 px-3 py-2 text-sm text-[color:var(--color-danger)]">
              {exportError}
            </div>
          ) : null}
          {exportPreviewError ? (
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-warning-soft)] bg-[color:var(--color-warning-soft)]/80 px-3 py-2 text-sm text-[color:var(--color-warning)]">
              {exportPreviewError}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => downloadExport(buildParams({ includeChip: true }))} disabled={exporting}>
              {exporting ? "Exporting..." : "Export current view"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadExport(buildParams({ includeChip: true, format: "tms_load_sheet" }))}
              disabled={exporting}
            >
              Export TMS Load Sheet
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadExport(buildParams({ includeChip: true, rangeDays: 7 }))}
              disabled={exporting}
            >
              Last 7 days
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadExport(buildParams({ includeChip: true, rangeDays: 14 }))}
              disabled={exporting}
            >
              Last 14 days
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                previewExport(
                  buildParams({
                    includeChip: true,
                    fromDate: exportFrom || undefined,
                    toDate: exportTo || undefined,
                  })
                )
              }
              disabled={exportPreviewLoading}
            >
              {exportPreviewLoading ? "Checking..." : "Preview count"}
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr,1fr,auto]">
            <FormField label="From date" htmlFor="exportFrom">
              <Input type="date" value={exportFrom} onChange={(event) => setExportFrom(event.target.value)} />
            </FormField>
            <FormField label="To date" htmlFor="exportTo">
              <Input type="date" value={exportTo} onChange={(event) => setExportTo(event.target.value)} />
            </FormField>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                downloadExport(
                  buildParams({
                    includeChip: true,
                    fromDate: exportFrom || undefined,
                    toDate: exportTo || undefined,
                  })
                )
              }
              disabled={exporting || (!exportFrom && !exportTo)}
            >
              Export range
            </Button>
          </div>
          {exportPreviewCount !== null ? (
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Estimated rows: {exportPreviewCount}
              {exportPreviewMax ? ` (max ${exportPreviewMax})` : ""}
              {exportPreviewMax && exportPreviewCount > exportPreviewMax ? " · Too many rows — narrow your filters." : ""}
            </div>
          ) : null}
        </Card>
      ) : null}

      {showCreate ? (
        blocked || operational === false ? (
          <BlockedScreen
            isAdmin={user?.role === "ADMIN"}
            description={user?.role === "ADMIN" ? blocked?.message || "Finish setup to create loads." : undefined}
            ctaHref={user?.role === "ADMIN" ? blocked?.ctaHref || "/onboarding" : undefined}
          />
        ) : (
          <Card className="space-y-4">
            <SectionHeader title="Create load" subtitle="TMS Load Sheet standard" />
            {formError ? (
              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)]/80 px-3 py-2 text-sm text-[color:var(--color-danger)]">
                {formError}
              </div>
            ) : null}
            <div className="grid gap-3 lg:grid-cols-3">
              <FormField label="Load" htmlFor="loadNumber">
                <Input
                  placeholder="Auto"
                  value={form.loadNumber}
                  onChange={(e) => setForm({ ...form, loadNumber: e.target.value })}
                />
              </FormField>
              <FormField label="Trip number" htmlFor="tripNumber">
                <Input
                  placeholder="Auto"
                  value={form.tripNumber}
                  onChange={(e) => setForm({ ...form, tripNumber: e.target.value })}
                />
              </FormField>
              <FormField label="Status" htmlFor="status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="DRAFT">Draft</option>
                  <option value="PLANNED">Planned</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="IN_TRANSIT">In transit</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="POD_RECEIVED">POD received</option>
                  <option value="READY_TO_INVOICE">Ready to invoice</option>
                  <option value="INVOICED">Invoiced</option>
                  <option value="PAID">Paid</option>
                  <option value="CANCELLED">Cancelled</option>
                </Select>
              </FormField>
              <FormField label="Load type" htmlFor="loadType">
                <Select value={form.loadType} onChange={(e) => setForm({ ...form, loadType: e.target.value })}>
                  <option value="COMPANY">Company load</option>
                  <option value="BROKERED">Brokered load</option>
                </Select>
              </FormField>
              <FormField label="Operating entity" htmlFor="operatingEntity">
                {operatingEntities.length > 0 ? (
                  <Select
                    value={form.operatingEntityId}
                    onChange={(e) => setForm({ ...form, operatingEntityId: e.target.value })}
                  >
                    {operatingEntities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name} {entity.isDefault ? "· Default" : ""}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input disabled placeholder="Default operating entity" value="Default operating entity" />
                )}
              </FormField>
              <FormField label={form.loadType === "BROKERED" ? "Broker" : "Customer"} htmlFor="customerName" required>
                <Input
                  placeholder={form.loadType === "BROKERED" ? "Acme Brokerage" : "Acme Logistics"}
                  value={form.customerName}
                  onChange={(e) => {
                    setForm({ ...form, customerName: e.target.value, customerId: "" });
                    setCustomerLearnedApplied(false);
                    setCustomerSuggestion(null);
                  }}
                  onBlur={requestCustomerSuggestion}
                />
              </FormField>
              <FormField label="Cust Ref" htmlFor="customerRef">
                <Input
                  placeholder="PO-12345"
                  value={form.customerRef}
                  onChange={(e) => setForm({ ...form, customerRef: e.target.value })}
                />
              </FormField>
              <FormField label="Unit" htmlFor="unit">
                <Input
                  placeholder="TRK-12"
                  value={form.truckUnit}
                  onChange={(e) => setForm({ ...form, truckUnit: e.target.value })}
                />
              </FormField>
              <FormField label="Trailer" htmlFor="trailer">
                <Input
                  placeholder="TRL-08"
                  value={form.trailerUnit}
                  onChange={(e) => setForm({ ...form, trailerUnit: e.target.value })}
                />
              </FormField>
              <FormField label="As Wgt (lbs)" htmlFor="weight">
                <Input
                  placeholder="40000"
                  value={form.weightLbs}
                  onChange={(e) => setForm({ ...form, weightLbs: e.target.value })}
                />
              </FormField>
              <FormField label="Total Rev" htmlFor="rate">
                <Input
                  placeholder="2150"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                />
              </FormField>
              <FormField label="Miles" htmlFor="miles">
                <Input
                  placeholder="1200"
                  value={form.miles}
                  onChange={(e) => setForm({ ...form, miles: e.target.value })}
                />
              </FormField>
              <FormField label="Sales" htmlFor="sales">
                <Input
                  placeholder="Alex Martinez"
                  value={form.salesRepName}
                  onChange={(e) => setForm({ ...form, salesRepName: e.target.value })}
                />
              </FormField>
              <FormField label="Drop name" htmlFor="dropName">
                <Input
                  placeholder="Walmart Dock 12"
                  value={form.dropName}
                  onChange={(e) => setForm({ ...form, dropName: e.target.value })}
                />
              </FormField>
              <FormField label="Inv Date" htmlFor="invDate">
                <Input
                  type="date"
                  value={form.desiredInvoiceDate}
                  onChange={(e) => setForm({ ...form, desiredInvoiceDate: e.target.value })}
                />
              </FormField>
            </div>
            {customerSuggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                <span>Suggested customer: {customerSuggestion.customerName}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      customerName: customerSuggestion.customerName,
                      customerId: customerSuggestion.customerId,
                    }));
                    setCustomerLearnedApplied(true);
                    setCustomerSuggestion(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            ) : null}
            {customerLearnedApplied ? (
              <div className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                Customer filled from learned mapping.
              </div>
            ) : null}
            <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                Shipper (Pickup)
              </div>
              {pickupLearnedApplied ? (
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
              ) : null}
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <FormField label="PU Date F" htmlFor="puDate">
                <Input
                  type="date"
                  value={form.pickupDate}
                  onChange={(e) => setForm({ ...form, pickupDate: e.target.value })}
                />
              </FormField>
              <FormField label="PU Time F" htmlFor="puTimeF">
                <Input
                  type="time"
                  value={form.pickupTimeStart}
                  onChange={(e) => setForm({ ...form, pickupTimeStart: e.target.value })}
                />
              </FormField>
              <FormField label="PU Time T" htmlFor="puTimeT">
                <Input
                  type="time"
                  value={form.pickupTimeEnd}
                  onChange={(e) => setForm({ ...form, pickupTimeEnd: e.target.value })}
                />
              </FormField>
              <FormField label="Shipper" htmlFor="shipperName" required>
                <Input
                  placeholder="Fontana Yard"
                  value={form.pickupName}
                  onChange={(e) => {
                    setForm({ ...form, pickupName: e.target.value });
                    setPickupLearnedApplied(false);
                    setPickupNameSuggestion(null);
                  }}
                  onBlur={() => requestStopNameSuggestion("pickup")}
                />
              </FormField>
              <FormField label="Ship City" htmlFor="shipCity" required>
                <Input
                  placeholder="Fontana"
                  value={form.pickupCity}
                  onChange={(e) => {
                    setForm({ ...form, pickupCity: e.target.value });
                    setPickupLearnedApplied(false);
                    setPickupSuggestion(null);
                  }}
                  onBlur={() => requestAddressSuggestion("pickup")}
                />
              </FormField>
              <FormField label="Ship St" htmlFor="shipState" required>
                <Input
                  placeholder="CA"
                  value={form.pickupState}
                  onChange={(e) => {
                    setForm({ ...form, pickupState: e.target.value });
                    setPickupLearnedApplied(false);
                    setPickupSuggestion(null);
                  }}
                  onBlur={() => requestAddressSuggestion("pickup")}
                />
              </FormField>
            </div>
            {showStopDetails ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Shipper address" htmlFor="shipperAddress">
                  <Input
                    placeholder="14300 Slover Ave"
                    value={form.pickupAddress}
                    onChange={(e) => {
                      setForm({ ...form, pickupAddress: e.target.value });
                      setPickupLearnedApplied(false);
                      setPickupSuggestion(null);
                    }}
                    onBlur={() => requestAddressSuggestion("pickup")}
                  />
                </FormField>
                <FormField label="Shipper zip" htmlFor="shipperZip">
                  <Input
                    placeholder="92335"
                    value={form.pickupZip}
                    onChange={(e) => {
                      setForm({ ...form, pickupZip: e.target.value });
                      setPickupLearnedApplied(false);
                      setPickupSuggestion(null);
                    }}
                    onBlur={() => requestAddressSuggestion("pickup")}
                  />
                </FormField>
              </div>
            ) : null}
            <FormField label="Load Notes (Shipper)" htmlFor="shipperNotes">
              <Textarea
                rows={2}
                placeholder="Dock notes, appointment info, access instructions"
                value={form.pickupNotes}
                onChange={(e) => setForm({ ...form, pickupNotes: e.target.value })}
              />
            </FormField>
            {showStopDetails && pickupNameSuggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                <span>
                  Suggested address for shipper: {pickupNameSuggestion.address} {pickupNameSuggestion.city} {pickupNameSuggestion.state} {pickupNameSuggestion.zip}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      pickupAddress: pickupNameSuggestion.address,
                      pickupCity: pickupNameSuggestion.city,
                      pickupState: pickupNameSuggestion.state,
                      pickupZip: pickupNameSuggestion.zip,
                    }));
                    setPickupLearnedApplied(true);
                    setPickupNameSuggestion(null);
                    setPickupSuggestion(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            ) : null}
            {showStopDetails && pickupSuggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                <span>
                  Suggested address: {pickupSuggestion.address} {pickupSuggestion.city} {pickupSuggestion.state} {pickupSuggestion.zip}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      pickupAddress: pickupSuggestion.address,
                      pickupCity: pickupSuggestion.city,
                      pickupState: pickupSuggestion.state,
                      pickupZip: pickupSuggestion.zip,
                    }));
                    setPickupLearnedApplied(true);
                    setPickupSuggestion(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            ) : null}
            </div>
            <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                Consignee (Delivery)
              </div>
              {deliveryLearnedApplied ? (
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
              ) : null}
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <FormField label="Del Date F" htmlFor="delDateF">
                <Input
                  type="date"
                  value={form.deliveryDateStart}
                  onChange={(e) => setForm({ ...form, deliveryDateStart: e.target.value })}
                />
              </FormField>
              <FormField label="Del Date T" htmlFor="delDateT">
                <Input
                  type="date"
                  value={form.deliveryDateEnd}
                  onChange={(e) => setForm({ ...form, deliveryDateEnd: e.target.value })}
                />
              </FormField>
              <FormField label="Del Time T" htmlFor="delTimeT">
                <Input
                  type="time"
                  value={form.deliveryTimeEnd}
                  onChange={(e) => setForm({ ...form, deliveryTimeEnd: e.target.value })}
                />
              </FormField>
              <FormField label="Consignee" htmlFor="consigneeName" required>
                <Input
                  placeholder="Home Goods Wholesale Dock"
                  value={form.deliveryName}
                  onChange={(e) => {
                    setForm({ ...form, deliveryName: e.target.value });
                    setDeliveryLearnedApplied(false);
                    setDeliveryNameSuggestion(null);
                  }}
                  onBlur={() => requestStopNameSuggestion("delivery")}
                />
              </FormField>
              <FormField label="Cons City" htmlFor="consCity" required>
                <Input
                  placeholder="Indianapolis"
                  value={form.deliveryCity}
                  onChange={(e) => {
                    setForm({ ...form, deliveryCity: e.target.value });
                    setDeliveryLearnedApplied(false);
                    setDeliverySuggestion(null);
                  }}
                  onBlur={() => requestAddressSuggestion("delivery")}
                />
              </FormField>
              <FormField label="Cons St" htmlFor="consState" required>
                <Input
                  placeholder="IN"
                  value={form.deliveryState}
                  onChange={(e) => {
                    setForm({ ...form, deliveryState: e.target.value });
                    setDeliveryLearnedApplied(false);
                    setDeliverySuggestion(null);
                  }}
                  onBlur={() => requestAddressSuggestion("delivery")}
                />
              </FormField>
            </div>
            {showStopDetails ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Consignee address" htmlFor="consigneeAddress">
                  <Input
                    placeholder="6020 E 82nd St"
                    value={form.deliveryAddress}
                    onChange={(e) => {
                      setForm({ ...form, deliveryAddress: e.target.value });
                      setDeliveryLearnedApplied(false);
                      setDeliverySuggestion(null);
                    }}
                    onBlur={() => requestAddressSuggestion("delivery")}
                  />
                </FormField>
                <FormField label="Consignee zip" htmlFor="consigneeZip">
                  <Input
                    placeholder="46219"
                    value={form.deliveryZip}
                    onChange={(e) => {
                      setForm({ ...form, deliveryZip: e.target.value });
                      setDeliveryLearnedApplied(false);
                      setDeliverySuggestion(null);
                    }}
                    onBlur={() => requestAddressSuggestion("delivery")}
                  />
                </FormField>
              </div>
            ) : null}
            <FormField label="Load Notes (Consignee)" htmlFor="consigneeNotes">
              <Textarea
                rows={2}
                placeholder="Delivery notes, access instructions, appointment details"
                value={form.deliveryNotes}
                onChange={(e) => setForm({ ...form, deliveryNotes: e.target.value })}
              />
            </FormField>
            {showStopDetails && deliveryNameSuggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                <span>
                  Suggested address for consignee: {deliveryNameSuggestion.address} {deliveryNameSuggestion.city} {deliveryNameSuggestion.state} {deliveryNameSuggestion.zip}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      deliveryAddress: deliveryNameSuggestion.address,
                      deliveryCity: deliveryNameSuggestion.city,
                      deliveryState: deliveryNameSuggestion.state,
                      deliveryZip: deliveryNameSuggestion.zip,
                    }));
                    setDeliveryLearnedApplied(true);
                    setDeliveryNameSuggestion(null);
                    setDeliverySuggestion(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            ) : null}
            {showStopDetails && deliverySuggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                <span>
                  Suggested address: {deliverySuggestion.address} {deliverySuggestion.city} {deliverySuggestion.state} {deliverySuggestion.zip}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      deliveryAddress: deliverySuggestion.address,
                      deliveryCity: deliverySuggestion.city,
                      deliveryState: deliverySuggestion.state,
                      deliveryZip: deliverySuggestion.zip,
                    }));
                    setDeliveryLearnedApplied(true);
                    setDeliverySuggestion(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            ) : null}
            </div>
            <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-border)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
              <span>Stop address details (optional)</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowStopDetails((prev) => !prev)}
              >
                {showStopDetails ? "Hide address details" : "Add address details"}
              </Button>
            </div>
            <Button onClick={handleCreate}>Create load</Button>
          </Card>
        )
      ) : null}

      {showFilters ? (
        <RefinePanel>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Ops status</div>
              <div className="grid gap-2 text-sm">
                {OPS_STATUSES.map((status) => (
                  <CheckboxField
                    key={status}
                    id={`opsStatus-${status}`}
                    label={status.replaceAll("_", " ")}
                    checked={refine.opsStatuses.includes(status)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...refine.opsStatuses, status]
                        : refine.opsStatuses.filter((value) => value !== status);
                      setRefine({ ...refine, opsStatuses: next });
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Billing status</div>
              <div className="grid gap-2 text-sm">
                {BILLING_STATUSES.map((status) => (
                  <CheckboxField
                    key={status}
                    id={`billingStatus-${status}`}
                    label={status.replaceAll("_", " ")}
                    checked={refine.billingStatuses.includes(status)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...refine.billingStatuses, status]
                        : refine.billingStatuses.filter((value) => value !== status);
                      setRefine({ ...refine, billingStatuses: next });
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <FormField label="Customer" htmlFor="refineCustomer">
                <Select
                  value={refine.customer}
                  onChange={(event) => setRefine({ ...refine, customer: event.target.value })}
                >
                  <option value="">All customers</option>
                  {customers.map((customer) => (
                    <option key={customer} value={customer}>
                      {customer}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            {canSeeAllTeams ? (
              <div className="space-y-2">
                <FormField label="Team" htmlFor="refineTeam">
                  <Select value={teamFilterId} onChange={(event) => setTeamFilterId(event.target.value)}>
                    <option value="">All teams</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <FormField label="Driver" htmlFor="refineDriver">
                <Select
                  value={refine.driverId}
                  onChange={(event) => setRefine({ ...refine, driverId: event.target.value })}
                >
                  <option value="">All drivers</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Pickup range</div>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="From" htmlFor="pickupFrom">
                  <Input
                    type="date"
                    value={refine.pickupFrom}
                    onChange={(event) => setRefine({ ...refine, pickupFrom: event.target.value })}
                  />
                </FormField>
                <FormField label="To" htmlFor="pickupTo">
                  <Input
                    type="date"
                    value={refine.pickupTo}
                    onChange={(event) => setRefine({ ...refine, pickupTo: event.target.value })}
                  />
                </FormField>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Delivery range</div>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="From" htmlFor="deliveryFrom">
                  <Input
                    type="date"
                    value={refine.deliveryFrom}
                    onChange={(event) => setRefine({ ...refine, deliveryFrom: event.target.value })}
                  />
                </FormField>
                <FormField label="To" htmlFor="deliveryTo">
                  <Input
                    type="date"
                    value={refine.deliveryTo}
                    onChange={(event) => setRefine({ ...refine, deliveryTo: event.target.value })}
                  />
                </FormField>
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <CheckboxField
              id="missingDocsOnly"
              label="Missing docs only"
              checked={refine.missingDocsOnly}
              onChange={(event) => setRefine({ ...refine, missingDocsOnly: event.target.checked })}
            />
            <CheckboxField
              id="trackingOffOnly"
              label="Tracking off only"
              checked={refine.trackingOffOnly}
              onChange={(event) => setRefine({ ...refine, trackingOffOnly: event.target.checked })}
            />
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-[color:var(--color-text-muted)]">
              More filters
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <FormField label="Destination search" htmlFor="destSearch">
                <Input
                  placeholder="City, state, zip, or name"
                  value={refine.destSearch}
                  onChange={(event) => setRefine({ ...refine, destSearch: event.target.value })}
                />
              </FormField>
              <FormField label="Min rate" htmlFor="minRate">
                <Input
                  placeholder="1000"
                  value={refine.minRate}
                  onChange={(event) => setRefine({ ...refine, minRate: event.target.value })}
                />
              </FormField>
              <FormField label="Max rate" htmlFor="maxRate">
                <Input
                  placeholder="5000"
                  value={refine.maxRate}
                  onChange={(event) => setRefine({ ...refine, maxRate: event.target.value })}
                />
              </FormField>
            </div>
          </details>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={loadData}>
              Apply
            </Button>
            <Button size="sm" variant="secondary" onClick={clearFilters}>
              Reset
            </Button>
          </div>
        </RefinePanel>
      ) : null}

      {loads.length === 0 ? (
        <EmptyState
          title="Create your first load"
          description="Start with a manual load or import your existing CSVs."
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setShowCreate(true)}>Create load</Button>
              {canImport ? <Button variant="secondary" onClick={() => setShowImport(true)}>Bulk import</Button> : null}
              <Button variant="ghost" onClick={() => (window.location.href = "/loads/confirmations")}>RC Inbox</Button>
            </div>
          }
        />
      ) : filteredLoads.length === 0 ? (
        <EmptyState
          title={activeChip === "archived" ? "No archived loads in this range" : "No loads match these filters"}
          description={
            activeChip === "archived"
              ? "Switch back to Active loads or widen your date range to see more."
              : "Try a different chip or clear filters to see more loads."
          }
          action={
            <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {pagedLoads.map(({ load, opsStatus, billingStatus, trackingBadge, blocker, primaryAction }) => {
            const routeLeft =
              load.shipperCity && load.shipperState
                ? `${load.shipperCity}, ${load.shipperState}`
                : load.shipperName ?? "Shipper";
            const routeRight =
              load.consigneeCity && load.consigneeState
                ? `${load.consigneeCity}, ${load.consigneeState}`
                : load.consigneeName ?? "Consignee";
            const trackingText = trackingBadge.state === "ON"
              ? `Tracking ON${trackingBadge.lastPingAge ? ` · last ping ${trackingBadge.lastPingAge}` : ""}`
              : `Tracking OFF${trackingBadge.lastPingAge ? ` · last ping ${trackingBadge.lastPingAge}` : ""}`;
            const blockerTone =
              blocker?.severity === "danger"
                ? "border-l-[color:var(--color-danger)]"
                : blocker?.severity === "warning"
                  ? "border-l-[color:var(--color-warning)]"
                  : blocker?.severity === "info"
                    ? "border-l-[color:var(--color-info)]"
                    : "";
            const bannerTone =
              blocker?.severity === "danger"
                ? "border-[color:var(--color-danger)] bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]"
                : blocker?.severity === "warning"
                  ? "border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]"
                  : blocker?.severity === "info"
                    ? "border-[color:var(--color-info)] bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]"
                    : "border-transparent";
            return (
              <div
                key={load.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/loads/${load.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/loads/${load.id}`);
                  }
                }}
                className={`rounded-[var(--radius-card)] border border-[color:var(--color-divider)] border-l-4 ${blockerTone} bg-white px-4 py-4 shadow-[var(--shadow-subtle)] transition hover:translate-y-[-1px] hover:shadow-[var(--shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-ink">LOAD {load.loadNumber}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip label={opsStatus} tone={statusTone(opsStatus)} />
                    {billingStatus ? (
                      <StatusChip
                        label={billingStatus.replaceAll("_", " ")}
                        tone={
                          billingStatus === "INVOICED" || billingStatus === "PAID"
                            ? "success"
                            : billingStatus === "READY_TO_INVOICE"
                            ? "warning"
                            : "neutral"
                        }
                      />
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">
                  {routeLeft} → {routeRight} • {load.customer?.name ?? load.customerName ?? "Customer"}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--color-text-muted)]">
                  <div>Driver: {load.driver?.name ?? "Unassigned"}</div>
                  {load.miles ? <div>Miles: {load.miles}</div> : null}
                  {load.rate ? <div>Rate: {load.rate}</div> : null}
                  <div>{trackingText}</div>
                </div>
                {blocker ? (
                  <div
                    className={`mt-3 rounded-[var(--radius-control)] border px-3 py-2 text-xs font-medium leading-snug ${bannerTone}`}
                  >
                    {blocker.title}
                    {blocker.subtitle ? ` • ${blocker.subtitle}` : ""}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <Button
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(primaryAction.href);
                    }}
                  >
                    {primaryAction.label}
                  </Button>
                  <details
                    className="relative"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <summary className="cursor-pointer list-none rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-xs text-[color:var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]">
                      •••
                    </summary>
                    <div className="absolute right-0 mt-2 w-40 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-2 text-xs shadow-[var(--shadow-card)]">
                      <button
                        className="w-full rounded-[var(--radius-control)] px-2 py-2 text-left text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                        onClick={() => router.push(`/loads/${load.id}`)}
                      >
                        View details
                      </button>
                      <button
                        className="mt-1 w-full rounded-[var(--radius-control)] px-2 py-2 text-left text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                        onClick={() => router.push(`/loads/${load.id}`)}
                      >
                        Edit load
                      </button>
                      <button
                        className="mt-1 w-full rounded-[var(--radius-control)] px-2 py-2 text-left text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                        onClick={() => router.push(`/loads/${load.id}`)}
                      >
                        Upload doc
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Page {pageIndex + 1} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
                disabled={pageIndex === 0}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
                disabled={pageIndex >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

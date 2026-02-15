"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState } from "@/components/ui/empty-state";
import { Timeline } from "@/components/ui/timeline";
import { BlockerCard } from "@/components/ui/blocker-card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { formatDocStatusLabel, formatInvoiceStatusLabel, formatStatusLabel } from "@/lib/status-format";

import { API_BASE } from "@/lib/apiBase";
const DOC_TYPES = ["POD", "RATECON", "BOL", "LUMPER", "SCALE", "DETENTION", "OTHER"] as const;
const CHARGE_TYPES = ["LINEHAUL", "LUMPER", "DETENTION", "LAYOVER", "OTHER", "ADJUSTMENT"] as const;
const CHARGE_LABELS: Record<string, string> = {
  LINEHAUL: "Linehaul",
  LUMPER: "Lumper",
  DETENTION: "Detention",
  LAYOVER: "Layover",
  OTHER: "Other",
  ADJUSTMENT: "Adjustment",
};
const ACCESSORIAL_TYPES = ["DETENTION", "LUMPER", "TONU", "REDELIVERY", "STOP_OFF", "OTHER"] as const;
const ACCESSORIAL_LABELS: Record<string, string> = {
  DETENTION: "Detention",
  LUMPER: "Lumper",
  TONU: "TONU",
  REDELIVERY: "Redelivery",
  STOP_OFF: "Stop off",
  OTHER: "Other",
};
const ACCESSORIAL_REQUIRES_PROOF = new Set(["DETENTION", "LUMPER"]);
const ACCESSORIAL_STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Proposed",
  NEEDS_PROOF: "Needs proof",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const TIMELINE_STEPS = [
  { key: "DRAFT", label: "Draft" },
  { key: "PLANNED", label: "Planned" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "IN_TRANSIT", label: "In Transit" },
  { key: "DELIVERED", label: "Delivered" },
  { key: "POD_RECEIVED", label: "POD Received" },
  { key: "READY_TO_INVOICE", label: "Ready to Invoice" },
  { key: "INVOICED", label: "Invoiced" },
  { key: "PAID", label: "Paid" },
];

export default function LoadDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadId = params?.id as string | undefined;
  const [load, setLoad] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [tracking, setTracking] = useState<{ session: any | null; ping: any | null } | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [operatingEntities, setOperatingEntities] = useState<any[]>([]);
  const [settings, setSettings] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "billing" | "audit">("overview");
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [docChecklist, setDocChecklist] = useState<Record<string, any>>({});
  const [docRejectReasons, setDocRejectReasons] = useState<Record<string, string>>({});
  const [uploadType, setUploadType] = useState<string>("POD");
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [freightEditing, setFreightEditing] = useState(false);
  const [freightSaving, setFreightSaving] = useState(false);
  const [charges, setCharges] = useState<any[]>([]);
  const [chargeForm, setChargeForm] = useState({
    type: "LINEHAUL",
    description: "",
    amount: "",
  });
  const [chargeEditingId, setChargeEditingId] = useState<string | null>(null);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargeSaving, setChargeSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [chargeSuggestion, setChargeSuggestion] = useState<{
    type?: string;
    amountCents?: number;
    avgAmountCents?: number;
    minAmountCents?: number;
    maxAmountCents?: number;
  } | null>(null);
  const lastChargeQuery = useRef("");
  const [accessorialForm, setAccessorialForm] = useState({
    type: "DETENTION",
    amount: "",
    requiresProof: true,
    notes: "",
  });
  const [accessorialSaving, setAccessorialSaving] = useState(false);
  const [accessorialError, setAccessorialError] = useState<string | null>(null);
  const [accessorialActionId, setAccessorialActionId] = useState<string | null>(null);
  const [proofTargetId, setProofTargetId] = useState<string | null>(null);
  const proofInputRef = useRef<HTMLInputElement | null>(null);
  const [billingActionError, setBillingActionError] = useState<string | null>(null);
  const [freightForm, setFreightForm] = useState({
    loadType: "COMPANY",
    operatingEntityId: "",
    shipperReferenceNumber: "",
    consigneeReferenceNumber: "",
    palletCount: "",
    weightLbs: "",
  });
  const tabParam = searchParams?.get("tab");
  const docTypeParam = searchParams?.get("docType");

  useEffect(() => {
    if (!user) return;
    if (user.role === "DRIVER") {
      router.replace("/driver");
    }
  }, [loadId, router, user]);

  const loadData = useCallback(async () => {
    if (!loadId) return;
    try {
      const [loadData, timelineData, trackingData, meData, chargesData] = await Promise.all([
        apiFetch<{ load: any; settings: any | null }>(`/loads/${loadId}`),
        apiFetch<{ load: any; timeline: any[] }>(`/loads/${loadId}/timeline`),
        apiFetch<{ session: any | null; ping: any | null }>(`/tracking/load/${loadId}/latest`),
        apiFetch<{ user: any }>("/auth/me"),
        apiFetch<{ charges: any[] }>(`/loads/${loadId}/charges`),
      ]);
      setLoad(loadData.load);
      setSettings(loadData.settings ?? null);
      setTimeline(timelineData.timeline ?? []);
      setTracking(trackingData);
      setUser(meData.user);
      setCharges(chargesData.charges ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [loadId]);

  const handleDeleteLoad = async () => {
    if (!loadId) return;
    setDeleteError(null);
    const reason = window.prompt("Reason for deleting this load? This action is permanent in the UI.");
    if (!reason || !reason.trim()) {
      setDeleteError("Delete reason is required.");
      return;
    }
    setDeleting(true);
    try {
      await apiFetch(`/loads/${loadId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      router.push("/loads");
    } catch (err) {
      setDeleteError((err as Error).message || "Failed to delete load.");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const description = chargeForm.description.trim();
    if (!description || !load?.id) {
      setChargeSuggestion(null);
      return;
    }
    const queryKey = `${load.customerId ?? "org"}::${description.toLowerCase()}`;
    if (queryKey === lastChargeQuery.current) return;
    const timeout = setTimeout(async () => {
      lastChargeQuery.current = queryKey;
      try {
        const payload = await apiFetch<{
          suggestion: { suggestionJson: Record<string, unknown> | null; confidence: number; reason: string[] };
        }>("/learning/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain: "CHARGE_SUGGESTION",
            inputJson: { description, customerId: load.customerId ?? null },
          }),
        });
        const suggestion = payload.suggestion.suggestionJson as
          | { type?: string; amountCents?: number; avgAmountCents?: number; minAmountCents?: number; maxAmountCents?: number }
          | null;
        if (suggestion?.type) {
          setChargeSuggestion(suggestion);
        } else {
          setChargeSuggestion(null);
        }
      } catch {
        setChargeSuggestion(null);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [chargeForm.description, load?.customerId, load?.id]);

  useEffect(() => {
    if (!tabParam) {
      setActiveTab("overview");
      return;
    }
    if (tabParam === "overview" || tabParam === "documents" || tabParam === "billing" || tabParam === "audit") {
      setActiveTab(tabParam);
      return;
    }
    if (tabParam === "stops") {
      setActiveTab("overview");
      setPendingAnchor("stops");
      return;
    }
    setActiveTab("overview");
  }, [tabParam]);

  useEffect(() => {
    if (pendingAnchor) {
      const target = document.getElementById(pendingAnchor);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        setPendingAnchor(null);
      }
      return;
    }
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const target = document.getElementById(hash);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeTab, pendingAnchor, loadId, load?.docs?.length]);

  const docTypeOptions = useMemo<(typeof DOC_TYPES)[number][]>(() => {
    if (load?.loadType === "COMPANY") {
      return DOC_TYPES.filter((type) => type !== "RATECON") as (typeof DOC_TYPES)[number][];
    }
    return [...DOC_TYPES];
  }, [load?.loadType]);

  useEffect(() => {
    if (!docTypeParam) return;
    if (docTypeOptions.includes(docTypeParam as (typeof DOC_TYPES)[number])) {
      setUploadType(docTypeParam);
    }
  }, [docTypeParam, docTypeOptions]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    apiFetch<{ entities: any[] }>("/api/operating-entities")
      .then((data) => setOperatingEntities(data.entities))
      .catch(() => setOperatingEntities([]));
  }, [user]);

  useEffect(() => {
    if (!load || freightEditing) return;
    setFreightForm({
      loadType: load.loadType ?? "COMPANY",
      operatingEntityId: load.operatingEntityId ?? "",
      shipperReferenceNumber: load.shipperReferenceNumber ?? "",
      consigneeReferenceNumber: load.consigneeReferenceNumber ?? "",
      palletCount: load.palletCount !== null && load.palletCount !== undefined ? String(load.palletCount) : "",
      weightLbs: load.weightLbs !== null && load.weightLbs !== undefined ? String(load.weightLbs) : "",
    });
  }, [load, freightEditing]);

  const podDocs = useMemo(() => load?.docs?.filter((doc: any) => doc.type === "POD") ?? [], [load?.docs]);
  const docCount = load?.docs?.length ?? 0;
  const podStatus = useMemo(() => {
    if (podDocs.length === 0) return "Missing";
    if (podDocs.some((doc: any) => doc.status === "REJECTED")) return "Rejected";
    if (podDocs.some((doc: any) => doc.status === "VERIFIED")) return "Verified";
    return "Uploaded";
  }, [podDocs]);
  const rateConRequired = Boolean(settings?.requireRateConBeforeDispatch && load?.loadType === "BROKERED");
  const hasRateCon = useMemo(
    () => (load?.docs ?? []).some((doc: any) => doc.type === "RATECON" || doc.type === "RATE_CONFIRMATION"),
    [load?.docs]
  );
  const dispatchStage =
    load?.status && ["DRAFT", "PLANNED", "ASSIGNED"].includes(load.status);
  const rateConMissing = dispatchStage && rateConRequired && !hasRateCon;
  const assignmentMissing = dispatchStage && (!load?.assignedDriverId || !load?.truckId);
  const documentsIndicator = podStatus === "Verified" ? "OK" : podStatus === "Rejected" ? "X" : "!";
  const docsBlocker = useMemo(() => {
    if (load?.status === "READY_TO_INVOICE" || load?.status === "INVOICED" || load?.status === "PAID") return null;
    if (load?.status !== "DELIVERED" && load?.status !== "POD_RECEIVED") return null;
    if (podStatus === "Rejected") {
      return { type: "DOCS_REJECTED", title: "Docs rejected", subtitle: "Billing blocked" };
    }
    if (podStatus === "Uploaded") {
      return { type: "DOCS_UNDER_REVIEW", title: "POD under review", subtitle: "Billing blocked" };
    }
    if (podStatus === "Missing") {
      return { type: "POD_MISSING", title: "POD missing", subtitle: "Billing blocked" };
    }
    return null;
  }, [load?.status, podStatus]);

  const shipperStop = load?.stops?.find((stop: any) => stop.type === "PICKUP");
  const consigneeStop = load?.stops?.find((stop: any) => stop.type === "DELIVERY");

  const linehaulRateNumber = load?.rate ? Number(load.rate) : null;
  const linehaulCentsFromRate = linehaulRateNumber !== null && !Number.isNaN(linehaulRateNumber)
    ? Math.round(linehaulRateNumber * 100)
    : null;
  const hasStoredLinehaul = charges.some((charge) => charge.type === "LINEHAUL");
  const impliedLinehaul =
    !hasStoredLinehaul && linehaulCentsFromRate !== null
      ? {
          id: "implied-linehaul",
          type: "LINEHAUL",
          description: "Linehaul (from load rate)",
          amountCents: linehaulCentsFromRate,
          implied: true,
        }
      : null;
  const displayCharges = impliedLinehaul ? [impliedLinehaul, ...charges] : charges;
  const chargesTotalCents = displayCharges.reduce((sum, charge) => sum + (charge.amountCents ?? 0), 0);
  const billingBlockingReasons = (load?.billingBlockingReasons ?? []) as string[];
  const billingStatus = load?.billingStatus ?? null;
  const billingStatusLabel =
    billingStatus === "READY" ? "Ready to bill" : billingStatus === "INVOICED" ? "Invoiced" : "Blocked";
  const billingStatusTone =
    billingStatus === "READY" ? "success" : billingStatus === "INVOICED" ? "info" : "warning";
  const canGenerateInvoice = Boolean(load?.status === "READY_TO_INVOICE" && billingStatus === "READY");
  const accessorials = load?.accessorials ?? [];

  const openDoc = (doc: any) => {
    const name = doc.filename?.split("/").pop();
    if (!name) return;
    window.open(`${API_BASE}/files/docs/${name}`, "_blank");
  };

  const verifyDoc = async (docId: string) => {
    const checklist = docChecklist[docId] || { signature: true, printed: true, date: true, pages: 1 };
    await apiFetch(`/docs/${docId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requireSignature: Boolean(checklist.signature),
        requirePrintedName: Boolean(checklist.printed),
        requireDeliveryDate: Boolean(checklist.date),
        pages: Number(checklist.pages || 1),
      }),
    });
    loadData();
  };

  const rejectDoc = async (docId: string) => {
    const reason = docRejectReasons[docId];
    if (!reason) return;
    await apiFetch(`/docs/${docId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectReason: reason }),
    });
    loadData();
  };

  const uploadDoc = async (file: File) => {
    if (!loadId) return;
    setUploading(true);
    setUploadNote(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", uploadType);
      await apiFetch(`/loads/${loadId}/docs`, { method: "POST", body });
      setUploadNote("Document uploaded.");
      loadData();
    } catch (err) {
      setUploadNote((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const canEditCharges =
    user?.role === "ADMIN" || user?.role === "DISPATCHER" || user?.role === "HEAD_DISPATCHER";
  const canViewCharges =
    user?.role === "ADMIN" ||
    user?.role === "DISPATCHER" ||
    user?.role === "HEAD_DISPATCHER" ||
    user?.role === "BILLING";
  const canManageAccessorials =
    user?.role === "ADMIN" || user?.role === "DISPATCHER" || user?.role === "HEAD_DISPATCHER" || user?.role === "BILLING";
  const canApproveAccessorials = user?.role === "ADMIN" || user?.role === "BILLING";
  const canBillActions = user?.role === "ADMIN" || user?.role === "BILLING";
  const quickbooksEnabled = process.env.NEXT_PUBLIC_QUICKBOOKS_ENABLED === "true";

  const formatAmount = (cents: number) => (cents / 100).toFixed(2);
  const formatMoney = (value: any) => {
    if (value === null || value === undefined) return "-";
    const numeric = typeof value === "string" ? Number(value) : Number(value);
    if (Number.isNaN(numeric)) return String(value);
    return numeric.toFixed(2);
  };
  const parseAmountToCents = (value: string) => {
    const normalized = value.replace(/[^0-9.-]/g, "");
    if (!normalized) return null;
    const amount = Number(normalized);
    if (Number.isNaN(amount)) return null;
    return Math.round(amount * 100);
  };

  const resetChargeForm = () => {
    setChargeForm({ type: "LINEHAUL", description: "", amount: "" });
    setChargeEditingId(null);
    setChargeError(null);
    setChargeSuggestion(null);
  };

  const saveCharge = async () => {
    if (!loadId) return;
    const amountCents = parseAmountToCents(chargeForm.amount);
    if (amountCents === null) {
      setChargeError("Enter a valid amount.");
      return;
    }
    setChargeSaving(true);
    try {
      if (chargeEditingId) {
        await apiFetch(`/loads/${loadId}/charges/${chargeEditingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: chargeForm.type,
            description: chargeForm.description || undefined,
            amountCents,
          }),
        });
      } else {
        await apiFetch(`/loads/${loadId}/charges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: chargeForm.type,
            description: chargeForm.description || undefined,
            amountCents,
          }),
        });
      }
      resetChargeForm();
      loadData();
    } catch (err) {
      setChargeError((err as Error).message);
    } finally {
      setChargeSaving(false);
    }
  };

  const editCharge = (charge: any) => {
    setChargeEditingId(charge.id);
    setChargeForm({
      type: charge.type ?? "OTHER",
      description: charge.description ?? "",
      amount: formatAmount(charge.amountCents ?? 0),
    });
    setChargeSuggestion(null);
  };

  const deleteCharge = async (chargeId: string) => {
    if (!loadId) return;
    setChargeSaving(true);
    try {
      await apiFetch(`/loads/${loadId}/charges/${chargeId}`, { method: "DELETE" });
      if (chargeEditingId === chargeId) {
        resetChargeForm();
      }
      loadData();
    } catch (err) {
      setChargeError((err as Error).message);
    } finally {
      setChargeSaving(false);
    }
  };

  const resetAccessorialForm = () => {
    const requiresProof = ACCESSORIAL_REQUIRES_PROOF.has("DETENTION");
    setAccessorialForm({ type: "DETENTION", amount: "", requiresProof, notes: "" });
    setAccessorialError(null);
  };

  const parseAmount = (value: string) => {
    const cents = parseAmountToCents(value);
    if (cents === null) return null;
    return (cents / 100).toFixed(2);
  };

  const accessorialTone = (status: string) => {
    if (status === "APPROVED") return "success";
    if (status === "REJECTED") return "danger";
    return "warning";
  };

  const saveAccessorial = async () => {
    if (!loadId) return;
    const amount = parseAmount(accessorialForm.amount);
    if (!amount) {
      setAccessorialError("Enter a valid amount.");
      return;
    }
    setAccessorialSaving(true);
    try {
      await apiFetch(`/loads/${loadId}/accessorials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: accessorialForm.type,
          amount,
          requiresProof: accessorialForm.requiresProof,
          notes: accessorialForm.notes || undefined,
        }),
      });
      resetAccessorialForm();
      loadData();
    } catch (err) {
      setAccessorialError((err as Error).message);
    } finally {
      setAccessorialSaving(false);
    }
  };

  const handleProofUpload = (accessorialId: string) => {
    setProofTargetId(accessorialId);
    proofInputRef.current?.click();
  };

  const uploadAccessorialProof = async (file: File, accessorialId: string) => {
    if (!loadId) return;
    const body = new FormData();
    body.append("file", file);
    body.append("type", "ACCESSORIAL_PROOF");
    body.append("accessorialId", accessorialId);
    await apiFetch(`/loads/${loadId}/docs`, { method: "POST", body });
  };

  const handleProofFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file || !proofTargetId) return;
    setAccessorialActionId(proofTargetId);
    setAccessorialError(null);
    try {
      await uploadAccessorialProof(file, proofTargetId);
      loadData();
    } catch (err) {
      setAccessorialError((err as Error).message);
    } finally {
      setAccessorialActionId(null);
      setProofTargetId(null);
      event.target.value = "";
    }
  };

  const approveAccessorial = async (accessorialId: string) => {
    setAccessorialActionId(accessorialId);
    setAccessorialError(null);
    try {
      await apiFetch(`/accessorials/${accessorialId}/approve`, { method: "POST" });
      loadData();
    } catch (err) {
      setAccessorialError((err as Error).message);
    } finally {
      setAccessorialActionId(null);
    }
  };

  const rejectAccessorial = async (accessorialId: string) => {
    setAccessorialActionId(accessorialId);
    setAccessorialError(null);
    try {
      await apiFetch(`/accessorials/${accessorialId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Rejected" }),
      });
      loadData();
    } catch (err) {
      setAccessorialError((err as Error).message);
    } finally {
      setAccessorialActionId(null);
    }
  };

  const markInvoiced = async () => {
    if (!loadId) return;
    setBillingActionError(null);
    try {
      await apiFetch(`/billing/readiness/${loadId}/mark-invoiced`, { method: "POST" });
      loadData();
    } catch (err) {
      setBillingActionError((err as Error).message);
    }
  };

  const sendToQuickbooks = async () => {
    if (!loadId) return;
    setBillingActionError(null);
    try {
      await apiFetch(`/billing/readiness/${loadId}/quickbooks`, { method: "POST" });
      loadData();
    } catch (err) {
      setBillingActionError((err as Error).message);
    }
  };

  const saveFreight = async () => {
    if (!loadId) return;
    setFreightSaving(true);
    try {
      const payload: Record<string, any> = {
        loadType: freightForm.loadType,
        shipperReferenceNumber: freightForm.shipperReferenceNumber,
        consigneeReferenceNumber: freightForm.consigneeReferenceNumber,
        palletCount: freightForm.palletCount,
        weightLbs: freightForm.weightLbs,
      };
      if (freightForm.operatingEntityId) {
        payload.operatingEntityId = freightForm.operatingEntityId;
      }
      await apiFetch(`/loads/${loadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setFreightEditing(false);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFreightSaving(false);
    }
  };

  const generateInvoice = async () => {
    if (!loadId) return;
    await apiFetch(`/billing/invoices/${loadId}/generate`, { method: "POST" });
    loadData();
  };

  const invoice = load?.invoices?.[0] ?? null;

  const downloadInvoicePdf = useCallback(() => {
    if (!invoice?.id) {
      setBillingActionError("Invoice not generated.");
      return;
    }
    if (!invoice?.pdfPath) {
      setBillingActionError("Invoice PDF is not available for this invoice yet.");
      return;
    }
    setBillingActionError(null);
    window.open(`${API_BASE}/invoices/${invoice.id}/pdf`, "_blank", "noopener,noreferrer");
  }, [invoice]);

  const downloadInvoicePacket = useCallback(async () => {
    if (!invoice?.id) {
      setBillingActionError("Invoice not generated.");
      return;
    }
    setBillingActionError(null);
    try {
      let packetPath = invoice.packetPath as string | null;
      if (!packetPath) {
        const result = await apiFetch<{ packetPath?: string | null }>(`/billing/invoices/${invoice.id}/packet`, { method: "POST" });
        packetPath = result.packetPath ?? null;
      }
      if (!packetPath) {
        throw new Error("Packet is not available for this invoice yet.");
      }
      const filename = packetPath.split("/").pop();
      if (!filename) {
        throw new Error("Packet path is invalid.");
      }
      window.open(`${API_BASE}/files/packets/${encodeURIComponent(filename)}`, "_blank", "noopener,noreferrer");
      if (!invoice.packetPath) {
        loadData();
      }
    } catch (err) {
      setBillingActionError((err as Error).message);
    }
  }, [invoice, loadData]);

  const latestPing = tracking?.ping;
  const pingLat = latestPing?.lat ? Number(latestPing.lat) : null;
  const pingLng = latestPing?.lng ? Number(latestPing.lng) : null;
  const mapLink = pingLat !== null && pingLng !== null ? `https://www.google.com/maps?q=${pingLat},${pingLng}` : null;

  const canVerify = user?.role === "ADMIN" || user?.role === "BILLING" || user?.role === "DISPATCHER" || user?.role === "HEAD_DISPATCHER";
  const canUpload =
    user?.role === "ADMIN" || user?.role === "DISPATCHER" || user?.role === "HEAD_DISPATCHER";
  const canEditLoad =
    user?.role === "ADMIN" || user?.role === "DISPATCHER" || user?.role === "HEAD_DISPATCHER";

  const timelineItems = timeline.map((item) => ({
    id: item.id,
    title: item.message,
    subtitle: item.type,
    time: item.time ? new Date(item.time).toLocaleString() : undefined,
  }));

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  const formatAge = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const statusTone = (status?: string) => {
    if (!status) return "neutral";
    if (status === "PAID" || status === "DELIVERED" || status === "INVOICED") return "success";
    if (status === "IN_TRANSIT") return "info";
    if (status === "READY_TO_INVOICE" || status === "POD_RECEIVED") return "warning";
    if (status === "CANCELLED") return "danger";
    return "neutral";
  };

  const podTone: "success" | "danger" | "warning" | "neutral" =
    podStatus === "Verified" ? "success" : podStatus === "Rejected" ? "danger" : podStatus === "Uploaded" ? "warning" : "neutral";

  const billingLabel = useMemo(() => {
    if (invoice?.status) return formatInvoiceStatusLabel(invoice.status);
    if (load?.status === "PAID") return "PAID";
    if (load?.status === "READY_TO_INVOICE") return "READY TO INVOICE";
    if (load?.status === "POD_RECEIVED") return "POD RECEIVED";
    if (load?.status === "DELIVERED") return "DOCS NEEDED";
    return null;
  }, [invoice?.status, load?.status]);

  const billingTone = (status?: string | null) => {
    if (!status) return "neutral";
    if (status === "PAID") return "success";
    if (status.includes("READY")) return "warning";
    if (status.includes("DISPUTED")) return "danger";
    if (status.includes("DOCS")) return "warning";
    return "info";
  };

  const getEventTime = useCallback((type: string) => {
    let found: string | null = null;
    for (const item of timeline) {
      if (item.type !== type || !item.time) continue;
      const date = new Date(item.time);
      if (Number.isNaN(date.getTime())) continue;
      const iso = date.toISOString();
      if (!found || date.getTime() < new Date(found).getTime()) {
        found = iso;
      }
    }
    return found;
  }, [timeline]);

  const timelineSteps = useMemo(() => {
    const draft = load?.createdAt ?? getEventTime("EVENT_LOAD_CREATED");
    const planned = load?.plannedAt ?? draft;
    const assigned = load?.assignedDriverAt ?? getEventTime("EVENT_LOAD_ASSIGNED");
    const inTransit = getEventTime("EVENT_STOP_DEPARTED");
    const delivered = load?.deliveredAt ?? getEventTime("EVENT_STOP_ARRIVED");
    const podReceived = podDocs.length
      ? podDocs.reduce((earliest: string | null, doc: any) => {
          const uploadedAt = doc.uploadedAt ? new Date(doc.uploadedAt).toISOString() : null;
          if (!uploadedAt) return earliest;
          if (!earliest || new Date(uploadedAt).getTime() < new Date(earliest).getTime()) {
            return uploadedAt;
          }
          return earliest;
        }, null)
      : null;
    const readyToInvoice = load?.podVerifiedAt ?? getEventTime("DOC_VERIFIED");
    const invoiced = invoice?.generatedAt ?? getEventTime("INVOICE_GENERATED");
    const paid = invoice?.paidAt ?? getEventTime("SETTLEMENT_PAID");
    const times: Record<string, string | null> = {
      DRAFT: draft ?? null,
      PLANNED: planned ?? null,
      ASSIGNED: assigned ?? null,
      IN_TRANSIT: inTransit ?? null,
      DELIVERED: delivered ?? null,
      POD_RECEIVED: podReceived ?? null,
      READY_TO_INVOICE: readyToInvoice ?? null,
      INVOICED: invoiced ?? null,
      PAID: paid ?? null,
    };
    return TIMELINE_STEPS.map((step) => ({
      key: step.key,
      label: step.label,
      time: times[step.key] ?? null,
    }));
  }, [load, invoice, getEventTime, podDocs]);

  const lastPingAt = tracking?.ping?.capturedAt ?? null;
  const lastPingAge = formatAge(lastPingAt);
  const pingStale = lastPingAt ? Date.now() - new Date(lastPingAt).getTime() > 15 * 60 * 1000 : true;
  const trackingState =
    tracking?.session?.status === "ON" || (lastPingAt && !pingStale) ? "ON" : tracking?.session?.status ?? "OFF";
  const canStartTracking =
    user?.role === "ADMIN" ||
    user?.role === "DISPATCHER" ||
    user?.role === "HEAD_DISPATCHER" ||
    user?.role === "DRIVER";

  const formatStopLocation = (stop: any) => {
    if (!stop) return "-";
    if (stop.city) {
      return `${stop.city}${stop.state ? `, ${stop.state}` : ""}`;
    }
    return stop.name ?? "-";
  };

  const routeSummary = `${formatStopLocation(shipperStop)} -> ${formatStopLocation(consigneeStop)}`;
  const customerName = load?.customer?.name ?? load?.customerName ?? "-";

  const nextAction = useMemo(() => {
    if (!load) return null;
    if (rateConMissing) {
      if (canUpload) {
        return {
          label: "Upload RateCon",
          href: `/loads/${load.id}?tab=documents&docType=RATECON`,
          reason: "Dispatch blocked until rate confirmation is uploaded.",
        };
      }
      return {
        label: "Open documents",
        href: `/loads/${load.id}?tab=documents&docType=RATECON`,
        reason: "Rate confirmation required before dispatch.",
      };
    }
    if (assignmentMissing) {
      if (canEditLoad) {
        return {
          label: "Assign equipment",
          href: "/dispatch",
          reason: "Driver and truck are required to dispatch.",
        };
      }
      return { label: "Open dispatch", href: "/dispatch", reason: "Assignment required before dispatch." };
    }
    if (docsBlocker?.type === "POD_MISSING" || docsBlocker?.type === "DOCS_REJECTED") {
      if (canUpload) {
        return {
          label: "Upload POD",
          href: `/loads/${load.id}?tab=documents&docType=POD`,
          reason: "Billing blocked until POD is uploaded.",
        };
      }
      return {
        label: "Open documents",
        href: `/loads/${load.id}?tab=documents&docType=POD`,
        reason: "POD required for billing.",
      };
    }
    if (docsBlocker?.type === "DOCS_UNDER_REVIEW") {
      if (canVerify) {
        return {
          label: "Review POD",
          href: `/loads/${load.id}?tab=documents&docType=POD`,
          reason: "POD uploaded and awaiting review.",
        };
      }
      return {
        label: "Open documents",
        href: `/loads/${load.id}?tab=documents&docType=POD`,
        reason: "POD awaiting review.",
      };
    }
    if (load?.status === "READY_TO_INVOICE") {
      if (canVerify) {
        return { label: "Create invoice", href: `/loads/${load.id}?tab=billing`, reason: "Docs approved and ready." };
      }
      return { label: "Open billing", href: `/loads/${load.id}?tab=billing`, reason: "Ready for invoicing." };
    }
    if (load?.status === "DRAFT" || load?.status === "PLANNED" || load?.status === "ASSIGNED") {
      if (canEditLoad) {
        return { label: "Dispatch", href: `/loads/${load.id}?tab=overview`, reason: "Assign driver and equipment." };
      }
      return { label: "Open", href: `/loads/${load.id}`, reason: "Review current load status." };
    }
    if (load?.status === "IN_TRANSIT" && trackingState === "OFF") {
      if (canStartTracking) {
        return { label: "Enable tracking", href: `/loads/${load.id}?tab=overview#tracking`, reason: "Tracking is OFF." };
      }
      return { label: "Open tracking", href: `/loads/${load.id}?tab=overview#tracking`, reason: "Tracking is OFF." };
    }
    return null;
  }, [
    load,
    docsBlocker,
    canUpload,
    canVerify,
    canEditLoad,
    canStartTracking,
    trackingState,
    rateConMissing,
    assignmentMissing,
  ]);

  const resolvedNextAction = useMemo(() => {
    if (!nextAction) return null;
    if (
      load?.id &&
      (nextAction.label.toLowerCase().includes("dispatch") || nextAction.reason?.toLowerCase().includes("assign driver"))
    ) {
      return { ...nextAction, href: `/dispatch?loadId=${load.id}` };
    }
    return nextAction;
  }, [nextAction, load?.id]);

  const dispatchBlockers = useMemo(() => {
    const items: Array<{ title: string; subtitle: string; ctaLabel: string; href: string; tone?: "warning" | "danger" | "info" }> = [];
    if (rateConMissing) {
      items.push({
        title: "Rate confirmation missing",
        subtitle: "Dispatch blocked until RateCon is uploaded.",
        ctaLabel: "Fix now",
        href: `/loads/${load?.id}?tab=documents&docType=RATECON`,
        tone: "warning",
      });
    }
    if (assignmentMissing) {
      items.push({
        title: "Assignment incomplete",
        subtitle: "Driver and truck required before dispatch.",
        ctaLabel: canEditLoad ? "Open dispatch" : "Open dispatch",
        href: "/dispatch",
        tone: "info",
      });
    }
    if (load?.status && !["DRAFT", "PLANNED", "ASSIGNED"].includes(load.status)) {
      items.push({
        title: "Dispatch locked",
        subtitle: `Load is ${formatStatusLabel(load.status)}. Dispatch is only available before transit.`,
        ctaLabel: "Fix now",
        href: `/loads/${load.id}?tab=overview`,
        tone: "danger",
      });
    }
    return items;
  }, [rateConMissing, assignmentMissing, canEditLoad, load?.id, load?.status]);

  const docsBlockerCard = useMemo(() => {
    if (!docsBlocker || !load?.id) return null;
    if (docsBlocker.type === "POD_MISSING") {
      return {
        title: "POD missing",
        subtitle: "Billing blocked until POD is uploaded.",
        ctaLabel: "Fix now",
        href: `/loads/${load.id}?tab=documents&docType=POD#pod`,
        tone: "danger" as const,
      };
    }
    if (docsBlocker.type === "DOCS_REJECTED") {
      return {
        title: "POD rejected",
        subtitle: "Re-upload required to proceed with billing.",
        ctaLabel: canUpload ? "Re-upload POD" : "Open documents",
        href: `/loads/${load.id}?tab=documents&docType=POD#pod`,
        tone: "danger" as const,
      };
    }
    if (docsBlocker.type === "DOCS_UNDER_REVIEW") {
      return {
        title: "POD pending review",
        subtitle: "Verify the POD to move into billing.",
        ctaLabel: canVerify ? "Review POD" : "Open documents",
        href: `/loads/${load.id}?tab=documents&docType=POD#pod`,
        tone: "warning" as const,
      };
    }
    return null;
  }, [docsBlocker, load?.id, canUpload, canVerify]);

  return (
    <AppShell title="Load Details" subtitle="Shipper -> Consignee, documents, tracking, billing">
      {error ? <ErrorBanner message={error} /> : null}
      {deleteError ? <ErrorBanner message={deleteError} /> : null}
      {load?.deletedAt ? (
        <Card className="border border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)]/50 px-4 py-3 text-sm text-[color:var(--color-danger)]">
          This load was deleted on {new Date(load.deletedAt).toLocaleString()}
          {load.deletedBy ? ` by ${load.deletedBy.name ?? load.deletedBy.email}` : ""}
          {load.deletedReason ? ` · Reason: ${load.deletedReason}` : ""}.
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Load</div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-2xl font-semibold text-ink">{load?.loadNumber ?? loadId}</div>
              <StatusChip label={load?.status ?? "UNKNOWN"} tone={statusTone(load?.status)} />
              {billingLabel ? <StatusChip label={billingLabel} tone={billingTone(billingLabel)} /> : null}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Trip: {load?.tripNumber ?? "-"}</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {routeSummary} - {customerName}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Operating entity: {load?.operatingEntity?.name ?? "-"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {resolvedNextAction ? (
              <Button onClick={() => router.push(resolvedNextAction.href)}>{resolvedNextAction.label}</Button>
            ) : null}
            <details className="relative">
              <summary className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] text-sm text-[color:var(--color-text-muted)]">
                ...
                <span className="sr-only">More actions</span>
              </summary>
              <div className="absolute right-0 z-10 mt-2 w-44 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-2 shadow-subtle">
                <button
                  type="button"
                  className="w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-ink hover:bg-[color:var(--color-panel)]"
                  onClick={() => {
                    if (!loadId) return;
                    const params = new URLSearchParams(searchParams?.toString() ?? "");
                    params.set("tab", "documents");
                    router.replace(`/loads/${loadId}?${params.toString()}`);
                  }}
                >
                  Open documents
                </button>
                <button
                  type="button"
                  className="w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-ink hover:bg-[color:var(--color-panel)]"
                  onClick={() => {
                    if (!loadId) return;
                    const params = new URLSearchParams(searchParams?.toString() ?? "");
                    params.set("tab", "billing");
                    router.replace(`/loads/${loadId}?${params.toString()}`);
                  }}
                >
                  Open billing
                </button>
                <button
                  type="button"
                  className="w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-ink hover:bg-[color:var(--color-panel)]"
                  onClick={() => {
                    if (!loadId) return;
                    const params = new URLSearchParams(searchParams?.toString() ?? "");
                    params.set("tab", "audit");
                    router.replace(`/loads/${loadId}?${params.toString()}`);
                  }}
                >
                  View audit
                </button>
                {user?.role === "ADMIN" ? (
                  <button
                    type="button"
                    className="w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger-soft)]/40 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleDeleteLoad}
                    disabled={deleting || Boolean(load?.deletedAt)}
                  >
                    {load?.deletedAt ? "Load deleted" : deleting ? "Deleting..." : "Delete load"}
                  </button>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      </Card>

      <Card className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Rate", value: load?.rate ?? "-" },
          { label: "Miles", value: load?.miles ?? "-" },
          { label: "Driver", value: load?.driver?.name ?? "Unassigned" },
          { label: "Truck/Trailer", value: `${load?.truck?.unit ?? "-"} · ${load?.trailer?.unit ?? "-"}` },
        ].map((item) => (
          <div key={item.label} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">{item.label}</div>
            <div className="text-sm font-semibold text-ink">{item.value}</div>
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Workspace" subtitle="Review details, documents, billing, and audit trail" />
        <SegmentedControl
          value={activeTab}
          options={[
            { label: "Overview", value: "overview" },
            { label: `Documents (${docCount}) ${documentsIndicator}`, value: "documents" },
            { label: "Billing", value: "billing" },
            { label: "Audit", value: "audit" },
          ]}
          onChange={(value) => {
            const next = value as "overview" | "documents" | "billing" | "audit";
            setActiveTab(next);
            if (!loadId) return;
            const params = new URLSearchParams(searchParams?.toString() ?? "");
            params.set("tab", next);
            router.replace(`/loads/${loadId}?${params.toString()}`);
          }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr,0.9fr]">
        <div className="space-y-6">
          {activeTab === "overview" ? (
            <>
              <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SectionHeader title="Timeline" subtitle="Milestones and billing gates" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (!loadId) return;
                      const params = new URLSearchParams(searchParams?.toString() ?? "");
                      params.set("tab", "audit");
                      router.replace(`/loads/${loadId}?${params.toString()}`);
                    }}
                  >
                    View audit
                  </Button>
                </div>
                <div className="space-y-3">
                  {timelineSteps.map((step) => (
                    <div key={step.key} className="flex items-center justify-between text-sm">
                      <div className="font-medium text-ink">{step.label}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">{formatDateTime(step.time)}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="space-y-3">
                <SectionHeader title="Details" subtitle="Stops, documents, notes, and history" />
                <details open className="group" id="stops">
                  <summary className="cursor-pointer text-sm font-medium text-ink">Stops</summary>
                  <div className="mt-3 grid gap-3">
                    {load?.stops?.map((stop: any) => (
                      <div key={stop.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                          {stop.type === "PICKUP" ? "Shipper" : stop.type === "DELIVERY" ? "Consignee" : "Yard"}
                        </div>
                        <div className="text-sm font-semibold text-ink">{stop.name}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          {stop.address}, {stop.city} {stop.state} {stop.zip}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">Status: {stop.status}</div>
                      </div>
                    ))}
                    {load?.stops?.length ? null : <EmptyState title="No stops yet." />}
                  </div>
                </details>
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-ink">Documents</summary>
                  <div className="mt-3 grid gap-2">
                    {load?.docs?.map((doc: any) => (
                      <div
                        key={doc.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-2"
                      >
                        <div>
                          <div className="text-sm font-semibold text-ink">{doc.type}</div>
                          <div className="text-xs text-[color:var(--color-text-muted)]">
                            {formatDocStatusLabel(doc.status)}
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => openDoc(doc)}>
                          Open
                        </Button>
                      </div>
                    ))}
                    {docCount === 0 ? <EmptyState title="No documents yet." /> : null}
                  </div>
                </details>
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-ink">Notes</summary>
                  <div className="mt-3 text-sm text-[color:var(--color-text-muted)]">
                    {load?.notes ?? "No notes yet."}
                  </div>
                </details>
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-ink">History</summary>
                  <div className="mt-3">
                    <Timeline items={timelineItems} />
                  </div>
                </details>
              </Card>
            </>
          ) : null}

          {activeTab === "documents" ? (
            <Card className="space-y-4" id="documents">
              <SectionHeader title="Documents" subtitle="Review uploads and verify POD" />
              <div className="grid gap-3">
                {load?.docs?.map((doc: any) => (
                  <div
                    key={doc.id}
                    id={doc.type === "POD" ? "pod" : undefined}
                    className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-ink">{doc.type}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          {formatDocStatusLabel(doc.status)}
                        </div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => openDoc(doc)}>
                        Open
                      </Button>
                    </div>
                    {doc.type === "POD" && canVerify ? (
                      <div className="mt-3 space-y-2 text-sm text-[color:var(--color-text-muted)]">
                        <CheckboxField
                          id={`docSignature-${doc.id}`}
                          label="Signature present"
                          checked={docChecklist[doc.id]?.signature ?? true}
                          onChange={(e) =>
                            setDocChecklist({
                              ...docChecklist,
                              [doc.id]: { ...docChecklist[doc.id], signature: e.target.checked },
                            })
                          }
                        />
                        <CheckboxField
                          id={`docPrinted-${doc.id}`}
                          label="Printed name present"
                          checked={docChecklist[doc.id]?.printed ?? true}
                          onChange={(e) =>
                            setDocChecklist({
                              ...docChecklist,
                              [doc.id]: { ...docChecklist[doc.id], printed: e.target.checked },
                            })
                          }
                        />
                        <CheckboxField
                          id={`docDate-${doc.id}`}
                          label="Consignee date present"
                          checked={docChecklist[doc.id]?.date ?? true}
                          onChange={(e) =>
                            setDocChecklist({
                              ...docChecklist,
                              [doc.id]: { ...docChecklist[doc.id], date: e.target.checked },
                            })
                          }
                        />
                        <FormField label="Pages" htmlFor={`docPages-${doc.id}`}>
                          <Input
                            type="number"
                            min={1}
                            value={docChecklist[doc.id]?.pages ?? 1}
                            onChange={(e) =>
                              setDocChecklist({
                                ...docChecklist,
                                [doc.id]: { ...docChecklist[doc.id], pages: e.target.value },
                              })
                            }
                          />
                        </FormField>
                        <FormField label="Reject reason" htmlFor={`docReject-${doc.id}`} hint="Required to reject">
                          <Input
                            placeholder="Explain the issue"
                            value={docRejectReasons[doc.id] ?? ""}
                            onChange={(e) => setDocRejectReasons({ ...docRejectReasons, [doc.id]: e.target.value })}
                          />
                        </FormField>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => verifyDoc(doc.id)}>
                            Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => rejectDoc(doc.id)}
                            disabled={!docRejectReasons[doc.id]}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
                {docCount === 0 ? <EmptyState title="No documents yet." /> : null}
              </div>
            </Card>
          ) : null}

          {activeTab === "billing" ? (
            <Card className="space-y-4" id="billing">
              <SectionHeader title="Billing" subtitle="Invoice status and actions" />
              {load ? (
                <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-muted)] px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                      Billing readiness
                    </div>
                    <StatusChip label={billingStatusLabel} tone={billingStatusTone} />
                  </div>
                  {billingBlockingReasons.length > 0 ? (
                    <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                      <ul className="space-y-1">
                        {billingBlockingReasons.map((reason) => (
                          <li key={reason} className="flex items-start gap-2">
                            <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-[color:var(--color-text-muted)]" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                      All billing requirements are met.
                    </div>
                  )}
                </div>
              ) : null}
              <div className="text-sm text-[color:var(--color-text-muted)]">
                Invoice status: {invoice?.status ? formatInvoiceStatusLabel(invoice.status) : "Not generated"}
              </div>
              <div className="flex flex-wrap gap-2">
                {load?.status === "READY_TO_INVOICE" && canVerify ? (
                  <Button onClick={generateInvoice} disabled={!canGenerateInvoice}>
                    Generate invoice
                  </Button>
                ) : null}
                {invoice && (!invoice.pdfPath || !invoice.packetPath) && canVerify ? (
                  <Button variant="secondary" onClick={generateInvoice}>
                    Regenerate Invoice Files
                  </Button>
                ) : null}
                {billingStatus === "READY" && canBillActions ? (
                  <Button variant="secondary" onClick={markInvoiced}>
                    Mark invoiced
                  </Button>
                ) : null}
                {billingStatus === "READY" && canBillActions && quickbooksEnabled ? (
                  <Button variant="secondary" onClick={sendToQuickbooks}>
                    Send to QuickBooks
                  </Button>
                ) : null}
                {invoice ? (
                  <Button variant="secondary" onClick={downloadInvoicePdf}>
                    Download Invoice
                  </Button>
                ) : null}
                {invoice ? (
                  <Button variant="secondary" onClick={downloadInvoicePacket}>
                    Download Packet
                  </Button>
                ) : null}
              </div>
              {billingActionError ? (
                <div className="text-xs text-[color:var(--color-danger)]">{billingActionError}</div>
              ) : null}
              {billingStatus !== "READY" ? (
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Resolve readiness items before invoicing.
                </div>
              ) : null}
              {load?.externalInvoiceRef ? (
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  External invoice: {load.externalInvoiceRef}
                </div>
              ) : null}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Accessorials</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">{accessorials.length} total</div>
                </div>
                <div className="grid gap-2">
                  {accessorials.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-ink">{ACCESSORIAL_LABELS[item.type] ?? item.type}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">{item.notes || "—"}</div>
                        {item.requiresProof ? (
                          <div className="text-xs text-[color:var(--color-text-muted)]">
                            Proof: {item.proofDocumentId ? "On file" : "Required"}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm text-ink">${formatMoney(item.amount)}</div>
                        <StatusChip
                          label={ACCESSORIAL_STATUS_LABELS[item.status] ?? item.status}
                          tone={accessorialTone(item.status)}
                        />
                        {item.requiresProof && !item.proofDocumentId && canManageAccessorials ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleProofUpload(item.id)}
                            disabled={accessorialActionId === item.id || accessorialSaving}
                          >
                            Upload proof
                          </Button>
                        ) : null}
                        {canApproveAccessorials && item.status !== "APPROVED" && item.status !== "REJECTED" ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => approveAccessorial(item.id)}
                              disabled={accessorialActionId === item.id}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => rejectAccessorial(item.id)}
                              disabled={accessorialActionId === item.id}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {accessorials.length === 0 ? <EmptyState title="No accessorials yet." /> : null}
                </div>
                {accessorialError ? (
                  <div className="text-xs text-[color:var(--color-danger)]">{accessorialError}</div>
                ) : null}
                {canManageAccessorials ? (
                  <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-3">
                    <div className="grid gap-3 lg:grid-cols-4">
                      <FormField label="Type" htmlFor="accessorialType">
                        <Select
                          value={accessorialForm.type}
                          onChange={(event) => {
                            const nextType = event.target.value;
                            const requiresProof = ACCESSORIAL_REQUIRES_PROOF.has(nextType);
                            setAccessorialForm({ ...accessorialForm, type: nextType, requiresProof });
                          }}
                        >
                          {ACCESSORIAL_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {ACCESSORIAL_LABELS[type]}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label="Amount ($)" htmlFor="accessorialAmount">
                        <Input
                          placeholder="150.00"
                          value={accessorialForm.amount}
                          onChange={(event) => setAccessorialForm({ ...accessorialForm, amount: event.target.value })}
                        />
                      </FormField>
                      <FormField label="Notes" htmlFor="accessorialNotes">
                        <Input
                          placeholder="Detention after 2 hours"
                          value={accessorialForm.notes}
                          onChange={(event) => setAccessorialForm({ ...accessorialForm, notes: event.target.value })}
                        />
                      </FormField>
                      <div className="flex items-end">
                        <CheckboxField
                          id="accessorialProof"
                          label="Requires proof"
                          checked={accessorialForm.requiresProof}
                          onChange={(event) =>
                            setAccessorialForm({ ...accessorialForm, requiresProof: event.target.checked })
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={saveAccessorial} disabled={accessorialSaving}>
                        Add accessorial
                      </Button>
                      <Button size="sm" variant="secondary" onClick={resetAccessorialForm} disabled={accessorialSaving}>
                        Reset
                      </Button>
                    </div>
                  </div>
                ) : null}
                <input
                  ref={proofInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleProofFileChange}
                  className="hidden"
                />
              </div>
              {canViewCharges ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Charges</div>
                    <div className="text-sm font-semibold text-ink">Total ${formatAmount(chargesTotalCents)}</div>
                  </div>
                  <div className="grid gap-2">
                    {displayCharges.map((charge) => (
                      <div
                        key={charge.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-semibold text-ink">
                            {CHARGE_LABELS[charge.type] ?? charge.type}
                          </div>
                          <div className="text-xs text-[color:var(--color-text-muted)]">
                            {charge.description || "—"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-ink">${formatAmount(charge.amountCents)}</div>
                          {canEditCharges && !charge.implied ? (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => editCharge(charge)}>
                                Edit
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => deleteCharge(charge.id)} disabled={chargeSaving}>
                                Delete
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {displayCharges.length === 0 ? <EmptyState title="No charges yet." /> : null}
                  </div>
                  {canEditCharges ? (
                    <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-3">
                      <div className="grid gap-3 lg:grid-cols-3">
                        <FormField label="Charge type" htmlFor="chargeType">
                          <Select
                            value={chargeForm.type}
                            onChange={(event) => setChargeForm({ ...chargeForm, type: event.target.value })}
                          >
                            {CHARGE_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {CHARGE_LABELS[type]}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                        <FormField label="Description" htmlFor="chargeDescription">
                          <Input
                            placeholder="Detention after 2 hours"
                            value={chargeForm.description}
                            onChange={(event) => setChargeForm({ ...chargeForm, description: event.target.value })}
                          />
                        </FormField>
                        <FormField label="Amount ($)" htmlFor="chargeAmount">
                          <Input
                            placeholder="150.00"
                            value={chargeForm.amount}
                            onChange={(event) => setChargeForm({ ...chargeForm, amount: event.target.value })}
                          />
                        </FormField>
                      </div>
                      {chargeSuggestion ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                          <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Suggested</Badge>
                          <span>
                            {CHARGE_LABELS[chargeSuggestion.type ?? "OTHER"] ?? chargeSuggestion.type ?? "Other"}
                            {typeof (chargeSuggestion.avgAmountCents ?? chargeSuggestion.amountCents) === "number"
                              ? ` · $${formatAmount(chargeSuggestion.avgAmountCents ?? chargeSuggestion.amountCents ?? 0)}`
                              : ""}
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const amount = chargeSuggestion.avgAmountCents ?? chargeSuggestion.amountCents;
                              setChargeForm((prev) => ({
                                ...prev,
                                type: chargeSuggestion.type ?? prev.type,
                                amount: typeof amount === "number" ? formatAmount(amount) : prev.amount,
                              }));
                            }}
                          >
                            Apply
                          </Button>
                        </div>
                      ) : null}
                      {chargeError ? (
                        <div className="mt-2 text-xs text-[color:var(--color-danger)]">{chargeError}</div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={saveCharge} disabled={chargeSaving}>
                          {chargeEditingId ? "Update charge" : "Add charge"}
                        </Button>
                        {chargeEditingId ? (
                          <Button size="sm" variant="secondary" onClick={resetChargeForm} disabled={chargeSaving}>
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ) : null}

          {activeTab === "audit" ? (
            <Card className="space-y-4" id="audit">
              <SectionHeader title="Audit" subtitle="Chronological activity" />
              <Timeline items={timelineItems} />
            </Card>
          ) : null}
        </div>

        <div>
          <div className="sticky top-6 space-y-4">
            <Card className="space-y-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Next action</div>
              {resolvedNextAction ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-ink">{resolvedNextAction.label}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">{resolvedNextAction.reason}</div>
                  <Button size="sm" onClick={() => router.push(resolvedNextAction.href)}>
                    {resolvedNextAction.label}
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-[color:var(--color-text-muted)]">No immediate action.</div>
              )}
            </Card>

            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Documents & POD</div>
                <StatusChip label={podStatus} tone={podTone} />
              </div>
              {docsBlockerCard ? (
                <BlockerCard
                  title={docsBlockerCard.title}
                  subtitle={docsBlockerCard.subtitle}
                  ctaLabel={docsBlockerCard.ctaLabel}
                  onClick={() => router.push(docsBlockerCard.href)}
                  tone={docsBlockerCard.tone}
                />
              ) : (
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {podStatus === "Verified" ? "POD verified. Ready for billing." : "Awaiting POD for billing."}
                </div>
              )}
              <div className="grid gap-2">
                {load?.docs?.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-semibold text-ink">{doc.type}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {formatDocStatusLabel(doc.status)}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => openDoc(doc)}>
                      Open
                    </Button>
                  </div>
                ))}
                {docCount === 0 ? <EmptyState title="No documents yet." /> : null}
              </div>
              {canUpload ? (
                <div className="space-y-2">
                  <FormField label="Document type" htmlFor="uploadType">
                    <Select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
                      {docTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Upload file" htmlFor="uploadFile" hint="PDF or image">
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadDoc(file);
                      }}
                    />
                  </FormField>
                  {uploadNote ? <div className="text-xs text-[color:var(--color-text-muted)]">{uploadNote}</div> : null}
                </div>
              ) : null}
            </Card>

            <Card id="tracking" className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Tracking</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">Status: {trackingState}</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                Last ping: {lastPingAt ? `${formatDateTime(lastPingAt)}${lastPingAge ? ` - ${lastPingAge}` : ""}` : "-"}
              </div>
              {trackingState === "OFF" && canStartTracking ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!loadId) return;
                    try {
                      await apiFetch(`/tracking/load/${loadId}/start`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ providerType: "PHONE" }),
                      });
                      loadData();
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  Start tracking
                </Button>
              ) : null}
              {!pingStale && mapLink ? (
                <div className="space-y-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-3 text-xs text-[color:var(--color-text-muted)]">
                  Map preview available
                  <Button size="sm" variant="secondary" onClick={() => window.open(mapLink, "_blank")}>
                    Open map
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {lastPingAt ? "Ping stale." : "No recent pings."}
                </div>
              )}
              <div className="text-xs text-[color:var(--color-text-muted)]">Keep the page open for best results.</div>
            </Card>

            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Freight</div>
                {canEditLoad ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (freightEditing) {
                        setFreightEditing(false);
                      } else {
                        setFreightEditing(true);
                      }
                    }}
                  >
                    {freightEditing ? "Cancel" : "Edit"}
                  </Button>
                ) : null}
              </div>
              {freightEditing ? (
                <div className="space-y-2">
                  <FormField label="Load type" htmlFor="freightLoadType">
                    <Select
                      value={freightForm.loadType}
                      onChange={(e) => setFreightForm({ ...freightForm, loadType: e.target.value })}
                    >
                      <option value="COMPANY">Company</option>
                      <option value="BROKERED">Brokered</option>
                    </Select>
                  </FormField>
                  <FormField label="Operating entity" htmlFor="freightOperatingEntity">
                    {user?.role === "ADMIN" && operatingEntities.length > 0 ? (
                      <Select
                        value={freightForm.operatingEntityId}
                        onChange={(e) => setFreightForm({ ...freightForm, operatingEntityId: e.target.value })}
                      >
                        {operatingEntities.map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.name} {entity.isDefault ? "· Default" : ""}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input disabled value={load?.operatingEntity?.name ?? "Operating entity"} />
                    )}
                  </FormField>
                  <FormField label="Shipper reference #" htmlFor="freightShipperRef">
                    <Input
                      placeholder="SREF-1001"
                      value={freightForm.shipperReferenceNumber}
                      onChange={(e) => setFreightForm({ ...freightForm, shipperReferenceNumber: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Consignee reference #" htmlFor="freightConsigneeRef">
                    <Input
                      placeholder="CREF-1001"
                      value={freightForm.consigneeReferenceNumber}
                      onChange={(e) => setFreightForm({ ...freightForm, consigneeReferenceNumber: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Pallet count" htmlFor="freightPalletCount">
                    <Input
                      placeholder="10"
                      value={freightForm.palletCount}
                      onChange={(e) => setFreightForm({ ...freightForm, palletCount: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Weight (lbs)" htmlFor="freightWeightLbs">
                    <Input
                      placeholder="40000"
                      value={freightForm.weightLbs}
                      onChange={(e) => setFreightForm({ ...freightForm, weightLbs: e.target.value })}
                    />
                  </FormField>
                  <Button size="sm" onClick={saveFreight} disabled={freightSaving}>
                    {freightSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="text-sm text-[color:var(--color-text-muted)]">Pallets: {load?.palletCount ?? "-"}</div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">Weight: {load?.weightLbs ?? "-"} lbs</div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">Shipper ref: {load?.shipperReferenceNumber ?? "-"}</div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">Consignee ref: {load?.consigneeReferenceNumber ?? "-"}</div>
                </>
              )}
            </Card>

            <Card className="space-y-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Dispatch readiness</div>
              {dispatchBlockers.length > 0 ? (
                <div className="space-y-2">
                  {dispatchBlockers.map((blocker) => (
                    <BlockerCard
                      key={blocker.title}
                      title={blocker.title}
                      subtitle={blocker.subtitle}
                      ctaLabel={blocker.ctaLabel}
                      onClick={() => router.push(blocker.href)}
                      tone={blocker.tone ?? "info"}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[color:var(--color-text-muted)]">Dispatch requirements satisfied.</div>
              )}
            </Card>

            <Card className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Billing</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                Invoice: {invoice?.status ? formatInvoiceStatusLabel(invoice.status) : "Not generated"}
              </div>
              {load?.status === "READY_TO_INVOICE" && canVerify ? (
                <Button size="sm" onClick={generateInvoice}>
                  Generate invoice
                </Button>
              ) : null}
              {invoice ? (
                <Button size="sm" variant="secondary" onClick={downloadInvoicePdf}>
                  Download Invoice
                </Button>
              ) : null}
              {invoice ? (
                <Button size="sm" variant="secondary" onClick={downloadInvoicePacket}>
                  Download Packet
                </Button>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

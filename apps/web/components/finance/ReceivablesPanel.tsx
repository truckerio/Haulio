"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxField } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/ui/section-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { BlockedScreen } from "@/components/ui/blocked-screen";
import { NoAccess } from "@/components/rbac/no-access";
import { useUser } from "@/components/auth/user-context";
import { apiFetch, getApiBase } from "@/lib/api";
import { formatInvoiceStatusLabel } from "@/lib/status-format";
import { billingReadinessTone, deriveBillingReadiness } from "@/lib/billing-readiness";

const FILTERS = ["Missing POD", "Needs Verify", "Rejected", "Verified", "Ready to Invoice"] as const;

type QueueStatus = (typeof FILTERS)[number];

type LoadRow = {
  id: string;
  loadNumber: string;
  status: string;
  customer?: { name?: string } | null;
  customerName?: string | null;
  operatingEntity?: { name?: string } | null;
  stops?: any[];
  docs?: any[];
  palletCount?: number | null;
  weightLbs?: number | null;
  shipperReferenceNumber?: string | null;
  consigneeReferenceNumber?: string | null;
  invoices?: any[];
  queueStatus: QueueStatus;
};

type BillingLoad = {
  id: string;
  loadNumber: string;
  status: string;
  customerName?: string | null;
  stops?: any[];
  billingStatus: "BLOCKED" | "READY" | "INVOICED";
  billingBlockingReasons: string[];
};

const REASONS = {
  missingPod: "Missing POD",
  missingRateCon: "Missing Rate Confirmation",
  accessorialPending: "Accessorial pending resolution",
  accessorialProof: "Accessorial missing proof",
} as const;

const TABS = [
  { key: "READY", label: "Ready to Bill" },
  { key: "MISSING_POD", label: "Missing POD" },
  { key: "MISSING_RATECON", label: "Missing Rate Confirmation" },
  { key: "ACCESSORIAL", label: "Accessorial Issues" },
  { key: "OTHER", label: "Other Blocked" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function statusTone(status: QueueStatus) {
  if (status === "Needs Verify") return "warning";
  if (status === "Rejected") return "danger";
  if (status === "Verified") return "success";
  if (status === "Ready to Invoice") return "info";
  return "neutral";
}

function getPodStatus(load: any): QueueStatus {
  const podDocs = (load.docs ?? []).filter((doc: any) => doc.type === "POD");
  if (podDocs.length === 0) return "Missing POD";
  if (podDocs.some((doc: any) => doc.status === "REJECTED")) return "Rejected";
  if (podDocs.some((doc: any) => doc.status === "VERIFIED")) return "Verified";
  return "Needs Verify";
}

const getTabKey = (load: BillingLoad): TabKey => {
  if (load.billingStatus === "READY") return "READY";
  if (load.billingStatus === "INVOICED") return "OTHER";
  const reasons = load.billingBlockingReasons ?? [];
  if (reasons.includes(REASONS.missingPod)) return "MISSING_POD";
  if (reasons.includes(REASONS.missingRateCon)) return "MISSING_RATECON";
  if (reasons.includes(REASONS.accessorialPending) || reasons.includes(REASONS.accessorialProof)) {
    return "ACCESSORIAL";
  }
  return "OTHER";
};

const getTone = (load: BillingLoad) => {
  if (load.billingStatus === "READY") return "success";
  return "warning";
};

const formatRoute = (stops: any[] | undefined) => {
  if (!stops || stops.length === 0) return "Route unavailable";
  const pickup = stops.find((stop) => stop.type === "PICKUP");
  const deliveryStops = stops.filter((stop) => stop.type === "DELIVERY");
  const delivery = deliveryStops.length ? deliveryStops[deliveryStops.length - 1] : null;
  if (!pickup || !delivery) return "Route unavailable";
  return `${pickup.city ?? "-"}, ${pickup.state ?? "-"} → ${delivery.city ?? "-"}, ${delivery.state ?? "-"}`;
};

export function ReceivablesPanel({ focusReadiness = false }: { focusReadiness?: boolean }) {
  const { user, loading } = useUser();
  const canAccess = Boolean(user && ["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"].includes(user.role));
  const readinessRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusReadiness && readinessRef.current) {
      readinessRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusReadiness]);

  if (loading) {
    return <EmptyState title="Checking access..." />;
  }

  if (!canAccess) {
    return <NoAccess title="Receivables" />;
  }

  return (
    <div className="space-y-6">
      <div ref={readinessRef} id="finance-readiness" className="scroll-mt-24">
        <BillingReadinessPanel />
      </div>
      <BillingQueuePanel />
    </div>
  );
}

function BillingReadinessPanel() {
  const [loads, setLoads] = useState<BillingLoad[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("READY");

  useEffect(() => {
    apiFetch<{ loads: BillingLoad[] }>("/billing/readiness")
      .then((data) => {
        setLoads(data.loads ?? []);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<TabKey, BillingLoad[]> = {
      READY: [],
      MISSING_POD: [],
      MISSING_RATECON: [],
      ACCESSORIAL: [],
      OTHER: [],
    };
    for (const load of loads) {
      const key = getTabKey(load);
      if (load.billingStatus === "INVOICED" && key === "OTHER") continue;
      groups[key].push(load);
    }
    return groups;
  }, [loads]);

  const activeLoads = grouped[activeTab] ?? [];

  return (
    <>
      {error ? <ErrorBanner message={error} /> : null}
      <Card className="space-y-4">
        <SectionHeader
          title="Readiness queue"
          subtitle="Focus on what is blocking billing"
          action={
            <SegmentedControl
              value={activeTab}
              options={TABS.map((tab) => ({
                label: `${tab.label} (${grouped[tab.key]?.length ?? 0})`,
                value: tab.key,
              }))}
              onChange={(value) => setActiveTab(value as TabKey)}
            />
          }
        />
        <div className="grid gap-3">
          {activeLoads.map((load) => (
            <Link
              key={load.id}
              href={`/loads/${load.id}?tab=billing`}
              className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3 transition hover:border-[color:var(--color-divider-strong)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                    {load.status}
                  </div>
                  <div className="text-lg font-semibold text-ink">{load.loadNumber}</div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">{load.customerName ?? "Customer"}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">{formatRoute(load.stops)}</div>
                </div>
                <StatusChip
                  label={load.billingStatus === "READY" ? "Ready" : load.billingBlockingReasons[0] ?? "Blocked"}
                  tone={getTone(load)}
                />
              </div>
            </Link>
          ))}
          {activeLoads.length === 0 ? <EmptyState title="No loads in this view." /> : null}
        </div>
      </Card>
    </>
  );
}

function BillingQueuePanel() {
  const { user } = useUser();
  const [queue, setQueue] = useState<any>({ delivered: [], ready: [], invoiced: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Record<string, any>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [invoiceInputs, setInvoiceInputs] = useState<Record<string, any>>({});
  const [tab, setTab] = useState<"Needs POD" | "Ready" | "Disputed" | "Paid/Complete">("Needs POD");
  const [filters, setFilters] = useState<QueueStatus[]>(["Missing POD", "Needs Verify"]);
  const [blocked, setBlocked] = useState<{ message?: string; ctaHref?: string } | null>(null);

  const loadQueue = async () => {
    try {
      const data = await apiFetch("/billing/queue");
      setQueue(data);
      setLoadError(null);
      setLastLoadedAt(new Date().toLocaleTimeString());
    } catch (err) {
      const message = (err as Error).message;
      setLoadError(message);
      console.error("Billing queue load failed:", message);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadQueue();
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    apiFetch<{ state: { status?: string } }>("/onboarding/state")
      .then((payload) => {
        if (payload.state?.status === "NOT_ACTIVATED") {
          setBlocked({ message: "Finish setup to perform billing actions.", ctaHref: "/onboarding" });
        } else {
          setBlocked(null);
        }
      })
      .catch(() => {
        // ignore onboarding checks for non-admins or unexpected errors
      });
  }, [user]);

  useEffect(() => {
    if (tab === "Needs POD") {
      setFilters(["Missing POD", "Needs Verify"]);
    } else if (tab === "Ready") {
      setFilters(["Verified", "Ready to Invoice"]);
    } else if (tab === "Disputed") {
      setFilters(["Rejected"]);
    } else {
      setFilters([]);
    }
  }, [tab]);

  const handleOperationalError = (err: unknown) => {
    const code = (err as { code?: string })?.code;
    if (code === "ORG_NOT_OPERATIONAL") {
      setBlocked({
        message: (err as Error).message || "Finish setup to perform billing actions.",
        ctaHref: (err as { ctaHref?: string }).ctaHref || "/onboarding",
      });
      return true;
    }
    return false;
  };

  const verifyDoc = async (docId: string) => {
    const checks = checklist[docId] || { signature: true, printed: true, date: true, pages: 1 };
    try {
      await apiFetch(`/docs/${docId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requireSignature: checks.signature,
          requirePrintedName: checks.printed,
          requireDeliveryDate: checks.date,
          pages: Number(checks.pages || 1),
        }),
      });
      loadQueue();
    } catch (err) {
      if (!handleOperationalError(err)) {
        throw err;
      }
    }
  };

  const rejectDoc = async (docId: string) => {
    const reason = rejectReasons[docId];
    if (!reason) {
      return;
    }
    try {
      await apiFetch(`/docs/${docId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectReason: reason }),
      });
      loadQueue();
    } catch (err) {
      if (!handleOperationalError(err)) {
        throw err;
      }
    }
  };

  const generateInvoice = async (loadId: string) => {
    try {
      await apiFetch(`/billing/invoices/${loadId}/generate`, { method: "POST" });
      loadQueue();
    } catch (err) {
      if (!handleOperationalError(err)) {
        throw err;
      }
    }
  };

  const updateInvoiceStatus = async (invoiceId: string, status: string) => {
    const input = invoiceInputs[invoiceId] || {};
    try {
      await apiFetch(`/billing/invoices/${invoiceId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          disputeReason: input.disputeReason,
          disputeNotes: input.disputeNotes,
          paymentRef: input.paymentRef,
          shortPaidAmount: input.shortPaidAmount,
        }),
      });
      loadQueue();
    } catch (err) {
      if (!handleOperationalError(err)) {
        throw err;
      }
    }
  };

  const openFile = (path: string) => {
    const url = `${getApiBase()}${path}`;
    window.open(url, "_blank");
  };
  const openInvoicePdf = (invoiceId: string) => {
    openFile(`/invoices/${invoiceId}/pdf`);
  };

  const queueRows = useMemo(() => {
    const delivered = (queue.delivered ?? []).map((load: any) => ({
      ...load,
      queueStatus: getPodStatus(load),
    }));
    const ready = (queue.ready ?? []).map((load: any) => ({
      ...load,
      queueStatus: "Ready to Invoice" as QueueStatus,
    }));
    const rows = [...delivered, ...ready] as LoadRow[];
    const order: Record<QueueStatus, number> = {
      "Missing POD": 0,
      "Needs Verify": 1,
      "Rejected": 2,
      "Verified": 3,
      "Ready to Invoice": 4,
    };
    return rows.sort((a, b) => order[a.queueStatus] - order[b.queueStatus]);
  }, [queue]);

  const disputedRows = useMemo(() => {
    return (queue.invoiced ?? []).filter((load: any) => {
      const invoice = load.invoices?.[0];
      return invoice?.status === "DISPUTED" || invoice?.status === "SHORT_PAID";
    });
  }, [queue.invoiced]);

  const showInvoiced = tab === "Paid/Complete";
  const filteredRows = showInvoiced ? [] : queueRows.filter((row) => filters.includes(row.queueStatus));
  const activeRows = tab === "Disputed" ? disputedRows : filteredRows;

  if (blocked) {
    return (
      <BlockedScreen
        isAdmin={user?.role === "ADMIN"}
        description={user?.role === "ADMIN" ? blocked.message || "Finish setup to perform billing actions." : undefined}
        ctaHref={user?.role === "ADMIN" ? blocked.ctaHref || "/onboarding" : undefined}
      />
    );
  }

  return (
    <>
      {loadError ? <ErrorBanner message={loadError} /> : null}
      <Card className="space-y-4">
        <SectionHeader
          title="Billing queue"
          subtitle="POD verification and invoice readiness"
          action={
            <SegmentedControl
              value={tab}
              options={[
                { label: "Needs POD", value: "Needs POD" },
                { label: "Ready", value: "Ready" },
                { label: "Disputed", value: "Disputed" },
                { label: "Paid/Complete", value: "Paid/Complete" },
              ]}
              onChange={(value) => setTab(value as typeof tab)}
            />
          }
        />
        {process.env.NODE_ENV !== "production" ? (
          <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-muted)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
            Debug: api={getApiBase()} • delivered={(queue.delivered ?? []).length} • ready={(queue.ready ?? []).length} • invoiced=
            {(queue.invoiced ?? []).length} • tab={tab} • role={user?.role ?? "none"} • lastLoaded={lastLoadedAt ?? "never"}
            {loadError ? ` • error=${loadError}` : ""}
          </div>
        ) : null}

        <div className="grid gap-4">
          {activeRows.map((load: any) => {
            const readiness = deriveBillingReadiness({
              load,
              charges: load.charges ?? [],
              invoices: load.invoices ?? [],
            });
            const podDocs = (load.docs ?? []).filter((doc: any) => doc.type === "POD");
            const primaryDoc = podDocs[0];
            const shipper = load.stops?.find((stop: any) => stop.type === "PICKUP");
            const consignee = load.stops?.find((stop: any) => stop.type === "DELIVERY");
            const invoice = load.invoices?.[0] ?? null;
            const statusLabel =
              tab === "Disputed" && invoice?.status
                ? formatInvoiceStatusLabel(invoice.status)
                : load.queueStatus;
            const statusToneValue = tab === "Disputed" ? "danger" : statusTone(load.queueStatus);
            return (
              <div
                key={load.id}
                className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white py-4 pl-6 pr-4 shadow-[var(--shadow-subtle)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">{load.status}</div>
                    <div className="text-lg font-semibold text-ink">{load.loadNumber}</div>
                    <div className="text-sm text-[color:var(--color-text-muted)]">{load.customer?.name ?? load.customerName}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {shipper?.city ?? "-"}, {shipper?.state ?? "-"} → {consignee?.city ?? "-"}, {consignee?.state ?? "-"}
                    </div>
                  </div>
                  <StatusChip label={statusLabel} tone={statusToneValue} />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--color-text-muted)]">
                  <div>Operating entity: {load.operatingEntity?.name ?? "-"}</div>
                  <div>Pallets: {load.palletCount ?? "-"}</div>
                  <div>Weight: {load.weightLbs ?? "-"} lbs</div>
                  <div>Shipper ref: {load.shipperReferenceNumber ?? "-"}</div>
                  <div>Consignee ref: {load.consigneeReferenceNumber ?? "-"}</div>
                </div>

                <div className="mt-3 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-muted)] px-3 py-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                    Billing readiness
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {readiness.items.map((item) => (
                      <StatusChip
                        key={item.key}
                        label={`${item.label}${item.detail ? ` · ${item.detail}` : ""}`}
                        tone={billingReadinessTone(item.status)}
                      />
                    ))}
                  </div>
                </div>

                {load.queueStatus === "Ready to Invoice" ? (
                  <div className="mt-3">
                    <Button onClick={() => generateInvoice(load.id)} disabled={!readiness.readyForInvoice}>
                      Generate invoice
                    </Button>
                    {!readiness.readyForInvoice ? (
                      <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                        Resolve readiness items before invoicing.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {load.queueStatus === "Needs Verify" || load.queueStatus === "Rejected" ? (
                  <div className="mt-4 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-ink">POD review</div>
                      {primaryDoc ? (
                        <Button size="sm" variant="secondary" onClick={() => openFile(`/files/docs/${primaryDoc.filename.split("/").pop()}`)}>
                          Open POD
                        </Button>
                      ) : null}
                    </div>
                    {primaryDoc ? (
                      <div className="mt-2 grid gap-2 text-sm text-[color:var(--color-text-muted)] md:grid-cols-2">
                        <CheckboxField
                          id={`pod-signature-${primaryDoc.id}`}
                          label="Signature present"
                          checked={(checklist[primaryDoc.id]?.signature ?? true) as boolean}
                          onChange={(e) =>
                            setChecklist({
                              ...checklist,
                              [primaryDoc.id]: { ...checklist[primaryDoc.id], signature: e.target.checked },
                            })
                          }
                        />
                        <CheckboxField
                          id={`pod-printed-${primaryDoc.id}`}
                          label="Printed name present"
                          checked={(checklist[primaryDoc.id]?.printed ?? true) as boolean}
                          onChange={(e) =>
                            setChecklist({
                              ...checklist,
                              [primaryDoc.id]: { ...checklist[primaryDoc.id], printed: e.target.checked },
                            })
                          }
                        />
                        <CheckboxField
                          id={`pod-date-${primaryDoc.id}`}
                          label="Consignee date present"
                          checked={(checklist[primaryDoc.id]?.date ?? true) as boolean}
                          onChange={(e) =>
                            setChecklist({
                              ...checklist,
                              [primaryDoc.id]: { ...checklist[primaryDoc.id], date: e.target.checked },
                            })
                          }
                        />
                        <FormField label="Pages" htmlFor={`pod-pages-${primaryDoc.id}`}>
                          <Input
                            type="number"
                            min={1}
                            value={checklist[primaryDoc.id]?.pages ?? 1}
                            onChange={(e) =>
                              setChecklist({
                                ...checklist,
                                [primaryDoc.id]: { ...checklist[primaryDoc.id], pages: e.target.value },
                              })
                            }
                          />
                        </FormField>
                      </div>
                    ) : null}
                    <FormField label="Reject reason" htmlFor={`rejectReason-${primaryDoc?.id ?? "doc"}`} hint="Required to reject">
                      <Input
                        value={primaryDoc ? rejectReasons[primaryDoc.id] ?? "" : ""}
                        onChange={(e) =>
                          primaryDoc ? setRejectReasons({ ...rejectReasons, [primaryDoc.id]: e.target.value }) : null
                        }
                        placeholder="Explain why the POD was rejected"
                      />
                    </FormField>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {primaryDoc ? (
                        <Button size="sm" onClick={() => verifyDoc(primaryDoc.id)}>
                          Verify
                        </Button>
                      ) : null}
                      {primaryDoc ? (
                        <Button size="sm" variant="danger" onClick={() => rejectDoc(primaryDoc.id)} disabled={!rejectReasons[primaryDoc.id]}>
                          Reject
                        </Button>
                      ) : null}
                      <Button size="sm" variant="secondary" onClick={() => (window.location.href = `/loads/${load.id}`)}>
                        Open load
                      </Button>
                    </div>
                  </div>
                ) : null}

                {load.queueStatus === "Missing POD" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => (window.location.href = `/loads/${load.id}`)}>
                      Open load
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!showInvoiced && activeRows.length === 0 ? (
            <EmptyState title="No loads match this queue view." description="Try a different queue tab to review items." />
          ) : null}
        </div>
      </Card>

      {showInvoiced ? (
        <Card className="space-y-4">
          <SectionHeader title="Paid / Complete" subtitle="Invoices that have progressed beyond readiness" />
          <div className="grid gap-3">
            {queue.invoiced.map((load: any) => (
              <div
                key={load.id}
                className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white py-4 pl-6 pr-4"
              >
                <div className="text-sm font-semibold text-ink">{load.loadNumber}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">{load.customer?.name ?? load.customerName}</div>
                {load.invoices?.map((invoice: any) => (
                  <div key={invoice.id} className="mt-2 flex flex-wrap gap-2">
                    <div className="w-full text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">
                      {formatInvoiceStatusLabel(invoice.status)}
                    </div>
                    <div className="w-full text-sm text-[color:var(--color-text-muted)]">
                      Total ${Number(invoice.totalAmount ?? 0).toFixed(2)}
                    </div>
                    {invoice.pdfPath ? (
                      <Button size="sm" variant="secondary" onClick={() => openInvoicePdf(invoice.id)}>
                        Download PDF
                      </Button>
                    ) : null}
                    {invoice.packetPath ? (
                      <Button size="sm" variant="secondary" onClick={() => openFile(`/files/packets/${invoice.packetPath.split("/").pop()}`)}>
                        Download Packet
                      </Button>
                    ) : null}
                    <div className="w-full rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-3">
                      <div className="grid gap-2 text-sm">
                        <FormField label="Payment reference" htmlFor={`paymentRef-${invoice.id}`}>
                          <Input
                            placeholder="ACH-12345"
                            value={invoiceInputs[invoice.id]?.paymentRef ?? ""}
                            onChange={(e) =>
                              setInvoiceInputs({
                                ...invoiceInputs,
                                [invoice.id]: { ...invoiceInputs[invoice.id], paymentRef: e.target.value },
                              })
                            }
                          />
                        </FormField>
                        <FormField label="Short-paid amount" htmlFor={`shortPaid-${invoice.id}`} hint="Optional">
                          <Input
                            placeholder="100.00"
                            value={invoiceInputs[invoice.id]?.shortPaidAmount ?? ""}
                            onChange={(e) =>
                              setInvoiceInputs({
                                ...invoiceInputs,
                                [invoice.id]: { ...invoiceInputs[invoice.id], shortPaidAmount: e.target.value },
                              })
                            }
                          />
                        </FormField>
                        <FormField label="Dispute reason" htmlFor={`disputeReason-${invoice.id}`}>
                          <Input
                            placeholder="Rate discrepancy"
                            value={invoiceInputs[invoice.id]?.disputeReason ?? ""}
                            onChange={(e) =>
                              setInvoiceInputs({
                                ...invoiceInputs,
                                [invoice.id]: { ...invoiceInputs[invoice.id], disputeReason: e.target.value },
                              })
                            }
                          />
                        </FormField>
                        <FormField label="Dispute notes" htmlFor={`disputeNotes-${invoice.id}`}>
                          <Textarea
                            className="min-h-[70px]"
                            placeholder="Add context for the dispute"
                            value={invoiceInputs[invoice.id]?.disputeNotes ?? ""}
                            onChange={(e) =>
                              setInvoiceInputs({
                                ...invoiceInputs,
                                [invoice.id]: { ...invoiceInputs[invoice.id], disputeNotes: e.target.value },
                              })
                            }
                          />
                        </FormField>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => updateInvoiceStatus(invoice.id, "SENT")}>
                          Mark sent
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => updateInvoiceStatus(invoice.id, "ACCEPTED")}>
                          Mark accepted
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => updateInvoiceStatus(invoice.id, "PAID")}>
                          Mark paid
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => updateInvoiceStatus(invoice.id, "SHORT_PAID")}>
                          Mark short-paid
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => updateInvoiceStatus(invoice.id, "DISPUTED")}>
                          Mark disputed
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => updateInvoiceStatus(invoice.id, "VOID")}>
                          Void
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {queue.invoiced.length === 0 ? (
              <EmptyState title="No invoiced loads." description="Invoices will appear here once they move beyond readiness." />
            ) : null}
          </div>
        </Card>
      ) : null}
    </>
  );
}

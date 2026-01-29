"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
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

export default function BillingPage() {
  return (
    <AppShell title="Billing Queue" subtitle="POD verification and invoice readiness">
      <BillingQueueContent />
    </AppShell>
  );
}

function BillingQueueContent() {
  const { user } = useUser();
  const canAccess = Boolean(user && (user.role === "ADMIN" || user.role === "BILLING"));
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
    if (!canAccess) return;
    loadQueue();
  }, [canAccess]);

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

  const showInvoiced = tab === "Paid/Complete";
  const filteredRows = showInvoiced ? [] : queueRows.filter((row) => filters.includes(row.queueStatus));

  if (!canAccess) {
    return <NoAccess />;
  }

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
            {(queue.invoiced ?? []).length} • tab={tab} • role={user?.role ?? "none"} • canAccess={String(canAccess)} • lastLoaded=
            {lastLoadedAt ?? "never"}
            {loadError ? ` • error=${loadError}` : ""}
          </div>
        ) : null}

            <div className="grid gap-4">
              {filteredRows.map((load) => {
                const podDocs = (load.docs ?? []).filter((doc: any) => doc.type === "POD");
                const primaryDoc = podDocs[0];
                const shipper = load.stops?.find((stop: any) => stop.type === "PICKUP");
                const consignee = load.stops?.find((stop: any) => stop.type === "DELIVERY");
                return (
                  <div key={load.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-4 shadow-[var(--shadow-subtle)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">{load.status}</div>
                        <div className="text-lg font-semibold text-ink">{load.loadNumber}</div>
                        <div className="text-sm text-[color:var(--color-text-muted)]">{load.customer?.name ?? load.customerName}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          {shipper?.city ?? "-"}, {shipper?.state ?? "-"} → {consignee?.city ?? "-"}, {consignee?.state ?? "-"}
                        </div>
                      </div>
                      <StatusChip label={load.queueStatus} tone={statusTone(load.queueStatus)} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--color-text-muted)]">
                      <div>Operating entity: {load.operatingEntity?.name ?? "-"}</div>
                      <div>Pallets: {load.palletCount ?? "-"}</div>
                      <div>Weight: {load.weightLbs ?? "-"} lbs</div>
                      <div>Shipper ref: {load.shipperReferenceNumber ?? "-"}</div>
                      <div>Consignee ref: {load.consigneeReferenceNumber ?? "-"}</div>
                    </div>

                    {load.queueStatus === "Ready to Invoice" ? (
                      <div className="mt-3">
                        <Button onClick={() => generateInvoice(load.id)}>Generate invoice</Button>
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
          {!showInvoiced && filteredRows.length === 0 ? (
            <EmptyState title="No loads match this queue view." description="Try a different queue tab to review items." />
          ) : null}
        </div>
      </Card>

      {showInvoiced ? (
        <Card className="space-y-4">
          <SectionHeader title="Paid / Complete" subtitle="Invoices that have progressed beyond readiness" />
          <div className="grid gap-3">
            {queue.invoiced.map((load: any) => (
              <div key={load.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-4">
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
                              setInvoiceInputs({ ...invoiceInputs, [invoice.id]: { ...invoiceInputs[invoice.id], paymentRef: e.target.value } })
                            }
                          />
                        </FormField>
                        <FormField label="Short-paid amount" htmlFor={`shortPaid-${invoice.id}`} hint="Optional">
                          <Input
                            placeholder="100.00"
                            value={invoiceInputs[invoice.id]?.shortPaidAmount ?? ""}
                            onChange={(e) =>
                              setInvoiceInputs({ ...invoiceInputs, [invoice.id]: { ...invoiceInputs[invoice.id], shortPaidAmount: e.target.value } })
                            }
                          />
                        </FormField>
                        <FormField label="Dispute reason" htmlFor={`disputeReason-${invoice.id}`}>
                          <Input
                            placeholder="Rate discrepancy"
                            value={invoiceInputs[invoice.id]?.disputeReason ?? ""}
                            onChange={(e) =>
                              setInvoiceInputs({ ...invoiceInputs, [invoice.id]: { ...invoiceInputs[invoice.id], disputeReason: e.target.value } })
                            }
                          />
                        </FormField>
                        <FormField label="Dispute notes" htmlFor={`disputeNotes-${invoice.id}`}>
                          <Textarea
                            className="min-h-[70px]"
                            placeholder="Add context for the dispute"
                            value={invoiceInputs[invoice.id]?.disputeNotes ?? ""}
                            onChange={(e) =>
                              setInvoiceInputs({ ...invoiceInputs, [invoice.id]: { ...invoiceInputs[invoice.id], disputeNotes: e.target.value } })
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

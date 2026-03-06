"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { formatDate as formatDate24 } from "@/lib/date-time";

type VendorBillStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SCHEDULED" | "PAID" | "REJECTED";
type FinancePaymentMethod = "ACH" | "WIRE" | "CHECK" | "CASH" | "FACTORING" | "OTHER";

type Vendor = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  paymentMethod: FinancePaymentMethod;
  termsDays: number | null;
  email: string | null;
  phone: string | null;
};

type VendorBill = {
  id: string;
  vendorId: string;
  loadId: string | null;
  status: VendorBillStatus;
  invoiceNumber: string;
  amountCents: number;
  dueDate: string | null;
  scheduledAt: string | null;
  paidAt: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  vendor?: { id: string; code: string; name: string } | null;
  load?: { id: string; loadNumber: string; status: string } | null;
  lineItems?: Array<{ id: string; description: string; amountCents: number; glCode: string | null }>;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function formatDate(value: string | null | undefined) {
  return formatDate24(value ?? null, "-");
}

function statusTone(status: VendorBillStatus) {
  if (status === "PAID") return "success" as const;
  if (status === "SCHEDULED") return "info" as const;
  if (status === "PENDING_APPROVAL") return "warning" as const;
  return "neutral" as const;
}

export function FinanceVendorPayablesPanel() {
  const { capabilities } = useUser();
  const canMutate = capabilities.canBillActions;
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<VendorBillStatus | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [vendorForm, setVendorForm] = useState({
    code: "",
    name: "",
    paymentMethod: "ACH" as FinancePaymentMethod,
    termsDays: "",
    email: "",
    phone: "",
  });
  const [billForm, setBillForm] = useState({
    vendorId: "",
    loadId: "",
    invoiceNumber: "",
    amountCents: "",
    dueDate: "",
    reference: "",
    notes: "",
  });

  const selected = useMemo(() => bills.find((bill) => bill.id === selectedId) ?? null, [bills, selectedId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vendorResult, billResult] = await Promise.all([
        apiFetch<{ vendors: Vendor[] }>("/finance/vendors"),
        apiFetch<{ bills: VendorBill[] }>(`/finance/vendor-bills${statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ""}`),
      ]);
      setVendors(vendorResult.vendors ?? []);
      setBills(billResult.bills ?? []);
      if (!selectedId && (billResult.bills?.length ?? 0) > 0) {
        setSelectedId(billResult.bills?.[0]?.id ?? null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedId, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 2500);
    return () => window.clearTimeout(timer);
  }, [note]);

  const createVendor = async () => {
    if (!canMutate || !vendorForm.code.trim() || !vendorForm.name.trim()) return;
    setBusyKey("create-vendor");
    setError(null);
    try {
      await apiFetch("/finance/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: vendorForm.code.trim().toUpperCase(),
          name: vendorForm.name.trim(),
          paymentMethod: vendorForm.paymentMethod,
          termsDays: vendorForm.termsDays ? Number(vendorForm.termsDays) : undefined,
          email: vendorForm.email.trim() || undefined,
          phone: vendorForm.phone.trim() || undefined,
        }),
      });
      setVendorForm({
        code: "",
        name: "",
        paymentMethod: "ACH",
        termsDays: "",
        email: "",
        phone: "",
      });
      setNote("Vendor created.");
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  const createBill = async () => {
    if (!canMutate || !billForm.vendorId || !billForm.invoiceNumber.trim() || !billForm.amountCents.trim()) return;
    const amountCents = Number(billForm.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      setError("Amount must be a positive integer (cents).");
      return;
    }
    setBusyKey("create-bill");
    setError(null);
    try {
      await apiFetch("/finance/vendor-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: billForm.vendorId,
          loadId: billForm.loadId.trim() || undefined,
          invoiceNumber: billForm.invoiceNumber.trim(),
          amountCents,
          dueDate: billForm.dueDate ? new Date(billForm.dueDate).toISOString() : undefined,
          reference: billForm.reference.trim() || undefined,
          notes: billForm.notes.trim() || undefined,
        }),
      });
      setBillForm({
        vendorId: billForm.vendorId,
        loadId: "",
        invoiceNumber: "",
        amountCents: "",
        dueDate: "",
        reference: "",
        notes: "",
      });
      setNote("Vendor bill created.");
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  const runBillAction = async (billId: string, action: "approve" | "schedule" | "paid") => {
    if (!canMutate) return;
    setBusyKey(`${action}:${billId}`);
    setError(null);
    try {
      if (action === "schedule") {
        await apiFetch(`/finance/vendor-bills/${billId}/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } else {
        await apiFetch(`/finance/vendor-bills/${billId}/${action}`, { method: "POST" });
      }
      setNote(`Bill ${action}d.`);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  const counters = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let scheduled = 0;
    let paid = 0;
    for (const bill of bills) {
      if (bill.status === "PENDING_APPROVAL") pending += 1;
      if (bill.status === "APPROVED") approved += 1;
      if (bill.status === "SCHEDULED") scheduled += 1;
      if (bill.status === "PAID") paid += 1;
    }
    return { pending, approved, scheduled, paid };
  }, [bills]);

  return (
    <div className="space-y-3">
      {error ? <ErrorBanner message={error} /> : null}
      {note ? <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">{note}</div> : null}

      <Card className="space-y-3 !p-3 sm:!p-4">
        <SectionHeader title="Vendor AP" subtitle="Track vendor bills from intake to paid with payable ledger posting." />
        <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
          <StatusChip label={`Pending ${counters.pending}`} tone="warning" />
          <StatusChip label={`Approved ${counters.approved}`} tone="neutral" />
          <StatusChip label={`Scheduled ${counters.scheduled}`} tone="info" />
          <StatusChip label={`Paid ${counters.paid}`} tone="success" />
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <Card className="space-y-3 !p-3 sm:!p-4">
          <SectionHeader title="Vendor Bills" subtitle={`${bills.length} bill(s)`} />
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <FormField label="Status" htmlFor="vendorBillStatusFilter">
              <Select id="vendorBillStatusFilter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as VendorBillStatus | "")}>
                <option value="">All</option>
                <option value="PENDING_APPROVAL">Pending approval</option>
                <option value="APPROVED">Approved</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="PAID">Paid</option>
              </Select>
            </FormField>
            <div className="flex items-end">
              <Button variant="secondary" onClick={loadData} disabled={loading}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            <div className="flex items-end text-xs text-[color:var(--color-text-muted)]">
              Vendors: {vendors.length}
            </div>
          </div>
          {bills.length === 0 ? (
            <EmptyState title={loading ? "Loading vendor bills..." : "No vendor bills yet"} />
          ) : (
            <div className="overflow-auto rounded-[var(--radius-card)] border border-[color:var(--color-divider)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
                  <tr>
                    <th className="px-2 py-2 text-left">Bill</th>
                    <th className="px-2 py-2 text-left">Vendor</th>
                    <th className="px-2 py-2 text-left">Amount</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill.id} className={`border-t border-[color:var(--color-divider)] ${selectedId === bill.id ? "bg-[color:var(--color-bg-muted)]" : "hover:bg-[color:var(--color-bg-muted)]"}`}>
                      <td className="px-2 py-2">
                        <button type="button" className="text-left" onClick={() => setSelectedId(bill.id)}>
                          <div className="font-medium text-ink">{bill.invoiceNumber}</div>
                          <div className="text-xs text-[color:var(--color-text-muted)]">{formatDate(bill.createdAt)}</div>
                        </button>
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {(bill.vendor?.code ?? "VENDOR") + " · " + (bill.vendor?.name ?? "-")}
                      </td>
                      <td className="px-2 py-2">{formatCurrency(bill.amountCents)}</td>
                      <td className="px-2 py-2">
                        <StatusChip label={bill.status.replace("_", " ")} tone={statusTone(bill.status)} />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {bill.status === "PENDING_APPROVAL" ? (
                            <Button size="sm" variant="ghost" onClick={() => runBillAction(bill.id, "approve")} disabled={busyKey !== null}>
                              Approve
                            </Button>
                          ) : null}
                          {bill.status === "APPROVED" ? (
                            <Button size="sm" variant="ghost" onClick={() => runBillAction(bill.id, "schedule")} disabled={busyKey !== null}>
                              Schedule
                            </Button>
                          ) : null}
                          {bill.status === "SCHEDULED" ? (
                            <Button size="sm" variant="ghost" onClick={() => runBillAction(bill.id, "paid")} disabled={busyKey !== null}>
                              Mark paid
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="space-y-3 !p-3 sm:!p-4">
          <SectionHeader title="Bill Detail" subtitle={selected ? selected.invoiceNumber : "Select a bill"} />
          {!selected ? (
            <EmptyState title="Select a vendor bill to review lifecycle and line items." />
          ) : (
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip label={selected.status.replace("_", " ")} tone={statusTone(selected.status)} />
                <span className="text-xs text-[color:var(--color-text-muted)]">{selected.vendor?.name ?? "-"}</span>
              </div>
              <div className="mt-2 font-medium text-ink">{formatCurrency(selected.amountCents)}</div>
              <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                Due {formatDate(selected.dueDate)} · Scheduled {formatDate(selected.scheduledAt)} · Paid {formatDate(selected.paidAt)}
              </div>
              <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                Load: {selected.load?.loadNumber ?? selected.loadId ?? "-"} · Ref: {selected.reference ?? "-"}
              </div>
              {selected.lineItems && selected.lineItems.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {selected.lineItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 text-xs">
                      <span>{item.description}</span>
                      <span>{formatCurrency(item.amountCents)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      {canMutate ? (
        <>
          <Card className="space-y-3 !p-3 sm:!p-4">
            <SectionHeader title="Create Vendor" subtitle="Add repair, insurance, lease, or fuel suppliers." />
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <FormField label="Code" htmlFor="vendorCode">
                <Input id="vendorCode" value={vendorForm.code} onChange={(event) => setVendorForm((prev) => ({ ...prev, code: event.target.value }))} />
              </FormField>
              <FormField label="Name" htmlFor="vendorName">
                <Input id="vendorName" value={vendorForm.name} onChange={(event) => setVendorForm((prev) => ({ ...prev, name: event.target.value }))} />
              </FormField>
              <FormField label="Payment method" htmlFor="vendorPaymentMethod">
                <Select id="vendorPaymentMethod" value={vendorForm.paymentMethod} onChange={(event) => setVendorForm((prev) => ({ ...prev, paymentMethod: event.target.value as FinancePaymentMethod }))}>
                  <option value="ACH">ACH</option>
                  <option value="WIRE">Wire</option>
                  <option value="CHECK">Check</option>
                  <option value="CASH">Cash</option>
                  <option value="OTHER">Other</option>
                </Select>
              </FormField>
              <FormField label="Terms (days)" htmlFor="vendorTermsDays">
                <Input id="vendorTermsDays" type="number" min={0} value={vendorForm.termsDays} onChange={(event) => setVendorForm((prev) => ({ ...prev, termsDays: event.target.value }))} />
              </FormField>
              <FormField label="Email" htmlFor="vendorEmail">
                <Input id="vendorEmail" value={vendorForm.email} onChange={(event) => setVendorForm((prev) => ({ ...prev, email: event.target.value }))} />
              </FormField>
              <div className="flex items-end">
                <Button onClick={createVendor} disabled={busyKey !== null || !vendorForm.code.trim() || !vendorForm.name.trim()}>
                  {busyKey === "create-vendor" ? "Creating..." : "Create vendor"}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="space-y-3 !p-3 sm:!p-4">
            <SectionHeader title="Create Vendor Bill" subtitle="Push a vendor payable into approval pipeline." />
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
              <FormField label="Vendor" htmlFor="vendorBillVendor">
                <Select id="vendorBillVendor" value={billForm.vendorId} onChange={(event) => setBillForm((prev) => ({ ...prev, vendorId: event.target.value }))}>
                  <option value="">Select vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.code} · {vendor.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Invoice #" htmlFor="vendorBillInvoiceNumber">
                <Input id="vendorBillInvoiceNumber" value={billForm.invoiceNumber} onChange={(event) => setBillForm((prev) => ({ ...prev, invoiceNumber: event.target.value }))} />
              </FormField>
              <FormField label="Amount (cents)" htmlFor="vendorBillAmountCents">
                <Input id="vendorBillAmountCents" type="number" min={1} value={billForm.amountCents} onChange={(event) => setBillForm((prev) => ({ ...prev, amountCents: event.target.value }))} />
              </FormField>
              <FormField label="Load ID (optional)" htmlFor="vendorBillLoadId">
                <Input id="vendorBillLoadId" value={billForm.loadId} onChange={(event) => setBillForm((prev) => ({ ...prev, loadId: event.target.value }))} />
              </FormField>
              <FormField label="Due date" htmlFor="vendorBillDueDate">
                <Input id="vendorBillDueDate" type="date" value={billForm.dueDate} onChange={(event) => setBillForm((prev) => ({ ...prev, dueDate: event.target.value }))} />
              </FormField>
              <FormField label="Reference" htmlFor="vendorBillReference">
                <Input id="vendorBillReference" value={billForm.reference} onChange={(event) => setBillForm((prev) => ({ ...prev, reference: event.target.value }))} />
              </FormField>
              <div className="flex items-end">
                <Button onClick={createBill} disabled={busyKey !== null || !billForm.vendorId || !billForm.invoiceNumber.trim() || !billForm.amountCents.trim()}>
                  {busyKey === "create-bill" ? "Creating..." : "Create bill"}
                </Button>
              </div>
            </div>
            <FormField label="Notes" htmlFor="vendorBillNotes">
              <Input id="vendorBillNotes" value={billForm.notes} onChange={(event) => setBillForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </FormField>
          </Card>
        </>
      ) : (
        <Card className="!p-3 text-sm text-[color:var(--color-text-muted)]">Read-only mode: Billing/Admin can create vendors and process vendor bills.</Card>
      )}
    </div>
  );
}


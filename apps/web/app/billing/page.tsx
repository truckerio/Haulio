"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export default function BillingPage() {
  const [queue, setQueue] = useState<any>({ delivered: [], ready: [], invoiced: [] });
  const [checklist, setChecklist] = useState<Record<string, any>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [invoiceInputs, setInvoiceInputs] = useState<Record<string, any>>({});

  const loadQueue = async () => {
    const data = await apiFetch("/billing/queue");
    setQueue(data);
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const verifyDoc = async (docId: string) => {
    const checks = checklist[docId] || { signature: true, printed: true, date: true, pages: 1 };
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
  };

  const rejectDoc = async (docId: string) => {
    const reason = rejectReasons[docId];
    if (!reason) {
      return;
    }
    await apiFetch(`/docs/${docId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectReason: reason }),
    });
    loadQueue();
  };

  const generateInvoice = async (loadId: string) => {
    await apiFetch(`/billing/invoices/${loadId}/generate`, { method: "POST" });
    loadQueue();
  };

  const updateInvoiceStatus = async (invoiceId: string, status: string) => {
    const input = invoiceInputs[invoiceId] || {};
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
  };

  const openFile = (path: string) => {
    const url = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000"}${path}`;
    window.open(url, "_blank");
  };
  const openInvoicePdf = (invoiceId: string) => {
    openFile(`/invoices/${invoiceId}/pdf`);
  };

  return (
    <AppShell title="Billing" subtitle="POD verification and invoice generation">
      <div className="grid gap-6">
        <Card>
          <h3 className="text-lg font-semibold">Delivered awaiting POD</h3>
          <div className="mt-3 grid gap-3">
            {queue.delivered.map((load: any) => (
              <div key={load.id} className="rounded-2xl border border-black/10 bg-white/60 p-4">
                <div className="font-semibold">{load.loadNumber}</div>
                <div className="text-sm text-black/60">{load.customer?.name ?? load.customerName}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {load.docs.map((doc: any) => (
                    <div key={doc.id} className="w-full rounded-2xl border border-black/10 bg-white/80 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">{doc.type}</div>
                        <div className="text-xs text-black/60">{doc.status}</div>
                      </div>
                      <div className="mt-1 text-xs text-black/50">
                        Source: {doc.source} {doc.stopId ? `· Stop ${doc.stopId}` : ""}
                      </div>
                      <div className="mt-2 grid gap-2 text-sm text-black/70 md:grid-cols-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={(checklist[doc.id]?.signature ?? true) as boolean}
                            onChange={(e) =>
                              setChecklist({
                                ...checklist,
                                [doc.id]: { ...checklist[doc.id], signature: e.target.checked },
                              })
                            }
                          />
                          Signature present
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={(checklist[doc.id]?.printed ?? true) as boolean}
                            onChange={(e) =>
                              setChecklist({
                                ...checklist,
                                [doc.id]: { ...checklist[doc.id], printed: e.target.checked },
                              })
                            }
                          />
                          Printed name present
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={(checklist[doc.id]?.date ?? true) as boolean}
                            onChange={(e) =>
                              setChecklist({ ...checklist, [doc.id]: { ...checklist[doc.id], date: e.target.checked } })
                            }
                          />
                          Delivery date present
                        </label>
                        <label className="flex items-center gap-2">
                          Pages
                          <input
                            type="number"
                            min={1}
                            className="w-20 rounded-xl border border-black/10 px-2 py-1"
                            value={checklist[doc.id]?.pages ?? 1}
                            onChange={(e) =>
                              setChecklist({ ...checklist, [doc.id]: { ...checklist[doc.id], pages: e.target.value } })
                            }
                          />
                        </label>
                      </div>
                      <input
                        className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                        placeholder="Reject reason (required)"
                        value={rejectReasons[doc.id] ?? ""}
                        onChange={(e) => setRejectReasons({ ...rejectReasons, [doc.id]: e.target.value })}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button onClick={() => verifyDoc(doc.id)}>Verify</Button>
                        <Button variant="danger" onClick={() => rejectDoc(doc.id)} disabled={!rejectReasons[doc.id]}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold">Ready to invoice</h3>
          <div className="mt-3 grid gap-3">
            {queue.ready.map((load: any) => (
              <div key={load.id} className="rounded-2xl border border-black/10 bg-white/60 p-4">
                <div className="font-semibold">{load.loadNumber}</div>
                <div className="text-sm text-black/60">{load.customer?.name ?? load.customerName}</div>
                <Button className="mt-3" onClick={() => generateInvoice(load.id)}>
                  Generate invoice
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold">Invoiced</h3>
          <div className="mt-3 grid gap-3">
            {queue.invoiced.map((load: any) => (
              <div key={load.id} className="rounded-2xl border border-black/10 bg-white/60 p-4">
                <div className="font-semibold">{load.loadNumber}</div>
                <div className="text-sm text-black/60">{load.customer?.name ?? load.customerName}</div>
                {load.invoices?.map((invoice: any) => (
                  <div key={invoice.id} className="mt-2 flex flex-wrap gap-2">
                    <div className="w-full text-xs uppercase tracking-widest text-black/50">{invoice.status}</div>
                    <div className="w-full text-sm text-black/60">
                      Total ${Number(invoice.totalAmount ?? 0).toFixed(2)}
                    </div>
                    {invoice.pdfPath ? (
                      <Button variant="secondary" onClick={() => openInvoicePdf(invoice.id)}>
                        Download PDF
                      </Button>
                    ) : null}
                    {invoice.packetPath ? (
                      <Button variant="secondary" onClick={() => openFile(`/files/packets/${invoice.packetPath.split("/").pop()}`)}>
                        Download Packet
                      </Button>
                    ) : null}
                    <div className="w-full rounded-2xl border border-black/10 bg-white/70 p-3">
                      <div className="grid gap-2 text-sm">
                        <input
                          className="rounded-xl border border-black/10 px-3 py-2"
                          placeholder="Payment ref"
                          value={invoiceInputs[invoice.id]?.paymentRef ?? ""}
                          onChange={(e) =>
                            setInvoiceInputs({ ...invoiceInputs, [invoice.id]: { ...invoiceInputs[invoice.id], paymentRef: e.target.value } })
                          }
                        />
                        <input
                          className="rounded-xl border border-black/10 px-3 py-2"
                          placeholder="Short-paid amount (optional)"
                          value={invoiceInputs[invoice.id]?.shortPaidAmount ?? ""}
                          onChange={(e) =>
                            setInvoiceInputs({ ...invoiceInputs, [invoice.id]: { ...invoiceInputs[invoice.id], shortPaidAmount: e.target.value } })
                          }
                        />
                        <input
                          className="rounded-xl border border-black/10 px-3 py-2"
                          placeholder="Dispute reason"
                          value={invoiceInputs[invoice.id]?.disputeReason ?? ""}
                          onChange={(e) =>
                            setInvoiceInputs({ ...invoiceInputs, [invoice.id]: { ...invoiceInputs[invoice.id], disputeReason: e.target.value } })
                          }
                        />
                        <textarea
                          className="min-h-[70px] rounded-xl border border-black/10 px-3 py-2"
                          placeholder="Dispute notes"
                          value={invoiceInputs[invoice.id]?.disputeNotes ?? ""}
                          onChange={(e) =>
                            setInvoiceInputs({ ...invoiceInputs, [invoice.id]: { ...invoiceInputs[invoice.id], disputeNotes: e.target.value } })
                          }
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => updateInvoiceStatus(invoice.id, "SENT")}>
                          Mark sent
                        </Button>
                        <Button variant="secondary" onClick={() => updateInvoiceStatus(invoice.id, "ACCEPTED")}>
                          Mark accepted
                        </Button>
                        <Button variant="secondary" onClick={() => updateInvoiceStatus(invoice.id, "PAID")}>
                          Mark paid
                        </Button>
                        <Button variant="secondary" onClick={() => updateInvoiceStatus(invoice.id, "SHORT_PAID")}>
                          Mark short-paid
                        </Button>
                        <Button variant="danger" onClick={() => updateInvoiceStatus(invoice.id, "DISPUTED")}>
                          Mark disputed
                        </Button>
                        <Button variant="danger" onClick={() => updateInvoiceStatus(invoice.id, "VOID")}>
                          Void
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

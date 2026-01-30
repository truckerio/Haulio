"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

const STATUS_OPTIONS = [
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
];

const LOAD_TYPE_OPTIONS = ["COMPANY", "BROKERED", "VAN", "REEFER", "FLATBED", "OTHER"];

type DraftStop = {
  type: "PICKUP" | "DELIVERY";
  name: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  apptStart?: string;
  apptEnd?: string;
  notes?: string;
};

type DraftLoad = {
  loadNumber: string;
  status: string;
  loadType: string;
  customerName: string;
  customerRef: string;
  externalTripId: string;
  truckUnit: string;
  trailerUnit: string;
  rate: string;
  salesRepName: string;
  dropName: string;
  desiredInvoiceDate: string;
  shipperReferenceNumber: string;
  consigneeReferenceNumber: string;
  palletCount: string;
  weightLbs: string;
  miles: string;
  stops: DraftStop[];
};

const emptyStop = (type: "PICKUP" | "DELIVERY"): DraftStop => ({
  type,
  name: "",
  address1: "",
  city: "",
  state: "",
  zip: "",
  apptStart: "",
  apptEnd: "",
  notes: "",
});

export default function LoadConfirmationDetailPage() {
  const params = useParams();
  const docId = params?.id as string | undefined;
  const [doc, setDoc] = useState<any | null>(null);
  const [draft, setDraft] = useState<DraftLoad | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<Record<number, { address: string; city: string; state: string; zip: string } | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const fileUrl = docId ? `${API_BASE}/load-confirmations/${docId}/file` : "";

  const ready = useMemo(() => {
    if (!draft) return false;
    if (!draft.customerName || draft.customerName.trim().length < 2) return false;
    if (!draft.stops || draft.stops.length < 2) return false;
    const hasPickupDate = draft.stops.some((stop) => stop.type === "PICKUP" && stop.apptStart);
    const hasDeliveryDate = draft.stops.some((stop) => stop.type === "DELIVERY" && stop.apptStart);
    if (!hasPickupDate || !hasDeliveryDate) return false;
    return draft.stops.every((stop) =>
      [stop.name, stop.city, stop.state].every((field) => field && field.trim().length > 0)
    );
  }, [draft]);

  const hydrateDraft = (docData: any): DraftLoad => {
    const source = docData.normalizedDraft ?? docData.extractedDraft ?? docData.extractedJson ?? {};
    const stops = Array.isArray(source.stops) ? source.stops : [];
    const mappedStops = stops.map((stop: any) => ({
      type: stop.type === "DELIVERY" ? "DELIVERY" : "PICKUP",
      name: stop.name ?? "",
      address1: stop.address1 ?? "",
      city: stop.city ?? "",
      state: stop.state ?? "",
      zip: stop.zip ?? "",
      apptStart: stop.apptStart ?? "",
      apptEnd: stop.apptEnd ?? "",
      notes: stop.notes ?? "",
    }));
    if (mappedStops.length === 0) {
      mappedStops.push(emptyStop("PICKUP"), emptyStop("DELIVERY"));
    }
    if (mappedStops.length === 1) {
      mappedStops.push(emptyStop("DELIVERY"));
    }
    return {
      loadNumber: source.loadNumber ?? "",
      status: source.status ?? "",
      loadType: source.loadType ?? source.type ?? "",
      customerName: source.customerName ?? source.customer ?? "",
      customerRef: source.customerRef ?? source.custRef ?? "",
      externalTripId: source.externalTripId ?? source.trip ?? "",
      truckUnit: source.truckUnit ?? source.unit ?? "",
      trailerUnit: source.trailerUnit ?? source.trailer ?? "",
      rate: source.rate?.toString() ?? source.totalRev?.toString?.() ?? "",
      salesRepName: source.salesRepName ?? source.sales ?? "",
      dropName: source.dropName ?? source.drop ?? "",
      desiredInvoiceDate: source.desiredInvoiceDate ?? source.invDate ?? "",
      shipperReferenceNumber: source.shipperReferenceNumber ?? "",
      consigneeReferenceNumber: source.consigneeReferenceNumber ?? "",
      palletCount: source.palletCount?.toString() ?? "",
      weightLbs: source.weightLbs?.toString() ?? "",
      miles: source.miles?.toString() ?? "",
      stops: mappedStops,
    };
  };

  const splitDateTime = (value?: string | null) => {
    if (!value) return { date: "", time: "" };
    const [datePart, timePartRaw] = value.split("T");
    if (timePartRaw) {
      return { date: datePart, time: timePartRaw.slice(0, 5) };
    }
    const parts = value.split(" ");
    return { date: parts[0] ?? "", time: parts[1]?.slice(0, 5) ?? "" };
  };

  const buildDateTime = (date: string, time: string) => {
    if (!date) return "";
    const normalizedTime = time ? time.slice(0, 5) : "00:00";
    return `${date}T${normalizedTime}`;
  };

  const updateStopByType = (type: "PICKUP" | "DELIVERY", updater: (stop: DraftStop) => DraftStop) => {
    if (!draft) return;
    const stops = [...draft.stops];
    const index =
      type === "PICKUP"
        ? stops.findIndex((stop) => stop.type === "PICKUP")
        : [...stops].reverse().findIndex((stop) => stop.type === "DELIVERY");
    const resolvedIndex = index === -1 ? -1 : type === "PICKUP" ? index : stops.length - 1 - index;
    if (resolvedIndex === -1) return;
    stops[resolvedIndex] = updater(stops[resolvedIndex]);
    setDraft({ ...draft, stops });
  };

  const updatePickupDates = (date: string, timeStart: string, timeEnd: string) => {
    updateStopByType("PICKUP", (stop) => {
      const apptStart = buildDateTime(date, timeStart);
      const apptEnd = date ? buildDateTime(date, timeEnd || timeStart) : "";
      return { ...stop, apptStart, apptEnd };
    });
  };

  const updateDeliveryDates = (dateStart: string, dateEnd: string, timeEnd: string) => {
    updateStopByType("DELIVERY", (stop) => {
      const apptStart = buildDateTime(dateStart, "00:00");
      const apptEnd = timeEnd ? buildDateTime(dateEnd || dateStart, timeEnd) : "";
      return { ...stop, apptStart, apptEnd };
    });
  };

  const loadDoc = useCallback(async () => {
    if (!docId) return;
    const data = await apiFetch<{ doc: any }>(`/load-confirmations/${docId}`);
    setDoc(data.doc);
    setDraft(hydrateDraft(data.doc));
  }, [docId]);

  useEffect(() => {
    loadDoc().catch((err) => setError((err as Error).message));
  }, [loadDoc]);

  const updateStop = (index: number, field: keyof DraftStop, value: string) => {
    if (!draft) return;
    const nextStops = [...draft.stops];
    nextStops[index] = { ...nextStops[index], [field]: value };
    setDraft({ ...draft, stops: nextStops });
  };

  const requestNameSuggestion = async (index: number) => {
    if (!draft) return;
    const stop = draft.stops[index];
    const rawName = stop?.name?.trim();
    if (!rawName) {
      setNameSuggestions((prev) => ({ ...prev, [index]: null }));
      return;
    }
    try {
      const payload = await apiFetch<{
        suggestion: { suggestionJson: Record<string, unknown> | null; confidence: number; reason: string[] };
      }>("/learning/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: stop.type === "DELIVERY" ? "MATCH_CONSIGNEE" : "MATCH_SHIPPER",
          inputJson: { rawName },
        }),
      });
      const suggestion = payload.suggestion.suggestionJson as
        | { address?: string; city?: string; state?: string; zip?: string }
        | null;
      if (suggestion?.address || suggestion?.city || suggestion?.state || suggestion?.zip) {
        setNameSuggestions((prev) => ({
          ...prev,
          [index]: {
            address: String(suggestion.address ?? ""),
            city: String(suggestion.city ?? ""),
            state: String(suggestion.state ?? ""),
            zip: String(suggestion.zip ?? ""),
          },
        }));
      } else {
        setNameSuggestions((prev) => ({ ...prev, [index]: null }));
      }
    } catch {
      setNameSuggestions((prev) => ({ ...prev, [index]: null }));
    }
  };

  const saveDraft = async () => {
    if (!draft || !docId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/load-confirmations/${docId}/draft`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft }) });
      await loadDoc();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const createLoad = async () => {
    if (!docId) return;
    setCreating(true);
    setError(null);
    try {
      const data = await apiFetch<{ loadId: string }>(`/load-confirmations/${docId}/create-load`, { method: "POST" });
      window.location.href = `/loads/${data.loadId}`;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const pickupStop = draft?.stops.find((stop) => stop.type === "PICKUP") ?? draft?.stops[0];
  const deliveryStop = draft?.stops.slice().reverse().find((stop) => stop.type === "DELIVERY") ?? draft?.stops[draft?.stops.length ? draft.stops.length - 1 : 0];
  const pickupStart = splitDateTime(pickupStop?.apptStart);
  const pickupEnd = splitDateTime(pickupStop?.apptEnd);
  const deliveryStart = splitDateTime(deliveryStop?.apptStart);
  const deliveryEnd = splitDateTime(deliveryStop?.apptEnd);

  return (
    <AppShell title="Review Load Confirmation" subtitle="Validate extracted data before creating the load">
      {error ? <Card><div className="text-sm text-[color:var(--color-danger)]">{error}</div></Card> : null}
      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <Card className="space-y-3">
          <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Document</div>
          {doc ? (
            doc.contentType?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl} alt={doc.filename} className="w-full rounded-[var(--radius-card)] border border-[color:var(--color-divider)]" />
            ) : (
              <iframe
                src={fileUrl}
                title={doc.filename ?? "Load confirmation document"}
                className="h-[600px] w-full rounded-[var(--radius-card)] border border-[color:var(--color-divider)]"
              />
            )
          ) : (
            <div className="text-sm text-[color:var(--color-text-muted)]">Loading document...</div>
          )}
          <Button variant="secondary" onClick={() => window.open(fileUrl, "_blank")}>Open file</Button>
        </Card>

        <Card className="space-y-4">
          <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Draft load</div>
          {doc?.extractedJson?.confidence ? (
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-muted)]/60 p-3 text-sm">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">Extraction confidence</div>
              <div className="mt-1 text-lg font-semibold text-ink">
                {Math.round((doc.extractedJson.confidence.score ?? 0) * 100)}%
              </div>
              <div className="text-xs text-[color:var(--color-text-muted)]">
                {doc.extractedJson.learning?.matched
                  ? `Template matched (${doc.extractedJson.learning.reason ?? "broker"})`
                  : "Parsed from OCR/text"}
              </div>
              {Array.isArray(doc.extractedJson.confidence.flags) && doc.extractedJson.confidence.flags.length > 0 ? (
                <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                  {doc.extractedJson.confidence.flags.join(" · ")}
                </div>
              ) : null}
              <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                Review required before creating the load.
              </div>
            </div>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-muted)]/60 p-3 text-xs text-[color:var(--color-text-muted)]">
              Review required before creating the load.
            </div>
          )}
          {!draft ? <div className="text-sm text-[color:var(--color-text-muted)]">Loading draft...</div> : null}
          {draft ? (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-3">
                <FormField label="Load" htmlFor="draftLoadNumber">
                  <Input placeholder="Auto" value={draft.loadNumber} onChange={(e) => setDraft({ ...draft, loadNumber: e.target.value })} />
                </FormField>
                <FormField label="Trip" htmlFor="draftTrip">
                  <Input placeholder="TRIP-9001" value={draft.externalTripId} onChange={(e) => setDraft({ ...draft, externalTripId: e.target.value })} />
                </FormField>
                <FormField label="Status" htmlFor="draftStatus">
                  <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                    <option value="">Select status</option>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Customer" htmlFor="draftCustomer">
                  <Input placeholder="Acme Foods" value={draft.customerName} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} />
                </FormField>
                <FormField label="Cust Ref" htmlFor="draftCustomerRef">
                  <Input placeholder="PO-7788" value={draft.customerRef} onChange={(e) => setDraft({ ...draft, customerRef: e.target.value })} />
                </FormField>
                <FormField label="Unit" htmlFor="draftUnit">
                  <Input placeholder="TRK-101" value={draft.truckUnit} onChange={(e) => setDraft({ ...draft, truckUnit: e.target.value })} />
                </FormField>
                <FormField label="Trailer" htmlFor="draftTrailer">
                  <Input placeholder="TRL-201" value={draft.trailerUnit} onChange={(e) => setDraft({ ...draft, trailerUnit: e.target.value })} />
                </FormField>
                <FormField label="As Wgt" htmlFor="draftWeightLbs">
                  <Input placeholder="42000" value={draft.weightLbs} onChange={(e) => setDraft({ ...draft, weightLbs: e.target.value })} />
                </FormField>
                <FormField label="Total Rev" htmlFor="draftRate">
                  <Input placeholder="2500" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
                </FormField>
                <FormField label="Type" htmlFor="draftLoadType">
                  <Select value={draft.loadType} onChange={(e) => setDraft({ ...draft, loadType: e.target.value })}>
                    <option value="">Select type</option>
                    {LOAD_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Sales" htmlFor="draftSales">
                  <Input placeholder="A. Lee" value={draft.salesRepName} onChange={(e) => setDraft({ ...draft, salesRepName: e.target.value })} />
                </FormField>
                <FormField label="Drop Name" htmlFor="draftDropName">
                  <Input placeholder="Store 14" value={draft.dropName} onChange={(e) => setDraft({ ...draft, dropName: e.target.value })} />
                </FormField>
                <FormField label="Inv Date" htmlFor="draftInvDate">
                  <Input
                    type="date"
                    value={draft.desiredInvoiceDate}
                    onChange={(e) => setDraft({ ...draft, desiredInvoiceDate: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <FormField label="PU Date F" htmlFor="draftPuDate">
                  <Input
                    placeholder="YYYY-MM-DD"
                    value={pickupStart.date}
                    onChange={(e) => updatePickupDates(e.target.value, pickupStart.time, pickupEnd.time)}
                  />
                </FormField>
                <FormField label="PU Time F" htmlFor="draftPuTimeStart">
                  <Input
                    placeholder="08:00"
                    value={pickupStart.time}
                    onChange={(e) => updatePickupDates(pickupStart.date, e.target.value, pickupEnd.time)}
                  />
                </FormField>
                <FormField label="PU Time T" htmlFor="draftPuTimeEnd">
                  <Input
                    placeholder="10:00"
                    value={pickupEnd.time}
                    onChange={(e) => updatePickupDates(pickupStart.date, pickupStart.time, e.target.value)}
                  />
                </FormField>
                <FormField label="Del Date F" htmlFor="draftDelDateF">
                  <Input
                    placeholder="YYYY-MM-DD"
                    value={deliveryStart.date}
                    onChange={(e) => updateDeliveryDates(e.target.value, deliveryEnd.date || deliveryStart.date, deliveryEnd.time)}
                  />
                </FormField>
                <FormField label="Del Date T" htmlFor="draftDelDateT">
                  <Input
                    placeholder="YYYY-MM-DD"
                    value={deliveryEnd.date || deliveryStart.date}
                    onChange={(e) => updateDeliveryDates(deliveryStart.date, e.target.value, deliveryEnd.time)}
                  />
                </FormField>
                <FormField label="Del Time T" htmlFor="draftDelTimeT">
                  <Input
                    placeholder="16:00"
                    value={deliveryEnd.time}
                    onChange={(e) => updateDeliveryDates(deliveryStart.date, deliveryEnd.date || deliveryStart.date, e.target.value)}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Shipper reference #" htmlFor="draftShipperRef">
                  <Input
                    placeholder="SREF-1001"
                    value={draft.shipperReferenceNumber}
                    onChange={(e) => setDraft({ ...draft, shipperReferenceNumber: e.target.value })}
                  />
                </FormField>
                <FormField label="Consignee reference #" htmlFor="draftConsigneeRef">
                  <Input
                    placeholder="CREF-1001"
                    value={draft.consigneeReferenceNumber}
                    onChange={(e) => setDraft({ ...draft, consigneeReferenceNumber: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="space-y-3">
                {draft.stops.map((stop, index) => (
                  <div key={`${stop.type}-${index}`} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                        {stop.type === "PICKUP" ? "Shipper stop" : "Consignee stop"}
                      </div>
                      <FormField label="Stop type" htmlFor={`stopType-${index}`}>
                        <Select value={stop.type} onChange={(e) => updateStop(index, "type", e.target.value)}>
                          <option value="PICKUP">Shipper</option>
                          <option value="DELIVERY">Consignee</option>
                        </Select>
                      </FormField>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <FormField label="Name" htmlFor={`stopName-${index}`}>
                        <Input
                          placeholder="Location name"
                          value={stop.name}
                          onChange={(e) => updateStop(index, "name", e.target.value)}
                          onBlur={() => requestNameSuggestion(index)}
                        />
                      </FormField>
                      <FormField label="City" htmlFor={`stopCity-${index}`}>
                        <Input placeholder="Austin" value={stop.city} onChange={(e) => updateStop(index, "city", e.target.value)} />
                      </FormField>
                      <FormField label="State" htmlFor={`stopState-${index}`}>
                        <Input placeholder="TX" value={stop.state} onChange={(e) => updateStop(index, "state", e.target.value)} />
                      </FormField>
                      <FormField
                        label={stop.type === "PICKUP" ? "Load Notes (Shipper)" : "Load Notes (Consignee)"}
                        htmlFor={`stopNotes-${index}`}
                      >
                        <Input placeholder="Notes" value={stop.notes ?? ""} onChange={(e) => updateStop(index, "notes", e.target.value)} />
                      </FormField>
                    </div>
                    {nameSuggestions[index] ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                        <span>
                          Suggested address: {nameSuggestions[index]?.address} {nameSuggestions[index]?.city} {nameSuggestions[index]?.state} {nameSuggestions[index]?.zip}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const suggestion = nameSuggestions[index];
                            if (!suggestion) return;
                            updateStop(index, "address1", suggestion.address);
                            updateStop(index, "city", suggestion.city);
                            updateStop(index, "state", suggestion.state);
                            updateStop(index, "zip", suggestion.zip);
                            setNameSuggestions((prev) => ({ ...prev, [index]: null }));
                          }}
                        >
                          Apply
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
                <Button
                  variant="secondary"
                  onClick={() => setDraft({ ...draft, stops: [...draft.stops, emptyStop("DELIVERY")] })}
                >
                  Add stop
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={saveDraft} disabled={saving}>Save draft</Button>
                <Button variant="ghost" onClick={loadDoc}>Reload</Button>
                <Button onClick={createLoad} disabled={!ready || creating}>
                  {ready ? "Create load" : "Complete required fields"}
                </Button>
              </div>
              {doc?.status ? <div className="text-xs text-[color:var(--color-text-muted)]">Status: {doc.status}</div> : null}
            </div>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

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
  shipperReferenceNumber: string;
  consigneeReferenceNumber: string;
  palletCount: string;
  weightLbs: string;
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const fileUrl = docId ? `${API_BASE}/load-confirmations/${docId}/file` : "";

  const ready = useMemo(() => {
    if (!draft) return false;
    if (!draft.loadNumber || draft.loadNumber.trim().length < 2) return false;
    if (!draft.stops || draft.stops.length < 2) return false;
    return draft.stops.every((stop) =>
      [stop.name, stop.address1, stop.city, stop.state, stop.zip].every((field) => field && field.trim().length > 0)
    );
  }, [draft]);

  const hydrateDraft = (docData: any): DraftLoad => {
    const source = docData.normalizedDraft ?? docData.extractedJson ?? {};
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
      shipperReferenceNumber: source.shipperReferenceNumber ?? "",
      consigneeReferenceNumber: source.consigneeReferenceNumber ?? "",
      palletCount: source.palletCount?.toString() ?? "",
      weightLbs: source.weightLbs?.toString() ?? "",
      stops: mappedStops,
    };
  };

  const loadDoc = async () => {
    if (!docId) return;
    const data = await apiFetch<{ doc: any }>(`/load-confirmations/${docId}`);
    setDoc(data.doc);
    setDraft(hydrateDraft(data.doc));
  };

  useEffect(() => {
    loadDoc().catch((err) => setError((err as Error).message));
  }, [docId]);

  const updateStop = (index: number, field: keyof DraftStop, value: string) => {
    if (!draft) return;
    const nextStops = [...draft.stops];
    nextStops[index] = { ...nextStops[index], [field]: value };
    setDraft({ ...draft, stops: nextStops });
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

  return (
    <AppShell title="Review Load Confirmation" subtitle="Validate extracted data before creating the load">
      {error ? <Card><div className="text-sm text-red-600">{error}</div></Card> : null}
      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <Card className="space-y-3">
          <div className="text-sm uppercase tracking-widest text-black/50">Document</div>
          {doc ? (
            doc.contentType?.startsWith("image/") ? (
              <img src={fileUrl} alt={doc.filename} className="w-full rounded-2xl border border-black/10" />
            ) : (
              <iframe src={fileUrl} className="h-[600px] w-full rounded-2xl border border-black/10" />
            )
          ) : (
            <div className="text-sm text-black/60">Loading document...</div>
          )}
          <Button variant="secondary" onClick={() => window.open(fileUrl, "_blank")}>Open file</Button>
        </Card>

        <Card className="space-y-4">
          <div className="text-sm uppercase tracking-widest text-black/50">Draft load</div>
          {!draft ? <div className="text-sm text-black/60">Loading draft...</div> : null}
          {draft ? (
            <div className="space-y-4">
              <Input placeholder="Load number" value={draft.loadNumber} onChange={(e) => setDraft({ ...draft, loadNumber: e.target.value })} />
              <div className="grid gap-3 lg:grid-cols-2">
                <Input
                  placeholder="Shipper reference #"
                  value={draft.shipperReferenceNumber}
                  onChange={(e) => setDraft({ ...draft, shipperReferenceNumber: e.target.value })}
                />
                <Input
                  placeholder="Consignee reference #"
                  value={draft.consigneeReferenceNumber}
                  onChange={(e) => setDraft({ ...draft, consigneeReferenceNumber: e.target.value })}
                />
                <Input
                  placeholder="Pallet count"
                  value={draft.palletCount}
                  onChange={(e) => setDraft({ ...draft, palletCount: e.target.value })}
                />
                <Input
                  placeholder="Weight (lbs)"
                  value={draft.weightLbs}
                  onChange={(e) => setDraft({ ...draft, weightLbs: e.target.value })}
                />
              </div>
              <div className="space-y-3">
                {draft.stops.map((stop, index) => (
                  <div key={`${stop.type}-${index}`} className="rounded-2xl border border-black/10 bg-white/70 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs uppercase tracking-widest text-black/50">
                        {stop.type === "PICKUP" ? "Shipper stop" : "Consignee stop"}
                      </div>
                      <select
                        className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                        value={stop.type}
                        onChange={(e) => updateStop(index, "type", e.target.value)}
                      >
                        <option value="PICKUP">Shipper</option>
                        <option value="DELIVERY">Consignee</option>
                      </select>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <Input placeholder="Name" value={stop.name} onChange={(e) => updateStop(index, "name", e.target.value)} />
                      <Input placeholder="Address" value={stop.address1} onChange={(e) => updateStop(index, "address1", e.target.value)} />
                      <Input placeholder="City" value={stop.city} onChange={(e) => updateStop(index, "city", e.target.value)} />
                      <Input placeholder="State" value={stop.state} onChange={(e) => updateStop(index, "state", e.target.value)} />
                      <Input placeholder="Zip" value={stop.zip} onChange={(e) => updateStop(index, "zip", e.target.value)} />
                      <Input placeholder="Notes" value={stop.notes ?? ""} onChange={(e) => updateStop(index, "notes", e.target.value)} />
                      <Input placeholder="Appt start" value={stop.apptStart ?? ""} onChange={(e) => updateStop(index, "apptStart", e.target.value)} />
                      <Input placeholder="Appt end" value={stop.apptEnd ?? ""} onChange={(e) => updateStop(index, "apptEnd", e.target.value)} />
                    </div>
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
                <Button onClick={saveDraft} disabled={saving}>Save draft</Button>
                <Button variant="secondary" onClick={loadDoc}>Reload</Button>
                <Button onClick={createLoad} disabled={!ready || creating}>
                  {ready ? "Create load" : "Complete required fields"}
                </Button>
              </div>
              {doc?.status ? <div className="text-xs text-black/50">Status: {doc.status}</div> : null}
            </div>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}

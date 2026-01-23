"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const DOC_TYPES = ["POD", "RATECON", "BOL", "LUMPER", "SCALE", "DETENTION", "OTHER"] as const;

export default function LoadDetailsPage() {
  const params = useParams();
  const loadId = params?.id as string | undefined;
  const [load, setLoad] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [tracking, setTracking] = useState<{ session: any | null; ping: any | null } | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [operatingEntities, setOperatingEntities] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "billing" | "audit">("overview");
  const [docChecklist, setDocChecklist] = useState<Record<string, any>>({});
  const [docRejectReasons, setDocRejectReasons] = useState<Record<string, string>>({});
  const [uploadType, setUploadType] = useState<string>("POD");
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [freightEditing, setFreightEditing] = useState(false);
  const [freightSaving, setFreightSaving] = useState(false);
  const [freightForm, setFreightForm] = useState({
    loadType: "COMPANY",
    operatingEntityId: "",
    shipperReferenceNumber: "",
    consigneeReferenceNumber: "",
    palletCount: "",
    weightLbs: "",
  });

  const loadData = async () => {
    if (!loadId) return;
    try {
      const [loadData, timelineData, trackingData, meData] = await Promise.all([
        apiFetch<{ load: any }>(`/loads/${loadId}`),
        apiFetch<{ load: any; timeline: any[] }>(`/loads/${loadId}/timeline`),
        apiFetch<{ session: any | null; ping: any | null }>(`/tracking/load/${loadId}/latest`),
        apiFetch<{ user: any }>("/auth/me"),
      ]);
      setLoad(loadData.load);
      setTimeline(timelineData.timeline ?? []);
      setTracking(trackingData);
      setUser(meData.user);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadId]);

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

  const podDocs = load?.docs?.filter((doc: any) => doc.type === "POD") ?? [];
  const docCount = load?.docs?.length ?? 0;
  const podStatus = useMemo(() => {
    if (podDocs.length === 0) return "Missing";
    if (podDocs.some((doc: any) => doc.status === "REJECTED")) return "Rejected";
    if (podDocs.some((doc: any) => doc.status === "VERIFIED")) return "Verified";
    return "Uploaded";
  }, [podDocs]);
  const documentsIndicator = podStatus === "Verified" ? "OK" : podStatus === "Rejected" ? "X" : "!";

  const shipperStop = load?.stops?.find((stop: any) => stop.type === "PICKUP");
  const consigneeStop = load?.stops?.find((stop: any) => stop.type === "DELIVERY");

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

  const latestPing = tracking?.ping;
  const pingLat = latestPing?.lat ? Number(latestPing.lat) : null;
  const pingLng = latestPing?.lng ? Number(latestPing.lng) : null;
  const mapLink = pingLat !== null && pingLng !== null ? `https://www.google.com/maps?q=${pingLat},${pingLng}` : null;

  const canVerify = user?.role === "ADMIN" || user?.role === "BILLING";
  const canUpload = user?.role === "ADMIN" || user?.role === "DISPATCHER";
  const canEditLoad = user?.role === "ADMIN" || user?.role === "DISPATCHER";

  return (
    <AppShell title="Load Details" subtitle="Shipper -> Consignee, documents, tracking, billing">
      {error ? (
        <Card>
          <div className="text-sm text-red-600">{error}</div>
        </Card>
      ) : null}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-black/50">Load</div>
            <div className="text-2xl font-semibold">{load?.loadNumber ?? loadId}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-black/70">
              {load?.status ?? "UNKNOWN"}
            </span>
            <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-black/70">
              {load?.loadType === "BROKERED" ? "Brokered" : "Company"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-black/70">
          <div>{shipperStop?.city ?? "-"}, {shipperStop?.state ?? "-"} -> {consigneeStop?.city ?? "-"}, {consigneeStop?.state ?? "-"}</div>
          <div>Driver: {load?.driver?.name ?? "Unassigned"}</div>
          <div>Truck: {load?.truck?.unit ?? "-"}</div>
          <div>Operating entity: {load?.operatingEntity?.name ?? "-"}</div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {(["overview", "documents", "billing", "audit"] as const).map((tab) => (
          <button
            key={tab}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              activeTab === tab ? "bg-moss text-white" : "border border-black/10 bg-white text-black/70"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "documents"
              ? `Documents (${docCount}) ${documentsIndicator}`
              : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr,0.9fr]">
        <div className="space-y-6">
          {activeTab === "overview" ? (
            <>
              <Card className="space-y-4">
                <div className="text-xs uppercase tracking-widest text-black/50">Stops</div>
                <div className="grid gap-3">
                  {load?.stops?.map((stop: any) => (
                    <div key={stop.id} className="rounded-2xl border border-black/10 bg-white/70 px-4 py-3">
                      <div className="text-xs uppercase tracking-widest text-black/40">
                        {stop.type === "PICKUP" ? "Shipper" : stop.type === "DELIVERY" ? "Consignee" : "Yard"}
                      </div>
                      <div className="text-lg font-semibold">{stop.name}</div>
                      <div className="text-sm text-black/60">{stop.address}, {stop.city} {stop.state} {stop.zip}</div>
                      <div className="text-xs text-black/50">Status: {stop.status}</div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="space-y-4">
                <div className="text-xs uppercase tracking-widest text-black/50">Tasks</div>
                <div className="grid gap-2">
                  {load?.tasks?.map((task: any) => (
                    <div key={task.id} className="rounded-2xl border border-black/10 bg-white/70 px-4 py-2">
                      <div className="text-xs uppercase tracking-widest text-black/50">{task.type}</div>
                      <div className="text-sm font-semibold">{task.title}</div>
                      <div className="text-xs text-black/60">Status: {task.status}</div>
                    </div>
                  ))}
                  {load?.tasks?.length ? null : <div className="text-sm text-black/60">No tasks yet.</div>}
                </div>
              </Card>
              <Card className="space-y-4">
                <div className="text-xs uppercase tracking-widest text-black/50">Timeline</div>
                <div className="grid gap-2">
                  {timeline.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-black/10 bg-white/70 px-4 py-2">
                      <div className="text-xs uppercase tracking-widest text-black/50">{item.type}</div>
                      <div className="text-sm font-semibold">{item.message}</div>
                      <div className="text-xs text-black/60">{new Date(item.time).toLocaleString()}</div>
                    </div>
                  ))}
                  {timeline.length === 0 ? <div className="text-sm text-black/60">No activity yet.</div> : null}
                </div>
              </Card>
            </>
          ) : null}

          {activeTab === "documents" ? (
            <Card className="space-y-4">
              <div className="text-xs uppercase tracking-widest text-black/50">Documents</div>
              <div className="grid gap-3">
                {load?.docs?.map((doc: any) => (
                  <div key={doc.id} className="rounded-2xl border border-black/10 bg-white/70 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{doc.type}</div>
                        <div className="text-xs text-black/60">{doc.status}</div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => openDoc(doc)}>
                        Open
                      </Button>
                    </div>
                    {doc.type === "POD" && canVerify ? (
                      <div className="mt-3 space-y-2 text-sm text-black/70">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={docChecklist[doc.id]?.signature ?? true}
                            onChange={(e) =>
                              setDocChecklist({
                                ...docChecklist,
                                [doc.id]: { ...docChecklist[doc.id], signature: e.target.checked },
                              })
                            }
                          />
                          Signature present
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={docChecklist[doc.id]?.printed ?? true}
                            onChange={(e) =>
                              setDocChecklist({
                                ...docChecklist,
                                [doc.id]: { ...docChecklist[doc.id], printed: e.target.checked },
                              })
                            }
                          />
                          Printed name present
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={docChecklist[doc.id]?.date ?? true}
                            onChange={(e) =>
                              setDocChecklist({
                                ...docChecklist,
                                [doc.id]: { ...docChecklist[doc.id], date: e.target.checked },
                              })
                            }
                          />
                          Consignee date present
                        </label>
                        <label className="flex items-center gap-2">
                          Pages
                          <input
                            type="number"
                            min={1}
                            className="w-20 rounded-xl border border-black/10 px-2 py-1"
                            value={docChecklist[doc.id]?.pages ?? 1}
                            onChange={(e) =>
                              setDocChecklist({
                                ...docChecklist,
                                [doc.id]: { ...docChecklist[doc.id], pages: e.target.value },
                              })
                            }
                          />
                        </label>
                        <input
                          className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                          placeholder="Reject reason (required)"
                          value={docRejectReasons[doc.id] ?? ""}
                          onChange={(e) => setDocRejectReasons({ ...docRejectReasons, [doc.id]: e.target.value })}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => verifyDoc(doc.id)}>Verify</Button>
                          <Button size="sm" variant="danger" onClick={() => rejectDoc(doc.id)} disabled={!docRejectReasons[doc.id]}>
                            Reject
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
                {docCount === 0 ? <div className="text-sm text-black/60">No documents yet.</div> : null}
              </div>
            </Card>
          ) : null}

          {activeTab === "billing" ? (
            <Card className="space-y-4">
              <div className="text-xs uppercase tracking-widest text-black/50">Billing</div>
              <div className="text-sm text-black/70">Invoice status: {invoice?.status ?? "Not generated"}</div>
              <div className="flex flex-wrap gap-2">
                {load?.status === "READY_TO_INVOICE" && canVerify ? (
                  <Button onClick={generateInvoice}>Generate invoice</Button>
                ) : null}
                {invoice?.pdfPath ? (
                  <Button variant="secondary" onClick={() => window.open(`${API_BASE}/invoices/${invoice.id}/pdf`, "_blank")}>
                    Download PDF
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}

          {activeTab === "audit" ? (
            <Card className="space-y-4">
              <div className="text-xs uppercase tracking-widest text-black/50">Audit</div>
              <div className="grid gap-2">
                {timeline.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-black/10 bg-white/70 px-4 py-2">
                    <div className="text-xs uppercase tracking-widest text-black/50">{item.type}</div>
                    <div className="text-sm font-semibold">{item.message}</div>
                    <div className="text-xs text-black/60">{new Date(item.time).toLocaleString()}</div>
                  </div>
                ))}
                {timeline.length === 0 ? <div className="text-sm text-black/60">No audit events yet.</div> : null}
              </div>
            </Card>
          ) : null}
        </div>

        <div>
          <div className="sticky top-6 space-y-4">
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-widest text-black/50">Documents & POD</div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest ${
                  podStatus === "Verified" ? "bg-emerald-100 text-emerald-800" :
                  podStatus === "Rejected" ? "bg-rose-100 text-rose-800" :
                  podStatus === "Uploaded" ? "bg-amber-100 text-amber-800" :
                  "bg-slate-100 text-slate-600"
                }`}>
                  {podStatus}
                </span>
              </div>
              <div className="grid gap-2">
                {load?.docs?.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm">
                    <div>
                      <div className="font-semibold">{doc.type}</div>
                      <div className="text-xs text-black/50">{doc.status}</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => openDoc(doc)}>
                      Open
                    </Button>
                  </div>
                ))}
                {docCount === 0 ? <div className="text-sm text-black/60">No documents yet.</div> : null}
              </div>
              {canUpload ? (
                <div className="space-y-2">
                  <select
                    className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                  >
                    {DOC_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <label className="block rounded-2xl border border-dashed border-black/20 bg-white/70 px-4 py-3 text-center text-sm font-semibold text-black/70">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadDoc(file);
                      }}
                    />
                    {uploading ? "Uploading..." : "Upload document"}
                  </label>
                  {uploadNote ? <div className="text-xs text-black/60">{uploadNote}</div> : null}
                </div>
              ) : null}
            </Card>

            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-widest text-black/50">Freight</div>
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
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-widest text-black/40">Load type</div>
                    <select
                      className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                      value={freightForm.loadType}
                      onChange={(e) => setFreightForm({ ...freightForm, loadType: e.target.value })}
                    >
                      <option value="COMPANY">Company</option>
                      <option value="BROKERED">Brokered</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-widest text-black/40">Operating entity</div>
                    {user?.role === "ADMIN" && operatingEntities.length > 0 ? (
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                        value={freightForm.operatingEntityId}
                        onChange={(e) => setFreightForm({ ...freightForm, operatingEntityId: e.target.value })}
                      >
                        {operatingEntities.map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.name} {entity.isDefault ? "· Default" : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        disabled
                        value={load?.operatingEntity?.name ?? "Operating entity"}
                      />
                    )}
                  </div>
                  <Input
                    placeholder="Shipper reference #"
                    value={freightForm.shipperReferenceNumber}
                    onChange={(e) => setFreightForm({ ...freightForm, shipperReferenceNumber: e.target.value })}
                  />
                  <Input
                    placeholder="Consignee reference #"
                    value={freightForm.consigneeReferenceNumber}
                    onChange={(e) => setFreightForm({ ...freightForm, consigneeReferenceNumber: e.target.value })}
                  />
                  <Input
                    placeholder="Pallet count"
                    value={freightForm.palletCount}
                    onChange={(e) => setFreightForm({ ...freightForm, palletCount: e.target.value })}
                  />
                  <Input
                    placeholder="Weight (lbs)"
                    value={freightForm.weightLbs}
                    onChange={(e) => setFreightForm({ ...freightForm, weightLbs: e.target.value })}
                  />
                  <Button size="sm" onClick={saveFreight} disabled={freightSaving}>
                    {freightSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="text-sm text-black/70">Pallets: {load?.palletCount ?? "—"}</div>
                  <div className="text-sm text-black/70">Weight: {load?.weightLbs ?? "—"} lbs</div>
                  <div className="text-sm text-black/70">Shipper ref: {load?.shipperReferenceNumber ?? "—"}</div>
                  <div className="text-sm text-black/70">Consignee ref: {load?.consigneeReferenceNumber ?? "—"}</div>
                </>
              )}
            </Card>

            <Card className="space-y-2">
              <div className="text-xs uppercase tracking-widest text-black/50">Tracking</div>
              <div className="text-sm text-black/70">Status: {tracking?.session?.status ?? "OFF"}</div>
              <div className="text-sm text-black/70">Provider: {latestPing?.providerType ?? tracking?.session?.providerType ?? "—"}</div>
              <div className="text-sm text-black/70">
                Last ping: {latestPing?.capturedAt ? new Date(latestPing.capturedAt).toLocaleString() : "—"}
              </div>
              {mapLink ? (
                <Button size="sm" variant="secondary" onClick={() => window.open(mapLink, "_blank")}>
                  Open map
                </Button>
              ) : null}
            </Card>

            <Card className="space-y-2">
              <div className="text-xs uppercase tracking-widest text-black/50">Billing</div>
              <div className="text-sm text-black/70">Invoice: {invoice?.status ?? "Not generated"}</div>
              {load?.status === "READY_TO_INVOICE" && canVerify ? (
                <Button size="sm" onClick={generateInvoice}>Generate invoice</Button>
              ) : null}
              {invoice?.pdfPath ? (
                <Button size="sm" variant="secondary" onClick={() => window.open(`${API_BASE}/invoices/${invoice.id}/pdf`, "_blank")}>
                  Download PDF
                </Button>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

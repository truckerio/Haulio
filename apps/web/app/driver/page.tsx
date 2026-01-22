"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { DocType } from "@truckerio/shared";
import { enqueueUpload, listQueuedUploads, removeQueuedUpload, type QueuedUpload } from "@/lib/offlineQueue";

const DISPATCH_PHONE = "+15550101000";

export default function DriverPage() {
  const router = useRouter();
  const [load, setLoad] = useState<any | null>(null);
  const [settings, setSettings] = useState<any | null>(null);
  const [queued, setQueued] = useState<QueuedUpload[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const [earnings, setEarnings] = useState<any | null>(null);
  const [pendingSettlements, setPendingSettlements] = useState<any[]>([]);

  const refreshQueued = useCallback(async () => {
    const items = await listQueuedUploads();
    setQueued(items);
  }, []);

  const loadData = useCallback(async () => {
    const [loadData, settingsData] = await Promise.all([
      apiFetch<{ load: any | null }>("/driver/current"),
      apiFetch<{ settings: any | null }>("/driver/settings"),
    ]);
    setLoad(loadData.load);
    setSettings(settingsData.settings);
    try {
      const earningsData = await apiFetch<any>("/driver/earnings");
      setEarnings(earningsData);
    } catch {
      setEarnings(null);
    }
    try {
      const settlementData = await apiFetch<{ settlements?: any[] }>(
        "/settlements?status=PENDING&groupBy=none"
      );
      setPendingSettlements((settlementData.settlements ?? []).slice(0, 4));
    } catch {
      setPendingSettlements([]);
    }
    await refreshQueued();
  }, [refreshQueued]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const stops = (load?.stops ?? []).slice().sort((a: any, b: any) => a.sequence - b.sequence);
  const podDoc = load?.docs?.find((doc: any) => doc.type === "POD");
  const nextStop = stops.find((stop: any) => {
    if (stop.type === "PICKUP" || stop.type === "YARD") {
      return !stop.arrivedAt || !stop.departedAt;
    }
    return !stop.arrivedAt;
  });
  const finalStop = [...stops].reverse().find((stop: any) => stop.type === "DELIVERY") ?? stops[stops.length - 1];

  const nextStep = useMemo(() => {
    if (nextStop) {
      if (!nextStop.arrivedAt) {
        return { label: `Arrived at ${nextStop.name}`, action: "arrive", stopId: nextStop.id };
      }
      if ((nextStop.type === "PICKUP" || nextStop.type === "YARD") && !nextStop.departedAt) {
        return { label: `Departed ${nextStop.name}`, action: "depart", stopId: nextStop.id };
      }
    }
    if (finalStop?.arrivedAt && !podDoc) {
      return { label: "Upload POD", action: "upload", docType: "POD" };
    }
    if (podDoc && podDoc.status !== "VERIFIED") {
      return { label: "Waiting for verification", action: "waiting" };
    }
    return { label: "You're all set", action: "done" };
  }, [nextStop, finalStop, podDoc]);

  const reminderDue = useMemo(() => {
    if (!finalStop?.arrivedAt || podDoc) return false;
    const missingMinutes = settings?.missingPodAfterMinutes ?? 60;
    const elapsed = Date.now() - new Date(finalStop.arrivedAt).getTime();
    return elapsed > missingMinutes * 60 * 1000;
  }, [finalStop, podDoc, settings]);

  const lastActionTime = useMemo(() => {
    const times = stops
      .flatMap((stop: any) => [stop.arrivedAt, stop.departedAt])
      .filter(Boolean)
      .map((time: string) => new Date(time).getTime());
    if (times.length === 0) return null;
    return Math.max(...times);
  }, [stops]);

  const allowUndo = lastActionTime ? Date.now() - lastActionTime < 5 * 60 * 1000 : false;

  const handleArriveDepart = async () => {
    if (!nextStep.stopId) return;
    if (!navigator.onLine) {
      setActionNote("Offline. Connect to submit this update.");
      return;
    }
    const confirmText =
      nextStep.action === "arrive"
        ? `Confirm you arrived at ${nextStop?.type}: ${nextStop?.name}`
        : `Confirm you departed from ${nextStop?.type}: ${nextStop?.name}`;
    const ok = window.confirm(confirmText);
    if (!ok) return;
    const endpoint = nextStep.action === "arrive" ? "arrive" : "depart";
    await apiFetch(`/driver/stops/${nextStep.stopId}/${endpoint}`, { method: "POST" });
    loadData();
    setActionNote("Update sent.");
  };

  const compressIfNeeded = async (file: File) => {
    if (!file.type.startsWith("image/")) return file;
    const compressed = await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
    });
    return new File([compressed], file.name, { type: compressed.type });
  };

  const renameFile = (file: File, docType: string) => {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    const name = `${load?.loadNumber ?? "load"}-${docType}-${stamp}.${file.name.split(".").pop()}`;
    return new File([file], name, { type: file.type });
  };

  const uploadDoc = async (file: File, type: DocType) => {
    if (!load) return;
    setUploading(true);
    setUploadNote(null);
    const processed = renameFile(await compressIfNeeded(file), type);

    if (!navigator.onLine) {
      const queuedItem: QueuedUpload = {
        id: crypto.randomUUID(),
        loadId: load.id,
        type,
        fileName: processed.name,
        mimeType: processed.type,
        blob: processed,
        createdAt: Date.now(),
      };
      await enqueueUpload(queuedItem);
      await refreshQueued();
      setUploading(false);
      setUploadNote("Queued for upload when back online.");
      return;
    }

    const body = new FormData();
    body.append("file", processed);
    body.append("type", type);
    body.append("loadId", load.id);
    try {
      await apiFetch("/driver/docs", { method: "POST", body });
      setUploadNote("Upload complete.");
      await loadData();
    } catch (error) {
      const queuedItem: QueuedUpload = {
        id: crypto.randomUUID(),
        loadId: load.id,
        type,
        fileName: processed.name,
        mimeType: processed.type,
        blob: processed,
        createdAt: Date.now(),
      };
      await enqueueUpload(queuedItem);
      await refreshQueued();
      setUploadNote("Upload queued. Will retry automatically.");
    } finally {
      setUploading(false);
    }
  };

  const flushQueue = useCallback(async () => {
    const items = await listQueuedUploads();
    if (items.length === 0) return;
    for (const item of items) {
      const body = new FormData();
      body.append("file", item.blob, item.fileName);
      body.append("type", item.type);
      body.append("loadId", item.loadId);
      try {
        await apiFetch("/driver/docs", { method: "POST", body });
        await removeQueuedUpload(item.id);
      } catch (error) {
        continue;
      }
    }
    await refreshQueued();
  }, [refreshQueued]);

  useEffect(() => {
    if (isOnline) {
      flushQueue();
    }
  }, [isOnline, flushQueue]);

  const handleUndo = async () => {
    if (!load) return;
    await apiFetch("/driver/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loadId: load.id }),
    });
    loadData();
  };

  const submitNote = async () => {
    if (!load || !noteText.trim()) return;
    if (!navigator.onLine) {
      setNoteStatus("Offline. Try again when connected.");
      return;
    }
    try {
      await apiFetch("/driver/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loadId: load.id, note: noteText.trim() }),
      });
      setNoteText("");
      setNoteStatus("Note sent.");
      loadData();
    } catch (error) {
      setNoteStatus((error as Error).message);
    }
  };

  const requiredDocs = (settings?.requiredDocs ?? ["POD"]) as DocType[];
  const estimatedPay = earnings?.estimatedPay ?? "0.00";
  const formatDate = (date: Date) => date.toISOString().slice(0, 10);
  const startOfIsoWeek = (date: Date) => {
    const copy = new Date(date);
    const day = copy.getDay() || 7;
    copy.setDate(copy.getDate() - (day - 1));
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  const openSettlements = (range: "this" | "last" | "last4") => {
    const today = new Date();
    let from = startOfIsoWeek(today);
    let to = new Date(today);
    if (range === "last") {
      from = new Date(from);
      from.setDate(from.getDate() - 7);
      to = new Date(from);
      to.setDate(to.getDate() + 6);
    } else if (range === "last4") {
      from = new Date(today);
      from.setDate(from.getDate() - 28);
    }
    router.push(`/driver/settlements?status=PENDING&from=${formatDate(from)}&to=${formatDate(to)}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand via-white to-clay px-6 py-10">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <div className="rounded-3xl bg-white/80 p-6 shadow-soft">
          <div className="text-xs uppercase tracking-widest text-black/50">Driver Home</div>
          <h1 className="text-2xl font-semibold">My Current Load</h1>
          <div className="mt-2">
            <Button variant="ghost" onClick={loadData}>
              Refresh
            </Button>
          </div>
          {!load ? <p className="mt-3 text-black/60">No load assigned.</p> : null}
          {load ? (
            <div className="mt-4 space-y-2">
              <div className="text-lg font-semibold">{load.loadNumber}</div>
              <div className="text-sm text-black/60">{load.customer?.name ?? load.customerName}</div>
              <div className="text-sm text-black/60">Status: {load.status}</div>
            </div>
          ) : null}
        </div>

        {earnings ? (
          <Card className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-black/50">This week</div>
            <div className="text-2xl font-semibold">
              ${estimatedPay}
            </div>
            <div className="text-sm text-black/60">
              {earnings.milesThisWeek ?? 0} mi · ${earnings.ratePerMile ?? "0.00"}/mi · {earnings.loadCount ?? 0} loads
            </div>
          </Card>
        ) : null}

        <Card className="space-y-3">
          <div className="text-xs uppercase tracking-widest text-black/50">Pay</div>
          <div className="grid gap-2">
            {pendingSettlements.length === 0 ? (
              <div className="text-sm text-black/60">No pending settlements.</div>
            ) : (
              pendingSettlements.map((settlement) => (
                <div key={settlement.id} className="rounded-2xl border border-black/10 bg-white/70 px-4 py-2 text-sm">
                  <div className="text-xs uppercase tracking-widest text-black/50">{settlement.status}</div>
                  <div className="font-semibold">{settlement.weekLabel ?? "Pay period"}</div>
                  <div className="text-xs text-black/60">
                    {new Date(settlement.periodStart).toLocaleDateString()} → {new Date(settlement.periodEnd).toLocaleDateString()}
                  </div>
                  <div className="text-sm text-black/70">Net ${settlement.net ?? settlement.gross ?? "0.00"}</div>
                </div>
              ))
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openSettlements("this")}>This week</Button>
            <Button variant="secondary" onClick={() => openSettlements("last")}>Last week</Button>
            <Button variant="secondary" onClick={() => openSettlements("last4")}>Last 4 weeks</Button>
          </div>
          <Button onClick={() => router.push("/driver/settlements?status=PENDING")}>
            View all settlements
          </Button>
        </Card>

        {reminderDue ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-100/70 p-4 text-sm font-semibold text-amber-900">
            POD needed to get you paid faster. Tap Upload.
          </div>
        ) : null}

        <Card className="space-y-4">
          <div className="text-xs uppercase tracking-widest text-black/50">Next Step</div>
          <div className="text-2xl font-semibold">{nextStep.label}</div>
          {nextStep.action === "arrive" || nextStep.action === "depart" ? (
            <Button size="lg" className="w-full text-xl" onClick={handleArriveDepart}>
              {nextStep.label}
            </Button>
          ) : null}
          {nextStep.action === "upload" ? (
            <div className="flex flex-col gap-3">
              <label className="rounded-3xl border border-dashed border-black/10 bg-white p-4 text-center">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadDoc(file, "POD");
                  }}
                />
                <div className="text-lg font-semibold">Upload POD</div>
                <div className="text-sm text-black/60">Camera or file picker</div>
              </label>
            </div>
          ) : null}
          {nextStep.action === "waiting" ? (
            <div className="rounded-2xl bg-black/5 px-4 py-3 text-sm text-black/70">
              Waiting for verification. You can add more docs below.
            </div>
          ) : null}
          {nextStep.action === "done" ? (
            <Button
              size="lg"
              variant="secondary"
              className="w-full"
              onClick={() => window.confirm("All set! Your dispatcher can see this.")}
            >
              I&apos;m done
            </Button>
          ) : null}
          {allowUndo ? (
            <Button variant="ghost" onClick={handleUndo}>
              Undo last action (5 min)
            </Button>
          ) : null}
          {actionNote ? <div className="text-sm text-black/60">{actionNote}</div> : null}
        </Card>

        {load ? (
          <Card className="space-y-3">
            <div className="text-xs uppercase tracking-widest text-black/50">Stop info</div>
            <div className="text-lg font-semibold">{nextStop?.name ?? finalStop?.name}</div>
            <div className="text-sm text-black/60">
              {nextStop?.address ?? finalStop?.address}, {nextStop?.city ?? finalStop?.city} {nextStop?.state ?? finalStop?.state}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="lg"
                className="w-full"
                onClick={() =>
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      `${nextStop?.address ?? finalStop?.address ?? ""} ${nextStop?.city ?? finalStop?.city ?? ""} ${nextStop?.state ?? finalStop?.state ?? ""}`
                    )}`,
                    "_blank"
                  )
                }
              >
                Navigate
              </Button>
              <Button size="lg" variant="secondary" className="w-full" onClick={() => (window.location.href = `tel:${DISPATCH_PHONE}`)}>
                Call dispatcher
              </Button>
            </div>
          </Card>
        ) : null}

        <Card className="space-y-4">
          <div className="text-xs uppercase tracking-widest text-black/50">Document checklist</div>
          <div className="grid gap-3">
            {requiredDocs.map((docType: DocType) => {
              const uploaded = load?.docs?.some((doc: any) => doc.type === docType);
              return (
                <div key={docType} className="flex items-center justify-between rounded-2xl border border-black/10 bg-white/70 px-4 py-3">
                  <div>
                    <div className="text-lg font-semibold">{docType}</div>
                    <div className="text-sm text-black/60">{uploaded ? "Uploaded" : "Needed"}</div>
                  </div>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadDoc(file, docType);
                      }}
                    />
                    <span className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white">Upload</span>
                  </label>
                </div>
              );
            })}
          </div>
          {uploading ? <div className="text-sm text-black/60">Uploading...</div> : null}
          {uploadNote ? <div className="text-sm text-emerald-700">{uploadNote}</div> : null}
        </Card>

        {load ? (
          <Card className="space-y-3">
            <div className="text-xs uppercase tracking-widest text-black/50">Optional note</div>
            <textarea
              className="min-h-[90px] w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-base focus:outline-none"
              placeholder="Add a quick note (voice-to-text friendly)"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <Button onClick={submitNote}>Send note</Button>
            {noteStatus ? <div className="text-sm text-black/60">{noteStatus}</div> : null}
          </Card>
        ) : null}

        {queued.length > 0 ? (
          <Card className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-black/50">Offline queue</div>
            {queued.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl border border-black/10 bg-white/70 px-4 py-3">
                <div>
                  <div className="font-semibold">{item.type}</div>
                  <div className="text-xs text-black/60">Queued · {new Date(item.createdAt).toLocaleTimeString()}</div>
                </div>
                <Button variant="secondary" onClick={flushQueue}>
                  Retry
                </Button>
              </div>
            ))}
          </Card>
        ) : null}

        <div className="text-center text-xs text-black/50">{isOnline ? "Online" : "Offline"} mode</div>
      </div>
    </div>
  );
}

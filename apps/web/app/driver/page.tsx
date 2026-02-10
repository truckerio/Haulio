"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { DriverShell } from "@/components/driver/driver-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { apiFetch } from "@/lib/api";
import { createId } from "@/lib/uuid";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import type { DocType } from "@truckerio/shared";
import { enqueueUpload, listQueuedUploads, removeQueuedUpload, type QueuedUpload } from "@/lib/offlineQueue";
import { deriveDriverState, getComplianceStatus, type DriverState } from "@/lib/driver-ops";
import { formatDocStatusLabel, formatSettlementStatusLabel } from "@/lib/status-format";

const DISPATCH_PHONE = "+15550101000";
const HIGHLIGHT_CLASSES = ["ring-2", "ring-[color:var(--color-accent-soft)]", "ring-offset-2"];

type DocStatus = "UPLOADED" | "VERIFIED" | "REJECTED";
type StopType = "PICKUP" | "YARD" | "DELIVERY";
type StopStatus = "PLANNED" | "ARRIVED" | "DEPARTED" | "SKIPPED";
type LoadStatus =
  | "DRAFT"
  | "PLANNED"
  | "ASSIGNED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "POD_RECEIVED"
  | "READY_TO_INVOICE"
  | "INVOICED"
  | "PAID"
  | "CANCELLED";
type TrackingStatus = "ON" | "OFF" | "ERROR" | "ENDED";
type SettlementStatus = "DRAFT" | "FINALIZED" | "PAID";

type DriverProfile = {
  id: string;
  name: string;
  phone?: string | null;
  license?: string | null;
  licenseExpiresAt?: string | null;
  medCardExpiresAt?: string | null;
  profilePhotoUrl?: string | null;
};

type DriverDoc = {
  id: string;
  type: DocType;
  status: DocStatus;
  uploadedAt?: string | null;
  verifiedAt?: string | null;
  rejectedAt?: string | null;
  rejectReason?: string | null;
};

type DriverStop = {
  id: string;
  type: StopType;
  status: StopStatus;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  appointmentStart?: string | null;
  appointmentEnd?: string | null;
  arrivedAt?: string | null;
  departedAt?: string | null;
  sequence: number;
};

type DriverLoad = {
  id: string;
  loadNumber: string;
  status: LoadStatus;
  assignedDriverId?: string | null;
  customer?: { name: string | null } | null;
  customerName?: string | null;
  deliveredAt?: string | null;
  stops: DriverStop[];
  docs: DriverDoc[];
  driver?: DriverProfile | null;
  assignmentMembers?: LoadAssignmentMember[];
};

type DriverSettings = {
  requiredDocs: DocType[];
  requiredDriverDocs: string[];
  reminderFrequencyMinutes?: number | null;
  missingPodAfterMinutes?: number | null;
};

type DriverEarnings = {
  weekStart?: string;
  milesThisWeek?: number;
  ratePerMile?: string;
  estimatedPay?: string;
  loadCount?: number;
};

type DriverSettlement = {
  id: string;
  status: SettlementStatus;
  periodStart: string;
  periodEnd: string;
  net?: string | number | null;
  gross?: string | number | null;
  weekLabel?: string | null;
  paidAt?: string | null;
};

type TrackingSession = {
  status: TrackingStatus;
  startedAt?: string | null;
  endedAt?: string | null;
};

type TrackingPing = {
  capturedAt: string;
};

type TodaySummary = {
  blocks: number;
  warnings: number;
  info: number;
};

type LoadAssignmentRole = "PRIMARY" | "CO_DRIVER";

type LoadAssignmentMember = {
  role: LoadAssignmentRole;
  driverId?: string | null;
  driver?: { id: string; name: string } | null;
};

type NextActionType =
  | "refresh"
  | "arrive"
  | "depart"
  | "upload"
  | "reupload"
  | "enable_tracking"
  | "acknowledge";

type NextAction = {
  label: string;
  action: NextActionType;
  stopId?: string;
  docType?: DocType;
  helper?: string;
};

type Blocker = {
  id: string;
  tone: "danger" | "warning";
  title: string;
  description: string;
};

function getLatestDoc(docs: DriverDoc[]): DriverDoc | null {
  if (docs.length <= 1) return docs[0] ?? null;
  return docs
    .slice()
    .sort((a, b) => {
      const aTime = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const bTime = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return bTime - aTime;
    })[0];
}

export default function DriverPage() {
  const router = useRouter();
  const [load, setLoad] = useState<DriverLoad | null>(null);
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [settings, setSettings] = useState<DriverSettings | null>(null);
  const [queued, setQueued] = useState<QueuedUpload[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const [earnings, setEarnings] = useState<DriverEarnings | null>(null);
  const [pendingSettlements, setPendingSettlements] = useState<DriverSettlement[]>([]);
  const [trackingSession, setTrackingSession] = useState<TrackingSession | null>(null);
  const [trackingPing, setTrackingPing] = useState<TrackingPing | null>(null);
  const [trackingNote, setTrackingNote] = useState<string | null>(null);
  const [complianceAcknowledged, setComplianceAcknowledged] = useState(false);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);

  const refreshQueued = useCallback(async () => {
    const items = await listQueuedUploads();
    setQueued(items);
  }, []);

  const loadData = useCallback(async () => {
    const [loadData, settingsData] = await Promise.all([
      apiFetch<{ load: DriverLoad | null; driver: DriverProfile | null }>("/driver/current"),
      apiFetch<{ settings: DriverSettings | null }>("/driver/settings"),
    ]);
    setLoad(loadData.load);
    setDriver(loadData.driver ?? null);
    setSettings(settingsData.settings);
    if (loadData.load?.id) {
      try {
        const trackingData = await apiFetch<{ session: TrackingSession | null; ping: TrackingPing | null }>(
          `/tracking/load/${loadData.load.id}/latest`
        );
        setTrackingSession(trackingData.session ?? null);
        setTrackingPing(trackingData.ping ?? null);
      } catch {
        setTrackingSession(null);
        setTrackingPing(null);
      }
    } else {
      setTrackingSession(null);
      setTrackingPing(null);
    }
    try {
      const earningsData = await apiFetch<DriverEarnings>("/driver/earnings");
      setEarnings(earningsData);
    } catch {
      setEarnings(null);
    }
    try {
      const settlementData = await apiFetch<{ settlements?: DriverSettlement[] }>(
        "/settlements?status=PENDING&groupBy=none"
      );
      setPendingSettlements((settlementData.settlements ?? []).slice(0, 4));
    } catch {
      setPendingSettlements([]);
    }
    try {
      const todayData = await apiFetch<{ blocks: unknown[]; warnings: unknown[]; info: unknown[] }>("/today");
      setTodaySummary({
        blocks: todayData.blocks.length,
        warnings: todayData.warnings.length,
        info: todayData.info.length,
      });
      setTodayError(null);
    } catch (err) {
      setTodaySummary(null);
      setTodayError((err as Error).message);
    }
    await refreshQueued();
  }, [refreshQueued]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const highlightAnchor = useCallback((hash: string) => {
    if (!hash) return;
    const id = hash.replace("#", "");
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.add(...HIGHLIGHT_CLASSES);
    window.setTimeout(() => {
      target.classList.remove(...HIGHLIGHT_CLASSES);
    }, 1000);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    highlightAnchor(window.location.hash);
    const onHashChange = () => highlightAnchor(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [highlightAnchor]);

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

  const stops = (load?.stops ?? []).slice().sort((a, b) => a.sequence - b.sequence);
  const podDocs = (load?.docs ?? []).filter((doc) => doc.type === "POD");
  const podDoc = getLatestDoc(podDocs);
  const nextStop = stops.find((stop) => {
    if (stop.type === "PICKUP" || stop.type === "YARD") {
      return !stop.arrivedAt || !stop.departedAt;
    }
    return !stop.arrivedAt;
  });
  const finalStop = [...stops].reverse().find((stop) => stop.type === "DELIVERY") ?? stops[stops.length - 1];

  const assignmentMembers = load?.assignmentMembers ?? [];
  const primaryMember = assignmentMembers.find((member) => member.role === "PRIMARY") ?? null;
  const coDriverMember = assignmentMembers.find((member) => member.role === "CO_DRIVER") ?? null;
  const currentDriverId = driver?.id ?? null;
  const currentMember = currentDriverId
    ? assignmentMembers.find((member) => member.driver?.id === currentDriverId || member.driverId === currentDriverId)
    : null;
  const assignmentRole: LoadAssignmentRole | null = currentMember?.role
    ?? (load?.driver?.id === currentDriverId || load?.assignedDriverId === currentDriverId ? "PRIMARY" : null);
  const isCoDriver = assignmentRole === "CO_DRIVER";
  const driverRoleLabel = assignmentRole === "CO_DRIVER" ? "Co-driver" : "Primary";
  const otherDriverName = isCoDriver
    ? primaryMember?.driver?.name ?? load?.driver?.name ?? null
    : coDriverMember?.driver?.name ?? null;

  useEffect(() => {
    setComplianceAcknowledged(false);
  }, [isCoDriver, load?.id]);

  const driverProfile = driver ?? load?.driver ?? null;
  const profileIncomplete =
    !driverProfile?.phone || !driverProfile?.license || !driverProfile?.licenseExpiresAt || !driverProfile?.medCardExpiresAt;
  const deliveredAt = load?.deliveredAt ?? finalStop?.arrivedAt ?? null;
  const podRejected = podDocs.some((doc) => doc.status === "REJECTED");
  const podVerified = podDocs.some((doc) => doc.status === "VERIFIED");
  const podUploaded = podDocs.some((doc) => doc.status === "UPLOADED");
  const podMissing = Boolean(deliveredAt && podDocs.length === 0);

  const licenseCompliance = getComplianceStatus(driverProfile?.licenseExpiresAt ?? null);
  const medCardCompliance = getComplianceStatus(driverProfile?.medCardExpiresAt ?? null);
  const complianceExpired = licenseCompliance.status === "EXPIRED" || medCardCompliance.status === "EXPIRED";
  const complianceExpiring =
    !complianceExpired && (licenseCompliance.status === "EXPIRING" || medCardCompliance.status === "EXPIRING");
  const complianceGateActive = complianceExpired && !complianceAcknowledged;

  const currentStop = stops.find((stop) => stop.arrivedAt && !stop.departedAt) ?? null;
  const hasDeparted = stops.some((stop) => Boolean(stop.departedAt));

  const trackingOn = trackingSession?.status === "ON";
  const lastPingAt = trackingPing?.capturedAt ? new Date(trackingPing.capturedAt) : null;
  const trackingRecent = lastPingAt ? Date.now() - lastPingAt.getTime() < 10 * 60 * 1000 : false;
  const trackingActive = trackingOn || trackingRecent;
  const trackingOffInTransit = load?.status === "IN_TRANSIT" && !trackingActive;

  const hasLoad = Boolean(load);

  const driverState: DriverState = deriveDriverState({
    hasLoad: Boolean(load),
    hasDeparted,
    atStop: Boolean(currentStop),
    delivered: Boolean(deliveredAt),
    podMissing,
    docRejected: podRejected,
    pendingSettlements: pendingSettlements.length,
  });

  const nextAction = useMemo<NextAction>(() => {
    if (!load) {
      return { label: "Check for assignment", action: "refresh", helper: "No load assigned." };
    }
    if (isCoDriver) {
      if (deliveredAt) {
        if (podRejected) {
          return { label: "Re-upload POD", action: "reupload", docType: "POD" };
        }
        if (podMissing) {
          return { label: "Upload POD", action: "upload", docType: "POD" };
        }
      }
      return {
        label: "Refresh status",
        action: "refresh",
        helper: "Primary driver updates stop progress. You can upload documents.",
      };
    }
    if (complianceGateActive && nextStop && (!nextStop.arrivedAt || !nextStop.departedAt)) {
      return { label: "Acknowledge compliance to continue", action: "acknowledge" };
    }
    if (nextStop) {
      if (!nextStop.arrivedAt) {
        return { label: `Arrived at ${nextStop.name}`, action: "arrive", stopId: nextStop.id };
      }
      if ((nextStop.type === "PICKUP" || nextStop.type === "YARD") && !nextStop.departedAt) {
        return { label: `Departed ${nextStop.name}`, action: "depart", stopId: nextStop.id };
      }
    }
    if (deliveredAt) {
      if (podRejected) {
        return { label: "Re-upload POD", action: "reupload", docType: "POD" };
      }
      if (podMissing) {
        return { label: "Upload POD", action: "upload", docType: "POD" };
      }
      if (podUploaded && !podVerified) {
        return { label: "Refresh status", action: "refresh" };
      }
    }
    if (trackingOffInTransit) {
      return { label: "Enable tracking", action: "enable_tracking" };
    }
    return { label: "Refresh status", action: "refresh" };
  }, [
    load,
    isCoDriver,
    complianceGateActive,
    nextStop,
    deliveredAt,
    podRejected,
    podMissing,
    podUploaded,
    podVerified,
    trackingOffInTransit,
  ]);

  const podOverdue = useMemo(() => {
    if (!deliveredAt || podDocs.length > 0) return false;
    const missingMinutes = settings?.missingPodAfterMinutes ?? 60;
    const elapsed = Date.now() - new Date(deliveredAt).getTime();
    return elapsed > missingMinutes * 60 * 1000;
  }, [deliveredAt, podDocs.length, settings]);

  const lastActionTime = useMemo(() => {
    const times = stops
      .flatMap((stop) => [stop.arrivedAt, stop.departedAt])
      .filter(Boolean)
      .map((time) => new Date(time as string).getTime());
    if (times.length === 0) return null;
    return Math.max(...times);
  }, [stops]);

  const allowUndo = lastActionTime ? Date.now() - lastActionTime < 5 * 60 * 1000 : false;

  const blockers = useMemo<Blocker[]>(() => {
    const list: Blocker[] = [];
    if (complianceExpired) {
      list.push({
        id: "compliance-expired",
        tone: "danger",
        title: "Compliance expired",
        description: "Acknowledge to continue stop updates.",
      });
    } else if (complianceExpiring) {
      const days = Math.min(
        licenseCompliance.daysRemaining ?? Number.POSITIVE_INFINITY,
        medCardCompliance.daysRemaining ?? Number.POSITIVE_INFINITY
      );
      list.push({
        id: "compliance-expiring",
        tone: "warning",
        title: "Compliance expiring soon",
        description: Number.isFinite(days) ? `Expires in ${days} day(s)` : "Update your documents soon.",
      });
    }
    if (podRejected) {
      list.push({
        id: "pod-rejected",
        tone: "danger",
        title: "Document rejected",
        description: podDoc?.rejectReason ? `Rejected: ${podDoc.rejectReason}` : "Re-upload required.",
      });
    } else if (podMissing && deliveredAt) {
      list.push({
        id: "pod-missing",
        tone: "danger",
        title: "POD required",
        description: podOverdue ? "Billing is blocked until uploaded (overdue)." : "Billing is blocked until uploaded.",
      });
    }
    if (trackingOffInTransit) {
      list.push({
        id: "tracking-off",
        tone: "warning",
        title: "Tracking is off",
        description: "Enable tracking while in transit.",
      });
    }
    return list;
  }, [
    complianceExpired,
    complianceExpiring,
    licenseCompliance.daysRemaining,
    medCardCompliance.daysRemaining,
    podRejected,
    podDoc?.rejectReason,
    podMissing,
    deliveredAt,
    podOverdue,
    trackingOffInTransit,
  ]);

  const handleArriveDepart = async () => {
    if (isCoDriver) {
      setActionNote("Primary driver updates stop progress.");
      return;
    }
    if (!nextAction.stopId) return;
    if (complianceGateActive) {
      setActionNote("Acknowledge compliance to continue.");
      return;
    }
    if (!navigator.onLine) {
      setActionNote("Offline. Connect to submit this update.");
      return;
    }
    const confirmText =
      nextAction.action === "arrive"
        ? `Confirm you arrived at ${nextStop?.type}: ${nextStop?.name}`
        : `Confirm you departed from ${nextStop?.type}: ${nextStop?.name}`;
    const ok = window.confirm(confirmText);
    if (!ok) return;
    const endpoint = nextAction.action === "arrive" ? "arrive" : "depart";
    await apiFetch(`/driver/stops/${nextAction.stopId}/${endpoint}`, { method: "POST" });
    loadData();
    setActionNote("Update sent.");
  };

  const startTracking = async () => {
    if (isCoDriver) {
      setTrackingNote("Primary driver controls trip tracking.");
      return;
    }
    if (!load?.id) return;
    setTrackingNote(null);
    try {
      const data = await apiFetch<{ session: TrackingSession }>(`/tracking/load/${load.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerType: "PHONE" }),
      });
      setTrackingSession(data.session);
    } catch (err) {
      setTrackingNote((err as Error).message);
    }
  };

  const stopTracking = async () => {
    if (isCoDriver) {
      setTrackingNote("Primary driver controls trip tracking.");
      return;
    }
    if (!load?.id) return;
    setTrackingNote(null);
    try {
      const data = await apiFetch<{ session: TrackingSession }>(`/tracking/load/${load.id}/stop`, { method: "POST" });
      setTrackingSession(data.session);
    } catch (err) {
      setTrackingNote((err as Error).message);
    }
  };

  const sendPing = useCallback(async () => {
    if (isCoDriver) {
      setTrackingNote("Primary driver controls trip tracking.");
      return;
    }
    if (!load?.id) return;
    if (!navigator.geolocation) {
      setTrackingNote("Location access is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const body = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: position.coords.accuracy,
            speedMph: position.coords.speed ? position.coords.speed * 2.23694 : undefined,
            heading: position.coords.heading ?? undefined,
            capturedAt: new Date(position.timestamp).toISOString(),
          };
          const data = await apiFetch<{ ping: TrackingPing }>(`/tracking/load/${load.id}/ping`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          setTrackingPing(data.ping);
          setTrackingNote(null);
        } catch (err) {
          setTrackingNote((err as Error).message);
        }
      },
      () => {
        setTrackingNote("Location permission denied or unavailable.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [isCoDriver, load?.id]);

  useEffect(() => {
    if (!load?.id) return;
    if (isCoDriver) return;
    if (trackingSession?.status !== "ON") return;
    sendPing();
    const interval = window.setInterval(() => {
      if (!navigator.onLine) return;
      sendPing();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [isCoDriver, load?.id, trackingSession?.status, sendPing]);

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
        id: createId(),
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
        id: createId(),
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
    if (isCoDriver) {
      setActionNote("Primary driver can undo stop actions.");
      return;
    }
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

  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
  };

  const formatDateOnly = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString();
  };

  const stopTypeLabel = (type: StopType) => {
    if (type === "PICKUP") return "Shipper";
    if (type === "DELIVERY") return "Consignee";
    return "Yard";
  };

  const stopStatusLabel = (stop: DriverStop) => {
    if (stop.departedAt) return "Departed";
    if (stop.arrivedAt) return "Arrived";
    if (stop.status === "SKIPPED") return "Skipped";
    return "Planned";
  };

  const stopStatusTone = (stop: DriverStop) => {
    if (stop.departedAt) return "success" as const;
    if (stop.arrivedAt) return "info" as const;
    if (stop.status === "SKIPPED") return "warning" as const;
    return "neutral" as const;
  };

  const docStatusLabel = (doc: DriverDoc | null) => {
    if (!doc) return "Missing";
    const label = formatDocStatusLabel(doc.status);
    return label === "Verified" ? "Approved" : label;
  };

  const docStatusTone = (doc: DriverDoc | null) => {
    if (!doc) return "warning" as const;
    if (doc.status === "VERIFIED") return "success" as const;
    if (doc.status === "REJECTED") return "danger" as const;
    return "info" as const;
  };

  const driverStateLabel: Record<DriverState, string> = {
    OFF_DUTY: "Off duty",
    AVAILABLE: "Available",
    ASSIGNED: "Assigned",
    EN_ROUTE: "En route",
    AT_STOP: "At stop",
    DELIVERED: "Delivered",
    POD_PENDING: "POD pending",
    DOC_REJECTED: "Doc rejected",
    WAITING_PAY: "Waiting pay",
    PAID: "Paid",
  };

  const driverStateTone: Record<DriverState, "neutral" | "success" | "warning" | "danger" | "info"> = {
    OFF_DUTY: "neutral",
    AVAILABLE: "info",
    ASSIGNED: "info",
    EN_ROUTE: "warning",
    AT_STOP: "warning",
    DELIVERED: "info",
    POD_PENDING: "danger",
    DOC_REJECTED: "danger",
    WAITING_PAY: "info",
    PAID: "success",
  };

  return (
    <DriverShell>
      <Card className="space-y-2">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Today</div>
        <div className="text-sm font-semibold">Your attention stack</div>
        <div className="text-xs text-[color:var(--color-text-muted)]">
          Quick view of actions that need your attention today.
        </div>
        {todaySummary ? (
          <div className="flex flex-wrap gap-2">
            <StatusChip label={`${todaySummary.blocks} Blocks`} tone={todaySummary.blocks > 0 ? "danger" : "neutral"} />
            <StatusChip
              label={`${todaySummary.warnings} Warnings`}
              tone={todaySummary.warnings > 0 ? "warning" : "neutral"}
            />
            <StatusChip label={`${todaySummary.info} Info`} tone="info" />
          </div>
        ) : todayError ? (
          <div className="text-xs text-[color:var(--color-danger)]">{todayError}</div>
        ) : null}
        <Button variant="secondary" onClick={() => router.push("/today")}>
          Open Today
        </Button>
      </Card>
      <div className="rounded-[var(--radius-card)] bg-white/80 p-6 shadow-subtle">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Driver Home</div>
              <h1 className="text-2xl font-semibold">My Current Load</h1>
            </div>
            <StatusChip label={driverStateLabel[driverState]} tone={driverStateTone[driverState]} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={loadData}>
              Refresh
            </Button>
          </div>
          {!load ? (
            <div className="mt-3 space-y-3">
              <p className="text-[color:var(--color-text-muted)]">No load assigned right now.</p>
              <Button variant="secondary" onClick={() => (window.location.href = `tel:${DISPATCH_PHONE}`)}>
                Call dispatcher
              </Button>
            </div>
          ) : null}
          {load ? (
            <div className="mt-4 space-y-2">
              <div className="text-lg font-semibold">{load.loadNumber}</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">{load.customer?.name ?? load.customerName}</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">Status: {load.status}</div>
              {assignmentRole ? (
                <div className="text-sm text-[color:var(--color-text-muted)]">Role: {driverRoleLabel}</div>
              ) : null}
              {otherDriverName ? (
                <div className="text-sm text-[color:var(--color-text-muted)]">
                  {isCoDriver ? "Primary driver" : "Co-driver"}: {otherDriverName}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {profileIncomplete ? (
          <Card className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Profile</div>
            <div className="text-sm font-semibold">Complete your driver profile</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Add phone, license, and medical card details so dispatch can keep your compliance current.
            </div>
            <Button variant="secondary" onClick={() => router.push("/driver/profile")}>
              Update profile
            </Button>
          </Card>
        ) : null}

        {blockers.length > 0 ? (
          <div className="space-y-2">
            {blockers.map((blocker) => (
              <div
                key={blocker.id}
                className={`rounded-[var(--radius-card)] border px-4 py-3 text-sm font-semibold ${
                  blocker.tone === "danger"
                    ? "border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)]/80 text-[color:var(--color-danger)]"
                    : "border-[color:var(--color-warning-soft)] bg-[color:var(--color-warning-soft)]/80 text-[color:var(--color-warning)]"
                }`}
              >
                <div>{blocker.title}</div>
                <div className="text-xs font-normal">{blocker.description}</div>
              </div>
            ))}
          </div>
        ) : null}

        {earnings ? (
          <Card id="pay" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">This week</div>
            <div className="text-2xl font-semibold">
              ${estimatedPay}
            </div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {earnings.milesThisWeek ?? 0} mi · ${earnings.ratePerMile ?? "0.00"}/mi · {earnings.loadCount ?? 0} loads
            </div>
          </Card>
        ) : null}

        <Card id="tracking" className="space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Pay</div>
          <div className="grid gap-2">
            {pendingSettlements.length === 0 ? (
              <div className="text-sm text-[color:var(--color-text-muted)]">No pending settlements.</div>
            ) : (
              pendingSettlements.map((settlement) => (
                <div key={settlement.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-2 text-sm">
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                    {formatSettlementStatusLabel(settlement.status)}
                  </div>
                  <div className="font-semibold">{settlement.weekLabel ?? "Pay period"}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {new Date(settlement.periodStart).toLocaleDateString()} → {new Date(settlement.periodEnd).toLocaleDateString()}
                  </div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">Net ${settlement.net ?? settlement.gross ?? "0.00"}</div>
                </div>
              ))
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openSettlements("this")}>This week</Button>
            <Button variant="secondary" onClick={() => openSettlements("last")}>Last week</Button>
            <Button variant="secondary" onClick={() => openSettlements("last4")}>Last 4 weeks</Button>
          </div>
          <Button variant="secondary" onClick={() => router.push("/driver/settlements?status=PENDING")}>
            View all settlements
          </Button>
        </Card>

        <Card className="space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Next Step</div>
          <div className="text-2xl font-semibold">{nextAction.label}</div>
          {nextAction.helper ? (
            <div className="text-sm text-[color:var(--color-text-muted)]">{nextAction.helper}</div>
          ) : null}
          {nextAction.action === "acknowledge" ? (
            <Button
              size="lg"
              className="w-full text-lg"
              onClick={() => {
                setComplianceAcknowledged(true);
                setActionNote("Compliance acknowledged. You can continue.");
              }}
            >
              Acknowledge compliance
            </Button>
          ) : null}
          {nextAction.action === "arrive" || nextAction.action === "depart" ? (
            <Button
              size="lg"
              className="w-full text-xl"
              onClick={handleArriveDepart}
              disabled={complianceGateActive || isCoDriver}
            >
              {nextAction.label}
            </Button>
          ) : null}
          {nextAction.action === "upload" || nextAction.action === "reupload" ? (
            <div className="flex flex-col gap-3">
              <label className="rounded-[var(--radius-card)] border border-dashed border-[color:var(--color-divider)] bg-white p-4 text-center">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  aria-label="Upload POD"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadDoc(file, "POD");
                  }}
                />
                <div className="text-lg font-semibold">{nextAction.label}</div>
                <div className="text-sm text-[color:var(--color-text-muted)]">Camera or file picker</div>
              </label>
            </div>
          ) : null}
          {nextAction.action === "enable_tracking" ? (
            <Button size="lg" className="w-full text-lg" onClick={startTracking} disabled={isCoDriver}>
              Enable tracking
            </Button>
          ) : null}
          {nextAction.action === "refresh" ? (
            <Button size="lg" className="w-full text-lg" onClick={loadData}>
              Refresh status
            </Button>
          ) : null}
          {allowUndo && !isCoDriver ? (
            <Button variant="ghost" onClick={handleUndo}>
              Undo last action (5 min)
            </Button>
          ) : null}
          {actionNote ? <div className="text-sm text-[color:var(--color-text-muted)]">{actionNote}</div> : null}
        </Card>

        <Card id="compliance" className="space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Trip tracking</div>
          {!hasLoad ? (
            <div className="text-sm text-[color:var(--color-text-muted)]">No active load to track yet.</div>
          ) : null}
          <div className="text-sm text-[color:var(--color-text-muted)]">
            Status: {trackingActive ? "ON" : "OFF"} · Last ping{" "}
            {trackingPing?.capturedAt ? new Date(trackingPing.capturedAt).toLocaleTimeString() : "—"}
          </div>
          <div className="flex flex-wrap gap-2">
            {trackingSession?.status === "ON" ? (
              <Button variant="secondary" onClick={stopTracking} disabled={!hasLoad || isCoDriver}>
                Stop tracking
              </Button>
            ) : (
              <Button variant="secondary" onClick={startTracking} disabled={!hasLoad || isCoDriver}>
                Start trip tracking
              </Button>
            )}
            {trackingSession?.status === "ON" ? (
              <Button variant="ghost" onClick={sendPing} disabled={!hasLoad || isCoDriver}>
                Send ping
              </Button>
            ) : null}
          </div>
          <div className="text-xs text-[color:var(--color-text-muted)]">Keep this page open for best tracking accuracy.</div>
          {trackingNote ? <div className="text-xs text-[color:var(--color-warning)]">{trackingNote}</div> : null}
        </Card>

        <Card className="space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Compliance</div>
          <div className="grid gap-2">
            {[
              { label: "CDL", date: driverProfile?.licenseExpiresAt ?? null, status: licenseCompliance },
              { label: "Med card", date: driverProfile?.medCardExpiresAt ?? null, status: medCardCompliance },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-2 text-sm">
                <div>
                  <div className="font-semibold">{item.label}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    Expires: {item.date ? formatDateOnly(item.date) : "Not on file"}
                  </div>
                  {item.status.status === "EXPIRING" && item.status.daysRemaining !== null ? (
                    <div className="text-xs text-[color:var(--color-warning)]">Expiring in {item.status.daysRemaining} day(s)</div>
                  ) : null}
                </div>
                <StatusChip
                  label={item.status.status === "OK" ? "OK" : item.status.status === "EXPIRING" ? "Expiring" : "Expired"}
                  tone={item.status.status === "OK" ? "success" : item.status.status === "EXPIRING" ? "warning" : "danger"}
                />
              </div>
            ))}
          </div>
          {settings?.requiredDriverDocs?.length ? (
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Required driver docs: {settings.requiredDriverDocs.join(", ")}. Contact admin to update.
            </div>
          ) : (
            <div className="text-xs text-[color:var(--color-text-muted)]">Contact admin to update compliance documents.</div>
          )}
        </Card>

        {load ? (
          <Card id="docs" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Stops</div>
              {nextStop ? (
                <div className="text-xs text-[color:var(--color-text-muted)]">Next: {nextStop.name}</div>
              ) : null}
            </div>
            <div className="space-y-3">
              {stops.map((stop) => {
                const apptStart = stop.appointmentStart ? new Date(stop.appointmentStart).getTime() : null;
                const apptEnd = stop.appointmentEnd ? new Date(stop.appointmentEnd).getTime() : null;
                const now = Date.now();
                const late =
                  !stop.arrivedAt &&
                  ((apptEnd && now > apptEnd) || (!apptEnd && apptStart && now > apptStart));
                const lateLabel = apptEnd && now > apptEnd ? "Late" : late ? "Late risk" : null;
                const isNext = nextStop?.id === stop.id;

                return (
                  <div
                    key={stop.id}
                    className={`rounded-[var(--radius-card)] border px-4 py-3 ${
                      isNext ? "border-[color:var(--color-accent)] bg-white" : "border-[color:var(--color-divider)] bg-white/70"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">
                          {stopTypeLabel(stop.type)} · {stop.name}
                        </div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          {stop.address}, {stop.city} {stop.state}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusChip label={stopStatusLabel(stop)} tone={stopStatusTone(stop)} />
                        {lateLabel ? <StatusChip label={lateLabel} tone={apptEnd ? "danger" : "warning"} /> : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--color-text-muted)]">
                      <div>
                        Appt:{" "}
                        {stop.appointmentStart || stop.appointmentEnd
                          ? `${formatDateTime(stop.appointmentStart)} → ${formatDateTime(stop.appointmentEnd)}`
                          : "—"}
                      </div>
                      {stop.arrivedAt ? <div>Arrived: {formatDateTime(stop.arrivedAt)}</div> : null}
                      {stop.departedAt ? <div>Departed: {formatDateTime(stop.departedAt)}</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-4 py-3 text-xs text-[color:var(--color-text-muted)]">
              <div className="text-[11px] uppercase tracking-[0.2em]">Map preview</div>
              <div className="mt-1">Destination: {nextStop?.city ?? finalStop?.city ?? "—"}, {nextStop?.state ?? finalStop?.state ?? "—"}</div>
              <div>Last ping: {trackingPing?.capturedAt ? new Date(trackingPing.capturedAt).toLocaleTimeString() : "—"}</div>
              <div>{trackingActive ? "Tracking on" : "Tracking off"}</div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="lg"
                variant="secondary"
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
              <Button size="lg" variant="ghost" className="w-full" onClick={() => (window.location.href = `tel:${DISPATCH_PHONE}`)}>
                Call dispatcher
              </Button>
            </div>
          </Card>
        ) : null}

        {load ? (
          <Card className="space-y-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Document checklist</div>
            <div className="grid gap-3">
              {requiredDocs.map((docType: DocType) => {
                const docsForType = (load?.docs ?? []).filter((doc) => doc.type === docType);
                const latestDoc = getLatestDoc(docsForType);
                return (
                  <div key={docType} className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-3">
                    <div>
                      <div className="text-lg font-semibold">{docType}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <StatusChip label={docStatusLabel(latestDoc)} tone={docStatusTone(latestDoc)} />
                        {latestDoc?.status === "REJECTED" && latestDoc.rejectReason ? (
                          <span className="text-xs text-[color:var(--color-danger)]">{latestDoc.rejectReason}</span>
                        ) : null}
                      </div>
                    </div>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        aria-label={`Upload ${docType}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadDoc(file, docType);
                        }}
                      />
                      <span className="rounded-full border border-[color:var(--color-divider)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--color-text)]">
                        Upload
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
            {uploading ? <div className="text-sm text-[color:var(--color-text-muted)]">Uploading...</div> : null}
            {uploadNote ? <div className="text-sm text-[color:var(--color-success)]">{uploadNote}</div> : null}
          </Card>
        ) : null}

        {load ? (
          <Card className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Optional note</div>
            <FormField label="Note" htmlFor="driverNote">
              <Textarea
                className="min-h-[90px]"
                placeholder="Add a quick note (voice-to-text friendly)"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </FormField>
            <Button variant="secondary" onClick={submitNote}>
              Send note
            </Button>
            {noteStatus ? <div className="text-sm text-[color:var(--color-text-muted)]">{noteStatus}</div> : null}
          </Card>
        ) : null}

        {queued.length > 0 ? (
          <Card className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                Offline queue · {queued.length}
              </div>
              <Button variant="secondary" onClick={flushQueue}>
                Retry all
              </Button>
            </div>
            {queued.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-3">
                <div>
                  <div className="font-semibold">{item.type}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">Queued · {new Date(item.createdAt).toLocaleTimeString()}</div>
                </div>
                <Button variant="secondary" onClick={flushQueue}>
                  Retry
                </Button>
              </div>
            ))}
          </Card>
        ) : null}

      <div className="text-center text-xs text-[color:var(--color-text-muted)]">{isOnline ? "Online" : "Offline"} mode</div>
    </DriverShell>
  );
}

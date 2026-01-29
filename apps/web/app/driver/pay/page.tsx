"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DriverShell } from "@/components/driver/driver-shell";
import { BlockerCard } from "@/components/driver/blocker-card";
import { PaySnapshotCard } from "@/components/driver/pay-snapshot-card";
import { SettlementPreviewList } from "@/components/driver/settlement-preview-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getComplianceStatus } from "@/lib/driver-ops";
import type { DocType } from "@truckerio/shared";

type DocStatus = "UPLOADED" | "VERIFIED" | "REJECTED";
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
type SettlementStatus = "DRAFT" | "FINALIZED" | "PAID";
type TrackingStatus = "ON" | "OFF" | "ERROR" | "ENDED";

type DriverDoc = {
  id: string;
  type: DocType;
  status: DocStatus;
  uploadedAt?: string | null;
  rejectedAt?: string | null;
  rejectReason?: string | null;
};

type DriverLoad = {
  id: string;
  loadNumber: string;
  status: LoadStatus;
  deliveredAt?: string | null;
  docs: DriverDoc[];
};

type DriverProfile = {
  id: string;
  name: string;
  licenseExpiresAt?: string | null;
  medCardExpiresAt?: string | null;
};

type DriverEarnings = {
  milesThisWeek?: number;
  estimatedPay?: string;
};

type DriverSettlement = {
  id: string;
  status: SettlementStatus;
  periodStart: string;
  periodEnd: string;
  weekLabel?: string | null;
  net?: string | number | null;
  gross?: string | number | null;
  paidAt?: string | null;
};

type TrackingSession = {
  status: TrackingStatus;
};

type TrackingPing = {
  capturedAt: string;
};

type BlockerSeverity = "BLOCKING" | "WARNING" | "INFO";

type Blocker = {
  code: string;
  severity: BlockerSeverity;
  title: string;
  detail: string;
  reference?: string;
  ctaLabel?: string;
  ctaHref?: string;
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

export default function DriverPayPage() {
  const router = useRouter();
  const [load, setLoad] = useState<DriverLoad | null>(null);
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [earnings, setEarnings] = useState<DriverEarnings | null>(null);
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [trackingSession, setTrackingSession] = useState<TrackingSession | null>(null);
  const [trackingPing, setTrackingPing] = useState<TrackingPing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const loadData = await apiFetch<{ load: DriverLoad | null; driver: DriverProfile | null }>("/driver/current");
      setLoad(loadData.load ?? null);
      setDriver(loadData.driver ?? null);
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
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const loadEarnings = async () => {
      try {
        const data = await apiFetch<DriverEarnings>("/driver/earnings");
        setEarnings(data);
      } catch {
        setEarnings(null);
      }
    };
    const loadSettlements = async () => {
      try {
        const data = await apiFetch<{ settlements?: DriverSettlement[] }>("/settlements?status=ALL&groupBy=none");
        setSettlements(data.settlements ?? []);
      } catch {
        setSettlements([]);
      }
    };
    loadEarnings();
    loadSettlements();
  }, []);

  const podDocs = (load?.docs ?? []).filter((doc) => doc.type === "POD");
  const latestPod = getLatestDoc(podDocs);
  const deliveredAt = load?.deliveredAt ?? null;
  const podRejected = podDocs.some((doc) => doc.status === "REJECTED");
  const podMissing = Boolean(deliveredAt && podDocs.length === 0);

  const licenseCompliance = getComplianceStatus(driver?.licenseExpiresAt ?? null);
  const medCardCompliance = getComplianceStatus(driver?.medCardExpiresAt ?? null);
  const complianceExpired = licenseCompliance.status === "EXPIRED" || medCardCompliance.status === "EXPIRED";

  const trackingOn = trackingSession?.status === "ON";
  const lastPingAt = trackingPing?.capturedAt ? new Date(trackingPing.capturedAt) : null;
  const trackingRecent = lastPingAt ? Date.now() - lastPingAt.getTime() < 10 * 60 * 1000 : false;
  const trackingActive = trackingOn || trackingRecent;
  const trackingOffInTransit = load?.status === "IN_TRANSIT" && !trackingActive;

  const pendingCount = settlements.filter((settlement) => settlement.status !== "PAID").length;
  const lastPaid = settlements.find((settlement) => settlement.status === "PAID");
  const recentSettlements = settlements.slice(0, 4);

  const blockers = useMemo<Blocker[]>(() => {
    const list: Blocker[] = [];
    if (podRejected) {
      list.push({
        code: "DOC_REJECTED",
        severity: "BLOCKING",
        title: "Document rejected",
        detail: latestPod?.rejectReason ? `Rejected: ${latestPod.rejectReason}` : "Re-upload required.",
        reference: load?.loadNumber ? `Load ${load.loadNumber}` : undefined,
        ctaLabel: "Re-upload document",
        ctaHref: "/driver#docs",
      });
    } else if (podMissing) {
      list.push({
        code: "POD_MISSING",
        severity: "BLOCKING",
        title: "POD missing",
        detail: "Billing is blocked until POD is uploaded.",
        reference: load?.loadNumber ? `Load ${load.loadNumber}` : undefined,
        ctaLabel: "Upload POD",
        ctaHref: "/driver#docs",
      });
    }
    if (trackingOffInTransit) {
      list.push({
        code: "TRACKING_OFF",
        severity: "WARNING",
        title: "Tracking is off",
        detail: "Enable tracking while you are in transit.",
        reference: load?.loadNumber ? `Load ${load.loadNumber}` : undefined,
        ctaLabel: "Enable tracking",
        ctaHref: "/driver#tracking",
      });
    }
    if (complianceExpired) {
      list.push({
        code: "COMPLIANCE_EXPIRED",
        severity: "BLOCKING",
        title: "Compliance expired",
        detail: "Review and update your CDL or medical card.",
        ctaLabel: "Review compliance",
        ctaHref: "/driver#compliance",
      });
    }
    if (settlements.some((settlement) => settlement.status === "DRAFT")) {
      list.push({
        code: "SETTLEMENT_NOT_FINAL",
        severity: "INFO",
        title: "Settlements processing",
        detail: "Your latest settlement is still processing.",
      });
    }
    return list;
  }, [podRejected, latestPod?.rejectReason, podMissing, load?.loadNumber, trackingOffInTransit, complianceExpired, settlements]);

  return (
    <DriverShell>
      <Card className="space-y-2">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Pay</div>
        <div className="text-2xl font-semibold">Weekly summary and what’s holding pay</div>
      </Card>

      {error ? (
        <Card>
          <div className="text-sm text-[color:var(--color-danger)]">{error}</div>
        </Card>
      ) : null}

      <PaySnapshotCard
        estimatedPay={earnings?.estimatedPay ?? null}
        milesThisWeek={earnings?.milesThisWeek ?? null}
        pendingCount={pendingCount}
        lastPaid={
          lastPaid
            ? {
                amount: lastPaid.net ?? lastPaid.gross ?? null,
                date: lastPaid.paidAt ?? lastPaid.periodEnd,
              }
            : null
        }
      />

      <Card className="space-y-3" id="blockers">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Blockers</div>
        {blockers.length === 0 ? (
          <div className="text-sm text-[color:var(--color-text-muted)]">No blockers right now.</div>
        ) : (
          <div className="space-y-3">
            {blockers.map((blocker) => (
              <BlockerCard
                key={`${blocker.code}-${blocker.reference ?? ""}`}
                severity={blocker.severity}
                title={blocker.title}
                detail={blocker.detail}
                reference={blocker.reference}
                ctaLabel={blocker.ctaLabel}
                onCtaClick={blocker.ctaHref ? () => router.push(blocker.ctaHref!) : undefined}
              />
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Recent settlements</div>
          <Button variant="secondary" size="sm" onClick={() => router.push("/driver/settlements")}>
            View all
          </Button>
        </div>
        <SettlementPreviewList settlements={recentSettlements} />
      </Card>
    </DriverShell>
  );
}

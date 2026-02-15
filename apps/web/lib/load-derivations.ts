export type BlockerType =
  | "POD_MISSING"
  | "DOCS_REJECTED"
  | "DOCS_UNDER_REVIEW"
  | "TRACKING_OFF_IN_TRANSIT"
  | "NEEDS_DISPATCH";

export type BlockerSeverity = "danger" | "warning" | "info";

export type DocsBlocker = {
  type: BlockerType;
  severity: BlockerSeverity;
  title: string;
  subtitle?: string;
} | null;

export type TrackingBadge = {
  state: "ON" | "OFF" | "UNKNOWN";
  lastPingAge?: string | null;
  lastPingAt?: string | null;
};

export type PrimaryAction = {
  label: string;
  href: string;
};

export function deriveOpsStatus(load: any) {
  return load?.status ?? "PLANNED";
}

function formatAge(dateValue?: string | null) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getDeliveredAt(load: any) {
  if (load?.deliveredAt) return load.deliveredAt;
  const delivery = load?.stops?.slice().reverse().find((stop: any) => stop.type === "DELIVERY");
  return delivery?.arrivedAt ?? null;
}

export function deriveDocsBlocker(load: any): DocsBlocker {
  if (load?.podStatus) {
    if (load.podStatus === "VERIFIED") return null;
    if (load.status === "READY_TO_INVOICE" || load.status === "INVOICED" || load.status === "PAID") return null;
    if (load.status === "DELIVERED" || load.status === "POD_RECEIVED") {
      if (load.podStatus === "REJECTED") {
        return {
          type: "DOCS_REJECTED",
          severity: "danger",
          title: "Docs rejected",
          subtitle: "Needs re-upload",
        };
      }
      if (load.podStatus === "UPLOADED") {
        return {
          type: "DOCS_UNDER_REVIEW",
          severity: "warning",
          title: "POD under review",
          subtitle: "Billing blocked",
        };
      }
      if (load.podStatus === "MISSING") {
        const deliveredAt = getDeliveredAt(load);
        return {
          type: "POD_MISSING",
          severity: "danger",
          title: "POD missing",
          subtitle: deliveredAt ? `Delivered ${formatAge(deliveredAt)} · Billing blocked` : "Billing blocked",
        };
      }
    }
    return null;
  }
  if (load?.podVerifiedAt || load?.status === "READY_TO_INVOICE" || load?.status === "INVOICED" || load?.status === "PAID") {
    return null;
  }
  const deliveredAt = getDeliveredAt(load);
  const podDocs = (load?.docs ?? []).filter((doc: any) => doc.type === "POD");
  const podRejected = podDocs.some((doc: any) => doc.status === "REJECTED");
  const podUploaded = podDocs.some((doc: any) => doc.status === "UPLOADED");

  if (load?.status === "DELIVERED" || load?.status === "POD_RECEIVED") {
    if (podRejected) {
      return {
        type: "DOCS_REJECTED",
        severity: "danger",
        title: "Docs rejected",
        subtitle: "Needs re-upload",
      };
    }
    if (podUploaded) {
      return {
        type: "DOCS_UNDER_REVIEW",
        severity: "warning",
        title: "POD under review",
        subtitle: "Billing blocked",
      };
    }
    return {
      type: "POD_MISSING",
      severity: "danger",
      title: "POD missing",
      subtitle: deliveredAt ? `Delivered ${formatAge(deliveredAt)} · Billing blocked` : "Billing blocked",
    };
  }

  return null;
}

export function deriveTrackingBadge(load: any): TrackingBadge {
  if (load?.trackingState) {
    const lastPingAt = load.trackingLastPingAt ?? null;
    const lastPingAge = formatAge(lastPingAt);
    return { state: load.trackingState, lastPingAge, lastPingAt };
  }
  const lastPingAt = load?.locationPings?.[0]?.capturedAt ?? null;
  const lastPingAge = formatAge(lastPingAt);
  const hasActiveSession = (load?.trackingSessions ?? []).some((session: any) => session.status === "ON");
  if (hasActiveSession) {
    return { state: "ON", lastPingAge, lastPingAt };
  }
  if (lastPingAt) {
    const diffMs = Date.now() - new Date(lastPingAt).getTime();
    if (diffMs < 10 * 60 * 1000) {
      return { state: "ON", lastPingAge, lastPingAt };
    }
  }
  return { state: "OFF", lastPingAge, lastPingAt };
}

export function deriveBlocker(load: any, docsBlocker: DocsBlocker, trackingBadge: TrackingBadge) {
  if (docsBlocker) return docsBlocker;
  if (load?.status === "IN_TRANSIT" && trackingBadge.state === "OFF") {
    return {
      type: "TRACKING_OFF_IN_TRANSIT" as const,
      severity: "warning" as const,
      title: "Tracking OFF",
      subtitle: "In transit without pings",
    };
  }
  const hasDriver = Boolean(load?.assignedDriverId || load?.driver?.id);
  if ((load?.status === "DRAFT" || load?.status === "PLANNED" || load?.status === "ASSIGNED") && !hasDriver) {
    return {
      type: "NEEDS_DISPATCH" as const,
      severity: "info" as const,
      title: "Needs dispatch",
      subtitle: "Assign driver and equipment",
    };
  }
  return null;
}

export function derivePrimaryAction(
  load: any,
  blocker: DocsBlocker | { type: BlockerType } | null,
  trackingBadge: TrackingBadge,
  role?: string | null
): PrimaryAction {
  const canBilling = role === "ADMIN" || role === "BILLING";
  const canDispatch = role === "ADMIN" || role === "DISPATCHER" || role === "HEAD_DISPATCHER";
  const canUpload = role === "ADMIN" || role === "DISPATCHER" || role === "HEAD_DISPATCHER";
  const canTrack = role === "ADMIN" || role === "DISPATCHER" || role === "HEAD_DISPATCHER" || role === "DRIVER";
  const podLink = `/loads/${load.id}?tab=documents&docType=POD#pod`;

  if (blocker?.type === "POD_MISSING") {
    if (canUpload) {
      return { label: "Upload POD", href: podLink };
    }
    return { label: "Open documents", href: podLink };
  }
  if (blocker?.type === "DOCS_REJECTED") {
    if (canUpload) {
      return { label: "Re-upload POD", href: podLink };
    }
    return { label: "Open documents", href: podLink };
  }
  if (blocker?.type === "DOCS_UNDER_REVIEW") {
    if (canBilling) {
      return { label: "Review POD", href: podLink };
    }
    return { label: "Open documents", href: podLink };
  }
  if (load?.status === "READY_TO_INVOICE") {
    if (canBilling) {
      return { label: "Create invoice", href: `/loads/${load.id}?tab=billing` };
    }
    return { label: "Open billing", href: `/loads/${load.id}?tab=billing` };
  }
  if (blocker?.type === "TRACKING_OFF_IN_TRANSIT") {
    if (canTrack) {
      return { label: "Enable tracking", href: `/loads/${load.id}?tab=overview#tracking` };
    }
    return { label: "Open tracking", href: `/loads/${load.id}?tab=overview#tracking` };
  }
  if (blocker?.type === "NEEDS_DISPATCH" || load?.status === "PLANNED" || load?.status === "ASSIGNED") {
    if (canDispatch) {
      return { label: "Dispatch", href: `/loads/${load.id}?tab=overview` };
    }
    return { label: "Open", href: `/loads/${load.id}` };
  }
  if (load?.status === "IN_TRANSIT" && trackingBadge.state === "OFF") {
    if (canTrack) {
      return { label: "Enable tracking", href: `/loads/${load.id}?tab=overview#tracking` };
    }
    return { label: "Open tracking", href: `/loads/${load.id}?tab=overview#tracking` };
  }
  return { label: "Open", href: `/loads/${load.id}` };
}

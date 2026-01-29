import { LoadStatus } from "@truckerio/db";

const transitions: Record<LoadStatus, LoadStatus[]> = {
  DRAFT: [LoadStatus.PLANNED, LoadStatus.CANCELLED],
  PLANNED: [LoadStatus.ASSIGNED, LoadStatus.CANCELLED],
  ASSIGNED: [LoadStatus.IN_TRANSIT, LoadStatus.PLANNED, LoadStatus.CANCELLED],
  IN_TRANSIT: [LoadStatus.DELIVERED],
  DELIVERED: [LoadStatus.POD_RECEIVED, LoadStatus.READY_TO_INVOICE],
  POD_RECEIVED: [LoadStatus.READY_TO_INVOICE],
  READY_TO_INVOICE: [LoadStatus.INVOICED],
  INVOICED: [LoadStatus.PAID],
  PAID: [],
  CANCELLED: [],
};

export function canTransitionLoadStatus(current: LoadStatus, next: LoadStatus) {
  if (current === next) return true;
  return transitions[current]?.includes(next) ?? false;
}

export function assertLoadStatusTransition(params: {
  current: LoadStatus;
  next: LoadStatus;
  isAdmin: boolean;
  overrideReason?: string | null;
}) {
  if (canTransitionLoadStatus(params.current, params.next)) {
    return { overridden: false };
  }
  if (params.isAdmin && params.overrideReason) {
    return { overridden: true };
  }
  throw new Error(`Invalid status transition from ${params.current} to ${params.next}`);
}

function normalizeStatusKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

const statusAliases: Record<string, LoadStatus> = {
  DRAFT: LoadStatus.DRAFT,
  PLANNED: LoadStatus.PLANNED,
  PLAN: LoadStatus.PLANNED,
  ASSIGNED: LoadStatus.ASSIGNED,
  ASSIGN: LoadStatus.ASSIGNED,
  INTRANSIT: LoadStatus.IN_TRANSIT,
  TRANSIT: LoadStatus.IN_TRANSIT,
  ENROUTE: LoadStatus.IN_TRANSIT,
  DELIVERED: LoadStatus.DELIVERED,
  PODRECEIVED: LoadStatus.POD_RECEIVED,
  POD: LoadStatus.POD_RECEIVED,
  READYTOINVOICE: LoadStatus.READY_TO_INVOICE,
  READY: LoadStatus.READY_TO_INVOICE,
  INVOICED: LoadStatus.INVOICED,
  PAID: LoadStatus.PAID,
  CANCELLED: LoadStatus.CANCELLED,
  CANCELED: LoadStatus.CANCELLED,
};

export function mapExternalLoadStatus(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return { status: LoadStatus.PLANNED, warning: null as string | null };
  }
  const key = normalizeStatusKey(raw);
  const mapped = statusAliases[key];
  if (mapped) {
    return { status: mapped, warning: null as string | null };
  }
  return {
    status: LoadStatus.PLANNED,
    warning: `Unknown status "${raw}". Defaulted to PLANNED.`,
  };
}

export function formatLoadStatusLabel(status: LoadStatus) {
  switch (status) {
    case LoadStatus.DRAFT:
      return "Draft";
    case LoadStatus.PLANNED:
      return "Planned";
    case LoadStatus.ASSIGNED:
      return "Assigned";
    case LoadStatus.IN_TRANSIT:
      return "In Transit";
    case LoadStatus.DELIVERED:
      return "Delivered";
    case LoadStatus.POD_RECEIVED:
      return "POD Received";
    case LoadStatus.READY_TO_INVOICE:
      return "Ready to Invoice";
    case LoadStatus.INVOICED:
      return "Invoiced";
    case LoadStatus.PAID:
      return "Paid";
    case LoadStatus.CANCELLED:
      return "Cancelled";
    default:
      return status;
  }
}

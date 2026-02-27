import { BillingStatus, LoadStatus, TripStatus } from "@truckerio/db";
import type { AuthorityObject, ExecutionState, KernelState } from "./types";

const LOAD_EXECUTION_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["IN_TRANSIT", "PLANNED", "CANCELLED"],
  IN_TRANSIT: ["ARRIVED", "COMPLETE", "CANCELLED"],
  ARRIVED: ["COMPLETE", "CANCELLED"],
  COMPLETE: [],
  CANCELLED: [],
};

const TRIP_EXECUTION_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["IN_TRANSIT", "PLANNED", "CANCELLED"],
  IN_TRANSIT: ["ARRIVED", "COMPLETE", "CANCELLED"],
  ARRIVED: ["COMPLETE", "CANCELLED"],
  COMPLETE: [],
  CANCELLED: [],
};

export const LOAD_STATUS_TRANSITIONS: Record<LoadStatus, LoadStatus[]> = {
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

function executionTransitionsForAuthority(authority: AuthorityObject) {
  if (authority === "TRIP") return TRIP_EXECUTION_TRANSITIONS;
  return LOAD_EXECUTION_TRANSITIONS;
}

export function isExecutionTransitionAllowed(params: {
  authority: AuthorityObject;
  current: ExecutionState;
  next: ExecutionState;
}) {
  if (params.current === params.next) return true;
  return executionTransitionsForAuthority(params.authority)[params.current]?.includes(params.next) ?? false;
}

export function canTransitionLegacyLoadStatus(current: LoadStatus, next: LoadStatus) {
  if (current === next) return true;
  return LOAD_STATUS_TRANSITIONS[current]?.includes(next) ?? false;
}

export function mapLoadStatusToExecutionState(status: LoadStatus): ExecutionState {
  switch (status) {
    case LoadStatus.DRAFT:
      return "DRAFT";
    case LoadStatus.PLANNED:
      return "PLANNED";
    case LoadStatus.ASSIGNED:
      return "ASSIGNED";
    case LoadStatus.IN_TRANSIT:
      return "IN_TRANSIT";
    case LoadStatus.CANCELLED:
      return "CANCELLED";
    case LoadStatus.DELIVERED:
    case LoadStatus.POD_RECEIVED:
    case LoadStatus.READY_TO_INVOICE:
    case LoadStatus.INVOICED:
    case LoadStatus.PAID:
      return "COMPLETE";
    default:
      return "PLANNED";
  }
}

export function mapTripStatusToExecutionState(status: TripStatus): ExecutionState {
  switch (status) {
    case TripStatus.PLANNED:
      return "PLANNED";
    case TripStatus.ASSIGNED:
      return "ASSIGNED";
    case TripStatus.IN_TRANSIT:
      return "IN_TRANSIT";
    case TripStatus.ARRIVED:
      return "ARRIVED";
    case TripStatus.COMPLETE:
      return "COMPLETE";
    case TripStatus.CANCELLED:
      return "CANCELLED";
    default:
      return "PLANNED";
  }
}

export function buildKernelStateFromLegacyLoad(params: {
  status: LoadStatus;
  billingStatus?: BillingStatus | null;
  podVerifiedAt?: Date | null;
}): KernelState {
  const execution = mapLoadStatusToExecutionState(params.status);
  let doc: KernelState["doc"] = "MISSING";
  if (params.status === LoadStatus.POD_RECEIVED) doc = "UPLOADED";
  if (
    params.podVerifiedAt ||
    params.status === LoadStatus.READY_TO_INVOICE ||
    params.status === LoadStatus.INVOICED ||
    params.status === LoadStatus.PAID
  ) {
    doc = "VERIFIED";
  }
  let finance: KernelState["finance"] = "BLOCKED";
  if (params.billingStatus === BillingStatus.READY || params.status === LoadStatus.READY_TO_INVOICE) {
    finance = "READY";
  }
  if (params.status === LoadStatus.INVOICED) finance = "INVOICED";
  if (params.status === LoadStatus.PAID) finance = "PAID";

  return {
    execution,
    doc,
    finance,
    compliance: "CLEAR",
  };
}


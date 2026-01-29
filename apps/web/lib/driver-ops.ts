export const COMPLIANCE_EXPIRING_DAYS = 30;

export type ComplianceStatus = "OK" | "EXPIRING" | "EXPIRED";

export type ComplianceCheck = {
  status: ComplianceStatus;
  daysRemaining: number | null;
};

export type DriverState =
  | "OFF_DUTY"
  | "AVAILABLE"
  | "ASSIGNED"
  | "EN_ROUTE"
  | "AT_STOP"
  | "DELIVERED"
  | "POD_PENDING"
  | "DOC_REJECTED"
  | "WAITING_PAY"
  | "PAID";

export function getComplianceStatus(dateValue?: string | Date | null): ComplianceCheck {
  if (!dateValue) {
    return { status: "OK", daysRemaining: null };
  }
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return { status: "OK", daysRemaining: null };
  }
  const diffMs = date.getTime() - Date.now();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (daysRemaining < 0) {
    return { status: "EXPIRED", daysRemaining };
  }
  if (daysRemaining <= COMPLIANCE_EXPIRING_DAYS) {
    return { status: "EXPIRING", daysRemaining };
  }
  return { status: "OK", daysRemaining };
}

export function deriveDriverState(params: {
  hasLoad: boolean;
  hasDeparted: boolean;
  atStop: boolean;
  delivered: boolean;
  podMissing: boolean;
  docRejected: boolean;
  pendingSettlements: number;
}): DriverState {
  if (params.docRejected) return "DOC_REJECTED";
  if (params.podMissing) return "POD_PENDING";
  if (params.delivered) return "DELIVERED";
  if (params.atStop) return "AT_STOP";
  if (params.hasDeparted) return "EN_ROUTE";
  if (params.hasLoad) return "ASSIGNED";
  if (params.pendingSettlements > 0) return "WAITING_PAY";
  return "AVAILABLE";
}

export type BillingReadinessStatus = "READY" | "MISSING" | "NEEDS_REVIEW" | "BLOCKED" | "NOT_REQUIRED";

export type BillingReadinessItem = {
  key: string;
  label: string;
  status: BillingReadinessStatus;
  detail?: string | null;
};

// Deprecated: frontend readiness derivation is intentionally disabled.
// Use backend `load.billingStatus` and `load.billingBlockingReasons` from API responses.
export function deriveBillingReadiness(params: {
  load: { billingStatus?: string | null; billingBlockingReasons?: string[] } | null | undefined;
}) {
  const status = params.load?.billingStatus ?? "BLOCKED";
  const reasons = params.load?.billingBlockingReasons ?? [];
  return {
    items: reasons.map((reason, idx) => ({ key: `BLOCKER_${idx}`, label: reason, status: "BLOCKED" as const })),
    readyForInvoice: status === "READY" || status === "INVOICED",
  };
}

export function billingReadinessTone(status: BillingReadinessStatus) {
  if (status === "READY" || status === "NOT_REQUIRED") return "success" as const;
  if (status === "NEEDS_REVIEW") return "warning" as const;
  return "danger" as const;
}

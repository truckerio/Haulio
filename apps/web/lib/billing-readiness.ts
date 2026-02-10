type BillingReadinessStatus = "READY" | "MISSING" | "NEEDS_REVIEW" | "BLOCKED" | "NOT_REQUIRED";

export type BillingReadinessItem = {
  key: "POD" | "RATECON" | "ACCESSORIALS" | "DISPUTE";
  label: string;
  status: BillingReadinessStatus;
  detail?: string | null;
};

const ACCESSORIAL_DOC_TYPES = new Set(["LUMPER", "DETENTION", "OTHER", "ACCESSORIAL_PROOF"]);
const ACCESSORIAL_CHARGE_TYPES = new Set(["LUMPER", "DETENTION", "LAYOVER", "OTHER", "ADJUSTMENT"]);
const RATECON_DOC_TYPES = new Set(["RATECON", "RATE_CONFIRMATION"]);

function getPodStatus(docs: any[]): BillingReadinessItem {
  const podDocs = docs.filter((doc) => doc.type === "POD");
  if (podDocs.length === 0) {
    return { key: "POD", label: "POD", status: "MISSING", detail: "No POD uploaded" };
  }
  if (podDocs.some((doc) => doc.status === "REJECTED")) {
    return { key: "POD", label: "POD", status: "NEEDS_REVIEW", detail: "Rejected" };
  }
  if (podDocs.some((doc) => doc.status === "VERIFIED")) {
    return { key: "POD", label: "POD", status: "READY", detail: "Verified" };
  }
  return { key: "POD", label: "POD", status: "NEEDS_REVIEW", detail: "Needs verification" };
}

function getRateconStatus(load: any, docs: any[]): BillingReadinessItem {
  const required = load?.loadType === "BROKERED";
  if (!required) {
    return { key: "RATECON", label: "Rate con", status: "NOT_REQUIRED", detail: "Not required" };
  }
  const rateconDocs = docs.filter((doc) => RATECON_DOC_TYPES.has(doc.type));
  if (rateconDocs.length === 0) {
    return { key: "RATECON", label: "Rate con", status: "MISSING", detail: "Missing" };
  }
  return { key: "RATECON", label: "Rate con", status: "READY", detail: "On file" };
}

function getAccessorialStatus(docs: any[], charges: any[]): BillingReadinessItem {
  const accessorialDocs = docs.filter((doc) => ACCESSORIAL_DOC_TYPES.has(doc.type));
  const accessorialCharges = charges.filter((charge) => ACCESSORIAL_CHARGE_TYPES.has(charge.type));
  if (accessorialDocs.length === 0 && accessorialCharges.length === 0) {
    return { key: "ACCESSORIALS", label: "Accessorials", status: "READY", detail: "None" };
  }
  if (accessorialDocs.length > 0 && accessorialCharges.length === 0) {
    return { key: "ACCESSORIALS", label: "Accessorials", status: "MISSING", detail: "Docs uploaded, add charges" };
  }
  if (accessorialCharges.length > 0 && accessorialDocs.length === 0) {
    return { key: "ACCESSORIALS", label: "Accessorials", status: "NEEDS_REVIEW", detail: "Charges without docs" };
  }
  return { key: "ACCESSORIALS", label: "Accessorials", status: "READY", detail: "Matched" };
}

function getDisputeStatus(invoices: any[]): BillingReadinessItem {
  const invoice = invoices?.[0] ?? null;
  if (!invoice) {
    return { key: "DISPUTE", label: "Dispute", status: "READY", detail: "None" };
  }
  if (invoice.status === "DISPUTED") {
    return { key: "DISPUTE", label: "Dispute", status: "BLOCKED", detail: "Disputed" };
  }
  if (invoice.status === "SHORT_PAID") {
    return { key: "DISPUTE", label: "Dispute", status: "NEEDS_REVIEW", detail: "Short-paid" };
  }
  return { key: "DISPUTE", label: "Dispute", status: "READY", detail: "Clear" };
}

export function deriveBillingReadiness(params: {
  load: any;
  charges?: any[];
  invoices?: any[];
}) {
  const docs = params.load?.docs ?? [];
  const charges = params.charges ?? [];
  const invoices = params.invoices ?? [];

  const pod = getPodStatus(docs);
  const ratecon = getRateconStatus(params.load, docs);
  const accessorials = getAccessorialStatus(docs, charges);
  const dispute = getDisputeStatus(invoices);

  const readyForInvoice =
    pod.status === "READY" &&
    (ratecon.status === "READY" || ratecon.status === "NOT_REQUIRED") &&
    accessorials.status === "READY";

  return {
    items: [pod, ratecon, accessorials, dispute],
    readyForInvoice,
  };
}

export function billingReadinessTone(status: BillingReadinessStatus) {
  if (status === "READY" || status === "NOT_REQUIRED") return "success" as const;
  if (status === "NEEDS_REVIEW") return "warning" as const;
  return "danger" as const;
}

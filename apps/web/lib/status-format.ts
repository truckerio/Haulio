const normalize = (value?: string | null) => value?.toString().trim().toUpperCase() ?? "";

export function formatStatusLabel(value?: string | null) {
  if (!value) return "-";
  return value.replace(/_/g, " ");
}

export function formatDocStatusLabel(status?: string | null) {
  const normalized = normalize(status);
  if (!normalized) return "-";
  if (normalized === "UPLOADED") return "Pending";
  if (normalized === "VERIFIED") return "Verified";
  if (normalized === "REJECTED") return "Rejected";
  return formatStatusLabel(normalized);
}

export function formatInvoiceStatusLabel(status?: string | null) {
  const normalized = normalize(status);
  if (!normalized) return "-";
  if (normalized === "GENERATED") return "Draft";
  if (normalized === "SHORT_PAID") return "Short Paid";
  return formatStatusLabel(normalized);
}

export function formatSettlementStatusLabel(status?: string | null) {
  const normalized = normalize(status);
  if (!normalized) return "-";
  if (normalized === "DRAFT") return "Pending";
  if (normalized === "FINALIZED") return "Approved";
  if (normalized === "PAID") return "Paid";
  return formatStatusLabel(normalized);
}

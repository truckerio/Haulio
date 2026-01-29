import { StatusChip } from "@/components/ui/status-chip";

type SettlementStatus = "DRAFT" | "FINALIZED" | "PAID";

const labelMap: Record<SettlementStatus, string> = {
  DRAFT: "Pending",
  FINALIZED: "Approved",
  PAID: "Paid",
};

const toneMap: Record<SettlementStatus, "neutral" | "success" | "warning" | "info" | "danger"> = {
  DRAFT: "warning",
  FINALIZED: "success",
  PAID: "success",
};

export function DriverStatusChip({ status, className }: { status: SettlementStatus; className?: string }) {
  return <StatusChip label={labelMap[status]} tone={toneMap[status]} className={className} />;
}

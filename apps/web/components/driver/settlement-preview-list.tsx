import { DriverStatusChip } from "@/components/driver/driver-status-chip";
import { MoneyAmount } from "@/components/driver/money-amount";

type SettlementStatus = "DRAFT" | "FINALIZED" | "PAID";

type SettlementPreview = {
  id: string;
  status: SettlementStatus;
  periodStart: string;
  periodEnd: string;
  weekLabel?: string | null;
  net?: string | number | null;
  gross?: string | number | null;
};

type SettlementPreviewListProps = {
  settlements: SettlementPreview[];
};

export function SettlementPreviewList({ settlements }: SettlementPreviewListProps) {
  if (!settlements.length) {
    return <div className="text-sm text-[color:var(--color-text-muted)]">No settlements yet.</div>;
  }

  return (
    <div className="space-y-3">
      {settlements.map((settlement) => (
        <div
          key={settlement.id}
          className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 py-3 pl-6 pr-4 text-sm"
        >
          <div>
            <div className="font-semibold text-ink">{settlement.weekLabel ?? "Pay period"}</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              {new Date(settlement.periodStart).toLocaleDateString()} →{" "}
              {new Date(settlement.periodEnd).toLocaleDateString()}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <DriverStatusChip status={settlement.status} />
            <div className="text-sm font-semibold">
              <MoneyAmount value={settlement.net ?? settlement.gross} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

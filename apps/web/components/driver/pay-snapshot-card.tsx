import { Card } from "@/components/ui/card";
import { MoneyAmount } from "@/components/driver/money-amount";

type PaySnapshotProps = {
  estimatedPay?: string | number | null;
  milesThisWeek?: number | null;
  pendingCount: number;
  lastPaid?: { amount?: string | number | null; date?: string | null } | null;
};

export function PaySnapshotCard({ estimatedPay, milesThisWeek, pendingCount, lastPaid }: PaySnapshotProps) {
  return (
    <Card className="space-y-3">
      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Pay snapshot</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm text-[color:var(--color-text-muted)]">Estimated this week</div>
          <div className="text-3xl font-semibold">
            <MoneyAmount value={estimatedPay} />
          </div>
        </div>
        <div className="text-right text-xs text-[color:var(--color-text-muted)]">
          <div>Miles this week</div>
          <div className="text-base font-semibold text-ink">{milesThisWeek ?? "—"}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
        <span>{pendingCount} pending settlement(s)</span>
        {lastPaid?.date ? (
          <span>
            Last paid {new Date(lastPaid.date).toLocaleDateString()} •{" "}
            <MoneyAmount value={lastPaid.amount ?? null} muted />
          </span>
        ) : (
          <span>Last paid —</span>
        )}
      </div>
    </Card>
  );
}

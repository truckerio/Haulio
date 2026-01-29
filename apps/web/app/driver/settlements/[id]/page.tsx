"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DriverShell } from "@/components/driver/driver-shell";
import { DriverStatusChip } from "@/components/driver/driver-status-chip";
import { InlineHelper } from "@/components/driver/inline-helper";
import { MoneyAmount } from "@/components/driver/money-amount";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type SettlementStatus = "DRAFT" | "FINALIZED" | "PAID";

type SettlementItem = {
  id: string;
  type: string;
  description?: string | null;
  amount?: string | number | null;
  load?: { id: string; loadNumber: string | null } | null;
};

type Settlement = {
  id: string;
  status: SettlementStatus;
  periodStart: string;
  periodEnd: string;
  net?: string | number | null;
  gross?: string | number | null;
  deductions?: string | number | null;
  paidAt?: string | null;
  items?: SettlementItem[];
};

export default function DriverSettlementDetailPage() {
  const router = useRouter();
  const params = useParams();
  const paramId = params?.id;
  const settlementId = Array.isArray(paramId) ? paramId[0] : (paramId as string | undefined);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDetail = async () => {
      if (!settlementId) return;
      try {
        const data = await apiFetch<{ settlement: Settlement }>(`/settlements/${settlementId}`);
        setSettlement(data.settlement);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    loadDetail();
  }, [settlementId]);

  const earnings = useMemo(() => {
    if (!settlement?.items) return [];
    return settlement.items.filter((item) => item.amount && Number(item.amount) >= 0);
  }, [settlement?.items]);

  const deductions = useMemo(() => {
    if (!settlement?.items) return [];
    return settlement.items.filter((item) => item.amount && Number(item.amount) < 0);
  }, [settlement?.items]);

  return (
    <DriverShell>
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Settlement</div>
            <div className="text-2xl font-semibold">
              {settlement
                ? `${new Date(settlement.periodStart).toLocaleDateString()} → ${new Date(
                    settlement.periodEnd
                  ).toLocaleDateString()}`
                : "Settlement detail"}
            </div>
          </div>
          {settlement ? <DriverStatusChip status={settlement.status} /> : null}
        </div>
        <Button variant="ghost" onClick={() => router.push("/driver/settlements")}>
          Back to settlements
        </Button>
      </Card>

      {error ? (
        <Card>
          <div className="text-sm text-[color:var(--color-danger)]">{error}</div>
        </Card>
      ) : null}

      {settlement ? (
        <>
          <Card className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Net pay</div>
            <div className="text-3xl font-semibold">
              <MoneyAmount value={settlement.net ?? settlement.gross} />
            </div>
            {settlement.paidAt ? (
              <div className="text-xs text-[color:var(--color-text-muted)]">
                Paid on {new Date(settlement.paidAt).toLocaleDateString()}
              </div>
            ) : (
              <InlineHelper text="Processing until finalized." />
            )}
          </Card>

          {earnings.length ? (
            <Card className="space-y-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Earnings</div>
              <div className="space-y-2">
                {earnings.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span>{item.description ?? item.type}</span>
                    <MoneyAmount value={item.amount} />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {deductions.length ? (
            <Card className="space-y-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Deductions</div>
              <div className="space-y-2">
                {deductions.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span>{item.description ?? item.type}</span>
                    <MoneyAmount value={item.amount} />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Loads included</div>
            {settlement.items?.length ? (
              <div className="space-y-2">
                {settlement.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-2 text-sm"
                  >
                    <div>
                      <div className="font-semibold">{item.load?.loadNumber ?? "Load"}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">{item.description ?? item.type}</div>
                    </div>
                    <MoneyAmount value={item.amount} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[color:var(--color-text-muted)]">No load items listed.</div>
            )}
          </Card>
        </>
      ) : null}
    </DriverShell>
  );
}

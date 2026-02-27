import type { PayableMilesSource } from "@truckerio/db";

type PreviewLoad = {
  miles?: number | null;
  paidMiles?: number | null;
  paidMilesSource?: PayableMilesSource | null;
  palletCount?: number | null;
  weightLbs?: number | null;
};

type PreviewPayableLine = {
  type?: "EARNING" | "REIMBURSEMENT" | "DEDUCTION" | string | null;
  amountCents?: number | null;
};

export type TripSettlementPreview = {
  plannedMiles: number;
  paidMiles: number | null;
  milesVariance: number | null;
  milesSource: PayableMilesSource | "MIXED" | null;
  totalPallets: number;
  totalWeightLbs: number;
  accessorialTotalCents: number;
  deductionsTotalCents: number;
  netPayPreviewCents: number | null;
};

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildTripSettlementPreview(params: {
  loads: PreviewLoad[];
  accessorialAmounts: unknown[];
  payableLines: PreviewPayableLine[];
}): TripSettlementPreview {
  const plannedMiles = params.loads.reduce((total, row) => total + asNumber(row.miles), 0);
  const paidMilesRows = params.loads.filter((row) => row.paidMiles !== null && row.paidMiles !== undefined);
  const paidMiles =
    paidMilesRows.length > 0
      ? paidMilesRows.reduce((total, row) => total + asNumber(row.paidMiles), 0)
      : null;
  const milesVariance = paidMiles === null ? null : paidMiles - plannedMiles;
  const milesSources = Array.from(
    new Set(
      params.loads
        .map((row) => row.paidMilesSource)
        .filter((value): value is PayableMilesSource => value !== null && value !== undefined)
    )
  );
  const milesSource = milesSources.length === 1 ? milesSources[0] : milesSources.length > 1 ? "MIXED" : null;

  const totalPallets = params.loads.reduce((total, row) => total + asNumber(row.palletCount), 0);
  const totalWeightLbs = params.loads.reduce((total, row) => total + asNumber(row.weightLbs), 0);

  const accessorialTotalCents = params.accessorialAmounts.reduce<number>(
    (total, amount) => total + Math.round(asNumber(amount) * 100),
    0
  );
  const earningsCents = params.payableLines
    .filter((line) => line.type === "EARNING")
    .reduce((total, line) => total + asNumber(line.amountCents), 0);
  const reimbursementsCents = params.payableLines
    .filter((line) => line.type === "REIMBURSEMENT")
    .reduce((total, line) => total + asNumber(line.amountCents), 0);
  const deductionsTotalCents = params.payableLines
    .filter((line) => line.type === "DEDUCTION")
    .reduce((total, line) => total + Math.abs(asNumber(line.amountCents)), 0);
  const netPayPreviewCents =
    params.payableLines.length > 0 ? earningsCents + reimbursementsCents - deductionsTotalCents : null;

  return {
    plannedMiles,
    paidMiles,
    milesVariance,
    milesSource,
    totalPallets,
    totalWeightLbs,
    accessorialTotalCents,
    deductionsTotalCents,
    netPayPreviewCents,
  };
}

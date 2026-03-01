export type FinanceWalletLine = {
  account: string;
  side: "DEBIT" | "CREDIT";
  amountCents: number;
};

export type FinanceWalletBalance = {
  account: string;
  debitCents: number;
  creditCents: number;
  netCents: number;
};

export function aggregateFinanceWalletBalances(lines: ReadonlyArray<FinanceWalletLine>): FinanceWalletBalance[] {
  const buckets = new Map<string, FinanceWalletBalance>();
  for (const line of lines) {
    const current = buckets.get(line.account) ?? {
      account: line.account,
      debitCents: 0,
      creditCents: 0,
      netCents: 0,
    };
    if (line.side === "DEBIT") {
      current.debitCents += line.amountCents;
      current.netCents += line.amountCents;
    } else {
      current.creditCents += line.amountCents;
      current.netCents -= line.amountCents;
    }
    buckets.set(line.account, current);
  }
  return Array.from(buckets.values()).sort((a, b) => a.account.localeCompare(b.account));
}

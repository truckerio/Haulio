import assert from "node:assert/strict";
import { aggregateFinanceWalletBalances } from "./finance-wallet";

const balances = aggregateFinanceWalletBalances([
  { account: "DRIVER_PAYABLE", side: "CREDIT", amountCents: 10000 },
  { account: "DRIVER_PAYABLE", side: "DEBIT", amountCents: 2500 },
  { account: "CASH_CLEARING", side: "DEBIT", amountCents: 10000 },
  { account: "CASH_CLEARING", side: "CREDIT", amountCents: 2500 },
]);

assert.deepEqual(balances, [
  {
    account: "CASH_CLEARING",
    debitCents: 10000,
    creditCents: 2500,
    netCents: 7500,
  },
  {
    account: "DRIVER_PAYABLE",
    debitCents: 2500,
    creditCents: 10000,
    netCents: -7500,
  },
]);

console.log("finance wallet tests passed");

import { SettlementStatus } from "@truckerio/db";

export function isFinalizeSettlementIdempotent(status: SettlementStatus) {
  return status === SettlementStatus.FINALIZED || status === SettlementStatus.PAID;
}

export function canFinalizeSettlement(status: SettlementStatus) {
  return status === SettlementStatus.DRAFT;
}

export function isMarkSettlementPaidIdempotent(status: SettlementStatus) {
  return status === SettlementStatus.PAID;
}

export function canMarkSettlementPaid(status: SettlementStatus) {
  return status === SettlementStatus.FINALIZED;
}

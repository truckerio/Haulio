import { PayableHoldOwner, PayableRunStatus, SettlementStatus } from "@truckerio/db";

export type HoldDecision = {
  blocked: boolean;
  reasonCode?: string;
  owner?: PayableHoldOwner;
  message?: string;
};

export function evaluatePayableRunHold(params: {
  status: PayableRunStatus;
  lineItemCount: number;
  holdReasonCode?: string | null;
  holdOwner?: PayableHoldOwner | null;
}): HoldDecision {
  if (params.holdReasonCode) {
    return {
      blocked: true,
      reasonCode: params.holdReasonCode,
      owner: params.holdOwner ?? PayableHoldOwner.BILLING,
      message: "Run is on hold and requires review before payout transitions",
    };
  }
  if (params.status !== PayableRunStatus.PAID && params.lineItemCount <= 0) {
    return {
      blocked: true,
      reasonCode: "NO_LINE_ITEMS",
      owner: PayableHoldOwner.SYSTEM,
      message: "Run must include line items before transition",
    };
  }
  return { blocked: false };
}

export function evaluateSettlementHold(params: {
  status: SettlementStatus;
  itemCount: number;
  netCents: number;
}): HoldDecision {
  if (params.status !== SettlementStatus.PAID && params.itemCount <= 0) {
    return {
      blocked: true,
      reasonCode: "NO_ITEMS",
      owner: PayableHoldOwner.SYSTEM,
      message: "Settlement has no items",
    };
  }
  if (params.status !== SettlementStatus.PAID && params.netCents <= 0) {
    return {
      blocked: true,
      reasonCode: "NON_POSITIVE_NET",
      owner: PayableHoldOwner.BILLING,
      message: "Settlement net must be positive before payout transitions",
    };
  }
  return { blocked: false };
}

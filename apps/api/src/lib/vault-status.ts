import { VaultDocType } from "@truckerio/db";

export type VaultStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NEEDS_DETAILS" | "MISSING";

export const DEFAULT_VAULT_EXPIRING_DAYS = Number(process.env.VAULT_EXPIRING_DAYS || "30");

export const VAULT_DOC_RULES: Record<VaultDocType, { requiresExpiry: boolean }> = {
  INSURANCE: { requiresExpiry: true },
  CARGO_INSURANCE: { requiresExpiry: true },
  LIABILITY: { requiresExpiry: true },
  REGISTRATION: { requiresExpiry: true },
  PERMIT: { requiresExpiry: false },
  IFTA: { requiresExpiry: false },
  TITLE: { requiresExpiry: false },
  OTHER: { requiresExpiry: false },
};

export const VAULT_DOCS_REQUIRING_EXPIRY = Object.entries(VAULT_DOC_RULES)
  .filter(([, rule]) => rule.requiresExpiry)
  .map(([docType]) => docType as VaultDocType);

export function getVaultStatus(params: {
  docType: VaultDocType;
  expiresAt?: Date | null;
  now?: Date;
  expiringDays?: number;
}): VaultStatus {
  const now = params.now ?? new Date();
  const expiringDays = params.expiringDays ?? DEFAULT_VAULT_EXPIRING_DAYS;
  const expiresAt = params.expiresAt ?? null;
  const rule = VAULT_DOC_RULES[params.docType];
  const requiresExpiry = rule?.requiresExpiry ?? false;
  if (requiresExpiry && !expiresAt) return "NEEDS_DETAILS";
  if (!expiresAt) return "VALID";
  const expiringThreshold = new Date(now);
  expiringThreshold.setDate(expiringThreshold.getDate() + expiringDays);
  if (expiresAt.getTime() < now.getTime()) return "EXPIRED";
  if (expiresAt.getTime() <= expiringThreshold.getTime()) return "EXPIRING_SOON";
  return "VALID";
}

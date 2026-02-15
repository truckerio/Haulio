import {
  FactoringAttachmentMode,
  FinanceAccessorialProofRequirement,
  FinanceDeliveredDocRequirement,
  FinanceRateConRequirement,
  Role,
} from "@truckerio/db";
import { z } from "zod";

export type OrgFinancePolicy = {
  requireRateCon: FinanceRateConRequirement;
  requireBOL: FinanceDeliveredDocRequirement;
  requireSignedPOD: FinanceDeliveredDocRequirement;
  requireAccessorialProof: FinanceAccessorialProofRequirement;
  requireInvoiceBeforeReady: boolean;
  requireInvoiceBeforeSend: boolean;
  allowReadinessOverride: boolean;
  overrideRoles: Role[];
  factoringEnabled: boolean;
  factoringEmail: string | null;
  factoringCcEmails: string[];
  factoringAttachmentMode: FactoringAttachmentMode;
  defaultPaymentTermsDays: number | null;
};

export const DEFAULT_FINANCE_POLICY: OrgFinancePolicy = {
  requireRateCon: FinanceRateConRequirement.BROKERED_ONLY,
  requireBOL: FinanceDeliveredDocRequirement.DELIVERED_ONLY,
  requireSignedPOD: FinanceDeliveredDocRequirement.DELIVERED_ONLY,
  requireAccessorialProof: FinanceAccessorialProofRequirement.WHEN_ACCESSORIAL_PRESENT,
  requireInvoiceBeforeReady: true,
  requireInvoiceBeforeSend: true,
  allowReadinessOverride: false,
  overrideRoles: [],
  factoringEnabled: false,
  factoringEmail: null,
  factoringCcEmails: [],
  factoringAttachmentMode: FactoringAttachmentMode.LINK_ONLY,
  defaultPaymentTermsDays: null,
};

export const financePolicyPayloadSchema = z.object({
  requireRateCon: z.nativeEnum(FinanceRateConRequirement),
  requireBOL: z.nativeEnum(FinanceDeliveredDocRequirement),
  requireSignedPOD: z.nativeEnum(FinanceDeliveredDocRequirement),
  requireAccessorialProof: z.nativeEnum(FinanceAccessorialProofRequirement),
  requireInvoiceBeforeReady: z.boolean(),
  requireInvoiceBeforeSend: z.boolean(),
  allowReadinessOverride: z.boolean(),
  overrideRoles: z.array(z.nativeEnum(Role)).max(12).optional(),
  factoringEnabled: z.boolean(),
  factoringEmail: z.string().trim().email().nullable().optional(),
  factoringCcEmails: z.array(z.string().trim().email()).max(12).optional(),
  factoringAttachmentMode: z.nativeEnum(FactoringAttachmentMode),
  defaultPaymentTermsDays: z.number().int().min(0).max(180).nullable().optional(),
});

export function normalizeFinancePolicy(
  settings?:
    | Partial<OrgFinancePolicy>
    | null
    | undefined
): OrgFinancePolicy {
  const next = settings ?? {};
  const ccList = Array.isArray(next.factoringCcEmails)
    ? next.factoringCcEmails.map((email) => email.trim()).filter(Boolean)
    : [];
  const requireInvoiceBeforeReady =
    next.requireInvoiceBeforeReady ??
    next.requireInvoiceBeforeSend ??
    DEFAULT_FINANCE_POLICY.requireInvoiceBeforeReady;
  const requireInvoiceBeforeSend =
    next.requireInvoiceBeforeSend ??
    next.requireInvoiceBeforeReady ??
    DEFAULT_FINANCE_POLICY.requireInvoiceBeforeSend;
  const allowReadinessOverride = next.allowReadinessOverride ?? DEFAULT_FINANCE_POLICY.allowReadinessOverride;
  const overrideRoles = Array.isArray(next.overrideRoles) ? Array.from(new Set(next.overrideRoles)) : [];
  const defaultPaymentTermsDays =
    typeof next.defaultPaymentTermsDays === "number" && Number.isFinite(next.defaultPaymentTermsDays)
      ? Math.max(0, Math.min(180, Math.floor(next.defaultPaymentTermsDays)))
      : null;
  return {
    requireRateCon: next.requireRateCon ?? DEFAULT_FINANCE_POLICY.requireRateCon,
    requireBOL: next.requireBOL ?? DEFAULT_FINANCE_POLICY.requireBOL,
    requireSignedPOD: next.requireSignedPOD ?? DEFAULT_FINANCE_POLICY.requireSignedPOD,
    requireAccessorialProof: next.requireAccessorialProof ?? DEFAULT_FINANCE_POLICY.requireAccessorialProof,
    requireInvoiceBeforeReady,
    requireInvoiceBeforeSend,
    allowReadinessOverride,
    overrideRoles: allowReadinessOverride ? overrideRoles : [],
    factoringEnabled: next.factoringEnabled ?? DEFAULT_FINANCE_POLICY.factoringEnabled,
    factoringEmail: next.factoringEmail?.trim() ? next.factoringEmail.trim() : null,
    factoringCcEmails: ccList,
    factoringAttachmentMode: next.factoringAttachmentMode ?? DEFAULT_FINANCE_POLICY.factoringAttachmentMode,
    defaultPaymentTermsDays,
  };
}

export function canRoleOverrideReadiness(policy: OrgFinancePolicy, role: Role) {
  if (!policy.allowReadinessOverride) return false;
  return policy.overrideRoles.includes(role);
}

import assert from "node:assert/strict";
import {
  FactoringAttachmentMode,
  FinanceAccessorialProofRequirement,
  FinanceDeliveredDocRequirement,
  FinanceRateConRequirement,
  Role,
} from "@truckerio/db";
import { canRoleOverrideReadiness, normalizeFinancePolicy } from "./finance-policy";

const defaults = normalizeFinancePolicy(null);
assert.equal(defaults.requireRateCon, FinanceRateConRequirement.BROKERED_ONLY);
assert.equal(defaults.requireBOL, FinanceDeliveredDocRequirement.DELIVERED_ONLY);
assert.equal(defaults.requireSignedPOD, FinanceDeliveredDocRequirement.DELIVERED_ONLY);
assert.equal(defaults.requireAccessorialProof, FinanceAccessorialProofRequirement.WHEN_ACCESSORIAL_PRESENT);
assert.equal(defaults.requireInvoiceBeforeReady, true);
assert.equal(defaults.requireInvoiceBeforeSend, true);
assert.equal(defaults.allowReadinessOverride, false);
assert.deepEqual(defaults.overrideRoles, []);
assert.equal(defaults.factoringEnabled, false);
assert.equal(defaults.factoringEmail, null);
assert.deepEqual(defaults.factoringCcEmails, []);
assert.equal(defaults.factoringAttachmentMode, FactoringAttachmentMode.LINK_ONLY);
assert.equal(defaults.defaultPaymentTermsDays, null);

const custom = normalizeFinancePolicy({
  requireRateCon: FinanceRateConRequirement.ALWAYS,
  requireBOL: FinanceDeliveredDocRequirement.ALWAYS,
  requireSignedPOD: FinanceDeliveredDocRequirement.NEVER,
  requireAccessorialProof: FinanceAccessorialProofRequirement.ALWAYS,
  requireInvoiceBeforeReady: false,
  requireInvoiceBeforeSend: false,
  allowReadinessOverride: true,
  overrideRoles: [Role.ADMIN, Role.BILLING],
  factoringEnabled: true,
  factoringEmail: "ops@example.com ",
  factoringCcEmails: [" a@example.com ", "", "b@example.com"],
  factoringAttachmentMode: FactoringAttachmentMode.ZIP,
  defaultPaymentTermsDays: 45,
});

assert.equal(custom.requireRateCon, FinanceRateConRequirement.ALWAYS);
assert.equal(custom.requireBOL, FinanceDeliveredDocRequirement.ALWAYS);
assert.equal(custom.requireSignedPOD, FinanceDeliveredDocRequirement.NEVER);
assert.equal(custom.requireAccessorialProof, FinanceAccessorialProofRequirement.ALWAYS);
assert.equal(custom.requireInvoiceBeforeReady, false);
assert.equal(custom.requireInvoiceBeforeSend, false);
assert.equal(custom.allowReadinessOverride, true);
assert.deepEqual(custom.overrideRoles, [Role.ADMIN, Role.BILLING]);
assert.equal(custom.factoringEnabled, true);
assert.equal(custom.factoringEmail, "ops@example.com");
assert.deepEqual(custom.factoringCcEmails, ["a@example.com", "b@example.com"]);
assert.equal(custom.factoringAttachmentMode, FactoringAttachmentMode.ZIP);
assert.equal(custom.defaultPaymentTermsDays, 45);

const aliasCompatibility = normalizeFinancePolicy({
  requireInvoiceBeforeSend: false,
});
assert.equal(aliasCompatibility.requireInvoiceBeforeReady, false);

const noOverrideWhenDisabled = normalizeFinancePolicy({
  allowReadinessOverride: false,
  overrideRoles: [Role.ADMIN],
});
assert.deepEqual(noOverrideWhenDisabled.overrideRoles, []);
assert.equal(canRoleOverrideReadiness(noOverrideWhenDisabled, Role.ADMIN), false);
assert.equal(canRoleOverrideReadiness(custom, Role.BILLING), true);

console.log("finance policy tests passed");

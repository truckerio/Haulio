import assert from "node:assert/strict";
import { FinancePaymentMethod } from "@truckerio/db";
import { evaluateFinanceCompliance, resolveFinanceCompliancePolicy } from "./finance-compliance";

const policy = resolveFinanceCompliancePolicy({
  FINANCE_SANCTIONS_ENFORCED: "true",
  FINANCE_SANCTIONS_DENYLIST: "blocked inc, bad actor",
  FINANCE_ACH_REQUIRE_REFERENCE: "true",
  FINANCE_ACH_REQUIRE_ACCOUNT_VALIDATION: "true",
  FINANCE_ACH_BLOCKED_RETURN_CODES: "R01,R29",
  FINANCE_TAX_ENFORCE_VENDOR_PROFILE: "true",
  FINANCE_TAX_ENFORCE_DRIVER_PROFILE: "false",
} as NodeJS.ProcessEnv);

const sanctionsBlocked = evaluateFinanceCompliance(
  {
    direction: "RECEIVABLE",
    method: FinancePaymentMethod.WIRE,
    counterpartyName: "Blocked Inc Logistics",
  },
  policy
);
assert.equal(sanctionsBlocked.ok, false);
assert.ok(sanctionsBlocked.blockers.some((msg) => msg.includes("Sanctions screening blocked")));

const achBlocked = evaluateFinanceCompliance(
  {
    direction: "RECEIVABLE",
    method: FinancePaymentMethod.ACH,
    counterpartyName: "Clean Customer",
    counterpartyReference: "",
    achAccountValidated: false,
  },
  policy
);
assert.equal(achBlocked.ok, false);
assert.ok(achBlocked.blockers.some((msg) => msg.includes("ACH reference")));
assert.ok(achBlocked.blockers.some((msg) => msg.includes("account validation")));

const achReturnBlocked = evaluateFinanceCompliance(
  {
    direction: "RECEIVABLE",
    method: FinancePaymentMethod.ACH,
    counterpartyName: "Clean Customer",
    counterpartyReference: "ACH-001",
    achAccountValidated: true,
    achReturnCode: "R01",
  },
  policy
);
assert.equal(achReturnBlocked.ok, false);
assert.ok(achReturnBlocked.blockers.some((msg) => msg.includes("R01")));

const vendorTaxBlocked = evaluateFinanceCompliance(
  {
    direction: "PAYABLE",
    method: FinancePaymentMethod.CHECK,
    counterpartyName: "Vendor A",
    payeeType: "VENDOR",
    taxProfileVerified: false,
  },
  policy
);
assert.equal(vendorTaxBlocked.ok, false);
assert.ok(vendorTaxBlocked.blockers.some((msg) => msg.includes("Tax profile verification")));

const cleanDecision = evaluateFinanceCompliance(
  {
    direction: "PAYABLE",
    method: FinancePaymentMethod.WIRE,
    counterpartyName: "Compliant Vendor",
    payeeType: "VENDOR",
    taxProfileVerified: true,
    taxFormType: "W-9",
    counterpartyReference: "WIRE-123",
  },
  policy
);
assert.equal(cleanDecision.ok, true);
assert.equal(cleanDecision.blockers.length, 0);

console.log("finance compliance tests passed");


import { FinancePaymentMethod } from "@truckerio/db";

export type FinanceComplianceDirection = "RECEIVABLE" | "PAYABLE";
export type FinancePayeeType = "CUSTOMER" | "DRIVER" | "VENDOR";

export type FinanceCompliancePolicy = {
  sanctions: {
    enforced: boolean;
    denylistTokens: string[];
    allowAdminOverride: boolean;
  };
  ach: {
    requireReference: boolean;
    requireAccountValidation: boolean;
    blockedReturnCodes: string[];
  };
  tax: {
    enforceVendorProfile: boolean;
    enforceDriverProfile: boolean;
  };
};

export type FinanceComplianceInput = {
  direction: FinanceComplianceDirection;
  method: FinancePaymentMethod;
  counterpartyName?: string | null;
  counterpartyReference?: string | null;
  payeeType?: FinancePayeeType;
  achAccountValidated?: boolean;
  achReturnCode?: string | null;
  taxProfileVerified?: boolean;
  taxFormType?: string | null;
};

export type FinanceComplianceDecision = {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  checks: {
    sanctions: {
      ok: boolean;
      matchedToken: string | null;
    };
    ach: {
      ok: boolean;
      returnCode: string | null;
    };
    taxProfile: {
      ok: boolean;
      required: boolean;
    };
  };
};

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return defaultValue;
}

function parseList(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeReturnCode(code: string | null | undefined) {
  const value = (code ?? "").trim().toUpperCase();
  if (!value) return null;
  return value.replace(/[^A-Z0-9]/g, "");
}

export function resolveFinanceCompliancePolicy(env: NodeJS.ProcessEnv = process.env): FinanceCompliancePolicy {
  return {
    sanctions: {
      enforced: parseBoolean(env.FINANCE_SANCTIONS_ENFORCED, true),
      denylistTokens: parseList(env.FINANCE_SANCTIONS_DENYLIST),
      allowAdminOverride: parseBoolean(env.FINANCE_SANCTIONS_ADMIN_OVERRIDE, false),
    },
    ach: {
      requireReference: parseBoolean(env.FINANCE_ACH_REQUIRE_REFERENCE, true),
      requireAccountValidation: parseBoolean(env.FINANCE_ACH_REQUIRE_ACCOUNT_VALIDATION, false),
      blockedReturnCodes: parseList(env.FINANCE_ACH_BLOCKED_RETURN_CODES).map((code) => code.toUpperCase()),
    },
    tax: {
      enforceVendorProfile: parseBoolean(env.FINANCE_TAX_ENFORCE_VENDOR_PROFILE, true),
      enforceDriverProfile: parseBoolean(env.FINANCE_TAX_ENFORCE_DRIVER_PROFILE, false),
    },
  };
}

export function evaluateFinanceCompliance(
  input: FinanceComplianceInput,
  policy: FinanceCompliancePolicy = resolveFinanceCompliancePolicy()
): FinanceComplianceDecision {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const searchText = `${input.counterpartyName ?? ""} ${input.counterpartyReference ?? ""}`
    .toLowerCase()
    .trim();
  let sanctionsMatchedToken: string | null = null;
  if (policy.sanctions.enforced) {
    if (!searchText) {
      warnings.push("Counterparty name missing for sanctions screening.");
    } else {
      sanctionsMatchedToken =
        policy.sanctions.denylistTokens.find((token) => token.length > 1 && searchText.includes(token)) ?? null;
      if (sanctionsMatchedToken) {
        blockers.push(`Sanctions screening blocked by token: ${sanctionsMatchedToken}`);
      }
    }
  }

  let achOk = true;
  const achReturnCode = normalizeReturnCode(input.achReturnCode);
  if (input.method === FinancePaymentMethod.ACH) {
    if (policy.ach.requireReference && !(input.counterpartyReference ?? "").trim()) {
      blockers.push("ACH reference is required for compliance controls.");
      achOk = false;
    }
    if (policy.ach.requireAccountValidation && !input.achAccountValidated) {
      blockers.push("ACH account validation must be confirmed before execution.");
      achOk = false;
    }
    if (achReturnCode && policy.ach.blockedReturnCodes.includes(achReturnCode)) {
      blockers.push(`ACH return code ${achReturnCode} is blocked by policy.`);
      achOk = false;
    } else if (achReturnCode) {
      warnings.push(`ACH return code ${achReturnCode} reported; review required.`);
    }
  }

  let taxRequired = false;
  if (input.payeeType === "VENDOR" && policy.tax.enforceVendorProfile) taxRequired = true;
  if (input.payeeType === "DRIVER" && policy.tax.enforceDriverProfile) taxRequired = true;
  let taxOk = true;
  if (taxRequired && !input.taxProfileVerified) {
    blockers.push(`Tax profile verification required for ${input.payeeType ?? "payee"} payouts.`);
    taxOk = false;
  }
  if (taxRequired && input.taxProfileVerified && !input.taxFormType) {
    warnings.push("Tax profile marked verified but tax form type is not specified.");
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    checks: {
      sanctions: {
        ok: sanctionsMatchedToken === null,
        matchedToken: sanctionsMatchedToken,
      },
      ach: {
        ok: achOk,
        returnCode: achReturnCode,
      },
      taxProfile: {
        ok: taxOk,
        required: taxRequired,
      },
    },
  };
}


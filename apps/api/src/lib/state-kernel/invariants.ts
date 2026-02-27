import type { InvariantViolation, KernelState } from "./types";

export function evaluateKernelInvariants(state: KernelState): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  if (state.finance !== "BLOCKED" && (state.doc === "MISSING" || state.doc === "REJECTED")) {
    violations.push({
      code: "FINANCE_REQUIRES_VALID_DOCS",
      message: "Finance state cannot advance while required docs are missing or rejected.",
      severity: "ERROR",
      domain: "finance",
    });
  }

  if (state.execution === "IN_TRANSIT" && state.compliance === "BLOCKED") {
    violations.push({
      code: "TRANSIT_REQUIRES_COMPLIANCE_CLEARANCE",
      message: "Execution cannot remain in transit while compliance is blocked.",
      severity: "ERROR",
      domain: "compliance",
    });
  }

  if (state.finance === "PAID" && state.execution !== "COMPLETE") {
    violations.push({
      code: "PAID_WITHOUT_COMPLETION",
      message: "Paid state reached before execution completed.",
      severity: "WARNING",
      domain: "execution",
    });
  }

  return violations;
}


export type AuthorityObject = "LOAD" | "TRIP" | "FINANCE";

export type StateDomain = "execution" | "doc" | "finance" | "compliance";

export type ExecutionState = "DRAFT" | "PLANNED" | "ASSIGNED" | "IN_TRANSIT" | "ARRIVED" | "COMPLETE" | "CANCELLED";

export type DocState = "MISSING" | "UPLOADED" | "VERIFIED" | "REJECTED";

export type FinanceState = "BLOCKED" | "READY" | "INVOICED" | "PAID";

export type ComplianceState = "CLEAR" | "WARNING" | "BLOCKED";

export type KernelState = {
  execution: ExecutionState;
  doc: DocState;
  finance: FinanceState;
  compliance: ComplianceState;
};

export type KernelTransitionContext = {
  actorId?: string | null;
  actorRole?: string | null;
  reason?: string | null;
  allowUnsafe?: boolean;
};

export type InvariantViolation = {
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
  domain: StateDomain;
};


import { evaluateKernelInvariants } from "./invariants";
import { isExecutionTransitionAllowed } from "./transitions";
import type {
  AuthorityObject,
  InvariantViolation,
  KernelState,
  KernelTransitionContext,
  StateDomain,
} from "./types";

export type ApplyKernelTransitionParams = {
  authority: AuthorityObject;
  current: KernelState;
  next: Partial<KernelState>;
  context?: KernelTransitionContext;
};

export type ApplyKernelTransitionResult = {
  ok: boolean;
  changedDomains: StateDomain[];
  violations: InvariantViolation[];
  state: KernelState;
  candidateState: KernelState;
};

function resolveChangedDomains(current: KernelState, next: KernelState): StateDomain[] {
  const changed: StateDomain[] = [];
  if (current.execution !== next.execution) changed.push("execution");
  if (current.doc !== next.doc) changed.push("doc");
  if (current.finance !== next.finance) changed.push("finance");
  if (current.compliance !== next.compliance) changed.push("compliance");
  return changed;
}

export function applyKernelTransition(params: ApplyKernelTransitionParams): ApplyKernelTransitionResult {
  const candidateState: KernelState = {
    ...params.current,
    ...params.next,
  };
  const changedDomains = resolveChangedDomains(params.current, candidateState);
  const violations: InvariantViolation[] = [];

  if (
    params.current.execution !== candidateState.execution &&
    !isExecutionTransitionAllowed({
      authority: params.authority,
      current: params.current.execution,
      next: candidateState.execution,
    })
  ) {
    violations.push({
      code: "INVALID_EXECUTION_TRANSITION",
      message: `Invalid execution transition from ${params.current.execution} to ${candidateState.execution}.`,
      severity: "ERROR",
      domain: "execution",
    });
  }

  violations.push(...evaluateKernelInvariants(candidateState));

  const hasBlockingErrors = violations.some((violation) => violation.severity === "ERROR");
  const allowUnsafe = params.context?.allowUnsafe === true;
  const ok = !hasBlockingErrors || allowUnsafe;

  return {
    ok,
    changedDomains,
    violations,
    state: ok ? candidateState : params.current,
    candidateState,
  };
}


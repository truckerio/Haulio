import { Role } from "@truckerio/db";
import { authorize } from "./permissions";

export function expandRoleAliases(roles: string[]) {
  const expanded = new Set(roles);
  // Phase 1 carrier-first role parity:
  // any dispatcher-allowed route must include head dispatcher.
  if (expanded.has("DISPATCHER")) {
    expanded.add("HEAD_DISPATCHER");
  }
  return Array.from(expanded) as Role[];
}

export function requireRole(...roles: string[]) {
  return authorize({ roles: expandRoleAliases(roles) });
}

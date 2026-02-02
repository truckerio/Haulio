import { Role } from "@truckerio/db";
import { authorize } from "./permissions";

export function requireRole(...roles: string[]) {
  const expanded = new Set(roles);
  if (expanded.has("DISPATCHER")) {
    expanded.add("HEAD_DISPATCHER");
  }
  return authorize({ roles: Array.from(expanded) as Role[] });
}

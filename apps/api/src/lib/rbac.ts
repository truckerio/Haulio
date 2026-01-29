import { Role } from "@truckerio/db";
import { authorize } from "./permissions";

export function requireRole(...roles: string[]) {
  return authorize({ roles: roles as Role[] });
}

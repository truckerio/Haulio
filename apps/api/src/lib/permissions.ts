import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth";
import { Permission, Role } from "@truckerio/db";
import { getRoleDefaultPermissions, hasCapability, type AppCapability } from "./capabilities";

export function hasPermission(user: AuthRequest["user"] | undefined, permission: Permission) {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  const base = getRoleDefaultPermissions(user.role);
  const combined = new Set<string>([...base, ...(user.permissions ?? [])]);
  return combined.has(permission);
}

export function authorize(params: { roles?: Role[]; permissions?: Permission[] }) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const roleAllowed = params.roles ? params.roles.includes(req.user.role as Role) : true;
    const permissionAllowed = params.permissions
      ? params.permissions.some((permission) => hasPermission(req.user, permission))
      : true;
    if (!roleAllowed || !permissionAllowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function requirePermission(...permissions: Permission[]) {
  return authorize({ permissions });
}

export function requireCapability(...capabilities: AppCapability[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (capabilities.some((capability) => hasCapability(req.user, capability))) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden" });
  };
}

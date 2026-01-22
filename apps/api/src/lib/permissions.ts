import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth";
import { Permission, Role } from "@truckerio/db";

const roleDefaults: Record<Role, Permission[]> = {
  ADMIN: Object.values(Permission),
  DISPATCHER: [
    Permission.LOAD_CREATE,
    Permission.LOAD_EDIT,
    Permission.LOAD_ASSIGN,
    Permission.STOP_EDIT,
    Permission.TASK_ASSIGN,
  ],
  BILLING: [
    Permission.DOC_VERIFY,
    Permission.INVOICE_GENERATE,
    Permission.INVOICE_SEND,
    Permission.INVOICE_VOID,
    Permission.SETTLEMENT_GENERATE,
    Permission.SETTLEMENT_FINALIZE,
  ],
  DRIVER: [],
};

export function hasPermission(user: AuthRequest["user"] | undefined, permission: Permission) {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  const base = roleDefaults[user.role as Role] ?? [];
  const combined = new Set<string>([...base, ...(user.permissions ?? [])]);
  return combined.has(permission);
}

export function requirePermission(...permissions: Permission[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const ok = permissions.some((permission) => hasPermission(req.user, permission));
    if (!ok) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

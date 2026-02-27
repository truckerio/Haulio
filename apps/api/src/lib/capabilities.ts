import { Permission, Role } from "@truckerio/db";
import type { AuthRequest } from "./auth";

export const CANONICAL_ROLES = [
  Role.ADMIN,
  Role.DISPATCHER,
  Role.HEAD_DISPATCHER,
  Role.BILLING,
  Role.DRIVER,
  Role.SAFETY,
  Role.SUPPORT,
] as const;

export type AppCapability =
  | "assignTrip"
  | "editTripStops"
  | "uploadDocs"
  | "verifyPOD"
  | "viewCharges"
  | "editCharges"
  | "startTracking"
  | "generateInvoice"
  | "runSettlements"
  | "viewSettlementPreview"
  | "viewOperations"
  | "addSafetyNotes"
  | "addSupportNotes"
  | "adminAll";

const CAPABILITY_MAP: Record<Role, ReadonlySet<AppCapability>> = {
  [Role.ADMIN]: new Set<AppCapability>([
    "assignTrip",
    "editTripStops",
    "uploadDocs",
    "verifyPOD",
    "viewCharges",
    "editCharges",
    "startTracking",
    "generateInvoice",
    "runSettlements",
    "viewSettlementPreview",
    "viewOperations",
    "addSafetyNotes",
    "addSupportNotes",
    "adminAll",
  ]),
  [Role.DISPATCHER]: new Set<AppCapability>([
    "assignTrip",
    "editTripStops",
    "uploadDocs",
    "viewCharges",
    "editCharges",
    "startTracking",
    "viewSettlementPreview",
    "viewOperations",
  ]),
  [Role.HEAD_DISPATCHER]: new Set<AppCapability>([
    "assignTrip",
    "editTripStops",
    "uploadDocs",
    "viewCharges",
    "editCharges",
    "startTracking",
    "viewSettlementPreview",
    "viewOperations",
  ]),
  [Role.BILLING]: new Set<AppCapability>([
    "uploadDocs",
    "verifyPOD",
    "viewCharges",
    "generateInvoice",
    "runSettlements",
    "viewSettlementPreview",
    "viewOperations",
  ]),
  [Role.DRIVER]: new Set<AppCapability>(["startTracking"]),
  [Role.SAFETY]: new Set<AppCapability>(["viewOperations", "addSafetyNotes"]),
  [Role.SUPPORT]: new Set<AppCapability>(["viewOperations", "addSupportNotes"]),
};

const ROLE_DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),
  [Role.DISPATCHER]: [
    Permission.LOAD_CREATE,
    Permission.LOAD_EDIT,
    Permission.LOAD_ASSIGN,
    Permission.STOP_EDIT,
    Permission.TASK_ASSIGN,
    Permission.DOC_VERIFY,
  ],
  [Role.HEAD_DISPATCHER]: [
    Permission.LOAD_CREATE,
    Permission.LOAD_EDIT,
    Permission.LOAD_ASSIGN,
    Permission.STOP_EDIT,
    Permission.TASK_ASSIGN,
    Permission.DOC_VERIFY,
  ],
  [Role.BILLING]: [
    Permission.DOC_VERIFY,
    Permission.INVOICE_GENERATE,
    Permission.INVOICE_SEND,
    Permission.INVOICE_VOID,
    Permission.SETTLEMENT_GENERATE,
    Permission.SETTLEMENT_FINALIZE,
  ],
  [Role.DRIVER]: [],
  [Role.SAFETY]: [],
  [Role.SUPPORT]: [],
};

export function isDispatcherRole(role?: string | null): role is "DISPATCHER" | "HEAD_DISPATCHER" {
  return role === Role.DISPATCHER || role === Role.HEAD_DISPATCHER;
}

export function isCanonicalRole(role?: string | null): role is Role {
  return !!role && (CANONICAL_ROLES as readonly string[]).includes(role);
}

export function getRoleCapabilities(role?: string | null) {
  if (!isCanonicalRole(role)) return new Set<AppCapability>();
  return CAPABILITY_MAP[role];
}

export function hasCapability(user: AuthRequest["user"] | undefined, capability: AppCapability) {
  if (!user || !isCanonicalRole(user.role)) return false;
  const roleCapabilities = CAPABILITY_MAP[user.role];
  return roleCapabilities.has("adminAll") || roleCapabilities.has(capability);
}

export function getRoleDefaultPermissions(role?: string | null) {
  if (!isCanonicalRole(role)) return [] as Permission[];
  return ROLE_DEFAULT_PERMISSIONS[role];
}

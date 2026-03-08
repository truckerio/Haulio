export type CanonicalRole = "ADMIN" | "DISPATCHER" | "HEAD_DISPATCHER" | "BILLING" | "DRIVER" | "SAFETY" | "SUPPORT";
export type OperatingMode = "CARRIER" | "BROKER" | "BOTH" | null | undefined;
export type DispatchWorkspace = "trips" | "loads";
export const LAST_WORKSPACE_STORAGE_KEY_PREFIX = "haulio:last-workspace:";

type RoleCapabilities = {
  role: string | null;
  canonicalRole: CanonicalRole | null;
  canAccessDispatch: boolean;
  canAccessTrips: boolean;
  canAccessLoads: boolean;
  canAccessFinance: boolean;
  canAccessSafety: boolean;
  canAccessSupport: boolean;
  canAccessAdmin: boolean;
  canAccessDriver: boolean;
  canDispatchExecution: boolean;
  canStartTracking: boolean;
  canUseGlobalSearch: boolean;
  canUseActivity: boolean;
  canSeeTeamsOps: boolean;
  canEditLoad: boolean;
  canUploadLoadDocs: boolean;
  canVerifyDocs: boolean;
  canViewCharges: boolean;
  canEditCharges: boolean;
  canManageAccessorials: boolean;
  canApproveAccessorials: boolean;
  canBillActions: boolean;
  canDeleteLoad: boolean;
  canCreateLoadNotes: boolean;
  canViewSettlementPreview: boolean;
};

function asCanonicalRole(role?: string | null): CanonicalRole | null {
  if (
    role === "ADMIN" ||
    role === "DISPATCHER" ||
    role === "HEAD_DISPATCHER" ||
    role === "BILLING" ||
    role === "DRIVER" ||
    role === "SAFETY" ||
    role === "SUPPORT"
  ) {
    return role;
  }
  return null;
}

const EMPTY_CAPABILITIES: RoleCapabilities = {
  role: null,
  canonicalRole: null,
  canAccessDispatch: false,
  canAccessTrips: false,
  canAccessLoads: false,
  canAccessFinance: false,
  canAccessSafety: false,
  canAccessSupport: false,
  canAccessAdmin: false,
  canAccessDriver: false,
  canDispatchExecution: false,
  canStartTracking: false,
  canUseGlobalSearch: false,
  canUseActivity: false,
  canSeeTeamsOps: false,
  canEditLoad: false,
  canUploadLoadDocs: false,
  canVerifyDocs: false,
  canViewCharges: false,
  canEditCharges: false,
  canManageAccessorials: false,
  canApproveAccessorials: false,
  canBillActions: false,
  canDeleteLoad: false,
  canCreateLoadNotes: false,
  canViewSettlementPreview: false,
};

export function getRoleCapabilities(role?: string | null): RoleCapabilities {
  const canonicalRole = asCanonicalRole(role);
  if (!canonicalRole) {
    return { ...EMPTY_CAPABILITIES, role: role ?? null };
  }

  if (canonicalRole === "ADMIN") {
    return {
      role: role ?? null,
      canonicalRole,
      canAccessDispatch: true,
      canAccessTrips: true,
      canAccessLoads: true,
      canAccessFinance: true,
      canAccessSafety: true,
      canAccessSupport: true,
      canAccessAdmin: true,
      canAccessDriver: false,
      canDispatchExecution: true,
      canStartTracking: true,
      canUseGlobalSearch: true,
      canUseActivity: true,
      canSeeTeamsOps: true,
      canEditLoad: true,
      canUploadLoadDocs: true,
      canVerifyDocs: true,
      canViewCharges: true,
      canEditCharges: true,
      canManageAccessorials: true,
      canApproveAccessorials: true,
      canBillActions: true,
      canDeleteLoad: true,
      canCreateLoadNotes: true,
      canViewSettlementPreview: true,
    };
  }

  if (canonicalRole === "DISPATCHER" || canonicalRole === "HEAD_DISPATCHER") {
    return {
      role: role ?? null,
      canonicalRole,
      canAccessDispatch: true,
      canAccessTrips: true,
      canAccessLoads: true,
      canAccessFinance: true,
      canAccessSafety: false,
      canAccessSupport: false,
      canAccessAdmin: false,
      canAccessDriver: false,
      canDispatchExecution: true,
      canStartTracking: true,
      canUseGlobalSearch: true,
      canUseActivity: true,
      canSeeTeamsOps: canonicalRole === "HEAD_DISPATCHER",
      canEditLoad: true,
      canUploadLoadDocs: true,
      canVerifyDocs: true,
      canViewCharges: true,
      canEditCharges: true,
      canManageAccessorials: true,
      canApproveAccessorials: false,
      canBillActions: false,
      canDeleteLoad: false,
      canCreateLoadNotes: true,
      canViewSettlementPreview: true,
    };
  }

  if (canonicalRole === "BILLING") {
    return {
      role: role ?? null,
      canonicalRole,
      canAccessDispatch: false,
      canAccessTrips: true,
      canAccessLoads: true,
      canAccessFinance: true,
      canAccessSafety: false,
      canAccessSupport: false,
      canAccessAdmin: false,
      canAccessDriver: false,
      canDispatchExecution: false,
      canStartTracking: false,
      canUseGlobalSearch: true,
      canUseActivity: true,
      canSeeTeamsOps: false,
      canEditLoad: false,
      canUploadLoadDocs: true,
      canVerifyDocs: true,
      canViewCharges: true,
      canEditCharges: false,
      canManageAccessorials: true,
      canApproveAccessorials: true,
      canBillActions: true,
      canDeleteLoad: false,
      canCreateLoadNotes: true,
      canViewSettlementPreview: true,
    };
  }

  if (canonicalRole === "SAFETY") {
    return {
      role: role ?? null,
      canonicalRole,
      canAccessDispatch: false,
      canAccessTrips: true,
      canAccessLoads: true,
      canAccessFinance: false,
      canAccessSafety: true,
      canAccessSupport: false,
      canAccessAdmin: false,
      canAccessDriver: false,
      canDispatchExecution: false,
      canStartTracking: false,
      canUseGlobalSearch: true,
      canUseActivity: true,
      canSeeTeamsOps: false,
      canEditLoad: false,
      canUploadLoadDocs: false,
      canVerifyDocs: false,
      canViewCharges: false,
      canEditCharges: false,
      canManageAccessorials: false,
      canApproveAccessorials: false,
      canBillActions: false,
      canDeleteLoad: false,
      canCreateLoadNotes: true,
      canViewSettlementPreview: false,
    };
  }

  if (canonicalRole === "SUPPORT") {
    return {
      role: role ?? null,
      canonicalRole,
      canAccessDispatch: false,
      canAccessTrips: true,
      canAccessLoads: true,
      canAccessFinance: false,
      canAccessSafety: false,
      canAccessSupport: true,
      canAccessAdmin: false,
      canAccessDriver: false,
      canDispatchExecution: false,
      canStartTracking: false,
      canUseGlobalSearch: true,
      canUseActivity: true,
      canSeeTeamsOps: false,
      canEditLoad: false,
      canUploadLoadDocs: false,
      canVerifyDocs: false,
      canViewCharges: false,
      canEditCharges: false,
      canManageAccessorials: false,
      canApproveAccessorials: false,
      canBillActions: false,
      canDeleteLoad: false,
      canCreateLoadNotes: true,
      canViewSettlementPreview: false,
    };
  }

  return {
    role: role ?? null,
    canonicalRole,
    canAccessDispatch: false,
    canAccessTrips: false,
    canAccessLoads: false,
    canAccessFinance: false,
    canAccessSafety: false,
    canAccessSupport: false,
    canAccessAdmin: false,
    canAccessDriver: true,
    canDispatchExecution: false,
    canStartTracking: true,
    canUseGlobalSearch: false,
    canUseActivity: false,
    canSeeTeamsOps: false,
    canEditLoad: false,
    canUploadLoadDocs: false,
    canVerifyDocs: false,
    canViewCharges: false,
    canEditCharges: false,
    canManageAccessorials: false,
    canApproveAccessorials: false,
    canBillActions: false,
    canDeleteLoad: false,
    canCreateLoadNotes: false,
    canViewSettlementPreview: false,
  };
}

export function getRoleLandingPath(role?: string | null) {
  const canonicalRole = asCanonicalRole(role);
  if (canonicalRole === "ADMIN") return "/admin";
  if (canonicalRole === "DISPATCHER" || canonicalRole === "HEAD_DISPATCHER") return "/dispatch?workspace=trips";
  if (canonicalRole === "BILLING") return "/finance?tab=receivables";
  if (canonicalRole === "DRIVER") return "/driver";
  if (canonicalRole === "SAFETY") return "/safety";
  if (canonicalRole === "SUPPORT") return "/support";
  return "/today";
}

export function getRoleNoAccessCta(role?: string | null) {
  const capabilities = getRoleCapabilities(role);
  if (capabilities.canAccessDispatch) {
    return { href: "/dispatch?workspace=trips", label: "Go to Dispatch" };
  }
  if (capabilities.canAccessFinance) {
    return { href: "/finance?tab=receivables", label: "Go to Finance" };
  }
  return { href: "/today", label: "Go to Today" };
}

export function getRoleLastWorkspaceStorageKey(role?: string | null) {
  const canonicalRole = asCanonicalRole(role);
  if (!canonicalRole || canonicalRole === "DRIVER") return null;
  return `${LAST_WORKSPACE_STORAGE_KEY_PREFIX}${canonicalRole}`;
}

export function canRoleResumeWorkspace(
  role: string | null | undefined,
  href: string,
  options?: { chatbotEnabled?: boolean }
) {
  const capabilities = getRoleCapabilities(role);
  if (capabilities.canonicalRole === "DRIVER") return false;
  if (!href || !href.startsWith("/")) return false;
  const [pathname] = href.split("?");

  if (pathname.startsWith("/dispatch") || pathname.startsWith("/loads") || pathname.startsWith("/trips") || pathname.startsWith("/teams")) {
    return capabilities.canAccessDispatch;
  }
  if (pathname.startsWith("/finance") || pathname.startsWith("/billing") || pathname.startsWith("/settlements")) {
    return capabilities.canAccessFinance;
  }
  if (pathname.startsWith("/safety")) return capabilities.canAccessSafety;
  if (pathname.startsWith("/support")) return capabilities.canAccessSupport;
  if (pathname.startsWith("/driver")) return capabilities.canAccessDriver;
  if (pathname.startsWith("/chatbot")) return Boolean(capabilities.canonicalRole) && (options?.chatbotEnabled ?? true);
  if (pathname.startsWith("/today") || pathname.startsWith("/dashboard") || pathname.startsWith("/profile") || pathname.startsWith("/admin")) {
    return true;
  }
  return false;
}

export function getDefaultDispatchWorkspace(params: { role?: string | null; operatingMode?: OperatingMode }): DispatchWorkspace {
  const canonicalRole = asCanonicalRole(params.role);
  const operatingMode = params.operatingMode ?? null;
  if (
    (canonicalRole === "DISPATCHER" || canonicalRole === "HEAD_DISPATCHER") &&
    (operatingMode === "CARRIER" || operatingMode === "BOTH")
  ) {
    return "trips";
  }
  return "loads";
}

export function applyFailClosedCapability(value: boolean, restrictedBy403: boolean) {
  return value && !restrictedBy403;
}

export function isForbiddenError(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  const message = String((error as { message?: string } | null)?.message ?? "");
  return status === 403 || /forbidden|unauthorized|not allowed|permission/i.test(message);
}

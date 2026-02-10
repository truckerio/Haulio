type AssignmentValidation =
  | { ok: true }
  | { ok: false; error: string };

export type LoadAssignmentRole = "PRIMARY" | "CO_DRIVER";

const ASSIGNMENT_ROLES: Record<LoadAssignmentRole, LoadAssignmentRole> = {
  PRIMARY: "PRIMARY",
  CO_DRIVER: "CO_DRIVER",
};

export type AssignmentPlan = {
  primaryDriverId: string;
  assignedDriverId: string;
  coDriverId: string | null;
  assignmentMembers: Array<{ role: LoadAssignmentRole; driverId: string }>;
  removeCoDriver: boolean;
};

export function validateAssignmentDrivers(
  primaryDriverId?: string | null,
  coDriverId?: string | null
): AssignmentValidation {
  if (!primaryDriverId) {
    return { ok: false, error: "primaryDriverId required" };
  }
  if (coDriverId && coDriverId === primaryDriverId) {
    return { ok: false, error: "Co-driver must be different from primary driver" };
  }
  return { ok: true };
}

export function buildAssignmentPlan(params: {
  primaryDriverId: string;
  coDriverId?: string | null;
}): AssignmentPlan {
  const assignmentMembers = [
    { role: ASSIGNMENT_ROLES.PRIMARY, driverId: params.primaryDriverId },
  ];
  if (params.coDriverId) {
    assignmentMembers.push({ role: ASSIGNMENT_ROLES.CO_DRIVER, driverId: params.coDriverId });
  }
  return {
    primaryDriverId: params.primaryDriverId,
    assignedDriverId: params.primaryDriverId,
    coDriverId: params.coDriverId ?? null,
    assignmentMembers,
    removeCoDriver: !params.coDriverId,
  };
}

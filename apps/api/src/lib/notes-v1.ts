import { LoadNoteSource, NoteType, Role } from "@truckerio/db";

export const NOTE_DELETE_DISABLED_MESSAGE = "Notes are immutable. Add a clarification note instead.";

export type NoteIndicator = "NONE" | "NORMAL" | "ALERT";

export function resolveNoteIndicator(params: { hasAny: boolean; hasAlert: boolean }): NoteIndicator {
  if (!params.hasAny) return "NONE";
  if (params.hasAlert) return "ALERT";
  return "NORMAL";
}

type NotePermissionAction = "view" | "create";

const NOTE_TYPE_CREATE_POLICY: Record<Role, NoteType[]> = {
  ADMIN: Object.values(NoteType),
  HEAD_DISPATCHER: Object.values(NoteType),
  DISPATCHER: [NoteType.OPERATIONAL, NoteType.INTERNAL, NoteType.CUSTOMER_VISIBLE],
  BILLING: [NoteType.BILLING, NoteType.INTERNAL],
  SAFETY: [NoteType.COMPLIANCE, NoteType.INTERNAL],
  SUPPORT: [NoteType.INTERNAL],
  DRIVER: [NoteType.OPERATIONAL, NoteType.INTERNAL],
};

const NOTE_TYPE_VIEW_POLICY: Record<Role, NoteType[]> = {
  ADMIN: Object.values(NoteType),
  HEAD_DISPATCHER: Object.values(NoteType),
  DISPATCHER: [NoteType.OPERATIONAL, NoteType.INTERNAL, NoteType.CUSTOMER_VISIBLE],
  BILLING: [NoteType.BILLING, NoteType.INTERNAL, NoteType.CUSTOMER_VISIBLE],
  SAFETY: [NoteType.COMPLIANCE, NoteType.INTERNAL],
  SUPPORT: [NoteType.OPERATIONAL, NoteType.CUSTOMER_VISIBLE],
  DRIVER: [NoteType.OPERATIONAL, NoteType.CUSTOMER_VISIBLE],
};

function getAllowedNoteTypes(role: Role, action: NotePermissionAction) {
  return action === "create" ? NOTE_TYPE_CREATE_POLICY[role] ?? [] : NOTE_TYPE_VIEW_POLICY[role] ?? [];
}

export function canRoleAccessNoteType(params: {
  role: Role;
  noteType: NoteType;
  action: NotePermissionAction;
}) {
  return getAllowedNoteTypes(params.role, params.action).includes(params.noteType);
}

export function ensureRoleCanCreateNoteType(params: {
  role: Role;
  noteType: NoteType;
  source?: LoadNoteSource;
}) {
  const { role, noteType } = params;
  if (role === Role.DRIVER && params.source && params.source !== LoadNoteSource.DRIVER) {
    throw new Error("Driver notes must use DRIVER source");
  }
  if (!canRoleAccessNoteType({ role, noteType, action: "create" })) {
    throw new Error(`Role ${role} cannot create ${noteType} notes`);
  }
  return noteType;
}

export function normalizeNoteTypeForRole(params: {
  role: Role;
  noteType: NoteType;
  source: LoadNoteSource;
}) {
  return ensureRoleCanCreateNoteType(params);
}

export function canRoleViewNoteType(params: { role: Role; noteType: NoteType }) {
  return canRoleAccessNoteType({ ...params, action: "view" });
}

export function isNoteExpired(params: { expiresAt?: Date | null; now?: Date }) {
  if (!params.expiresAt) return false;
  const now = params.now ?? new Date();
  return params.expiresAt.getTime() <= now.getTime();
}

export type TimelineEntry = {
  id: string;
  timestamp: Date;
};

export function compareTimelineEntries(left: TimelineEntry, right: TimelineEntry) {
  const timeDiff = right.timestamp.getTime() - left.timestamp.getTime();
  if (timeDiff !== 0) return timeDiff;
  return right.id.localeCompare(left.id);
}

export function sortTimelineEntries<T extends TimelineEntry>(items: T[]) {
  return [...items].sort(compareTimelineEntries);
}

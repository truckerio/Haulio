import { Role } from "@truckerio/db";

export function canAssignTeams(role: Role) {
  return role === Role.ADMIN || role === Role.HEAD_DISPATCHER;
}

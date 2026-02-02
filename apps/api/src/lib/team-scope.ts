import { prisma, Role, TeamEntityType } from "@truckerio/db";
import type { AuthRequest } from "./auth";

const DEFAULT_TEAM_NAME = "Default";

export type TeamScope = {
  canSeeAllTeams: boolean;
  teamIds: string[];
  defaultTeamId: string | null;
};

export async function ensureDefaultTeamForOrg(orgId: string) {
  const defaultTeam = await prisma.team.upsert({
    where: { orgId_name: { orgId, name: DEFAULT_TEAM_NAME } },
    update: { active: true },
    create: { orgId, name: DEFAULT_TEAM_NAME, active: true },
  });

  await prisma.user.updateMany({
    where: { orgId, role: Role.ADMIN, canSeeAllTeams: false },
    data: { canSeeAllTeams: true },
  });

  await prisma.user.updateMany({
    where: { orgId, defaultTeamId: null },
    data: { defaultTeamId: defaultTeam.id },
  });

  const [users, members] = await Promise.all([
    prisma.user.findMany({ where: { orgId }, select: { id: true } }),
    prisma.teamMember.findMany({ where: { orgId, teamId: defaultTeam.id }, select: { userId: true } }),
  ]);

  const memberIds = new Set(members.map((member) => member.userId));
  const missingUserIds = users.filter((user) => !memberIds.has(user.id)).map((user) => user.id);
  if (missingUserIds.length > 0) {
    await prisma.teamMember.createMany({
      data: missingUserIds.map((userId) => ({
        orgId,
        teamId: defaultTeam.id,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  return defaultTeam;
}

export async function getUserTeamScope(user: AuthRequest["user"]): Promise<TeamScope> {
  if (!user) {
    return { canSeeAllTeams: true, teamIds: [], defaultTeamId: null };
  }

  const defaultTeam = await ensureDefaultTeamForOrg(user.orgId);
  const dbUser = await prisma.user.findFirst({
    where: { id: user.id, orgId: user.orgId },
    select: { canSeeAllTeams: true, role: true },
  });

  const canSeeAllTeams =
    dbUser?.role === Role.ADMIN || dbUser?.role === Role.HEAD_DISPATCHER || Boolean(dbUser?.canSeeAllTeams);
  if (canSeeAllTeams) {
    return { canSeeAllTeams: true, teamIds: [], defaultTeamId: defaultTeam.id };
  }

  const memberships = await prisma.teamMember.findMany({
    where: { orgId: user.orgId, userId: user.id },
    select: { teamId: true },
  });

  const teamIds = memberships.map((member) => member.teamId);
  if (teamIds.length === 0) {
    await prisma.teamMember.createMany({
      data: [{ orgId: user.orgId, teamId: defaultTeam.id, userId: user.id }],
      skipDuplicates: true,
    });
    await prisma.user.updateMany({
      where: { id: user.id, orgId: user.orgId, defaultTeamId: null },
      data: { defaultTeamId: defaultTeam.id },
    });
    return { canSeeAllTeams: false, teamIds: [defaultTeam.id], defaultTeamId: defaultTeam.id };
  }

  return { canSeeAllTeams: false, teamIds, defaultTeamId: defaultTeam.id };
}

async function countEntities(orgId: string, entityType: TeamEntityType) {
  switch (entityType) {
    case TeamEntityType.LOAD:
      return prisma.load.count({ where: { orgId } });
    case TeamEntityType.TRUCK:
      return prisma.truck.count({ where: { orgId } });
    case TeamEntityType.TRAILER:
      return prisma.trailer.count({ where: { orgId } });
    case TeamEntityType.DRIVER:
      return prisma.driver.count({ where: { orgId } });
    default:
      return 0;
  }
}

async function getEntityIds(orgId: string, entityType: TeamEntityType) {
  switch (entityType) {
    case TeamEntityType.LOAD:
      return prisma.load.findMany({ where: { orgId }, select: { id: true } });
    case TeamEntityType.TRUCK:
      return prisma.truck.findMany({ where: { orgId }, select: { id: true } });
    case TeamEntityType.TRAILER:
      return prisma.trailer.findMany({ where: { orgId }, select: { id: true } });
    case TeamEntityType.DRIVER:
      return prisma.driver.findMany({ where: { orgId }, select: { id: true } });
    default:
      return [] as Array<{ id: string }>;
  }
}

export async function ensureTeamAssignmentsForEntityType(
  orgId: string,
  entityType: TeamEntityType,
  defaultTeamId: string
) {
  const [assignmentCount, entityCount] = await Promise.all([
    prisma.teamAssignment.count({ where: { orgId, entityType } }),
    countEntities(orgId, entityType),
  ]);

  if (entityCount === 0 || assignmentCount >= entityCount) {
    return;
  }

  const [entities, assignments] = await Promise.all([
    getEntityIds(orgId, entityType),
    prisma.teamAssignment.findMany({ where: { orgId, entityType }, select: { entityId: true } }),
  ]);

  const assignedIds = new Set(assignments.map((assignment) => assignment.entityId));
  const missing = entities.filter((entity) => !assignedIds.has(entity.id)).map((entity) => entity.id);

  if (missing.length === 0) {
    return;
  }

  await prisma.teamAssignment.createMany({
    data: missing.map((entityId) => ({
      orgId,
      teamId: defaultTeamId,
      entityType,
      entityId,
    })),
    skipDuplicates: true,
  });
}

export async function ensureEntityAssignedToDefaultTeam(
  orgId: string,
  entityType: TeamEntityType,
  entityId: string,
  defaultTeamId: string
) {
  const existing = await prisma.teamAssignment.findFirst({
    where: { orgId, entityType, entityId },
  });
  if (existing) return existing;

  return prisma.teamAssignment.create({
    data: { orgId, teamId: defaultTeamId, entityType, entityId },
  });
}

export async function getScopedEntityIds(
  orgId: string,
  entityType: TeamEntityType,
  scope: TeamScope
) {
  if (scope.canSeeAllTeams) {
    return null;
  }
  if (!scope.teamIds || scope.teamIds.length === 0) {
    return [] as string[];
  }
  const assignments = await prisma.teamAssignment.findMany({
    where: {
      orgId,
      entityType,
      teamId: { in: scope.teamIds },
    },
    select: { entityId: true },
  });
  return assignments.map((assignment) => assignment.entityId);
}

export async function applyTeamFilterOverride(orgId: string, scope: TeamScope, teamId?: string | null) {
  if (!teamId || !scope.canSeeAllTeams) {
    return scope;
  }
  const team = await prisma.team.findFirst({ where: { id: teamId, orgId } });
  if (!team) {
    return scope;
  }
  return { ...scope, canSeeAllTeams: false, teamIds: [team.id] };
}

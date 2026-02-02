import { TeamEntityType, type PrismaClient } from "@truckerio/db";

export async function resolveValidEntityIds(
  prisma: PrismaClient,
  orgId: string,
  entityType: TeamEntityType,
  entityIds: string[]
) {
  if (entityType === TeamEntityType.LOAD) {
    return (await prisma.load.findMany({
      where: { orgId, id: { in: entityIds } },
      select: { id: true },
    })).map((row) => row.id);
  }
  if (entityType === TeamEntityType.TRUCK) {
    return (await prisma.truck.findMany({
      where: { orgId, id: { in: entityIds } },
      select: { id: true },
    })).map((row) => row.id);
  }
  if (entityType === TeamEntityType.TRAILER) {
    return (await prisma.trailer.findMany({
      where: { orgId, id: { in: entityIds } },
      select: { id: true },
    })).map((row) => row.id);
  }
  if (entityType === TeamEntityType.DRIVER) {
    return (await prisma.driver.findMany({
      where: { orgId, id: { in: entityIds } },
      select: { id: true },
    })).map((row) => row.id);
  }
  return [] as string[];
}

export async function assignTeamEntities(params: {
  prisma: PrismaClient;
  orgId: string;
  teamId: string | null;
  entityType: TeamEntityType;
  entityIds: string[];
}) {
  const { prisma, orgId, teamId, entityType, entityIds } = params;
  const validEntityIds = await resolveValidEntityIds(prisma, orgId, entityType, entityIds);
  if (validEntityIds.length === 0) {
    return { count: 0, validEntityIds };
  }

  if (teamId) {
    const team = await prisma.team.findFirst({ where: { id: teamId, orgId } });
    if (!team) {
      throw new Error("Team not found");
    }
  } else if (entityType !== TeamEntityType.LOAD) {
    throw new Error("Team is required for this entity type");
  }

  await prisma.teamAssignment.deleteMany({
    where: {
      orgId,
      entityType,
      entityId: { in: validEntityIds },
    },
  });

  if (teamId) {
    await prisma.teamAssignment.createMany({
      data: validEntityIds.map((entityId) => ({
        orgId,
        teamId,
        entityType,
        entityId,
      })),
      skipDuplicates: true,
    });
  }

  return { count: validEntityIds.length, validEntityIds };
}

import assert from "node:assert/strict";
import { TeamEntityType, Role } from "@truckerio/db";
import { assignTeamEntities } from "./assign";
import { canAssignTeams } from "./access";

const buildPrisma = (params: {
  loads: Array<{ id: string; orgId: string }>;
  teams: Array<{ id: string; orgId: string }>;
  assignments?: Array<{ orgId: string; teamId: string; entityType: TeamEntityType; entityId: string }>;
}) => {
  const assignments = params.assignments ? [...params.assignments] : [];
  return {
    load: {
      findMany: async ({ where }: any) =>
        params.loads.filter((load) => load.orgId === where.orgId && where.id.in.includes(load.id)),
    },
    team: {
      findFirst: async ({ where }: any) => params.teams.find((team) => team.id === where.id && team.orgId === where.orgId) ?? null,
    },
    teamAssignment: {
      deleteMany: async ({ where }: any) => {
        for (let i = assignments.length - 1; i >= 0; i -= 1) {
          const entry = assignments[i];
          if (
            entry.orgId === where.orgId &&
            entry.entityType === where.entityType &&
            where.entityId.in.includes(entry.entityId)
          ) {
            assignments.splice(i, 1);
          }
        }
      },
      createMany: async ({ data }: any) => {
        data.forEach((row: any) => assignments.push(row));
      },
      _data: assignments,
    },
  } as any;
};

(async () => {
  assert.equal(canAssignTeams(Role.ADMIN), true);
  assert.equal(canAssignTeams(Role.HEAD_DISPATCHER), true);
  assert.equal(canAssignTeams(Role.DISPATCHER), false);

  const prisma = buildPrisma({
    loads: [
      { id: "load-a", orgId: "org-1" },
      { id: "load-b", orgId: "org-1" },
      { id: "load-other", orgId: "org-2" },
    ],
    teams: [{ id: "team-1", orgId: "org-1" }],
  });

  const result = await assignTeamEntities({
    prisma,
    orgId: "org-1",
    teamId: "team-1",
    entityType: TeamEntityType.LOAD,
    entityIds: ["load-a", "load-other"],
  });

  assert.equal(result.count, 1);
  assert.deepEqual(result.validEntityIds, ["load-a"]);
  assert.equal(prisma.teamAssignment._data.length, 1);
  assert.equal(prisma.teamAssignment._data[0].teamId, "team-1");

  await assignTeamEntities({
    prisma,
    orgId: "org-1",
    teamId: null,
    entityType: TeamEntityType.LOAD,
    entityIds: ["load-a"],
  });
  assert.equal(prisma.teamAssignment._data.length, 0);

  let notFoundError = "";
  try {
    await assignTeamEntities({
      prisma,
      orgId: "org-1",
      teamId: "missing",
      entityType: TeamEntityType.LOAD,
      entityIds: ["load-b"],
    });
  } catch (err) {
    notFoundError = (err as Error).message;
  }
  assert.equal(notFoundError, "Team not found");

  console.log("teams assign tests passed");
})();

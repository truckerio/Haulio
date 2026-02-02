import { Role } from "@truckerio/db";

export type TodayScopeResult = {
  scope: "org" | "team";
  teamScoped: boolean;
  includeTeamBreakdown: boolean;
  isHeadDispatcher: boolean;
};

export function getTodayScope(params: { teamsEnabled: boolean; role: Role; canSeeAllTeams: boolean }): TodayScopeResult {
  const { teamsEnabled, role, canSeeAllTeams } = params;
  const isHeadDispatcher =
    teamsEnabled && (role === Role.HEAD_DISPATCHER || (role === Role.DISPATCHER && canSeeAllTeams));
  const teamScoped = teamsEnabled && role === Role.DISPATCHER && !canSeeAllTeams;
  const includeTeamBreakdown = teamsEnabled && (role === Role.ADMIN || isHeadDispatcher);
  return {
    scope: teamScoped ? "team" : "org",
    teamScoped,
    includeTeamBreakdown,
    isHeadDispatcher,
  };
}

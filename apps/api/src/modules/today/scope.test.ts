import assert from "node:assert/strict";
import { Role } from "@truckerio/db";
import { getTodayScope } from "./scope";

const orgWide = getTodayScope({ teamsEnabled: false, role: Role.DISPATCHER, canSeeAllTeams: false });
assert.equal(orgWide.scope, "org");
assert.equal(orgWide.teamScoped, false);
assert.equal(orgWide.includeTeamBreakdown, false);

const teamScoped = getTodayScope({ teamsEnabled: true, role: Role.DISPATCHER, canSeeAllTeams: false });
assert.equal(teamScoped.scope, "team");
assert.equal(teamScoped.teamScoped, true);
assert.equal(teamScoped.includeTeamBreakdown, false);

const head = getTodayScope({ teamsEnabled: true, role: Role.DISPATCHER, canSeeAllTeams: true });
assert.equal(head.scope, "org");
assert.equal(head.includeTeamBreakdown, true);
assert.equal(head.isHeadDispatcher, true);

const headRole = getTodayScope({ teamsEnabled: true, role: Role.HEAD_DISPATCHER, canSeeAllTeams: false });
assert.equal(headRole.scope, "org");
assert.equal(headRole.includeTeamBreakdown, true);
assert.equal(headRole.isHeadDispatcher, true);

const admin = getTodayScope({ teamsEnabled: true, role: Role.ADMIN, canSeeAllTeams: true });
assert.equal(admin.scope, "org");
assert.equal(admin.includeTeamBreakdown, true);
assert.equal(admin.isHeadDispatcher, false);

console.log("today scope tests passed");

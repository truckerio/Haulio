import assert from "node:assert/strict";
import { performOrganizationDelete } from "./org-delete";

type Org = { id: string; name: string };

const makeDeleteManyModel = () => ({ deleteMany: async () => {} });

function makeFakePrisma(initialOrgs: Org[]) {
  const orgs = new Map(initialOrgs.map((org) => [org.id, org]));
  const tx: any = {
    event: makeDeleteManyModel(),
    task: makeDeleteManyModel(),
    assignmentSuggestionLog: makeDeleteManyModel(),
    loadConfirmationExtractEvent: makeDeleteManyModel(),
    loadConfirmationLearningExample: makeDeleteManyModel(),
    loadConfirmationDocument: makeDeleteManyModel(),
    learnedMapping: makeDeleteManyModel(),
    learningExample: makeDeleteManyModel(),
    accessorial: makeDeleteManyModel(),
    document: makeDeleteManyModel(),
    vaultDocument: makeDeleteManyModel(),
    storageRecord: makeDeleteManyModel(),
    loadCharge: makeDeleteManyModel(),
    loadTrackingSession: makeDeleteManyModel(),
    locationPing: makeDeleteManyModel(),
    loadLeg: makeDeleteManyModel(),
    stop: makeDeleteManyModel(),
    trailerManifestItem: makeDeleteManyModel(),
    loadAssignmentMember: makeDeleteManyModel(),
    invoiceLineItem: makeDeleteManyModel(),
    invoice: makeDeleteManyModel(),
    settlementItem: makeDeleteManyModel(),
    settlement: makeDeleteManyModel(),
    fuelSummary: makeDeleteManyModel(),
    truckTelematicsMapping: makeDeleteManyModel(),
    trackingIntegration: makeDeleteManyModel(),
    driverStats: makeDeleteManyModel(),
    trailerManifest: makeDeleteManyModel(),
    auditLog: makeDeleteManyModel(),
    userNotificationPref: makeDeleteManyModel(),
    userInvite: makeDeleteManyModel(),
    passwordReset: makeDeleteManyModel(),
    session: makeDeleteManyModel(),
    teamMember: makeDeleteManyModel(),
    teamAssignment: makeDeleteManyModel(),
    load: makeDeleteManyModel(),
    operatingEntity: makeDeleteManyModel(),
    customer: makeDeleteManyModel(),
    driver: makeDeleteManyModel(),
    truck: makeDeleteManyModel(),
    trailer: makeDeleteManyModel(),
    orgSettings: makeDeleteManyModel(),
    onboardingState: makeDeleteManyModel(),
    orgSequence: makeDeleteManyModel(),
    setupCode: makeDeleteManyModel(),
    user: makeDeleteManyModel(),
    team: makeDeleteManyModel(),
    organization: {
      delete: async ({ where }: { where: { id: string } }) => {
        orgs.delete(where.id);
      },
    },
  };
  const prisma = {
    organization: {
      findFirst: async ({ where }: { where: { id: string } }) => orgs.get(where.id) ?? null,
    },
    $transaction: async <T>(fn: (innerTx: any) => Promise<T>) => fn(tx),
  };
  return { prisma, orgs };
}

async function run() {
  const allowlist = new Set(["admin@example.com"]);
  const auditCalls: any[] = [];
  const audit = async (params: any) => {
    auditCalls.push(params);
  };

  {
    const { prisma, orgs } = makeFakePrisma([{ id: "org-1", name: "Org One" }]);
    const result = await performOrganizationDelete({
      prisma,
      audit,
      actor: {
        id: "user-1",
        orgId: "org-1",
        role: "DISPATCHER",
        email: "admin@example.com",
        name: "Admin",
        permissions: [],
      },
      orgId: "org-1",
      payload: { confirm: "DELETE", orgId: "org-1", confirmName: "Org One" },
      allowlist,
    });
    assert.equal(result.status, 403);
    assert.ok(orgs.has("org-1"));
  }

  {
    const { prisma, orgs } = makeFakePrisma([{ id: "org-1", name: "Org One" }]);
    const result = await performOrganizationDelete({
      prisma,
      audit,
      actor: {
        id: "user-1",
        orgId: "org-1",
        role: "ADMIN",
        email: "admin@example.com",
        name: "Admin",
        permissions: [],
      },
      orgId: "org-1",
      payload: { confirm: "NO", orgId: "org-1", confirmName: "Org One" },
      allowlist,
    });
    assert.equal(result.status, 400);
    assert.ok(orgs.has("org-1"));
  }

  {
    const { prisma, orgs } = makeFakePrisma([{ id: "org-1", name: "Org One" }]);
    const result = await performOrganizationDelete({
      prisma,
      audit,
      actor: {
        id: "user-1",
        orgId: "org-1",
        role: "ADMIN",
        email: "admin@example.com",
        name: "Admin",
        permissions: [],
      },
      orgId: "org-1",
      payload: { confirm: "DELETE", orgId: "org-1", confirmName: "Wrong" },
      allowlist,
    });
    assert.equal(result.status, 400);
    assert.ok(orgs.has("org-1"));
  }

  {
    const { prisma, orgs } = makeFakePrisma([{ id: "org-1", name: "Org One" }]);
    const result = await performOrganizationDelete({
      prisma,
      audit,
      actor: {
        id: "user-1",
        orgId: "org-1",
        role: "ADMIN",
        email: "admin@example.com",
        name: "Admin",
        permissions: [],
      },
      orgId: "org-1",
      payload: { confirm: "DELETE", orgId: "org-1", confirmName: "Org One" },
      allowlist,
    });
    assert.equal(result.status, 204);
    assert.ok(!orgs.has("org-1"));
  }

  console.log("org delete tests passed");
}

run().catch((error) => {
  console.error("org delete tests failed");
  console.error(error);
  process.exit(1);
});

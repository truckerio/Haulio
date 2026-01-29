import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { getQaDatabaseUrl } from "./qa-env";
import { repoRoot } from "./qa-paths";
import { resetResults, runStep, recordSkip } from "./qa-utils";

const statePath = path.resolve(repoRoot, "scripts/qa/qa-state.json");

let dbModule: typeof import("../../packages/db/src/index.ts") | null = null;

async function main() {
  resetResults();
  const qaUrl = getQaDatabaseUrl();
  process.env.DATABASE_URL = qaUrl;
  const db = await import("../../packages/db/src/index.ts");
  dbModule = db;
  const prisma = db.prisma;
  const { DocType, Prisma, OperatingEntityType } = db;

  async function createOrgSettings(orgId: string, name: string) {
    return prisma.orgSettings.upsert({
      where: { orgId },
      update: {},
      create: {
        orgId,
        companyDisplayName: name,
        remitToAddress: "100 QA Way, Austin, TX 78701",
        invoiceTerms: "Net 30",
        invoiceFooter: "QA footer",
        invoicePrefix: "QA-",
        nextInvoiceNumber: 1000,
        requiredDocs: [DocType.POD],
        requiredDriverDocs: [],
        collectPodDueMinutes: 60,
        missingPodAfterMinutes: 60,
        reminderFrequencyMinutes: 30,
        freeStorageMinutes: 60,
        storageRatePerDay: new Prisma.Decimal("25.00"),
        detentionRatePerHour: null,
        driverRatePerMile: new Prisma.Decimal("0.60"),
      },
    });
  }

  async function ensureOperatingEntity(orgId: string, name: string) {
    const existing = await prisma.operatingEntity.findFirst({
      where: { orgId, isDefault: true },
    });
    if (existing) return existing;
    return prisma.operatingEntity.create({
      data: {
        orgId,
        name,
        type: OperatingEntityType.CARRIER,
        addressLine1: "100 QA Way",
        city: "Austin",
        state: "TX",
        zip: "78701",
        remitToName: name,
        remitToAddressLine1: "100 QA Way",
        remitToCity: "Austin",
        remitToState: "TX",
        remitToZip: "78701",
        isDefault: true,
      },
    });
  }

  async function createUser(orgId: string, email: string, role: string, name: string, passwordHash: string) {
    return prisma.user.upsert({
      where: { orgId_email: { email, orgId } },
      update: { name, role },
      create: {
        orgId,
        email,
        name,
        role,
        passwordHash,
      },
    });
  }

  await runStep("qa.setup.docker", async () => {
    if (process.env.QA_DOCKER_UP === "false") {
      recordSkip("qa.setup.docker", "QA_DOCKER_UP=false");
      return { details: "Skipped docker-compose up" };
    }
    try {
      const composeFile = path.resolve(repoRoot, "docker-compose.yml");
      execSync(`docker-compose -f ${composeFile} up -d`, {
        stdio: "inherit",
        env: { ...process.env },
      });
      return { details: "docker-compose up -d" };
    } catch (error) {
      recordSkip("qa.setup.docker", "docker-compose failed or not available");
      return { details: "docker-compose not available" };
    }
  });

  await runStep("qa.setup.db-ready", async () => {
    const composeFile = path.resolve(repoRoot, "docker-compose.yml");
    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        execSync(`docker-compose -f ${composeFile} exec -T postgres pg_isready -U postgres`, {
          stdio: "ignore",
        });
        return { details: "Postgres is ready" };
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error("Postgres did not become ready");
  });

  await runStep("qa.setup.migrate", async () => {
    const dbPath = path.resolve(repoRoot, "packages/db");
    execSync(`pnpm -C ${dbPath} exec prisma migrate reset --force --skip-seed`, {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: qaUrl },
    });
    return { details: "prisma migrate reset --force --skip-seed" };
  });

  await runStep("qa.setup.seed", async () => {
    const password = "qa1234!";
    const passwordHash = await bcrypt.hash(password, 10);

    const orgA = await prisma.organization.create({ data: { name: "QA Org A" } });
    const orgB = await prisma.organization.create({ data: { name: "QA Org B" } });

    await createOrgSettings(orgA.id, orgA.name);
    await createOrgSettings(orgB.id, orgB.name);

    const operatingEntityA = await ensureOperatingEntity(orgA.id, orgA.name);
    const operatingEntityB = await ensureOperatingEntity(orgB.id, orgB.name);

    const adminA = await createUser(orgA.id, "qa-admin-a@test.local", "ADMIN", "QA Admin A", passwordHash);
    const dispatcherA = await createUser(orgA.id, "qa-dispatch-a@test.local", "DISPATCHER", "QA Dispatch A", passwordHash);
    const billingA = await createUser(orgA.id, "qa-billing-a@test.local", "BILLING", "QA Billing A", passwordHash);
    const driverUserA = await createUser(orgA.id, "qa-driver-a@test.local", "DRIVER", "QA Driver A", passwordHash);

    const adminB = await createUser(orgB.id, "qa-admin-b@test.local", "ADMIN", "QA Admin B", passwordHash);
    const dispatcherB = await createUser(orgB.id, "qa-dispatch-b@test.local", "DISPATCHER", "QA Dispatch B", passwordHash);

    const driverA = await prisma.driver.create({
      data: {
        orgId: orgA.id,
        userId: driverUserA.id,
        name: "QA Driver A",
        license: "QA1234567",
        licenseState: "TX",
        payRatePerMile: new Prisma.Decimal("0.62"),
      },
    });

    const truckA = await prisma.truck.create({ data: { orgId: orgA.id, unit: "QA-TRUCK-1", plate: "QA-PLATE-1" } });
    const trailerA = await prisma.trailer.create({ data: { orgId: orgA.id, unit: "QA-TRAILER-1", plate: "QA-TRAILER-PLATE" } });

    const customerA = await prisma.customer.create({ data: { orgId: orgA.id, name: "QA Customer A" } });
    const customerB = await prisma.customer.create({ data: { orgId: orgB.id, name: "QA Customer B" } });

    const state = {
      password,
      orgA: {
        id: orgA.id,
        operatingEntityId: operatingEntityA.id,
        users: {
          admin: adminA.email,
          dispatcher: dispatcherA.email,
          billing: billingA.email,
          driver: driverUserA.email,
        },
        driverId: driverA.id,
        truckId: truckA.id,
        trailerId: trailerA.id,
        customerId: customerA.id,
      },
      orgB: {
        id: orgB.id,
        operatingEntityId: operatingEntityB.id,
        users: {
          admin: adminB.email,
          dispatcher: dispatcherB.email,
        },
        customerId: customerB.id,
      },
    };
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    return { details: "Seeded QA orgs/users" };
  });

  console.log("QA setup complete.");
}

main()
  .catch((error) => {
    console.error("QA setup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (dbModule) {
      await dbModule.prisma.$disconnect();
    }
  });

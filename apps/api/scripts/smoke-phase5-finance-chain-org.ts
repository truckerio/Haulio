import "dotenv/config";
import { Prisma, prisma } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";

const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const ORG_NAME = (process.env.ORG_NAME ?? "Wrath Logistics").trim();
const ORG_ID = (process.env.ORG_ID ?? "").trim();

const COMPLETED_ONBOARDING_STEPS = [
  "basics",
  "operating",
  "team",
  "drivers",
  "fleet",
  "preferences",
  "tracking",
  "finance",
] as const;

type Auth = { cookie: string; csrf: string };

type WalletBalanceRow = {
  account: string;
  debitCents: number | bigint;
  creditCents: number | bigint;
  netCents: number | bigint;
};

async function authFor(userId: string): Promise<Auth> {
  const session = await createSession({ userId });
  const csrf = createCsrfToken();
  return { cookie: `session=${session.token}; csrf=${csrf}`, csrf };
}

async function request<T>(path: string, options: RequestInit, auth: Auth) {
  const headers = new Headers(options.headers || {});
  headers.set("cookie", auth.cookie);
  if (options.method && options.method !== "GET") {
    headers.set("x-csrf-token", auth.csrf);
  }

  let lastError: unknown = null;
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      break;
    } catch (error) {
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      const transient = code === "ECONNRESET" || code === "ECONNREFUSED" || code === "UND_ERR_SOCKET";
      lastError = error;
      if (!transient || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }

  if (!res) {
    throw lastError instanceof Error ? lastError : new Error(`Request failed without response: ${path}`);
  }

  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!res.ok) {
    throw new Error(`Request failed ${res.status} ${path}: ${JSON.stringify(payload)}`);
  }
  return payload as T;
}

async function ensureOperationalOrg(orgId: string) {
  await prisma.onboardingState.upsert({
    where: { orgId },
    create: {
      orgId,
      status: "OPERATIONAL",
      completedSteps: [...COMPLETED_ONBOARDING_STEPS],
      percentComplete: 100,
      currentStep: COMPLETED_ONBOARDING_STEPS.length,
      completedAt: new Date(),
    },
    update: {
      status: "OPERATIONAL",
      completedSteps: [...COMPLETED_ONBOARDING_STEPS],
      percentComplete: 100,
      currentStep: COMPLETED_ONBOARDING_STEPS.length,
      completedAt: new Date(),
    },
  });
}

async function resolveOrg() {
  if (ORG_ID) {
    const org = await prisma.organization.findUnique({ where: { id: ORG_ID }, select: { id: true, name: true } });
    if (!org) throw new Error(`ORG_ID not found: ${ORG_ID}`);
    return org;
  }

  const org = await prisma.organization.findFirst({
    where: { name: { equals: ORG_NAME, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  if (!org) throw new Error(`Org not found for ORG_NAME=${ORG_NAME}`);
  return org;
}

async function main() {
  const org = await resolveOrg();
  await ensureOperationalOrg(org.id);

  const financeActor =
    (await prisma.user.findFirst({
      where: { orgId: org.id, role: { in: ["ADMIN", "BILLING"] }, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, email: true },
    })) ??
    (await prisma.user.create({
      data: {
        orgId: org.id,
        email: `billing+phase5-org-${Date.now()}@smoke.test`,
        role: "BILLING",
        name: "Phase5 Billing",
        passwordHash: "x",
        isActive: true,
        status: "ACTIVE",
      },
      select: { id: true, role: true, email: true },
    }));

  const driver =
    (await prisma.driver.findFirst({ where: { orgId: org.id }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
    (await (async () => {
      const driverUser = await prisma.user.create({
        data: {
          orgId: org.id,
          email: `driver+phase5-org-${Date.now()}@smoke.test`,
          role: "DRIVER",
          name: "Phase5 Driver",
          passwordHash: "x",
          isActive: true,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      return prisma.driver.create({
        data: {
          orgId: org.id,
          userId: driverUser.id,
          name: "Phase5 Driver",
          status: "AVAILABLE",
        },
        select: { id: true },
      });
    })());

  const load = await prisma.load.findFirst({
    where: { orgId: org.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, loadNumber: true, status: true },
  });
  if (!load) {
    throw new Error(
      `No load found in org ${org.name}. Run reset script first: scripts/reset-org-loads-finance.ts`
    );
  }

  const billingAuth = await authFor(financeActor.id);

  const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const periodEnd = new Date();

  const payableRun = await prisma.payableRun.create({
    data: {
      orgId: org.id,
      periodStart,
      periodEnd,
      status: "RUN_FINALIZED",
      createdById: financeActor.id,
      lineItems: {
        create: [
          {
            orgId: org.id,
            partyType: "DRIVER",
            partyId: driver.id,
            loadId: load.id,
            type: "EARNING",
            amountCents: 20000,
            memo: `Phase5 org run ${load.loadNumber}`,
          },
        ],
      },
    },
    include: { lineItems: true },
  });

  const settlement = await prisma.settlement.create({
    data: {
      orgId: org.id,
      driverId: driver.id,
      periodStart,
      periodEnd,
      status: "FINALIZED",
      gross: new Prisma.Decimal("123.45"),
      deductions: new Prisma.Decimal("0.00"),
      net: new Prisma.Decimal("123.45"),
      finalizedAt: new Date(),
      items: {
        create: [
          {
            loadId: load.id,
            code: "CPM",
            description: `Phase5 org settlement ${load.loadNumber}`,
            amount: new Prisma.Decimal("123.45"),
          },
        ],
      },
    },
  });

  const payableIdemKey = `smoke-phase5-org-payable-${payableRun.id}`;
  const payablePaidFirst = await request<{
    run: { id: string; status: string };
    idempotent: boolean;
    payout: { idempotencyKey: string };
  }>(
    `/payables/runs/${payableRun.id}/paid`,
    { method: "POST", headers: { "x-idempotency-key": payableIdemKey }, body: "{}" },
    billingAuth
  );
  if (payablePaidFirst.run.status !== "PAID" || payablePaidFirst.idempotent) {
    throw new Error("payable first paid transition did not complete");
  }
  const payablePaidSecond = await request<{ idempotent: boolean }>(
    `/payables/runs/${payableRun.id}/paid`,
    { method: "POST", headers: { "x-idempotency-key": payableIdemKey }, body: "{}" },
    billingAuth
  );
  if (!payablePaidSecond.idempotent) {
    throw new Error("payable second paid transition was not idempotent");
  }

  const settlementIdemKey = `smoke-phase5-org-settlement-${settlement.id}`;
  const settlementPaidFirst = await request<{
    settlement: { id: string; status: string };
    idempotent: boolean;
    payout: { idempotencyKey: string };
  }>(
    `/settlements/${settlement.id}/paid`,
    { method: "POST", headers: { "x-idempotency-key": settlementIdemKey }, body: "{}" },
    billingAuth
  );
  if (settlementPaidFirst.settlement.status !== "PAID" || settlementPaidFirst.idempotent) {
    throw new Error("settlement first paid transition did not complete");
  }
  const settlementPaidSecond = await request<{ idempotent: boolean }>(
    `/settlements/${settlement.id}/paid`,
    { method: "POST", headers: { "x-idempotency-key": settlementIdemKey }, body: "{}" },
    billingAuth
  );
  if (!settlementPaidSecond.idempotent) {
    throw new Error("settlement second paid transition was not idempotent");
  }

  const idempotencyKeys = [payablePaidFirst.payout.idempotencyKey, settlementPaidFirst.payout.idempotencyKey];

  const journals = await prisma.$queryRaw<Array<{ id: string; idempotencyKey: string; eventType: string }>>(
    Prisma.sql`
      SELECT id, "idempotencyKey", "eventType"
      FROM "FinanceJournalEntry"
      WHERE "orgId" = ${org.id}
        AND "idempotencyKey" IN (${Prisma.join(idempotencyKeys)})
    `
  );
  if (journals.length !== 2) {
    throw new Error(`expected 2 journal entries, found ${journals.length}`);
  }

  const snapshots = await prisma.$queryRaw<Array<{ account: string; idempotencyKey: string }>>(
    Prisma.sql`
      SELECT account, "idempotencyKey"
      FROM "FinanceWalletSnapshot"
      WHERE "orgId" = ${org.id}
        AND "idempotencyKey" IN (${Prisma.join(idempotencyKeys)})
    `
  );
  if (snapshots.length !== 4) {
    throw new Error(`expected 4 wallet snapshots (2 accounts x 2 events), found ${snapshots.length}`);
  }

  const walletAccounts = ["DRIVER_PAYABLE", "CASH_CLEARING"] as const;
  const balances = await prisma.$queryRaw<Array<WalletBalanceRow>>(
    Prisma.sql`
      SELECT account, "debitCents", "creditCents", "netCents"
      FROM "FinanceWalletBalance"
      WHERE "orgId" = ${org.id}
        AND account IN (
          ${walletAccounts[0]}::"FinanceLedgerAccount",
          ${walletAccounts[1]}::"FinanceLedgerAccount"
        )
    `
  );
  if (balances.length !== 2) {
    throw new Error(`expected 2 wallet balances, found ${balances.length}`);
  }

  const balanceByAccount = new Map<string, WalletBalanceRow>(balances.map((row) => [row.account, row]));
  const payableBalance = balanceByAccount.get("DRIVER_PAYABLE");
  const cashBalance = balanceByAccount.get("CASH_CLEARING");
  if (!payableBalance || !cashBalance) {
    throw new Error("missing expected wallet accounts");
  }

  const expectedTotal = 20000 + 12345;
  if (Number(payableBalance.netCents) !== expectedTotal) {
    throw new Error(`expected DRIVER_PAYABLE net ${expectedTotal}, got ${payableBalance.netCents}`);
  }
  if (Number(cashBalance.netCents) !== -expectedTotal) {
    throw new Error(`expected CASH_CLEARING net ${-expectedTotal}, got ${cashBalance.netCents}`);
  }

  console.log(
    JSON.stringify(
      {
        org: { id: org.id, name: org.name },
        actor: { id: financeActor.id, role: financeActor.role, email: financeActor.email },
        load: { id: load.id, loadNumber: load.loadNumber, status: load.status },
        payableRunId: payableRun.id,
        settlementId: settlement.id,
        idempotencyKeys,
        expectedTotal,
      },
      null,
      2
    )
  );
  console.log("smoke-phase5-finance-chain-org: PASS");
}

main()
  .catch((error) => {
    console.error("smoke-phase5-finance-chain-org: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

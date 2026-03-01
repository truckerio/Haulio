import "dotenv/config";
import { Prisma, prisma } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";

const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

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
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
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

async function main() {
  const suffix = Date.now();
  const org = await prisma.organization.create({
    data: { name: `Smoke Phase5 Org ${suffix}` },
  });
  await ensureOperationalOrg(org.id);
  await prisma.orgSettings.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      companyDisplayName: "Smoke Phase5",
      remitToAddress: "100 Finance Way\nAustin, TX 78701",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "P5-",
      nextInvoiceNumber: 1,
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs: [],
      requiredDriverDocs: [],
      collectPodDueMinutes: 10,
      missingPodAfterMinutes: 30,
      reminderFrequencyMinutes: 10,
      requireRateConBeforeDispatch: false,
      freeStorageMinutes: 60,
      storageRatePerDay: new Prisma.Decimal("100.00"),
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      driverRatePerMile: new Prisma.Decimal("0.65"),
    },
  });

  const billing = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `billing+phase5-${suffix}@smoke.test`,
      role: "BILLING",
      name: "Smoke Billing",
      passwordHash: "x",
    },
  });
  const billingAuth = await authFor(billing.id);

  const driverUser = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `driver+phase5-${suffix}@smoke.test`,
      role: "DRIVER",
      name: "Smoke Driver",
      passwordHash: "x",
    },
  });
  const driver = await prisma.driver.create({
    data: {
      org: { connect: { id: org.id } },
      user: { connect: { id: driverUser.id } },
      name: "Smoke Driver",
      status: "AVAILABLE",
    },
  });

  const payableRun = await prisma.payableRun.create({
    data: {
      org: { connect: { id: org.id } },
      createdBy: { connect: { id: billing.id } },
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
      status: "RUN_FINALIZED",
      lineItems: {
        create: [
          {
            org: { connect: { id: org.id } },
            partyType: "DRIVER",
            partyId: driver.id,
            type: "EARNING",
            amountCents: 20000,
            memo: "Smoke earning",
          },
        ],
      },
    },
    include: { lineItems: true },
  });

  const settlement = await prisma.settlement.create({
    data: {
      org: { connect: { id: org.id } },
      driver: { connect: { id: driver.id } },
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
      status: "FINALIZED",
      gross: new Prisma.Decimal("123.45"),
      deductions: new Prisma.Decimal("0.00"),
      net: new Prisma.Decimal("123.45"),
      finalizedAt: new Date(),
      items: {
        create: [
          {
            code: "CPM",
            description: "Smoke settlement line",
            amount: new Prisma.Decimal("123.45"),
          },
        ],
      },
    },
  });

  const payableIdemKey = `smoke-phase5-payable-${payableRun.id}`;
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

  const settlementIdemKey = `smoke-phase5-settlement-${settlement.id}`;
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
  const journals = await (prisma as any).financeJournalEntry.findMany({
    where: { orgId: org.id, idempotencyKey: { in: idempotencyKeys } },
    select: { id: true, idempotencyKey: true, eventType: true },
  });
  if (journals.length !== 2) {
    throw new Error(`expected 2 journal entries, found ${journals.length}`);
  }

  const snapshots = await (prisma as any).financeWalletSnapshot.findMany({
    where: { orgId: org.id, idempotencyKey: { in: idempotencyKeys } },
    select: { account: true, idempotencyKey: true },
  });
  if (snapshots.length !== 4) {
    throw new Error(`expected 4 wallet snapshots (2 accounts x 2 events), found ${snapshots.length}`);
  }

  const balances = await (prisma as any).financeWalletBalance.findMany({
    where: { orgId: org.id, account: { in: ["DRIVER_PAYABLE", "CASH_CLEARING"] } },
    select: { account: true, debitCents: true, creditCents: true, netCents: true },
  });
  if (balances.length !== 2) {
    throw new Error(`expected 2 wallet balances, found ${balances.length}`);
  }
  const balanceByAccount = new Map<string, any>(balances.map((row: any) => [row.account, row]));
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
        orgId: org.id,
        payableRunId: payableRun.id,
        settlementId: settlement.id,
        idempotencyKeys,
        expectedTotal,
      },
      null,
      2
    )
  );
  console.log("smoke-phase5-finance-chain: PASS");
}

main()
  .catch((error) => {
    console.error("smoke-phase5-finance-chain: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

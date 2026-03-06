import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  prisma,
  Prisma,
  BillingStatus,
  DispatchExceptionOwner,
  DispatchExceptionSeverity,
  DispatchExceptionStatus,
  DocSource,
  DocStatus,
  DocType,
  DriverStatus,
  EventType,
  FinanceJournalEntityType,
  FinanceJournalEventType,
  FinanceLedgerAccount,
  FinanceJournalLineSide,
  FinancePaymentMethod,
  InvoiceStatus,
  LoadStatus,
  LoadType,
  MovementMode,
  NotePriority,
  NoteType,
  NoteEntityType,
  OperatingEntityType,
  PayableLineItemType,
  PayableMilesSource,
  PayablePartyType,
  PayableRunStatus,
  Role,
  SettlementStatus,
  StopStatus,
  StopType,
  TeamEntityType,
  TrailerStatus,
  TrailerType,
  TrackingProviderType,
  TrackingSessionStatus,
  TripStatus,
  TruckStatus,
  UserStatus,
  MoveContractStatus,
  MoveContractTemplate,
} from "@truckerio/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../..");

const ORG_NAME = process.env.ORG_NAME?.trim() || "Wrath Logistics";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim() || "wrath@admin.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || "wrath1234";
const TZ = process.env.COMPANY_TIMEZONE?.trim() || "America/Chicago";
const API_BASE = process.env.API_BASE?.trim() || "http://localhost:4000";

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

type SeedUser = {
  id: string;
  email: string;
  role: Role;
  name: string;
};

type SeedDriver = {
  id: string;
  name: string;
  userId: string;
};

type SeedTruck = {
  id: string;
  unit: string;
};

type SeedTrailer = {
  id: string;
  unit: string;
};

function daysFromNow(days: number, hour = 8, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function hoursAfter(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function hoursBefore(date: Date, hours: number) {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

function centsFromDecimal(value: Prisma.Decimal | null | undefined) {
  if (!value) return 0;
  return Math.round(Number(value.toString()) * 100);
}

function parseAddressLine(input: string) {
  return input.replace(/\n/g, ", ");
}

async function ensureUploads() {
  const uploadsDir = path.join(ROOT_DIR, "uploads");
  await fs.rm(uploadsDir, { recursive: true, force: true });
  await fs.mkdir(path.join(uploadsDir, "docs"), { recursive: true });
  await fs.mkdir(path.join(uploadsDir, "invoices"), { recursive: true });
  await fs.mkdir(path.join(uploadsDir, "packets"), { recursive: true });
}

async function wipeDatabase() {
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE
      tables text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO tables
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations';

      IF tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);
}

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ regclass: string | null }>>(
    `SELECT to_regclass('public."${tableName}"')::text AS regclass`
  );
  return Boolean(rows[0]?.regclass);
}

async function createUser(params: {
  orgId: string;
  email: string;
  role: Role;
  name: string;
  passwordHash: string;
  canSeeAllTeams?: boolean;
}) {
  return prisma.user.create({
    data: {
      orgId: params.orgId,
      email: params.email,
      role: params.role,
      name: params.name,
      passwordHash: params.passwordHash,
      isActive: true,
      status: UserStatus.ACTIVE,
      canSeeAllTeams: Boolean(params.canSeeAllTeams),
      timezone: TZ,
    },
  });
}

async function createDocument(params: {
  orgId: string;
  loadId: string;
  stopId?: string | null;
  type: DocType;
  status: DocStatus;
  source: DocSource;
  filename: string;
  uploadedById: string;
  uploadedAt: Date;
  verifiedById?: string;
  verifiedAt?: Date;
  rejectedById?: string;
  rejectedAt?: Date;
  rejectReason?: string;
}) {
  await prisma.document.create({
    data: {
      orgId: params.orgId,
      loadId: params.loadId,
      stopId: params.stopId ?? null,
      type: params.type,
      status: params.status,
      source: params.source,
      filename: params.filename,
      originalName: params.filename,
      mimeType: "application/pdf",
      size: 140_000,
      uploadedById: params.uploadedById,
      uploadedAt: params.uploadedAt,
      verifiedById: params.verifiedById,
      verifiedAt: params.verifiedAt,
      rejectedById: params.rejectedById,
      rejectedAt: params.rejectedAt,
      rejectReason: params.rejectReason,
    },
  });
  await fs.writeFile(path.join(ROOT_DIR, "uploads", "docs", params.filename), `PDF:${params.filename}`, "utf8");
}

async function postJournalWithWallet(params: {
  orgId: string;
  createdById: string;
  entityType: FinanceJournalEntityType;
  entityId: string;
  eventType: FinanceJournalEventType;
  idempotencyKey: string;
  lines: Array<{
    account: FinanceLedgerAccount;
    side: FinanceJournalLineSide;
    amountCents: number;
    memo?: string;
  }>;
  metadata?: Prisma.InputJsonValue;
}) {
  const totalDebitCents = params.lines
    .filter((line) => line.side === FinanceJournalLineSide.DEBIT)
    .reduce((sum, line) => sum + line.amountCents, 0);
  const totalCreditCents = params.lines
    .filter((line) => line.side === FinanceJournalLineSide.CREDIT)
    .reduce((sum, line) => sum + line.amountCents, 0);
  if (totalDebitCents !== totalCreditCents) {
    throw new Error(`Unbalanced journal lines for ${params.idempotencyKey}`);
  }

  const entry = await prisma.financeJournalEntry.create({
    data: {
      orgId: params.orgId,
      entityType: params.entityType,
      entityId: params.entityId,
      eventType: params.eventType,
      idempotencyKey: params.idempotencyKey,
      adapter: "MANUAL_DEMO_SEED",
      totalDebitCents,
      totalCreditCents,
      metadata: params.metadata,
      createdById: params.createdById,
      lines: {
        create: params.lines.map((line) => ({
          orgId: params.orgId,
          account: line.account,
          side: line.side,
          amountCents: line.amountCents,
          memo: line.memo ?? null,
        })),
      },
    },
  });

  for (const line of params.lines) {
    const deltaDebit = line.side === FinanceJournalLineSide.DEBIT ? line.amountCents : 0;
    const deltaCredit = line.side === FinanceJournalLineSide.CREDIT ? line.amountCents : 0;
    const deltaNet = deltaDebit - deltaCredit;

    const current = await prisma.financeWalletBalance.findUnique({
      where: { orgId_account: { orgId: params.orgId, account: line.account } },
    });

    const nextDebit = (current?.debitCents ?? 0) + deltaDebit;
    const nextCredit = (current?.creditCents ?? 0) + deltaCredit;
    const nextNet = (current?.netCents ?? 0) + deltaNet;

    await prisma.financeWalletBalance.upsert({
      where: { orgId_account: { orgId: params.orgId, account: line.account } },
      create: {
        orgId: params.orgId,
        account: line.account,
        debitCents: nextDebit,
        creditCents: nextCredit,
        netCents: nextNet,
      },
      update: {
        debitCents: nextDebit,
        creditCents: nextCredit,
        netCents: nextNet,
      },
    });

    await prisma.financeWalletSnapshot.create({
      data: {
        orgId: params.orgId,
        account: line.account,
        entityType: params.entityType,
        entityId: params.entityId,
        eventType: params.eventType,
        idempotencyKey: params.idempotencyKey,
        deltaDebitCents: deltaDebit,
        deltaCreditCents: deltaCredit,
        deltaNetCents: deltaNet,
        balanceDebitCents: nextDebit,
        balanceCreditCents: nextCredit,
        balanceNetCents: nextNet,
      },
    });
  }

  return entry;
}

async function main() {
  if (ADMIN_PASSWORD.length < 6) {
    throw new Error("ADMIN_PASSWORD must be at least 6 characters.");
  }

  await wipeDatabase();
  await ensureUploads();

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const org = await prisma.organization.create({ data: { name: ORG_NAME } });

  const admin = await createUser({
    orgId: org.id,
    email: ADMIN_EMAIL,
    role: Role.ADMIN,
    name: "Wrath Admin",
    passwordHash,
    canSeeAllTeams: true,
  });
  const headDispatcher = await createUser({
    orgId: org.id,
    email: "head.dispatch@wrath.test",
    role: Role.HEAD_DISPATCHER,
    name: "Head Dispatch",
    passwordHash,
    canSeeAllTeams: true,
  });
  const outboundDispatcher = await createUser({
    orgId: org.id,
    email: "dispatch.outbound@wrath.test",
    role: Role.DISPATCHER,
    name: "Outbound Dispatcher",
    passwordHash,
  });
  const inboundDispatcher = await createUser({
    orgId: org.id,
    email: "dispatch.inbound@wrath.test",
    role: Role.DISPATCHER,
    name: "Inbound Dispatcher",
    passwordHash,
  });
  const billingUser = await createUser({
    orgId: org.id,
    email: "billing@wrath.test",
    role: Role.BILLING,
    name: "Billing Lead",
    passwordHash,
  });
  const safetyUser = await createUser({
    orgId: org.id,
    email: "safety@wrath.test",
    role: Role.SAFETY,
    name: "Safety Lead",
    passwordHash,
  });
  const supportUser = await createUser({
    orgId: org.id,
    email: "support@wrath.test",
    role: Role.SUPPORT,
    name: "Support Lead",
    passwordHash,
  });

  const operatingEntity = await prisma.operatingEntity.create({
    data: {
      orgId: org.id,
      name: ORG_NAME,
      type: OperatingEntityType.CARRIER,
      addressLine1: "1450 Commerce Parkway",
      city: "Dallas",
      state: "TX",
      zip: "75247",
      phone: "214-555-0140",
      email: "ops@wrathlogistics.demo",
      mcNumber: "MC908172",
      dotNumber: "DOT554433",
      remitToName: ORG_NAME,
      remitToAddressLine1: "1450 Commerce Parkway",
      remitToCity: "Dallas",
      remitToState: "TX",
      remitToZip: "75247",
      isDefault: true,
    },
  });

  await prisma.orgSettings.create({
    data: {
      orgId: org.id,
      companyDisplayName: ORG_NAME,
      remitToAddress: "Wrath Logistics\n1450 Commerce Parkway\nDallas, TX 75247",
      invoiceTerms: "Net 30",
      invoiceTermsDays: 30,
      invoiceFooter: "Thank you for moving with Wrath Logistics.",
      invoicePrefix: "WR-INV-",
      nextInvoiceNumber: 5001,
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs: [DocType.POD, DocType.BOL],
      requiredDriverDocs: ["CDL", "MED_CARD"],
      collectPodDueMinutes: 30,
      missingPodAfterMinutes: 120,
      reminderFrequencyMinutes: 20,
      requireRateConBeforeDispatch: true,
      inboundRateconEmailEnabled: true,
      shipmentWebhooksEnabled: true,
      shipmentWebhooksVersion: "v1",
      timezone: TZ,
      freeStorageMinutes: 120,
      storageRatePerDay: new Prisma.Decimal("150.00"),
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      detentionRatePerHour: new Prisma.Decimal("75.00"),
      driverRatePerMile: new Prisma.Decimal("0.65"),
    },
  });

  await prisma.onboardingState.create({
    data: {
      orgId: org.id,
      status: "OPERATIONAL",
      completedSteps: [...COMPLETED_ONBOARDING_STEPS],
      percentComplete: 100,
      currentStep: COMPLETED_ONBOARDING_STEPS.length,
      completedAt: new Date(),
    },
  });

  const inboundTeam = await prisma.team.create({ data: { orgId: org.id, name: "Inbound Team", active: true } });
  const outboundTeam = await prisma.team.create({ data: { orgId: org.id, name: "Outbound Team", active: true } });

  await prisma.user.update({ where: { id: outboundDispatcher.id }, data: { defaultTeamId: outboundTeam.id } });
  await prisma.user.update({ where: { id: inboundDispatcher.id }, data: { defaultTeamId: inboundTeam.id } });

  await prisma.teamMember.createMany({
    data: [
      { orgId: org.id, teamId: outboundTeam.id, userId: outboundDispatcher.id },
      { orgId: org.id, teamId: outboundTeam.id, userId: headDispatcher.id },
      { orgId: org.id, teamId: inboundTeam.id, userId: inboundDispatcher.id },
      { orgId: org.id, teamId: inboundTeam.id, userId: headDispatcher.id },
      { orgId: org.id, teamId: inboundTeam.id, userId: billingUser.id },
    ],
  });

  const companyDriverUser = await createUser({
    orgId: org.id,
    email: "driver.company1@wrath.test",
    role: Role.DRIVER,
    name: "Company Driver 1",
    passwordHash,
  });
  const companyDriver2User = await createUser({
    orgId: org.id,
    email: "driver.company2@wrath.test",
    role: Role.DRIVER,
    name: "Company Driver 2",
    passwordHash,
  });
  const ownerOpUser = await createUser({
    orgId: org.id,
    email: "driver.ownerop1@wrath.test",
    role: Role.DRIVER,
    name: "Owner Operator 1",
    passwordHash,
  });

  const companyDriver = await prisma.driver.create({
    data: {
      orgId: org.id,
      userId: companyDriverUser.id,
      name: "Company Driver 1",
      status: DriverStatus.ON_LOAD,
      phone: "214-555-1001",
      license: "TXC123001",
      licenseState: "TX",
      licenseExpiresAt: daysFromNow(380),
      medCardExpiresAt: daysFromNow(200),
      payRatePerMile: new Prisma.Decimal("0.65"),
    },
  });
  const companyDriver2 = await prisma.driver.create({
    data: {
      orgId: org.id,
      userId: companyDriver2User.id,
      name: "Company Driver 2",
      status: DriverStatus.ON_LOAD,
      phone: "214-555-1002",
      license: "TXC123002",
      licenseState: "TX",
      licenseExpiresAt: daysFromNow(410),
      medCardExpiresAt: daysFromNow(220),
      payRatePerMile: new Prisma.Decimal("0.66"),
    },
  });
  const ownerOperator = await prisma.driver.create({
    data: {
      orgId: org.id,
      userId: ownerOpUser.id,
      name: "Owner Operator 1",
      status: DriverStatus.ON_LOAD,
      phone: "214-555-2001",
      license: "TXO900201",
      licenseState: "TX",
      licenseExpiresAt: daysFromNow(420),
      medCardExpiresAt: daysFromNow(240),
      payRatePerMile: new Prisma.Decimal("1.05"),
    },
  });

  const trucks = await prisma.truck.createManyAndReturn({
    data: [
      {
        orgId: org.id,
        unit: "WR-TRK-001",
        vin: "1HTMKADN11H100001",
        plate: "TX-2011",
        plateState: "TX",
        status: TruckStatus.ASSIGNED,
      },
      {
        orgId: org.id,
        unit: "WR-TRK-002",
        vin: "1HTMKADN11H100002",
        plate: "TX-2012",
        plateState: "TX",
        status: TruckStatus.ASSIGNED,
      },
      {
        orgId: org.id,
        unit: "WR-TRK-003",
        vin: "1HTMKADN11H100003",
        plate: "TX-2013",
        plateState: "TX",
        status: TruckStatus.ASSIGNED,
      },
      {
        orgId: org.id,
        unit: "WR-TRK-004",
        vin: "1HTMKADN11H100004",
        plate: "TX-2014",
        plateState: "TX",
        status: TruckStatus.AVAILABLE,
      },
    ],
  });
  const trailers = await prisma.trailer.createManyAndReturn({
    data: [
      {
        orgId: org.id,
        unit: "WR-TRL-001",
        type: TrailerType.DRY_VAN,
        plate: "TX-5501",
        plateState: "TX",
        status: TrailerStatus.ASSIGNED,
      },
      {
        orgId: org.id,
        unit: "WR-TRL-002",
        type: TrailerType.REEFER,
        plate: "TX-5502",
        plateState: "TX",
        status: TrailerStatus.ASSIGNED,
      },
      {
        orgId: org.id,
        unit: "WR-TRL-003",
        type: TrailerType.DRY_VAN,
        plate: "TX-5503",
        plateState: "TX",
        status: TrailerStatus.ASSIGNED,
      },
      {
        orgId: org.id,
        unit: "WR-TRL-004",
        type: TrailerType.FLATBED,
        plate: "TX-5504",
        plateState: "TX",
        status: TrailerStatus.AVAILABLE,
      },
    ],
  });

  const truckByUnit = new Map(trucks.map((truck) => [truck.unit, truck]));
  const trailerByUnit = new Map(trailers.map((trailer) => [trailer.unit, trailer]));

  const customers = await prisma.customer.createManyAndReturn({
    data: [
      {
        orgId: org.id,
        name: "Blue Valley Retail",
        billingEmail: "ap@bluevalleyretail.com",
        billingPhone: "972-555-1100",
        termsDays: 30,
      },
      {
        orgId: org.id,
        name: "Kernel Enforce Customer",
        billingEmail: "billing@kernelenforce.com",
        billingPhone: "972-555-1200",
        termsDays: 30,
      },
      {
        orgId: org.id,
        name: "Mountain Foods Cooperative",
        billingEmail: "ap@mountainfoods.co",
        billingPhone: "972-555-1300",
        termsDays: 21,
      },
      {
        orgId: org.id,
        name: "Frontline Hardware",
        billingEmail: "finance@frontlinehardware.com",
        billingPhone: "972-555-1400",
        termsDays: 45,
      },
    ],
  });
  const customerByName = new Map(customers.map((customer) => [customer.name, customer]));

  const ownerOperatorCarrier = await prisma.vendor.create({
    data: {
      orgId: org.id,
      code: "OO-001",
      name: "Owner Operator 1 Transport",
      active: true,
      paymentMethod: FinancePaymentMethod.ACH,
      termsDays: 7,
      email: "ap@ownerop1transport.demo",
      phone: "214-555-2901",
      remitToAddress: "2100 Fleet Lane, Dallas, TX 75247",
      createdById: billingUser.id,
    },
  });

  const outboundPickupStart = daysFromNow(-1, 6, 30);
  const outboundDeliveryStart = daysFromNow(1, 7, 30);
  const ltlPickupStart = daysFromNow(-1, 8, 0);
  const ltlDeliveryStart = daysFromNow(0, 15, 0);
  const deliveredPickupStart = daysFromNow(-3, 7, 0);
  const deliveredDeliveryStart = daysFromNow(-2, 12, 0);
  const invoicedPickupStart = daysFromNow(-6, 8, 0);
  const invoicedDeliveryStart = daysFromNow(-5, 14, 0);
  const paidPickupStart = daysFromNow(-12, 8, 0);
  const paidDeliveryStart = daysFromNow(-11, 13, 0);

  const tripFTL = await prisma.trip.create({
    data: {
      orgId: org.id,
      tripNumber: "TR-5001",
      status: TripStatus.IN_TRANSIT,
      movementMode: MovementMode.FTL,
      driverId: companyDriver.id,
      truckId: truckByUnit.get("WR-TRK-001")!.id,
      trailerId: trailerByUnit.get("WR-TRL-001")!.id,
      origin: "Dallas, TX",
      destination: "Denver, CO",
      plannedDepartureAt: hoursBefore(outboundPickupStart, 2),
      plannedArrivalAt: hoursAfter(outboundDeliveryStart, 14),
      departedAt: hoursBefore(outboundPickupStart, 1),
    },
  });

  const tripLTL = await prisma.trip.create({
    data: {
      orgId: org.id,
      tripNumber: "TR-6001",
      status: TripStatus.IN_TRANSIT,
      movementMode: MovementMode.LTL,
      driverId: companyDriver2.id,
      truckId: truckByUnit.get("WR-TRK-002")!.id,
      trailerId: trailerByUnit.get("WR-TRL-002")!.id,
      origin: "Fontana, CA",
      destination: "Indianapolis, IN",
      plannedDepartureAt: hoursBefore(ltlPickupStart, 2),
      plannedArrivalAt: hoursAfter(ltlDeliveryStart, 26),
      departedAt: hoursBefore(ltlPickupStart, 1),
    },
  });

  const tripOwnerOp = await prisma.trip.create({
    data: {
      orgId: org.id,
      tripNumber: "TR-7001",
      status: TripStatus.ARRIVED,
      movementMode: MovementMode.FTL,
      driverId: ownerOperator.id,
      truckId: truckByUnit.get("WR-TRK-003")!.id,
      trailerId: trailerByUnit.get("WR-TRL-003")!.id,
      origin: "Austin, TX",
      destination: "Dallas, TX",
      plannedDepartureAt: hoursBefore(deliveredPickupStart, 3),
      plannedArrivalAt: hoursAfter(deliveredDeliveryStart, 8),
      departedAt: hoursBefore(deliveredPickupStart, 1),
      arrivedAt: hoursAfter(deliveredDeliveryStart, 1),
    },
  });

  const tripPaid = await prisma.trip.create({
    data: {
      orgId: org.id,
      tripNumber: "TR-8001",
      status: TripStatus.COMPLETE,
      movementMode: MovementMode.FTL,
      driverId: companyDriver.id,
      truckId: truckByUnit.get("WR-TRK-001")!.id,
      trailerId: trailerByUnit.get("WR-TRL-001")!.id,
      origin: "Phoenix, AZ",
      destination: "Houston, TX",
      plannedDepartureAt: hoursBefore(paidPickupStart, 2),
      plannedArrivalAt: hoursAfter(paidDeliveryStart, 10),
      departedAt: hoursBefore(paidPickupStart, 1),
      arrivedAt: hoursAfter(paidDeliveryStart, 1),
    },
  });

  const loadFtlInTransit = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: "WR-FTL-5001",
      status: LoadStatus.IN_TRANSIT,
      movementMode: MovementMode.FTL,
      loadType: LoadType.COMPANY,
      operatingEntityId: operatingEntity.id,
      customerId: customerByName.get("Blue Valley Retail")?.id,
      customerName: "Blue Valley Retail",
      customerRef: "PO-88771",
      miles: 810,
      rate: new Prisma.Decimal("2750.00"),
      assignedDriverId: companyDriver.id,
      truckId: truckByUnit.get("WR-TRK-001")!.id,
      trailerId: trailerByUnit.get("WR-TRL-001")!.id,
      assignedDriverAt: hoursBefore(outboundPickupStart, 8),
      assignedTruckAt: hoursBefore(outboundPickupStart, 8),
      assignedTrailerAt: hoursBefore(outboundPickupStart, 8),
      plannedAt: hoursBefore(outboundPickupStart, 10),
      billingStatus: BillingStatus.BLOCKED,
      billingBlockingReasons: ["MISSING_POD"],
      createdById: admin.id,
      notes: "FTL demo load currently in transit.",
      weightLbs: 36500,
      palletCount: 24,
    },
  });

  const loadLtl1 = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: "WR-LTL-6001A",
      status: LoadStatus.IN_TRANSIT,
      movementMode: MovementMode.LTL,
      loadType: LoadType.REEFER,
      operatingEntityId: operatingEntity.id,
      customerId: customerByName.get("Kernel Enforce Customer")?.id,
      customerName: "Kernel Enforce Customer",
      customerRef: "KE-1772321115790",
      miles: 1210,
      rate: new Prisma.Decimal("1500.00"),
      assignedDriverId: companyDriver2.id,
      truckId: truckByUnit.get("WR-TRK-002")!.id,
      trailerId: trailerByUnit.get("WR-TRL-002")!.id,
      assignedDriverAt: hoursBefore(ltlPickupStart, 9),
      assignedTruckAt: hoursBefore(ltlPickupStart, 9),
      assignedTrailerAt: hoursBefore(ltlPickupStart, 9),
      plannedAt: hoursBefore(ltlPickupStart, 12),
      billingStatus: BillingStatus.BLOCKED,
      billingBlockingReasons: ["MISSING_POD"],
      createdById: admin.id,
      notes: "LTL linehaul leg 1.",
      weightLbs: 17000,
      palletCount: 12,
    },
  });

  const loadLtl2 = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: "WR-LTL-6001B",
      status: LoadStatus.IN_TRANSIT,
      movementMode: MovementMode.LTL,
      loadType: LoadType.DRY_VAN,
      operatingEntityId: operatingEntity.id,
      customerId: customerByName.get("Kernel Enforce Customer")?.id,
      customerName: "Kernel Enforce Customer",
      customerRef: "KE-1772320905777",
      miles: 1195,
      rate: new Prisma.Decimal("1500.00"),
      assignedDriverId: companyDriver2.id,
      truckId: truckByUnit.get("WR-TRK-002")!.id,
      trailerId: trailerByUnit.get("WR-TRL-002")!.id,
      assignedDriverAt: hoursBefore(ltlPickupStart, 9),
      assignedTruckAt: hoursBefore(ltlPickupStart, 9),
      assignedTrailerAt: hoursBefore(ltlPickupStart, 9),
      plannedAt: hoursBefore(ltlPickupStart, 12),
      billingStatus: BillingStatus.BLOCKED,
      billingBlockingReasons: ["MISSING_POD"],
      createdById: admin.id,
      notes: "LTL linehaul leg 2.",
      weightLbs: 16500,
      palletCount: 11,
    },
  });

  const loadReady = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: "WR-FTL-7001",
      status: LoadStatus.READY_TO_INVOICE,
      movementMode: MovementMode.FTL,
      loadType: LoadType.COMPANY,
      operatingEntityId: operatingEntity.id,
      customerId: customerByName.get("Mountain Foods Cooperative")?.id,
      customerName: "Mountain Foods Cooperative",
      customerRef: "MF-44991",
      miles: 210,
      rate: new Prisma.Decimal("1825.00"),
      assignedDriverId: ownerOperator.id,
      truckId: truckByUnit.get("WR-TRK-003")!.id,
      trailerId: trailerByUnit.get("WR-TRL-003")!.id,
      assignedDriverAt: hoursBefore(deliveredPickupStart, 7),
      assignedTruckAt: hoursBefore(deliveredPickupStart, 7),
      assignedTrailerAt: hoursBefore(deliveredPickupStart, 7),
      plannedAt: hoursBefore(deliveredPickupStart, 10),
      deliveredAt: hoursAfter(deliveredDeliveryStart, 1),
      podVerifiedAt: hoursAfter(deliveredDeliveryStart, 2),
      billingStatus: BillingStatus.READY,
      billingBlockingReasons: [],
      createdById: admin.id,
      notes: "Delivered and docs verified. Ready for invoice generation.",
      weightLbs: 21000,
      palletCount: 18,
    },
  });

  const loadInvoiced = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: "WR-FTL-7101",
      status: LoadStatus.INVOICED,
      movementMode: MovementMode.FTL,
      loadType: LoadType.COMPANY,
      operatingEntityId: operatingEntity.id,
      customerId: customerByName.get("Frontline Hardware")?.id,
      customerName: "Frontline Hardware",
      customerRef: "FH-77210",
      miles: 980,
      rate: new Prisma.Decimal("3600.00"),
      assignedDriverId: ownerOperator.id,
      truckId: truckByUnit.get("WR-TRK-003")!.id,
      trailerId: trailerByUnit.get("WR-TRL-003")!.id,
      assignedDriverAt: hoursBefore(invoicedPickupStart, 7),
      assignedTruckAt: hoursBefore(invoicedPickupStart, 7),
      assignedTrailerAt: hoursBefore(invoicedPickupStart, 7),
      plannedAt: hoursBefore(invoicedPickupStart, 9),
      deliveredAt: hoursAfter(invoicedDeliveryStart, 1),
      podVerifiedAt: hoursAfter(invoicedDeliveryStart, 2),
      invoicedAt: hoursAfter(invoicedDeliveryStart, 5),
      billingStatus: BillingStatus.INVOICED,
      billingBlockingReasons: [],
      createdById: admin.id,
      notes: "Invoice sent, waiting collection.",
      weightLbs: 29000,
      palletCount: 20,
    },
  });

  const loadPaid = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: "WR-FTL-8001",
      status: LoadStatus.PAID,
      movementMode: MovementMode.FTL,
      loadType: LoadType.COMPANY,
      operatingEntityId: operatingEntity.id,
      customerId: customerByName.get("Blue Valley Retail")?.id,
      customerName: "Blue Valley Retail",
      customerRef: "PO-88110",
      miles: 1025,
      rate: new Prisma.Decimal("3420.00"),
      assignedDriverId: companyDriver.id,
      truckId: truckByUnit.get("WR-TRK-001")!.id,
      trailerId: trailerByUnit.get("WR-TRL-001")!.id,
      assignedDriverAt: hoursBefore(paidPickupStart, 8),
      assignedTruckAt: hoursBefore(paidPickupStart, 8),
      assignedTrailerAt: hoursBefore(paidPickupStart, 8),
      plannedAt: hoursBefore(paidPickupStart, 10),
      deliveredAt: hoursAfter(paidDeliveryStart, 1),
      podVerifiedAt: hoursAfter(paidDeliveryStart, 2),
      invoicedAt: hoursAfter(paidDeliveryStart, 4),
      billingStatus: BillingStatus.INVOICED,
      billingBlockingReasons: [],
      createdById: admin.id,
      notes: "Fully paid load.",
      weightLbs: 32000,
      palletCount: 23,
    },
  });

  const loadByNumber = new Map([
    [loadFtlInTransit.loadNumber, loadFtlInTransit],
    [loadLtl1.loadNumber, loadLtl1],
    [loadLtl2.loadNumber, loadLtl2],
    [loadReady.loadNumber, loadReady],
    [loadInvoiced.loadNumber, loadInvoiced],
    [loadPaid.loadNumber, loadPaid],
  ]);

  await prisma.tripLoad.createMany({
    data: [
      { orgId: org.id, tripId: tripFTL.id, loadId: loadFtlInTransit.id, sequence: 1 },
      { orgId: org.id, tripId: tripLTL.id, loadId: loadLtl1.id, sequence: 1 },
      { orgId: org.id, tripId: tripLTL.id, loadId: loadLtl2.id, sequence: 2 },
      { orgId: org.id, tripId: tripOwnerOp.id, loadId: loadReady.id, sequence: 1 },
      { orgId: org.id, tripId: tripOwnerOp.id, loadId: loadInvoiced.id, sequence: 2 },
      { orgId: org.id, tripId: tripPaid.id, loadId: loadPaid.id, sequence: 1 },
    ],
  });

  const stopMatrix = [
    {
      load: loadFtlInTransit,
      pickup: {
        name: "Dallas Crossdock",
        address: "4500 Irving Blvd",
        city: "Dallas",
        state: "TX",
        zip: "75247",
        start: outboundPickupStart,
        end: hoursAfter(outboundPickupStart, 2),
      },
      delivery: {
        name: "Denver Grocery Terminal",
        address: "4900 E 48th Ave",
        city: "Denver",
        state: "CO",
        zip: "80216",
        start: outboundDeliveryStart,
        end: hoursAfter(outboundDeliveryStart, 2),
      },
      deliveryStopStatus: StopStatus.PLANNED,
    },
    {
      load: loadLtl1,
      pickup: {
        name: "Fontana Yard",
        address: "14300 Slover Ave",
        city: "Fontana",
        state: "CA",
        zip: "92337",
        start: ltlPickupStart,
        end: hoursAfter(ltlPickupStart, 2),
      },
      delivery: {
        name: "Indianapolis Hub",
        address: "6020 E 82nd St",
        city: "Indianapolis",
        state: "IN",
        zip: "46250",
        start: ltlDeliveryStart,
        end: hoursAfter(ltlDeliveryStart, 2),
      },
      deliveryStopStatus: StopStatus.PLANNED,
    },
    {
      load: loadLtl2,
      pickup: {
        name: "Fontana Yard",
        address: "14300 Slover Ave",
        city: "Fontana",
        state: "CA",
        zip: "92337",
        start: hoursAfter(ltlPickupStart, 1),
        end: hoursAfter(ltlPickupStart, 3),
      },
      delivery: {
        name: "Indianapolis Hub",
        address: "6020 E 82nd St",
        city: "Indianapolis",
        state: "IN",
        zip: "46250",
        start: hoursAfter(ltlDeliveryStart, 1),
        end: hoursAfter(ltlDeliveryStart, 3),
      },
      deliveryStopStatus: StopStatus.PLANNED,
    },
    {
      load: loadReady,
      pickup: {
        name: "Austin Foods Dock",
        address: "1301 Airport Blvd",
        city: "Austin",
        state: "TX",
        zip: "78702",
        start: deliveredPickupStart,
        end: hoursAfter(deliveredPickupStart, 1.5),
      },
      delivery: {
        name: "Dallas Market DC",
        address: "7100 Oak Grove Rd",
        city: "Dallas",
        state: "TX",
        zip: "75217",
        start: deliveredDeliveryStart,
        end: hoursAfter(deliveredDeliveryStart, 2),
      },
      deliveryStopStatus: StopStatus.DEPARTED,
    },
    {
      load: loadInvoiced,
      pickup: {
        name: "Phoenix Material Yard",
        address: "3000 W Buckeye Rd",
        city: "Phoenix",
        state: "AZ",
        zip: "85009",
        start: invoicedPickupStart,
        end: hoursAfter(invoicedPickupStart, 1.5),
      },
      delivery: {
        name: "Houston Build Center",
        address: "8100 N Loop E",
        city: "Houston",
        state: "TX",
        zip: "77029",
        start: invoicedDeliveryStart,
        end: hoursAfter(invoicedDeliveryStart, 2),
      },
      deliveryStopStatus: StopStatus.DEPARTED,
    },
    {
      load: loadPaid,
      pickup: {
        name: "Phoenix Material Yard",
        address: "3000 W Buckeye Rd",
        city: "Phoenix",
        state: "AZ",
        zip: "85009",
        start: paidPickupStart,
        end: hoursAfter(paidPickupStart, 1.5),
      },
      delivery: {
        name: "Houston Build Center",
        address: "8100 N Loop E",
        city: "Houston",
        state: "TX",
        zip: "77029",
        start: paidDeliveryStart,
        end: hoursAfter(paidDeliveryStart, 2),
      },
      deliveryStopStatus: StopStatus.DEPARTED,
    },
  ] as const;

  const stopByLoad = new Map<string, { pickupId: string; deliveryId: string }>();
  for (const row of stopMatrix) {
    const pickup = await prisma.stop.create({
      data: {
        orgId: org.id,
        loadId: row.load.id,
        type: StopType.PICKUP,
        status: StopStatus.DEPARTED,
        name: row.pickup.name,
        address: row.pickup.address,
        city: row.pickup.city,
        state: row.pickup.state,
        zip: row.pickup.zip,
        appointmentStart: row.pickup.start,
        appointmentEnd: row.pickup.end,
        arrivedAt: hoursBefore(row.pickup.start, 0.5),
        departedAt: hoursAfter(row.pickup.start, 0.5),
        sequence: 1,
      },
    });
    const deliveryArrived =
      row.deliveryStopStatus === StopStatus.DEPARTED ? hoursBefore(row.delivery.end, 1) : null;
    const deliveryDeparted = row.deliveryStopStatus === StopStatus.DEPARTED ? row.delivery.end : null;
    const delivery = await prisma.stop.create({
      data: {
        orgId: org.id,
        loadId: row.load.id,
        type: StopType.DELIVERY,
        status: row.deliveryStopStatus,
        name: row.delivery.name,
        address: row.delivery.address,
        city: row.delivery.city,
        state: row.delivery.state,
        zip: row.delivery.zip,
        appointmentStart: row.delivery.start,
        appointmentEnd: row.delivery.end,
        arrivedAt: deliveryArrived,
        departedAt: deliveryDeparted,
        sequence: 2,
      },
    });
    stopByLoad.set(row.load.id, { pickupId: pickup.id, deliveryId: delivery.id });
  }

  await createDocument({
    orgId: org.id,
    loadId: loadFtlInTransit.id,
    stopId: stopByLoad.get(loadFtlInTransit.id)?.pickupId,
    type: DocType.RATECON,
    status: DocStatus.VERIFIED,
    source: DocSource.OPS_UPLOAD,
    filename: "WR-FTL-5001-ratecon.pdf",
    uploadedById: admin.id,
    uploadedAt: hoursBefore(outboundPickupStart, 10),
    verifiedById: outboundDispatcher.id,
    verifiedAt: hoursBefore(outboundPickupStart, 9),
  });
  await createDocument({
    orgId: org.id,
    loadId: loadFtlInTransit.id,
    stopId: stopByLoad.get(loadFtlInTransit.id)?.pickupId,
    type: DocType.BOL,
    status: DocStatus.UPLOADED,
    source: DocSource.DRIVER_UPLOAD,
    filename: "WR-FTL-5001-bol.pdf",
    uploadedById: companyDriverUser.id,
    uploadedAt: hoursBefore(outboundPickupStart, 1),
  });

  await createDocument({
    orgId: org.id,
    loadId: loadLtl1.id,
    stopId: stopByLoad.get(loadLtl1.id)?.pickupId,
    type: DocType.BOL,
    status: DocStatus.UPLOADED,
    source: DocSource.DRIVER_UPLOAD,
    filename: "WR-LTL-6001A-bol.pdf",
    uploadedById: companyDriver2User.id,
    uploadedAt: hoursBefore(ltlPickupStart, 1),
  });
  await createDocument({
    orgId: org.id,
    loadId: loadLtl2.id,
    stopId: stopByLoad.get(loadLtl2.id)?.pickupId,
    type: DocType.BOL,
    status: DocStatus.UPLOADED,
    source: DocSource.DRIVER_UPLOAD,
    filename: "WR-LTL-6001B-bol.pdf",
    uploadedById: companyDriver2User.id,
    uploadedAt: hoursBefore(ltlPickupStart, 0.5),
  });

  for (const load of [loadReady, loadInvoiced, loadPaid]) {
    const stopIds = stopByLoad.get(load.id)!;
    await createDocument({
      orgId: org.id,
      loadId: load.id,
      stopId: stopIds.pickupId,
      type: DocType.BOL,
      status: DocStatus.VERIFIED,
      source: DocSource.DRIVER_UPLOAD,
      filename: `${load.loadNumber}-bol.pdf`,
      uploadedById: ownerOpUser.id,
      uploadedAt: hoursBefore(load.deliveredAt ?? new Date(), 8),
      verifiedById: inboundDispatcher.id,
      verifiedAt: hoursBefore(load.deliveredAt ?? new Date(), 7),
    });
    await createDocument({
      orgId: org.id,
      loadId: load.id,
      stopId: stopIds.deliveryId,
      type: DocType.POD,
      status: DocStatus.VERIFIED,
      source: DocSource.DRIVER_UPLOAD,
      filename: `${load.loadNumber}-pod.pdf`,
      uploadedById: ownerOpUser.id,
      uploadedAt: hoursAfter(load.deliveredAt ?? new Date(), 0.5),
      verifiedById: billingUser.id,
      verifiedAt: hoursAfter(load.deliveredAt ?? new Date(), 2),
    });
  }

  await prisma.document.create({
    data: {
      orgId: org.id,
      loadId: loadLtl2.id,
      stopId: stopByLoad.get(loadLtl2.id)?.deliveryId,
      type: DocType.POD,
      status: DocStatus.REJECTED,
      source: DocSource.DRIVER_UPLOAD,
      filename: "WR-LTL-6001B-pod-rejected.pdf",
      originalName: "WR-LTL-6001B-pod-rejected.pdf",
      mimeType: "application/pdf",
      size: 125000,
      uploadedById: companyDriver2User.id,
      uploadedAt: new Date(),
      rejectedById: billingUser.id,
      rejectedAt: new Date(),
      rejectReason: "Receiver signature missing",
    },
  });
  await fs.writeFile(
    path.join(ROOT_DIR, "uploads", "docs", "WR-LTL-6001B-pod-rejected.pdf"),
    "PDF:WR-LTL-6001B-pod-rejected.pdf",
    "utf8"
  );

  const invoiceInvoiced = await prisma.invoice.create({
    data: {
      orgId: org.id,
      loadId: loadInvoiced.id,
      invoiceNumber: "WR-INV-5001",
      status: InvoiceStatus.SENT,
      totalAmount: loadInvoiced.rate,
      generatedAt: hoursAfter(loadInvoiced.deliveredAt ?? new Date(), 5),
      sentAt: hoursAfter(loadInvoiced.deliveredAt ?? new Date(), 6),
      pdfPath: path.posix.join("invoices", "WR-INV-5001.pdf"),
    },
  });
  await prisma.invoiceLineItem.create({
    data: {
      invoiceId: invoiceInvoiced.id,
      code: "LINEHAUL",
      description: "Linehaul",
      quantity: new Prisma.Decimal("1"),
      rate: loadInvoiced.rate ?? new Prisma.Decimal("0"),
      amount: loadInvoiced.rate ?? new Prisma.Decimal("0"),
    },
  });
  await fs.writeFile(path.join(ROOT_DIR, "uploads", "invoices", "WR-INV-5001.pdf"), "PDF:WR-INV-5001.pdf", "utf8");

  const invoicePaid = await prisma.invoice.create({
    data: {
      orgId: org.id,
      loadId: loadPaid.id,
      invoiceNumber: "WR-INV-5002",
      status: InvoiceStatus.PAID,
      totalAmount: loadPaid.rate,
      generatedAt: hoursAfter(loadPaid.deliveredAt ?? new Date(), 4),
      sentAt: hoursAfter(loadPaid.deliveredAt ?? new Date(), 5),
      paidAt: hoursAfter(loadPaid.deliveredAt ?? new Date(), 48),
      paymentRef: "ACH-992208",
      pdfPath: path.posix.join("invoices", "WR-INV-5002.pdf"),
    },
  });
  await prisma.invoiceLineItem.create({
    data: {
      invoiceId: invoicePaid.id,
      code: "LINEHAUL",
      description: "Linehaul",
      quantity: new Prisma.Decimal("1"),
      rate: loadPaid.rate ?? new Prisma.Decimal("0"),
      amount: loadPaid.rate ?? new Prisma.Decimal("0"),
    },
  });
  await prisma.invoicePayment.create({
    data: {
      orgId: org.id,
      loadId: loadPaid.id,
      invoiceId: invoicePaid.id,
      amountCents: centsFromDecimal(loadPaid.rate),
      method: FinancePaymentMethod.ACH,
      reference: "ACH-992208",
      notes: "Customer ACH received",
      receivedAt: hoursAfter(loadPaid.deliveredAt ?? new Date(), 48),
      createdById: billingUser.id,
    },
  });
  await fs.writeFile(path.join(ROOT_DIR, "uploads", "invoices", "WR-INV-5002.pdf"), "PDF:WR-INV-5002.pdf", "utf8");

  await prisma.note.createMany({
    data: [
      {
        orgId: org.id,
        entityType: NoteEntityType.LOAD,
        entityId: loadFtlInTransit.id,
        loadId: loadFtlInTransit.id,
        body: "Customer requested ETA update after weather delay in Amarillo corridor.",
        noteType: NoteType.OPERATIONAL,
        priority: NotePriority.IMPORTANT,
        source: "OPS",
        createdById: outboundDispatcher.id,
      },
      {
        orgId: org.id,
        entityType: NoteEntityType.LOAD,
        entityId: loadInvoiced.id,
        loadId: loadInvoiced.id,
        body: "Collections reminder scheduled for T+5 if no remittance advice.",
        noteType: NoteType.BILLING,
        priority: NotePriority.NORMAL,
        source: "OPS",
        createdById: billingUser.id,
      },
      {
        orgId: org.id,
        entityType: NoteEntityType.TRIP,
        entityId: tripLTL.id,
        loadId: loadLtl1.id,
        body: "Inbound handoff confirmed with dock team; keep reefer temp logs attached.",
        noteType: NoteType.COMPLIANCE,
        priority: NotePriority.ALERT,
        source: "OPS",
        createdById: safetyUser.id,
      },
    ],
  });

  await prisma.event.createMany({
    data: [
      {
        orgId: org.id,
        loadId: loadFtlInTransit.id,
        type: EventType.LOAD_CREATED,
        message: "Load WR-FTL-5001 created",
        userId: admin.id,
      },
      {
        orgId: org.id,
        loadId: loadFtlInTransit.id,
        type: EventType.LOAD_ASSIGNED,
        message: "Assigned Company Driver 1 / WR-TRK-001 / WR-TRL-001",
        userId: outboundDispatcher.id,
      },
      {
        orgId: org.id,
        loadId: loadLtl1.id,
        type: EventType.LOAD_ASSIGNED,
        message: "Assigned Company Driver 2 to LTL linehaul",
        userId: outboundDispatcher.id,
      },
      {
        orgId: org.id,
        loadId: loadReady.id,
        type: EventType.DOC_VERIFIED,
        message: "POD verified",
        userId: billingUser.id,
      },
      {
        orgId: org.id,
        loadId: loadInvoiced.id,
        invoiceId: invoiceInvoiced.id,
        type: EventType.INVOICE_GENERATED,
        message: "Invoice WR-INV-5001 generated",
        userId: billingUser.id,
      },
      {
        orgId: org.id,
        loadId: loadPaid.id,
        invoiceId: invoicePaid.id,
        type: EventType.INVOICE_GENERATED,
        message: "Invoice WR-INV-5002 generated",
        userId: billingUser.id,
      },
      {
        orgId: org.id,
        loadId: loadPaid.id,
        type: EventType.SETTLEMENT_PAID,
        message: "Settlement paid",
        userId: billingUser.id,
      },
    ],
  });

  await prisma.task.createMany({
    data: [
      {
        orgId: org.id,
        loadId: loadLtl2.id,
        type: "MISSING_DOC",
        title: "Collect corrected POD",
        status: "OPEN",
        priority: "HIGH",
        assignedRole: Role.DISPATCHER,
        assignedToId: inboundDispatcher.id,
        dueAt: daysFromNow(1, 10, 0),
        createdById: billingUser.id,
      },
      {
        orgId: org.id,
        loadId: loadFtlInTransit.id,
        type: "STOP_DELAY_FOLLOWUP",
        title: "Confirm revised ETA with consignee",
        status: "IN_PROGRESS",
        priority: "MED",
        assignedRole: Role.DISPATCHER,
        assignedToId: outboundDispatcher.id,
        dueAt: daysFromNow(0, 18, 0),
        createdById: supportUser.id,
      },
    ],
  });

  await prisma.dispatchException.createMany({
    data: [
      {
        orgId: org.id,
        loadId: loadFtlInTransit.id,
        tripId: tripFTL.id,
        type: "STOP_OVERDUE",
        severity: DispatchExceptionSeverity.BLOCKER,
        owner: DispatchExceptionOwner.DISPATCH,
        status: DispatchExceptionStatus.OPEN,
        title: "Stop overdue",
        detail: "Consignee arrival is trending late by 2h.",
        source: "SYSTEM",
      },
      {
        orgId: org.id,
        loadId: loadLtl2.id,
        tripId: tripLTL.id,
        type: "MISSING_POD",
        severity: DispatchExceptionSeverity.WARNING,
        owner: DispatchExceptionOwner.BILLING,
        status: DispatchExceptionStatus.OPEN,
        title: "Missing POD",
        detail: "Delivery POD was rejected and needs resubmission.",
        source: "BILLING",
      },
    ],
  });

  await prisma.loadTrackingSession.createMany({
    data: [
      {
        orgId: org.id,
        loadId: loadFtlInTransit.id,
        providerType: TrackingProviderType.PHONE,
        status: TrackingSessionStatus.ON,
        startedByUserId: outboundDispatcher.id,
        startedAt: hoursBefore(outboundPickupStart, 1),
      },
      {
        orgId: org.id,
        loadId: loadLtl1.id,
        providerType: TrackingProviderType.PHONE,
        status: TrackingSessionStatus.ON,
        startedByUserId: outboundDispatcher.id,
        startedAt: hoursBefore(ltlPickupStart, 1),
      },
      {
        orgId: org.id,
        loadId: loadLtl2.id,
        providerType: TrackingProviderType.PHONE,
        status: TrackingSessionStatus.ON,
        startedByUserId: outboundDispatcher.id,
        startedAt: hoursBefore(ltlPickupStart, 1),
      },
    ],
  });

  await prisma.locationPing.createMany({
    data: [
      {
        orgId: org.id,
        loadId: loadFtlInTransit.id,
        truckId: truckByUnit.get("WR-TRK-001")!.id,
        driverId: companyDriver.id,
        providerType: TrackingProviderType.PHONE,
        lat: new Prisma.Decimal("34.9011"),
        lng: new Prisma.Decimal("-102.3399"),
        speedMph: 57,
        heading: 32,
        capturedAt: new Date(),
      },
      {
        orgId: org.id,
        loadId: loadLtl1.id,
        truckId: truckByUnit.get("WR-TRK-002")!.id,
        driverId: companyDriver2.id,
        providerType: TrackingProviderType.PHONE,
        lat: new Prisma.Decimal("38.1200"),
        lng: new Prisma.Decimal("-110.2200"),
        speedMph: 52,
        heading: 42,
        capturedAt: new Date(),
      },
    ],
  });

  let rcInboxSeeded = false;
  const [hasInboundAlias, hasInboundEmail, hasInboundAttachment, hasLoadConfirmationDoc] = await Promise.all([
    tableExists("InboundEmailAlias"),
    tableExists("InboundEmail"),
    tableExists("InboundEmailAttachment"),
    tableExists("LoadConfirmationDocument"),
  ]);
  if (hasInboundAlias && hasInboundEmail && hasInboundAttachment && hasLoadConfirmationDoc) {
    await prisma.inboundEmailAlias.create({
      data: {
        orgId: org.id,
        address: "ratecon+wrath@inbound.haulio.us",
        isActive: true,
      },
    });
    const confirmationDoc = await prisma.loadConfirmationDocument.create({
      data: {
        orgId: org.id,
        uploadedByUserId: admin.id,
        filename: "ratecon-forwarded-wrath.pdf",
        contentType: "application/pdf",
        sizeBytes: 154000,
        storageKey: "docs/ratecon-forwarded-wrath.pdf",
        sha256: "demo-sha256-wrath-ratecon",
        status: "READY_TO_CREATE",
        extractedText: "Rate confirmation extracted and ready.",
        extractedDraft: {
          loadNumber: "WR-RC-1001",
          customerName: "Kernel Enforce Customer",
        },
      },
    });
    const inboundEmail = await prisma.inboundEmail.create({
      data: {
        orgId: org.id,
        provider: "GENERIC",
        status: "ACCEPTED",
        fromAddress: "ratecon@shipper.example.com",
        toAddresses: ["ratecon+wrath@inbound.haulio.us"],
        subject: "Rate Confirmation WR-RC-1001",
        messageId: `wrath-ratecon-${Date.now()}@mail.example.com`,
        messageDate: new Date(),
        textBody: "Please find attached rate confirmation.",
        dedupedAttachmentCount: 0,
        createdLoadConfirmationCount: 1,
      },
    });
    await prisma.inboundEmailAttachment.create({
      data: {
        inboundEmailId: inboundEmail.id,
        orgId: org.id,
        filename: "ratecon-forwarded-wrath.pdf",
        contentType: "application/pdf",
        byteSize: 154000,
        sha256: "demo-sha256-wrath-ratecon",
        storageKey: "docs/ratecon-forwarded-wrath.pdf",
        deduped: false,
        loadConfirmationDocumentId: confirmationDoc.id,
      },
    });
    await fs.writeFile(
      path.join(ROOT_DIR, "uploads", "docs", "ratecon-forwarded-wrath.pdf"),
      "PDF:ratecon-forwarded-wrath.pdf",
      "utf8"
    );
    rcInboxSeeded = true;
  } else {
    console.warn(
      `Skipping RC Inbox seed because inbound tables are missing. ` +
        `Alias=${hasInboundAlias} Email=${hasInboundEmail} Attachment=${hasInboundAttachment} LoadConfirmation=${hasLoadConfirmationDoc}`
    );
  }

  const payablePeriodStart = daysFromNow(-7, 0, 0);
  const payablePeriodEnd = daysFromNow(-1, 23, 59);

  const payableRun = await prisma.payableRun.create({
    data: {
      orgId: org.id,
      periodStart: payablePeriodStart,
      periodEnd: payablePeriodEnd,
      status: PayableRunStatus.PAID,
      createdById: billingUser.id,
      finalizedAt: daysFromNow(-1, 18, 0),
      paidAt: daysFromNow(0, 10, 0),
      previewChecksum: "wrath-demo-preview",
      finalizedChecksum: "wrath-demo-finalized",
      lineItems: {
        create: [
          {
            orgId: org.id,
            partyType: PayablePartyType.DRIVER,
            partyId: companyDriver.id,
            loadId: loadPaid.id,
            type: PayableLineItemType.EARNING,
            amountCents: 66625,
            paidMiles: new Prisma.Decimal("1025"),
            ratePerMile: new Prisma.Decimal("0.6500"),
            milesSource: PayableMilesSource.PLANNED,
            requiresReview: false,
            memo: "Company driver CPM payout",
          },
          {
            orgId: org.id,
            partyType: PayablePartyType.CARRIER,
            partyId: ownerOperatorCarrier.id,
            loadId: loadInvoiced.id,
            type: PayableLineItemType.EARNING,
            amountCents: 118000,
            paidMiles: new Prisma.Decimal("980"),
            ratePerMile: new Prisma.Decimal("1.0500"),
            milesSource: PayableMilesSource.PLANNED,
            requiresReview: false,
            memo: "Owner-operator carrier payout",
          },
        ],
      },
    },
    include: { lineItems: true },
  });

  const settlementCompany = await prisma.settlement.create({
    data: {
      orgId: org.id,
      driverId: companyDriver.id,
      periodStart: payablePeriodStart,
      periodEnd: payablePeriodEnd,
      status: SettlementStatus.PAID,
      gross: new Prisma.Decimal("666.25"),
      deductions: new Prisma.Decimal("45.00"),
      net: new Prisma.Decimal("621.25"),
      finalizedAt: daysFromNow(-1, 17, 0),
      paidAt: daysFromNow(0, 10, 0),
      items: {
        create: [
          {
            loadId: loadPaid.id,
            code: "CPM",
            description: `${loadPaid.loadNumber} CPM`,
            amount: new Prisma.Decimal("666.25"),
          },
          {
            loadId: loadPaid.id,
            code: "DEDUCTION",
            description: "Fuel advance deduction",
            amount: new Prisma.Decimal("-45.00"),
          },
        ],
      },
    },
  });

  const settlementOwnerOp = await prisma.settlement.create({
    data: {
      orgId: org.id,
      driverId: ownerOperator.id,
      periodStart: payablePeriodStart,
      periodEnd: payablePeriodEnd,
      status: SettlementStatus.PAID,
      gross: new Prisma.Decimal("1180.00"),
      deductions: new Prisma.Decimal("130.00"),
      net: new Prisma.Decimal("1050.00"),
      finalizedAt: daysFromNow(-1, 17, 15),
      paidAt: daysFromNow(0, 10, 10),
      items: {
        create: [
          {
            loadId: loadInvoiced.id,
            code: "OWNER_OP",
            description: `${loadInvoiced.loadNumber} owner-op payout`,
            amount: new Prisma.Decimal("1180.00"),
          },
          {
            loadId: loadInvoiced.id,
            code: "DEDUCTION",
            description: "Insurance escrow deduction",
            amount: new Prisma.Decimal("-130.00"),
          },
        ],
      },
    },
  });

  await prisma.moveContract.create({
    data: {
      orgId: org.id,
      code: "CPM-COMPANY",
      name: "Company Driver CPM",
      status: MoveContractStatus.ACTIVE,
      template: MoveContractTemplate.CPM,
      description: "Default CPM contract for company drivers",
      createdById: billingUser.id,
      versions: {
        create: {
          orgId: org.id,
          version: 1,
          effectiveFrom: daysFromNow(-30, 0, 0),
          scopeJson: { movementMode: "FTL", driverClass: "COMPANY" },
          rulesJson: { centsPerMile: 65 },
          previewSampleJson: { miles: 1000, payoutCents: 65000 },
          createdById: billingUser.id,
        },
      },
    },
  });

  await prisma.moveContract.create({
    data: {
      orgId: org.id,
      code: "OWNEROP-FLAT",
      name: "Owner-Operator Flat + FSC",
      status: MoveContractStatus.ACTIVE,
      template: MoveContractTemplate.HYBRID_BEST_OF,
      description: "Owner-op payout template",
      createdById: billingUser.id,
      versions: {
        create: {
          orgId: org.id,
          version: 1,
          effectiveFrom: daysFromNow(-30, 0, 0),
          scopeJson: { movementMode: "FTL", driverClass: "OWNER_OPERATOR" },
          rulesJson: { flatTripCents: 95000, fscPercent: 22 },
          previewSampleJson: { linehaulCents: 360000, payoutCents: 118000 },
          createdById: billingUser.id,
        },
      },
    },
  });

  await prisma.settlementPolicyVersion.create({
    data: {
      orgId: org.id,
      version: 1,
      effectiveFrom: daysFromNow(-30, 0, 0),
      rulesJson: {
        paymentDay: "Friday",
        requirePodForFinalization: true,
        allowManualAdjustment: true,
      },
      createdById: billingUser.id,
    },
  });

  await postJournalWithWallet({
    orgId: org.id,
    createdById: billingUser.id,
    entityType: FinanceJournalEntityType.INVOICE,
    entityId: invoiceInvoiced.id,
    eventType: FinanceJournalEventType.INVOICE_ISSUED,
    idempotencyKey: `demo-journal-invoice-issued-${invoiceInvoiced.id}`,
    lines: [
      {
        account: FinanceLedgerAccount.AR_CLEARING,
        side: FinanceJournalLineSide.DEBIT,
        amountCents: centsFromDecimal(loadInvoiced.rate),
        memo: "AR created",
      },
      {
        account: FinanceLedgerAccount.REVENUE,
        side: FinanceJournalLineSide.CREDIT,
        amountCents: centsFromDecimal(loadInvoiced.rate),
        memo: "Revenue recognized",
      },
    ],
  });

  await postJournalWithWallet({
    orgId: org.id,
    createdById: billingUser.id,
    entityType: FinanceJournalEntityType.INVOICE,
    entityId: invoicePaid.id,
    eventType: FinanceJournalEventType.INVOICE_PAYMENT_RECEIVED,
    idempotencyKey: `demo-journal-invoice-paid-${invoicePaid.id}`,
    lines: [
      {
        account: FinanceLedgerAccount.CASH_CLEARING,
        side: FinanceJournalLineSide.DEBIT,
        amountCents: centsFromDecimal(loadPaid.rate),
        memo: "Cash received",
      },
      {
        account: FinanceLedgerAccount.AR_CLEARING,
        side: FinanceJournalLineSide.CREDIT,
        amountCents: centsFromDecimal(loadPaid.rate),
        memo: "AR cleared",
      },
    ],
  });

  await postJournalWithWallet({
    orgId: org.id,
    createdById: billingUser.id,
    entityType: FinanceJournalEntityType.PAYABLE_RUN,
    entityId: payableRun.id,
    eventType: FinanceJournalEventType.PAYABLE_RUN_PAID,
    idempotencyKey: `demo-journal-payablerun-${payableRun.id}`,
    lines: [
      {
        account: FinanceLedgerAccount.DRIVER_PAYABLE,
        side: FinanceJournalLineSide.DEBIT,
        amountCents: 184625,
        memo: "Driver payable cleared by run payment",
      },
      {
        account: FinanceLedgerAccount.CASH_CLEARING,
        side: FinanceJournalLineSide.CREDIT,
        amountCents: 184625,
        memo: "Cash paid out",
      },
    ],
  });

  await postJournalWithWallet({
    orgId: org.id,
    createdById: billingUser.id,
    entityType: FinanceJournalEntityType.SETTLEMENT,
    entityId: settlementCompany.id,
    eventType: FinanceJournalEventType.SETTLEMENT_PAID,
    idempotencyKey: `demo-journal-settlement-${settlementCompany.id}`,
    lines: [
      {
        account: FinanceLedgerAccount.SETTLEMENT_EXPENSE,
        side: FinanceJournalLineSide.DEBIT,
        amountCents: 62125,
        memo: "Company driver settlement expense",
      },
      {
        account: FinanceLedgerAccount.DRIVER_PAYABLE,
        side: FinanceJournalLineSide.CREDIT,
        amountCents: 62125,
        memo: "Company driver payable accrued",
      },
    ],
  });

  await postJournalWithWallet({
    orgId: org.id,
    createdById: billingUser.id,
    entityType: FinanceJournalEntityType.SETTLEMENT,
    entityId: settlementOwnerOp.id,
    eventType: FinanceJournalEventType.SETTLEMENT_PAID,
    idempotencyKey: `demo-journal-settlement-${settlementOwnerOp.id}`,
    lines: [
      {
        account: FinanceLedgerAccount.SETTLEMENT_EXPENSE,
        side: FinanceJournalLineSide.DEBIT,
        amountCents: 105000,
        memo: "Owner-operator settlement expense",
      },
      {
        account: FinanceLedgerAccount.DRIVER_PAYABLE,
        side: FinanceJournalLineSide.CREDIT,
        amountCents: 105000,
        memo: "Owner-operator payable accrued",
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        orgId: org.id,
        userId: admin.id,
        action: "ORG_FULL_DEMO_SEED",
        entity: "Organization",
        entityId: org.id,
        summary: `Seeded full Wrath demo for ${ORG_NAME}`,
        meta: {
          teams: ["Inbound Team", "Outbound Team"],
          modes: ["FTL", "LTL"],
          apiBase: API_BASE,
        },
      },
      {
        orgId: org.id,
        userId: billingUser.id,
        action: "DEMO_PAYABLES_SEEDED",
        entity: "PayableRun",
        entityId: payableRun.id,
        summary: "Seeded company and owner-op payables demo",
      },
    ],
  });

  const outboundAssignments = [
    { entityType: TeamEntityType.DRIVER, entityId: companyDriver.id },
    { entityType: TeamEntityType.DRIVER, entityId: companyDriver2.id },
    { entityType: TeamEntityType.TRUCK, entityId: truckByUnit.get("WR-TRK-001")!.id },
    { entityType: TeamEntityType.TRUCK, entityId: truckByUnit.get("WR-TRK-002")!.id },
    { entityType: TeamEntityType.TRAILER, entityId: trailerByUnit.get("WR-TRL-001")!.id },
    { entityType: TeamEntityType.TRAILER, entityId: trailerByUnit.get("WR-TRL-002")!.id },
    { entityType: TeamEntityType.LOAD, entityId: loadFtlInTransit.id },
    { entityType: TeamEntityType.LOAD, entityId: loadLtl1.id },
    { entityType: TeamEntityType.LOAD, entityId: loadLtl2.id },
  ];
  const inboundAssignments = [
    { entityType: TeamEntityType.DRIVER, entityId: ownerOperator.id },
    { entityType: TeamEntityType.TRUCK, entityId: truckByUnit.get("WR-TRK-003")!.id },
    { entityType: TeamEntityType.TRAILER, entityId: trailerByUnit.get("WR-TRL-003")!.id },
    { entityType: TeamEntityType.LOAD, entityId: loadReady.id },
    { entityType: TeamEntityType.LOAD, entityId: loadInvoiced.id },
    { entityType: TeamEntityType.LOAD, entityId: loadPaid.id },
  ];
  await prisma.teamAssignment.createMany({
    data: [
      ...outboundAssignments.map((row) => ({ orgId: org.id, teamId: outboundTeam.id, ...row })),
      ...inboundAssignments.map((row) => ({ orgId: org.id, teamId: inboundTeam.id, ...row })),
    ],
  });

  const credentials = `# Wrath Logistics Full Demo\n\n` +
    `- Org: ${ORG_NAME}\n` +
    `- Admin: ${ADMIN_EMAIL}\n` +
    `- Password: ${ADMIN_PASSWORD}\n\n` +
    `## Team Logins\n` +
    `- head.dispatch@wrath.test / ${ADMIN_PASSWORD}\n` +
    `- dispatch.outbound@wrath.test / ${ADMIN_PASSWORD}\n` +
    `- dispatch.inbound@wrath.test / ${ADMIN_PASSWORD}\n` +
    `- billing@wrath.test / ${ADMIN_PASSWORD}\n` +
    `- safety@wrath.test / ${ADMIN_PASSWORD}\n` +
    `- support@wrath.test / ${ADMIN_PASSWORD}\n` +
    `- driver.company1@wrath.test / ${ADMIN_PASSWORD}\n` +
    `- driver.company2@wrath.test / ${ADMIN_PASSWORD}\n` +
    `- driver.ownerop1@wrath.test / ${ADMIN_PASSWORD}\n\n` +
    `## Demo Coverage\n` +
    `- Dispatch: FTL + LTL trips/shipments\n` +
    `- Teams: Inbound Team + Outbound Team\n` +
    `- Documents: RATECON, BOL, POD (verified/rejected)\n` +
    `- RC Inbox: ${
      rcInboxSeeded ? "inbound alias + forwarded ratecon attachment" : "skipped (inbound tables missing)"
    }\n` +
    `- Finance AR: Ready to invoice, invoiced, paid invoices\n` +
    `- Finance AP: Payable run paid\n` +
    `- Driver Pay: company + owner-operator settlements\n\n` +
    `## Web/API\n` +
    `- Web: http://localhost:3000\n` +
    `- API: ${API_BASE}\n`;

  await fs.writeFile(path.join(ROOT_DIR, "WRATH_FULL_DEMO_CREDENTIALS.md"), credentials, "utf8");

  const summary = {
    org: { id: org.id, name: org.name },
    users: {
      admin: admin.email,
      headDispatcher: headDispatcher.email,
      outboundDispatcher: outboundDispatcher.email,
      inboundDispatcher: inboundDispatcher.email,
      billing: billingUser.email,
      safety: safetyUser.email,
      support: supportUser.email,
    },
    teams: [outboundTeam.name, inboundTeam.name],
    trips: [tripFTL.tripNumber, tripLTL.tripNumber, tripOwnerOp.tripNumber, tripPaid.tripNumber],
    loads: Array.from(loadByNumber.keys()),
    invoices: [invoiceInvoiced.invoiceNumber, invoicePaid.invoiceNumber],
    payableRunId: payableRun.id,
    settlements: [settlementCompany.id, settlementOwnerOp.id],
    ownerOperatorCarrier: ownerOperatorCarrier.name,
    rcInboxSeeded,
    credentialsFile: "WRATH_FULL_DEMO_CREDENTIALS.md",
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

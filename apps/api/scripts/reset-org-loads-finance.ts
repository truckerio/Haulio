import {
  prisma,
  Prisma,
  Role,
  NoteEntityType,
  StopType,
  StopStatus,
  LoadStatus,
  LoadType,
  MovementMode,
  DocType,
  DocStatus,
  DocSource,
  BillingStatus,
  OperatingEntityType,
} from "@truckerio/db";

const ORG_NAME = (process.env.ORG_NAME ?? "Wrath Logistics").trim();

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: { equals: ORG_NAME, mode: "insensitive" } },
    select: { id: true, name: true },
  });

  if (!org) {
    throw new Error(`Organization not found: ${ORG_NAME}`);
  }

  const [existingLoads, defaultOpEntity, actorUser] = await Promise.all([
    prisma.load.findMany({
      where: { orgId: org.id },
      select: { id: true, loadNumber: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.operatingEntity.findFirst({
      where: { orgId: org.id, isDefault: true },
      select: { id: true, name: true },
    }),
    prisma.user.findFirst({
      where: {
        orgId: org.id,
        role: { in: [Role.ADMIN, Role.BILLING, Role.HEAD_DISPATCHER, Role.DISPATCHER] },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true },
    }),
  ]);

  const loadIds = existingLoads.map((row) => row.id);

  const [stopIds, docIds, invoiceIds, legIds] = loadIds.length
    ? await Promise.all([
        prisma.stop.findMany({ where: { loadId: { in: loadIds } }, select: { id: true } }),
        prisma.document.findMany({ where: { loadId: { in: loadIds } }, select: { id: true } }),
        prisma.invoice.findMany({ where: { loadId: { in: loadIds } }, select: { id: true } }),
        prisma.loadLeg.findMany({ where: { loadId: { in: loadIds } }, select: { id: true } }),
      ])
    : [[], [], [], []];

  await prisma.$transaction(
    async (tx) => {
      if (loadIds.length > 0) {
        const stopIdList = stopIds.map((row) => row.id);
        const docIdList = docIds.map((row) => row.id);
        const invoiceIdList = invoiceIds.map((row) => row.id);
        const legIdList = legIds.map((row) => row.id);

        await tx.tripLoad.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });
        await tx.trailerManifestItem.deleteMany({ where: { loadId: { in: loadIds } } });
        await tx.loadAssignmentMember.deleteMany({ where: { loadId: { in: loadIds } } });

        await tx.dispatchException.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });
        await tx.assignmentSuggestionLog.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });

        await tx.financeOutboxEvent.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });
        await tx.payableLineItem.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });
        await tx.settlementItem.deleteMany({ where: { loadId: { in: loadIds } } });

        await tx.invoicePayment.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });
        await tx.billingSubmission.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });
        await tx.invoiceLineItem.deleteMany({ where: { invoice: { orgId: org.id, loadId: { in: loadIds } } } });
        await tx.invoice.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });

        await tx.accessorial.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });
        await tx.storageRecord.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });
        await tx.loadCharge.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });

        await tx.loadTrackingSession.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });
        await tx.locationPing.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });

        const eventOr: Prisma.EventWhereInput[] = [{ loadId: { in: loadIds } }];
        if (stopIdList.length) eventOr.push({ stopId: { in: stopIdList } });
        if (docIdList.length) eventOr.push({ docId: { in: docIdList } });
        if (invoiceIdList.length) eventOr.push({ invoiceId: { in: invoiceIdList } });
        if (legIdList.length) eventOr.push({ legId: { in: legIdList } });
        await tx.event.deleteMany({ where: { orgId: org.id, OR: eventOr } });

        const taskOr: Prisma.TaskWhereInput[] = [{ loadId: { in: loadIds } }];
        if (stopIdList.length) taskOr.push({ stopId: { in: stopIdList } });
        if (docIdList.length) taskOr.push({ docId: { in: docIdList } });
        if (invoiceIdList.length) taskOr.push({ invoiceId: { in: invoiceIdList } });
        await tx.task.deleteMany({ where: { orgId: org.id, OR: taskOr } });

        const noteOr: Prisma.NoteWhereInput[] = [
          { loadId: { in: loadIds } },
          { entityType: NoteEntityType.LOAD, entityId: { in: loadIds } },
        ];
        if (stopIdList.length) noteOr.push({ stopId: { in: stopIdList } });
        await tx.note.deleteMany({ where: { orgId: org.id, OR: noteOr } });

        await tx.document.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });
        await tx.stop.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });
        await tx.loadLeg.deleteMany({ where: { orgId: org.id, loadId: { in: loadIds } } });

        await tx.loadConfirmationDocument.updateMany({
          where: { orgId: org.id, createdLoadId: { in: loadIds } },
          data: { createdLoadId: null },
        });

        await tx.load.deleteMany({ where: { orgId: org.id, id: { in: loadIds } } });
      }

      let operatingEntityId = defaultOpEntity?.id;
      if (!operatingEntityId) {
        const createdOp = await tx.operatingEntity.create({
          data: {
            orgId: org.id,
            name: `${org.name} Carrier`,
            type: OperatingEntityType.CARRIER,
            isDefault: true,
          },
          select: { id: true },
        });
        operatingEntityId = createdOp.id;
      }

      const customer = await tx.customer.upsert({
        where: { orgId_name: { orgId: org.id, name: "Finance Test Customer" } },
        update: { termsDays: 30 },
        create: {
          orgId: org.id,
          name: "Finance Test Customer",
          billingEmail: "ap@financetest.customer",
          termsDays: 30,
        },
        select: { id: true, name: true },
      });

      const now = new Date();
      const pickupAt = new Date(now.getTime() - 36 * 60 * 60 * 1000);
      const deliveryAt = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      const loadNumber = `FIN-TEST-${Date.now().toString().slice(-8)}`;

      const load = await tx.load.create({
        data: {
          orgId: org.id,
          operatingEntityId: operatingEntityId!,
          loadNumber,
          status: LoadStatus.DELIVERED,
          loadType: LoadType.COMPANY,
          movementMode: MovementMode.FTL,
          customerId: customer.id,
          customerName: customer.name,
          customerRef: `REF-${Date.now().toString().slice(-6)}`,
          miles: 812,
          rate: new Prisma.Decimal("2750.00"),
          plannedAt: pickupAt,
          deliveredAt: deliveryAt,
          completedAt: deliveryAt,
          billingStatus: BillingStatus.BLOCKED,
          createdById: actorUser?.id,
        },
        select: { id: true, loadNumber: true },
      });

      const pickupStop = await tx.stop.create({
        data: {
          orgId: org.id,
          loadId: load.id,
          type: StopType.PICKUP,
          status: StopStatus.DEPARTED,
          name: "Finance Test Pickup",
          address: "100 Test Park",
          city: "Austin",
          state: "TX",
          zip: "73301",
          sequence: 1,
          appointmentStart: new Date(pickupAt.getTime() - 60 * 60 * 1000),
          appointmentEnd: new Date(pickupAt.getTime() + 60 * 60 * 1000),
          arrivedAt: new Date(pickupAt.getTime() - 30 * 60 * 1000),
          departedAt: pickupAt,
        },
        select: { id: true },
      });

      const deliveryStop = await tx.stop.create({
        data: {
          orgId: org.id,
          loadId: load.id,
          type: StopType.DELIVERY,
          status: StopStatus.DEPARTED,
          name: "Finance Test Delivery",
          address: "200 Audit Ave",
          city: "Dallas",
          state: "TX",
          zip: "75201",
          sequence: 2,
          appointmentStart: new Date(deliveryAt.getTime() - 90 * 60 * 1000),
          appointmentEnd: new Date(deliveryAt.getTime() + 30 * 60 * 1000),
          arrivedAt: new Date(deliveryAt.getTime() - 20 * 60 * 1000),
          departedAt: deliveryAt,
        },
        select: { id: true },
      });

      await tx.document.createMany({
        data: [
          {
            orgId: org.id,
            loadId: load.id,
            stopId: deliveryStop.id,
            type: DocType.POD,
            status: DocStatus.VERIFIED,
            source: DocSource.OPS_UPLOAD,
            filename: `${load.loadNumber}-pod.pdf`,
            originalName: `${load.loadNumber}-pod.pdf`,
            mimeType: "application/pdf",
            size: 1024,
            uploadedById: actorUser?.id,
            uploadedAt: new Date(deliveryAt.getTime() + 5 * 60 * 1000),
            verifiedById: actorUser?.id,
            verifiedAt: new Date(deliveryAt.getTime() + 10 * 60 * 1000),
          },
          {
            orgId: org.id,
            loadId: load.id,
            stopId: pickupStop.id,
            type: DocType.BOL,
            status: DocStatus.VERIFIED,
            source: DocSource.OPS_UPLOAD,
            filename: `${load.loadNumber}-bol.pdf`,
            originalName: `${load.loadNumber}-bol.pdf`,
            mimeType: "application/pdf",
            size: 980,
            uploadedById: actorUser?.id,
            uploadedAt: new Date(pickupAt.getTime() + 5 * 60 * 1000),
            verifiedById: actorUser?.id,
            verifiedAt: new Date(pickupAt.getTime() + 10 * 60 * 1000),
          },
        ],
      });

      console.log(
        JSON.stringify(
          {
            org: { id: org.id, name: org.name },
            deletedLoads: existingLoads.length,
            deletedLoadNumbers: existingLoads.map((row) => row.loadNumber),
            createdLoad: {
              id: load.id,
              loadNumber: load.loadNumber,
              status: LoadStatus.DELIVERED,
              docs: ["POD:VERIFIED", "BOL:VERIFIED"],
            },
          },
          null,
          2,
        ),
      );
    },
    { timeout: 120_000 },
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

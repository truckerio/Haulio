import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import { prisma } from "@truckerio/db";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "packages", "db", ".env"),
];

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
}

async function main() {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    throw new Error("No organization found. Run demo seed first.");
  }

  const adminUser = await prisma.user.findFirst({
    where: { orgId: org.id, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });

  const operatingEntity =
    (await prisma.operatingEntity.findFirst({ where: { orgId: org.id, isDefault: true } })) ??
    (await prisma.operatingEntity.create({
      data: {
        orgId: org.id,
        name: org.name,
        type: "CARRIER",
        remitToName: org.name,
        isDefault: true,
      },
    }));

  const customer =
    (await prisma.customer.findFirst({ where: { orgId: org.id, name: "E2E Customer" } })) ??
    (await prisma.customer.create({ data: { orgId: org.id, name: "E2E Customer" } }));

  const loadNumber = `E2E-${Date.now()}`;
  const load = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber,
      loadType: "COMPANY",
      operatingEntityId: operatingEntity.id,
      customerId: customer.id,
      customerName: customer.name,
      shipperReferenceNumber: "SREF1",
      consigneeReferenceNumber: "CREF1",
      palletCount: 10,
      weightLbs: 40000,
      createdById: adminUser?.id ?? null,
      stops: {
        create: [
          {
            orgId: org.id,
            type: "PICKUP",
            name: "E2E Shipper",
            address: "100 Test St",
            city: "Austin",
            state: "TX",
            zip: "78701",
            sequence: 1,
          },
          {
            orgId: org.id,
            type: "DELIVERY",
            name: "E2E Consignee",
            address: "200 Test Ave",
            city: "Dallas",
            state: "TX",
            zip: "75201",
            sequence: 2,
          },
        ],
      },
    },
    include: { operatingEntity: true },
  });

  const verify = await prisma.load.findFirst({
    where: { id: load.id },
    select: {
      id: true,
      loadNumber: true,
      loadType: true,
      operatingEntityId: true,
      shipperReferenceNumber: true,
      consigneeReferenceNumber: true,
      palletCount: true,
      weightLbs: true,
    },
  });

  const doc = await prisma.loadConfirmationDocument.create({
    data: {
      orgId: org.id,
      uploadedByUserId: adminUser?.id ?? null,
      filename: "e2e-confirmation.pdf",
      contentType: "application/pdf",
      sizeBytes: 12345,
      storageKey: "e2e/confirmations/e2e-confirmation.pdf",
      sha256: crypto.createHash("sha256").update(loadNumber).digest("hex"),
      status: "UPLOADED",
    },
  });

  console.log("E2E write complete");
  console.log(`- loadId: ${verify?.id}`);
  console.log(`- loadNumber: ${verify?.loadNumber}`);
  console.log(`- loadType: ${verify?.loadType}`);
  console.log(`- operatingEntityId: ${verify?.operatingEntityId}`);
  console.log(`- shipperReferenceNumber: ${verify?.shipperReferenceNumber}`);
  console.log(`- consigneeReferenceNumber: ${verify?.consigneeReferenceNumber}`);
  console.log(`- palletCount: ${verify?.palletCount}`);
  console.log(`- weightLbs: ${verify?.weightLbs}`);
  console.log(`- confirmationDocId: ${doc.id}`);
  console.log(`- confirmationStatus: ${doc.status}`);
}

main()
  .catch((error) => {
    console.error("Error:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

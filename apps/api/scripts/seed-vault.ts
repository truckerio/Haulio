import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { prisma, VaultDocType, VaultScopeType } from "@truckerio/db";
import { ensureUploadDirs, resolveUploadPath } from "../src/lib/uploads";

type SeedDoc = {
  docType: VaultDocType;
  scopeType: VaultScopeType;
  scopeId?: string | null;
  expiresAt?: Date | null;
  referenceNumber?: string | null;
  notes?: string | null;
  label: string;
};

async function createVaultDoc(params: {
  orgId: string;
  uploadedById: string | null;
  doc: SeedDoc;
}) {
  const id = crypto.randomUUID();
  const filename = `${params.doc.docType.toLowerCase()}-${id.slice(0, 8)}.txt`;
  const storageKey = path.posix.join("org", params.orgId, "vault", id, filename);
  const filePath = resolveUploadPath(storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = `Haulio Vault Sample\nType: ${params.doc.docType}\nLabel: ${params.doc.label}\n`;
  await fs.writeFile(filePath, content, "utf8");

  const record = await prisma.vaultDocument.create({
    data: {
      id,
      orgId: params.orgId,
      scopeType: params.doc.scopeType,
      scopeId: params.doc.scopeId ?? null,
      docType: params.doc.docType,
      filename,
      originalName: filename,
      mimeType: "text/plain",
      size: Buffer.byteLength(content),
      storageKey,
      expiresAt: params.doc.expiresAt ?? null,
      referenceNumber: params.doc.referenceNumber ?? null,
      notes: params.doc.notes ?? null,
      uploadedById: params.uploadedById,
    },
  });

  return record;
}

async function run() {
  await ensureUploadDirs();
  const orgId = process.env.ORG_ID;
  const org = orgId
    ? await prisma.organization.findFirst({
        where: { id: orgId },
        include: { users: true, trucks: true, drivers: true },
      })
    : await prisma.organization.findFirst({
        include: { users: true, trucks: true, drivers: true },
        orderBy: { createdAt: "asc" },
      });
  if (!org) {
    throw new Error("No organization found. Provide ORG_ID or seed an org first.");
  }
  const admin = org.users.find((user) => user.role === "ADMIN") ?? org.users[0] ?? null;
  const truck = org.trucks[0] ?? null;
  const driver = org.drivers[0] ?? null;

  const soon = new Date();
  soon.setDate(soon.getDate() + 14);
  const expired = new Date();
  expired.setDate(expired.getDate() - 10);
  const future = new Date();
  future.setDate(future.getDate() + 120);

  const docs: SeedDoc[] = [
    {
      docType: VaultDocType.INSURANCE,
      scopeType: VaultScopeType.ORG,
      expiresAt: soon,
      referenceNumber: "POL-INS-2042",
      label: "Company insurance (expiring soon)",
    },
    {
      docType: VaultDocType.CARGO_INSURANCE,
      scopeType: VaultScopeType.ORG,
      expiresAt: null,
      referenceNumber: "CARGO-9912",
      label: "Cargo insurance (needs details)",
      notes: "Expiry missing for demo.",
    },
    {
      docType: VaultDocType.IFTA,
      scopeType: VaultScopeType.ORG,
      expiresAt: future,
      label: "IFTA filing",
    },
  ];

  if (truck) {
    docs.push({
      docType: VaultDocType.REGISTRATION,
      scopeType: VaultScopeType.TRUCK,
      scopeId: truck.id,
      expiresAt: expired,
      label: `Truck ${truck.unit} registration (expired)`,
    });
  }

  if (driver) {
    docs.push({
      docType: VaultDocType.PERMIT,
      scopeType: VaultScopeType.DRIVER,
      scopeId: driver.id,
      expiresAt: null,
      label: `Driver ${driver.name ?? "driver"} permit`,
    });
  }

  const created = [];
  for (const doc of docs) {
    const record = await createVaultDoc({
      orgId: org.id,
      uploadedById: admin?.id ?? null,
      doc,
    });
    created.push({ id: record.id, docType: record.docType, scopeType: record.scopeType });
  }

  console.log(`Seeded ${created.length} vault documents for org ${org.name}.`);
  created.forEach((doc) => {
    console.log(`- ${doc.docType} (${doc.scopeType}) ${doc.id}`);
  });
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

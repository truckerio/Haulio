import path from "path";
import fs from "fs";
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
  const [dbRow] = await prisma.$queryRaw<{ current_database: string }[]>`
    SELECT current_database() AS current_database
  `;
  const [userRow] = await prisma.$queryRaw<{ current_user: string }[]>`
    SELECT current_user AS current_user
  `;
  let serverVersion: string | null = null;
  try {
    const [versionRow] = await prisma.$queryRaw<{ server_version: string }[]>`
      SHOW server_version
    `;
    serverVersion = versionRow?.server_version ?? null;
  } catch {
    serverVersion = null;
  }

  const [loadCount, confirmationCount, operatingEntityCount, org] = await Promise.all([
    prisma.load.count(),
    prisma.loadConfirmationDocument.count(),
    prisma.operatingEntity.count(),
    prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);

  console.log("DB Identity");
  console.log(`- database: ${dbRow?.current_database ?? "unknown"}`);
  console.log(`- user: ${userRow?.current_user ?? "unknown"}`);
  if (serverVersion) {
    console.log(`- serverVersion: ${serverVersion}`);
  }
  console.log("Counts");
  console.log(`- loads: ${loadCount}`);
  console.log(`- loadConfirmations: ${confirmationCount}`);
  console.log(`- operatingEntities: ${operatingEntityCount}`);
  if (org) {
    console.log(`- org: ${org.name} (${org.id})`);
  } else {
    console.log("- org: <none>");
  }
}

main()
  .catch((error) => {
    console.error("Error:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

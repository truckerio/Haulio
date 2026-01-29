import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { prisma } from "@truckerio/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../..");

const ORG_NAME = "Haulio Workspace";
const ADMIN_EMAIL = "admin@demo.test";
const PASSWORD = "demo1234";

async function findOrCreateOrg(name: string) {
  const existing = await prisma.organization.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.organization.create({ data: { name } });
}

async function upsertUser(orgId: string, email: string, role: "ADMIN", name: string, passwordHash: string) {
  return prisma.user.upsert({
    where: { orgId_email: { orgId, email } },
    update: { role, name, isActive: true },
    create: { orgId, email, role, name, passwordHash },
  });
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const org = await findOrCreateOrg(ORG_NAME);
  await upsertUser(org.id, ADMIN_EMAIL, "ADMIN", "Workspace Admin", passwordHash);

  const creds = `# Haulio Credentials\n\n## Workspace\n- Admin: ${ADMIN_EMAIL} / ${PASSWORD}\n\n## URLs\n- Web: ${process.env.WEB_ORIGIN || "http://localhost:3000"}\n- API: ${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000"}\n`;

  await fs.writeFile(path.join(ROOT_DIR, "DEMO_CREDENTIALS.md"), creds, "utf8");
  console.log("Seed complete. Workspace is empty and ready for onboarding.");
  console.log(creds);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

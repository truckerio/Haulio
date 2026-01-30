import "../src/lib/env";
import { prisma } from "@truckerio/db";
import { generateSetupCode } from "../src/lib/setup-codes";

async function createSetupCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateSetupCode(20);
    try {
      await prisma.setupCode.create({ data: { code } });
      return code;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("unique")) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Failed to generate a unique setup code. Try again.");
}

createSetupCode()
  .then((code) => {
    console.log(code);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

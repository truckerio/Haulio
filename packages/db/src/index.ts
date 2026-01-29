import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

prisma.$use(async (params, next) => {
  const allowAuditLogDelete = process.env.ALLOW_AUDIT_LOG_DELETE === "true";
  if (
    !allowAuditLogDelete &&
    params.model === "AuditLog" &&
    ["update", "updateMany", "delete", "deleteMany"].includes(params.action)
  ) {
    throw new Error("AuditLog is append-only");
  }
  return next(params);
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export * from "./money";

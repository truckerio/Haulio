import { prisma, Prisma } from "@truckerio/db";

export async function logAudit(params: {
  orgId: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  meta?: Prisma.InputJsonValue;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}) {
  await prisma.auditLog.create({
    data: {
      orgId: params.orgId,
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      summary: params.summary,
      meta: params.meta ?? Prisma.JsonNull,
      before: params.before ?? Prisma.JsonNull,
      after: params.after ?? Prisma.JsonNull,
    },
  });
}

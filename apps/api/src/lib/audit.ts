import { prisma } from "@truckerio/db";

export async function logAudit(params: {
  orgId: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      orgId: params.orgId,
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      summary: params.summary,
      meta: params.meta ?? null,
    },
  });
}

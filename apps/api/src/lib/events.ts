import { prisma, EventType } from "@truckerio/db";

export async function createEvent(params: {
  orgId: string;
  loadId?: string | null;
  userId?: string | null;
  stopId?: string | null;
  legId?: string | null;
  docId?: string | null;
  taskId?: string | null;
  invoiceId?: string | null;
  customerId?: string | null;
  type: EventType;
  message: string;
  meta?: Record<string, unknown>;
}) {
  await prisma.event.create({
    data: {
      orgId: params.orgId,
      loadId: params.loadId ?? null,
      stopId: params.stopId ?? null,
      legId: params.legId ?? null,
      docId: params.docId ?? null,
      taskId: params.taskId ?? null,
      invoiceId: params.invoiceId ?? null,
      customerId: params.customerId ?? null,
      userId: params.userId ?? null,
      type: params.type,
      message: params.message,
      meta: params.meta ?? null,
    },
  });
}

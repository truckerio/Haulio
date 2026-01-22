import { prisma, TaskPriority, TaskStatus, TaskType, Role, Prisma, toDecimal } from "@truckerio/db";
import { createEvent } from "./events";

export async function createTask(params: {
  orgId: string;
  title: string;
  type: TaskType;
  loadId?: string | null;
  stopId?: string | null;
  docId?: string | null;
  driverId?: string | null;
  invoiceId?: string | null;
  customerId?: string | null;
  priority?: TaskPriority;
  dueAt?: Date | null;
  assignedRole?: Role | null;
  assignedToId?: string | null;
  createdById?: string | null;
  dedupeKey?: string | null;
}) {
  const dedupeKey = params.dedupeKey?.trim() || null;
  const task = await prisma.task.create({
    data: {
      orgId: params.orgId,
      loadId: params.loadId ?? null,
      stopId: params.stopId ?? null,
      docId: params.docId ?? null,
      driverId: params.driverId ?? null,
      invoiceId: params.invoiceId ?? null,
      customerId: params.customerId ?? null,
      dedupeKey,
      type: params.type,
      title: params.title,
      priority: params.priority ?? "MED",
      dueAt: params.dueAt ?? null,
      assignedRole: params.assignedRole ?? null,
      assignedToId: params.assignedToId ?? null,
      createdById: params.createdById ?? null,
    },
  });
  await createEvent({
    orgId: params.orgId,
    loadId: params.loadId ?? null,
    type: "TASK_CREATED",
    message: params.title,
    taskId: task.id,
    meta: { taskId: task.id, type: params.type },
  });
  return task;
}

export async function ensureTask(params: {
  orgId: string;
  title: string;
  type: TaskType;
  loadId?: string | null;
  stopId?: string | null;
  docId?: string | null;
  driverId?: string | null;
  invoiceId?: string | null;
  customerId?: string | null;
  priority?: TaskPriority;
  dueAt?: Date | null;
  assignedRole?: Role | null;
  assignedToId?: string | null;
  createdById?: string | null;
  dedupeKey?: string | null;
}) {
  const dedupeKey = params.dedupeKey?.trim() || null;
  if (dedupeKey) {
    return prisma.task.upsert({
      where: {
        orgId_dedupeKey: {
          orgId: params.orgId,
          dedupeKey,
        },
      },
      create: {
        orgId: params.orgId,
        loadId: params.loadId ?? null,
        stopId: params.stopId ?? null,
        docId: params.docId ?? null,
        driverId: params.driverId ?? null,
        invoiceId: params.invoiceId ?? null,
        customerId: params.customerId ?? null,
        dedupeKey,
        type: params.type,
        title: params.title,
        priority: params.priority ?? "MED",
        dueAt: params.dueAt ?? null,
        assignedRole: params.assignedRole ?? null,
        assignedToId: params.assignedToId ?? null,
        createdById: params.createdById ?? null,
      },
      update: {},
    });
  }
  const existing = await prisma.task.findFirst({
    where: {
      orgId: params.orgId,
      loadId: params.loadId ?? undefined,
      type: params.type,
      title: params.title,
      status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
    },
  });
  if (existing) {
    return existing;
  }
  return createTask(params);
}

export async function completeTask(taskId: string, orgId: string, completedById?: string | null) {
  const existing = await prisma.task.findFirst({
    where: { id: taskId, orgId },
  });
  if (!existing) {
    throw new Error("Task not found");
  }
  const task = await prisma.task.update({
    where: { id: existing.id },
    data: {
      status: TaskStatus.DONE,
      completedAt: new Date(),
      completedById: completedById ?? null,
    },
  });
  await createEvent({
    orgId: task.orgId,
    loadId: task.loadId,
    type: "TASK_DONE",
    message: task.title,
    taskId: task.id,
    meta: { taskId: task.id },
  });
  return task;
}

export function calculateStorageCharge(params: {
  checkInAt: Date;
  checkOutAt: Date;
  freeMinutes: number;
  ratePerDay: number | Prisma.Decimal;
}) {
  const dwellMinutes = Math.max(0, Math.round((params.checkOutAt.getTime() - params.checkInAt.getTime()) / 60000));
  const billableMinutes = Math.max(0, dwellMinutes - params.freeMinutes);
  const billableDays = Math.ceil(billableMinutes / (60 * 24));
  const rate = toDecimal(params.ratePerDay) ?? new Prisma.Decimal(0);
  const suggestedCharge = rate.mul(billableDays);
  return { dwellMinutes, suggestedCharge };
}

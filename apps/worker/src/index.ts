import "./lib/env";
import {
  prisma,
  TaskPriority,
  TaskStatus,
  TaskType,
  InvoiceStatus,
  StopType,
  LoadStatus,
  DocStatus,
} from "@truckerio/db";
import { processLoadConfirmations } from "./load-confirmations";

const parseTermsDays = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(\\d+)/);
  return match ? Number(match[1]) : null;
};

async function completeTaskSystem(params: {
  taskId: string;
  orgId: string;
  loadId?: string | null;
  title: string;
  reason: string;
}) {
  const updated = await prisma.task.updateMany({
    where: {
      id: params.taskId,
      orgId: params.orgId,
      status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
    },
    data: {
      status: TaskStatus.DONE,
      completedAt: new Date(),
      completedById: null,
    },
  });
  if (updated.count === 0) return false;
  await prisma.event.create({
    data: {
      orgId: params.orgId,
      loadId: params.loadId ?? null,
      type: "TASK_DONE",
      message: params.title,
      taskId: params.taskId,
      meta: { taskId: params.taskId, reason: params.reason, system: true },
    },
  });
  return true;
}

async function ensureMissingPodTasks() {
  const orgs = await prisma.organization.findMany({ include: { settings: true } });
  for (const org of orgs) {
    if (!org.settings) continue;
    const thresholdMinutes = org.settings.missingPodAfterMinutes;

    const loads = await prisma.load.findMany({
      where: {
        orgId: org.id,
        status: "DELIVERED",
        podVerifiedAt: null,
      },
      include: { stops: true, tasks: true, docs: true },
    });

    for (const load of loads) {
      const deliveryStop = load.stops.find((stop) => stop.type === StopType.DELIVERY);
      if (!deliveryStop?.arrivedAt) continue;
      const hasVerifiedPod = load.docs.some((doc) => doc.type === "POD" && doc.status === "VERIFIED");
      if (hasVerifiedPod) continue;

      const elapsed = Date.now() - new Date(deliveryStop.arrivedAt).getTime();
      if (elapsed < thresholdMinutes * 60 * 1000) continue;

      const dedupeKey = `MISSING_DOC:POD:load:${load.id}`;
      const task = await prisma.task.upsert({
        where: { orgId_dedupeKey: { orgId: org.id, dedupeKey } },
        create: {
          orgId: org.id,
          loadId: load.id,
          stopId: deliveryStop.id,
          type: TaskType.MISSING_DOC,
          title: "Missing POD",
          priority: TaskPriority.HIGH,
          assignedRole: "BILLING",
          dueAt: new Date(),
          dedupeKey,
        },
        update: {},
      });
      await prisma.event.create({
        data: {
          orgId: org.id,
          loadId: load.id,
          type: "TASK_CREATED",
          message: "Missing POD",
          taskId: task.id,
          meta: { taskId: task.id, type: TaskType.MISSING_DOC },
        },
      });
    }
  }
}

async function cleanupMissingPodTasks() {
  const tasks = await prisma.task.findMany({
    where: {
      type: TaskType.MISSING_DOC,
      status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
      dedupeKey: { contains: "MISSING_DOC:POD:" },
    },
    include: {
      load: {
        select: {
          id: true,
          orgId: true,
          status: true,
          podVerifiedAt: true,
          docs: { select: { type: true, status: true } },
        },
      },
    },
  });

  for (const task of tasks) {
    const load = task.load;
    if (!load) {
      await completeTaskSystem({
        taskId: task.id,
        orgId: task.orgId,
        title: task.title,
        reason: "load_missing",
      });
      continue;
    }
    if (load.orgId !== task.orgId) continue;

    const terminalStatus = [LoadStatus.INVOICED, LoadStatus.PAID, LoadStatus.CANCELLED].includes(load.status);
    const hasVerifiedPod =
      Boolean(load.podVerifiedAt) ||
      load.docs.some((doc) => doc.type === "POD" && doc.status === DocStatus.VERIFIED);

    if (terminalStatus || hasVerifiedPod) {
      const reason = terminalStatus ? `load_${load.status.toLowerCase()}` : "pod_verified";
      await completeTaskSystem({
        taskId: task.id,
        orgId: task.orgId,
        loadId: load.id,
        title: task.title,
        reason,
      });
    }
  }
}

async function ensureInvoiceAgingTasks() {
  const orgs = await prisma.organization.findMany({ include: { settings: true } });
  for (const org of orgs) {
    const settings = org.settings;
    const invoices = await prisma.invoice.findMany({
      where: {
        orgId: org.id,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.ACCEPTED, InvoiceStatus.DISPUTED, InvoiceStatus.SHORT_PAID] },
      },
      include: { load: { include: { customer: true, tasks: true } } },
    });
    for (const invoice of invoices) {
      const termsDays =
        invoice.load.customer?.termsDays ??
        settings?.invoiceTermsDays ??
        parseTermsDays(settings?.invoiceTerms ?? "") ??
        30;
      const sentAt = invoice.sentAt ?? invoice.generatedAt;
      const dueAt = new Date(sentAt);
      dueAt.setDate(dueAt.getDate() + termsDays);
      if (dueAt.getTime() > Date.now()) continue;
      const dedupeKey = `PAYMENT_FOLLOWUP:invoice:${invoice.id}`;
      const task = await prisma.task.upsert({
        where: { orgId_dedupeKey: { orgId: org.id, dedupeKey } },
        create: {
          orgId: org.id,
          loadId: invoice.loadId,
          invoiceId: invoice.id,
          type: TaskType.PAYMENT_FOLLOWUP,
          title: `Payment follow-up for ${invoice.invoiceNumber}`,
          priority: TaskPriority.MED,
          assignedRole: "BILLING",
          dueAt,
          dedupeKey,
        },
        update: {},
      });
      await prisma.event.create({
        data: {
          orgId: org.id,
          loadId: invoice.loadId,
          type: "TASK_CREATED",
          message: "Payment follow-up",
          taskId: task.id,
          meta: { taskId: task.id, invoiceId: invoice.id },
        },
      });
    }
  }
}

async function ensureComplianceTasks() {
  const orgs = await prisma.organization.findMany({ include: { settings: true } });
  for (const org of orgs) {
    const drivers = await prisma.driver.findMany({
      where: { orgId: org.id },
      include: { loads: true, org: true, legs: true },
    });
    for (const driver of drivers) {
      const soon = new Date();
      soon.setDate(soon.getDate() + 30);
      const expiring =
        (driver.licenseExpiresAt && driver.licenseExpiresAt <= soon) ||
        (driver.medCardExpiresAt && driver.medCardExpiresAt <= soon);
      if (!expiring) continue;
      const dedupeKey = `DRIVER_COMPLIANCE_EXPIRING:driver:${driver.id}`;
      const task = await prisma.task.upsert({
        where: { orgId_dedupeKey: { orgId: org.id, dedupeKey } },
        create: {
          orgId: org.id,
          driverId: driver.id,
          type: TaskType.DRIVER_COMPLIANCE_EXPIRING,
          title: `Compliance expiring for ${driver.name}`,
          priority: TaskPriority.HIGH,
          assignedRole: "DISPATCHER",
          dueAt: soon,
          dedupeKey,
        },
        update: {},
      });
      await prisma.event.create({
        data: {
          orgId: org.id,
          type: "TASK_CREATED",
          message: "Driver compliance expiring",
          taskId: task.id,
          meta: { taskId: task.id, driverId: driver.id },
        },
      });
    }
  }
}

let lastLearningPruneAt: number | null = null;

async function pruneLearningExamples() {
  const orgDomains = await prisma.learningExample.findMany({
    select: { orgId: true, domain: true },
    distinct: ["orgId", "domain"],
  });

  for (const entry of orgDomains) {
    const excess = await prisma.learningExample.findMany({
      where: { orgId: entry.orgId, domain: entry.domain },
      orderBy: { createdAt: "desc" },
      skip: 500,
      select: { id: true },
    });
    if (excess.length > 0) {
      await prisma.learningExample.deleteMany({
        where: { id: { in: excess.map((row) => row.id) } },
      });
    }
  }

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await prisma.learnedMapping.deleteMany({
    where: {
      count: { lte: 1 },
      updatedAt: { lt: cutoff },
    },
  });
}

async function runLoop() {
  try {
    await ensureMissingPodTasks();
    await cleanupMissingPodTasks();
    await ensureInvoiceAgingTasks();
    await ensureComplianceTasks();
    await processLoadConfirmations();
    if (!lastLearningPruneAt || Date.now() - lastLearningPruneAt > 24 * 60 * 60 * 1000) {
      await pruneLearningExamples();
      lastLearningPruneAt = Date.now();
    }
  } catch (error) {
    console.error("Worker error", error);
  }
}

console.log("Worker started");
runLoop();
setInterval(runLoop, 60 * 1000);

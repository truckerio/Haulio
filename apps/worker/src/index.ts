import "dotenv/config";
import { prisma, TaskPriority, TaskType, InvoiceStatus, StopType } from "@truckerio/db";

const parseTermsDays = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(\\d+)/);
  return match ? Number(match[1]) : null;
};

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

async function runLoop() {
  try {
    await ensureMissingPodTasks();
    await ensureInvoiceAgingTasks();
    await ensureComplianceTasks();
  } catch (error) {
    console.error("Worker error", error);
  }
}

console.log("Worker started");
runLoop();
setInterval(runLoop, 60 * 1000);

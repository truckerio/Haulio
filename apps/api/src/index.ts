import "dotenv/config";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import fsPromises from "fs/promises";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { parse } from "cookie";
import { z } from "zod";
import multer from "multer";
import { addDays, endOfISOWeek, format, getISOWeek, getISOWeekYear, startOfISOWeek } from "date-fns";
import {
  prisma,
  DocStatus,
  DocType,
  DriverDocType,
  LoadStatus,
  StopType,
  LegType,
  LegStatus,
  ManifestStatus,
  EventType,
  TaskPriority,
  TaskStatus,
  TaskType,
  InvoiceStatus,
  Permission,
  Role,
  Prisma,
  SettlementStatus,
  add,
  formatUSD,
  mul,
  toDecimal,
  toDecimalFixed,
} from "@truckerio/db";
import { createSession, setSessionCookie, clearSessionCookie, requireAuth, destroySession } from "./lib/auth";
import { createCsrfToken, setCsrfCookie, requireCsrf } from "./lib/csrf";
import { requireRole } from "./lib/rbac";
import { upload, saveDocumentFile, ensureUploadDirs, getUploadDir, resolveUploadPath, toRelativeUploadPath } from "./lib/uploads";
import { logAudit } from "./lib/audit";
import { createEvent } from "./lib/events";
import { completeTask, calculateStorageCharge, ensureTask } from "./lib/tasks";
import { generateInvoicePdf } from "./lib/invoice";
import { generatePacketZip } from "./lib/packet";
import { hasPermission, requirePermission } from "./lib/permissions";
import { requireOrgEntity } from "./lib/tenant";
import path from "path";

const app = express();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const parseTermsDays = (terms?: string | null) => {
  if (!terms) return null;
  const match = terms.match(/(\\d+)/);
  return match ? Number(match[1]) : null;
};

const RESET_TOKEN_TTL_MINUTES = 60;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

app.use(helmet());
app.use(
  cors({
    origin: process.env.WEB_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  req.cookies = parse(req.headers.cookie || "");
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

app.post("/auth/login", loginLimiter, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const users = await prisma.user.findMany({ where: { email: parsed.data.email } });
  if (users.length === 0) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (users.length > 1) {
    res.status(400).json({ error: "Multiple orgs found for this email. Ask your admin to reset login." });
    return;
  }
  const user = users[0];
  if (!user.isActive) {
    res.status(403).json({ error: "User is inactive" });
    return;
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ipAddress =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;
  const session = await createSession({ userId: user.id, ipAddress, userAgent: userAgent ? String(userAgent) : null });
  setSessionCookie(res, session.token, session.expiresAt);
  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);
  await prisma.user.updateMany({
    where: { id: user.id, orgId: user.orgId },
    data: { lastLoginAt: new Date() },
  });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      permissions: user.permissions,
    },
    csrfToken,
  });
});

app.post("/auth/forgot", async (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const users = await prisma.user.findMany({ where: { email: parsed.data.email } });
  if (users.length === 0) {
    res.json({ message: "If an account exists, a reset link is available." });
    return;
  }
  if (users.length > 1) {
    res.status(400).json({ error: "Multiple accounts found for this email. Contact your admin." });
    return;
  }
  const user = users[0];
  if (!user.isActive) {
    res.status(403).json({ error: "User is inactive" });
    return;
  }
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  await prisma.passwordReset.create({
    data: {
      orgId: user.orgId,
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });
  const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";
  const resetUrl = `${webOrigin}/reset/${token}`;
  res.json({ message: "Reset link generated.", resetUrl });
});

app.post("/auth/reset", async (req, res) => {
  const schema = z.object({
    token: z.string().min(20),
    password: z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const tokenHash = hashToken(parsed.data.token);
  const reset = await prisma.passwordReset.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!reset) {
    res.status(400).json({ error: "Reset link is invalid or expired." });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: reset.userId },
    data: { passwordHash },
  });
  await prisma.passwordReset.update({
    where: { id: reset.id },
    data: { usedAt: new Date() },
  });
  await prisma.session.updateMany({
    where: { userId: reset.userId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: "PASSWORD_RESET" },
  });
  res.json({ message: "Password updated. You can sign in now." });
});

app.get("/auth/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

app.get("/auth/csrf", requireAuth, (req, res) => {
  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);
  res.json({ csrfToken });
});

app.post("/auth/logout", requireAuth, requireCsrf, async (req, res) => {
  const token = req.cookies?.session;
  if (token) {
    await destroySession(token);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.post("/auth/sessions/revoke", requireAuth, requireCsrf, requirePermission(Permission.ADMIN_SETTINGS), async (req, res) => {
  const schema = z.object({
    sessionId: z.string().optional(),
    userId: z.string().optional(),
    reason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.sessionId && !parsed.data.userId)) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const where = parsed.data.sessionId
    ? { id: parsed.data.sessionId, user: { orgId: req.user!.orgId } }
    : { userId: parsed.data.userId!, user: { orgId: req.user!.orgId } };
  await prisma.session.updateMany({
    where,
    data: { revokedAt: new Date(), revokeReason: parsed.data.reason ?? "revoked" },
  });
  res.json({ ok: true });
});

app.get("/tasks/inbox", requireAuth, async (req, res) => {
  const baseWhere = {
    orgId: req.user!.orgId,
    status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
  };
  const [myTasks, roleTasks] = await Promise.all([
    prisma.task.findMany({
      where: { ...baseWhere, assignedToId: req.user!.id },
      include: { load: true, driver: true, customer: true, invoice: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    }),
    prisma.task.findMany({
      where: { ...baseWhere, assignedToId: null, assignedRole: req.user!.role as Role },
      include: { load: true, driver: true, customer: true, invoice: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  res.json({ myTasks, roleTasks });
});

app.get("/tasks/assignees", requireAuth, requirePermission(Permission.TASK_ASSIGN), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { orgId: req.user!.orgId, isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users });
});

app.post("/tasks/:id/assign", requireAuth, requireCsrf, requirePermission(Permission.TASK_ASSIGN), async (req, res) => {
  const schema = z.object({
    assignedToId: z.string().nullable().optional(),
    assignedRole: z.enum(["ADMIN", "DISPATCHER", "BILLING", "DRIVER"]).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  let task;
  try {
    task = await requireOrgEntity(prisma.task, req.user!.orgId, req.params.id, "Task");
  } catch {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (parsed.data.assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: parsed.data.assignedToId, orgId: req.user!.orgId },
    });
    if (!assignee) {
      res.status(400).json({ error: "Assignee not found" });
      return;
    }
  }
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      assignedToId: parsed.data.assignedToId ?? null,
      assignedRole: parsed.data.assignedRole ?? task.assignedRole,
    },
  });
  await createEvent({
    orgId: req.user!.orgId,
    loadId: task.loadId ?? null,
    userId: req.user!.id,
    taskId: updated.id,
    type: EventType.TASK_CREATED,
    message: "Task assigned",
    meta: { assignedToId: updated.assignedToId, assignedRole: updated.assignedRole },
  });
  res.json({ task: updated });
});

app.post("/tasks/:id/complete", requireAuth, requireCsrf, async (req, res) => {
  const task = await completeTask(req.params.id, req.user!.orgId, req.user!.id);
  await logAudit({
    orgId: task.orgId,
    userId: req.user!.id,
    action: "TASK_DONE",
    entity: "Task",
    entityId: task.id,
    summary: `Completed task ${task.title}`,
  });
  res.json({ task });
});

app.get("/today", requireAuth, async (req, res) => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  const [loads, actionTasks, invoices] = await Promise.all([
    prisma.load.findMany({
      where: {
        orgId: req.user!.orgId,
        createdAt: { gte: start },
        status: { not: LoadStatus.INVOICED },
      },
      include: { driver: true, customer: true, stops: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.task.findMany({
      where: {
        orgId: req.user!.orgId,
        status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
        type: {
          in: [
            TaskType.COLLECT_POD,
            TaskType.MISSING_DOC,
            TaskType.STOP_DELAY_FOLLOWUP,
            TaskType.DRIVER_COMPLIANCE_EXPIRING,
          ],
        },
      },
      include: { driver: true, load: true },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
    }),
    prisma.invoice.findMany({
      where: {
        orgId: req.user!.orgId,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.ACCEPTED, InvoiceStatus.DISPUTED, InvoiceStatus.SHORT_PAID] },
      },
      include: { load: { include: { customer: true } } },
      orderBy: { generatedAt: "desc" },
    }),
  ]);

  let outstandingTotal = new Prisma.Decimal(0);
  let overdueCount = 0;
  const overdueInvoices = invoices.map((invoice) => {
    const termsDays =
      invoice.load.customer?.termsDays ??
      settings?.invoiceTermsDays ??
      parseTermsDays(settings?.invoiceTerms ?? "") ??
      30;
    const sentAt = invoice.sentAt ?? invoice.generatedAt;
    const dueDate = new Date(sentAt);
    dueDate.setDate(dueDate.getDate() + termsDays);
    if (invoice.totalAmount) {
      outstandingTotal = add(outstandingTotal, invoice.totalAmount);
    }
    const overdue = dueDate.getTime() < now.getTime();
    if (overdue) overdueCount += 1;
    return { invoice, dueDate, overdue };
  });

  res.json({
    todayLoads: loads,
    actionTasks,
    invoices: overdueInvoices,
    cashPosition: {
      outstandingCount: invoices.length,
      overdueCount,
      outstandingTotal,
    },
  });
});

app.get("/loads", requireAuth, async (req, res) => {
  const status = req.query.status as LoadStatus | undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const customer = typeof req.query.customer === "string" ? req.query.customer.trim() : "";
  const assigned = typeof req.query.assigned === "string" ? req.query.assigned.trim() : "";
  const driverId = typeof req.query.driverId === "string" ? req.query.driverId.trim() : "";
  const truckId = typeof req.query.truckId === "string" ? req.query.truckId.trim() : "";
  const trailerId = typeof req.query.trailerId === "string" ? req.query.trailerId.trim() : "";
  const destCity = typeof req.query.destCity === "string" ? req.query.destCity.trim() : "";
  const destState = typeof req.query.destState === "string" ? req.query.destState.trim() : "";
  const destSearch = typeof req.query.destSearch === "string" ? req.query.destSearch.trim() : "";
  const minRate = typeof req.query.minRate === "string" ? req.query.minRate.trim() : "";
  const maxRate = typeof req.query.maxRate === "string" ? req.query.maxRate.trim() : "";
  const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate.trim() : "";
  const toDate = typeof req.query.toDate === "string" ? req.query.toDate.trim() : "";
  const parseDateParam = (value: string) => {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };
  const parseNumberParam = (value: string) => {
    if (!value) return undefined;
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
  };
  const from = parseDateParam(fromDate);
  const to = parseDateParam(toDate);
  const minRateValue = parseNumberParam(minRate);
  const maxRateValue = parseNumberParam(maxRate);

  const orFilters: any[] = [];
  const where: any = {
    orgId: req.user!.orgId,
    status: status ? status : undefined,
    truckId: truckId || undefined,
    trailerId: trailerId || undefined,
    createdAt: {
      gte: from,
      lte: to,
    },
  };

  if (driverId) {
    where.assignedDriverId = driverId;
  } else if (assigned === "true") {
    where.assignedDriverId = { not: null };
  } else if (assigned === "false") {
    where.assignedDriverId = null;
  }
  if (customer) {
    orFilters.push(
      { customerName: { contains: customer, mode: "insensitive" } },
      { customer: { name: { contains: customer, mode: "insensitive" } } }
    );
  }
  if (search) {
    orFilters.push(
      { loadNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { customer: { name: { contains: search, mode: "insensitive" } } }
    );
  }
  if (orFilters.length > 0) {
    where.OR = orFilters;
  }
  if (minRateValue !== undefined || maxRateValue !== undefined) {
    where.rate = {
      gte: minRateValue,
      lte: maxRateValue,
    };
  }
  if (destCity || destState || destSearch) {
    const stopFilter: any = { type: StopType.DELIVERY };
    if (destCity) {
      stopFilter.city = { contains: destCity, mode: "insensitive" };
    }
    if (destState) {
      stopFilter.state = { contains: destState, mode: "insensitive" };
    }
    if (destSearch) {
      stopFilter.OR = [
        { name: { contains: destSearch, mode: "insensitive" } },
        { address: { contains: destSearch, mode: "insensitive" } },
        { city: { contains: destSearch, mode: "insensitive" } },
        { state: { contains: destSearch, mode: "insensitive" } },
        { zip: { contains: destSearch, mode: "insensitive" } },
      ];
    }
    where.stops = { some: stopFilter };
  }
  const loads = await prisma.load.findMany({
    where,
    include: {
      customer: true,
      driver: true,
      truck: true,
      trailer: true,
      stops: { orderBy: { sequence: "asc" } },
      legs: { orderBy: { sequence: "asc" }, include: { driver: true, truck: true, trailer: true } },
      events: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ loads });
});

app.get("/loads/:id", requireAuth, async (req, res) => {
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    include: {
      customer: true,
      driver: true,
      truck: true,
      trailer: true,
      stops: { orderBy: { sequence: "asc" } },
      docs: true,
      tasks: true,
      legs: { orderBy: { sequence: "asc" }, include: { driver: true, truck: true, trailer: true } },
    },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  res.json({ load });
});

app.get("/loads/:id/timeline", requireAuth, async (req, res) => {
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    include: { customer: true },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const [events, tasks, docs, invoices, settlementItems] = await Promise.all([
    prisma.event.findMany({
      where: { loadId: load.id, orgId: req.user!.orgId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.task.findMany({
      where: { loadId: load.id, orgId: req.user!.orgId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.document.findMany({
      where: { loadId: load.id, orgId: req.user!.orgId },
      orderBy: { uploadedAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { loadId: load.id, orgId: req.user!.orgId },
      orderBy: { generatedAt: "desc" },
    }),
    prisma.settlementItem.findMany({
      where: { loadId: load.id, settlement: { orgId: req.user!.orgId } },
      include: { settlement: true },
    }),
  ]);

  const items: Array<{ id: string; type: string; message: string; time: Date; refId?: string }> = [];
  for (const event of events) {
    items.push({ id: event.id, type: `EVENT_${event.type}`, message: event.message, time: event.createdAt, refId: event.id });
  }
  for (const doc of docs) {
    items.push({
      id: doc.id,
      type: `DOC_${doc.status}`,
      message: `${doc.type} ${doc.status.toLowerCase()}`,
      time: doc.uploadedAt,
      refId: doc.id,
    });
    if (doc.verifiedAt) {
      items.push({
        id: `${doc.id}-verified`,
        type: "DOC_VERIFIED",
        message: `${doc.type} verified`,
        time: doc.verifiedAt,
        refId: doc.id,
      });
    }
    if (doc.rejectedAt) {
      items.push({
        id: `${doc.id}-rejected`,
        type: "DOC_REJECTED",
        message: `${doc.type} rejected`,
        time: doc.rejectedAt,
        refId: doc.id,
      });
    }
  }
  for (const task of tasks) {
    items.push({
      id: task.id,
      type: `TASK_${task.status}`,
      message: task.title,
      time: task.createdAt,
      refId: task.id,
    });
    if (task.completedAt) {
      items.push({
        id: `${task.id}-done`,
        type: "TASK_DONE",
        message: `Completed: ${task.title}`,
        time: task.completedAt,
        refId: task.id,
      });
    }
  }
  for (const invoice of invoices) {
    items.push({
      id: invoice.id,
      type: "INVOICE_GENERATED",
      message: `Invoice ${invoice.invoiceNumber} generated`,
      time: invoice.generatedAt,
      refId: invoice.id,
    });
    if (invoice.sentAt) {
      items.push({
        id: `${invoice.id}-sent`,
        type: "INVOICE_SENT",
        message: `Invoice ${invoice.invoiceNumber} sent`,
        time: invoice.sentAt,
        refId: invoice.id,
      });
    }
    if (invoice.paidAt) {
      items.push({
        id: `${invoice.id}-paid`,
        type: `INVOICE_${invoice.status}`,
        message: `Invoice ${invoice.invoiceNumber} ${invoice.status.toLowerCase()}`,
        time: invoice.paidAt,
        refId: invoice.id,
      });
    }
    if (invoice.disputeReason) {
      items.push({
        id: `${invoice.id}-disputed`,
        type: "INVOICE_DISPUTED",
        message: `Invoice ${invoice.invoiceNumber} disputed`,
        time: invoice.sentAt ?? invoice.generatedAt,
        refId: invoice.id,
      });
    }
  }
  for (const item of settlementItems) {
    const settlement = item.settlement;
    items.push({
      id: item.id,
      type: `SETTLEMENT_${settlement.status}`,
      message: `Settlement ${settlement.status.toLowerCase()}`,
      time: settlement.paidAt ?? settlement.finalizedAt ?? settlement.createdAt,
      refId: settlement.id,
    });
  }

  items.sort((a, b) => b.time.getTime() - a.time.getTime());
  res.json({ load, timeline: items });
});

app.post("/loads/:id/legs", requireAuth, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const schema = z.object({
    type: z.enum(["PICKUP", "LINEHAUL", "DELIVERY"]),
    startStopSequence: z.number().optional(),
    endStopSequence: z.number().optional(),
    driverId: z.string().optional(),
    truckId: z.string().optional(),
    trailerId: z.string().optional(),
    setActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const [driverCheck, truckCheck, trailerCheck] = await Promise.all([
    parsed.data.driverId
      ? prisma.driver.findFirst({ where: { id: parsed.data.driverId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.truckId
      ? prisma.truck.findFirst({ where: { id: parsed.data.truckId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.trailerId
      ? prisma.trailer.findFirst({ where: { id: parsed.data.trailerId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
  ]);
  if ((parsed.data.driverId && !driverCheck) || (parsed.data.truckId && !truckCheck) || (parsed.data.trailerId && !trailerCheck)) {
    res.status(400).json({ error: "Invalid asset assignment" });
    return;
  }
  const sequence = await prisma.loadLeg
    .aggregate({ where: { loadId: load.id, orgId: req.user!.orgId }, _max: { sequence: true } })
    .then((result) => (result._max.sequence ?? 0) + 1);

  const leg = await prisma.loadLeg.create({
    data: {
      orgId: req.user!.orgId,
      loadId: load.id,
      sequence,
      type: parsed.data.type as LegType,
      status: parsed.data.setActive ? LegStatus.IN_PROGRESS : LegStatus.PLANNED,
      startStopSequence: parsed.data.startStopSequence,
      endStopSequence: parsed.data.endStopSequence,
      driverId: parsed.data.driverId ?? null,
      truckId: parsed.data.truckId ?? null,
      trailerId: parsed.data.trailerId ?? null,
    },
    include: { driver: true, truck: true, trailer: true },
  });

  if (parsed.data.setActive && parsed.data.driverId) {
    await prisma.load.update({
      where: { id: load.id },
      data: {
        assignedDriverId: parsed.data.driverId ?? null,
        truckId: parsed.data.truckId ?? null,
        trailerId: parsed.data.trailerId ?? null,
        status: LoadStatus.ASSIGNED,
      },
    });
  }

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LEG_CREATED",
    entity: "LoadLeg",
    entityId: leg.id,
    summary: `Created ${leg.type} leg for ${load.loadNumber}`,
  });

  res.json({ leg });
});

app.post("/legs/:id/assign", requireAuth, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const schema = z.object({
    driverId: z.string().optional(),
    truckId: z.string().optional(),
    trailerId: z.string().optional(),
    setActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const [driverCheck, truckCheck, trailerCheck] = await Promise.all([
    parsed.data.driverId
      ? prisma.driver.findFirst({ where: { id: parsed.data.driverId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.truckId
      ? prisma.truck.findFirst({ where: { id: parsed.data.truckId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.trailerId
      ? prisma.trailer.findFirst({ where: { id: parsed.data.trailerId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
  ]);
  if ((parsed.data.driverId && !driverCheck) || (parsed.data.truckId && !truckCheck) || (parsed.data.trailerId && !trailerCheck)) {
    res.status(400).json({ error: "Invalid asset assignment" });
    return;
  }
  const leg = await prisma.loadLeg.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    include: { load: true },
  });
  if (!leg) {
    res.status(404).json({ error: "Leg not found" });
    return;
  }
  const updated = await prisma.loadLeg.update({
    where: { id: leg.id },
    data: {
      driverId: parsed.data.driverId ?? null,
      truckId: parsed.data.truckId ?? null,
      trailerId: parsed.data.trailerId ?? null,
      status: parsed.data.setActive ? LegStatus.IN_PROGRESS : undefined,
    },
    include: { driver: true, truck: true, trailer: true },
  });

  if (parsed.data.setActive && parsed.data.driverId) {
    await prisma.load.update({
      where: { id: leg.loadId },
      data: {
        assignedDriverId: parsed.data.driverId ?? null,
        truckId: parsed.data.truckId ?? null,
        trailerId: parsed.data.trailerId ?? null,
        status: LoadStatus.ASSIGNED,
      },
    });
  }

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LEG_ASSIGNED",
    entity: "LoadLeg",
    entityId: updated.id,
    summary: `Assigned assets for ${updated.type} leg on ${leg.load.loadNumber}`,
  });

  res.json({ leg: updated });
});

app.post("/legs/:id/status", requireAuth, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const schema = z.object({
    status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETE"]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const leg = await prisma.loadLeg.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    include: { load: true },
  });
  if (!leg) {
    res.status(404).json({ error: "Leg not found" });
    return;
  }
  const updated = await prisma.loadLeg.update({
    where: { id: leg.id },
    data: { status: parsed.data.status as LegStatus },
    include: { driver: true, truck: true, trailer: true },
  });

  if (parsed.data.status === "IN_PROGRESS" && leg.driverId) {
    await prisma.load.update({
      where: { id: leg.loadId },
      data: {
        assignedDriverId: leg.driverId ?? null,
        truckId: leg.truckId ?? null,
        trailerId: leg.trailerId ?? null,
        status: LoadStatus.ASSIGNED,
      },
    });
  }

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LEG_STATUS",
    entity: "LoadLeg",
    entityId: updated.id,
    summary: `Set ${updated.type} leg to ${updated.status} on ${leg.load.loadNumber}`,
  });

  res.json({ leg: updated });
});

app.get("/manifests", requireAuth, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const manifests = await prisma.trailerManifest.findMany({
    where: { orgId: req.user!.orgId },
    include: {
      trailer: true,
      truck: true,
      driver: true,
      items: { include: { load: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ manifests });
});

app.post("/manifests", requireAuth, requireCsrf, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const schema = z.object({
    trailerId: z.string(),
    truckId: z.string().optional(),
    driverId: z.string().optional(),
    origin: z.string().optional(),
    destination: z.string().optional(),
    plannedDepartureAt: z.string().optional(),
    plannedArrivalAt: z.string().optional(),
    loadNumbers: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const loadNumbers = parsed.data.loadNumbers?.map((value) => value.trim()).filter(Boolean) ?? [];
  const loads = loadNumbers.length
    ? await prisma.load.findMany({
        where: { orgId: req.user!.orgId, loadNumber: { in: loadNumbers } },
      })
    : [];
  const loadMap = new Map(loads.map((load) => [load.loadNumber, load]));
  const missingLoadNumbers = loadNumbers.filter((num) => !loadMap.has(num));

  const manifest = await prisma.trailerManifest.create({
    data: {
      orgId: req.user!.orgId,
      trailerId: parsed.data.trailerId,
      truckId: parsed.data.truckId ?? null,
      driverId: parsed.data.driverId ?? null,
      origin: parsed.data.origin,
      destination: parsed.data.destination,
      plannedDepartureAt: parsed.data.plannedDepartureAt ? new Date(parsed.data.plannedDepartureAt) : null,
      plannedArrivalAt: parsed.data.plannedArrivalAt ? new Date(parsed.data.plannedArrivalAt) : null,
      items: {
        create: loads.map((load) => ({ loadId: load.id })),
      },
    },
    include: {
      trailer: true,
      truck: true,
      driver: true,
      items: { include: { load: true } },
    },
  });

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "MANIFEST_CREATED",
    entity: "TrailerManifest",
    entityId: manifest.id,
    summary: `Created manifest ${manifest.id} with ${manifest.items.length} loads`,
  });

  res.json({ manifest, missingLoadNumbers });
});

app.post("/manifests/:id/status", requireAuth, requireCsrf, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const schema = z.object({
    status: z.enum(["PLANNED", "LOADED", "IN_TRANSIT", "ARRIVED", "UNLOADED", "COMPLETE"]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const current = await prisma.trailerManifest.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!current) {
    res.status(404).json({ error: "Manifest not found" });
    return;
  }
  const manifest = await prisma.trailerManifest.update({
    where: { id: current.id },
    data: { status: parsed.data.status as ManifestStatus },
    include: {
      trailer: true,
      truck: true,
      driver: true,
      items: { include: { load: true } },
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "MANIFEST_STATUS",
    entity: "TrailerManifest",
    entityId: manifest.id,
    summary: `Set manifest ${manifest.id} to ${manifest.status}`,
  });
  res.json({ manifest });
});

app.post("/manifests/:id/items", requireAuth, requireCsrf, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const schema = z.object({
    loadNumbers: z.array(z.string()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const loadNumbers = parsed.data.loadNumbers.map((value) => value.trim()).filter(Boolean);
  const loads = await prisma.load.findMany({
    where: { orgId: req.user!.orgId, loadNumber: { in: loadNumbers } },
  });
  const loadMap = new Map(loads.map((load) => [load.loadNumber, load]));
  const missingLoadNumbers = loadNumbers.filter((num) => !loadMap.has(num));

  const manifestCheck = await prisma.trailerManifest.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!manifestCheck) {
    res.status(404).json({ error: "Manifest not found" });
    return;
  }
  const items = await prisma.trailerManifestItem.findMany({
    where: { manifestId: manifestCheck.id },
    select: { loadId: true },
  });
  const existing = new Set(items.map((item) => item.loadId));

  await prisma.trailerManifestItem.createMany({
    data: loads
      .filter((load) => !existing.has(load.id))
      .map((load) => ({ manifestId: manifestCheck.id, loadId: load.id })),
    skipDuplicates: true,
  });

  const manifest = await prisma.trailerManifest.findFirst({
    where: { id: manifestCheck.id, orgId: req.user!.orgId },
    include: {
      trailer: true,
      truck: true,
      driver: true,
      items: { include: { load: true } },
    },
  });

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "MANIFEST_ITEMS",
    entity: "TrailerManifest",
    entityId: req.params.id,
    summary: `Added ${loads.length} loads to manifest`,
  });

  res.json({ manifest, missingLoadNumbers });
});

app.delete("/manifests/:id/items/:loadId", requireAuth, requireCsrf, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const manifestCheck = await prisma.trailerManifest.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!manifestCheck) {
    res.status(404).json({ error: "Manifest not found" });
    return;
  }
  await prisma.trailerManifestItem.deleteMany({
    where: { manifestId: manifestCheck.id, loadId: req.params.loadId },
  });
  const manifest = await prisma.trailerManifest.findFirst({
    where: { id: manifestCheck.id, orgId: req.user!.orgId },
    include: {
      trailer: true,
      truck: true,
      driver: true,
      items: { include: { load: true } },
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "MANIFEST_ITEMS",
    entity: "TrailerManifest",
    entityId: req.params.id,
    summary: `Removed load ${req.params.loadId} from manifest`,
  });
  res.json({ manifest });
});

app.post("/loads", requireAuth, requireCsrf, requirePermission(Permission.LOAD_CREATE), async (req, res) => {
  const schema = z.object({
    loadNumber: z.string().min(2),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    customerRef: z.string().optional(),
    bolNumber: z.string().optional(),
    rate: z.union([z.number(), z.string()]).optional(),
    miles: z.number().optional(),
    stops: z
      .array(
        z.object({
          type: z.enum(["PICKUP", "YARD", "DELIVERY"]),
          name: z.string(),
          address: z.string(),
          city: z.string(),
          state: z.string(),
          zip: z.string(),
          appointmentStart: z.string().optional(),
          appointmentEnd: z.string().optional(),
          sequence: z.number(),
        })
      )
      .min(2),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  if (!parsed.data.customerId && !parsed.data.customerName) {
    res.status(400).json({ error: "Customer required" });
    return;
  }

  let customerId = parsed.data.customerId ?? null;
  let customerName = parsed.data.customerName?.trim() ?? null;
  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, orgId: req.user!.orgId },
    });
    if (!customer) {
      res.status(400).json({ error: "Customer not found" });
      return;
    }
    if (!customerName) {
      customerName = customer.name;
    }
  }
  if (!customerId && customerName) {
    const existing = await prisma.customer.findFirst({
      where: { orgId: req.user!.orgId, name: customerName },
    });
    const created =
      existing ??
      (await prisma.customer.create({
        data: { orgId: req.user!.orgId, name: customerName },
      }));
    customerId = created.id;
  }

  const load = await prisma.load.create({
    data: {
      orgId: req.user!.orgId,
      loadNumber: parsed.data.loadNumber,
      customerId,
      customerName,
      customerRef: parsed.data.customerRef ?? null,
      bolNumber: parsed.data.bolNumber ?? null,
      rate: toDecimal(parsed.data.rate),
      miles: parsed.data.miles,
      createdById: req.user!.id,
      stops: {
        create: parsed.data.stops.map((stop) => ({
          orgId: req.user!.orgId,
          type: stop.type,
          name: stop.name,
          address: stop.address,
          city: stop.city,
          state: stop.state,
          zip: stop.zip,
          appointmentStart: stop.appointmentStart ? new Date(stop.appointmentStart) : null,
          appointmentEnd: stop.appointmentEnd ? new Date(stop.appointmentEnd) : null,
          sequence: stop.sequence,
        })),
      },
    },
  });

  await createEvent({
    orgId: req.user!.orgId,
    loadId: load.id,
    userId: req.user!.id,
    type: EventType.LOAD_CREATED,
    message: `Load ${load.loadNumber} created`,
  });

  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LOAD_CREATED",
    entity: "Load",
    entityId: load.id,
    summary: `Created load ${load.loadNumber}`,
  });

  res.json({ load });
});

app.put("/loads/:id", requireAuth, requireCsrf, requirePermission(Permission.LOAD_EDIT), async (req, res) => {
  const schema = z.object({
    customerId: z.string().optional(),
    customerName: z.string().min(2).optional(),
    customerRef: z.string().optional(),
    bolNumber: z.string().optional(),
    rate: z.union([z.number(), z.string()]).optional(),
    miles: z.number().optional(),
    status: z.enum(["PLANNED", "ASSIGNED", "IN_TRANSIT", "DELIVERED", "READY_TO_INVOICE", "INVOICED"]).optional(),
    overrideReason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const existing = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
    include: { customer: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (parsed.data.rate !== undefined && !hasPermission(req.user, Permission.RATE_EDIT)) {
    res.status(403).json({ error: "Missing permission to edit rate" });
    return;
  }
  const lockedFieldsChanged: string[] = [];
  if (parsed.data.rate !== undefined) lockedFieldsChanged.push("rate");
  if (parsed.data.customerId !== undefined || parsed.data.customerName !== undefined) lockedFieldsChanged.push("customer");
  if (parsed.data.customerRef !== undefined) lockedFieldsChanged.push("customerRef");
  if (parsed.data.bolNumber !== undefined) lockedFieldsChanged.push("bolNumber");
  if (parsed.data.miles !== undefined) lockedFieldsChanged.push("miles");
  const attemptingLockedEdit = existing.lockedAt && lockedFieldsChanged.length > 0;
  if (attemptingLockedEdit && req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "Load is locked" });
    return;
  }
  if (attemptingLockedEdit && req.user!.role === "ADMIN" && !parsed.data.overrideReason) {
    res.status(400).json({ error: "overrideReason required for locked loads" });
    return;
  }

  let customerId = parsed.data.customerId ?? null;
  let customerName = parsed.data.customerName ?? null;
  if (parsed.data.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: parsed.data.customerId, orgId: req.user!.orgId },
    });
    if (!customer) {
      res.status(400).json({ error: "Customer not found" });
      return;
    }
    customerName = customer.name;
  }
  if (!customerId && customerName) {
    const existingCustomer = await prisma.customer.findFirst({
      where: { orgId: req.user!.orgId, name: customerName },
    });
    const created =
      existingCustomer ??
      (await prisma.customer.create({
        data: { orgId: req.user!.orgId, name: customerName },
      }));
    customerId = created.id;
  }
  if (!customerId && !customerName) {
    customerId = existing.customerId ?? null;
    customerName = existing.customerName ?? null;
  }
  const load = await prisma.load.update({
    where: { id: existing.id },
    data: {
      customerId,
      customerName,
      customerRef: parsed.data.customerRef ?? existing.customerRef ?? null,
      bolNumber: parsed.data.bolNumber ?? existing.bolNumber ?? null,
      rate: parsed.data.rate !== undefined ? toDecimal(parsed.data.rate) : undefined,
      miles: parsed.data.miles,
      status: parsed.data.status,
    },
  });
  if (attemptingLockedEdit && req.user!.role === "ADMIN") {
    await createEvent({
      orgId: req.user!.orgId,
      loadId: load.id,
      userId: req.user!.id,
      type: EventType.DRIVER_NOTE,
      message: "Admin override on locked load",
      meta: { overrideReason: parsed.data.overrideReason, fields: lockedFieldsChanged },
    });
  }
  res.json({ load });
});

app.post("/loads/:id/assign", requireAuth, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const schema = z.object({
    driverId: z.string(),
    truckId: z.string().optional(),
    trailerId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const [driverCheck, truckCheck, trailerCheck] = await Promise.all([
    prisma.driver.findFirst({ where: { id: parsed.data.driverId, orgId: req.user!.orgId } }),
    parsed.data.truckId
      ? prisma.truck.findFirst({ where: { id: parsed.data.truckId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
    parsed.data.trailerId
      ? prisma.trailer.findFirst({ where: { id: parsed.data.trailerId, orgId: req.user!.orgId } })
      : Promise.resolve(null),
  ]);
  if (!driverCheck || (parsed.data.truckId && !truckCheck) || (parsed.data.trailerId && !trailerCheck)) {
    res.status(400).json({ error: "Invalid asset assignment" });
    return;
  }
  const load = await prisma.load.update({
    where: { id: req.params.id, orgId: req.user!.orgId },
    data: {
      assignedDriverId: parsed.data.driverId,
      truckId: parsed.data.truckId ?? null,
      trailerId: parsed.data.trailerId ?? null,
      status: LoadStatus.ASSIGNED,
    },
  });
  const activeLeg = await prisma.loadLeg.findFirst({
    where: { loadId: load.id, orgId: req.user!.orgId, status: LegStatus.IN_PROGRESS },
    orderBy: { sequence: "desc" },
  });
  if (activeLeg) {
    await prisma.loadLeg.update({
      where: { id: activeLeg.id },
      data: {
        driverId: parsed.data.driverId,
        truckId: parsed.data.truckId ?? null,
        trailerId: parsed.data.trailerId ?? null,
      },
    });
  }
  await createEvent({
    orgId: req.user!.orgId,
    loadId: load.id,
    userId: req.user!.id,
    type: EventType.LOAD_ASSIGNED,
    message: `Load ${load.loadNumber} assigned`,
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LOAD_ASSIGNED",
    entity: "Load",
    entityId: load.id,
    summary: `Assigned load ${load.loadNumber}`,
  });
  res.json({ load });
});

app.post("/loads/:id/unassign", requireAuth, requireCsrf, requirePermission(Permission.LOAD_ASSIGN), async (req, res) => {
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const nextStatus = load.status === LoadStatus.ASSIGNED ? LoadStatus.PLANNED : load.status;
  const updated = await prisma.load.update({
    where: { id: load.id },
    data: {
      assignedDriverId: null,
      truckId: null,
      trailerId: null,
      status: nextStatus,
    },
  });
  const activeLeg = await prisma.loadLeg.findFirst({
    where: { loadId: load.id, orgId: req.user!.orgId, status: LegStatus.IN_PROGRESS },
    orderBy: { sequence: "desc" },
  });
  if (activeLeg) {
    await prisma.loadLeg.update({
      where: { id: activeLeg.id },
      data: {
        driverId: null,
        truckId: null,
        trailerId: null,
      },
    });
  }
  await createEvent({
    orgId: req.user!.orgId,
    loadId: updated.id,
    userId: req.user!.id,
    type: EventType.LOAD_ASSIGNED,
    message: `Load ${updated.loadNumber} unassigned`,
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "LOAD_UNASSIGNED",
    entity: "Load",
    entityId: updated.id,
    summary: `Unassigned load ${updated.loadNumber}`,
  });
  res.json({ load: updated });
});

app.post("/stops/:id/delay", requireAuth, requireCsrf, requirePermission(Permission.STOP_EDIT), async (req, res) => {
  const schema = z.object({
    delayReason: z.enum(["SHIPPER_DELAY", "RECEIVER_DELAY", "TRAFFIC", "WEATHER", "BREAKDOWN", "OTHER"]).optional(),
    delayNotes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const stop = await prisma.stop.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!stop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }
  const updated = await prisma.stop.update({
    where: { id: stop.id },
    data: {
      delayReason: parsed.data.delayReason ?? null,
      delayNotes: parsed.data.delayNotes ?? null,
    },
  });
  await createEvent({
    orgId: req.user!.orgId,
    loadId: stop.loadId,
    stopId: stop.id,
    userId: req.user!.id,
    type: EventType.DRIVER_NOTE,
    message: "Stop delay updated",
    meta: { delayReason: parsed.data.delayReason, delayNotes: parsed.data.delayNotes },
  });
  res.json({ stop: updated });
});

app.get("/assets/drivers", requireAuth, requirePermission(Permission.LOAD_ASSIGN, Permission.SETTLEMENT_GENERATE), async (req, res) => {
  const drivers = await prisma.driver.findMany({ where: { orgId: req.user!.orgId } });
  res.json({ drivers });
});

app.get("/assets/trucks", requireAuth, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const trucks = await prisma.truck.findMany({ where: { orgId: req.user!.orgId } });
  res.json({ trucks });
});

app.get("/assets/trailers", requireAuth, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const trailers = await prisma.trailer.findMany({ where: { orgId: req.user!.orgId } });
  res.json({ trailers });
});

app.get("/customers", requireAuth, async (req, res) => {
  const customers = await prisma.customer.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { name: "asc" },
  });
  res.json({ customers });
});

app.post("/customers", requireAuth, requireCsrf, requirePermission(Permission.LOAD_CREATE), async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    billingEmail: z.string().email().optional(),
    billingPhone: z.string().optional(),
    remitToAddress: z.string().optional(),
    termsDays: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const customer = await prisma.customer.create({
    data: { orgId: req.user!.orgId, ...parsed.data },
  });
  res.json({ customer });
});

app.put("/customers/:id", requireAuth, requireCsrf, requirePermission(Permission.LOAD_EDIT), async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    billingEmail: z.string().email().optional(),
    billingPhone: z.string().optional(),
    remitToAddress: z.string().optional(),
    termsDays: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const existing = await prisma.customer.findFirst({
    where: { id: req.params.id, orgId: req.user!.orgId },
  });
  if (!existing) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const customer = await prisma.customer.update({
    where: { id: existing.id },
    data: parsed.data,
  });
  res.json({ customer });
});

async function handleArriveStop(params: {
  stopId: string;
  userId: string;
  orgId: string;
  role: string;
}) {
  const stop = await prisma.stop.findFirst({
    where: { id: params.stopId, orgId: params.orgId },
    include: { load: true },
  });
  if (!stop) {
    throw new Error("Stop not found");
  }
  const updated = await prisma.stop.update({
    where: { id: stop.id },
    data: { arrivedAt: stop.arrivedAt ?? new Date(), status: "ARRIVED" },
  });
  await createEvent({
    orgId: params.orgId,
    loadId: stop.loadId,
    userId: params.userId,
    stopId: stop.id,
    type: EventType.STOP_ARRIVED,
    message: `${stop.type} arrived at ${stop.name}`,
  });
  if (stop.type === StopType.DELIVERY) {
    await prisma.load.update({
      where: { id: stop.loadId },
      data: { status: LoadStatus.DELIVERED, deliveredAt: new Date() },
    });
    const settings = await prisma.orgSettings.findFirst({ where: { orgId: params.orgId } });
    if (settings) {
      await ensureTask({
        orgId: params.orgId,
        loadId: stop.loadId,
        stopId: stop.id,
        type: TaskType.COLLECT_POD,
        title: "Collect POD",
        priority: TaskPriority.HIGH,
        assignedRole: "BILLING",
        dueAt: new Date(Date.now() + settings.collectPodDueMinutes * 60 * 1000),
        createdById: params.userId,
        dedupeKey: `COLLECT_POD:stop:${stop.id}`,
      });
    }
  }
  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "STOP_ARRIVED",
    entity: "Stop",
    entityId: stop.id,
    summary: `${stop.type} arrived at ${stop.name}`,
  });
  return updated;
}

async function handleDepartStop(params: {
  stopId: string;
  userId: string;
  orgId: string;
}) {
  const stop = await prisma.stop.findFirst({
    where: { id: params.stopId, orgId: params.orgId },
    include: { load: true },
  });
  if (!stop) {
    throw new Error("Stop not found");
  }
  const updated = await prisma.stop.update({
    where: { id: stop.id },
    data: { departedAt: stop.departedAt ?? new Date(), status: "DEPARTED" },
  });
  await createEvent({
    orgId: params.orgId,
    loadId: stop.loadId,
    userId: params.userId,
    stopId: stop.id,
    type: EventType.STOP_DEPARTED,
    message: `${stop.type} departed ${stop.name}`,
  });
  if (stop.type === StopType.PICKUP || stop.type === StopType.YARD) {
    const pickups = await prisma.stop.findMany({
      where: { loadId: stop.loadId, orgId: params.orgId, type: { in: [StopType.PICKUP, StopType.YARD] } },
    });
    const allDeparted = pickups.length > 0 && pickups.every((s) => s.departedAt);
    if (allDeparted) {
      await prisma.load.update({
        where: { id: stop.loadId },
        data: { status: LoadStatus.IN_TRANSIT },
      });
    }
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: params.orgId } });
  if (settings && updated.arrivedAt && updated.departedAt) {
    const dwellMinutes = Math.max(
      0,
      Math.round((updated.departedAt.getTime() - updated.arrivedAt.getTime()) / 60000)
    );
    const freeMinutes =
      stop.type === StopType.PICKUP
        ? settings.pickupFreeDetentionMinutes
        : stop.type === StopType.DELIVERY
        ? settings.deliveryFreeDetentionMinutes
        : 0;
    const detentionMinutes = Math.max(0, dwellMinutes - freeMinutes);
    if (detentionMinutes > 0) {
      await prisma.stop.update({
        where: { id: stop.id },
        data: { detentionMinutes },
      });
      if (settings.detentionRatePerHour) {
        await ensureTask({
          orgId: params.orgId,
          loadId: stop.loadId,
          stopId: stop.id,
          type: TaskType.STOP_DELAY_FOLLOWUP,
          title: "Detention follow-up",
          priority: TaskPriority.MED,
          assignedRole: "BILLING",
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdById: params.userId,
          dedupeKey: `STOP_DELAY_FOLLOWUP:stop:${stop.id}`,
        });
      }
    }
  }
  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "STOP_DEPARTED",
    entity: "Stop",
    entityId: stop.id,
    summary: `${stop.type} departed ${stop.name}`,
  });
  return updated;
}

app.post(
  "/loads/:loadId/stops/:stopId/arrive",
  requireAuth,
  requireCsrf,
  requirePermission(Permission.STOP_EDIT),
  async (req, res) => {
    try {
      const stop = await handleArriveStop({
        stopId: req.params.stopId,
        userId: req.user!.id,
        orgId: req.user!.orgId,
        role: req.user!.role,
      });
      res.json({ stop });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

app.post(
  "/loads/:loadId/stops/:stopId/depart",
  requireAuth,
  requireCsrf,
  requirePermission(Permission.STOP_EDIT),
  async (req, res) => {
    try {
      const stop = await handleDepartStop({
        stopId: req.params.stopId,
        userId: req.user!.id,
        orgId: req.user!.orgId,
      });
      res.json({ stop });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

app.get("/driver/current", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const driver = await prisma.driver.findFirst({
    where: { userId: req.user!.id, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: {
      orgId: req.user!.orgId,
      assignedDriverId: driver.id,
      status: { not: LoadStatus.INVOICED },
    },
    include: {
      stops: { orderBy: { sequence: "asc" } },
      docs: true,
      driver: true,
      customer: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ load });
});

app.get("/driver/settings", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  res.json({
    settings: settings
      ? {
          requiredDocs: settings.requiredDocs,
          requiredDriverDocs: settings.requiredDriverDocs,
          reminderFrequencyMinutes: settings.reminderFrequencyMinutes,
          missingPodAfterMinutes: settings.missingPodAfterMinutes,
        }
      : null,
  });
});

function getWeekStart(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function parseDateInput(value: string, mode: "start" | "end") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (mode === "start") {
      date.setHours(0, 0, 0, 0);
    } else {
      date.setHours(23, 59, 59, 999);
    }
  }
  return date;
}

app.get("/driver/earnings", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const driver = await prisma.driver.findFirst({
    where: { userId: req.user!.id, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  const ratePerMileValue = toDecimal(driver.payRatePerMile ?? settings?.driverRatePerMile ?? 0) ?? new Prisma.Decimal(0);
  const weekStart = getWeekStart(new Date());
  const loads = await prisma.load.findMany({
    where: {
      orgId: req.user!.orgId,
      assignedDriverId: driver.id,
      deliveredAt: { gte: weekStart },
    },
    select: { miles: true },
  });
  const milesThisWeek = loads.reduce((total, load) => total + (load.miles ?? 0), 0);
  const milesDecimal = toDecimalFixed(milesThisWeek, 2) ?? new Prisma.Decimal(0);
  const estimatedPay = mul(ratePerMileValue, milesDecimal);
  res.json({
    weekStart,
    milesThisWeek,
    ratePerMile: formatUSD(ratePerMileValue),
    estimatedPay: formatUSD(estimatedPay),
    loadCount: loads.length,
  });
});

app.post("/driver/stops/:stopId/arrive", requireAuth, requireCsrf, requireRole("DRIVER"), async (req, res) => {
  try {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }
    const stopCheck = await prisma.stop.findFirst({
      where: { id: req.params.stopId, orgId: req.user!.orgId },
      include: { load: true },
    });
    if (!stopCheck || stopCheck.load.assignedDriverId !== driver.id) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    const stop = await handleArriveStop({
      stopId: req.params.stopId,
      userId: req.user!.id,
      orgId: req.user!.orgId,
      role: req.user!.role,
    });
    res.json({ stop });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/driver/stops/:stopId/depart", requireAuth, requireCsrf, requireRole("DRIVER"), async (req, res) => {
  try {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }
    const stopCheck = await prisma.stop.findFirst({
      where: { id: req.params.stopId, orgId: req.user!.orgId },
      include: { load: true },
    });
    if (!stopCheck || stopCheck.load.assignedDriverId !== driver.id) {
      res.status(403).json({ error: "Not assigned to this load" });
      return;
    }
    const stop = await handleDepartStop({
      stopId: req.params.stopId,
      userId: req.user!.id,
      orgId: req.user!.orgId,
    });
    res.json({ stop });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/driver/note", requireAuth, requireCsrf, requireRole("DRIVER"), async (req, res) => {
  const schema = z.object({ loadId: z.string(), note: z.string().min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const driver = await prisma.driver.findFirst({
    where: { userId: req.user!.id, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: { id: parsed.data.loadId, orgId: req.user!.orgId },
  });
  if (!load || load.assignedDriverId !== driver.id) {
    res.status(403).json({ error: "Not assigned to this load" });
    return;
  }
  await createEvent({
    orgId: req.user!.orgId,
    loadId: load.id,
    userId: req.user!.id,
    type: EventType.DRIVER_NOTE,
    message: "Driver note added",
    meta: { note: parsed.data.note },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DRIVER_NOTE",
    entity: "Load",
    entityId: load.id,
    summary: `Driver note on ${load.loadNumber}`,
    meta: { note: parsed.data.note },
  });
  res.json({ ok: true });
});

app.post("/driver/undo", requireAuth, requireCsrf, requireRole("DRIVER"), async (req, res) => {
  const schema = z.object({ loadId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const driver = await prisma.driver.findFirst({
    where: { userId: req.user!.id, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: { id: parsed.data.loadId, orgId: req.user!.orgId },
    include: { stops: true },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.assignedDriverId !== driver.id) {
    res.status(403).json({ error: "Not assigned to this load" });
    return;
  }
  const recentStops = load.stops
    .flatMap((stop) => [
      stop.arrivedAt ? { stop, type: "arrived", time: stop.arrivedAt } : null,
      stop.departedAt ? { stop, type: "departed", time: stop.departedAt } : null,
    ])
    .filter(Boolean) as { stop: typeof load.stops[number]; type: string; time: Date }[];
  recentStops.sort((a, b) => b.time.getTime() - a.time.getTime());
  const latest = recentStops[0];
  if (!latest || Date.now() - latest.time.getTime() > 5 * 60 * 1000) {
    res.status(400).json({ error: "No recent action to undo" });
    return;
  }
  const data =
    latest.type === "arrived"
      ? { arrivedAt: null, status: "PLANNED" }
      : { departedAt: null, status: "ARRIVED" };
  const updated = await prisma.stop.update({ where: { id: latest.stop.id }, data });
  await createEvent({
    orgId: req.user!.orgId,
    loadId: load.id,
    userId: req.user!.id,
    stopId: latest.stop.id,
    type: EventType.STOP_DEPARTED,
    message: `Undo ${latest.type} at ${latest.stop.name}`,
    meta: { undo: true },
  });
  res.json({ stop: updated });
});

app.post(
  "/loads/:loadId/docs",
  requireAuth,
  requireCsrf,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "File required" });
      return;
    }
    const schema = z.object({
      type: z.nativeEnum(DocType),
      stopId: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    try {
      const load = await prisma.load.findFirst({
        where: { id: req.params.loadId, orgId: req.user!.orgId },
      });
      if (!load) {
        res.status(404).json({ error: "Load not found" });
        return;
      }
      const { filename } = await saveDocumentFile(req.file, load.id, req.user!.orgId, parsed.data.type);
      const doc = await prisma.document.create({
        data: {
          orgId: req.user!.orgId,
          loadId: load.id,
          stopId: parsed.data.stopId ?? null,
          type: parsed.data.type,
          status: DocStatus.UPLOADED,
          source: "OPS_UPLOAD",
          filename,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          uploadedById: req.user!.id,
        },
      });
      await createEvent({
        orgId: req.user!.orgId,
        loadId: load.id,
        stopId: parsed.data.stopId ?? null,
        docId: doc.id,
        userId: req.user!.id,
        type: EventType.DOC_UPLOADED,
        message: `Document uploaded (${parsed.data.type})`,
        meta: { docId: doc.id },
      });
      await logAudit({
        orgId: req.user!.orgId,
        userId: req.user!.id,
        action: "DOC_UPLOADED",
        entity: "Document",
        entityId: doc.id,
        summary: `Uploaded ${parsed.data.type} for load ${load.loadNumber}`,
      });
      res.json({ doc });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

app.post(
  "/driver/docs",
  requireAuth,
  requireCsrf,
  requireRole("DRIVER"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "File required" });
      return;
    }
    const schema = z.object({ loadId: z.string(), type: z.nativeEnum(DocType), stopId: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    try {
      const load = await prisma.load.findFirst({
        where: { id: parsed.data.loadId, orgId: req.user!.orgId },
      });
      if (!load) {
        res.status(404).json({ error: "Load not found" });
        return;
      }
      const { filename } = await saveDocumentFile(req.file, load.id, req.user!.orgId, parsed.data.type);
      const doc = await prisma.document.create({
        data: {
          orgId: req.user!.orgId,
          loadId: load.id,
          stopId: parsed.data.stopId ?? null,
          type: parsed.data.type,
          status: DocStatus.UPLOADED,
          source: "DRIVER_UPLOAD",
          filename,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          uploadedById: req.user!.id,
        },
      });
      await createEvent({
        orgId: req.user!.orgId,
        loadId: load.id,
        stopId: parsed.data.stopId ?? null,
        docId: doc.id,
        userId: req.user!.id,
        type: EventType.DOC_UPLOADED,
        message: `Document uploaded (${parsed.data.type})`,
        meta: { docId: doc.id },
      });
      res.json({ doc });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

app.post("/docs/:id/verify", requireAuth, requireCsrf, requirePermission(Permission.DOC_VERIFY), async (req, res) => {
  const schema = z.object({
    requireSignature: z.boolean(),
    requirePrintedName: z.boolean(),
    requireDeliveryDate: z.boolean(),
    pages: z.number().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  let doc;
  try {
    doc = await requireOrgEntity(prisma.document, req.user!.orgId, req.params.id, "Document");
  } catch {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const load = await prisma.load.findFirst({
    where: { id: doc.loadId, orgId: req.user!.orgId },
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  if (!settings) {
    res.status(400).json({ error: "Settings not configured" });
    return;
  }
  if (settings.podRequireSignature && !parsed.data.requireSignature) {
    res.status(400).json({ error: "Signature required" });
    return;
  }
  if (settings.podRequirePrintedName && !parsed.data.requirePrintedName) {
    res.status(400).json({ error: "Printed name required" });
    return;
  }
  if (settings.podRequireDeliveryDate && !parsed.data.requireDeliveryDate) {
    res.status(400).json({ error: "Delivery date required" });
    return;
  }
  if (parsed.data.pages < settings.podMinPages) {
    res.status(400).json({ error: `Minimum ${settings.podMinPages} page(s) required` });
    return;
  }

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: {
      status: DocStatus.VERIFIED,
      verifiedById: req.user!.id,
      verifiedAt: new Date(),
    },
  });
  if (doc.type === DocType.POD) {
    await prisma.load.update({
      where: { id: doc.loadId },
      data: { status: LoadStatus.READY_TO_INVOICE, podVerifiedAt: new Date() },
    });
  }
  await createEvent({
    orgId: req.user!.orgId,
    loadId: doc.loadId,
    userId: req.user!.id,
    type: EventType.DOC_VERIFIED,
    message: "POD verified",
    docId: doc.id,
    stopId: doc.stopId ?? null,
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DOC_VERIFIED",
    entity: "Document",
    entityId: doc.id,
    summary: `Verified ${doc.type} for load ${load.loadNumber}`,
  });
  const invoiceResult = await generateInvoiceForLoad({
    orgId: req.user!.orgId,
    loadId: doc.loadId,
    userId: req.user!.id,
  });

  res.json({ doc: updated, invoice: invoiceResult.invoice ?? null, missingDocs: invoiceResult.missingDocs ?? [] });
});

app.post("/docs/:id/reject", requireAuth, requireCsrf, requirePermission(Permission.DOC_VERIFY), async (req, res) => {
  const schema = z.object({ rejectReason: z.string().min(2) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Reject reason required" });
    return;
  }
  let doc;
  try {
    doc = await requireOrgEntity(prisma.document, req.user!.orgId, req.params.id, "Document");
  } catch {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: {
      status: DocStatus.REJECTED,
      rejectedById: req.user!.id,
      rejectedAt: new Date(),
      rejectReason: parsed.data.rejectReason,
    },
  });
  await createEvent({
    orgId: req.user!.orgId,
    loadId: doc.loadId,
    userId: req.user!.id,
    type: EventType.DOC_REJECTED,
    message: "POD rejected",
    docId: doc.id,
    stopId: doc.stopId ?? null,
    meta: { rejectReason: parsed.data.rejectReason },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DOC_REJECTED",
    entity: "Document",
    entityId: doc.id,
    summary: `Rejected ${doc.type} for load ${doc.loadId}`,
    meta: { rejectReason: parsed.data.rejectReason },
  });
  res.json({ doc: updated });
});

app.get("/billing/queue", requireAuth, requirePermission(Permission.DOC_VERIFY, Permission.INVOICE_SEND), async (req, res) => {
  const delivered = await prisma.load.findMany({
    where: { orgId: req.user!.orgId, status: LoadStatus.DELIVERED },
    include: { docs: true, stops: true, driver: true, customer: true },
  });
  const ready = await prisma.load.findMany({
    where: { orgId: req.user!.orgId, status: LoadStatus.READY_TO_INVOICE },
    include: { docs: true, stops: true, driver: true, customer: true },
  });
  const invoiced = await prisma.load.findMany({
    where: { orgId: req.user!.orgId, status: LoadStatus.INVOICED },
    include: { docs: true, stops: true, driver: true, customer: true, invoices: { include: { items: true } } },
  });
  res.json({ delivered, ready, invoiced });
});

async function generateInvoiceForLoad(params: { orgId: string; loadId: string; userId: string }) {
  const load = await prisma.load.findFirst({
    where: { id: params.loadId, orgId: params.orgId },
    include: { stops: true, customer: true },
  });
  if (!load) {
    throw new Error("Load not found");
  }
  const existingInvoice = await prisma.invoice.findFirst({
    where: { loadId: load.id, orgId: params.orgId },
  });
  if (existingInvoice) {
    if (load.status !== LoadStatus.INVOICED) {
      await prisma.load.update({
        where: { id: load.id },
        data: { status: LoadStatus.INVOICED },
      });
    }
    return { invoice: existingInvoice, missingDocs: [] } as const;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: params.orgId } });
  if (!settings) {
    throw new Error("Settings not configured");
  }
  const docs = await prisma.document.findMany({ where: { loadId: load.id, orgId: params.orgId } });
  const missingDocs = settings.requiredDocs.filter(
    (docType) => !docs.some((doc) => doc.type === (docType as DocType) && doc.status === DocStatus.VERIFIED)
  );
  if (missingDocs.length > 0) {
    for (const docType of missingDocs) {
      await ensureTask({
        orgId: params.orgId,
        loadId: load.id,
        type: TaskType.MISSING_DOC,
        title: `Missing doc ${docType}`,
        priority: TaskPriority.HIGH,
        assignedRole: "BILLING",
        createdById: params.userId,
        dedupeKey: `MISSING_DOC:${docType}:load:${load.id}`,
      });
    }
    return { missingDocs } as const;
  }
  const linehaul = toDecimal(load.rate) ?? new Prisma.Decimal(0);
  const lineItems = [
    {
      code: "LINEHAUL",
      description: "Linehaul",
      quantity: new Prisma.Decimal(1),
      rate: linehaul,
      amount: linehaul,
    },
  ];
  const totalAmount = lineItems.reduce((sum, item) => add(sum, item.amount), new Prisma.Decimal(0));

  const invoiceResult = await prisma.$transaction(async (tx) => {
    const rows = (await tx.$queryRaw`
      SELECT "id", "invoicePrefix", "nextInvoiceNumber"
      FROM "OrgSettings"
      WHERE "orgId" = ${params.orgId}
      FOR UPDATE
    `) as { id: string; invoicePrefix: string; nextInvoiceNumber: number }[];
    const row = rows[0];
    if (!row) {
      throw new Error("Settings not configured");
    }
    const nextNumber = row.nextInvoiceNumber;
    await tx.orgSettings.update({
      where: { orgId: params.orgId },
      data: { nextInvoiceNumber: nextNumber + 1 },
    });
    const invoiceNumber = `${row.invoicePrefix}${String(nextNumber).padStart(4, "0")}`;
    const invoice = await tx.invoice.create({
      data: {
        orgId: params.orgId,
        loadId: load.id,
        invoiceNumber,
        totalAmount,
        items: {
          create: lineItems,
        },
      },
    });
    await tx.load.update({
      where: { id: load.id },
      data: { status: LoadStatus.INVOICED },
    });
    return { invoice, invoiceNumber };
  });

  const { filePath } = await generateInvoicePdf({
    invoiceNumber: invoiceResult.invoiceNumber,
    load,
    stops: load.stops,
    settings,
    items: lineItems,
    totalAmount,
  });

  const packet = await generatePacketZip({
    orgId: params.orgId,
    invoiceNumber: invoiceResult.invoiceNumber,
    invoicePath: filePath,
    loadId: load.id,
    requiredDocs: settings.requiredDocs,
  });

  const invoice = await prisma.invoice.update({
    where: { id: invoiceResult.invoice.id },
    data: { pdfPath: filePath, packetPath: packet.filePath ?? null },
  });

  await createEvent({
    orgId: params.orgId,
    loadId: load.id,
    userId: params.userId,
    invoiceId: invoice.id,
    type: EventType.INVOICE_GENERATED,
    message: `Invoice ${invoiceResult.invoiceNumber} generated`,
  });

  if (packet.filePath) {
    await createEvent({
      orgId: params.orgId,
      loadId: load.id,
      userId: params.userId,
      invoiceId: invoice.id,
      type: EventType.PACKET_GENERATED,
      message: `Packet ${invoiceResult.invoiceNumber} generated`,
    });
  } else if (packet.missing.length > 0) {
    for (const docType of packet.missing) {
      await ensureTask({
        orgId: params.orgId,
        loadId: load.id,
        type: TaskType.MISSING_DOC,
        title: `Missing doc ${docType}`,
        priority: TaskPriority.HIGH,
        assignedRole: "BILLING",
        createdById: params.userId,
        dedupeKey: `MISSING_DOC:${docType}:load:${load.id}`,
      });
    }
  }

  await logAudit({
    orgId: params.orgId,
    userId: params.userId,
    action: "INVOICE_GENERATED",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Generated invoice ${invoiceResult.invoiceNumber} for ${load.loadNumber}`,
  });

  return { invoice, missingDocs: packet.missing } as const;
}

app.post(
  "/billing/invoices/:loadId/generate",
  requireAuth,
  requireCsrf,
  requirePermission(Permission.INVOICE_GENERATE),
  async (req, res) => {
  try {
    const result = await generateInvoiceForLoad({
      orgId: req.user!.orgId,
      loadId: req.params.loadId,
      userId: req.user!.id,
    });
    if ("missingDocs" in result && result.missingDocs.length > 0) {
      res.status(400).json({ error: "Missing required docs", missingDocs: result.missingDocs });
      return;
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post(
  "/billing/invoices/:invoiceId/packet",
  requireAuth,
  requireCsrf,
  requirePermission(Permission.INVOICE_SEND),
  async (req, res) => {
  let invoice;
  try {
    invoice = await requireOrgEntity(prisma.invoice, req.user!.orgId, req.params.invoiceId, "Invoice");
  } catch {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (!invoice.pdfPath) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  if (!settings) {
    res.status(400).json({ error: "Settings not configured" });
    return;
  }
  const packet = await generatePacketZip({
    orgId: req.user!.orgId,
    invoiceNumber: invoice.invoiceNumber,
    invoicePath: invoice.pdfPath,
    loadId: invoice.loadId,
    requiredDocs: settings.requiredDocs,
  });
  if (packet.missing.length > 0) {
    for (const docType of packet.missing) {
      await ensureTask({
        orgId: req.user!.orgId,
        loadId: invoice.loadId,
        type: TaskType.MISSING_DOC,
        title: `Missing doc ${docType}`,
        priority: TaskPriority.HIGH,
        assignedRole: "BILLING",
        createdById: req.user!.id,
        dedupeKey: `MISSING_DOC:${docType}:load:${invoice.loadId}`,
      });
    }
    res.status(400).json({ error: "Missing required docs", missingDocs: packet.missing });
    return;
  }
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { packetPath: packet.filePath },
  });
  await createEvent({
    orgId: req.user!.orgId,
    loadId: invoice.loadId,
    userId: req.user!.id,
    invoiceId: invoice.id,
    type: EventType.PACKET_GENERATED,
    message: `Packet ${invoice.invoiceNumber} generated`,
  });
  res.json({ packetPath: packet.filePath });
});

app.post("/billing/invoices/:invoiceId/status", requireAuth, requireCsrf, async (req, res) => {
  const schema = z.object({
    status: z.enum(["SENT", "ACCEPTED", "DISPUTED", "PAID", "SHORT_PAID", "VOID"]),
    disputeReason: z.string().optional(),
    disputeNotes: z.string().optional(),
    paymentRef: z.string().optional(),
    shortPaidAmount: z.union([z.number(), z.string()]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const requiredPermission =
    parsed.data.status === "VOID" ? Permission.INVOICE_VOID : Permission.INVOICE_SEND;
  if (!hasPermission(req.user, requiredPermission)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  let invoice;
  try {
    invoice = await requireOrgEntity(prisma.invoice, req.user!.orgId, req.params.invoiceId, "Invoice");
  } catch {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (parsed.data.status === "DISPUTED" && !parsed.data.disputeReason) {
    res.status(400).json({ error: "Dispute reason required" });
    return;
  }
  if (parsed.data.status === "SHORT_PAID" && parsed.data.shortPaidAmount === undefined) {
    res.status(400).json({ error: "shortPaidAmount required" });
    return;
  }

  const data: any = {
    status: parsed.data.status as InvoiceStatus,
  };
  if (parsed.data.status === "SENT" && !invoice.sentAt) {
    data.sentAt = new Date();
  }
  if (parsed.data.status === "PAID" || parsed.data.status === "SHORT_PAID") {
    data.paidAt = new Date();
    data.paymentRef = parsed.data.paymentRef ?? invoice.paymentRef;
    data.shortPaidAmount = parsed.data.shortPaidAmount ? toDecimal(parsed.data.shortPaidAmount) : invoice.shortPaidAmount;
  }
  if (parsed.data.status === "DISPUTED") {
    data.disputeReason = parsed.data.disputeReason;
    data.disputeNotes = parsed.data.disputeNotes ?? null;
  }
  if (parsed.data.status === "VOID") {
    data.voidedAt = new Date();
  }

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data,
  });

  if (parsed.data.status === "SENT") {
    await prisma.load.updateMany({
      where: { id: invoice.loadId, lockedAt: null },
      data: { lockedAt: new Date() },
    });
  }
  if (parsed.data.status === "DISPUTED") {
    await ensureTask({
      orgId: req.user!.orgId,
      invoiceId: invoice.id,
      loadId: invoice.loadId,
      type: TaskType.INVOICE_DISPUTE,
      title: `Invoice ${invoice.invoiceNumber} disputed`,
      priority: TaskPriority.HIGH,
      assignedRole: "BILLING",
      createdById: req.user!.id,
      dedupeKey: `INVOICE_DISPUTE:invoice:${invoice.id}`,
    });
  }

  await createEvent({
    orgId: req.user!.orgId,
    loadId: invoice.loadId,
    userId: req.user!.id,
    invoiceId: invoice.id,
    type: EventType.INVOICE_GENERATED,
    message: `Invoice ${invoice.invoiceNumber} status ${parsed.data.status}`,
    meta: { status: parsed.data.status },
  });

  res.json({ invoice: updated });
});

app.get("/invoices/:id/pdf", requireAuth, async (req, res) => {
  let invoice;
  try {
    invoice = await requireOrgEntity(prisma.invoice, req.user!.orgId, req.params.id, "Invoice");
  } catch {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (!invoice.pdfPath) {
    res.status(404).json({ error: "Invoice PDF not found" });
    return;
  }
  let relativePath = toRelativeUploadPath(invoice.pdfPath);
  if (!relativePath) {
    res.status(404).json({ error: "Invoice PDF not found" });
    return;
  }
  if (!relativePath.startsWith("invoices/")) {
    relativePath = path.posix.join("invoices", path.basename(relativePath));
  }
  const baseDir = getUploadDir();
  let filePath: string;
  try {
    filePath = resolveUploadPath(relativePath);
  } catch {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }
  console.log("Invoice PDF", { baseDir, filePath });
  let stat;
  try {
    stat = await fsPromises.stat(filePath);
  } catch {
    res.status(404).json({ error: "Invoice PDF not found" });
    return;
  }
  if (stat.size === 0) {
    res.status(404).json({ error: "Invoice PDF not found" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}.pdf"`);
  res.setHeader("Cache-Control", "private, no-store");
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(404).json({ error: "Invoice PDF not found" });
    } else {
      res.end();
    }
  });
  stream.pipe(res);
});

app.get("/settlements", requireAuth, async (req, res) => {
  const role = req.user!.role;
  const isDriver = role === "DRIVER";
  if (!isDriver && !hasPermission(req.user, Permission.SETTLEMENT_GENERATE)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const includeInvalid = req.query.includeInvalid === "true";
  const allowIncludeInvalid = includeInvalid && role === "ADMIN";

  let driverId = typeof req.query.driverId === "string" ? req.query.driverId : undefined;
  if (isDriver) {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }
    driverId = driver.id;
  } else if (driverId && !["ADMIN", "DISPATCHER", "BILLING"].includes(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const statusParam = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;
  const groupBy = req.query.groupBy === "none" ? "none" : "week";
  const weekParam = typeof req.query.week === "string" ? req.query.week : undefined;
  const fromParam = typeof req.query.from === "string" ? req.query.from : undefined;
  const toParam = typeof req.query.to === "string" ? req.query.to : undefined;

  let fromDate = fromParam ? parseDateInput(fromParam, "start") : null;
  let toDate = toParam ? parseDateInput(toParam, "end") : null;
  if (weekParam) {
    const match = /^(\d{4})-W(\d{2})$/.exec(weekParam);
    if (!match) {
      res.status(400).json({ error: "Invalid week format" });
      return;
    }
    const year = Number(match[1]);
    const week = Number(match[2]);
    const firstWeekStart = startOfISOWeek(new Date(Date.UTC(year, 0, 4)));
    const weekStart = addDays(firstWeekStart, (week - 1) * 7);
    fromDate = weekStart;
    toDate = endOfISOWeek(weekStart);
  }
  if (fromDate && Number.isNaN(fromDate.getTime())) fromDate = null;
  if (toDate && Number.isNaN(toDate.getTime())) toDate = null;

  const where: any = { orgId: req.user!.orgId };
  if (driverId) {
    where.driverId = driverId;
  }
  if (statusParam === "PENDING") {
    where.status = { in: [SettlementStatus.DRAFT, SettlementStatus.FINALIZED] };
  } else if (statusParam && Object.values(SettlementStatus).includes(statusParam as SettlementStatus)) {
    where.status = statusParam as SettlementStatus;
  }
  if (fromDate || toDate) {
    where.periodEnd = {};
    if (fromDate) where.periodEnd.gte = fromDate;
    if (toDate) where.periodEnd.lte = toDate;
  }

  const settlements = await prisma.settlement.findMany({
    where,
    include: { driver: true },
    orderBy: { periodEnd: "desc" },
  });

  const filtered = allowIncludeInvalid
    ? settlements
    : settlements.filter((settlement) => settlement.periodStart <= settlement.periodEnd);

  const enriched = filtered.map((settlement) => {
    const periodEnd = settlement.periodEnd ?? settlement.periodStart;
    const weekKey = getWeekKey(periodEnd);
    const weekLabel = getWeekLabel(periodEnd);
    return { ...settlement, weekKey, weekLabel };
  });

  let totalNet = new Prisma.Decimal(0);
  for (const item of enriched) {
    const base = item.net ?? item.gross ?? new Prisma.Decimal(0);
    totalNet = add(totalNet, toDecimal(base) ?? new Prisma.Decimal(0));
  }
  const totals = { count: enriched.length, net: totalNet.toFixed(2) };

  const weeks = Array.from(
    new Map(enriched.map((item) => [item.weekKey, item.weekLabel])).entries()
  ).map(([weekKey, weekLabel]) => ({ weekKey, weekLabel }));

  if (groupBy === "week") {
    const groups = Array.from(
      enriched.reduce((map, item) => {
        const existing = map.get(item.weekKey) || {
          weekKey: item.weekKey,
          weekLabel: item.weekLabel,
          settlements: [],
          totals: { count: 0, net: "0.00" },
        };
        existing.settlements.push(item);
        map.set(item.weekKey, existing);
        return map;
      }, new Map<string, any>())
    ).map(([, group]) => {
      let groupNet = new Prisma.Decimal(0);
      for (const item of group.settlements) {
        const base = item.net ?? item.gross ?? new Prisma.Decimal(0);
        groupNet = add(groupNet, toDecimal(base) ?? new Prisma.Decimal(0));
      }
      return { ...group, totals: { count: group.settlements.length, net: groupNet.toFixed(2) } };
    });
    res.json({ groups, totals, weeks });
    return;
  }

  res.json({ settlements: enriched, totals, weeks });
});

app.get("/settlements/:id", requireAuth, async (req, res) => {
  const role = req.user!.role;
  const isDriver = role === "DRIVER";
  if (!isDriver && !hasPermission(req.user, Permission.SETTLEMENT_GENERATE)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  let settlement;
  try {
    settlement = await requireOrgEntity(prisma.settlement, req.user!.orgId, req.params.id, "Settlement");
  } catch {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }
  if (isDriver) {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver || settlement.driverId !== driver.id) {
      res.status(404).json({ error: "Settlement not found" });
      return;
    }
  }
  const fullSettlement = await prisma.settlement.findFirst({
    where: { id: settlement.id, orgId: req.user!.orgId },
    include: { driver: true, items: { include: { load: true } } },
  });
  if (!fullSettlement) {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }
  res.json({ settlement: fullSettlement });
});

app.post("/settlements/generate", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_GENERATE), async (req, res) => {
  const schema = z.object({
    driverId: z.string(),
    periodStart: z.string(),
    periodEnd: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const periodStart = parseDateInput(parsed.data.periodStart, "start");
  const periodEnd = parseDateInput(parsed.data.periodEnd, "end");
  if (!periodStart || !periodEnd) {
    res.status(400).json({ error: "Invalid dates" });
    return;
  }
  if (periodStart.getTime() > periodEnd.getTime()) {
    res.status(400).json({ error: "periodStart must be <= periodEnd" });
    return;
  }
  const existing = await prisma.settlement.findFirst({
    where: {
      orgId: req.user!.orgId,
      driverId: parsed.data.driverId,
      periodStart,
      periodEnd,
    },
  });
  if (existing) {
    res.status(409).json({ error: "Settlement already exists", settlementId: existing.id });
    return;
  }
  const driver = await prisma.driver.findFirst({
    where: { id: parsed.data.driverId, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  const rate = toDecimal(driver.payRatePerMile ?? settings?.driverRatePerMile ?? 0) ?? new Prisma.Decimal(0);
  const loads = await prisma.load.findMany({
    where: {
      orgId: req.user!.orgId,
      assignedDriverId: driver.id,
      deliveredAt: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true, loadNumber: true, miles: true },
  });
  if (loads.length === 0) {
    res.status(409).json({
      error: "No delivered loads in range",
      meta: {
        driverId: driver.id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
    });
    return;
  }
  let gross = new Prisma.Decimal(0);
  const items = loads.map((load) => {
    const miles = toDecimalFixed(load.miles ?? 0, 2) ?? new Prisma.Decimal(0);
    const amount = mul(rate, miles);
    gross = add(gross, amount);
    return {
      loadId: load.id,
      code: "CPM",
      description: `Miles for ${load.loadNumber ?? load.id}`,
      amount,
    };
  });

  const settlement = await prisma.settlement.create({
    data: {
      orgId: req.user!.orgId,
      driverId: driver.id,
      periodStart,
      periodEnd,
      gross,
      deductions: new Prisma.Decimal(0),
      net: gross,
      items: { create: items },
    },
    include: { items: true },
  });
  await createEvent({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    type: EventType.SETTLEMENT_GENERATED,
    message: `Settlement generated for ${driver.name}`,
    meta: { settlementId: settlement.id },
  });
  res.json({ settlement });
});

app.post("/settlements/:id/finalize", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_FINALIZE), async (req, res) => {
  let settlement;
  try {
    settlement = await requireOrgEntity(prisma.settlement, req.user!.orgId, req.params.id, "Settlement");
  } catch {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }
  if (settlement.status !== SettlementStatus.DRAFT) {
    res.status(400).json({ error: "Settlement not in draft" });
    return;
  }
  const itemCount = await prisma.settlementItem.count({ where: { settlementId: settlement.id } });
  if (itemCount === 0) {
    res.status(400).json({ error: "Settlement has no items" });
    return;
  }
  const updated = await prisma.settlement.update({
    where: { id: settlement.id },
    data: { status: SettlementStatus.FINALIZED, finalizedAt: new Date() },
  });
  await createEvent({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    type: EventType.SETTLEMENT_FINALIZED,
    message: `Settlement finalized`,
    meta: { settlementId: updated.id },
  });
  res.json({ settlement: updated });
});

app.post("/settlements/:id/paid", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_FINALIZE), async (req, res) => {
  let settlement;
  try {
    settlement = await requireOrgEntity(prisma.settlement, req.user!.orgId, req.params.id, "Settlement");
  } catch {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }
  const itemCount = await prisma.settlementItem.count({ where: { settlementId: settlement.id } });
  if (itemCount === 0) {
    res.status(400).json({ error: "Settlement has no items" });
    return;
  }
  const updated = await prisma.settlement.update({
    where: { id: settlement.id },
    data: { status: SettlementStatus.PAID, paidAt: new Date() },
  });
  await createEvent({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    type: EventType.SETTLEMENT_PAID,
    message: `Settlement paid`,
    meta: { settlementId: updated.id },
  });
  res.json({ settlement: updated });
});

app.get("/files/:type/:name", requireAuth, async (req, res) => {
  const type = req.params.type;
  const name = req.params.name;
  if (type !== "docs" && type !== "invoices" && type !== "packets") {
    res.status(400).json({ error: "Invalid file type" });
    return;
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    res.status(400).json({ error: "Invalid file name" });
    return;
  }
  let allowed = false;
  if (type === "docs") {
    const doc = await prisma.document.findFirst({
      where: { orgId: req.user!.orgId, filename: name },
    });
    allowed = Boolean(doc);
  } else if (type === "invoices") {
    const relPath = `${type}/${name}`;
    const invoice = await prisma.invoice.findFirst({
      where: {
        orgId: req.user!.orgId,
        OR: [{ pdfPath: relPath }, { pdfPath: { endsWith: `/${type}/${name}` } }],
      },
    });
    allowed = Boolean(invoice);
  } else if (type === "packets") {
    const relPath = `${type}/${name}`;
    const invoice = await prisma.invoice.findFirst({
      where: {
        orgId: req.user!.orgId,
        OR: [{ packetPath: relPath }, { packetPath: { endsWith: `/${type}/${name}` } }],
      },
    });
    allowed = Boolean(invoice);
  }
  if (!allowed) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  let filePath: string;
  try {
    filePath = resolveUploadPath(`${type}/${name}`);
  } catch {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }
  res.sendFile(filePath);
});

app.get("/storage", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  const records = await prisma.storageRecord.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { checkInAt: "desc" },
  });
  res.json({ records });
});

app.post("/storage/checkin", requireAuth, requireCsrf, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  const schema = z.object({
    loadId: z.string().optional(),
    checkInAt: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  if (!settings) {
    res.status(400).json({ error: "Settings not configured" });
    return;
  }
  const record = await prisma.storageRecord.create({
    data: {
      orgId: req.user!.orgId,
      loadId: parsed.data.loadId ?? null,
      checkInAt: parsed.data.checkInAt ? new Date(parsed.data.checkInAt) : new Date(),
      freeMinutes: settings.freeStorageMinutes,
      ratePerDay: settings.storageRatePerDay,
    },
  });
  res.json({ record });
});

app.post("/storage/:id/checkout", requireAuth, requireCsrf, requireRole("ADMIN", "DISPATCHER"), async (req, res) => {
  let record;
  try {
    record = await requireOrgEntity(prisma.storageRecord, req.user!.orgId, req.params.id, "Record");
  } catch {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  const checkOutAt = new Date();
  const { dwellMinutes, suggestedCharge } = calculateStorageCharge({
    checkInAt: record.checkInAt,
    checkOutAt,
    freeMinutes: record.freeMinutes,
    ratePerDay: record.ratePerDay,
  });
  const updated = await prisma.storageRecord.update({
    where: { id: record.id },
    data: { checkOutAt, dwellMinutes, suggestedCharge },
  });
  res.json({ record: updated });
});

app.get("/audit", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING"), async (req, res) => {
  const { loadNumber, userId, startDate, endDate } = req.query;
  const load = loadNumber
    ? await prisma.load.findFirst({ where: { loadNumber: String(loadNumber), orgId: req.user!.orgId } })
    : null;
  const audits = await prisma.auditLog.findMany({
    where: {
      orgId: req.user!.orgId,
      userId: userId ? String(userId) : undefined,
      entityId: load ? load.id : undefined,
      createdAt: {
        gte: startDate ? new Date(String(startDate)) : undefined,
        lte: endDate ? new Date(String(endDate)) : undefined,
      },
    },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ audits });
});

app.get("/admin/settings", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  res.json({ settings });
});

app.put("/admin/settings", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    companyDisplayName: z.string(),
    remitToAddress: z.string(),
    invoiceTerms: z.string(),
    invoiceTermsDays: z.number().optional(),
    invoiceFooter: z.string(),
    invoicePrefix: z.string(),
    nextInvoiceNumber: z.number(),
    podRequireSignature: z.boolean(),
    podRequirePrintedName: z.boolean(),
    podRequireDeliveryDate: z.boolean(),
    podMinPages: z.number(),
    requiredDocs: z.array(z.nativeEnum(DocType)),
    requiredDriverDocs: z.array(z.nativeEnum(DriverDocType)),
    collectPodDueMinutes: z.number(),
    missingPodAfterMinutes: z.number(),
    reminderFrequencyMinutes: z.number(),
    timezone: z.string().optional(),
    freeStorageMinutes: z.number(),
    storageRatePerDay: z.union([z.number(), z.string()]),
    pickupFreeDetentionMinutes: z.number().optional(),
    deliveryFreeDetentionMinutes: z.number().optional(),
    detentionRatePerHour: z.union([z.number(), z.string()]).optional(),
    driverRatePerMile: z.union([z.number(), z.string()]),
    logoUrl: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const settings = await prisma.orgSettings.update({
    where: { orgId: req.user!.orgId },
    data: {
      ...parsed.data,
      storageRatePerDay: toDecimal(parsed.data.storageRatePerDay) ?? new Prisma.Decimal(0),
      detentionRatePerHour: parsed.data.detentionRatePerHour ? toDecimal(parsed.data.detentionRatePerHour) : null,
      driverRatePerMile: toDecimal(parsed.data.driverRatePerMile) ?? new Prisma.Decimal(0),
      pickupFreeDetentionMinutes: parsed.data.pickupFreeDetentionMinutes ?? 120,
      deliveryFreeDetentionMinutes: parsed.data.deliveryFreeDetentionMinutes ?? 120,
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "SETTINGS_UPDATED",
    entity: "OrgSettings",
    entityId: settings.id,
    summary: "Updated admin settings",
  });
  res.json({ settings });
});

app.get("/admin/users", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users });
});

app.post("/imports/preview", requireAuth, requirePermission(Permission.ADMIN_SETTINGS), async (req, res) => {
  const schema = z.object({
    type: z.enum(["drivers", "employees"]),
    csvText: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const { columns, rows } = parseCsvText(parsed.data.csvText);
  const columnMap = new Map(columns.map((header) => [normalizeHeader(header), header]));
  const requiredColumns =
    parsed.data.type === "employees" ? ["email", "role"] : ["name", "phone"];
  const missingColumns = requiredColumns.filter((col) => !columnMap.has(col));
  if (missingColumns.length > 0) {
    res.status(400).json({ error: `Missing required columns: ${missingColumns.join(", ")}` });
    return;
  }

  const previewRows = rows.map((row, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];
    const getValue = (key: string) => {
      const header = columnMap.get(key);
      return header ? row[header] ?? "" : "";
    };
    const isEmpty = Object.values(row).every((value) => !String(value ?? "").trim());
    if (isEmpty) {
      errors.push("Empty row");
    }

    if (parsed.data.type === "employees") {
      const email = normalizeEmail(getValue("email"));
      const role = getValue("role").trim().toUpperCase();
      const name = getValue("name").trim();
      const phone = normalizePhone(getValue("phone"));
      const timezone = getValue("timezone").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push("Invalid email");
      }
      if (!["ADMIN", "DISPATCHER", "BILLING"].includes(role)) {
        errors.push("Role must be ADMIN, DISPATCHER, or BILLING");
      }
      return { rowNumber, data: { email, role, name, phone, timezone }, errors };
    }

    const name = getValue("name").trim();
    const phone = normalizePhone(getValue("phone"));
    const license = getValue("license").trim();
    const payRatePerMile = getValue("payRatePerMile").trim();
    const licenseExpiresAt = getValue("licenseExpiresAt").trim();
    const medCardExpiresAt = getValue("medCardExpiresAt").trim();
    if (!name) errors.push("Name is required");
    if (!phone) errors.push("Phone is required");
    if (payRatePerMile && Number.isNaN(Number(payRatePerMile))) {
      errors.push("Invalid payRatePerMile");
    }
    if (licenseExpiresAt && !toDate(licenseExpiresAt)) {
      errors.push("Invalid licenseExpiresAt");
    }
    if (medCardExpiresAt && !toDate(medCardExpiresAt)) {
      errors.push("Invalid medCardExpiresAt");
    }
    return {
      rowNumber,
      data: { name, phone, license, payRatePerMile, licenseExpiresAt, medCardExpiresAt },
      errors,
    };
  });

  const valid = previewRows.filter((row) => row.errors.length === 0).length;
  const invalid = previewRows.length - valid;
  res.json({ columns, rows: previewRows, summary: { total: previewRows.length, valid, invalid } });
});

app.post("/imports/commit", requireAuth, requirePermission(Permission.ADMIN_SETTINGS), async (req, res) => {
  const schema = z.object({
    type: z.enum(["drivers", "employees"]),
    csvText: z.string().min(1),
    importId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const { columns, rows } = parseCsvText(parsed.data.csvText);
  const columnMap = new Map(columns.map((header) => [normalizeHeader(header), header]));
  const requiredColumns =
    parsed.data.type === "employees" ? ["email", "role"] : ["name", "phone"];
  const missingColumns = requiredColumns.filter((col) => !columnMap.has(col));
  if (missingColumns.length > 0) {
    res.status(400).json({ error: `Missing required columns: ${missingColumns.join(", ")}` });
    return;
  }

  const created: any[] = [];
  const updated: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  const getValue = (row: Record<string, string>, key: string) => {
    const header = columnMap.get(key);
    return header ? row[header] ?? "" : "";
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const rowErrors: string[] = [];
    const isEmpty = Object.values(row).every((value) => !String(value ?? "").trim());
    if (isEmpty) {
      skipped.push({ rowNumber, reason: "Empty row" });
      continue;
    }

    if (parsed.data.type === "employees") {
      const email = normalizeEmail(getValue(row, "email"));
      const role = getValue(row, "role").trim().toUpperCase();
      const name = getValue(row, "name").trim();
      const timezone = getValue(row, "timezone").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        rowErrors.push("Invalid email");
      }
      if (!["ADMIN", "DISPATCHER", "BILLING"].includes(role)) {
        rowErrors.push("Role must be ADMIN, DISPATCHER, or BILLING");
      }
      if (rowErrors.length > 0) {
        errors.push({ rowNumber, errors: rowErrors });
        continue;
      }

      const existing = await prisma.user.findFirst({
        where: { orgId: req.user!.orgId, email },
      });
      if (existing && existing.role === "DRIVER") {
        errors.push({ rowNumber, errors: ["Existing user is a DRIVER"] });
        continue;
      }
      if (existing) {
        const user = await prisma.user.update({
          where: { id: existing.id },
          data: { role: role as Role, name: name || existing.name, timezone: timezone || existing.timezone },
        });
        updated.push({ rowNumber, id: user.id, email: user.email });
      } else {
        const tempPassword = crypto.randomBytes(16).toString("hex");
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        const user = await prisma.user.create({
          data: {
            orgId: req.user!.orgId,
            email,
            passwordHash,
            role: role as Role,
            name: name || null,
            timezone: timezone || null,
          },
        });
        created.push({ rowNumber, id: user.id, email: user.email });
      }
      continue;
    }

    const name = getValue(row, "name").trim();
    const phone = normalizePhone(getValue(row, "phone"));
    const license = getValue(row, "license").trim() || null;
    const payRateRaw = getValue(row, "payRatePerMile").trim();
    const licenseExpiresAtRaw = getValue(row, "licenseExpiresAt").trim();
    const medCardExpiresAtRaw = getValue(row, "medCardExpiresAt").trim();
    if (!name) rowErrors.push("Name is required");
    if (!phone) rowErrors.push("Phone is required");
    if (payRateRaw && Number.isNaN(Number(payRateRaw))) {
      rowErrors.push("Invalid payRatePerMile");
    }
    if (licenseExpiresAtRaw && !toDate(licenseExpiresAtRaw)) {
      rowErrors.push("Invalid licenseExpiresAt");
    }
    if (medCardExpiresAtRaw && !toDate(medCardExpiresAtRaw)) {
      rowErrors.push("Invalid medCardExpiresAt");
    }
    if (rowErrors.length > 0) {
      errors.push({ rowNumber, errors: rowErrors });
      continue;
    }

    const existing = await prisma.driver.findFirst({
      where: { orgId: req.user!.orgId, phone },
    });
    const payload = {
      name,
      phone,
      license,
      payRatePerMile: payRateRaw ? toDecimal(payRateRaw) : null,
      licenseExpiresAt: licenseExpiresAtRaw ? toDate(licenseExpiresAtRaw) : null,
      medCardExpiresAt: medCardExpiresAtRaw ? toDate(medCardExpiresAtRaw) : null,
    };
    if (existing) {
      const driver = await prisma.driver.update({
        where: { id: existing.id },
        data: payload,
      });
      updated.push({ rowNumber, id: driver.id, phone: driver.phone });
    } else {
      const driver = await prisma.driver.create({
        data: { orgId: req.user!.orgId, ...payload },
      });
      created.push({ rowNumber, id: driver.id, phone: driver.phone });
    }
  }

  await createEvent({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    type: EventType.IMPORT_COMPLETED,
    message: `Import ${parsed.data.type} completed`,
    meta: {
      type: parsed.data.type,
      created: created.length,
      updated: updated.length,
      skipped: skipped.length,
      errors: errors.length,
      importId: parsed.data.importId,
    },
  });

  res.json({ created, updated, skipped, errors });
});

app.post("/users/invite-bulk", requireAuth, requirePermission(Permission.ADMIN_SETTINGS), async (req, res) => {
  const schema = z.object({ userIds: z.array(z.string()).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const users = await prisma.user.findMany({
    where: { id: { in: parsed.data.userIds }, orgId: req.user!.orgId },
  });
  const inviteBase = process.env.WEB_ORIGIN || "http://localhost:3000";
  const invites = [];
  for (const user of users) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.userInvite.create({
      data: { orgId: req.user!.orgId, userId: user.id, tokenHash, expiresAt },
    });
    invites.push({
      userId: user.id,
      email: user.email,
      inviteUrl: `${inviteBase}/invite/${token}`,
    });
  }
  res.json({ invites });
});

app.get("/invite/:token", async (req, res) => {
  const tokenHash = hashInviteToken(req.params.token);
  const invite = await prisma.userInvite.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() }, usedAt: null },
    include: { user: true, org: true },
  });
  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  res.json({
    invite: {
      id: invite.id,
      expiresAt: invite.expiresAt,
      user: { id: invite.user.id, email: invite.user.email, name: invite.user.name },
      org: { id: invite.org.id, name: invite.org.name },
    },
  });
});

app.post("/invite/:token/accept", async (req, res) => {
  const schema = z.object({
    password: z.string().min(8),
    name: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const tokenHash = hashInviteToken(req.params.token);
  const invite = await prisma.userInvite.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() }, usedAt: null },
  });
  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: invite.userId },
    data: { passwordHash, isActive: true, name: parsed.data.name ?? undefined },
  });
  await prisma.userInvite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });
  res.json({ ok: true });
});

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [] as Record<string, string>[];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function parseCsvText(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { columns: [] as string[], rows: [] as Record<string, string>[] };
  }
  const columns = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    columns.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
  return { columns, rows };
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function getWeekKey(date: Date) {
  const year = getISOWeekYear(date);
  const week = String(getISOWeek(date)).padStart(2, "0");
  return `${year}-W${week}`;
}

function getWeekLabel(date: Date) {
  const start = startOfISOWeek(date);
  const end = endOfISOWeek(date);
  return `Week of ${format(start, "MMM d")}–${format(end, "MMM d")}`;
}

function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function toNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
}

function toDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

app.post(
  "/admin/import/loads",
  requireAuth,
  requireCsrf,
  requireRole("ADMIN", "DISPATCHER"),
  csvUpload.fields([
    { name: "loads", maxCount: 1 },
    { name: "stops", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]>;
    const loadsFile = files?.loads?.[0];
    const stopsFile = files?.stops?.[0];
    if (!loadsFile || !stopsFile) {
      res.status(400).json({ error: "Both loads.csv and stops.csv are required." });
      return;
    }

    const wipe = String(req.body?.wipe || "").toLowerCase() === "true";
    const orgId = req.user!.orgId;

    if (wipe) {
      await prisma.task.deleteMany({ where: { orgId } });
      await prisma.event.deleteMany({ where: { orgId } });
      await prisma.document.deleteMany({ where: { orgId } });
      await prisma.invoice.deleteMany({ where: { orgId } });
      await prisma.stop.deleteMany({ where: { orgId } });
      await prisma.load.deleteMany({ where: { orgId } });
    }

    const loadRows = parseCsv(loadsFile.buffer.toString("utf8"));
    const stopRows = parseCsv(stopsFile.buffer.toString("utf8"));

    const existingLoads = await prisma.load.findMany({
      where: { orgId },
      select: { id: true, loadNumber: true },
    });
    const loadMap = new Map(existingLoads.map((load) => [load.loadNumber, load]));

    const existingCustomers = await prisma.customer.findMany({
      where: { orgId },
      select: { id: true, name: true },
    });
    const customerMap = new Map(
      existingCustomers.map((customer) => [customer.name.toLowerCase(), customer.id])
    );

    const drivers = await prisma.user.findMany({
      where: { orgId, role: "DRIVER" },
      include: { driver: true },
    });
    const driverMap = new Map(
      drivers
        .filter((user) => user.driver)
        .map((user) => [user.email.toLowerCase(), user.driver!.id])
    );

    const trucks = await prisma.truck.findMany({ where: { orgId } });
    const trailers = await prisma.trailer.findMany({ where: { orgId } });
    const truckMap = new Map(trucks.map((truck) => [truck.unit.toLowerCase(), truck.id]));
    const trailerMap = new Map(trailers.map((trailer) => [trailer.unit.toLowerCase(), trailer.id]));

    let createdLoads = 0;
    let skippedLoads = 0;
    for (const row of loadRows) {
      const loadNumber = row.loadNumber?.trim();
      if (!loadNumber || loadMap.has(loadNumber)) {
        skippedLoads += 1;
        continue;
      }

      const driverEmail = row.assignedDriverEmail?.trim().toLowerCase();
      const truckUnit = row.truckUnit?.trim().toLowerCase();
      const trailerUnit = row.trailerUnit?.trim().toLowerCase();
      const customerName = row.customerName?.trim() || "Unknown";
      const customerKey = customerName.toLowerCase();
      let customerId = customerMap.get(customerKey);
      if (!customerId) {
        const created = await prisma.customer.create({
          data: { orgId, name: customerName },
        });
        customerId = created.id;
        customerMap.set(customerKey, created.id);
      }

      let truckId = truckUnit ? truckMap.get(truckUnit) : undefined;
      if (!truckId && truckUnit) {
        const truck = await prisma.truck.create({ data: { orgId, unit: row.truckUnit } });
        truckId = truck.id;
        truckMap.set(truckUnit, truck.id);
      }

      let trailerId = trailerUnit ? trailerMap.get(trailerUnit) : undefined;
      if (!trailerId && trailerUnit) {
        const trailer = await prisma.trailer.create({ data: { orgId, unit: row.trailerUnit } });
        trailerId = trailer.id;
        trailerMap.set(trailerUnit, trailer.id);
      }

      const assignedDriverId = driverEmail ? driverMap.get(driverEmail) : undefined;
      const status = row.status?.trim() || (assignedDriverId ? "ASSIGNED" : "PLANNED");
      const rateValue = toNumber(row.rate ?? "") ?? undefined;

      const load = await prisma.load.create({
        data: {
          orgId,
          loadNumber,
          customerId,
          customerName,
          miles: toNumber(row.miles ?? "") ?? undefined,
          rate: rateValue !== undefined ? new Prisma.Decimal(rateValue) : undefined,
          assignedDriverId: assignedDriverId ?? null,
          truckId: truckId ?? null,
          trailerId: trailerId ?? null,
          status: status as any,
        },
      });
      loadMap.set(loadNumber, load);
      createdLoads += 1;
    }

    let createdStops = 0;
    let skippedStops = 0;
    for (const row of stopRows) {
      const loadNumber = row.loadNumber?.trim();
      if (!loadNumber || !loadMap.has(loadNumber)) {
        skippedStops += 1;
        continue;
      }
      const load = loadMap.get(loadNumber)!;
      const sequence = Number(row.sequence || 0);
      if (!sequence) {
        skippedStops += 1;
        continue;
      }

      const existing = await prisma.stop.findFirst({
        where: { loadId: load.id, orgId, sequence },
      });
      if (existing) {
        skippedStops += 1;
        continue;
      }

      await prisma.stop.create({
        data: {
          orgId,
          loadId: load.id,
          type: (row.type || "PICKUP") as any,
          name: row.name || "Unknown",
          address: row.address || "",
          city: row.city || "",
          state: row.state || "",
          zip: row.zip || "",
          appointmentStart: toDate(row.appointmentStart || "") ?? undefined,
          appointmentEnd: toDate(row.appointmentEnd || "") ?? undefined,
          arrivedAt: toDate(row.arrivedAt || "") ?? undefined,
          departedAt: toDate(row.departedAt || "") ?? undefined,
          sequence,
        },
      });
      createdStops += 1;
    }

    res.json({ createdLoads, skippedLoads, createdStops, skippedStops });
  }
);

app.post("/admin/drivers", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string().min(2),
    phone: z.string().optional(),
    license: z.string().optional(),
    licenseState: z.string().optional(),
    licenseExpiresAt: z.string().optional(),
    medCardExpiresAt: z.string().optional(),
    payRatePerMile: z.union([z.number(), z.string()]).optional(),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const { user, driver } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        orgId: req.user!.orgId,
        email: parsed.data.email,
        name: parsed.data.name,
        role: "DRIVER",
        passwordHash,
      },
    });
    const driver = await tx.driver.create({
      data: {
        orgId: req.user!.orgId,
        userId: user.id,
        name: parsed.data.name,
        phone: parsed.data.phone,
        license: parsed.data.license,
        licenseState: parsed.data.licenseState,
        licenseExpiresAt: parsed.data.licenseExpiresAt ? new Date(parsed.data.licenseExpiresAt) : null,
        medCardExpiresAt: parsed.data.medCardExpiresAt ? new Date(parsed.data.medCardExpiresAt) : null,
        payRatePerMile: parsed.data.payRatePerMile ? toDecimal(parsed.data.payRatePerMile) : null,
      },
    });
    return { user, driver };
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "DRIVER_CREATED",
    entity: "Driver",
    entityId: driver.id,
    summary: `Created driver ${driver.name}`,
  });
  res.json({ user, driver });
});

app.post("/admin/users", requireAuth, requireCsrf, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    role: z.enum(["ADMIN", "DISPATCHER", "BILLING", "DRIVER"]),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      orgId: req.user!.orgId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash,
    },
  });
  await logAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action: "USER_CREATED",
    entity: "User",
    entityId: user.id,
    summary: `Created user ${user.email}`,
  });
  res.json({ user });
});

const port = Number(process.env.API_PORT || 4000);
ensureUploadDirs().then(() => {
  app.listen(port, () => {
    console.log(`API listening on ${port}`);
  });
});

import "dotenv/config";
import { prisma } from "@truckerio/db";

const LOOKBACK_HOURS = Number.parseInt(process.env.KERNEL_REPORT_LOOKBACK_HOURS ?? "24", 10);
const ACTIONS = [
  "STATE_KERNEL_DIVERGENCE",
  "STATE_KERNEL_ENFORCE_VIOLATION",
  "STATE_KERNEL_ENFORCE_BLOCKED",
] as const;

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonObject;
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isSyntheticSmokeActor(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.startsWith("dispatch+ke-") && normalized.endsWith("@test.local");
}

async function resolveOrgId() {
  const explicitOrgId = (process.env.ORG_ID ?? "").trim();
  if (explicitOrgId) return explicitOrgId;

  const orgName = (process.env.ORG_NAME ?? "").trim();
  if (!orgName) {
    throw new Error("Set ORG_ID or ORG_NAME for kernel divergence report.");
  }

  const org = await prisma.organization.findFirst({
    where: { name: { equals: orgName, mode: "insensitive" } },
    select: { id: true },
  });
  if (!org) {
    throw new Error(`Org not found for ORG_NAME=${orgName}`);
  }
  return org.id;
}

async function main() {
  const orgId = await resolveOrgId();
  const lookbackHours = Number.isFinite(LOOKBACK_HOURS) && LOOKBACK_HOURS > 0 ? LOOKBACK_HOURS : 24;
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const rows = await prisma.auditLog.findMany({
    where: {
      orgId,
      action: { in: [...ACTIONS] },
      createdAt: { gte: since },
    },
    select: {
      action: true,
      summary: true,
      meta: true,
      createdAt: true,
      user: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const filteredRows = rows.filter((row) => !isSyntheticSmokeActor(row.user.email));
  const excludedSyntheticRows = rows.length - filteredRows.length;

  const byAction = new Map<string, number>();
  const byRoute = new Map<string, number>();
  let blockingKernelViolations = 0;
  let enforceBlocked = 0;

  for (const row of filteredRows) {
    byAction.set(row.action, (byAction.get(row.action) ?? 0) + 1);
    if (row.action === "STATE_KERNEL_ENFORCE_BLOCKED") {
      enforceBlocked += 1;
    }

    const meta = asObject(row.meta);
    const route = asString(meta.route) || "(unknown-route)";
    const method = asString(meta.method) || "(unknown-method)";
    const key = `${method} ${route}`;
    byRoute.set(key, (byRoute.get(key) ?? 0) + 1);

    if (asBool(meta.hasBlockingKernelViolations)) {
      blockingKernelViolations += 1;
    }
  }

  const summary = {
    orgId,
    lookbackHours,
    since: since.toISOString(),
    totalRows: filteredRows.length,
    excludedSyntheticRows,
    byAction: Object.fromEntries([...byAction.entries()].sort((a, b) => b[1] - a[1])),
    topRoutes: [...byRoute.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([route, count]) => ({ route, count })),
    blockingKernelViolations,
    enforceBlocked,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (enforceBlocked > 0 || blockingKernelViolations > 0) {
    throw new Error(
      `Kernel report failed: enforceBlocked=${enforceBlocked}, blockingKernelViolations=${blockingKernelViolations}`
    );
  }

  console.log("kernel-divergence-report: PASS");
}

main()
  .catch((error) => {
    console.error("kernel-divergence-report: FAIL");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

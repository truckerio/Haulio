import { z } from "zod";
import type { AuthRequest } from "./auth";
import { logAudit } from "./audit";
import { Prisma } from "@truckerio/db";

const deleteOrgSchema = z.object({
  confirm: z.string(),
  orgId: z.string().min(1),
  confirmName: z.string().min(1),
  reason: z.string().optional(),
});

export type DeleteOrgPayload = z.infer<typeof deleteOrgSchema>;

export function parseDeleteOrgPayload(body: unknown): { ok: true; data: DeleteOrgPayload } | { ok: false } {
  const parsed = deleteOrgSchema.safeParse(body);
  if (!parsed.success) return { ok: false };
  return { ok: true, data: parsed.data };
}

export function parseDeleteOrgAllowlist(value: string | undefined) {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return new Set(entries);
}

export async function deleteOrganizationData(tx: Prisma.TransactionClient, orgId: string) {
  await tx.event.deleteMany({ where: { orgId } });
  await tx.task.deleteMany({ where: { orgId } });
  await tx.assignmentSuggestionLog.deleteMany({ where: { orgId } });
  await tx.loadConfirmationExtractEvent.deleteMany({ where: { orgId } });
  await tx.loadConfirmationLearningExample.deleteMany({ where: { orgId } });
  await tx.loadConfirmationDocument.deleteMany({ where: { orgId } });
  await tx.learnedMapping.deleteMany({ where: { orgId } });
  await tx.learningExample.deleteMany({ where: { orgId } });
  await tx.accessorial.deleteMany({ where: { orgId } });
  await tx.document.deleteMany({ where: { orgId } });
  await tx.vaultDocument.deleteMany({ where: { orgId } });
  await tx.storageRecord.deleteMany({ where: { orgId } });
  await tx.loadCharge.deleteMany({ where: { orgId } });
  await tx.loadTrackingSession.deleteMany({ where: { orgId } });
  await tx.locationPing.deleteMany({ where: { orgId } });
  await tx.loadLeg.deleteMany({ where: { orgId } });
  await tx.stop.deleteMany({ where: { orgId } });
  await tx.trailerManifestItem.deleteMany({ where: { manifest: { orgId } } });
  await tx.loadAssignmentMember.deleteMany({ where: { load: { orgId } } });
  await tx.invoiceLineItem.deleteMany({ where: { invoice: { orgId } } });
  await tx.invoice.deleteMany({ where: { orgId } });
  await tx.settlementItem.deleteMany({ where: { settlement: { orgId } } });
  await tx.settlement.deleteMany({ where: { orgId } });
  await tx.fuelSummary.deleteMany({ where: { orgId } });
  await tx.truckTelematicsMapping.deleteMany({ where: { orgId } });
  await tx.trackingIntegration.deleteMany({ where: { orgId } });
  await tx.driverStats.deleteMany({ where: { orgId } });
  await tx.trailerManifest.deleteMany({ where: { orgId } });
  await tx.auditLog.deleteMany({ where: { orgId } });
  await tx.userNotificationPref.deleteMany({ where: { orgId } });
  await tx.userInvite.deleteMany({ where: { orgId } });
  await tx.passwordReset.deleteMany({ where: { orgId } });
  await tx.session.deleteMany({ where: { user: { orgId } } });
  await tx.teamMember.deleteMany({ where: { orgId } });
  await tx.teamAssignment.deleteMany({ where: { orgId } });
  await tx.load.deleteMany({ where: { orgId } });
  await tx.operatingEntity.deleteMany({ where: { orgId } });
  await tx.customer.deleteMany({ where: { orgId } });
  await tx.driver.deleteMany({ where: { orgId } });
  await tx.truck.deleteMany({ where: { orgId } });
  await tx.trailer.deleteMany({ where: { orgId } });
  await tx.orgSettings.deleteMany({ where: { orgId } });
  await tx.onboardingState.deleteMany({ where: { orgId } });
  await tx.orgSequence.deleteMany({ where: { orgId } });
  await tx.setupCode.deleteMany({ where: { orgId } });
  await tx.user.deleteMany({ where: { orgId } });
  await tx.team.deleteMany({ where: { orgId } });
  await tx.organization.delete({ where: { id: orgId } });
}

type AuditFn = typeof logAudit;

type DeleteOrgPrisma = {
  organization: {
    findFirst: (args: { where: { id: string }; select: { id: true; name: true } }) => Promise<{ id: string; name: string } | null>;
  };
  $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, opts?: { timeout?: number }) => Promise<T>;
};

type DeleteOrgResult = { status: number; body?: { error?: string } };

async function logDeleteAuditSafe(audit: AuditFn, params: Parameters<AuditFn>[0]) {
  try {
    await audit(params);
  } catch {
    // Swallow audit errors to avoid blocking deletes or denials.
  }
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : error ? String(error) : "Unknown error";
  return message.slice(0, 200);
}

export async function performOrganizationDelete(params: {
  prisma: DeleteOrgPrisma;
  audit: AuditFn;
  actor: AuthRequest["user"];
  orgId: string;
  payload: unknown;
  allowlist: Set<string>;
}): Promise<DeleteOrgResult> {
  const actor = params.actor;
  const targetOrgId = params.orgId;
  const parsed = parseDeleteOrgPayload(params.payload);
  const requestReason = parsed.ok ? parsed.data.reason ?? null : null;
  const baseMeta = { targetOrgId, actorEmail: actor?.email ?? null, requestReason };

  if (!parsed.ok) {
    await logDeleteAuditSafe(params.audit, {
      orgId: actor?.orgId ?? targetOrgId,
      userId: actor?.id ?? "unknown",
      action: "ORG_DELETE_REJECTED",
      entity: "Organization",
      entityId: targetOrgId,
      summary: "Organization delete rejected: invalid payload",
      meta: { ...baseMeta, reason: "invalid_payload" },
    });
    return { status: 400, body: { error: "Invalid payload" } };
  }

  if (!actor || actor.role !== "ADMIN") {
    await logDeleteAuditSafe(params.audit, {
      orgId: actor?.orgId ?? targetOrgId,
      userId: actor?.id ?? "unknown",
      action: "ORG_DELETE_DENIED",
      entity: "Organization",
      entityId: targetOrgId,
      summary: "Organization delete denied: role not allowed",
      meta: { ...baseMeta, reason: "role_not_allowed" },
    });
    return { status: 403, body: { error: "Forbidden" } };
  }

  if (params.allowlist.size === 0) {
    await logDeleteAuditSafe(params.audit, {
      orgId: actor.orgId,
      userId: actor.id,
      action: "ORG_DELETE_DENIED",
      entity: "Organization",
      entityId: targetOrgId,
      summary: "Organization delete denied: allowlist not configured",
      meta: { ...baseMeta, reason: "allowlist_not_configured" },
    });
    return { status: 403, body: { error: "Organization deletion is not enabled" } };
  }

  const email = actor.email.toLowerCase();
  if (!params.allowlist.has(email)) {
    await logDeleteAuditSafe(params.audit, {
      orgId: actor.orgId,
      userId: actor.id,
      action: "ORG_DELETE_DENIED",
      entity: "Organization",
      entityId: targetOrgId,
      summary: "Organization delete denied: email not allowlisted",
      meta: { ...baseMeta, reason: "email_not_allowlisted" },
    });
    return { status: 403, body: { error: "Forbidden" } };
  }

  if (parsed.data.orgId !== targetOrgId) {
    await logDeleteAuditSafe(params.audit, {
      orgId: actor.orgId,
      userId: actor.id,
      action: "ORG_DELETE_REJECTED",
      entity: "Organization",
      entityId: targetOrgId,
      summary: "Organization delete rejected: org id mismatch",
      meta: {
        ...baseMeta,
        reason: "org_id_mismatch",
        bodyOrgId: parsed.data.orgId,
      },
    });
    return { status: 400, body: { error: "Organization mismatch" } };
  }

  if (parsed.data.confirm !== "DELETE") {
    await logDeleteAuditSafe(params.audit, {
      orgId: actor.orgId,
      userId: actor.id,
      action: "ORG_DELETE_REJECTED",
      entity: "Organization",
      entityId: targetOrgId,
      summary: "Organization delete rejected: confirmation mismatch",
      meta: { ...baseMeta, reason: "confirm_mismatch" },
    });
    return { status: 400, body: { error: "Invalid confirmation" } };
  }

  const org = await params.prisma.organization.findFirst({
    where: { id: targetOrgId },
    select: { id: true, name: true },
  });
  if (!org) {
    await logDeleteAuditSafe(params.audit, {
      orgId: actor.orgId,
      userId: actor.id,
      action: "ORG_DELETE_REJECTED",
      entity: "Organization",
      entityId: targetOrgId,
      summary: "Organization delete rejected: org not found",
      meta: { ...baseMeta, reason: "org_not_found" },
    });
    return { status: 404, body: { error: "Organization not found" } };
  }

  if (parsed.data.confirmName !== org.name) {
    await logDeleteAuditSafe(params.audit, {
      orgId: actor.orgId,
      userId: actor.id,
      action: "ORG_DELETE_REJECTED",
      entity: "Organization",
      entityId: targetOrgId,
      summary: "Organization delete rejected: confirmation name mismatch",
      meta: {
        ...baseMeta,
        reason: "confirm_name_mismatch",
        confirmName: parsed.data.confirmName,
        orgName: org.name,
      },
    });
    return { status: 400, body: { error: "Confirmation name does not match" } };
  }

  await logDeleteAuditSafe(params.audit, {
    orgId: actor.orgId,
    userId: actor.id,
    action: "ORG_DELETE_ATTEMPT",
    entity: "Organization",
    entityId: targetOrgId,
    summary: `Organization delete requested: ${org.name}`,
    meta: {
      ...baseMeta,
      orgName: org.name,
    },
  });

  try {
    await params.prisma.$transaction(async (tx) => {
      await deleteOrganizationData(tx, targetOrgId);
    }, { timeout: 60000 });
  } catch (error) {
    await logDeleteAuditSafe(params.audit, {
      orgId: actor.orgId,
      userId: actor.id,
      action: "ORG_DELETE_FAILED",
      entity: "Organization",
      entityId: targetOrgId,
      summary: "Organization delete failed",
      meta: { ...baseMeta, reason: "delete_failed", error: sanitizeError(error) },
    });
    return { status: 500, body: { error: "Failed to delete organization." } };
  }

  await logDeleteAuditSafe(params.audit, {
    orgId: actor.orgId,
    userId: actor.id,
    action: "ORG_DELETE_SUCCESS",
    entity: "Organization",
    entityId: targetOrgId,
    summary: `Organization deleted: ${org.name}`,
    meta: { ...baseMeta, orgName: org.name },
  });

  return { status: 204 };
}

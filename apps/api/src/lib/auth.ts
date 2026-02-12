import crypto from "crypto";
import type { Response, NextFunction } from "express";
import { prisma, UserStatus } from "@truckerio/db";
import { parse } from "cookie";

export type AuthRequest = {
  auth?: {
    userId: string;
    orgId: string;
    role: string;
    status: string;
  };
  user?: {
    id: string;
    orgId: string;
    role: string;
    email: string;
    name: string | null;
    permissions: string[];
  };
  cookies?: Record<string, string>;
};

const SESSION_COOKIE = "session";
const SESSION_TTL_DAYS = 14;
const IS_PROD = process.env.NODE_ENV === "production";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(params: { userId: string; ipAddress?: string | null; userAgent?: string | null }) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId: params.userId,
      tokenHash,
      expiresAt,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      lastUsedAt: new Date(),
    },
  });
  return { token, expiresAt };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE);
}

export async function requireAuth(req: AuthRequest & { headers: any }, res: Response, next: NextFunction) {
  const cookies = req.cookies ?? parse(req.headers.cookie || "");
  req.cookies = cookies;
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const tokenHash = hashToken(token);
  const session = await prisma.session.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() }, revokedAt: null },
    include: { user: true },
  });
  if (!session) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  if (!session.user.isActive || session.user.status !== UserStatus.ACTIVE) {
    res.status(403).json({ error: "User is inactive" });
    return;
  }
  const now = Date.now();
  if (!session.lastUsedAt || now - session.lastUsedAt.getTime() > 15 * 60 * 1000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
  }
  req.user = {
    id: session.user.id,
    orgId: session.user.orgId,
    role: session.user.role,
    email: session.user.email,
    name: session.user.name,
    permissions: session.user.permissions,
  };
  next();
}

export async function destroySession(token: string) {
  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

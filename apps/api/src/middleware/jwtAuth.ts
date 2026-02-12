import type { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { AuthRequest } from "../lib/auth";

export type AuthTokenPayload = {
  sub: string;
  orgId: string;
  role: string;
  status: string;
  email?: string;
  name?: string | null;
  permissions?: string[];
};

const JWT_SECRET = process.env.API_JWT_SECRET || process.env.NEXTAUTH_SECRET || "";

function getBearerToken(req: { headers?: Record<string, string | string[] | undefined> }) {
  const header = req.headers?.authorization;
  if (!header) return null;
  const value = Array.isArray(header) ? header[0] : header;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export function verifyJwtToken(token: string): AuthTokenPayload | null {
  if (!JWT_SECRET) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function attachAuth(req: AuthRequest, payload: AuthTokenPayload) {
  req.auth = {
    userId: payload.sub,
    orgId: payload.orgId,
    role: payload.role,
    status: payload.status,
  };
  req.user = {
    id: payload.sub,
    orgId: payload.orgId,
    role: payload.role,
    email: payload.email ?? null,
    name: payload.name ?? null,
    permissions: payload.permissions ?? [],
  };
}

export function jwtAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = verifyJwtToken(token);
  if (!payload || !payload.sub || !payload.orgId || !payload.role || !payload.status) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (payload.status !== "ACTIVE") {
    res.status(403).json({ error: "User is inactive" });
    return;
  }
  attachAuth(req, payload);
  next();
}

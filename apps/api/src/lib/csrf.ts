import crypto from "crypto";
import type { Response, NextFunction } from "express";

const CSRF_COOKIE = "csrf";
const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN?.trim() || undefined;
const WEB_ORIGIN = process.env.WEB_ORIGIN?.trim() || "";
const DEFAULT_COOKIE_SECURE = WEB_ORIGIN ? WEB_ORIGIN.startsWith("https://") : IS_PROD;
const COOKIE_SECURE =
  typeof process.env.COOKIE_SECURE === "string" ? process.env.COOKIE_SECURE.toLowerCase() === "true" : DEFAULT_COOKIE_SECURE;

export function createCsrfToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    domain: COOKIE_DOMAIN,
  });
}

export function requireCsrf(req: { headers: any; cookies?: Record<string, string> }, res: Response, next: NextFunction) {
  const csrfCookie = req.cookies?.[CSRF_COOKIE];
  const csrfHeader = req.headers["x-csrf-token"];
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    res.status(403).json({ error: "Invalid CSRF token" });
    return;
  }
  next();
}

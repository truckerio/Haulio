import type { NextRequest } from "next/server";

type ActorContext = {
  orgId: string;
  userId: string;
  role: string;
  chatbotEnabled: boolean;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getNodeApiBase() {
  const defaultApiBase = process.env.NODE_ENV === "development" ? "http://127.0.0.1:4000" : "http://api:4000";
  const configuredBase =
    process.env.API_BASE_INTERNAL ||
    (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.startsWith("http")
      ? process.env.NEXT_PUBLIC_API_BASE
      : null);
  return trimTrailingSlash(configuredBase || defaultApiBase);
}

function getFastApiBase() {
  const defaultFastApiBase = process.env.NODE_ENV === "development" ? "http://127.0.0.1:8090" : "http://hauliopy:8090";
  return trimTrailingSlash(process.env.FASTAPI_BASE_INTERNAL || defaultFastApiBase);
}

function parseCsvSet(value: string | undefined) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  );
}

function isEnabledFlag(value: string | undefined, fallback = true) {
  if (value == null) return fallback;
  return String(value).trim().toLowerCase() !== "false";
}

function isChatbotEnabledForOrg(orgId: string) {
  const moduleEnabled = isEnabledFlag(process.env.CHATBOT_MODULE_ENABLED, false);
  if (!moduleEnabled) return false;
  const allowlist = parseCsvSet(process.env.CHATBOT_ALLOWED_ORGS);
  if (allowlist.size === 0) return true;
  return allowlist.has(orgId);
}

export async function resolveActorContext(request: NextRequest): Promise<ActorContext | null> {
  const cookie = request.headers.get("cookie") || "";
  if (!cookie) return null;

  try {
    const response = await fetch(`${getNodeApiBase()}/auth/me`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const orgId = String(payload?.org?.id || "");
    const userId = String(payload?.user?.id || "");
    const role = String(payload?.user?.role || "");
    if (!orgId || !userId || !role) return null;
    const workflowEnabled =
      typeof payload?.workflow?.chatbotEnabled === "boolean" ? Boolean(payload.workflow.chatbotEnabled) : null;
    return {
      orgId,
      userId,
      role,
      chatbotEnabled: workflowEnabled ?? isChatbotEnabledForOrg(orgId),
    };
  } catch {
    return null;
  }
}

export function buildForwardHeaders(request: NextRequest, actor: ActorContext, includeJsonContentType = false) {
  const headers = new Headers();
  if (includeJsonContentType) headers.set("content-type", "application/json");
  headers.set("x-org-id", actor.orgId);
  headers.set("x-user-id", actor.userId);
  headers.set("x-user-role", actor.role);
  const requestId = request.headers.get("x-request-id");
  if (requestId) headers.set("x-request-id", requestId);
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

export function getFastApiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getFastApiBase()}${normalized}`;
}

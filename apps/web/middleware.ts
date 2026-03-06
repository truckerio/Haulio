import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getRoleCapabilities, getRoleNoAccessCta } from "@/lib/capabilities";

const PUBLIC_PREFIXES = ["/login", "/accept-invite", "/invite", "/forgot", "/reset", "/setup"];
const DISPATCH_ROOT_PREFIXES = ["/dispatch", "/loads", "/trips", "/teams"];

function getApiBaseCandidates() {
  const configuredBase =
    process.env.API_BASE_INTERNAL ||
    (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.startsWith("http")
      ? process.env.NEXT_PUBLIC_API_BASE
      : null);
  const runtimeFallbacks =
    process.env.NODE_ENV === "development"
      ? ["http://127.0.0.1:4000", "http://api:4000"]
      : ["http://api:4000", "http://127.0.0.1:4000"];
  const candidates = [configuredBase, ...runtimeFallbacks].filter((value): value is string => Boolean(value));
  return Array.from(new Set(candidates));
}

async function fetchAuthMe(req: NextRequest) {
  const headers = {
    cookie: req.headers.get("cookie") || "",
  };
  let lastResponse: Response | null = null;
  for (const apiBase of getApiBaseCandidates()) {
    try {
      const response = await fetch(`${apiBase}/auth/me`, {
        headers,
        cache: "no-store",
      });
      lastResponse = response;
      // Retry next candidate for likely wrong target or temporary backend failure.
      if (response.status === 404 || response.status >= 500) continue;
      return response;
    } catch {
      // Try the next candidate host.
    }
  }
  return lastResponse;
}

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function pathMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function buildRedirectUrl(req: NextRequest, target: string) {
  const [pathname, query = ""] = target.split("?");
  const url = req.nextUrl.clone();
  url.pathname = pathname || "/today";
  url.search = query ? `?${query}` : "";
  return url;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/manifest.json") ||
    pathname.startsWith("/icon-") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const me = await fetchAuthMe(req);

  if (!me || !me.ok) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const needsCapabilityGuard =
    pathMatchesPrefix(pathname, "/admin") ||
    DISPATCH_ROOT_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix)) ||
    pathMatchesPrefix(pathname, "/finance") ||
    pathMatchesPrefix(pathname, "/safety") ||
    pathMatchesPrefix(pathname, "/support");

  if (!needsCapabilityGuard) {
    return NextResponse.next();
  }

  const payload = await me.json().catch(() => null);
  const role = payload?.user?.role ?? null;
  const capabilities = getRoleCapabilities(role);
  const noAccessFallback = getRoleNoAccessCta(role).href;

  const redirectWithFallback = (preferredHref: string) => {
    const target = preferredHref === pathname ? "/today" : preferredHref;
    return NextResponse.redirect(buildRedirectUrl(req, target));
  };

  if (pathMatchesPrefix(pathname, "/admin") && !capabilities.canAccessAdmin) {
    return redirectWithFallback("/today");
  }

  if (DISPATCH_ROOT_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix)) && !capabilities.canAccessDispatch) {
    return redirectWithFallback(noAccessFallback);
  }

  if (pathMatchesPrefix(pathname, "/finance") && !capabilities.canAccessFinance) {
    return redirectWithFallback(noAccessFallback);
  }

  if (pathMatchesPrefix(pathname, "/safety") && !capabilities.canAccessSafety) {
    return redirectWithFallback(noAccessFallback);
  }

  if (pathMatchesPrefix(pathname, "/support") && !capabilities.canAccessSupport) {
    return redirectWithFallback(noAccessFallback);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api).*)"],
};

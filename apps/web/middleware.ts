import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/accept-invite", "/invite", "/forgot", "/reset", "/setup"];

function getApiBase() {
  return (
    process.env.API_BASE_INTERNAL ||
    (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.startsWith("http")
      ? process.env.NEXT_PUBLIC_API_BASE
      : "http://api:4000")
  );
}

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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

  let me: Response | null = null;
  try {
    me = await fetch(`${getApiBase()}/auth/me`, {
      headers: {
        cookie: req.headers.get("cookie") || "",
      },
      cache: "no-store",
    });
  } catch {
    me = null;
  }

  if (!me || !me.ok) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin")) {
    const payload = await me.json().catch(() => null);
    const role = payload?.user?.role;
    if (role !== "ADMIN") {
      const fallbackUrl = req.nextUrl.clone();
      fallbackUrl.pathname = "/today";
      fallbackUrl.search = "";
      return NextResponse.redirect(fallbackUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api).*)"],
};

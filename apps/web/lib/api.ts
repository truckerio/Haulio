const ENV_API_BASE =
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const DEV_ERRORS = process.env.NEXT_PUBLIC_DEV_ERRORS === "true" || process.env.NODE_ENV !== "production";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

function getLocalApiBase() {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host === "localhost") {
    return `${window.location.protocol}//127.0.0.1:4000`;
  }
  if (host === "127.0.0.1") {
    return `${window.location.protocol}//${host}:4000`;
  }
  return null;
}

export function getApiBase() {
  if (ENV_API_BASE.startsWith("/")) {
    return ENV_API_BASE.replace(/\/$/, "");
  }
  const localBase = getLocalApiBase();
  const base = localBase ?? ENV_API_BASE;
  return base.replace(/\/$/, "");
}

export function getCsrfToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("csrfToken") || "";
}

export function setCsrfToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("csrfToken", token);
  window.dispatchEvent(new Event("csrf-token-changed"));
}

async function refreshCsrfToken() {
  try {
    const res = await fetch(`${getApiBase()}/auth/csrf`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data?.csrfToken) {
      setCsrfToken(data.csrfToken);
      return data.csrfToken as string;
    }
  } catch {
    return null;
  }
  return null;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, retryOnCsrf = true): Promise<T> {
  if (typeof window !== "undefined") {
    try {
      const uiHost = window.location.hostname;
      const apiHost = new URL(getApiBase()).hostname;
      const isLocal = (host: string) => host === "localhost" || host === "127.0.0.1";
      if (isLocal(uiHost) && isLocal(apiHost) && uiHost !== apiHost) {
        const url = new URL(window.location.href);
        url.hostname = apiHost;
        window.location.replace(url.toString());
        return new Promise<T>(() => {});
      }
    } catch {
      // ignore host checks if API_BASE is invalid
    }
  }
  const headers = new Headers(options.headers || {});
  if (options.method && options.method !== "GET") {
    const csrf = getCsrfToken();
    if (csrf) {
      headers.set("x-csrf-token", csrf);
    }
  }
  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    if (DEV_ERRORS) {
      throw new Error("API unreachable. Make sure the API server is running.");
    }
    throw new Error("We couldn't reach the server. Please try again.");
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/";
      return new Promise<T>(() => {});
    }
    const error = await res.json().catch(() => ({}));
    if (res.status === 403) {
      const message = error?.error || error?.message || "";
      if (retryOnCsrf && message.toLowerCase().includes("csrf")) {
        const token = await refreshCsrfToken();
        if (token) {
          return apiFetch<T>(path, options, false);
        }
      }
      if (typeof window !== "undefined" && message.toLowerCase().includes("not authenticated")) {
        window.location.href = "/";
        return new Promise<T>(() => {});
      }
    }
    const message =
      error?.error ||
      error?.message ||
      error?.detail ||
      (typeof error === "string" ? error : null) ||
      "Request failed";
    const buildError = (text: string) => {
      const err = new Error(text);
      (err as { code?: string; ctaHref?: string }).code = error?.code;
      (err as { code?: string; ctaHref?: string }).ctaHref = error?.ctaHref;
      return err;
    };
    if (res.status >= 500) {
      if (DEV_ERRORS) {
        if (error?.detail) {
          throw new Error(`${message} — ${error.detail}`);
        }
        throw new Error(message || "Server error");
      }
      throw new Error(GENERIC_ERROR_MESSAGE);
    }
    if (error?.issues?.fieldErrors) {
      const fieldErrors = error.issues.fieldErrors as Record<string, string[] | undefined>;
      const details = Object.entries(fieldErrors)
        .flatMap(([field, messages]) => (messages && messages.length ? `${field}: ${messages.join(", ")}` : []))
        .join(" • ");
      if (details) {
        throw buildError(`${message || "Invalid payload"} — ${details}`);
      }
    }
    throw buildError(message);
  }
  return res.json();
}

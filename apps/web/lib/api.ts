import { API_BASE } from "@/lib/apiBase";

const DEV_ERRORS = process.env.NEXT_PUBLIC_DEV_ERRORS === "true" || process.env.NODE_ENV !== "production";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

export function getApiBase() {
  return API_BASE;
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

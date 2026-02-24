import { API_BASE } from "@/lib/apiBase";

const DEV_ERRORS = process.env.NEXT_PUBLIC_DEV_ERRORS === "true" || process.env.NODE_ENV !== "production";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const DB_SETUP_ERROR_CODES = new Set(["P1001", "P1003", "P2021", "P2022"]);

export type ApiFetchOptions = RequestInit & {
  skipAuthRedirect?: boolean;
  retryOnCsrf?: boolean;
};

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
}

export function clearCsrfToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("csrfToken");
}

async function refreshCsrfToken() {
  try {
    const res = await fetch(`${getApiBase()}/auth/csrf`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.csrfToken) {
      setCsrfToken(data.csrfToken);
      return data.csrfToken as string;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { skipAuthRedirect, retryOnCsrf = true, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  const method = (fetchOptions.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method) && !headers.has("x-csrf-token")) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers.set("x-csrf-token", csrf);
    }
  }
  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      ...fetchOptions,
      headers,
      credentials: fetchOptions.credentials ?? "include",
      cache: "no-store",
    });
  } catch (error) {
    if (DEV_ERRORS) {
      throw new Error("API unreachable. Make sure the API server is running.");
    }
    throw new Error("We couldn't reach the server. Please try again.");
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !skipAuthRedirect) {
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    if (res.status === 403 && retryOnCsrf && !["GET", "HEAD"].includes(method)) {
      const error = await res.json().catch(() => ({}));
      if (String(error?.error || "").toLowerCase().includes("csrf")) {
        const refreshed = await refreshCsrfToken();
        if (refreshed) {
          return apiFetch<T>(path, { ...options, retryOnCsrf: false });
        }
      }
      const message = error?.error || error?.message || "Request failed";
      throw new Error(message);
    }
    const error = await res.json().catch(() => ({}));
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
      if (DB_SETUP_ERROR_CODES.has(String(error?.code || ""))) {
        throw new Error("Database is not ready. Run migrations and restart the stack.");
      }
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

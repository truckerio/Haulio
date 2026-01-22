const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export function getCsrfToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("csrfToken") || "";
}

export function setCsrfToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("csrfToken", token);
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.method && options.method !== "GET") {
    const csrf = getCsrfToken();
    if (csrf) {
      headers.set("x-csrf-token", csrf);
    }
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (error) {
    throw new Error("API unreachable. Make sure the API server is running.");
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/";
      return new Promise<T>(() => {});
    }
    if (res.status === 403 && typeof window !== "undefined") {
      window.location.href = "/";
      return new Promise<T>(() => {});
    }
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }
  return res.json();
}

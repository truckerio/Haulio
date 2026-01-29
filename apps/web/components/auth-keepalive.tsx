"use client";

import { useEffect } from "react";
import { getApiBase, setCsrfToken } from "@/lib/api";

const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;

export function AuthKeepalive() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshCsrf = async () => {
      try {
        const res = await fetch(`${getApiBase()}/auth/csrf`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (data?.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
      } catch {
        // ignore network errors
      }
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        refreshCsrf();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        refreshCsrf();
      }
    }, KEEPALIVE_INTERVAL_MS);

    refreshCsrf();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}

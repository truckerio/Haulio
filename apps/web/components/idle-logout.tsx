"use client";

import { useEffect, useRef } from "react";
import { apiFetch, clearCsrfToken, getCsrfToken } from "@/lib/api";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export function IdleLogout() {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const resetTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      if (!getCsrfToken()) {
        timerRef.current = null;
        return;
      }
      timerRef.current = window.setTimeout(() => {
        apiFetch("/auth/logout", { method: "POST", skipAuthRedirect: true })
          .catch(() => undefined)
          .finally(() => {
            clearCsrfToken();
            window.location.href = "/login";
          });
      }, IDLE_TIMEOUT_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    window.addEventListener("visibilitychange", resetTimer);
    resetTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      window.removeEventListener("visibilitychange", resetTimer);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return null;
}

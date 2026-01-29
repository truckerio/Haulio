"use client";

import { useEffect, useRef } from "react";
import { apiFetch, getCsrfToken, setCsrfToken } from "@/lib/api";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export function IdleLogout() {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const resetTimer = () => {
      const csrf = getCsrfToken();
      if (!csrf) {
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return;
      }
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(async () => {
        try {
          await apiFetch("/auth/logout", { method: "POST" });
        } catch {
          // Ignore logout failures; still force a local sign-out for inactivity.
        } finally {
          setCsrfToken("");
          window.location.href = "/";
        }
      }, IDLE_TIMEOUT_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    window.addEventListener("csrf-token-changed", resetTimer);
    window.addEventListener("visibilitychange", resetTimer);
    resetTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      window.removeEventListener("csrf-token-changed", resetTimer);
      window.removeEventListener("visibilitychange", resetTimer);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return null;
}

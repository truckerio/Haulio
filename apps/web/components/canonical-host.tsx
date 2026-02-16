"use client";

import { useEffect } from "react";
import { getApiBase } from "@/lib/api";

export function CanonicalHost() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentHost = window.location.hostname;
    const isLocalHost = currentHost === "localhost" || currentHost === "127.0.0.1";
    if (!isLocalHost) return;

    // Prefer an explicit canonical origin when provided (prod-local uses this).
    // This prevents cookie splits between localhost vs 127.0.0.1 which can cause auth loops.
    const configuredOrigin = (process.env.NEXT_PUBLIC_WEB_ORIGIN || "").trim();
    if (configuredOrigin) {
      try {
        const target = new URL(configuredOrigin);
        const targetHost = target.hostname;
        const isTargetLocal = targetHost === "localhost" || targetHost === "127.0.0.1";
        if (isTargetLocal && targetHost !== currentHost) {
          const url = new URL(window.location.href);
          url.hostname = targetHost;
          if (target.port) url.port = target.port;
          window.location.replace(url.toString());
          return;
        }
      } catch {
        // ignore invalid origin
      }
    }

    let apiHost = currentHost;
    try {
      apiHost = new URL(getApiBase()).hostname;
    } catch {
      apiHost = currentHost;
    }

    const isApiLocal = apiHost === "localhost" || apiHost === "127.0.0.1";
    if (!isApiLocal || apiHost === currentHost) return;

    const url = new URL(window.location.href);
    url.hostname = apiHost;
    window.location.replace(url.toString());
  }, []);

  return null;
}

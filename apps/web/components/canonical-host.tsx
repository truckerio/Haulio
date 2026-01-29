"use client";

import { useEffect } from "react";
import { getApiBase } from "@/lib/api";

export function CanonicalHost() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentHost = window.location.hostname;
    const isLocalHost = currentHost === "localhost" || currentHost === "127.0.0.1";
    if (!isLocalHost) return;

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

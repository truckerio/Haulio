"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { recordUiTelemetryEvent } from "@/lib/ui-telemetry";

export function UiTelemetryRuntime() {
  const pathname = usePathname();
  const firstSeen = useRef(false);

  useEffect(() => {
    // Track route visibility baseline for role-by-role UI audits.
    if (!pathname) return;
    recordUiTelemetryEvent("page_view", {
      path: pathname,
      initial: !firstSeen.current,
    });
    firstSeen.current = true;
  }, [pathname]);

  return null;
}

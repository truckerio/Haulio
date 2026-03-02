"use client";

import { AppShell } from "@/components/app-shell";
import { ReadOnlyOpsWorkbench } from "@/components/workbench/read-only-ops-workbench";

export default function SafetyPage() {
  return (
    <AppShell title="Safety Workbench" subtitle="Compliance and risk visibility" hideHeader hideTopActivityTrigger>
      <ReadOnlyOpsWorkbench kind="safety" />
    </AppShell>
  );
}

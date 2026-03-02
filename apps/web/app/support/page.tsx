"use client";

import { AppShell } from "@/components/app-shell";
import { ReadOnlyOpsWorkbench } from "@/components/workbench/read-only-ops-workbench";

export default function SupportPage() {
  return (
    <AppShell title="Support Workbench" subtitle="Read-only troubleshooting workspace" hideHeader hideTopActivityTrigger>
      <ReadOnlyOpsWorkbench kind="support" />
    </AppShell>
  );
}

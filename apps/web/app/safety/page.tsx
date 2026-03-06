"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useUser } from "@/components/auth/user-context";
import { Card } from "@/components/ui/card";
import { ReadOnlyOpsWorkbench } from "@/components/workbench/read-only-ops-workbench";
import { getRoleNoAccessCta } from "@/lib/capabilities";

export default function SafetyPage() {
  const router = useRouter();
  const { user, loading, capabilities } = useUser();
  const fallback = useMemo(() => getRoleNoAccessCta(user?.role), [user?.role]);

  useEffect(() => {
    if (loading || capabilities.canAccessSafety) return;
    router.replace(fallback.href);
  }, [capabilities.canAccessSafety, fallback.href, loading, router]);

  if (loading) {
    return (
      <AppShell title="Safety Workbench" subtitle="Compliance and risk visibility" hideHeader hideTopActivityTrigger>
        <Card className="text-sm text-[color:var(--color-text-muted)]">Checking access...</Card>
      </AppShell>
    );
  }

  if (!capabilities.canAccessSafety) {
    return (
      <AppShell title="Safety Workbench" subtitle="Compliance and risk visibility" hideHeader hideTopActivityTrigger>
        <Card className="text-sm text-[color:var(--color-text-muted)]">Redirecting...</Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Safety Workbench" subtitle="Compliance and risk visibility" hideHeader hideTopActivityTrigger>
      <ReadOnlyOpsWorkbench kind="safety" />
    </AppShell>
  );
}

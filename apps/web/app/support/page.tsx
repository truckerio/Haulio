"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useUser } from "@/components/auth/user-context";
import { Card } from "@/components/ui/card";
import { ReadOnlyOpsWorkbench } from "@/components/workbench/read-only-ops-workbench";
import { getRoleNoAccessCta } from "@/lib/capabilities";

export default function SupportPage() {
  const router = useRouter();
  const { user, loading, capabilities } = useUser();
  const fallback = useMemo(() => getRoleNoAccessCta(user?.role), [user?.role]);

  useEffect(() => {
    if (loading || capabilities.canAccessSupport) return;
    router.replace(fallback.href);
  }, [capabilities.canAccessSupport, fallback.href, loading, router]);

  if (loading) {
    return (
      <AppShell title="Support Workbench" subtitle="Read-only troubleshooting workspace" hideHeader hideTopActivityTrigger>
        <Card className="text-sm text-[color:var(--color-text-muted)]">Checking access...</Card>
      </AppShell>
    );
  }

  if (!capabilities.canAccessSupport) {
    return (
      <AppShell title="Support Workbench" subtitle="Read-only troubleshooting workspace" hideHeader hideTopActivityTrigger>
        <Card className="text-sm text-[color:var(--color-text-muted)]">Redirecting...</Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Support Workbench" subtitle="Read-only troubleshooting workspace" hideHeader hideTopActivityTrigger>
      <ReadOnlyOpsWorkbench kind="support" />
    </AppShell>
  );
}

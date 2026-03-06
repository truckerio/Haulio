"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useUser } from "@/components/auth/user-context";
import { Card } from "@/components/ui/card";
import { getRoleNoAccessCta } from "@/lib/capabilities";

function buildDispatchTeamPath(teamId: string, searchParams: Readonly<URLSearchParams> | null) {
  const returnToPath = searchParams?.get("returnTo")?.trim();
  const params = new URLSearchParams();

  if (returnToPath?.startsWith("/dispatch")) {
    const [, returnQuery = ""] = returnToPath.split("?");
    const returnParams = new URLSearchParams(returnQuery);
    returnParams.forEach((value, key) => params.set(key, value));
  } else if (searchParams) {
    searchParams.forEach((value, key) => {
      if (key === "returnTo" || key === "from") return;
      params.set(key, value);
    });
  }

  params.set("workspace", "loads");
  params.set("teamId", teamId);
  const query = params.toString();
  return query ? `/dispatch?${query}` : "/dispatch?workspace=loads";
}

function TeamDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, capabilities } = useUser();
  const teamId = String(params?.teamId ?? "").trim();
  const fallback = useMemo(() => getRoleNoAccessCta(user?.role), [user?.role]);
  const targetPath = useMemo(
    () => (capabilities.canAccessDispatch ? buildDispatchTeamPath(teamId, searchParams) : fallback.href),
    [capabilities.canAccessDispatch, fallback.href, searchParams, teamId]
  );

  useEffect(() => {
    if (loading) return;
    if (!capabilities.canAccessDispatch) {
      router.replace(fallback.href);
      return;
    }
    if (!teamId) {
      router.replace("/dispatch?workspace=loads");
      return;
    }
    router.replace(targetPath);
  }, [capabilities.canAccessDispatch, fallback.href, loading, router, targetPath, teamId]);

  return (
    <AppShell title="Teams (Ops)" subtitle="This route now lives in Dispatch Workbench">
      <Card className="text-sm text-[color:var(--color-text-muted)]">{loading ? "Checking access..." : "Redirecting..."}</Card>
    </AppShell>
  );
}

export default function TeamDetailPage() {
  return (
    <Suspense fallback={null}>
      <TeamDetailPageContent />
    </Suspense>
  );
}

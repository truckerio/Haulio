"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useUser } from "@/components/auth/user-context";
import { Card } from "@/components/ui/card";
import { getRoleNoAccessCta } from "@/lib/capabilities";

function buildDispatchTripsPath(searchParams: Readonly<URLSearchParams> | null) {
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

  params.set("workspace", "trips");
  const query = params.toString();
  return query ? `/dispatch?${query}` : "/dispatch?workspace=trips";
}

function TripsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, capabilities } = useUser();
  const fallback = useMemo(() => getRoleNoAccessCta(user?.role), [user?.role]);
  const targetPath = useMemo(
    () => (capabilities.canAccessDispatch ? buildDispatchTripsPath(searchParams) : fallback.href),
    [capabilities.canAccessDispatch, fallback.href, searchParams]
  );

  useEffect(() => {
    if (loading) return;
    router.replace(targetPath);
  }, [loading, router, targetPath]);

  return (
    <AppShell title="Trips" subtitle="This route now lives in Dispatch Workbench">
      <Card className="text-sm text-[color:var(--color-text-muted)]">{loading ? "Checking access..." : "Redirecting..."}</Card>
    </AppShell>
  );
}

export default function TripsPage() {
  return (
    <Suspense fallback={null}>
      <TripsPageContent />
    </Suspense>
  );
}

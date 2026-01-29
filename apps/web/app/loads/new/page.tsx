"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { BlockedScreen } from "@/components/ui/blocked-screen";
import { apiFetch } from "@/lib/api";

export default function NewLoadPage() {
  const router = useRouter();
  const [blocked, setBlocked] = useState<{ message?: string; ctaHref?: string; isAdmin?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const me = await apiFetch<{ user: { role: string } }>("/auth/me");
        const isAdmin = me.user.role === "ADMIN";
        if (isAdmin) {
          const state = await apiFetch<{ state: { status?: string } }>("/onboarding/state");
          if (state.state?.status === "NOT_ACTIVATED") {
            setBlocked({ message: "Finish setup to create loads.", ctaHref: "/onboarding", isAdmin });
            setLoading(false);
            return;
          }
        }
      } catch {
        // ignore, allow redirect to loads
      }
      router.replace("/loads?create=1");
    };
    check();
  }, [router]);

  if (blocked) {
    return (
      <AppShell title="Create Load" subtitle="Create a new shipment">
        <BlockedScreen
          isAdmin={blocked.isAdmin ?? false}
          description={blocked.isAdmin ? blocked.message || "Finish setup to create loads." : undefined}
          ctaHref={blocked.isAdmin ? blocked.ctaHref || "/onboarding" : undefined}
        />
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title="Create Load" subtitle="Create a new shipment">
        <Card className="text-sm text-[color:var(--color-text-muted)]">Loading…</Card>
      </AppShell>
    );
  }

  return null;
}

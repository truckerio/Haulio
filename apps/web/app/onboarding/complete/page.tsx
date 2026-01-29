"use client";

import { useRouter } from "next/navigation";
import { UserProvider } from "@/components/auth/user-context";
import { RouteGuard } from "@/components/rbac/route-guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function ActivationContent() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[color:var(--color-bg-muted)] px-6 py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-6 shadow-[var(--shadow-card)]">
          <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-subtle)]">Workspace Activated</div>
          <h1 className="mt-2 text-3xl font-semibold text-ink">You are ready to dispatch.</h1>
          <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
            Your workspace is configured with the essentials. You can keep refining settings in Admin.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => router.push("/loads")}>Create first load</Button>
            <Button variant="secondary" onClick={() => router.push("/today")}>Go to Today</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              title: "Team",
              body: "Invite dispatch and billing teammates as needed.",
              cta: "Manage users",
              href: "/admin",
            },
            {
              title: "Drivers",
              body: "Assign drivers and keep compliance up to date.",
              cta: "Review drivers",
              href: "/admin",
            },
            {
              title: "Fleet",
              body: "Verify trucks and trailers for upcoming dispatches.",
              cta: "Review fleet",
              href: "/admin",
            },
            {
              title: "First Load",
              body: "Create a load to see dispatch and billing flow together.",
              cta: "Open loads",
              href: "/loads",
            },
          ].map((tile) => (
            <Card key={tile.title} className="space-y-3">
              <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-subtle)]">{tile.title}</div>
              <div className="text-lg font-semibold text-ink">{tile.body}</div>
              <Button variant="secondary" onClick={() => router.push(tile.href)}>
                {tile.cta}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingCompletePage() {
  return (
    <UserProvider>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <ActivationContent />
      </RouteGuard>
    </UserProvider>
  );
}

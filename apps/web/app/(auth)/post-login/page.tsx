"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getRoleLandingPath } from "@/lib/capabilities";

export default function PostLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await apiFetch<{ user: { role: string } }>("/auth/me");
        if (!mounted) return;
        router.replace(getRoleLandingPath(data.user?.role));
      } catch (err) {
        if (!mounted) return;
        setError((err as Error).message || "Unable to continue.");
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Card className="space-y-2 p-6">
          <div className="text-lg font-semibold">Signing you in…</div>
          <div className="text-sm text-[color:var(--color-text-muted)]">Redirecting to your workspace.</div>
          {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
        </Card>
      </div>
    </div>
  );
}

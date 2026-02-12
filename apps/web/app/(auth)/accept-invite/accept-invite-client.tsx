"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AcceptInviteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() || "", [searchParams]);
  const [missingToken, setMissingToken] = useState(false);

  useEffect(() => {
    if (!token) {
      setMissingToken(true);
      return;
    }
    router.replace(`/invite/${encodeURIComponent(token)}`);
  }, [router, token]);

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-muted)] px-6 py-12">
      <div className="mx-auto max-w-lg">
        <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/80 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
          {missingToken ? "Invite token is missing." : "Redirecting to your invite…"}
        </div>
      </div>
    </div>
  );
}

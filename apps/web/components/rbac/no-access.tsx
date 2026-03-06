"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@/components/auth/user-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getRoleNoAccessCta } from "@/lib/capabilities";

export function NoAccess({
  title = "No access",
  description = "You do not have permission to view this page.",
  ctaLabel,
  ctaHref,
}: {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const { user } = useUser();
  const fallback = getRoleNoAccessCta(user?.role);
  const resolvedCtaLabel = ctaLabel ?? fallback.label;
  const resolvedCtaHref = ctaHref ?? fallback.href;
  const router = useRouter();
  return (
    <Card className="space-y-3">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="text-sm text-[color:var(--color-text-muted)]">{description}</div>
      <div>
        <Button size="sm" onClick={() => router.push(resolvedCtaHref)}>
          {resolvedCtaLabel}
        </Button>
      </div>
    </Card>
  );
}

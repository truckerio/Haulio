"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function NoAccess({
  title = "No access",
  description = "You do not have permission to view this page.",
  ctaLabel = "Go to Today",
  ctaHref = "/today",
}: {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const router = useRouter();
  return (
    <Card className="space-y-3">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="text-sm text-[color:var(--color-text-muted)]">{description}</div>
      <div>
        <Button size="sm" onClick={() => router.push(ctaHref)}>
          {ctaLabel}
        </Button>
      </div>
    </Card>
  );
}

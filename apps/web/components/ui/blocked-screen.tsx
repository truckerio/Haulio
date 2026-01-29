"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type BlockedScreenProps = {
  title?: string;
  description?: string;
  ctaHref?: string;
  ctaLabel?: string;
  isAdmin?: boolean;
};

export function BlockedScreen({
  title,
  description,
  ctaHref,
  ctaLabel,
  isAdmin = true,
}: BlockedScreenProps) {
  const resolvedTitle = title ?? (isAdmin ? "Finish setup to continue" : "Setup required");
  const resolvedDescription =
    description ??
    (isAdmin
      ? "Finish setup to perform this action."
      : "Your company setup isn’t complete. Ask your admin to finish setup.");
  const resolvedCtaLabel = ctaLabel ?? (isAdmin ? "Finish setup" : "Go to Today");
  const resolvedCtaHref = ctaHref ?? (isAdmin ? "/onboarding" : "/today");

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-xl space-y-3 text-center">
        <div className="text-xs uppercase tracking-[0.25em] text-[color:var(--color-text-muted)]">Setup required</div>
        <div className="text-2xl font-semibold text-ink">{resolvedTitle}</div>
        <div className="text-sm text-[color:var(--color-text-muted)]">{resolvedDescription}</div>
        {resolvedCtaHref ? (
          <div className="flex justify-center">
            <Button onClick={() => (window.location.href = resolvedCtaHref)}>{resolvedCtaLabel}</Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

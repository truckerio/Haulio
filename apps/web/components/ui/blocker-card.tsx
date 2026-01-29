"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BlockerTone = "warning" | "danger" | "info";

const toneStyles: Record<BlockerTone, string> = {
  warning: "bg-[color:var(--color-warning-soft)]/40 border-[color:var(--color-warning)]/30",
  danger: "bg-[color:var(--color-danger-soft)]/40 border-[color:var(--color-danger)]/30",
  info: "bg-[color:var(--color-info-soft)]/40 border-[color:var(--color-info)]/30",
};

export function BlockerCard({
  title,
  subtitle,
  ctaLabel,
  onClick,
  tone = "warning",
  className,
}: {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onClick?: () => void;
  tone?: BlockerTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border px-3 py-2 text-sm",
        toneStyles[tone],
        className
      )}
    >
      <div className="font-semibold text-ink">{title}</div>
      <div className="text-xs text-[color:var(--color-text-muted)]">{subtitle}</div>
      {ctaLabel && onClick ? (
        <Button size="sm" variant="secondary" className="mt-2" onClick={onClick}>
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}

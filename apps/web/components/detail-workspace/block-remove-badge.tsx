"use client";

type BlockRemoveBadgeProps = {
  onRemove: () => void;
  label: string;
};

export function BlockRemoveBadge({ onRemove, label }: BlockRemoveBadgeProps) {
  return (
    <button
      type="button"
      aria-label={`Remove ${label} block`}
      onClick={onRemove}
      className="absolute -left-2 -top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] text-sm font-semibold text-[color:var(--color-text-muted)] shadow-[var(--shadow-subtle)] hover:bg-[color:var(--color-bg-muted)]"
    >
      -
    </button>
  );
}

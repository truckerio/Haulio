"use client";

import { cn } from "@/lib/utils";

type InsertionRailProps = {
  onAdd: () => void;
  className?: string;
};

export function InsertionRail({ onAdd, className }: InsertionRailProps) {
  return (
    <div className={cn("group relative flex h-5 items-center justify-center", className)}>
      <div className="absolute inset-x-0 h-px bg-[color:var(--color-divider)]" />
      <button
        type="button"
        onClick={onAdd}
        className="relative z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-1.5 text-[11px] font-semibold text-[color:var(--color-accent)] opacity-0 shadow-[var(--shadow-subtle)] transition group-hover:opacity-100 group-focus-within:opacity-100"
        aria-label="Add block"
      >
        +
      </button>
    </div>
  );
}

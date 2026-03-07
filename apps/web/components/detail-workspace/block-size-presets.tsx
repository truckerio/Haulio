"use client";

import { cn } from "@/lib/utils";

export type DetailBlockSize = "small" | "medium" | "large" | "wide" | "tall";

type SizeOption = {
  id: DetailBlockSize;
  label: string;
  shapeClass: string;
};

const SIZE_OPTIONS: SizeOption[] = [
  { id: "small", label: "Small", shapeClass: "h-12 w-12" },
  { id: "medium", label: "Medium", shapeClass: "h-12 w-20" },
  { id: "large", label: "Large", shapeClass: "h-16 w-24" },
  { id: "wide", label: "Wide", shapeClass: "h-12 w-28" },
  { id: "tall", label: "Tall", shapeClass: "h-20 w-14" },
];

type BlockSizePresetsProps = {
  value: DetailBlockSize;
  onChange: (size: DetailBlockSize) => void;
};

export function BlockSizePresets({ value, onChange }: BlockSizePresetsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {SIZE_OPTIONS.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-[var(--radius-card)] border px-2 py-2 text-left transition",
              active
                ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]"
                : "border-[color:var(--color-divider)] bg-[color:var(--color-surface)] hover:bg-[color:var(--color-bg-muted)]"
            )}
            aria-pressed={active}
          >
            <div className="flex items-center justify-center">
              <div
                className={cn(
                  "rounded-[10px] border border-[color:var(--color-divider)] bg-white/90 shadow-[var(--shadow-subtle)]",
                  option.shapeClass
                )}
              />
            </div>
            <div className="mt-1 text-center text-[11px] font-medium text-ink">{option.label}</div>
          </button>
        );
      })}
    </div>
  );
}

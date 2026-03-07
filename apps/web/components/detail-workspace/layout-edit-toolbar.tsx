"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LayoutEditToolbarProps = {
  editMode: boolean;
  onDone: () => void;
  onAddBlock: () => void;
  onReset: () => void;
  className?: string;
};

export function LayoutEditToolbar({ editMode, onDone, onAddBlock, onReset, className }: LayoutEditToolbarProps) {
  if (!editMode) return null;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-2 py-1.5 shadow-[var(--shadow-subtle)]",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <div className="pr-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
          Edit layout
        </div>
        <Button size="sm" variant="secondary" className="h-8" onClick={onAddBlock}>
          + Add block
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={onReset}>
          Reset
        </Button>
        <Button size="sm" className="h-8" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

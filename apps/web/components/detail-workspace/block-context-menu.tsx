"use client";

import { Button } from "@/components/ui/button";
import type { DetailBlockSize } from "@/components/detail-workspace/block-size-presets";

type BlockContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveLane: (lane: "main" | "right") => void;
  onResize: (size: DetailBlockSize) => void;
  onReset: () => void;
  onRemove: () => void;
};

export function BlockContextMenu({
  open,
  x,
  y,
  onClose,
  onMoveUp,
  onMoveDown,
  onMoveLane,
  onResize,
  onReset,
  onRemove,
}: BlockContextMenuProps) {
  if (!open) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-[85] cursor-default" onClick={onClose} aria-label="Close block menu" />
      <div
        className="fixed z-[86] w-56 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] p-2 shadow-[0_16px_34px_rgba(0,0,0,0.22)]"
        style={{ left: x, top: y }}
      >
        <div className="grid grid-cols-2 gap-1">
          <Button size="sm" variant="ghost" onClick={onMoveUp}>Move up</Button>
          <Button size="sm" variant="ghost" onClick={onMoveDown}>Move down</Button>
          <Button size="sm" variant="ghost" onClick={() => onMoveLane("main")}>Move main</Button>
          <Button size="sm" variant="ghost" onClick={() => onMoveLane("right")}>Move right</Button>
        </div>
        <div className="mt-2 border-t border-[color:var(--color-divider)] pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">Resize</div>
          <div className="grid grid-cols-5 gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-1 text-[10px]" onClick={() => onResize("small")}>S</Button>
            <Button size="sm" variant="ghost" className="h-7 px-1 text-[10px]" onClick={() => onResize("medium")}>M</Button>
            <Button size="sm" variant="ghost" className="h-7 px-1 text-[10px]" onClick={() => onResize("large")}>L</Button>
            <Button size="sm" variant="ghost" className="h-7 px-1 text-[10px]" onClick={() => onResize("wide")}>W</Button>
            <Button size="sm" variant="ghost" className="h-7 px-1 text-[10px]" onClick={() => onResize("tall")}>T</Button>
          </div>
        </div>
        <div className="mt-2 border-t border-[color:var(--color-divider)] pt-2">
          <div className="grid grid-cols-2 gap-1">
            <Button size="sm" variant="ghost" onClick={onReset}>Reset</Button>
            <Button size="sm" variant="danger" onClick={onRemove}>Remove</Button>
          </div>
        </div>
      </div>
    </>
  );
}

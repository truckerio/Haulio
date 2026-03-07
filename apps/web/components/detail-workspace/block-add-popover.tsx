"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { BlockSizePresets, type DetailBlockSize } from "@/components/detail-workspace/block-size-presets";

export type BlockAddLane = "main" | "right";

type AddableBlock<T extends string> = {
  key: T;
  label: string;
  description?: string;
};

type BlockAddPopoverProps<T extends string> = {
  open: boolean;
  blocks: AddableBlock<T>[];
  initialLane: BlockAddLane;
  initialSize: DetailBlockSize;
  onClose: () => void;
  onAdd: (payload: { key: T; lane: BlockAddLane; size: DetailBlockSize }) => void;
};

export function BlockAddPopover<T extends string>({
  open,
  blocks,
  initialLane,
  initialSize,
  onClose,
  onAdd,
}: BlockAddPopoverProps<T>) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<T | null>(null);
  const [lane, setLane] = useState<BlockAddLane>(initialLane);
  const [size, setSize] = useState<DetailBlockSize>(initialSize);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return blocks;
    return blocks.filter((item) => `${item.label} ${item.description ?? ""}`.toLowerCase().includes(term));
  }, [blocks, search]);

  if (!open) return null;

  const resolved = filtered.find((item) => item.key === selected) ?? filtered[0] ?? null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
      <div className="w-[min(860px,100%)] overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] shadow-[0_24px_48px_rgba(0,0,0,0.26)]">
        <div className="flex items-center justify-between border-b border-[color:var(--color-divider)] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-ink">+ Add block</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Choose block, size preset, and lane.</div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search blocks"
              className="h-9 w-full rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 text-sm"
            />
            <div className="max-h-[320px] overflow-auto rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-1">
              {filtered.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelected(item.key)}
                  className={`w-full rounded-[var(--radius-control)] px-2 py-2 text-left ${resolved?.key === item.key ? "bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]" : "hover:bg-[color:var(--color-bg-muted)]"}`}
                >
                  <div className="text-sm font-medium">{item.label}</div>
                  {item.description ? <div className="text-xs text-[color:var(--color-text-muted)]">{item.description}</div> : null}
                </button>
              ))}
              {filtered.length === 0 ? <div className="px-2 py-6 text-center text-xs text-[color:var(--color-text-muted)]">No blocks found</div> : null}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
              <div className="mb-2 text-xs uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">Size preset</div>
              <BlockSizePresets value={size} onChange={setSize} />
            </div>
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
              <div className="mb-2 text-xs uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">Lane</div>
              <div className="flex gap-2">
                <Button size="sm" variant={lane === "main" ? "secondary" : "ghost"} onClick={() => setLane("main")}>Main</Button>
                <Button size="sm" variant={lane === "right" ? "secondary" : "ghost"} onClick={() => setLane("right")}>Right</Button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!resolved) return;
                  onAdd({ key: resolved.key, lane, size });
                }}
                disabled={!resolved}
              >
                Add block
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

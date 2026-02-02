"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function AddLegDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children?: ReactNode }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20">
      <div className="h-full w-full max-w-xl bg-white shadow-[var(--shadow-subtle)]">
        <div className="flex items-center justify-between border-b border-[color:var(--color-divider)] px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Add leg</div>
            <div className="text-lg font-semibold text-ink">Leg plan</div>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="h-[calc(100%-4rem)] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

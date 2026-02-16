"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function AddLegDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children?: ReactNode }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end bg-black/20 sm:items-stretch">
      <div className="flex h-[92dvh] w-full flex-col bg-white shadow-[var(--shadow-subtle)] sm:h-full sm:max-w-xl">
        <div className="flex items-center justify-between border-b border-[color:var(--color-divider)] px-4 py-4 sm:px-5">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Add leg</div>
            <div className="text-lg font-semibold text-ink">Leg plan</div>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>
  );
}

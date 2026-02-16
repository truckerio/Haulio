"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function AdminDrawer({
  open,
  onClose,
  title,
  subtitle,
  eyebrow = "People & Access",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end bg-black/20 sm:items-stretch">
      <div className="flex h-[92dvh] w-full flex-col bg-white shadow-[var(--shadow-subtle)] sm:h-full sm:max-w-xl">
        <div className="flex items-center justify-between border-b border-[color:var(--color-divider)] px-4 py-4 sm:px-5">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">{eyebrow}</div>
            <div className="text-lg font-semibold text-ink">{title}</div>
            {subtitle ? <div className="text-xs text-[color:var(--color-text-muted)]">{subtitle}</div> : null}
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-between border-t border-[color:var(--color-divider)] px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

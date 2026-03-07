"use client";

import { cn } from "@/lib/utils";
import { dismiss, triggerToastAction, useToasts } from "@/lib/toast";

export function ToastViewport() {
  const toasts = useToasts();
  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto rounded-[var(--radius-card)] border bg-[color:var(--color-surface-elevated)] px-3 py-2 text-sm shadow-[var(--shadow-card)]",
            item.tone === "error"
              ? "border-[color:var(--color-danger)]/40 text-[color:var(--color-danger)]"
              : "border-[color:var(--color-success)]/35 text-[color:var(--color-success)]"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 text-xs font-medium leading-5">{item.message}</div>
            <button
              type="button"
              className="rounded p-0.5 text-[10px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
            >
              x
            </button>
          </div>
          {item.actionLabel ? (
            <div className="mt-1.5">
              <button
                type="button"
                className="rounded border border-[color:var(--color-divider)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:bg-[color:var(--color-bg-muted)]"
                onClick={() => triggerToastAction(item.id)}
              >
                {item.actionLabel}
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

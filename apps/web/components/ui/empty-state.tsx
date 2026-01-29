import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-dashed border-[color:var(--color-divider)] bg-white px-4 py-6 text-sm text-[color:var(--color-text-muted)]",
        className
      )}
    >
      <div className="text-sm font-medium text-ink">{title}</div>
      {description ? <div className="mt-1 text-xs">{description}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

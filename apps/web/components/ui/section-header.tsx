import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div>
        <div className="text-sm font-semibold text-ink">{title}</div>
        {subtitle ? <div className="text-xs text-[color:var(--color-text-muted)]">{subtitle}</div> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

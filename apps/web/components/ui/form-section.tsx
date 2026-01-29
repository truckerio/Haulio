import * as React from "react";
import { cn } from "@/lib/utils";

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {description ? <p className="text-xs text-[color:var(--color-text-muted)]">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

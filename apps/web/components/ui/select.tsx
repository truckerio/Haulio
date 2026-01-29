import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-white px-3 py-2 text-sm text-ink shadow-[var(--shadow-subtle)] focus:border-[color:var(--color-divider-strong)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent-soft)]",
        className
      )}
      {...props}
    />
  )
);

Select.displayName = "Select";

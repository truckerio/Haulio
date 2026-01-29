import * as React from "react";
import { cn } from "@/lib/utils";

export const Badge = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "rounded-full bg-[color:var(--color-bg-muted)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]",
        className
      )}
      {...props}
    />
  )
);

Badge.displayName = "Badge";

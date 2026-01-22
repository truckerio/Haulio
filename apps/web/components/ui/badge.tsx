import * as React from "react";
import { cn } from "@/lib/utils";

export const Badge = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "rounded-full bg-black/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black/70",
        className
      )}
      {...props}
    />
  )
);

Badge.displayName = "Badge";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-card)] sm:p-5",
        className
      )}
      {...props}
    />
  )
);

Card.displayName = "Card";

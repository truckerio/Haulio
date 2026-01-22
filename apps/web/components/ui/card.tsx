import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-3xl border border-black/5 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur",
        className
      )}
      {...props}
    />
  )
);

Card.displayName = "Card";

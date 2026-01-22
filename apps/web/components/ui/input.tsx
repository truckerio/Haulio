import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-base shadow-sm focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-moss/20",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";

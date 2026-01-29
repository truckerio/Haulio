import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-white px-3 py-2 text-sm text-ink shadow-[var(--shadow-subtle)] focus:border-[color:var(--color-divider-strong)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent-soft)]",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

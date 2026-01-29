import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function RefinePanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-4 shadow-[var(--shadow-subtle)]",
        className
      )}
    >
      {children}
    </div>
  );
}

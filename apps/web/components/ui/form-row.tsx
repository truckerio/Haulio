import * as React from "react";
import { cn } from "@/lib/utils";

export function FormRow({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid gap-4 md:grid-cols-2", className)}>{children}</div>;
}

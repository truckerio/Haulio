import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center rounded-[var(--radius-control)] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60";
    const variants = {
      primary: "bg-[color:var(--color-accent)] text-white shadow-[var(--shadow-subtle)] hover:translate-y-[-1px] hover:shadow-[var(--shadow-card)]",
      secondary: "border border-[color:var(--color-divider)] bg-white text-ink hover:border-[color:var(--color-divider-strong)] hover:bg-[color:var(--color-bg-muted)]",
      ghost: "bg-transparent text-ink hover:bg-[color:var(--color-bg-muted)]",
      danger: "bg-[color:var(--color-danger)] text-white hover:bg-[color:var(--color-danger)]/90",
    };
    const sizes = {
      sm: "px-3 py-2 text-xs",
      md: "px-4 py-2.5 text-sm",
      lg: "px-5 py-3 text-base",
    };
    return (
      <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props} />
    );
  }
);

Button.displayName = "Button";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center rounded-full font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60";
    const variants = {
      primary: "bg-moss text-white shadow-md shadow-moss/20 hover:bg-moss/90",
      secondary: "border border-black/10 bg-white text-ink hover:border-black/20 hover:bg-black/5",
      ghost: "bg-transparent text-ink hover:bg-black/5",
      danger: "bg-red-600 text-white hover:bg-red-700",
    };
    const sizes = {
      sm: "px-3 py-2 text-sm",
      md: "px-4 py-2.5 text-base",
      lg: "px-6 py-3.5 text-lg",
    };
    return (
      <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props} />
    );
  }
);

Button.displayName = "Button";

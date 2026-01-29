import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border border-[color:var(--color-divider)] text-[color:var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent-soft)]",
        className
      )}
      {...props}
    />
  )
);

Checkbox.displayName = "Checkbox";

type CheckboxFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
};

export function CheckboxField({
  id,
  label,
  hint,
  error,
  required,
  className,
  ...props
}: CheckboxFieldProps) {
  const describedById = id ? `${id}-help` : undefined;
  const message = error ?? hint ?? "";
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Checkbox
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={message ? describedById : undefined}
        {...props}
      />
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm text-ink">
          {label}
          {required ? <span className="ml-1 text-[color:var(--color-text-muted)]">Required</span> : null}
        </Label>
        <p
          id={message ? describedById : undefined}
          className={cn(
            "text-xs",
            error ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-text-muted)]",
            message ? "" : "opacity-0"
          )}
        >
          {message || "placeholder"}
        </p>
      </div>
    </div>
  );
}

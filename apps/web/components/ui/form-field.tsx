import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type FormFieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const child = React.isValidElement(children)
    ? React.cloneElement(children, {
        id: (children.props as { id?: string }).id ?? htmlFor,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {required ? <span className="text-xs text-[color:var(--color-text-subtle)]">Required</span> : null}
      </div>
      {child}
      {error ? (
        <div id={errorId} className="text-xs text-[color:var(--color-danger)]">
          {error}
        </div>
      ) : hint ? (
        <div id={hintId} className="text-xs text-[color:var(--color-text-muted)]">
          {hint}
        </div>
      ) : (
        <div className="text-xs text-transparent">.</div>
      )}
    </div>
  );
}

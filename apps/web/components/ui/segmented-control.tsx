import { cn } from "@/lib/utils";

type Option = { label: string; value: string };

export function SegmentedControl({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[color:var(--color-divider)] bg-white p-1 shadow-[var(--shadow-subtle)]",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]",
              active ? "bg-[color:var(--color-accent)] text-white" : "text-[color:var(--color-text-muted)] hover:text-ink"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

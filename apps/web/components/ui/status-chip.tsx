import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneStyles: Record<StatusTone, string> = {
  neutral: "bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]",
  success: "bg-[color:var(--color-success-soft)] text-[color:var(--color-success)]",
  warning: "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]",
  danger: "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]",
  info: "bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]",
};

export function StatusChip({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]",
        toneStyles[tone],
        className
      )}
    >
      {label}
    </span>
  );
}

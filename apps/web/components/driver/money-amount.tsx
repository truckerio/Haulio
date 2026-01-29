import { cn } from "@/lib/utils";

type MoneyAmountProps = {
  value?: string | number | null;
  className?: string;
  muted?: boolean;
};

export function MoneyAmount({ value, className, muted }: MoneyAmountProps) {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : undefined;
  const display =
    numeric === undefined || Number.isNaN(numeric)
      ? "—"
      : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
          numeric
        );

  return (
    <span className={cn(muted ? "text-[color:var(--color-text-muted)]" : "text-ink", className)}>{display}</span>
  );
}

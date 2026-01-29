import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  meta?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
};

export function StatCard({ label, value, meta, href, onClick, className }: StatCardProps) {
  const content = (
    <Card
      className={cn(
        "group flex h-full flex-col gap-2 border-transparent bg-white transition hover:translate-y-[-1px] hover:shadow-[var(--shadow-card)]",
        className
      )}
    >
      <div className="text-xs uppercase tracking-[0.24em] text-[color:var(--color-text-subtle)]">{label}</div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
      {meta ? <div className="text-xs text-[color:var(--color-text-muted)]">{meta}</div> : null}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]">
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
      >
        {content}
      </button>
    );
  }
  return content;
}

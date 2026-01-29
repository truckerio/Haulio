import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";

type BlockerSeverity = "BLOCKING" | "WARNING" | "INFO";

const toneMap: Record<BlockerSeverity, "danger" | "warning" | "info"> = {
  BLOCKING: "danger",
  WARNING: "warning",
  INFO: "info",
};

type BlockerCardProps = {
  severity: BlockerSeverity;
  title: string;
  detail: string;
  reference?: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
};

export function BlockerCard({ severity, title, detail, reference, ctaLabel, onCtaClick }: BlockerCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusChip label={severity} tone={toneMap[severity]} />
        {reference ? <span className="text-xs text-[color:var(--color-text-muted)]">{reference}</span> : null}
      </div>
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="text-xs text-[color:var(--color-text-muted)]">{detail}</div>
      {ctaLabel && onCtaClick ? (
        <Button size="sm" className="w-fit" onClick={onCtaClick}>
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}

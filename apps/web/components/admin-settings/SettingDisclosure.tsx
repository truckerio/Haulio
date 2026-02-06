import type { ReactNode } from "react";

export function SettingDisclosure({
  id,
  title,
  description,
  value,
  defaultOpen,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  value?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      className="group rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/80"
      defaultOpen={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-ink">{title}</div>
          {description ? <div className="text-xs text-[color:var(--color-text-muted)]">{description}</div> : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
          {value ? <span>{value}</span> : null}
          <span className="text-base">&gt;</span>
        </div>
      </summary>
      <div className="space-y-4 px-4 pb-4 pt-2">{children}</div>
    </details>
  );
}

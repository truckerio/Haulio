import { cn } from "@/lib/utils";

type TimelineItem = {
  id: string;
  title: string;
  subtitle?: string;
  time?: string;
};

export function Timeline({
  items,
  className,
}: {
  items: TimelineItem[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {items.map((item, index) => (
        <div key={item.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-accent)]" />
            {index < items.length - 1 ? (
              <div className="mt-2 h-full w-px bg-[color:var(--color-divider)]" />
            ) : null}
          </div>
          <div className="flex-1 pb-4">
            <div className="text-sm font-medium text-ink">{item.title}</div>
            {item.subtitle ? <div className="text-xs text-[color:var(--color-text-muted)]">{item.subtitle}</div> : null}
            {item.time ? <div className="mt-1 text-xs text-[color:var(--color-text-subtle)]">{item.time}</div> : null}
          </div>
        </div>
      ))}
      {items.length === 0 ? (
        <div className="text-sm text-[color:var(--color-text-muted)]">No activity yet.</div>
      ) : null}
    </div>
  );
}

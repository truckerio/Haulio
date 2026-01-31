import { Button } from "@/components/ui/button";

export type AssignmentSuggestion = {
  driverId: string;
  truckId?: string | null;
  score: number;
  reasons: string[];
  warnings: string[];
  driverName?: string | null;
  truckUnit?: string | null;
  fields?: {
    deadheadMiles?: number | null;
    locationConfidence?: "high" | "medium" | "low";
  };
};

type Props = {
  suggestions: AssignmentSuggestion[];
  loading: boolean;
  error?: string | null;
  onAssign: (driverId: string, truckId?: string | null) => void;
};

const formatDeadhead = (miles?: number | null) => {
  if (miles === null || miles === undefined || Number.isNaN(miles)) return null;
  return `${Math.round(miles)} mi deadhead`;
};

export function SuggestedAssignments({ suggestions, loading, error, onAssign }: Props) {
  if (loading) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] p-3 text-xs text-[color:var(--color-text-muted)]">
        Loading suggestions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] p-3 text-xs text-[color:var(--color-text-muted)]">
        Suggestions unavailable.
      </div>
    );
  }

  if (!suggestions.length) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] p-3 text-xs text-[color:var(--color-text-muted)]">
        No suggestions available yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.map((suggestion) => {
        const deadhead = formatDeadhead(suggestion.fields?.deadheadMiles ?? null);
        const locationConfidence = suggestion.fields?.locationConfidence;
        return (
          <div key={`${suggestion.driverId}-${suggestion.truckId ?? "none"}`} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-3 shadow-[var(--shadow-subtle)]">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-ink">
                {suggestion.driverName ?? "Driver"}
                {suggestion.truckUnit ? ` · Truck ${suggestion.truckUnit}` : ""}
              </div>
              <span className="rounded-full bg-[color:var(--color-bg-muted)] px-2 py-1 text-[11px] font-semibold text-[color:var(--color-text-muted)]">
                Score {suggestion.score}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-[color:var(--color-text-muted)]">
              {deadhead ? <span>{deadhead}</span> : null}
              {locationConfidence ? <span className="capitalize">{locationConfidence} location confidence</span> : null}
            </div>
            {suggestion.reasons.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestion.reasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-2 py-1 text-[11px] text-[color:var(--color-text-muted)]"
                  >
                    {reason}
                  </span>
                ))}
              </div>
            ) : null}
            {suggestion.warnings.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestion.warnings.map((warning) => (
                  <span
                    key={warning}
                    className="rounded-full border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] px-2 py-1 text-[11px] text-[color:var(--color-text-muted)]"
                  >
                    {warning}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={() => onAssign(suggestion.driverId, suggestion.truckId ?? null)}>
                Assign
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

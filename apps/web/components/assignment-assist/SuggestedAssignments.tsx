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
  readOnly?: boolean;
};

const formatDeadhead = (miles?: number | null) => {
  if (miles === null || miles === undefined || Number.isNaN(miles)) return null;
  return `${Math.round(miles)} mi deadhead`;
};

export function SuggestedAssignments({ suggestions, loading, error, onAssign, readOnly }: Props) {
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

  const buildConfidenceTitle = (suggestion: AssignmentSuggestion) => {
    if (suggestion.warnings?.length) {
      return `Confidence reduced: ${suggestion.warnings.join(" · ")}`;
    }
    return "Confidence based on location freshness and data availability";
  };

  const fitLabel = (score: number) => {
    if (score >= 75) return "Good fit";
    if (score >= 40) return "Okay";
    return "Low";
  };

  const fitTone = (score: number) => {
    if (score >= 75) return "bg-[color:var(--color-success-soft)] text-[color:var(--color-success)]";
    if (score >= 40) return "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]";
    return "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]";
  };

  const confidenceDots = (confidence?: "high" | "medium" | "low") => {
    if (confidence === "high") return "●●●";
    if (confidence === "medium") return "●●○";
    return "●○○";
  };

  const warningSummary = (warnings: string[]) => {
    if (!warnings.length) return "Clear";
    const parts: string[] = [];
    if (warnings.some((warning) => warning.toLowerCase().includes("location"))) parts.push("location");
    if (warnings.some((warning) => warning.toLowerCase().includes("hos"))) parts.push("HOS");
    if (warnings.some((warning) => warning.toLowerCase().includes("deadhead"))) parts.push("distance");
    const label = parts.length > 0 ? parts.join(", ") : "details";
    return `Limited data (${label})`;
  };

  return (
    <div className="space-y-3">
      {suggestions.map((suggestion, index) => {
        const deadhead = formatDeadhead(suggestion.fields?.deadheadMiles ?? null);
        const locationConfidence = suggestion.fields?.locationConfidence ?? "low";
        return (
          <div
            key={`${suggestion.driverId}-${suggestion.truckId ?? "none"}`}
            className={`rounded-[var(--radius-card)] border bg-white px-3 py-2 shadow-[var(--shadow-subtle)] ${
              index === 0 ? "border-[color:var(--color-accent-soft)] bg-[color:var(--color-bg-muted)]/60" : "border-[color:var(--color-divider)]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="min-w-[140px] font-semibold text-ink">
                {suggestion.driverName ?? "Driver"}
                {suggestion.truckUnit ? ` · Truck ${suggestion.truckUnit}` : ""}
              </div>
              <div className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                <span className={`rounded-full px-2 py-1 font-semibold ${fitTone(suggestion.score)}`}>{fitLabel(suggestion.score)}</span>
                <span title={buildConfidenceTitle(suggestion)} className="tracking-[0.2em] text-[10px]">
                  {confidenceDots(locationConfidence)}
                </span>
                {deadhead ? <span>{deadhead}</span> : null}
              </div>
              <div
                className="flex-1 text-right text-xs text-[color:var(--color-text-muted)]"
                title={suggestion.warnings?.length ? suggestion.warnings.join(" · ") : undefined}
              >
                {warningSummary(suggestion.warnings ?? [])}
              </div>
              <Button
                size="sm"
                onClick={() => onAssign(suggestion.driverId, suggestion.truckId ?? null)}
                disabled={readOnly}
                title={readOnly ? "Read-only in History view" : undefined}
              >
                Assign
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

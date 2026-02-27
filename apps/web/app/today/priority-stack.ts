export type IssueSeverity = "BLOCKER" | "WARNING" | "INFO";
export type IssueDomain = "DISPATCH" | "BILLING" | "COMPLIANCE" | "DATA";

export type TodayIssueTile = {
  type: string;
  label: string;
  count: number;
  href: string;
  severity?: IssueSeverity;
  domain?: IssueDomain;
  ctaLabel?: string;
};

export type PriorityItem = {
  type: string;
  label: string;
  count: number;
  href: string;
  severity: IssueSeverity;
  domain: IssueDomain;
  ctaLabel: string;
};

function normalizeSeverity(severity?: string): IssueSeverity {
  if (severity === "BLOCKER" || severity === "WARNING" || severity === "INFO") return severity;
  return "WARNING";
}

function normalizeDomain(domain?: string): IssueDomain {
  if (domain === "DISPATCH" || domain === "BILLING" || domain === "COMPLIANCE" || domain === "DATA") return domain;
  return "DATA";
}

// Preserve server-provided order; only apply defensive filtering and normalization.
export function mapTodayTilesToPriorityItems(tiles: TodayIssueTile[]): PriorityItem[] {
  return tiles
    .filter((tile) => Boolean(tile?.type) && Boolean(tile?.label) && Boolean(tile?.href) && tile.count > 0)
    .map((tile) => ({
      type: tile.type,
      label: tile.label,
      count: tile.count,
      href: tile.href,
      severity: normalizeSeverity(tile.severity),
      domain: normalizeDomain(tile.domain),
      ctaLabel: tile.ctaLabel || "Open queue",
    }));
}

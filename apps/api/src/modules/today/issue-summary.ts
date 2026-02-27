import { Role } from "@truckerio/db";
import {
  ISSUE_DOMAIN_SORT_ORDER,
  ISSUE_LABELS,
  ISSUE_SEVERITY_SORT_ORDER,
  ISSUE_TYPE_DEFAULT_SEVERITY,
  ISSUE_TYPE_DOMAIN,
  issueTypesForRole,
  type IssueDomain,
  type IssueSeverity,
  type IssueType,
} from "../../lib/load-issues";

export type TodayIssueTile = {
  type: IssueType;
  label: string;
  count: number;
  severity: IssueSeverity;
  domain: IssueDomain;
  href: string;
  ctaLabel: "Open queue";
};

export type TodayIssueSummary = {
  counts: Record<IssueType, number>;
  tiles: TodayIssueTile[];
};

function compareTodayIssueTiles(left: TodayIssueTile, right: TodayIssueTile) {
  const severityDiff = ISSUE_SEVERITY_SORT_ORDER[left.severity] - ISSUE_SEVERITY_SORT_ORDER[right.severity];
  if (severityDiff !== 0) return severityDiff;
  const domainDiff = ISSUE_DOMAIN_SORT_ORDER[left.domain] - ISSUE_DOMAIN_SORT_ORDER[right.domain];
  if (domainDiff !== 0) return domainDiff;
  const countDiff = right.count - left.count;
  if (countDiff !== 0) return countDiff;
  return left.type.localeCompare(right.type);
}

export function normalizeTodayIssueTiles(tiles: TodayIssueTile[]): TodayIssueTile[] {
  const deduped = new Map<IssueType, TodayIssueTile>();
  for (const tile of tiles) {
    if (tile.count <= 0) continue;
    const existing = deduped.get(tile.type);
    if (!existing || compareTodayIssueTiles(tile, existing) < 0) {
      deduped.set(tile.type, tile);
    }
  }
  return Array.from(deduped.values()).sort(compareTodayIssueTiles);
}

export function buildTodayIssueSummary(params: {
  role: Role;
  counts: Record<IssueType, number>;
}): TodayIssueSummary {
  const tiles = issueTypesForRole(params.role).map((type) => ({
    type,
    label: ISSUE_LABELS[type],
    count: params.counts[type] ?? 0,
    severity: ISSUE_TYPE_DEFAULT_SEVERITY[type],
    domain: ISSUE_TYPE_DOMAIN[type],
    href: `/dispatch?issuePreset=${encodeURIComponent(type)}`,
    ctaLabel: "Open queue" as const,
  }));
  return {
    counts: params.counts,
    tiles: normalizeTodayIssueTiles(tiles),
  };
}

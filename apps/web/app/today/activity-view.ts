export type ActivitySeverity = "ALERT" | "IMPORTANT" | "INFO";
export type ActivityDomain = "DISPATCH" | "BILLING" | "SAFETY" | "SYSTEM";
export type ActivityTimeFilter = "now" | "week" | "history";
export type ActivityDomainFilter = "all" | "dispatch" | "billing" | "safety";

export type ActivityItem = {
  id: string;
  title: string;
  severity: ActivitySeverity;
  domain: ActivityDomain;
  timestamp: string;
  count?: number;
  cta: { label: string; href: string };
};

export type ActivitySummaryData = {
  badgeCount: number;
  generatedAt: string;
  now: ActivityItem[];
  week: ActivityItem[];
  history?: ActivityItem[];
  kpis: {
    openAlerts: number;
    openExceptions: number;
    dueToday: number;
    dueThisWeek: number;
    missingPod: number;
    unassignedLoads: number;
    atRiskStops: number;
  };
  defaultDomain?: ActivityDomainFilter;
};

const severityOrder: Record<ActivitySeverity, number> = {
  ALERT: 0,
  IMPORTANT: 1,
  INFO: 2,
};

function matchesDomain(domain: ActivityDomain, filter: ActivityDomainFilter) {
  if (filter === "all") return true;
  if (filter === "dispatch") return domain === "DISPATCH";
  if (filter === "billing") return domain === "BILLING";
  return domain === "SAFETY";
}

function matchesSeverity(severity: ActivitySeverity, selected: ReadonlySet<ActivitySeverity>) {
  return selected.has(severity);
}

function matchesSearch(item: ActivityItem, search: string) {
  const value = search.trim().toLowerCase();
  if (!value) return true;
  return item.title.toLowerCase().includes(value);
}

export function roleDefaultDomain(role?: string | null): ActivityDomainFilter {
  if (role === "BILLING") return "billing";
  return "dispatch";
}

export function selectActivityBucket(data: ActivitySummaryData | null, filter: ActivityTimeFilter): ActivityItem[] {
  if (!data) return [];
  if (filter === "now") return data.now ?? [];
  if (filter === "week") return data.week ?? [];
  return data.history ?? [];
}

export function filterActivityItems(params: {
  items: ActivityItem[];
  domain: ActivityDomainFilter;
  severities: ReadonlySet<ActivitySeverity>;
  search: string;
}): ActivityItem[] {
  return params.items
    .filter((item) => matchesDomain(item.domain, params.domain))
    .filter((item) => matchesSeverity(item.severity, params.severities))
    .filter((item) => matchesSearch(item, params.search))
    .sort((left, right) => {
      const severityDiff = severityOrder[left.severity] - severityOrder[right.severity];
      if (severityDiff !== 0) return severityDiff;
      const countDiff = (right.count ?? 1) - (left.count ?? 1);
      if (countDiff !== 0) return countDiff;
      const timeDiff = new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return left.id.localeCompare(right.id);
    });
}

export function compactRelativeTime(value: string, now = new Date()) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "—";
  const diffMs = timestamp.getTime() - now.getTime();
  const absMinutes = Math.round(Math.abs(diffMs) / (60 * 1000));
  if (absMinutes < 1) return "now";
  if (absMinutes < 60) return diffMs >= 0 ? `in ${absMinutes}m` : `${absMinutes}m ago`;
  const absHours = Math.round(absMinutes / 60);
  if (absHours < 24) return diffMs >= 0 ? `in ${absHours}h` : `${absHours}h ago`;
  const absDays = Math.round(absHours / 24);
  return diffMs >= 0 ? `in ${absDays}d` : `${absDays}d ago`;
}

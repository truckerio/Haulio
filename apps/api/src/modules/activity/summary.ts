import { NotePriority, NoteType, Role } from "@truckerio/db";
import {
  ISSUE_LABELS,
  ISSUE_SEVERITY_SORT_ORDER,
  ISSUE_TYPE_DEFAULT_SEVERITY,
  ISSUE_TYPE_DOMAIN,
  type IssueType,
} from "../../lib/load-issues";
import type { TodayIssueSummary, TodayIssueTile } from "../today/issue-summary";

export type ActivitySeverity = "ALERT" | "IMPORTANT" | "INFO";
export type ActivityDomain = "DISPATCH" | "BILLING" | "SAFETY" | "SYSTEM";
export type ActivityBucket = "NOW" | "WEEK" | "HISTORY";
export type ActivityRange = "today" | "week" | "all";
export type ActivityDomainFilter = "dispatch" | "billing" | "safety" | "all";

export type ActivityItem = {
  id: string;
  title: string;
  severity: ActivitySeverity;
  domain: ActivityDomain;
  timestamp: string;
  count?: number;
  entities?: Array<{ entityType: string; entityId: string; refLabel?: string }>;
  cta: { label: string; href: string };
};

export type ActivitySummaryResponse = {
  badgeCount: number;
  generatedAt: string;
  now: ActivityItem[];
  week: ActivityItem[];
  history: ActivityItem[];
  kpis: {
    openAlerts: number;
    openExceptions: number;
    dueToday: number;
    dueThisWeek: number;
    missingPod: number;
    unassignedLoads: number;
    atRiskStops: number;
  };
};

export type ActivityNoteGroupInput = {
  priority: NotePriority;
  noteType: NoteType;
  count: number;
  timestamp: Date;
};

export type ActivityHistoryInput = {
  id: string;
  title: string;
  domain: ActivityDomain;
  timestamp: Date;
  href: string;
};

const NOW_ISSUE_TYPES = new Set<IssueType>([
  "NEEDS_ASSIGNMENT",
  "OVERDUE",
  "MISSING_POD",
  "MISSING_BOL",
  "MISSING_RATECON",
  "MISSING_APPOINTMENT",
  "MISSING_BILL_TO",
  "BILLING_PROFILE_INCOMPLETE",
  "COMPLIANCE_EXPIRED",
  "OPEN_EXCEPTION",
]);

const WEEK_ISSUE_TYPES = new Set<IssueType>([
  "LATE_RISK",
  "PENDING_APPROVALS",
  "LOAD_NOT_DELIVERED",
  "COMPLIANCE_EXPIRING",
]);

const ISSUE_DOMAIN_ORDER: Record<ActivityDomain, number> = {
  DISPATCH: 0,
  BILLING: 1,
  SAFETY: 2,
  SYSTEM: 3,
};

const ACTIVITY_SEVERITY_ORDER: Record<ActivitySeverity, number> = {
  ALERT: 0,
  IMPORTANT: 1,
  INFO: 2,
};

function toActivityDomain(value: TodayIssueTile["domain"]): ActivityDomain {
  if (value === "DISPATCH") return "DISPATCH";
  if (value === "BILLING") return "BILLING";
  if (value === "COMPLIANCE") return "SAFETY";
  return "SYSTEM";
}

function toActivitySeverity(value: TodayIssueTile["severity"]): ActivitySeverity {
  if (value === "BLOCKER") return "ALERT";
  if (value === "WARNING") return "IMPORTANT";
  return "INFO";
}

function inferIssueBucket(type: IssueType, severity: ActivitySeverity): ActivityBucket {
  if (NOW_ISSUE_TYPES.has(type) || severity === "ALERT") return "NOW";
  if (WEEK_ISSUE_TYPES.has(type) || severity === "IMPORTANT") return "WEEK";
  return "HISTORY";
}

function noteTypeToDomain(noteType: NoteType): ActivityDomain {
  if (noteType === NoteType.BILLING) return "BILLING";
  if (noteType === NoteType.COMPLIANCE) return "SAFETY";
  if (noteType === NoteType.OPERATIONAL || noteType === NoteType.CUSTOMER_VISIBLE) return "DISPATCH";
  return "SYSTEM";
}

function notePriorityToSeverity(priority: NotePriority): ActivitySeverity {
  if (priority === NotePriority.ALERT) return "ALERT";
  if (priority === NotePriority.IMPORTANT) return "IMPORTANT";
  return "INFO";
}

function notePriorityToBucket(priority: NotePriority): ActivityBucket {
  if (priority === NotePriority.ALERT) return "NOW";
  if (priority === NotePriority.IMPORTANT) return "WEEK";
  return "HISTORY";
}

function queueCtaLabel(domain: ActivityDomain) {
  if (domain === "DISPATCH") return "Open Dispatch queue";
  if (domain === "BILLING") return "Open Billing queue";
  if (domain === "SAFETY") return "Open Safety queue";
  return "Open queue";
}

function queueHrefByDomain(domain: ActivityDomain) {
  if (domain === "DISPATCH") return "/dispatch";
  if (domain === "BILLING") return "/finance";
  if (domain === "SAFETY") return "/loads?issuePreset=COMPLIANCE_EXPIRING";
  return "/audit";
}

function normalizeDomainFilter(item: ActivityDomain, filter: ActivityDomainFilter) {
  if (filter === "all") return true;
  if (filter === "dispatch") return item === "DISPATCH";
  if (filter === "billing") return item === "BILLING";
  return item === "SAFETY";
}

function compareActivityItems(left: ActivityItem, right: ActivityItem) {
  const severityDiff = ACTIVITY_SEVERITY_ORDER[left.severity] - ACTIVITY_SEVERITY_ORDER[right.severity];
  if (severityDiff !== 0) return severityDiff;
  const domainDiff = ISSUE_DOMAIN_ORDER[left.domain] - ISSUE_DOMAIN_ORDER[right.domain];
  if (domainDiff !== 0) return domainDiff;
  const countDiff = (right.count ?? 1) - (left.count ?? 1);
  if (countDiff !== 0) return countDiff;
  const timeDiff = new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
  if (timeDiff !== 0) return timeDiff;
  return left.id.localeCompare(right.id);
}

function mergeItem(grouped: Map<string, ActivityItem>, next: ActivityItem) {
  const existing = grouped.get(next.id);
  if (!existing) {
    grouped.set(next.id, next);
    return;
  }
  const mergedCount = (existing.count ?? 0) + (next.count ?? 0);
  const latestTimestamp =
    new Date(existing.timestamp).getTime() >= new Date(next.timestamp).getTime() ? existing.timestamp : next.timestamp;
  const merged: ActivityItem = {
    ...existing,
    count: mergedCount > 0 ? mergedCount : undefined,
    timestamp: latestTimestamp,
  };
  grouped.set(next.id, merged);
}

export function roleDefaultActivityDomain(role: Role): ActivityDomainFilter {
  if (role === Role.BILLING) return "billing";
  if (role === Role.SAFETY) return "safety";
  return "dispatch";
}

function createIssueItems(issueSummary?: TodayIssueSummary): Array<{ bucket: ActivityBucket; item: ActivityItem }> {
  const tiles = issueSummary?.tiles ?? [];
  return tiles
    .filter((tile) => tile.count > 0)
    .map((tile) => {
      const severity = toActivitySeverity(tile.severity);
      const domain = toActivityDomain(tile.domain);
      const bucket = inferIssueBucket(tile.type, severity);
      return {
        bucket,
        item: {
          id: `issue:${tile.type}`,
          title: ISSUE_LABELS[tile.type],
          severity,
          domain,
          timestamp: new Date(0).toISOString(),
          count: tile.count,
          cta: {
            label: queueCtaLabel(domain),
            href: tile.href,
          },
        },
      };
    });
}

function createNoteItems(noteGroups: ActivityNoteGroupInput[]): Array<{ bucket: ActivityBucket; item: ActivityItem }> {
  return noteGroups
    .filter((group) => group.count > 0)
    .map((group) => {
      const domain = noteTypeToDomain(group.noteType);
      const severity = notePriorityToSeverity(group.priority);
      const bucket = notePriorityToBucket(group.priority);
      const prefix =
        group.priority === NotePriority.ALERT ? "Alert notes" : group.priority === NotePriority.IMPORTANT ? "Important notes" : "Notes";
      const noteTypeLabel = group.noteType.toLowerCase();
      return {
        bucket,
        item: {
          id: `note:${group.priority}:${group.noteType}`,
          title: `${prefix} · ${noteTypeLabel}`,
          severity,
          domain,
          timestamp: group.timestamp.toISOString(),
          count: group.count,
          cta: {
            label: queueCtaLabel(domain),
            href: queueHrefByDomain(domain),
          },
        },
      };
    });
}

function createHistoryItems(history: ActivityHistoryInput[]): Array<{ bucket: ActivityBucket; item: ActivityItem }> {
  return history.map((entry) => ({
    bucket: "HISTORY" as const,
    item: {
      id: `history:${entry.id}`,
      title: entry.title,
      severity: "INFO",
      domain: entry.domain,
      timestamp: entry.timestamp.toISOString(),
      cta: {
        label: "Open queue",
        href: entry.href,
      },
    },
  }));
}

function issueCount(summary: TodayIssueSummary | undefined, type: IssueType) {
  return summary?.counts[type] ?? 0;
}

export function buildActivitySummary(params: {
  generatedAt?: Date;
  role: Role;
  issueSummary?: TodayIssueSummary;
  noteGroups?: ActivityNoteGroupInput[];
  history?: ActivityHistoryInput[];
  openExceptionsCount?: number;
  range?: ActivityRange;
  domain?: ActivityDomainFilter;
}): ActivitySummaryResponse {
  const generatedAt = params.generatedAt ?? new Date();
  const range = params.range ?? "all";
  const domainFilter = params.domain ?? "all";

  const grouped = {
    NOW: new Map<string, ActivityItem>(),
    WEEK: new Map<string, ActivityItem>(),
    HISTORY: new Map<string, ActivityItem>(),
  } as const;

  const items = [
    ...createIssueItems(params.issueSummary),
    ...createNoteItems(params.noteGroups ?? []),
    ...createHistoryItems(params.history ?? []),
  ];

  for (const entry of items) {
    if (!normalizeDomainFilter(entry.item.domain, domainFilter)) continue;
    mergeItem(grouped[entry.bucket], entry.item);
  }

  const now = Array.from(grouped.NOW.values()).sort(compareActivityItems);
  const week = Array.from(grouped.WEEK.values()).sort(compareActivityItems);
  const history = Array.from(grouped.HISTORY.values()).sort(compareActivityItems);

  const rangeNow = range === "week" ? [] : now;
  const rangeWeek = range === "today" ? [] : week;
  const rangeHistory = range === "all" ? history : [];

  const badgeCount = rangeNow
    .filter((item) => item.severity === "ALERT")
    .reduce((total, item) => total + (item.count ?? 1), 0);

  return {
    badgeCount,
    generatedAt: generatedAt.toISOString(),
    now: rangeNow,
    week: rangeWeek,
    history: rangeHistory,
    kpis: {
      openAlerts: now.filter((item) => item.severity === "ALERT").reduce((total, item) => total + (item.count ?? 1), 0),
      openExceptions: params.openExceptionsCount ?? issueCount(params.issueSummary, "OPEN_EXCEPTION"),
      dueToday: issueCount(params.issueSummary, "OVERDUE") + issueCount(params.issueSummary, "MISSING_APPOINTMENT"),
      dueThisWeek: issueCount(params.issueSummary, "LATE_RISK") + issueCount(params.issueSummary, "COMPLIANCE_EXPIRING"),
      missingPod: issueCount(params.issueSummary, "MISSING_POD"),
      unassignedLoads: issueCount(params.issueSummary, "NEEDS_ASSIGNMENT"),
      atRiskStops: issueCount(params.issueSummary, "OVERDUE") + issueCount(params.issueSummary, "LATE_RISK"),
    },
  };
}

export function sortTodayTilesDeterministically(tiles: TodayIssueTile[]) {
  return [...tiles].sort((left, right) => {
    const severityDiff = ISSUE_SEVERITY_SORT_ORDER[left.severity] - ISSUE_SEVERITY_SORT_ORDER[right.severity];
    if (severityDiff !== 0) return severityDiff;
    const leftDomain = ISSUE_TYPE_DOMAIN[left.type];
    const rightDomain = ISSUE_TYPE_DOMAIN[right.type];
    if (leftDomain !== rightDomain) return leftDomain.localeCompare(rightDomain);
    const countDiff = right.count - left.count;
    if (countDiff !== 0) return countDiff;
    return left.type.localeCompare(right.type);
  });
}

export function issueSeverityToActivity(issueType: IssueType) {
  const severity = ISSUE_TYPE_DEFAULT_SEVERITY[issueType];
  if (severity === "BLOCKER") return "ALERT";
  if (severity === "WARNING") return "IMPORTANT";
  return "INFO";
}

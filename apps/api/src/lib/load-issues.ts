import { Role } from "@truckerio/db";
import { z } from "zod";
import {
  type LoadReadinessProjection,
  type ReadinessBlockerCode,
  type ReadinessSeverity,
  sortAndDedupeReadinessBlockers,
} from "./load-readiness";

export const ISSUE_TYPES = [
  "NEEDS_ASSIGNMENT",
  "LATE_RISK",
  "OVERDUE",
  "MISSING_POD",
  "MISSING_BOL",
  "MISSING_RATECON",
  "MISSING_APPOINTMENT",
  "PENDING_APPROVALS",
  "MISSING_BILL_TO",
  "BILLING_PROFILE_INCOMPLETE",
  "LOAD_NOT_DELIVERED",
  "COMPLIANCE_EXPIRED",
  "COMPLIANCE_EXPIRING",
  "OPEN_EXCEPTION",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_SEVERITIES = ["BLOCKER", "WARNING", "INFO"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_DOMAINS = ["DISPATCH", "BILLING", "COMPLIANCE", "DATA"] as const;
export type IssueDomain = (typeof ISSUE_DOMAINS)[number];

export const ISSUE_FOCUS_SECTIONS = ["assignment", "stops", "documents", "tracking", "exceptions"] as const;
export type IssueFocusSection = (typeof ISSUE_FOCUS_SECTIONS)[number];

const issueTypeSchema = z.enum(ISSUE_TYPES);
const issueFocusSectionSchema = z.enum(ISSUE_FOCUS_SECTIONS);
const issueSeveritySchema = z.enum(["BLOCKER", "WARNING"]);

export const issueTagSchema = z.object({
  type: issueTypeSchema,
  label: z.string().min(1),
  severity: issueSeveritySchema,
  focusSection: issueFocusSectionSchema,
  actionHint: z.string().min(1),
});

export type IssueTag = z.infer<typeof issueTagSchema>;

export const readinessBlockerToIssueType: Record<ReadinessBlockerCode, IssueType> = {
  UNASSIGNED_DRIVER: "NEEDS_ASSIGNMENT",
  UNASSIGNED_EQUIPMENT: "NEEDS_ASSIGNMENT",
  MISSING_APPOINTMENT: "MISSING_APPOINTMENT",
  APPT_AT_RISK: "LATE_RISK",
  OVERDUE: "OVERDUE",
  OPEN_EXCEPTION: "OPEN_EXCEPTION",
  MISSING_POD: "MISSING_POD",
  MISSING_BOL: "MISSING_BOL",
  MISSING_RATECON: "MISSING_RATECON",
  UNAPPROVED_ACCESSORIAL: "PENDING_APPROVALS",
  MISSING_BILL_TO: "MISSING_BILL_TO",
  BILLING_PROFILE_INCOMPLETE: "BILLING_PROFILE_INCOMPLETE",
  LOAD_NOT_DELIVERED: "LOAD_NOT_DELIVERED",
  DRIVER_DOC_EXPIRED: "COMPLIANCE_EXPIRED",
  DRIVER_DOC_EXPIRING_SOON: "COMPLIANCE_EXPIRING",
  EQUIPMENT_DOC_EXPIRED: "COMPLIANCE_EXPIRED",
  EQUIPMENT_DOC_EXPIRING_SOON: "COMPLIANCE_EXPIRING",
};

export const ISSUE_LABELS: Record<IssueType, string> = {
  NEEDS_ASSIGNMENT: "Needs assignment",
  LATE_RISK: "Appointment at risk",
  OVERDUE: "Stop overdue",
  MISSING_POD: "Missing POD",
  MISSING_BOL: "Missing BOL",
  MISSING_RATECON: "Missing RateCon",
  MISSING_APPOINTMENT: "Missing appointment",
  PENDING_APPROVALS: "Pending approvals",
  MISSING_BILL_TO: "Missing bill-to",
  BILLING_PROFILE_INCOMPLETE: "Billing profile incomplete",
  LOAD_NOT_DELIVERED: "Load not delivered",
  COMPLIANCE_EXPIRED: "Compliance expired",
  COMPLIANCE_EXPIRING: "Compliance expiring soon",
  OPEN_EXCEPTION: "Open exception",
};

export const ISSUE_TYPE_DEFAULT_SEVERITY: Record<IssueType, IssueSeverity> = {
  NEEDS_ASSIGNMENT: "BLOCKER",
  LATE_RISK: "WARNING",
  OVERDUE: "BLOCKER",
  MISSING_POD: "BLOCKER",
  MISSING_BOL: "BLOCKER",
  MISSING_RATECON: "BLOCKER",
  MISSING_APPOINTMENT: "BLOCKER",
  PENDING_APPROVALS: "WARNING",
  MISSING_BILL_TO: "BLOCKER",
  BILLING_PROFILE_INCOMPLETE: "BLOCKER",
  LOAD_NOT_DELIVERED: "INFO",
  COMPLIANCE_EXPIRED: "BLOCKER",
  COMPLIANCE_EXPIRING: "WARNING",
  OPEN_EXCEPTION: "WARNING",
};

export const ISSUE_TYPE_DOMAIN: Record<IssueType, IssueDomain> = {
  NEEDS_ASSIGNMENT: "DISPATCH",
  LATE_RISK: "DISPATCH",
  OVERDUE: "DISPATCH",
  MISSING_POD: "BILLING",
  MISSING_BOL: "BILLING",
  MISSING_RATECON: "BILLING",
  MISSING_APPOINTMENT: "DISPATCH",
  PENDING_APPROVALS: "BILLING",
  MISSING_BILL_TO: "BILLING",
  BILLING_PROFILE_INCOMPLETE: "BILLING",
  LOAD_NOT_DELIVERED: "BILLING",
  COMPLIANCE_EXPIRED: "COMPLIANCE",
  COMPLIANCE_EXPIRING: "COMPLIANCE",
  OPEN_EXCEPTION: "DISPATCH",
};

export const ISSUE_SEVERITY_SORT_ORDER: Record<IssueSeverity, number> = {
  BLOCKER: 0,
  WARNING: 1,
  INFO: 2,
};

export const ISSUE_DOMAIN_SORT_ORDER: Record<IssueDomain, number> = {
  DISPATCH: 0,
  BILLING: 1,
  COMPLIANCE: 2,
  DATA: 3,
};

const issueFocusSections: Record<IssueType, IssueFocusSection> = {
  NEEDS_ASSIGNMENT: "assignment",
  LATE_RISK: "stops",
  OVERDUE: "stops",
  MISSING_POD: "documents",
  MISSING_BOL: "documents",
  MISSING_RATECON: "documents",
  MISSING_APPOINTMENT: "stops",
  PENDING_APPROVALS: "documents",
  MISSING_BILL_TO: "documents",
  BILLING_PROFILE_INCOMPLETE: "documents",
  LOAD_NOT_DELIVERED: "stops",
  COMPLIANCE_EXPIRED: "assignment",
  COMPLIANCE_EXPIRING: "assignment",
  OPEN_EXCEPTION: "exceptions",
};

const issueTypeRank = ISSUE_TYPES.reduce(
  (acc, key, index) => {
    acc[key] = index;
    return acc;
  },
  {} as Record<IssueType, number>
);

const severityRank: Record<ReadinessSeverity, number> = {
  BLOCKER: 0,
  WARNING: 1,
};

function emptyIssueCounts(): Record<IssueType, number> {
  return ISSUE_TYPES.reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<IssueType, number>
  );
}

function compareIssueTags(left: IssueTag, right: IssueTag) {
  const severityDiff = severityRank[left.severity] - severityRank[right.severity];
  if (severityDiff !== 0) return severityDiff;
  const typeDiff = issueTypeRank[left.type] - issueTypeRank[right.type];
  if (typeDiff !== 0) return typeDiff;
  const labelDiff = left.label.localeCompare(right.label);
  if (labelDiff !== 0) return labelDiff;
  return left.actionHint.localeCompare(right.actionHint);
}

export function mapReadinessProjectionToIssues(projection: LoadReadinessProjection): {
  issuesTop: IssueTag[];
  issues: IssueTag[];
  issueCounts: Record<IssueType, number>;
  issuesText: string;
} {
  const blockers = sortAndDedupeReadinessBlockers(projection.overall.blockers);
  const issueCounts = emptyIssueCounts();
  const byType = new Map<IssueType, IssueTag>();

  for (const blocker of blockers) {
    const type = readinessBlockerToIssueType[blocker.code];
    issueCounts[type] += 1;
    const candidate = issueTagSchema.parse({
      type,
      label: ISSUE_LABELS[type],
      severity: blocker.severity,
      focusSection: issueFocusSections[type],
      actionHint: blocker.actionHint,
    });
    const existing = byType.get(type);
    if (!existing || compareIssueTags(candidate, existing) < 0) {
      byType.set(type, candidate);
    }
  }

  const issues = Array.from(byType.values()).sort(compareIssueTags);
  const issuesTop = issues.slice(0, 2);
  const issuesText =
    issuesTop.length === 0
      ? "No issues"
      : issues.length > 2
        ? `${issuesTop.map((item) => item.label).join(" · ")} · +${issues.length - 2} more`
        : issuesTop.map((item) => item.label).join(" · ");

  return {
    issuesTop,
    issues,
    issueCounts,
    issuesText,
  };
}

export function groupIssuesByFocusSection(issues: IssueTag[]): Record<IssueFocusSection, IssueTag[]> {
  const grouped: Record<IssueFocusSection, IssueTag[]> = {
    assignment: [],
    stops: [],
    documents: [],
    tracking: [],
    exceptions: [],
  };
  for (const issue of issues.map((row) => issueTagSchema.parse(row))) {
    grouped[issue.focusSection].push(issue);
  }
  for (const key of ISSUE_FOCUS_SECTIONS) {
    grouped[key] = grouped[key].sort(compareIssueTags);
  }
  return grouped;
}

export function issueTypesForRole(role: Role): IssueType[] {
  if (role === Role.DRIVER) {
    return ["MISSING_POD", "MISSING_BOL", "LATE_RISK", "OVERDUE", "OPEN_EXCEPTION"];
  }
  if (role === Role.BILLING) {
    return [
      "MISSING_POD",
      "MISSING_BOL",
      "MISSING_RATECON",
      "PENDING_APPROVALS",
      "MISSING_BILL_TO",
      "BILLING_PROFILE_INCOMPLETE",
      "LOAD_NOT_DELIVERED",
    ];
  }
  if (role === Role.SAFETY) {
    return ["COMPLIANCE_EXPIRED", "COMPLIANCE_EXPIRING", "OPEN_EXCEPTION"];
  }
  if (role === Role.SUPPORT) {
    return ["OPEN_EXCEPTION", "NEEDS_ASSIGNMENT", "LATE_RISK", "OVERDUE", "MISSING_POD", "MISSING_BOL"];
  }
  return [
    "NEEDS_ASSIGNMENT",
    "LATE_RISK",
    "OVERDUE",
    "MISSING_APPOINTMENT",
    "OPEN_EXCEPTION",
    "MISSING_POD",
    "MISSING_BOL",
    "MISSING_RATECON",
    "PENDING_APPROVALS",
    "MISSING_BILL_TO",
    "BILLING_PROFILE_INCOMPLETE",
    "LOAD_NOT_DELIVERED",
    "COMPLIANCE_EXPIRED",
    "COMPLIANCE_EXPIRING",
  ];
}

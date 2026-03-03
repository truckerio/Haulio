"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { formatDateTime as formatDateTime24 } from "@/lib/date-time";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type DispatchStatus =
  | "DRAFT"
  | "PLANNED"
  | "ASSIGNED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "POD_RECEIVED"
  | "READY_TO_INVOICE"
  | "INVOICED"
  | "PAID"
  | "CANCELLED";

export type DispatchInspectorFocusSection = "stops" | "documents" | "tracking" | "assignment" | "exceptions";

type DispatchIssueTag = {
  type: string;
  label: string;
  severity: "BLOCKER" | "WARNING";
  focusSection?: DispatchInspectorFocusSection | null;
  actionHint: string;
};

export type DispatchGridColumnKey =
  | "select"
  | "loadNumber"
  | "status"
  | "customer"
  | "pickupAppt"
  | "deliveryAppt"
  | "assignment"
  | "miles"
  | "paidMiles"
  | "rate"
  | "notes"
  | "docs"
  | "exceptions"
  | "risk"
  | "nextAction"
  | "tripNumber"
  | "updatedAt";

export type DispatchGridDensity = "compact" | "comfortable";

export type DispatchGridRow = {
  id: string;
  loadNumber: string;
  status: string;
  customerName?: string | null;
  miles?: number | null;
  paidMiles?: number | null;
  rate?: number | string | null;
  updatedAt?: string | null;
  trip?: {
    id: string;
    tripNumber: string;
    status: string;
  } | null;
  assignment?: {
    driver?: { id: string; name: string } | null;
    truck?: { id: string; unit: string } | null;
    trailer?: { id: string; unit: string } | null;
  };
  route?: {
    shipperCity?: string | null;
    shipperState?: string | null;
    consigneeCity?: string | null;
    consigneeState?: string | null;
  };
  nextStop?: {
    appointmentStart?: string | null;
    appointmentEnd?: string | null;
  } | null;
  notesIndicator?: "NONE" | "NORMAL" | "ALERT" | null;
  docs?: {
    hasPod?: boolean;
    hasBol?: boolean;
    hasRateCon?: boolean;
  } | null;
  exceptions?: Array<{
    id: string;
    type?: string;
    severity?: "WARNING" | "BLOCKER";
    status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
    title?: string;
    message?: string;
    code?: string;
  }> | null;
  issuesTop?: DispatchIssueTag[] | null;
  issues?: DispatchIssueTag[] | null;
  issueCounts?: Record<string, number> | null;
  issuesText?: string | null;
  riskFlags?: {
    needsAssignment: boolean;
    trackingOffInTransit?: boolean;
    overdueStopWindow?: boolean;
    atRisk: boolean;
  };
};

type InlineEditField = "status" | "customerName" | "miles" | "rate";

type DispatchGridColumn = {
  key: DispatchGridColumnKey;
  label: string;
  width: number;
  frozen?: boolean;
  required?: boolean;
  editable?: boolean;
  align?: "left" | "right" | "center";
  filterable?: boolean;
  sortable?: boolean;
};

type IncludeExcludeFilterState<T extends string = string> = {
  includeValues: T[];
  excludeValues: T[];
};

type TextFilterState = IncludeExcludeFilterState & {
  search: string;
};

type AppointmentUrgencyOption = "atRisk" | "overdue" | "today" | "tomorrow" | "missing";

type AppointmentFilterState = {
  search: string;
  includeCities: string[];
  excludeCities: string[];
  urgency: AppointmentUrgencyOption[];
  fromDate: string;
  toDate: string;
};

type AssignmentFilterState = {
  state: "all" | "fullyAssigned" | "partiallyAssigned" | "unassigned";
  driverSearch: string;
  missingDriver: boolean;
  missingTruck: boolean;
  missingTrailer: boolean;
};

type StatusFilterState = IncludeExcludeFilterState;
type DocsFilterOption = "missingPod" | "missingBol" | "missingAnyRequired" | "docsComplete";
type DocsFilterState = IncludeExcludeFilterState<DocsFilterOption>;
type RiskFilterOption = "hasRisk" | "hasOpenException" | "noIssues";
type RiskFilterState = IncludeExcludeFilterState<RiskFilterOption>;
type IssueTypeFilterState = IncludeExcludeFilterState;

type ColumnFilterState = {
  loadNumber?: TextFilterState;
  customer?: TextFilterState;
  status?: StatusFilterState;
  pickupAppt?: AppointmentFilterState;
  deliveryAppt?: AppointmentFilterState;
  assignment?: AssignmentFilterState;
  docs?: DocsFilterState;
  risk?: RiskFilterState;
  issueTypes?: IssueTypeFilterState;
  firefightingMode?: boolean;
};

export type DispatchGridFilterState = ColumnFilterState;

const STATUS_OPTIONS: DispatchStatus[] = [
  "DRAFT",
  "PLANNED",
  "ASSIGNED",
  "IN_TRANSIT",
  "DELIVERED",
  "POD_RECEIVED",
  "READY_TO_INVOICE",
  "INVOICED",
  "PAID",
  "CANCELLED",
];

export const DISPATCH_GRID_COLUMNS: DispatchGridColumn[] = [
  { key: "select", label: "", width: 44, frozen: true, required: true, align: "center" },
  { key: "loadNumber", label: "Load #", width: 190, frozen: true, required: true, filterable: true, sortable: true },
  { key: "status", label: "Status", width: 132, frozen: true, required: true, editable: true, filterable: true, sortable: true },
  { key: "customer", label: "Customer", width: 180, required: true, editable: true, filterable: true, sortable: true },
  { key: "pickupAppt", label: "Pickup", width: 220, required: true, filterable: true, sortable: true },
  { key: "deliveryAppt", label: "Delivery", width: 220, required: true, filterable: true, sortable: true },
  { key: "assignment", label: "Assignment", width: 250, required: true, filterable: true, sortable: true },
  { key: "miles", label: "Miles", width: 96, required: true, editable: true, align: "right", sortable: true },
  { key: "paidMiles", label: "Paid", width: 96, required: false, align: "right", sortable: true },
  { key: "rate", label: "Rate", width: 120, required: true, editable: true, align: "right", sortable: true },
  { key: "notes", label: "Notes", width: 118, required: true, align: "center", sortable: true },
  { key: "docs", label: "Docs", width: 168, required: true, filterable: true, sortable: true },
  { key: "exceptions", label: "Exceptions", width: 220, required: true, sortable: true },
  { key: "risk", label: "Risk", width: 128, required: true, align: "center", filterable: true, sortable: true },
  { key: "nextAction", label: "Next Best Action", width: 220, required: true, sortable: true },
  { key: "tripNumber", label: "Trip #", width: 140, required: false, sortable: true },
  { key: "updatedAt", label: "Updated", width: 160, required: false, sortable: true },
];

export const DISPATCH_REQUIRED_COLUMNS = DISPATCH_GRID_COLUMNS.filter((column) => column.required).map((column) => column.key);
export const DISPATCH_OPTIONAL_COLUMNS = DISPATCH_GRID_COLUMNS.filter((column) => !column.required).map((column) => column.key);
export const DISPATCH_FROZEN_COLUMNS = DISPATCH_GRID_COLUMNS.filter((column) => column.frozen).map((column) => column.key);

const INITIAL_FOCUS = { rowIndex: 0, columnIndex: 1 };

const emptyTextFilter = (): TextFilterState => ({ search: "", includeValues: [], excludeValues: [] });
const emptyAppointmentFilter = (): AppointmentFilterState => ({
  search: "",
  includeCities: [],
  excludeCities: [],
  urgency: [],
  fromDate: "",
  toDate: "",
});
const emptyAssignmentFilter = (): AssignmentFilterState => ({
  state: "all",
  driverSearch: "",
  missingDriver: false,
  missingTruck: false,
  missingTrailer: false,
});

const emptyStatusFilter = (): StatusFilterState => ({
  includeValues: [],
  excludeValues: [],
});
const emptyDocsFilter = (): DocsFilterState => ({
  includeValues: [],
  excludeValues: [],
});
const emptyRiskFilter = (): RiskFilterState => ({
  includeValues: [],
  excludeValues: [],
});

const APPOINTMENT_AT_RISK_MINUTES = 120;

const APPOINTMENT_URGENCY_OPTIONS: Array<{ value: AppointmentUrgencyOption; label: string }> = [
  { value: "atRisk", label: "At risk" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "missing", label: "Missing appointment" },
];

const DOCS_FILTER_OPTIONS: Array<{ value: DocsFilterOption; label: string }> = [
  { value: "missingPod", label: "Missing POD" },
  { value: "missingBol", label: "Missing BOL" },
  { value: "missingAnyRequired", label: "Missing any required doc" },
  { value: "docsComplete", label: "Docs complete" },
];

const RISK_FILTER_OPTIONS: Array<{ value: RiskFilterOption; label: string }> = [
  { value: "hasRisk", label: "Has any risk" },
  { value: "hasOpenException", label: "Has open exception" },
  { value: "noIssues", label: "No issues" },
];

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "PAID" || status === "INVOICED" || status === "DELIVERED") return "success";
  if (status === "IN_TRANSIT") return "info";
  if (status === "READY_TO_INVOICE" || status === "POD_RECEIVED") return "warning";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

function formatDateTime(value?: string | null) {
  return formatDateTime24(value, "-");
}

function formatRelativeAppointment(value?: string | null) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const absMinutes = Math.round(Math.abs(diffMs) / 60000);
  if (diffMs < 0) {
    if (absMinutes < 60) return `overdue by ${absMinutes}m`;
    if (absMinutes < 24 * 60) return `overdue by ${Math.round(absMinutes / 60)}h`;
    return `overdue by ${Math.round(absMinutes / (24 * 60))}d`;
  }
  if (absMinutes < 60) return `in ${absMinutes}m`;
  if (absMinutes < 24 * 60) return `in ${Math.round(absMinutes / 60)}h`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (target.toDateString() === tomorrow.toDateString()) return "tomorrow";
  return `in ${Math.round(absMinutes / (24 * 60))}d`;
}

function routeLabel(city?: string | null, state?: string | null) {
  if (!city && !state) return "-";
  if (city && state) return `${city}, ${state}`;
  return city ?? state ?? "-";
}

function normalizeRate(rate?: number | string | null) {
  if (rate === null || rate === undefined || rate === "") return "-";
  const numeric = typeof rate === "string" ? Number(rate) : rate;
  if (!Number.isFinite(numeric)) return String(rate);
  return numeric.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function buildDocsBadgeRow(row: DispatchGridRow) {
  const chips: Array<{ label: string; tone: "success" | "warning" }> = [];
  chips.push({ label: row.docs?.hasPod ? "POD" : "POD missing", tone: row.docs?.hasPod ? "success" : "warning" });
  chips.push({ label: row.docs?.hasBol ? "BOL" : "BOL missing", tone: row.docs?.hasBol ? "success" : "warning" });
  return chips;
}

function buildExceptions(row: DispatchGridRow) {
  const normalized: Array<{ label: string; tone: "warning" | "danger" }> = [];
  const seen = new Set<string>();
  for (const exception of row.exceptions ?? []) {
    if (!exception || exception.status === "RESOLVED") continue;
    const label = (exception.title ?? exception.message ?? exception.code ?? exception.type ?? "Issue").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    normalized.push({
      label,
      tone: exception.severity === "BLOCKER" ? "danger" : "warning",
    });
  }
  if (normalized.length) return normalized;

  const fallback: Array<{ label: string; tone: "warning" | "danger" }> = [];
  if (row.riskFlags?.needsAssignment) fallback.push({ label: "Needs assignment", tone: "danger" });
  if (row.riskFlags?.trackingOffInTransit) fallback.push({ label: "Tracking off", tone: "warning" });
  if (row.riskFlags?.overdueStopWindow) fallback.push({ label: "Overdue stop", tone: "warning" });
  return fallback;
}

function noteIndicatorRank(row: DispatchGridRow) {
  if (row.notesIndicator === "ALERT") return 2;
  if (row.notesIndicator === "NORMAL") return 1;
  return 0;
}

function noteIndicatorLabel(row: DispatchGridRow) {
  if (row.notesIndicator === "ALERT") return "Alert note";
  if (row.notesIndicator === "NORMAL") return "Has note";
  return "No note";
}

function buildNextBestAction(row: DispatchGridRow) {
  if (row.issuesTop?.length) {
    return {
      label: "Resolve issue",
      reason: row.issuesTop[0]?.label ?? row.issuesText ?? "Action needed",
    };
  }
  const unresolved = (row.exceptions ?? []).filter((exception) => exception.status !== "RESOLVED");
  const blocker = unresolved.find((exception) => exception.severity === "BLOCKER");
  if (blocker) {
    return { label: "Resolve blocker", reason: blocker.title ?? blocker.type ?? "Dispatch exception" };
  }
  if (unresolved.length) {
    return { label: "Acknowledge exception", reason: unresolved[0].title ?? unresolved[0].type ?? "Dispatch issue" };
  }
  if (row.riskFlags?.needsAssignment) {
    return { label: "Assign driver + assets", reason: "Missing assignment" };
  }
  if (row.riskFlags?.trackingOffInTransit) {
    return { label: "Start tracking", reason: "No live pings" };
  }
  if (row.riskFlags?.overdueStopWindow) {
    return { label: "Update stop ETA", reason: "Appointment overdue" };
  }
  return { label: "Monitor", reason: "On plan" };
}

function buildRiskIndicators(row: DispatchGridRow, exceptions: Array<{ label: string; tone: "warning" | "danger" }>) {
  const indicators: Array<{
    key: string;
    label: string;
    clearHint: string;
    tone: "warning" | "danger" | "neutral";
    focusSection: DispatchInspectorFocusSection;
    issueType?: string;
  }> = [];
  if (row.issuesTop?.length) {
    for (const issue of row.issuesTop.slice(0, 2)) {
      indicators.push({
        key: `issue:${issue.type}`,
        issueType: issue.type,
        label: issue.label,
        clearHint: issue.actionHint,
        tone: issue.severity === "BLOCKER" ? "danger" : "warning",
        focusSection: issue.focusSection ?? "stops",
      });
    }
    return indicators;
  }
  if (row.riskFlags?.overdueStopWindow) {
    indicators.push({
      key: "late",
      label: "Late stop window",
      clearHint: "Clear by updating ETA or marking arrival/departure in Stops.",
      tone: "danger",
      focusSection: "stops",
    });
  }
  if (!row.docs?.hasPod || !row.docs?.hasBol) {
    const missingDocs = [!row.docs?.hasPod ? "POD" : null, !row.docs?.hasBol ? "BOL" : null].filter(Boolean).join(" + ");
    indicators.push({
      key: "docs",
      label: `Missing ${missingDocs || "document(s)"}`,
      clearHint: "Clear by uploading the missing file in Docs.",
      tone: "warning",
      focusSection: "documents",
    });
  }
  const missingAssign = !row.assignment?.driver?.id || !row.assignment?.truck?.id || !row.assignment?.trailer?.id;
  if (missingAssign) {
    indicators.push({
      key: "assign",
      label: "Assignment incomplete",
      clearHint: "Clear by assigning driver, truck, and trailer.",
      tone: "warning",
      focusSection: "assignment",
    });
  }
  if (exceptions.length) {
    indicators.push({
      key: "exc",
      label: "Open exception",
      clearHint: "Clear by acknowledging/resolving the exception.",
      tone: "danger",
      focusSection: "exceptions",
    });
  }
  return indicators;
}

function toEditableField(column: DispatchGridColumnKey): InlineEditField | null {
  if (column === "status") return "status";
  if (column === "customer") return "customerName";
  if (column === "miles") return "miles";
  if (column === "rate") return "rate";
  return null;
}

function parseInlineValue(field: InlineEditField, value: string): { ok: true; parsed: string | number } | { ok: false; error: string } {
  if (field === "customerName") {
    const next = value.trim();
    if (!next) return { ok: false, error: "Customer is required" };
    return { ok: true, parsed: next };
  }
  if (field === "status") {
    if (!STATUS_OPTIONS.includes(value as DispatchStatus)) return { ok: false, error: "Invalid status" };
    return { ok: true, parsed: value };
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { ok: false, error: `${field === "rate" ? "Rate" : "Miles"} must be a non-negative number` };
  }
  return { ok: true, parsed: numeric };
}

function buildCellValue(row: DispatchGridRow, column: DispatchGridColumnKey): string {
  switch (column) {
    case "loadNumber":
      return row.loadNumber;
    case "status":
      return row.status;
    case "customer":
      return row.customerName ?? "";
    case "pickupAppt":
      return `${routeLabel(row.route?.shipperCity, row.route?.shipperState)} ${formatDateTime(row.nextStop?.appointmentStart ?? null)}`;
    case "deliveryAppt":
      return `${routeLabel(row.route?.consigneeCity, row.route?.consigneeState)} ${formatDateTime(row.nextStop?.appointmentEnd ?? null)}`;
    case "assignment":
      return `${row.assignment?.driver?.name ?? "Unassigned"} ${row.assignment?.truck?.unit ?? ""} ${row.assignment?.trailer?.unit ?? ""}`.trim();
    case "miles":
      return row.miles?.toString() ?? "";
    case "paidMiles":
      return row.paidMiles?.toString() ?? "";
    case "rate":
      return typeof row.rate === "number" ? row.rate.toString() : (row.rate ?? "").toString();
    case "notes":
      return row.notesIndicator ?? "NONE";
    case "tripNumber":
      return row.trip?.tripNumber ?? "-";
    case "updatedAt":
      return row.updatedAt ?? "";
    default:
      return "";
  }
}

function buildExportCellValue(row: DispatchGridRow, column: DispatchGridColumnKey): string {
  const nextAction = buildNextBestAction(row);
  const exceptions = buildExceptions(row);
  switch (column) {
    case "loadNumber":
      return row.loadNumber;
    case "status":
      return row.status;
    case "customer":
      return row.customerName ?? "";
    case "pickupAppt":
      return `${routeLabel(row.route?.shipperCity, row.route?.shipperState)} | ${formatDateTime(row.nextStop?.appointmentStart ?? null)}`;
    case "deliveryAppt":
      return `${routeLabel(row.route?.consigneeCity, row.route?.consigneeState)} | ${formatDateTime(row.nextStop?.appointmentEnd ?? null)}`;
    case "assignment":
      return `${row.assignment?.driver?.name ?? "Unassigned"} | ${row.assignment?.truck?.unit ?? "No truck"} | ${row.assignment?.trailer?.unit ?? "No trailer"}`;
    case "miles":
      return row.miles == null ? "" : String(row.miles);
    case "paidMiles":
      return row.paidMiles == null ? "" : String(row.paidMiles);
    case "rate":
      return normalizeRate(row.rate);
    case "notes":
      return noteIndicatorLabel(row);
    case "docs":
      return buildDocsBadgeRow(row).map((doc) => doc.label).join("; ");
    case "exceptions":
      return exceptions.map((item) => item.label).join("; ");
    case "risk":
      if (row.issues?.length) return row.issues.map((item) => item.label).join("; ");
      return buildRiskIndicators(row, exceptions).map((item) => item.label).join("; ");
    case "nextAction":
      return `${nextAction.label} | ${nextAction.reason}`;
    case "tripNumber":
      return row.trip?.tripNumber ?? "";
    case "updatedAt":
      return formatDateTime(row.updatedAt);
    default:
      return "";
  }
}

function appointmentValue(row: DispatchGridRow, column: "pickupAppt" | "deliveryAppt") {
  return column === "pickupAppt" ? row.nextStop?.appointmentStart ?? null : row.nextStop?.appointmentEnd ?? null;
}

function appointmentDateKey(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function columnLabel(columnKey: DispatchGridColumnKey) {
  return DISPATCH_GRID_COLUMNS.find((column) => column.key === columnKey)?.label ?? columnKey;
}

function humanizeEnum(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeUniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const next = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(next));
}

function normalizeIncludeExcludeFilter<T extends string = string>(value: unknown): IncludeExcludeFilterState<T> {
  if (!value || typeof value !== "object") return { includeValues: [], excludeValues: [] };
  const asRecord = value as Record<string, unknown>;
  return {
    includeValues: normalizeUniqueStrings(asRecord.includeValues) as T[],
    excludeValues: normalizeUniqueStrings(asRecord.excludeValues) as T[],
  };
}

function normalizeTextFilter(value: unknown): TextFilterState {
  if (!value || typeof value !== "object") return emptyTextFilter();
  const asRecord = value as Record<string, unknown>;
  const legacySelected = normalizeUniqueStrings(asRecord.selectedValues);
  const next = normalizeIncludeExcludeFilter(asRecord);
  return {
    search: typeof asRecord.search === "string" ? asRecord.search : "",
    includeValues: next.includeValues.length ? next.includeValues : legacySelected,
    excludeValues: next.excludeValues,
  };
}

function normalizeStatusFilter(value: unknown): StatusFilterState {
  if (!value || typeof value !== "object") return emptyStatusFilter();
  const asRecord = value as Record<string, unknown>;
  if (Array.isArray(asRecord.values)) {
    const values = normalizeUniqueStrings(asRecord.values);
    const mode = asRecord.mode === "exclude" ? "exclude" : "include";
    return mode === "exclude"
      ? { includeValues: [], excludeValues: values }
      : { includeValues: values, excludeValues: [] };
  }
  return normalizeIncludeExcludeFilter(asRecord);
}

function normalizeAppointmentUrgency(value: unknown): AppointmentUrgencyOption[] {
  const allowed = new Set<AppointmentUrgencyOption>(["atRisk", "overdue", "today", "tomorrow", "missing"]);
  return normalizeUniqueStrings(value).filter((item): item is AppointmentUrgencyOption => allowed.has(item as AppointmentUrgencyOption));
}

function normalizeAppointmentFilter(value: unknown): AppointmentFilterState {
  if (!value || typeof value !== "object") return emptyAppointmentFilter();
  const asRecord = value as Record<string, unknown>;
  return {
    search: typeof asRecord.search === "string" ? asRecord.search : "",
    includeCities: normalizeUniqueStrings(asRecord.includeCities),
    excludeCities: normalizeUniqueStrings(asRecord.excludeCities),
    urgency: normalizeAppointmentUrgency(asRecord.urgency),
    fromDate: typeof asRecord.fromDate === "string" ? asRecord.fromDate : "",
    toDate: typeof asRecord.toDate === "string" ? asRecord.toDate : "",
  };
}

function normalizeAssignmentFilter(value: unknown): AssignmentFilterState {
  if (!value || typeof value !== "object") return emptyAssignmentFilter();
  const asRecord = value as Record<string, unknown>;
  const legacyState = asRecord.state === "assigned" ? "fullyAssigned" : asRecord.state === "unassigned" ? "unassigned" : asRecord.state;
  const nextState = legacyState === "fullyAssigned" || legacyState === "partiallyAssigned" || legacyState === "unassigned" ? legacyState : "all";
  return {
    state: nextState,
    driverSearch: typeof asRecord.driverSearch === "string" ? asRecord.driverSearch : "",
    missingDriver: Boolean(asRecord.missingDriver),
    missingTruck: Boolean(asRecord.missingTruck),
    missingTrailer: Boolean(asRecord.missingTrailer),
  };
}

function normalizeColumnFilters(value: DispatchGridFilterState | undefined): ColumnFilterState {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    loadNumber: raw.loadNumber ? normalizeTextFilter(raw.loadNumber) : undefined,
    customer: raw.customer ? normalizeTextFilter(raw.customer) : undefined,
    status: raw.status ? normalizeStatusFilter(raw.status) : undefined,
    pickupAppt: raw.pickupAppt ? normalizeAppointmentFilter(raw.pickupAppt) : undefined,
    deliveryAppt: raw.deliveryAppt ? normalizeAppointmentFilter(raw.deliveryAppt) : undefined,
    assignment: raw.assignment ? normalizeAssignmentFilter(raw.assignment) : undefined,
    docs: raw.docs ? (normalizeIncludeExcludeFilter<DocsFilterOption>(raw.docs) as DocsFilterState) : undefined,
    risk: raw.risk ? (normalizeIncludeExcludeFilter<RiskFilterOption>(raw.risk) as RiskFilterState) : undefined,
    issueTypes: raw.issueTypes ? normalizeIncludeExcludeFilter(raw.issueTypes) : undefined,
    firefightingMode: Boolean(raw.firefightingMode),
  };
}

function isIncludeExcludeActive(filter?: IncludeExcludeFilterState | null) {
  return Boolean(filter && (filter.includeValues.length || filter.excludeValues.length));
}

function includeExcludeChipLabel(prefix: string, filter: IncludeExcludeFilterState, formatter?: (value: string) => string) {
  const include = filter.includeValues.map((value) => (formatter ? formatter(value) : value)).join(", ");
  const exclude = filter.excludeValues.map((value) => (formatter ? formatter(value) : value)).join(", ");
  if (include && exclude) return `${prefix}: ${include}; NOT ${exclude}`;
  if (include) return `${prefix}: ${include}`;
  if (exclude) return `${prefix}: NOT ${exclude}`;
  return `${prefix}: all`;
}

function statusFilterChipLabel(statusFilter: StatusFilterState) {
  return includeExcludeChipLabel("Status", statusFilter, humanizeEnum);
}

function matchesIncludeExclude(value: string, filter: IncludeExcludeFilterState) {
  if (filter.includeValues.length && !filter.includeValues.includes(value)) return false;
  if (filter.excludeValues.length && filter.excludeValues.includes(value)) return false;
  return true;
}

function appointmentMatchesUrgency(flag: AppointmentUrgencyOption, value: string | null) {
  const dateKey = appointmentDateKey(value);
  const parsed = value ? new Date(value) : null;
  const now = new Date();
  const todayKey = appointmentDateKey(now.toISOString());
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = appointmentDateKey(tomorrow.toISOString());
  switch (flag) {
    case "missing":
      return !dateKey;
    case "today":
      return Boolean(dateKey) && dateKey === todayKey;
    case "tomorrow":
      return Boolean(dateKey) && dateKey === tomorrowKey;
    case "overdue":
      if (!parsed) return false;
      return parsed.getTime() < now.getTime();
    case "atRisk":
      if (!parsed) return false;
      {
        const diffMinutes = (parsed.getTime() - now.getTime()) / 60000;
        return diffMinutes >= 0 && diffMinutes <= APPOINTMENT_AT_RISK_MINUTES;
      }
    default:
      return false;
  }
}

function hasAnyRisk(row: DispatchGridRow) {
  if ((row.issuesTop?.length ?? 0) > 0) return true;
  if ((row.issues?.length ?? 0) > 0) return true;
  const hasOpenException = (row.exceptions ?? []).some((item) => item.status !== "RESOLVED");
  return Boolean(
    hasOpenException ||
      row.riskFlags?.needsAssignment ||
      row.riskFlags?.overdueStopWindow ||
      row.riskFlags?.trackingOffInTransit ||
      (!row.docs?.hasPod || !row.docs?.hasBol)
  );
}

type SortDirection = "asc" | "desc";
type SortRule = { column: DispatchGridColumnKey; direction: SortDirection };
export type DispatchGridSortRule = SortRule;
type DispatchWorkflowMacro = { id: string; label: string };

type ExportScope = "filtered" | "selected" | "all";
type ExportColumnMode = "visible" | "choose";

function sortDirectionLabel(direction: SortDirection) {
  return direction === "asc" ? "ascending" : "descending";
}

function sortNumericNullable(left?: number | null, right?: number | null) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

function sortDateNullable(left?: string | null, right?: string | null) {
  const leftTs = left ? new Date(left).getTime() : Number.NaN;
  const rightTs = right ? new Date(right).getTime() : Number.NaN;
  const leftValid = Number.isFinite(leftTs);
  const rightValid = Number.isFinite(rightTs);
  if (!leftValid && !rightValid) return 0;
  if (!leftValid) return 1;
  if (!rightValid) return -1;
  return leftTs - rightTs;
}

function compareRowsForSort(left: DispatchGridRow, right: DispatchGridRow, column: DispatchGridColumnKey) {
  switch (column) {
    case "loadNumber":
      return left.loadNumber.localeCompare(right.loadNumber);
    case "status":
      return STATUS_OPTIONS.indexOf(left.status as DispatchStatus) - STATUS_OPTIONS.indexOf(right.status as DispatchStatus);
    case "customer":
      return (left.customerName ?? "").localeCompare(right.customerName ?? "");
    case "pickupAppt":
      return sortDateNullable(left.nextStop?.appointmentStart, right.nextStop?.appointmentStart);
    case "deliveryAppt":
      return sortDateNullable(left.nextStop?.appointmentEnd, right.nextStop?.appointmentEnd);
    case "assignment": {
      const leftKey = `${left.assignment?.driver?.name ?? ""}|${left.assignment?.truck?.unit ?? ""}|${left.assignment?.trailer?.unit ?? ""}`;
      const rightKey = `${right.assignment?.driver?.name ?? ""}|${right.assignment?.truck?.unit ?? ""}|${right.assignment?.trailer?.unit ?? ""}`;
      return leftKey.localeCompare(rightKey);
    }
    case "miles":
      return sortNumericNullable(left.miles ?? null, right.miles ?? null);
    case "paidMiles":
      return sortNumericNullable(left.paidMiles ?? null, right.paidMiles ?? null);
    case "rate":
      return sortNumericNullable(
        left.rate === null || left.rate === undefined || left.rate === "" || !Number.isFinite(Number(left.rate))
          ? null
          : Number(left.rate),
        right.rate === null || right.rate === undefined || right.rate === "" || !Number.isFinite(Number(right.rate))
          ? null
          : Number(right.rate)
      );
    case "notes":
      return noteIndicatorRank(left) - noteIndicatorRank(right);
    case "docs": {
      const leftMissing = Number(!left.docs?.hasPod) + Number(!left.docs?.hasBol);
      const rightMissing = Number(!right.docs?.hasPod) + Number(!right.docs?.hasBol);
      return leftMissing - rightMissing;
    }
    case "exceptions": {
      const leftCount = (left.exceptions ?? []).filter((item) => item.status !== "RESOLVED").length;
      const rightCount = (right.exceptions ?? []).filter((item) => item.status !== "RESOLVED").length;
      return leftCount - rightCount;
    }
    case "risk": {
      const leftRisk = Number(Boolean(left.riskFlags?.overdueStopWindow)) + Number(Boolean(left.riskFlags?.needsAssignment));
      const rightRisk = Number(Boolean(right.riskFlags?.overdueStopWindow)) + Number(Boolean(right.riskFlags?.needsAssignment));
      return leftRisk - rightRisk;
    }
    case "nextAction":
      return buildNextBestAction(left).label.localeCompare(buildNextBestAction(right).label);
    case "tripNumber":
      return (left.trip?.tripNumber ?? "").localeCompare(right.trip?.tripNumber ?? "");
    case "updatedAt":
      return sortDateNullable(left.updatedAt ?? null, right.updatedAt ?? null);
    default:
      return 0;
  }
}

function applySortRules(sourceRows: DispatchGridRow[], rules: SortRule[]) {
  if (!rules.length) return sourceRows;
  const withIndex = sourceRows.map((row, index) => ({ row, index }));
  withIndex.sort((left, right) => {
    for (const rule of rules) {
      const compared = compareRowsForSort(left.row, right.row, rule.column);
      if (compared !== 0) return rule.direction === "asc" ? compared : -compared;
    }
    return left.index - right.index;
  });
  return withIndex.map((item) => item.row);
}

function csvEscape(value: string) {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function SortChevron({ direction }: { direction: SortDirection }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      {direction === "asc" ? (
        <path d="M4.5 9.5 8 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M4.5 6.5 8 10l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function RiskLateIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.9v3.4l2.3 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RiskDocIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M5 2.8h4.5L12 5.3v7.9H5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9.4 2.8v2.6H12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.4 9.2h4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function RiskAssignIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <circle cx="5.6" cy="5.4" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.8 11.8c.5-1.9 1.6-2.8 2.8-2.8s2.3.9 2.8 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="m10 6.7 3.2 3.2M13.2 6.7 10 9.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function RiskExceptionIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M8 2.7 13.2 12H2.8L8 2.7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 6.4v2.8M8 11.1h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function QuickAssignIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <circle cx="6.2" cy="5.6" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.2 11.7c.5-1.9 1.7-2.8 3-2.8s2.4.9 2.9 2.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10.8 6.2h2.8M12.2 4.8v2.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function QuickStatusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M3.5 4.2h9M3.5 8h9M3.5 11.8h6.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function QuickPodIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M5 2.8h4.5L12 5.3v7.9H5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.4 2.8v2.6H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.4 9.2h3.2M6.4 11h3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function QuickInspectorIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M2.8 3.4h10.4v9.2H2.8z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.1 6.2h5.8M5.1 8.2h5.8M5.1 10.2h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function FilterFunnelIcon({ active = false }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5", active ? "text-[color:var(--color-accent)]" : "text-current")} fill="none" aria-hidden>
      <path d="M2.5 3.5h11L9.6 8v4.2l-3.2-1.7V8L2.5 3.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function DispatchSpreadsheetGrid({
  rows,
  filters,
  sortRules,
  selectedLoadId,
  selectedRowIds,
  columnVisibility,
  density,
  loadingCellKey,
  readOnly,
  onSelectLoad,
  onToggleRowSelection,
  onToggleAllRows,
  onFiltersChange,
  onSortRulesChange,
  onInlineEdit,
  onRowDragStart,
  onQuickUploadPod,
  onQuickAssign,
  onQuickOpenInspector,
  workflowMacros,
  onApplyWorkflowMacro,
}: {
  rows: DispatchGridRow[];
  filters: DispatchGridFilterState;
  sortRules: DispatchGridSortRule[];
  selectedLoadId: string | null;
  selectedRowIds: Set<string>;
  columnVisibility: Partial<Record<DispatchGridColumnKey, boolean>>;
  density: DispatchGridDensity;
  loadingCellKey?: string | null;
  readOnly?: boolean;
  onSelectLoad: (loadId: string) => void;
  onToggleRowSelection: (loadId: string, selected: boolean) => void;
  onToggleAllRows: (selected: boolean, rowIds: string[]) => void;
  onFiltersChange: (next: DispatchGridFilterState) => void;
  onSortRulesChange: (next: DispatchGridSortRule[]) => void;
  onInlineEdit: (params: { loadId: string; field: InlineEditField; value: string | number }) => Promise<void>;
  onRowDragStart?: (loadId: string) => void;
  onQuickUploadPod?: (loadId: string) => void;
  onQuickAssign?: (loadId: string) => void;
  onQuickOpenInspector?: (loadId: string, focusSection?: DispatchInspectorFocusSection) => void;
  workflowMacros?: DispatchWorkflowMacro[];
  onApplyWorkflowMacro?: (macroId: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(540);
  const [scrollTop, setScrollTop] = useState(0);
  const [editingCell, setEditingCell] = useState<{ rowId: string; column: DispatchGridColumnKey } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineNote, setInlineNote] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState(INITIAL_FOCUS);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [openFilterColumn, setOpenFilterColumn] = useState<DispatchGridColumnKey | null>(null);
  const [statusEditMode, setStatusEditMode] = useState<"include" | "exclude">("include");
  const [textFilterMode, setTextFilterMode] = useState<Record<"loadNumber" | "customer", "include" | "exclude">>({
    loadNumber: "include",
    customer: "include",
  });
  const [appointmentFilterMode, setAppointmentFilterMode] = useState<Record<"pickupAppt" | "deliveryAppt", "include" | "exclude">>({
    pickupAppt: "include",
    deliveryAppt: "include",
  });
  const [docsFilterMode, setDocsFilterMode] = useState<"include" | "exclude">("include");
  const [riskFilterMode, setRiskFilterMode] = useState<"include" | "exclude">("include");
  const [genericContextMenu, setGenericContextMenu] = useState<{
    rowId: string;
    column: "loadNumber" | "status" | "customer" | "pickupAppt" | "deliveryAppt" | "assignment";
    value: string;
    displayValue: string;
    x: number;
    y: number;
  } | null>(null);
  const [highlightedRowIds, setHighlightedRowIds] = useState<Set<string>>(new Set());
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const [clearoutMenuOpen, setClearoutMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>("filtered");
  const [exportColumnMode, setExportColumnMode] = useState<ExportColumnMode>("visible");
  const [exportColumns, setExportColumns] = useState<DispatchGridColumnKey[]>([]);
  const [includeRowHighlights, setIncludeRowHighlights] = useState(true);
  const [exportPreparing, setExportPreparing] = useState(false);
  const [copyPreparing, setCopyPreparing] = useState(false);

  const columnFilters = useMemo(() => normalizeColumnFilters(filters), [filters]);

  const setColumnFilters = useCallback(
    (updater: ColumnFilterState | ((prev: ColumnFilterState) => ColumnFilterState)) => {
      const next = typeof updater === "function" ? (updater as (prev: ColumnFilterState) => ColumnFilterState)(columnFilters) : updater;
      onFiltersChange(next);
    },
    [columnFilters, onFiltersChange]
  );

  const setSortRules = useCallback(
    (updater: SortRule[] | ((prev: SortRule[]) => SortRule[])) => {
      const current = sortRules;
      const next = typeof updater === "function" ? (updater as (prev: SortRule[]) => SortRule[])(current) : updater;
      onSortRulesChange(next);
    },
    [onSortRulesChange, sortRules]
  );

  const rowHeight = density === "compact" ? 72 : 84;

  const visibleColumns = useMemo(() => {
    return DISPATCH_GRID_COLUMNS.filter((column) => {
      if (column.required) return true;
      return columnVisibility[column.key] !== false;
    });
  }, [columnVisibility]);

  const filterValueOptions = useMemo(() => {
    const optionsFor = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)).slice(0, 60);
    return {
      loadNumber: optionsFor(rows.map((row) => row.loadNumber ?? "")),
      customer: optionsFor(rows.map((row) => row.customerName ?? "")),
      pickupCity: optionsFor(rows.map((row) => routeLabel(row.route?.shipperCity, row.route?.shipperState))),
      deliveryCity: optionsFor(rows.map((row) => routeLabel(row.route?.consigneeCity, row.route?.consigneeState))),
      drivers: optionsFor(rows.map((row) => row.assignment?.driver?.name ?? "")),
    };
  }, [rows]);

  const columnFilterActive = useCallback(
    (key: DispatchGridColumnKey) => {
      if (key === "loadNumber" || key === "customer") {
        const value = columnFilters[key];
        return Boolean(value && (value.search.trim() || isIncludeExcludeActive(value)));
      }
      if (key === "status") {
        return isIncludeExcludeActive(columnFilters.status);
      }
      if (key === "pickupAppt" || key === "deliveryAppt") {
        const value = columnFilters[key];
        return Boolean(
          value &&
            (value.search.trim() ||
              value.includeCities.length ||
              value.excludeCities.length ||
              value.urgency.length ||
              value.fromDate ||
              value.toDate)
        );
      }
      if (key === "assignment") {
        const value = columnFilters.assignment;
        return Boolean(
          value &&
            (value.state !== "all" ||
              value.driverSearch.trim() ||
              value.missingDriver ||
              value.missingTruck ||
              value.missingTrailer)
        );
      }
      if (key === "docs") return isIncludeExcludeActive(columnFilters.docs);
      if (key === "risk") {
        return (
          isIncludeExcludeActive(columnFilters.risk) ||
          isIncludeExcludeActive(columnFilters.issueTypes) ||
          Boolean(columnFilters.firefightingMode)
        );
      }
      return false;
    },
    [columnFilters]
  );

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ id: string; column: DispatchGridColumnKey | "mode" | "issues"; label: string }> = [];
    const loadNumberFilter = columnFilters.loadNumber;
    if (loadNumberFilter && (loadNumberFilter.search.trim() || isIncludeExcludeActive(loadNumberFilter))) {
      chips.push({
        id: "loadNumber",
        column: "loadNumber",
        label: [
          loadNumberFilter.search.trim() ? `Load # contains "${loadNumberFilter.search.trim()}"` : null,
          isIncludeExcludeActive(loadNumberFilter) ? includeExcludeChipLabel("Load #", loadNumberFilter) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
    const customerFilter = columnFilters.customer;
    if (customerFilter && (customerFilter.search.trim() || isIncludeExcludeActive(customerFilter))) {
      chips.push({
        id: "customer",
        column: "customer",
        label: [
          customerFilter.search.trim() ? `Customer contains "${customerFilter.search.trim()}"` : null,
          isIncludeExcludeActive(customerFilter) ? includeExcludeChipLabel("Customer", customerFilter) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
    if (columnFilters.status && isIncludeExcludeActive(columnFilters.status)) {
      chips.push({ id: "status", column: "status", label: statusFilterChipLabel(columnFilters.status) });
    }
    const pickupFilter = columnFilters.pickupAppt;
    if (
      pickupFilter &&
      (pickupFilter.search.trim() ||
        pickupFilter.includeCities.length ||
        pickupFilter.excludeCities.length ||
        pickupFilter.urgency.length ||
        pickupFilter.fromDate ||
        pickupFilter.toDate)
    ) {
      chips.push({
        id: "pickupAppt",
        column: "pickupAppt",
        label: `Pickup: ${[
          pickupFilter.search ? `contains "${pickupFilter.search}"` : null,
          pickupFilter.includeCities.length ? `cities ${pickupFilter.includeCities.join(", ")}` : null,
          pickupFilter.excludeCities.length ? `NOT ${pickupFilter.excludeCities.join(", ")}` : null,
          pickupFilter.urgency.length ? pickupFilter.urgency.map(humanizeEnum).join(", ") : null,
          pickupFilter.fromDate ? `from ${pickupFilter.fromDate}` : null,
          pickupFilter.toDate ? `to ${pickupFilter.toDate}` : null,
        ]
          .filter(Boolean)
          .join(", ")}`,
      });
    }
    const deliveryFilter = columnFilters.deliveryAppt;
    if (
      deliveryFilter &&
      (deliveryFilter.search.trim() ||
        deliveryFilter.includeCities.length ||
        deliveryFilter.excludeCities.length ||
        deliveryFilter.urgency.length ||
        deliveryFilter.fromDate ||
        deliveryFilter.toDate)
    ) {
      chips.push({
        id: "deliveryAppt",
        column: "deliveryAppt",
        label: `Delivery: ${[
          deliveryFilter.search ? `contains "${deliveryFilter.search}"` : null,
          deliveryFilter.includeCities.length ? `cities ${deliveryFilter.includeCities.join(", ")}` : null,
          deliveryFilter.excludeCities.length ? `NOT ${deliveryFilter.excludeCities.join(", ")}` : null,
          deliveryFilter.urgency.length ? deliveryFilter.urgency.map(humanizeEnum).join(", ") : null,
          deliveryFilter.fromDate ? `from ${deliveryFilter.fromDate}` : null,
          deliveryFilter.toDate ? `to ${deliveryFilter.toDate}` : null,
        ]
          .filter(Boolean)
          .join(", ")}`,
      });
    }
    const assignmentFilter = columnFilters.assignment;
    if (
      assignmentFilter &&
      (assignmentFilter.state !== "all" ||
        assignmentFilter.driverSearch.trim() ||
        assignmentFilter.missingDriver ||
        assignmentFilter.missingTruck ||
        assignmentFilter.missingTrailer)
    ) {
      chips.push({
        id: "assignment",
        column: "assignment",
        label: `Assignment: ${[
          assignmentFilter.state !== "all" ? humanizeEnum(assignmentFilter.state) : null,
          assignmentFilter.driverSearch ? `driver "${assignmentFilter.driverSearch}"` : null,
          assignmentFilter.missingDriver ? "missing driver" : null,
          assignmentFilter.missingTruck ? "missing truck" : null,
          assignmentFilter.missingTrailer ? "missing trailer" : null,
        ]
          .filter(Boolean)
          .join(", ")}`,
      });
    }
    if (columnFilters.docs && isIncludeExcludeActive(columnFilters.docs)) {
      chips.push({
        id: "docs",
        column: "docs",
        label: includeExcludeChipLabel("Docs", columnFilters.docs, humanizeEnum),
      });
    }
    if (columnFilters.risk && isIncludeExcludeActive(columnFilters.risk)) {
      chips.push({
        id: "risk",
        column: "risk",
        label: includeExcludeChipLabel("Risk", columnFilters.risk, humanizeEnum),
      });
    }
    if (columnFilters.issueTypes && isIncludeExcludeActive(columnFilters.issueTypes)) {
      chips.push({
        id: "issueTypes",
        column: "issues",
        label: includeExcludeChipLabel("Issues", columnFilters.issueTypes, humanizeEnum),
      });
    }
    if (columnFilters.firefightingMode) {
      chips.push({
        id: "firefightingMode",
        column: "mode",
        label: "Mode: Firefighting",
      });
    }
    return chips;
  }, [columnFilters]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const loadFilter = columnFilters.loadNumber;
      if (loadFilter) {
        const value = row.loadNumber ?? "";
        if (loadFilter.search.trim() && !value.toLowerCase().includes(loadFilter.search.trim().toLowerCase())) return false;
        if (!matchesIncludeExclude(value, loadFilter)) return false;
      }

      const customerFilter = columnFilters.customer;
      if (customerFilter) {
        const value = (row.customerName ?? "").trim();
        if (customerFilter.search.trim() && !value.toLowerCase().includes(customerFilter.search.trim().toLowerCase())) return false;
        if (!matchesIncludeExclude(value, customerFilter)) return false;
      }

      const statusFilter = columnFilters.status;
      if (statusFilter && !matchesIncludeExclude(row.status, statusFilter)) {
        return false;
      }

      const pickupFilter = columnFilters.pickupAppt;
      if (pickupFilter) {
        const pickupCity = routeLabel(row.route?.shipperCity, row.route?.shipperState);
        const appt = appointmentValue(row, "pickupAppt");
        const dateKey = appointmentDateKey(appt);
        if (pickupFilter.search.trim() && !pickupCity.toLowerCase().includes(pickupFilter.search.trim().toLowerCase())) return false;
        if (pickupFilter.includeCities.length && !pickupFilter.includeCities.includes(pickupCity)) return false;
        if (pickupFilter.excludeCities.length && pickupFilter.excludeCities.includes(pickupCity)) return false;
        if (pickupFilter.urgency.length && !pickupFilter.urgency.some((flag) => appointmentMatchesUrgency(flag, appt))) return false;
        if (pickupFilter.fromDate && (!dateKey || dateKey < pickupFilter.fromDate)) return false;
        if (pickupFilter.toDate && (!dateKey || dateKey > pickupFilter.toDate)) return false;
      }

      const deliveryFilter = columnFilters.deliveryAppt;
      if (deliveryFilter) {
        const deliveryCity = routeLabel(row.route?.consigneeCity, row.route?.consigneeState);
        const appt = appointmentValue(row, "deliveryAppt");
        const dateKey = appointmentDateKey(appt);
        if (deliveryFilter.search.trim() && !deliveryCity.toLowerCase().includes(deliveryFilter.search.trim().toLowerCase())) return false;
        if (deliveryFilter.includeCities.length && !deliveryFilter.includeCities.includes(deliveryCity)) return false;
        if (deliveryFilter.excludeCities.length && deliveryFilter.excludeCities.includes(deliveryCity)) return false;
        if (deliveryFilter.urgency.length && !deliveryFilter.urgency.some((flag) => appointmentMatchesUrgency(flag, appt))) return false;
        if (deliveryFilter.fromDate && (!dateKey || dateKey < deliveryFilter.fromDate)) return false;
        if (deliveryFilter.toDate && (!dateKey || dateKey > deliveryFilter.toDate)) return false;
      }

      const assignmentFilter = columnFilters.assignment;
      if (assignmentFilter) {
        const hasDriver = Boolean(row.assignment?.driver?.id);
        const hasTruck = Boolean(row.assignment?.truck?.id);
        const hasTrailer = Boolean(row.assignment?.trailer?.id);
        const assignedCount = Number(hasDriver) + Number(hasTruck) + Number(hasTrailer);
        if (assignmentFilter.state === "fullyAssigned" && assignedCount !== 3) return false;
        if (assignmentFilter.state === "partiallyAssigned" && (assignedCount === 0 || assignedCount === 3)) return false;
        if (assignmentFilter.state === "unassigned" && assignedCount !== 0) return false;
        if (
          assignmentFilter.driverSearch.trim() &&
          !(row.assignment?.driver?.name ?? "").toLowerCase().includes(assignmentFilter.driverSearch.trim().toLowerCase())
        ) {
          return false;
        }
        if (assignmentFilter.missingDriver && hasDriver) return false;
        if (assignmentFilter.missingTruck && hasTruck) return false;
        if (assignmentFilter.missingTrailer && hasTrailer) return false;
      }

      const docsFilter = columnFilters.docs;
      if (docsFilter && isIncludeExcludeActive(docsFilter)) {
        const missingPod = !row.docs?.hasPod;
        const missingBol = !row.docs?.hasBol;
        const docStates: DocsFilterOption[] = [];
        if (missingPod) docStates.push("missingPod");
        if (missingBol) docStates.push("missingBol");
        if (missingPod || missingBol) docStates.push("missingAnyRequired");
        if (!missingPod && !missingBol) docStates.push("docsComplete");
        if (docsFilter.includeValues.length && !docsFilter.includeValues.some((value) => docStates.includes(value))) return false;
        if (docsFilter.excludeValues.length && docsFilter.excludeValues.some((value) => docStates.includes(value))) return false;
      }

      const hasOpenException = (row.exceptions ?? []).some((item) => item.status !== "RESOLVED");
      const riskFilter = columnFilters.risk;
      if (riskFilter && isIncludeExcludeActive(riskFilter)) {
        const riskStates: RiskFilterOption[] = [];
        if (hasAnyRisk(row)) riskStates.push("hasRisk");
        if (hasOpenException) riskStates.push("hasOpenException");
        if (!hasAnyRisk(row)) riskStates.push("noIssues");
        if (riskFilter.includeValues.length && !riskFilter.includeValues.some((value) => riskStates.includes(value))) return false;
        if (riskFilter.excludeValues.length && riskFilter.excludeValues.some((value) => riskStates.includes(value))) return false;
      }
      const issueTypesFilter = columnFilters.issueTypes;
      if (issueTypesFilter && isIncludeExcludeActive(issueTypesFilter)) {
        const rowIssueTypes = Array.from(
          new Set(
            ((row.issues ?? row.issuesTop ?? []).map((issue) => issue?.type).filter(Boolean) as string[]) ?? []
          )
        );
        if (
          issueTypesFilter.includeValues.length &&
          !issueTypesFilter.includeValues.some((value) => rowIssueTypes.includes(value))
        ) {
          return false;
        }
        if (
          issueTypesFilter.excludeValues.length &&
          issueTypesFilter.excludeValues.some((value) => rowIssueTypes.includes(value))
        ) {
          return false;
        }
      }

      if (columnFilters.firefightingMode) {
        const missingPod = !row.docs?.hasPod;
        const missingBol = !row.docs?.hasBol;
        const hasDriver = Boolean(row.assignment?.driver?.id);
        const hasTruck = Boolean(row.assignment?.truck?.id);
        const hasTrailer = Boolean(row.assignment?.trailer?.id);
        const assignmentIncomplete = Number(hasDriver) + Number(hasTruck) + Number(hasTrailer) < 3;
        const urgentAppt =
          appointmentMatchesUrgency("overdue", row.nextStop?.appointmentStart ?? null) ||
          appointmentMatchesUrgency("overdue", row.nextStop?.appointmentEnd ?? null) ||
          appointmentMatchesUrgency("atRisk", row.nextStop?.appointmentStart ?? null) ||
          appointmentMatchesUrgency("atRisk", row.nextStop?.appointmentEnd ?? null);
        if (!(urgentAppt || missingPod || missingBol || assignmentIncomplete || hasOpenException)) return false;
      }
      return true;
    });
  }, [columnFilters, rows]);

  const sortedRows = useMemo(() => {
    return applySortRules(filteredRows, sortRules);
  }, [filteredRows, sortRules]);

  const sortedAllRows = useMemo(() => applySortRules(rows, sortRules), [rows, sortRules]);

  const visibleTripCount = useMemo(() => {
    const ids = new Set<string>();
    for (const row of sortedRows) {
      const key = row.trip?.id ?? row.trip?.tripNumber ?? null;
      if (key) ids.add(key);
    }
    return ids.size;
  }, [sortedRows]);

  const gridTemplateColumns = useMemo(
    () => visibleColumns.map((column) => `${column.width}px`).join(" "),
    [visibleColumns]
  );

  const totalWidth = useMemo(
    () => visibleColumns.reduce((sum, column) => sum + column.width, 0),
    [visibleColumns]
  );

  const stickyOffsets = useMemo(() => {
    const offsets = new Map<DispatchGridColumnKey, number>();
    let running = 0;
    for (const column of visibleColumns) {
      if (!column.frozen) continue;
      offsets.set(column.key, running);
      running += column.width;
    }
    return offsets;
  }, [visibleColumns]);
  const lastFrozenColumnKey = useMemo(() => {
    const frozen = visibleColumns.filter((column) => column.frozen);
    return frozen.length ? frozen[frozen.length - 1].key : null;
  }, [visibleColumns]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const updateHeight = () => setViewportHeight(node.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!openFilterColumn) return;
      const target = event.target as HTMLElement;
      const button = target.closest(`[data-filter-column="${openFilterColumn}"]`);
      if (button) return;
      if (filterPopoverRef.current?.contains(target)) return;
      setOpenFilterColumn(null);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [openFilterColumn]);

  useEffect(() => {
    if (!genericContextMenu && !clearoutMenuOpen && !workflowMenuOpen) return;
    const dismiss = () => {
      setGenericContextMenu(null);
      setClearoutMenuOpen(false);
      setWorkflowMenuOpen(false);
    };
    // Use click so menu-item onClick handlers run before global dismiss.
    document.addEventListener("click", dismiss);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, [clearoutMenuOpen, genericContextMenu, workflowMenuOpen]);

  useEffect(() => {
    if (focusedCell.rowIndex < sortedRows.length) return;
    setFocusedCell({
      rowIndex: Math.max(0, sortedRows.length - 1),
      columnIndex: Math.min(focusedCell.columnIndex, Math.max(0, visibleColumns.length - 1)),
    });
  }, [sortedRows.length, focusedCell.columnIndex, focusedCell.rowIndex, visibleColumns.length]);

  const overscan = 8;
  const totalHeight = sortedRows.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(sortedRows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
  const visibleRows = sortedRows.slice(startIndex, endIndex);

  const scrollToRow = useCallback(
    (rowIndex: number) => {
      const node = viewportRef.current;
      if (!node) return;
      const rowTop = rowIndex * rowHeight;
      const rowBottom = rowTop + rowHeight;
      const viewportTop = node.scrollTop;
      const viewportBottom = viewportTop + node.clientHeight;
      if (rowTop < viewportTop) {
        node.scrollTop = rowTop;
      } else if (rowBottom > viewportBottom) {
        node.scrollTop = rowBottom - node.clientHeight;
      }
    },
    [rowHeight]
  );

  const beginEdit = useCallback(
    (rowId: string, column: DispatchGridColumnKey) => {
      if (readOnly) return;
      const field = toEditableField(column);
      if (!field) return;
      const row = sortedRows.find((item) => item.id === rowId);
      if (!row) return;
      setEditingCell({ rowId, column });
      setEditingValue(buildCellValue(row, column));
      setInlineError(null);
    },
    [readOnly, sortedRows]
  );

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditingValue("");
    setInlineError(null);
  }, []);

  const commitEdit = useCallback(async () => {
    if (!editingCell) return;
    const field = toEditableField(editingCell.column);
    if (!field) {
      cancelEdit();
      return;
    }
    const parsed = parseInlineValue(field, editingValue);
    if (!parsed.ok) {
      setInlineError(parsed.error);
      return;
    }
    try {
      await onInlineEdit({ loadId: editingCell.rowId, field, value: parsed.parsed });
      setInlineNote("Saved");
      window.setTimeout(() => setInlineNote(null), 1600);
      cancelEdit();
    } catch (error) {
      const message = (error as Error).message || "Failed to save";
      setInlineError(message);
      if (field === "status") {
        toast.error(message);
        cancelEdit();
      }
    }
  }, [cancelEdit, editingCell, editingValue, onInlineEdit]);

  const allVisibleSelected = sortedRows.length > 0 && sortedRows.every((row) => selectedRowIds.has(row.id));

  const handleGridKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (editingCell) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextRow = Math.min(sortedRows.length - 1, focusedCell.rowIndex + 1);
        setFocusedCell((prev) => ({ ...prev, rowIndex: nextRow }));
        scrollToRow(nextRow);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        const nextRow = Math.max(0, focusedCell.rowIndex - 1);
        setFocusedCell((prev) => ({ ...prev, rowIndex: nextRow }));
        scrollToRow(nextRow);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setFocusedCell((prev) => ({ ...prev, columnIndex: Math.min(visibleColumns.length - 1, prev.columnIndex + 1) }));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setFocusedCell((prev) => ({ ...prev, columnIndex: Math.max(0, prev.columnIndex - 1) }));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const row = sortedRows[focusedCell.rowIndex];
        const column = visibleColumns[focusedCell.columnIndex];
        if (!row || !column) return;
        beginEdit(row.id, column.key);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        const row = sortedRows[focusedCell.rowIndex];
        const column = visibleColumns[focusedCell.columnIndex];
        if (!row || !column) return;
        const value = buildCellValue(row, column.key);
        if (value && navigator.clipboard?.writeText) {
          event.preventDefault();
          await navigator.clipboard.writeText(value);
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
        const row = sortedRows[focusedCell.rowIndex];
        const column = visibleColumns[focusedCell.columnIndex];
        const field = column ? toEditableField(column.key) : null;
        if (!row || !column || !field || readOnly) return;
        event.preventDefault();
        try {
          const text = await navigator.clipboard.readText();
          const parsed = parseInlineValue(field, text.trim());
          if (!parsed.ok) {
            setInlineError(parsed.error);
            return;
          }
          await onInlineEdit({ loadId: row.id, field, value: parsed.parsed });
          setInlineError(null);
        } catch (error) {
          setInlineError((error as Error).message || "Unable to paste value");
        }
      }
    },
    [beginEdit, editingCell, focusedCell.columnIndex, focusedCell.rowIndex, onInlineEdit, readOnly, scrollToRow, sortedRows, visibleColumns]
  );

  const toggleSort = useCallback((column: DispatchGridColumnKey, append: boolean) => {
    setSortRules((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.column === column);
      const existing = existingIndex >= 0 ? prev[existingIndex] : null;
      if (!append) {
        if (!existing) return [{ column, direction: "asc" }];
        if (existing.direction === "asc") return [{ column, direction: "desc" }];
        return [];
      }
      if (!existing) return [...prev, { column, direction: "asc" }];
      if (existing.direction === "asc") {
        const next = [...prev];
        next[existingIndex] = { ...existing, direction: "desc" };
        return next;
      }
      return prev.filter((entry) => entry.column !== column);
    });
  }, []);

  const sortStateForColumn = useCallback(
    (column: DispatchGridColumnKey) => {
      const index = sortRules.findIndex((rule) => rule.column === column);
      if (index < 0) return null;
      return { direction: sortRules[index].direction, rank: index + 1 };
    },
    [sortRules]
  );

  const applyMorningDispatchSort = useCallback(() => {
    setSortRules([{ column: "pickupAppt", direction: "asc" }]);
  }, []);

  const exportableColumns = useMemo(
    () => DISPATCH_GRID_COLUMNS.filter((column) => column.key !== "select").map((column) => column.key),
    []
  );

  const selectedRowsForExport = useMemo(
    () => sortedAllRows.filter((row) => selectedRowIds.has(row.id)),
    [selectedRowIds, sortedAllRows]
  );

  const defaultVisibleExportColumns = useMemo(
    () => visibleColumns.filter((column) => column.key !== "select").map((column) => column.key),
    [visibleColumns]
  );

  const effectiveExportColumns = useMemo(() => {
    if (exportColumnMode === "visible") {
      return defaultVisibleExportColumns;
    }
    return exportColumns.length ? exportColumns : defaultVisibleExportColumns;
  }, [defaultVisibleExportColumns, exportColumnMode, exportColumns]);

  const exportColumnLabels = useMemo(
    () =>
      effectiveExportColumns.map((column) => ({
        key: column,
        label: columnLabel(column),
      })),
    [effectiveExportColumns]
  );

  const exportRows = useMemo(() => {
    if (exportScope === "selected") return selectedRowsForExport;
    if (exportScope === "all") return sortedAllRows;
    return sortedRows;
  }, [exportScope, selectedRowsForExport, sortedAllRows, sortedRows]);

  const exportPreviewRows = useMemo(() => exportRows.slice(0, 20), [exportRows]);

  const toggleRowHighlight = useCallback((rowId: string) => {
    setHighlightedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!exportOpen) return;
    if (exportColumnMode !== "choose") return;
    if (exportColumns.length) return;
    setExportColumns(defaultVisibleExportColumns);
  }, [defaultVisibleExportColumns, exportColumnMode, exportColumns.length, exportOpen]);

  const statusFilter = columnFilters.status ?? emptyStatusFilter();

  const setIncludeExclude = useCallback(
    <T extends string>(
      current: IncludeExcludeFilterState<T>,
      mode: "include" | "exclude",
      value: T,
      checked: boolean
    ): IncludeExcludeFilterState<T> => {
      const includeValues = new Set(current.includeValues);
      const excludeValues = new Set(current.excludeValues);
      const target = mode === "include" ? includeValues : excludeValues;
      if (checked) target.add(value);
      else target.delete(value);
      return {
        includeValues: Array.from(includeValues),
        excludeValues: Array.from(excludeValues),
      };
    },
    []
  );

  const applyStatusMacro = useCallback((mode: "include" | "exclude", values: string[]) => {
    const normalizedValues = Array.from(new Set(values));
    setColumnFilters((prev) => ({
      ...prev,
      status:
        mode === "include"
          ? { includeValues: normalizedValues, excludeValues: [] }
          : { includeValues: [], excludeValues: normalizedValues },
    }));
  }, [setColumnFilters]);

  const applyClearoutMacro = useCallback(
    (macro: "planningNoise" | "completed" | "inTransit" | "firefighting" | "reset") => {
      if (macro === "reset") {
        setColumnFilters({});
        return;
      }
      if (macro === "planningNoise") {
        applyStatusMacro("exclude", ["PLANNED", "ASSIGNED"]);
        return;
      }
      if (macro === "completed") {
        applyStatusMacro("exclude", ["DELIVERED", "CANCELLED"]);
        return;
      }
      if (macro === "inTransit") {
        applyStatusMacro("include", ["IN_TRANSIT"]);
        return;
      }
      if (macro === "firefighting") {
        setColumnFilters((prev) => ({ ...prev, firefightingMode: true }));
      }
    },
    [applyStatusMacro, setColumnFilters]
  );

  const applyContextIncludeFilter = useCallback(
    (column: "loadNumber" | "status" | "customer" | "pickupAppt" | "deliveryAppt" | "assignment", value: string, append: boolean) => {
      if (!value) return;
      setColumnFilters((prev) => {
        const next = { ...prev };
        if (column === "status") {
          const current = next.status ?? emptyStatusFilter();
          next.status = {
            includeValues: append
              ? Array.from(new Set([...current.includeValues, value]))
              : [value],
            excludeValues: current.excludeValues.filter((item) => item !== value),
          };
          return next;
        }
        if (column === "loadNumber" || column === "customer") {
          const current = (next[column] as TextFilterState | undefined) ?? emptyTextFilter();
          const includeValues = append ? Array.from(new Set([...current.includeValues, value])) : [value];
          next[column] = { ...current, includeValues, excludeValues: current.excludeValues.filter((item) => item !== value) };
          return next;
        }
        if (column === "pickupAppt" || column === "deliveryAppt") {
          const current = (next[column] as AppointmentFilterState | undefined) ?? emptyAppointmentFilter();
          const includeCities = append ? Array.from(new Set([...current.includeCities, value])) : [value];
          next[column] = { ...current, includeCities, excludeCities: current.excludeCities.filter((item) => item !== value) };
          return next;
        }
        const current = next.assignment ?? emptyAssignmentFilter();
        next.assignment = { ...current, driverSearch: value };
        return next;
      });
    },
    [setColumnFilters]
  );

  const applyContextExcludeFilter = useCallback(
    (column: "loadNumber" | "status" | "customer" | "pickupAppt" | "deliveryAppt" | "assignment", value: string) => {
      if (!value) return;
      setColumnFilters((prev) => {
        const next = { ...prev };
        if (column === "status") {
          const current = next.status ?? emptyStatusFilter();
          next.status = {
            includeValues: current.includeValues.filter((item) => item !== value),
            excludeValues: Array.from(new Set([...current.excludeValues, value])),
          };
          return next;
        }
        if (column === "loadNumber" || column === "customer") {
          const current = (next[column] as TextFilterState | undefined) ?? emptyTextFilter();
          next[column] = {
            ...current,
            includeValues: current.includeValues.filter((item) => item !== value),
            excludeValues: Array.from(new Set([...current.excludeValues, value])),
          };
          return next;
        }
        if (column === "pickupAppt" || column === "deliveryAppt") {
          const current = (next[column] as AppointmentFilterState | undefined) ?? emptyAppointmentFilter();
          next[column] = {
            ...current,
            includeCities: current.includeCities.filter((item) => item !== value),
            excludeCities: Array.from(new Set([...current.excludeCities, value])),
          };
          return next;
        }
        const current = next.assignment ?? emptyAssignmentFilter();
        next.assignment = { ...current, missingDriver: true };
        return next;
      });
    },
    [setColumnFilters]
  );

  const downloadExportFile = useCallback(async () => {
    if (!exportColumnLabels.length) return;
    setExportPreparing(true);
    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      const headers = exportColumnLabels.map((column) => column.label);
      const rowValues = exportRows.map((row) => exportColumnLabels.map((column) => buildExportCellValue(row, column.key)));
      const datePart = new Date().toISOString().slice(0, 10);
      let scopePart: string = exportScope;
      if (statusFilter.includeValues.length || statusFilter.excludeValues.length) {
        if (statusFilter.includeValues.length) {
          scopePart = statusFilter.includeValues.map((value) => toSlug(value)).join("-");
        } else {
          scopePart = `not-${statusFilter.excludeValues.map((value) => toSlug(value)).join("-")}`;
        }
      }

      let blob: Blob;
      let filename: string;
      if (includeRowHighlights) {
        const XLSX = await import("xlsx");
        const sheetData = [headers, ...rowValues];
        const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
        for (let rowIndex = 0; rowIndex < exportRows.length; rowIndex += 1) {
          if (!highlightedRowIds.has(exportRows[rowIndex].id)) continue;
          for (let columnIndex = 0; columnIndex < exportColumnLabels.length; columnIndex += 1) {
            const address = XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex });
            const cell = worksheet[address];
            if (!cell) continue;
            cell.s = {
              ...(cell.s ?? {}),
              fill: {
                patternType: "solid",
                fgColor: { rgb: "FFF4DB" },
              },
            };
          }
        }
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Dispatch");
        const xlsx = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true });
        blob = new Blob([xlsx], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        filename = `loads_${scopePart || "dispatch"}_${datePart}.xlsx`;
      } else {
        const lines = [headers.map(csvEscape).join(",")];
        for (const values of rowValues) {
          lines.push(values.map((value) => csvEscape(value)).join(","));
        }
        const csv = lines.join("\n");
        blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        filename = `loads_${scopePart || "dispatch"}_${datePart}.csv`;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportPreparing(false);
    }
  }, [
    exportColumnLabels,
    exportRows,
    exportScope,
    highlightedRowIds,
    includeRowHighlights,
    statusFilter.excludeValues,
    statusFilter.includeValues,
  ]);

  const copyRowsToClipboard = useCallback(async () => {
    const rowsToCopy = selectedRowsForExport.length > 0 ? selectedRowsForExport : sortedRows;
    const columnsToCopy = defaultVisibleExportColumns;
    if (!rowsToCopy.length || !columnsToCopy.length) {
      toast.error("No rows available to copy.");
      return;
    }
    setCopyPreparing(true);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard is unavailable in this browser.");
      }
      const sanitize = (value: string) => value.replaceAll("\t", " ").replaceAll("\n", " ");
      const lines = [
        columnsToCopy.map((column) => sanitize(columnLabel(column))).join("\t"),
        ...rowsToCopy.map((row) =>
          columnsToCopy.map((column) => sanitize(buildExportCellValue(row, column))).join("\t")
        ),
      ];
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success(
        selectedRowsForExport.length > 0
          ? `Copied ${rowsToCopy.length} selected row(s).`
          : `Copied ${rowsToCopy.length} filtered row(s).`
      );
    } catch (error) {
      toast.error((error as Error).message || "Failed to copy rows.");
    } finally {
      setCopyPreparing(false);
    }
  }, [defaultVisibleExportColumns, selectedRowsForExport, sortedRows]);

  const clearColumnFilter = (column: DispatchGridColumnKey | "mode" | "issues") => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (column === "mode") {
        next.firefightingMode = false;
        return next;
      }
      if (column === "issues") {
        delete next.issueTypes;
        return next;
      }
      delete next[column as keyof ColumnFilterState];
      return next;
    });
  };

  const clearAllFilters = () => setColumnFilters({});

  const contextValueForCell = useCallback(
    (row: DispatchGridRow, column: DispatchGridColumnKey) => {
      if (column === "loadNumber") return { column: "loadNumber" as const, value: row.loadNumber || "", displayValue: row.loadNumber || "-" };
      if (column === "status") return { column: "status" as const, value: row.status || "", displayValue: humanizeEnum(row.status || "") };
      if (column === "customer") {
        const value = (row.customerName ?? "").trim();
        return { column: "customer" as const, value, displayValue: value || "-" };
      }
      if (column === "pickupAppt") {
        const value = routeLabel(row.route?.shipperCity, row.route?.shipperState);
        return { column: "pickupAppt" as const, value, displayValue: value || "-" };
      }
      if (column === "deliveryAppt") {
        const value = routeLabel(row.route?.consigneeCity, row.route?.consigneeState);
        return { column: "deliveryAppt" as const, value, displayValue: value || "-" };
      }
      if (column === "assignment") {
        const value = (row.assignment?.driver?.name ?? "").trim();
        return { column: "assignment" as const, value, displayValue: value || "Unassigned" };
      }
      return null;
    },
    []
  );

  return (
    <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--color-divider)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
        <div className="flex flex-wrap items-center gap-2">
          <span>Spreadsheet dispatch grid</span>
          <span className="inline-flex items-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] px-2 py-0.5 text-[11px] font-medium text-ink">
            Loads {sortedRows.length}
          </span>
          <span className="inline-flex items-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] px-2 py-0.5 text-[11px] font-medium text-ink">
            Trips {visibleTripCount}
          </span>
          {sortedRows.length !== rows.length ? (
            <span className="text-[11px] text-[color:var(--color-text-subtle)]">of {rows.length} loaded</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {workflowMacros?.length ? (
            <div className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setWorkflowMenuOpen((prev) => !prev);
                }}
                className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-bg-muted)]"
              >
                ⚡ Queues ▾
              </button>
              {workflowMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[220px] rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] p-1 shadow-[var(--shadow-card)]">
                  {workflowMacros.map((macro) => (
                    <button
                      key={macro.id}
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-[color:var(--color-bg-muted)]"
                      onClick={() => {
                        onApplyWorkflowMacro?.(macro.id);
                        setWorkflowMenuOpen(false);
                      }}
                    >
                      {macro.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="relative">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setClearoutMenuOpen((prev) => !prev);
              }}
              className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-bg-muted)]"
            >
              🧹 Clear out ▾
            </button>
            {clearoutMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[210px] rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] p-1 shadow-[var(--shadow-card)]">
                <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-[color:var(--color-bg-muted)]" onClick={() => { applyClearoutMacro("planningNoise"); setClearoutMenuOpen(false); }}>
                  Clear out planning noise
                </button>
                <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-[color:var(--color-bg-muted)]" onClick={() => { applyClearoutMacro("completed"); setClearoutMenuOpen(false); }}>
                  Clear out completed
                </button>
                <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-[color:var(--color-bg-muted)]" onClick={() => { applyClearoutMacro("inTransit"); setClearoutMenuOpen(false); }}>
                  In-Transit only
                </button>
                <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-[color:var(--color-bg-muted)]" onClick={() => { applyClearoutMacro("firefighting"); setClearoutMenuOpen(false); }}>
                  Firefighting mode
                </button>
                <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-[color:var(--color-bg-muted)]" onClick={() => { applyClearoutMacro("reset"); setClearoutMenuOpen(false); }}>
                  Reset filters
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setExportOpen(true);
              setExportColumns(defaultVisibleExportColumns);
              setExportColumnMode("visible");
              setExportScope("filtered");
            }}
            className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-bg-muted)]"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => void copyRowsToClipboard()}
            disabled={copyPreparing || sortedRows.length === 0}
            className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-bg-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copyPreparing
              ? "Copying..."
              : selectedRowsForExport.length > 0
                ? `Copy selected (${selectedRowsForExport.length})`
                : "Copy filtered"}
          </button>
          <button
            type="button"
            onClick={applyMorningDispatchSort}
            className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-bg-muted)]"
            >
              Morning dispatch
            </button>
          {sortRules.length ? (
            <button
              type="button"
              onClick={() => setSortRules([])}
              className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-bg-muted)]"
            >
              Clear sort
            </button>
          ) : null}
        </div>
      </div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
        {activeFilterChips.length ? (
          activeFilterChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => clearColumnFilter(chip.column)}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-2 py-1 text-[11px] text-[color:var(--color-text-muted)] hover:text-ink"
            >
              <span>{chip.label}</span>
              <span aria-hidden>x</span>
            </button>
          ))
        ) : (
          <span className="text-[11px] text-[color:var(--color-text-subtle)]">No active filters</span>
        )}
        <button
          type="button"
          onClick={clearAllFilters}
          className="text-[11px] text-[color:var(--color-text-muted)] underline underline-offset-2 hover:text-ink"
        >
          Clear all
        </button>
      </div>
      <div
        ref={viewportRef}
        className="relative h-[62vh] overflow-auto"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onKeyDown={handleGridKeyDown}
        tabIndex={0}
      >
        <div style={{ minWidth: totalWidth }}>
          <div className="sticky top-0 z-20 border-b border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)]/95 backdrop-blur">
            <div className="grid" style={{ gridTemplateColumns }}>
              {visibleColumns.map((column) => {
                const stickyLeft = column.frozen ? stickyOffsets.get(column.key) ?? 0 : undefined;
                const filterActive = columnFilterActive(column.key);
                return (
                  <div
                    key={column.key}
                    className={cn(
                      "group relative h-10 border-r border-[color:var(--color-divider)] px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]",
                      column.align === "right" ? "flex items-center justify-end" : "flex items-center",
                      column.key === "select" ? "justify-center" : "",
                      column.frozen
                        ? "isolate before:pointer-events-none before:absolute before:inset-0 before:backdrop-blur-[3px] before:bg-white/18"
                        : "",
                      column.frozen && column.key === lastFrozenColumnKey
                        ? "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-3 after:bg-gradient-to-r after:from-black/10 after:to-transparent"
                        : ""
                    )}
                    style={
                      column.frozen
                        ? {
                            position: "sticky",
                            left: stickyLeft,
                            zIndex: 36,
                            backgroundColor: "var(--color-bg-muted)",
                          }
                        : undefined
                    }
                  >
                    {column.key === "select" ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-[color:var(--color-divider)]"
                        checked={allVisibleSelected}
                        onChange={(event) => onToggleAllRows(event.target.checked, sortedRows.map((row) => row.id))}
                        aria-label="Select all rows"
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(event) => {
                            if (column.filterable && !event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
                              setOpenFilterColumn((prev) => (prev === column.key ? null : column.key));
                              return;
                            }
                            if (!column.sortable) return;
                            toggleSort(column.key, event.shiftKey);
                          }}
                          className={cn(
                            "inline-flex min-w-0 items-center gap-1 text-left",
                            column.sortable ? "cursor-pointer hover:text-ink" : ""
                          )}
                          title={
                            column.filterable
                              ? `Filter ${column.label} (Alt+click to sort)`
                              : column.sortable
                              ? `Sort ${column.label}${sortStateForColumn(column.key) ? ` (${sortDirectionLabel(sortStateForColumn(column.key)!.direction)})` : ""}`
                              : undefined
                          }
                        >
                          <span className="truncate">{column.label}</span>
                          {column.sortable ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-1",
                                sortStateForColumn(column.key)
                                  ? "text-[color:var(--color-accent)]"
                                  : "opacity-0 transition group-hover:opacity-100"
                              )}
                            >
                              {sortStateForColumn(column.key) ? (
                                <>
                                  <SortChevron direction={sortStateForColumn(column.key)!.direction} />
                                  {sortRules.length > 1 ? (
                                    <span className="text-[10px] font-semibold">{sortStateForColumn(column.key)!.rank}</span>
                                  ) : null}
                                </>
                              ) : (
                                <SortChevron direction="asc" />
                              )}
                            </span>
                          ) : null}
                        </button>
                        {column.filterable ? (
                          <button
                            type="button"
                            data-filter-column={column.key}
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenFilterColumn((prev) => (prev === column.key ? null : column.key));
                            }}
                            className={cn(
                              "ml-auto inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-control)] border border-transparent transition",
                              "opacity-0 group-hover:opacity-100",
                              filterActive && "border-[color:var(--color-divider)] bg-[color:var(--color-bg)] opacity-100",
                              "hover:border-[color:var(--color-divider)] hover:bg-[color:var(--color-bg)]"
                            )}
                            aria-label={`Filter ${column.label}`}
                          >
                            <FilterFunnelIcon active={filterActive} />
                          </button>
                        ) : null}
                        {openFilterColumn === column.key ? (
                          <div
                            ref={filterPopoverRef}
                            className="absolute left-1 top-[calc(100%+4px)] z-50 w-[260px] rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] p-3 text-xs normal-case tracking-normal text-ink shadow-[var(--shadow-card)]"
                          >
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">
                              {column.label} filter
                            </div>

                            {(column.key === "loadNumber" || column.key === "customer") && (() => {
                              const textKey: "loadNumber" | "customer" = column.key;
                              const textFilter = (columnFilters[textKey] ?? emptyTextFilter()) as TextFilterState;
                              const options = textKey === "loadNumber" ? filterValueOptions.loadNumber : filterValueOptions.customer;
                              const mode = textFilterMode[textKey];
                              const activeValues = mode === "include" ? textFilter.includeValues : textFilter.excludeValues;
                              return (
                                <div className="space-y-2">
                                  <Input
                                    value={textFilter.search}
                                    placeholder="Search"
                                    onChange={(event) => {
                                      const current = (columnFilters[textKey] ?? emptyTextFilter()) as TextFilterState;
                                      setColumnFilters((prev) => ({
                                        ...prev,
                                        [textKey]: { ...current, search: event.target.value },
                                      }));
                                    }}
                                  />
                                  <div className="flex items-center gap-1">
                                    <button type="button" className={cn("rounded-[var(--radius-control)] border px-2 py-1 text-[11px]", mode === "include" ? "border-[color:var(--color-accent)]" : "border-[color:var(--color-divider)]")} onClick={() => setTextFilterMode((prev) => ({ ...prev, [textKey]: "include" }))}>Include</button>
                                    <button type="button" className={cn("rounded-[var(--radius-control)] border px-2 py-1 text-[11px]", mode === "exclude" ? "border-[color:var(--color-accent)]" : "border-[color:var(--color-divider)]")} onClick={() => setTextFilterMode((prev) => ({ ...prev, [textKey]: "exclude" }))}>Exclude</button>
                                  </div>
                                  <div className="max-h-36 space-y-1 overflow-auto rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2">
                                    {options.map((value) => {
                                      const checked = activeValues.includes(value);
                                      return (
                                        <label key={value} className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(event) => {
                                              const current = (columnFilters[textKey] ?? emptyTextFilter()) as TextFilterState;
                                              const next = setIncludeExclude(current, mode, value, event.target.checked);
                                              setColumnFilters((prev) => ({
                                                ...prev,
                                                [textKey]: { ...current, ...next },
                                              }));
                                            }}
                                          />
                                          <span className="truncate">{value || "-"}</span>
                                        </label>
                                      );
                                    })}
                                    {!options.length ? <div className="text-[color:var(--color-text-muted)]">No values.</div> : null}
                                  </div>
                                </div>
                              );
                            })()}

                            {column.key === "status" && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1">
                                  <button type="button" className={cn("rounded-[var(--radius-control)] border px-2 py-1 text-[11px]", statusEditMode === "include" ? "border-[color:var(--color-accent)]" : "border-[color:var(--color-divider)]")} onClick={() => setStatusEditMode("include")}>Include</button>
                                  <button type="button" className={cn("rounded-[var(--radius-control)] border px-2 py-1 text-[11px]", statusEditMode === "exclude" ? "border-[color:var(--color-accent)]" : "border-[color:var(--color-divider)]")} onClick={() => setStatusEditMode("exclude")}>Exclude</button>
                                </div>
                                <div className="max-h-40 space-y-1 overflow-auto rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2">
                                  {STATUS_OPTIONS.map((status) => {
                                    const activeValues = statusEditMode === "include" ? statusFilter.includeValues : statusFilter.excludeValues;
                                    const checked = activeValues.includes(status);
                                    return (
                                      <label key={status} className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(event) => {
                                            const next = setIncludeExclude(statusFilter, statusEditMode, status, event.target.checked);
                                            setColumnFilters((prev) => ({ ...prev, status: next }));
                                          }}
                                        />
                                        <span>{humanizeEnum(status)}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                                <div className="grid grid-cols-1 gap-1">
                                  <button type="button" className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-left text-[11px] hover:bg-[color:var(--color-bg-muted)] disabled:opacity-50" disabled={!statusFilter.includeValues.length && !statusFilter.excludeValues.length} onClick={() => applyStatusMacro("exclude", statusEditMode === "include" ? statusFilter.includeValues : statusFilter.excludeValues)}>
                                    Hide selected statuses
                                  </button>
                                  <button type="button" className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-left text-[11px] hover:bg-[color:var(--color-bg-muted)] disabled:opacity-50" disabled={!statusFilter.includeValues.length && !statusFilter.excludeValues.length} onClick={() => applyStatusMacro("include", statusEditMode === "include" ? statusFilter.includeValues : statusFilter.excludeValues)}>
                                    Show only selected statuses
                                  </button>
                                  <button type="button" className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-left text-[11px] hover:bg-[color:var(--color-bg-muted)]" onClick={() => clearColumnFilter("status")}>
                                    Reset status filter
                                  </button>
                                </div>
                              </div>
                            )}

                            {(column.key === "pickupAppt" || column.key === "deliveryAppt") && (() => {
                              const appointmentKey: "pickupAppt" | "deliveryAppt" = column.key;
                              const appointmentFilter = (columnFilters[appointmentKey] ?? emptyAppointmentFilter()) as AppointmentFilterState;
                              const mode = appointmentFilterMode[appointmentKey];
                              const cityOptions = appointmentKey === "pickupAppt" ? filterValueOptions.pickupCity : filterValueOptions.deliveryCity;
                              const activeCities = mode === "include" ? appointmentFilter.includeCities : appointmentFilter.excludeCities;
                              return (
                                <div className="space-y-2">
                                  <Input
                                    value={appointmentFilter.search}
                                    placeholder="Search city"
                                    onChange={(event) => {
                                      const current = (columnFilters[appointmentKey] ?? emptyAppointmentFilter()) as AppointmentFilterState;
                                      setColumnFilters((prev) => ({ ...prev, [appointmentKey]: { ...current, search: event.target.value } }));
                                    }}
                                  />
                                  <div className="flex items-center gap-1">
                                    <button type="button" className={cn("rounded-[var(--radius-control)] border px-2 py-1 text-[11px]", mode === "include" ? "border-[color:var(--color-accent)]" : "border-[color:var(--color-divider)]")} onClick={() => setAppointmentFilterMode((prev) => ({ ...prev, [appointmentKey]: "include" }))}>Include</button>
                                    <button type="button" className={cn("rounded-[var(--radius-control)] border px-2 py-1 text-[11px]", mode === "exclude" ? "border-[color:var(--color-accent)]" : "border-[color:var(--color-divider)]")} onClick={() => setAppointmentFilterMode((prev) => ({ ...prev, [appointmentKey]: "exclude" }))}>Exclude</button>
                                  </div>
                                  <div className="max-h-28 space-y-1 overflow-auto rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2">
                                    {cityOptions.map((city) => (
                                      <label key={city} className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={activeCities.includes(city)}
                                          onChange={(event) => {
                                            const current = (columnFilters[appointmentKey] ?? emptyAppointmentFilter()) as AppointmentFilterState;
                                            const target = mode === "include" ? new Set(current.includeCities) : new Set(current.excludeCities);
                                            if (event.target.checked) target.add(city);
                                            else target.delete(city);
                                            setColumnFilters((prev) => ({
                                              ...prev,
                                              [appointmentKey]: {
                                                ...current,
                                                includeCities: mode === "include" ? Array.from(target) : current.includeCities,
                                                excludeCities: mode === "exclude" ? Array.from(target) : current.excludeCities,
                                              },
                                            }));
                                          }}
                                        />
                                        <span className="truncate">{city}</span>
                                      </label>
                                    ))}
                                  </div>
                                  <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2">
                                    <div className="mb-1 text-[11px] text-[color:var(--color-text-muted)]">Urgency</div>
                                    <div className="space-y-1">
                                      {APPOINTMENT_URGENCY_OPTIONS.map((option) => (
                                        <label key={option.value} className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={appointmentFilter.urgency.includes(option.value)}
                                            onChange={(event) => {
                                              const current = (columnFilters[appointmentKey] ?? emptyAppointmentFilter()) as AppointmentFilterState;
                                              const nextUrgency = event.target.checked
                                                ? Array.from(new Set([...current.urgency, option.value]))
                                                : current.urgency.filter((item) => item !== option.value);
                                              setColumnFilters((prev) => ({ ...prev, [appointmentKey]: { ...current, urgency: nextUrgency } }));
                                            }}
                                          />
                                          <span>{option.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                  <details>
                                    <summary className="cursor-pointer text-[11px] text-[color:var(--color-text-muted)]">More…</summary>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                      <div>
                                        <div className="mb-1 text-[11px] text-[color:var(--color-text-muted)]">From</div>
                                        <Input type="date" value={appointmentFilter.fromDate} onChange={(event) => {
                                          const current = (columnFilters[appointmentKey] ?? emptyAppointmentFilter()) as AppointmentFilterState;
                                          setColumnFilters((prev) => ({ ...prev, [appointmentKey]: { ...current, fromDate: event.target.value } }));
                                        }} />
                                      </div>
                                      <div>
                                        <div className="mb-1 text-[11px] text-[color:var(--color-text-muted)]">To</div>
                                        <Input type="date" value={appointmentFilter.toDate} onChange={(event) => {
                                          const current = (columnFilters[appointmentKey] ?? emptyAppointmentFilter()) as AppointmentFilterState;
                                          setColumnFilters((prev) => ({ ...prev, [appointmentKey]: { ...current, toDate: event.target.value } }));
                                        }} />
                                      </div>
                                    </div>
                                  </details>
                                </div>
                              );
                            })()}

                            {column.key === "assignment" && (
                              <div className="space-y-2">
                                <Select
                                  value={(columnFilters.assignment ?? emptyAssignmentFilter()).state}
                                  onChange={(event) => {
                                    const current = columnFilters.assignment ?? emptyAssignmentFilter();
                                    setColumnFilters((prev) => ({
                                      ...prev,
                                      assignment: { ...current, state: event.target.value as AssignmentFilterState["state"] },
                                    }));
                                  }}
                                >
                                  <option value="all">All assignments</option>
                                  <option value="fullyAssigned">Fully assigned</option>
                                  <option value="partiallyAssigned">Partially assigned</option>
                                  <option value="unassigned">Unassigned</option>
                                </Select>
                                <Input
                                  placeholder="Driver search"
                                  value={(columnFilters.assignment ?? emptyAssignmentFilter()).driverSearch}
                                  onChange={(event) => {
                                    const current = columnFilters.assignment ?? emptyAssignmentFilter();
                                    setColumnFilters((prev) => ({
                                      ...prev,
                                      assignment: { ...current, driverSearch: event.target.value },
                                    }));
                                  }}
                                />
                                <label className="flex items-center gap-2">
                                  <input type="checkbox" checked={(columnFilters.assignment ?? emptyAssignmentFilter()).missingDriver} onChange={(event) => {
                                    const current = columnFilters.assignment ?? emptyAssignmentFilter();
                                    setColumnFilters((prev) => ({ ...prev, assignment: { ...current, missingDriver: event.target.checked } }));
                                  }} />
                                  <span>Missing driver</span>
                                </label>
                                <label className="flex items-center gap-2">
                                  <input type="checkbox" checked={(columnFilters.assignment ?? emptyAssignmentFilter()).missingTruck} onChange={(event) => {
                                    const current = columnFilters.assignment ?? emptyAssignmentFilter();
                                    setColumnFilters((prev) => ({ ...prev, assignment: { ...current, missingTruck: event.target.checked } }));
                                  }} />
                                  <span>Missing tractor</span>
                                </label>
                                <label className="flex items-center gap-2">
                                  <input type="checkbox" checked={(columnFilters.assignment ?? emptyAssignmentFilter()).missingTrailer} onChange={(event) => {
                                    const current = columnFilters.assignment ?? emptyAssignmentFilter();
                                    setColumnFilters((prev) => ({ ...prev, assignment: { ...current, missingTrailer: event.target.checked } }));
                                  }} />
                                  <span>Missing trailer</span>
                                </label>
                              </div>
                            )}

                            {column.key === "docs" && (() => {
                              const docsFilter = columnFilters.docs ?? emptyDocsFilter();
                              const mode = docsFilterMode;
                              const activeValues = mode === "include" ? docsFilter.includeValues : docsFilter.excludeValues;
                              return (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-1">
                                    <button type="button" className={cn("rounded-[var(--radius-control)] border px-2 py-1 text-[11px]", mode === "include" ? "border-[color:var(--color-accent)]" : "border-[color:var(--color-divider)]")} onClick={() => setDocsFilterMode("include")}>Include</button>
                                    <button type="button" className={cn("rounded-[var(--radius-control)] border px-2 py-1 text-[11px]", mode === "exclude" ? "border-[color:var(--color-accent)]" : "border-[color:var(--color-divider)]")} onClick={() => setDocsFilterMode("exclude")}>Exclude</button>
                                  </div>
                                  <div className="space-y-1 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2">
                                    {DOCS_FILTER_OPTIONS.map((option) => (
                                      <label key={option.value} className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={activeValues.includes(option.value)}
                                          onChange={(event) => {
                                            const current = columnFilters.docs ?? emptyDocsFilter();
                                            const next = setIncludeExclude(current, mode, option.value, event.target.checked);
                                            setColumnFilters((prev) => ({ ...prev, docs: next }));
                                          }}
                                        />
                                        <span>{option.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}

                            {column.key === "risk" && (() => {
                              const riskFilter = columnFilters.risk ?? emptyRiskFilter();
                              const mode = riskFilterMode;
                              const activeValues = mode === "include" ? riskFilter.includeValues : riskFilter.excludeValues;
                              return (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-1">
                                    <button type="button" className={cn("rounded-[var(--radius-control)] border px-2 py-1 text-[11px]", mode === "include" ? "border-[color:var(--color-accent)]" : "border-[color:var(--color-divider)]")} onClick={() => setRiskFilterMode("include")}>Include</button>
                                    <button type="button" className={cn("rounded-[var(--radius-control)] border px-2 py-1 text-[11px]", mode === "exclude" ? "border-[color:var(--color-accent)]" : "border-[color:var(--color-divider)]")} onClick={() => setRiskFilterMode("exclude")}>Exclude</button>
                                  </div>
                                  <div className="space-y-1 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] p-2">
                                    {RISK_FILTER_OPTIONS.map((option) => (
                                      <label key={option.value} className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={activeValues.includes(option.value)}
                                          onChange={(event) => {
                                            const current = columnFilters.risk ?? emptyRiskFilter();
                                            const next = setIncludeExclude(current, mode, option.value, event.target.checked);
                                            setColumnFilters((prev) => ({ ...prev, risk: next }));
                                          }}
                                        />
                                        <span>{option.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(columnFilters.firefightingMode)}
                                      onChange={(event) => setColumnFilters((prev) => ({ ...prev, firefightingMode: event.target.checked }))}
                                    />
                                    <span>Mode: Firefighting</span>
                                  </label>
                                </div>
                              );
                            })()}

                            <div className="mt-3 flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => clearColumnFilter(column.key)}
                                className="text-[11px] text-[color:var(--color-text-muted)] underline underline-offset-2 hover:text-ink"
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                onClick={() => setOpenFilterColumn(null)}
                                className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-bg-muted)]"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ height: totalHeight, position: "relative" }}>
            {visibleRows.map((row, index) => {
              const actualIndex = startIndex + index;
              const top = actualIndex * rowHeight;
              const exceptions = buildExceptions(row);
              const docs = buildDocsBadgeRow(row);
              const riskIndicators = buildRiskIndicators(row, exceptions);
              const nextAction = buildNextBestAction(row);
              const selected = selectedLoadId === row.id;
              const focused = focusedCell.rowIndex === actualIndex;
              const highlighted = highlightedRowIds.has(row.id);
              const rowBackgroundClass = selected
                ? "bg-[color:var(--color-surface-hover)]"
                : highlighted
                ? "bg-[color:var(--color-accent-soft)]/35"
                : hoveredRowId === row.id
                ? "bg-[color:var(--color-bg-muted)]/55"
                : "bg-[color:var(--color-surface)]";
              return (
                <div
                  key={row.id}
                  className={cn(
                    "absolute left-0 right-0 border-b border-[color:var(--color-divider)]",
                    focused ? "ring-1 ring-inset ring-[color:var(--color-accent-soft)]" : ""
                  )}
                  style={{ top, height: rowHeight }}
                  draggable
                  onMouseEnter={() => setHoveredRowId(row.id)}
                  onMouseLeave={() => setHoveredRowId((prev) => (prev === row.id ? null : prev))}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/haulio-load-id", row.id);
                    onRowDragStart?.(row.id);
                  }}
                  onClick={() => {
                    onSelectLoad(row.id);
                    setGenericContextMenu(null);
                    setFocusedCell((prev) => ({ ...prev, rowIndex: actualIndex }));
                  }}
                >
                  <div className="grid h-full" style={{ gridTemplateColumns }}>
                    {visibleColumns.map((column, columnIndex) => {
                      const stickyLeft = column.frozen ? stickyOffsets.get(column.key) ?? 0 : undefined;
                      const isFocusedCell =
                        focusedCell.rowIndex === actualIndex && focusedCell.columnIndex === columnIndex;
                      const isEditing = editingCell?.rowId === row.id && editingCell.column === column.key;
                      const editKey = `${row.id}:${column.key}`;
                      const cellClass = cn(
                        "relative h-full border-r border-[color:var(--color-divider)] px-2 py-2.5 text-[13px] text-ink",
                        column.key === "select" ? "flex items-center" : "flex items-start",
                        column.align === "right" ? "justify-end text-right" : "justify-start",
                        column.align === "center" ? "justify-center text-center" : "",
                        rowBackgroundClass,
                        isFocusedCell ? "bg-[color:var(--color-bg-muted)]/60" : "",
                        column.frozen
                          ? "isolate overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:backdrop-blur-[3px] before:bg-white/12"
                          : "",
                        column.frozen && column.key === lastFrozenColumnKey
                          ? "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-3 after:bg-gradient-to-r after:from-black/10 after:to-transparent"
                          : ""
                      );

                      const staticContent = (() => {
                        switch (column.key) {
                          case "select":
                            return (
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-[color:var(--color-divider)]"
                                checked={selectedRowIds.has(row.id)}
                                onChange={(event) => onToggleRowSelection(row.id, event.target.checked)}
                                onClick={(event) => event.stopPropagation()}
                                aria-label={`Select ${row.loadNumber}`}
                              />
                            );
                          case "status":
                            return <StatusChip label={row.status} tone={statusTone(row.status)} />;
                          case "customer":
                            return <div className="truncate">{row.customerName ?? "-"}</div>;
                          case "pickupAppt": {
                            const city = routeLabel(row.route?.shipperCity, row.route?.shipperState);
                            const appt = formatDateTime(row.nextStop?.appointmentStart);
                            const relative = formatRelativeAppointment(row.nextStop?.appointmentStart);
                            return (
                              <div className="min-w-0">
                                <div className="truncate">{city}</div>
                                <div className="truncate text-[11px] text-[color:var(--color-text-muted)]">
                                  {appt === "-" ? "—" : appt}
                                </div>
                                {relative ? (
                                  <div className="truncate text-[10px] text-[color:var(--color-text-subtle)]">
                                    {relative}
                                  </div>
                                ) : null}
                              </div>
                            );
                          }
                          case "deliveryAppt": {
                            const city = routeLabel(row.route?.consigneeCity, row.route?.consigneeState);
                            const appt = formatDateTime(row.nextStop?.appointmentEnd);
                            const relative = formatRelativeAppointment(row.nextStop?.appointmentEnd);
                            return (
                              <div className="min-w-0">
                                <div className="truncate">{city}</div>
                                <div className="truncate text-[11px] text-[color:var(--color-text-muted)]">
                                  {appt === "-" ? "—" : appt}
                                </div>
                                {relative ? (
                                  <div className="truncate text-[10px] text-[color:var(--color-text-subtle)]">
                                    {relative}
                                  </div>
                                ) : null}
                              </div>
                            );
                          }
                          case "assignment": {
                            const hasDriver = Boolean(row.assignment?.driver?.id);
                            const hasTruck = Boolean(row.assignment?.truck?.id);
                            const hasTrailer = Boolean(row.assignment?.trailer?.id);
                            const state = hasDriver && hasTruck && hasTrailer ? "complete" : hasDriver || hasTruck || hasTrailer ? "partial" : "unassigned";
                            return (
                              <div className="min-w-0">
                                <div className="truncate">{row.assignment?.driver?.name ?? "Unassigned"}</div>
                                <div className="truncate text-[11px] text-[color:var(--color-text-muted)]">
                                  {row.assignment?.truck?.unit ?? "No truck"} · {row.assignment?.trailer?.unit ?? "No trailer"}
                                </div>
                                <div
                                  className={cn(
                                    "truncate text-[10px] uppercase tracking-[0.12em]",
                                    state === "complete"
                                      ? "text-[color:var(--color-success)]"
                                      : state === "partial"
                                      ? "text-[color:var(--color-warning)]"
                                      : "text-[color:var(--color-text-subtle)]"
                                  )}
                                >
                                  {state}
                                </div>
                              </div>
                            );
                          }
                          case "miles":
                            return <div className="tabular-nums text-[color:var(--color-text-muted)]">{row.miles ?? "-"}</div>;
                          case "paidMiles":
                            return <div className="tabular-nums text-[color:var(--color-text-muted)]">{row.paidMiles ?? "-"}</div>;
                          case "rate":
                            return <div className="tabular-nums text-[color:var(--color-text-muted)]">{normalizeRate(row.rate)}</div>;
                          case "notes":
                            return row.notesIndicator === "ALERT" ? (
                              <Badge className="bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]">Alert note</Badge>
                            ) : row.notesIndicator === "NORMAL" ? (
                              <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Has note</Badge>
                            ) : (
                              <div className="text-[color:var(--color-text-subtle)]">-</div>
                            );
                          case "docs":
                            return (
                              <div className="flex flex-wrap items-center gap-1">
                                {docs.map((chip) => (
                                  <Badge
                                    key={chip.label}
                                    className={cn(
                                      "px-2 py-0.5 text-[10px] tracking-[0.14em]",
                                      chip.tone === "success"
                                        ? "bg-[color:var(--color-success-soft)] text-[color:var(--color-success)]"
                                        : "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]"
                                    )}
                                  >
                                    {chip.label}
                                  </Badge>
                                ))}
                              </div>
                            );
                          case "exceptions":
                            return exceptions.length ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {exceptions.map((exception) => (
                                  <Badge
                                    key={exception.label}
                                    className={cn(
                                      "px-2 py-0.5 text-[10px] tracking-[0.14em]",
                                      exception.tone === "danger"
                                        ? "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]"
                                        : "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]"
                                    )}
                                  >
                                    {exception.label}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[color:var(--color-text-subtle)]">-</div>
                            );
                          case "risk":
                            return riskIndicators.length ? (
                              row.issuesTop?.length ? (
                                <div className="flex flex-wrap items-center gap-1">
                                  {riskIndicators.map((indicator) => (
                                    <button
                                      key={indicator.key}
                                      type="button"
                                      title={`Why: ${indicator.label}\nHow to clear: ${indicator.clearHint}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (onQuickOpenInspector) {
                                          onQuickOpenInspector(row.id, indicator.focusSection);
                                        } else {
                                          onSelectLoad(row.id);
                                        }
                                      }}
                                    >
                                      <Badge
                                        className={cn(
                                          "px-2 py-0.5 text-[10px] tracking-[0.12em]",
                                          indicator.tone === "danger"
                                            ? "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]"
                                            : "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]"
                                        )}
                                      >
                                        {indicator.label}
                                      </Badge>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  {riskIndicators.map((indicator) => (
                                    <button
                                      key={indicator.key}
                                      type="button"
                                      title={`Why: ${indicator.label}\nHow to clear: ${indicator.clearHint}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (onQuickOpenInspector) {
                                          onQuickOpenInspector(row.id, indicator.focusSection);
                                        } else {
                                          onSelectLoad(row.id);
                                        }
                                      }}
                                      className={cn(
                                        "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[color:var(--color-text-muted)]",
                                        indicator.tone === "danger"
                                          ? "border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger-soft)]/50 text-[color:var(--color-danger)]"
                                          : indicator.tone === "warning"
                                          ? "border-[color:var(--color-warning)]/30 bg-[color:var(--color-warning-soft)]/45 text-[color:var(--color-warning)]"
                                          : "border-[color:var(--color-divider)] text-[color:var(--color-text-muted)]"
                                      )}
                                    >
                                      {indicator.key === "late" ? (
                                        <RiskLateIcon />
                                      ) : indicator.key === "docs" ? (
                                        <RiskDocIcon />
                                      ) : indicator.key === "assign" ? (
                                        <RiskAssignIcon />
                                      ) : (
                                        <RiskExceptionIcon />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )
                            ) : (
                              <div className="text-[color:var(--color-text-subtle)]">-</div>
                            );
                          case "nextAction":
                            return (
                              <div className="min-w-0">
                                <div className="truncate text-[12px] font-medium text-ink">{nextAction.label}</div>
                                <div className="truncate text-[11px] text-[color:var(--color-text-muted)]">{nextAction.reason}</div>
                              </div>
                            );
                          case "tripNumber":
                            return <div className="truncate text-[color:var(--color-text-muted)]">{row.trip?.tripNumber ?? "-"}</div>;
                          case "updatedAt":
                            return <div className="truncate text-[color:var(--color-text-muted)]">{formatDateTime(row.updatedAt)}</div>;
                          case "loadNumber":
                          default:
                            return (
                              <div className="flex w-full items-center justify-between gap-2">
                                <div className="truncate font-semibold text-ink">{row.loadNumber}</div>
                                {hoveredRowId === row.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      title="Assign"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (onQuickAssign) {
                                          onQuickAssign(row.id);
                                        } else if (onQuickOpenInspector) {
                                          onQuickOpenInspector(row.id, "assignment");
                                        } else {
                                          onSelectLoad(row.id);
                                        }
                                      }}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] text-[10px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                                    >
                                      <QuickAssignIcon />
                                    </button>
                                    <button
                                      type="button"
                                      title="Update status"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        beginEdit(row.id, "status");
                                      }}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] text-[10px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                                    >
                                      <QuickStatusIcon />
                                    </button>
                                    <button
                                      type="button"
                                      title="Upload POD"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        (onQuickUploadPod ?? onSelectLoad)(row.id);
                                      }}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] text-[10px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                                    >
                                      <QuickPodIcon />
                                    </button>
                                    <button
                                      type="button"
                                      title="Open inspector"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (onQuickOpenInspector) {
                                          onQuickOpenInspector(row.id, "stops");
                                        } else {
                                          onSelectLoad(row.id);
                                        }
                                      }}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] text-[10px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                                    >
                                      <QuickInspectorIcon />
                                    </button>
                                    <button
                                      type="button"
                                      title={highlighted ? "Remove highlight" : "Highlight row"}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        toggleRowHighlight(row.id);
                                      }}
                                      className={cn(
                                        "inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius-control)] border text-[10px] hover:bg-[color:var(--color-bg-muted)]",
                                        highlighted
                                          ? "border-[color:var(--color-accent)]/50 bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]"
                                          : "border-[color:var(--color-divider)] text-[color:var(--color-text-muted)]"
                                      )}
                                    >
                                      ★
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            );
                        }
                      })();

                      return (
                        <div
                          key={column.key}
                          className={cellClass}
                          style={
                            column.frozen
                              ? {
                                  position: "sticky",
                                  left: stickyLeft,
                                  zIndex: 18,
                                }
                              : undefined
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            setFocusedCell({ rowIndex: actualIndex, columnIndex });
                            if (!readOnly && column.key === "status") {
                              beginEdit(row.id, "status");
                            }
                          }}
                          onContextMenu={(event) => {
                            const context = contextValueForCell(row, column.key);
                            if (!context) return;
                            event.preventDefault();
                            event.stopPropagation();
                            setFocusedCell({ rowIndex: actualIndex, columnIndex });
                            setGenericContextMenu({
                              rowId: row.id,
                              column: context.column,
                              value: context.value,
                              displayValue: context.displayValue,
                              x: event.clientX,
                              y: event.clientY,
                            });
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            beginEdit(row.id, column.key);
                          }}
                        >
                          {isEditing ? (
                            <div className="w-full">
                              {column.key === "status" ? (
                                <Select
                                  value={editingValue}
                                  onChange={(event) => {
                                    const nextStatus = event.target.value;
                                    setEditingValue(nextStatus);
                                    void (async () => {
                                      const parsed = parseInlineValue("status", nextStatus);
                                      if (!parsed.ok) {
                                        setInlineError(parsed.error);
                                        return;
                                      }
                                      try {
                                        await onInlineEdit({ loadId: row.id, field: "status", value: parsed.parsed });
                                        setInlineNote("Saved");
                                        window.setTimeout(() => setInlineNote(null), 1600);
                                        cancelEdit();
                                      } catch (error) {
                                        const message = (error as Error).message || "Failed to save";
                                        setInlineError(message);
                                        toast.error(message);
                                        cancelEdit();
                                      }
                                    })();
                                  }}
                                  autoFocus
                                  onBlur={cancelEdit}
                                >
                                  {STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <Input
                                  value={editingValue}
                                  onChange={(event) => setEditingValue(event.target.value)}
                                  autoFocus
                                  onBlur={() => {
                                    void commitEdit();
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void commitEdit();
                                    }
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      cancelEdit();
                                    }
                                  }}
                                />
                              )}
                            </div>
                          ) : (
                            <>
                              {staticContent}
                              {hoveredRowId === row.id && !isEditing && contextValueForCell(row, column.key) ? (
                                <button
                                  type="button"
                                  title="Filter options"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    const context = contextValueForCell(row, column.key);
                                    if (!context) return;
                                    const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setGenericContextMenu({
                                      rowId: row.id,
                                      column: context.column,
                                      value: context.value,
                                      displayValue: context.displayValue,
                                      x: rect.left,
                                      y: rect.bottom + 4,
                                    });
                                  }}
                                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] text-[10px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                                  aria-label="Open filter menu"
                                >
                                  ⋮
                                </button>
                              ) : null}
                              {loadingCellKey === editKey ? (
                                <span className="ml-2 text-[10px] text-[color:var(--color-text-muted)]">Saving…</span>
                              ) : null}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {genericContextMenu ? (
        <div
          className="fixed z-[90] min-w-[180px] rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] p-1 shadow-[var(--shadow-card)]"
          style={{ left: genericContextMenu.x, top: genericContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-[color:var(--color-bg-muted)]"
            onClick={(event) => {
              applyContextIncludeFilter(genericContextMenu.column, genericContextMenu.value, event.shiftKey);
              setGenericContextMenu(null);
            }}
          >
            Filter by this value
          </button>
          <button
            type="button"
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-[color:var(--color-bg-muted)]"
            onClick={() => {
              applyContextExcludeFilter(genericContextMenu.column, genericContextMenu.value);
              setGenericContextMenu(null);
            }}
          >
            Exclude this value
          </button>
          <button
            type="button"
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-[color:var(--color-bg-muted)]"
            onClick={() => {
              clearColumnFilter(genericContextMenu.column);
              setGenericContextMenu(null);
            }}
          >
            Clear this column filter
          </button>
          <button
            type="button"
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-[color:var(--color-bg-muted)]"
            onClick={() => {
              toggleRowHighlight(genericContextMenu.rowId);
              setGenericContextMenu(null);
            }}
          >
            {highlightedRowIds.has(genericContextMenu.rowId) ? "Remove row highlight" : "Highlight this row"}
          </button>
        </div>
      ) : null}
      {exportOpen ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-end bg-black/20 sm:items-stretch">
          <div className="flex h-[92dvh] w-full flex-col bg-[color:var(--color-surface-elevated)] shadow-[var(--shadow-card)] sm:h-full sm:max-w-3xl">
            <div className="flex items-center justify-between border-b border-[color:var(--color-divider)] px-4 py-4 sm:px-5">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Export</div>
                <div className="text-lg font-semibold text-ink">Export Preview</div>
              </div>
              <button
                type="button"
                className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-xs hover:bg-[color:var(--color-bg-muted)]"
                onClick={() => setExportOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-[color:var(--color-text-muted)]">Scope</div>
                  <Select value={exportScope} onChange={(event) => setExportScope(event.target.value as ExportScope)}>
                    <option value="filtered">Current filtered rows ({sortedRows.length})</option>
                    <option value="selected">Selected rows ({selectedRowsForExport.length})</option>
                    <option value="all">All loaded rows ({sortedAllRows.length})</option>
                  </Select>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-[color:var(--color-text-muted)]">Columns</div>
                  <Select value={exportColumnMode} onChange={(event) => setExportColumnMode(event.target.value as ExportColumnMode)}>
                    <option value="visible">Current visible columns ({defaultVisibleExportColumns.length})</option>
                    <option value="choose">Choose columns</option>
                  </Select>
                </div>
              </div>
              <label className="mt-3 inline-flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                <input
                  type="checkbox"
                  checked={includeRowHighlights}
                  onChange={(event) => setIncludeRowHighlights(event.target.checked)}
                />
                Include row highlights in export (downloads XLSX)
              </label>
              {exportColumnMode === "choose" ? (
                <div className="mt-3 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
                  <div className="mb-2 text-xs text-[color:var(--color-text-muted)]">Select columns</div>
                  <div className="grid gap-2 md:grid-cols-3">
                    {exportableColumns.map((column) => (
                      <label key={column} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={effectiveExportColumns.includes(column)}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setExportColumns((prev) => Array.from(new Set([...prev, column])));
                            } else {
                              setExportColumns((prev) => prev.filter((item) => item !== column));
                            }
                          }}
                        />
                        <span>{columnLabel(column)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">
                Exporting {exportRows.length} rows. Previewing first {Math.min(20, exportRows.length)}.
              </div>
              <div className="mt-3 overflow-auto rounded-[var(--radius-card)] border border-[color:var(--color-divider)]">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[color:var(--color-bg-muted)]">
                      {exportColumnLabels.map((column) => (
                        <th key={column.key} className="border-b border-r border-[color:var(--color-divider)] px-2 py-1 text-left font-medium text-[color:var(--color-text-muted)]">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exportPreviewRows.map((row) => (
                      <tr
                        key={row.id}
                        className={highlightedRowIds.has(row.id) ? "bg-[color:var(--color-accent-soft)]/35" : undefined}
                      >
                        {exportColumnLabels.map((column) => (
                          <td key={`${row.id}:${column.key}`} className="border-b border-r border-[color:var(--color-divider)] px-2 py-1">
                            {buildExportCellValue(row, column.key)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!exportPreviewRows.length ? (
                      <tr>
                        <td className="px-2 py-3 text-[color:var(--color-text-muted)]" colSpan={Math.max(1, exportColumnLabels.length)}>
                          No rows to export.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[color:var(--color-divider)] px-4 py-3 sm:px-5">
              <button
                type="button"
                className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-bg-muted)]"
                onClick={() => setExportOpen(false)}
                disabled={exportPreparing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-accent)] px-3 py-1.5 text-xs text-white hover:opacity-95 disabled:opacity-60"
                disabled={exportPreparing || !exportColumnLabels.length}
                onClick={() => void downloadExportFile()}
              >
                {exportPreparing ? "Preparing…" : includeRowHighlights ? "Download XLSX" : "Download CSV"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {inlineError ? <div className="border-t border-[color:var(--color-divider)] px-3 py-2 text-xs text-[color:var(--color-danger)]">{inlineError}</div> : null}
      {inlineNote ? <div className="border-t border-[color:var(--color-divider)] px-3 py-2 text-xs text-[color:var(--color-success)]">{inlineNote}</div> : null}
    </div>
  );
}

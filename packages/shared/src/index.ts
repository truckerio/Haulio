export const ROLES = ["ADMIN", "DISPATCHER", "BILLING", "DRIVER"] as const;
export type Role = (typeof ROLES)[number];

export const LOAD_STATUSES = [
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
] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const DOC_TYPES = [
  "POD",
  "RATECON",
  "RATE_CONFIRMATION",
  "BOL",
  "LUMPER",
  "SCALE",
  "DETENTION",
  "ACCESSORIAL_PROOF",
  "OTHER",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const TASK_PRIORITIES = ["LOW", "MED", "HIGH"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = ["OPEN", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

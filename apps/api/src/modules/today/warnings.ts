export const WARNING_TYPES = [
  {
    key: "dispatch_unassigned_loads",
    title: "Unassigned loads need coverage",
    reason: "Missing assignment",
  },
  {
    key: "dispatch_stuck_in_transit",
    title: "Loads stuck in transit",
    reason: "No stop activity in 24h",
  },
] as const;

export type WarningType = (typeof WARNING_TYPES)[number]["key"];

export const WARNING_TYPE_MAP = WARNING_TYPES.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {} as Record<WarningType, (typeof WARNING_TYPES)[number]>);

export function isWarningType(value: string): value is WarningType {
  return Object.prototype.hasOwnProperty.call(WARNING_TYPE_MAP, value);
}

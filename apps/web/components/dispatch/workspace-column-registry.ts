import type { DispatchGridColumnKey } from "@/components/dispatch/DispatchSpreadsheetGrid";
import type { TripGridColumnKey } from "@/components/dispatch/TripSpreadsheetGrid";

type ColumnCatalogGroup<T extends string> = {
  id: string;
  label: string;
  columns: T[];
};

export const DISPATCH_WORKSPACE_COLUMN_CATALOG: ColumnCatalogGroup<DispatchGridColumnKey>[] = [
  {
    id: "core",
    label: "Core (Locked)",
    columns: ["select", "loadNumber", "status"],
  },
  {
    id: "operations",
    label: "Operations",
    columns: [
      "customer",
      "pickupAppt",
      "pickupDateFrom",
      "pickupDateTo",
      "pickupTimeFrom",
      "pickupTimeTo",
      "deliveryAppt",
      "deliveryDateFrom",
      "deliveryDateTo",
      "deliveryTimeFrom",
      "deliveryTimeTo",
      "assignment",
      "driverName",
      "truckUnit",
      "trailerUnit",
      "nextAction",
    ],
  },
  {
    id: "trip",
    label: "Trip Context (Read-only)",
    columns: [
      "tripNumber",
      "tripStatus",
      "tripMode",
      "tripOrigin",
      "tripDestination",
      "tripDeparture",
      "tripArrival",
      "tripLoads",
    ],
  },
  {
    id: "commercial",
    label: "Commercial",
    columns: ["rate", "miles", "paidMiles"],
  },
  {
    id: "docs",
    label: "Docs & Exceptions",
    columns: ["docs", "exceptions", "risk"],
  },
  {
    id: "notes",
    label: "Notes",
    columns: ["notes"],
  },
  {
    id: "tracking",
    label: "Tracking & Audit",
    columns: ["updatedAt"],
  },
];

export const TRIPS_WORKSPACE_COLUMN_CATALOG: ColumnCatalogGroup<TripGridColumnKey>[] = [
  {
    id: "core",
    label: "Core (Locked)",
    columns: ["select", "tripNumber", "status"],
  },
  {
    id: "execution",
    label: "Execution",
    columns: ["movementMode", "loadsCount", "assignment", "plannedDepartureAt", "plannedArrivalAt"],
  },
  {
    id: "route",
    label: "Route",
    columns: ["origin", "destination"],
  },
  {
    id: "cargo",
    label: "Cargo",
    columns: ["cargo"],
  },
  {
    id: "tracking",
    label: "Tracking & Audit",
    columns: ["updatedAt"],
  },
];

export function filterWorkspaceColumnCatalog<T extends string>(
  catalog: ColumnCatalogGroup<T>[],
  labelByKey: Map<T, string>,
  query: string
): ColumnCatalogGroup<T>[] {
  const token = query.trim().toLowerCase();
  if (!token) return catalog;
  return catalog
    .map((group) => ({
      ...group,
      columns: group.columns.filter((key) => (labelByKey.get(key) ?? key).toLowerCase().includes(token)),
    }))
    .filter((group) => group.columns.length > 0);
}

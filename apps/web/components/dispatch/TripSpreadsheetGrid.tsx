"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { formatDateTime as formatDateTime24 } from "@/lib/date-time";
import { cn } from "@/lib/utils";

export type TripGridStatus = "PLANNED" | "ASSIGNED" | "IN_TRANSIT" | "ARRIVED" | "COMPLETE" | "CANCELLED";
export type TripGridMovementMode = "FTL" | "LTL" | "POOL_DISTRIBUTION";
export type TripGridSortMode = "newest" | "status" | "loads" | "trip";

export type TripGridRow = {
  id: string;
  tripNumber: string;
  status: TripGridStatus;
  movementMode: TripGridMovementMode;
  loadsCount: number;
  origin: string;
  destination: string;
  plannedDepartureAt?: string | null;
  plannedArrivalAt?: string | null;
  assignment: {
    driverName: string;
    truckUnit: string;
    trailerUnit: string;
  };
  cargo: "LINKED" | "UNLINKED" | "N/A";
  updatedAt?: string | null;
};

type TripGridColumnKey =
  | "select"
  | "tripNumber"
  | "status"
  | "movementMode"
  | "loadsCount"
  | "origin"
  | "destination"
  | "plannedDepartureAt"
  | "plannedArrivalAt"
  | "assignment"
  | "cargo"
  | "updatedAt";

type TripGridColumn = {
  key: TripGridColumnKey;
  label: string;
  width: number;
  frozen?: boolean;
  required?: boolean;
  align?: "left" | "right" | "center";
};

export const TRIP_GRID_COLUMNS: TripGridColumn[] = [
  { key: "select", label: "", width: 44, frozen: true, required: true, align: "center" },
  { key: "tripNumber", label: "Trip #", width: 170, frozen: true, required: true },
  { key: "status", label: "Status", width: 140, frozen: true, required: true },
  { key: "movementMode", label: "Mode", width: 132, required: true },
  { key: "loadsCount", label: "Loads", width: 84, required: true, align: "right" },
  { key: "origin", label: "Origin", width: 180, required: true },
  { key: "destination", label: "Destination", width: 180, required: true },
  { key: "plannedDepartureAt", label: "Depart", width: 166, required: true },
  { key: "plannedArrivalAt", label: "Arrive", width: 166, required: true },
  { key: "assignment", label: "Assignment", width: 250, required: true },
  { key: "cargo", label: "Cargo", width: 120, required: true, align: "center" },
  { key: "updatedAt", label: "Updated", width: 164, required: false },
];

export const TRIP_REQUIRED_COLUMNS = TRIP_GRID_COLUMNS.filter((column) => column.required).map((column) => column.key);
export const TRIP_FROZEN_COLUMNS = TRIP_GRID_COLUMNS.filter((column) => column.frozen).map((column) => column.key);

const STATUS_OPTIONS: TripGridStatus[] = ["PLANNED", "ASSIGNED", "IN_TRANSIT", "ARRIVED", "COMPLETE", "CANCELLED"];
const MOVEMENT_OPTIONS: TripGridMovementMode[] = ["FTL", "LTL", "POOL_DISTRIBUTION"];

const statusTone = (status: TripGridStatus) => {
  if (status === "COMPLETE" || status === "ARRIVED") return "success" as const;
  if (status === "IN_TRANSIT") return "info" as const;
  if (status === "ASSIGNED") return "warning" as const;
  if (status === "CANCELLED") return "danger" as const;
  return "neutral" as const;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  return formatDateTime24(value);
};

type TripSpreadsheetGridProps = {
  rows: TripGridRow[];
  loading?: boolean;
  selectedTripId: string | null;
  selectedRows: Set<string>;
  search: string;
  status: string;
  movementMode: string;
  sortMode: TripGridSortMode;
  filterCount: number;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onMovementModeChange: (value: string) => void;
  onSortModeChange: (value: TripGridSortMode) => void;
  onSelectTrip: (tripId: string) => void;
  onToggleRowSelection: (tripId: string, selected: boolean) => void;
  onToggleSelectAllVisible: (selected: boolean) => void;
};

export function TripSpreadsheetGrid({
  rows,
  loading,
  selectedTripId,
  selectedRows,
  search,
  status,
  movementMode,
  sortMode,
  filterCount,
  onSearchChange,
  onStatusChange,
  onMovementModeChange,
  onSortModeChange,
  onSelectTrip,
  onToggleRowSelection,
  onToggleSelectAllVisible,
}: TripSpreadsheetGridProps) {
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedRows.has(row.id));
  const gridTemplateColumns = TRIP_GRID_COLUMNS.map((column) => `${column.width}px`).join(" ");

  return (
    <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--color-divider)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
        <div className="flex items-center gap-2">
          <span>Spreadsheet trips grid</span>
          <span className="inline-flex items-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] px-2 py-0.5 text-[11px] font-medium text-ink">
            Trips {rows.length}
          </span>
          <span className="inline-flex items-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] px-2 py-0.5 text-[11px] font-medium text-ink">
            Selected {selectedRows.size}
          </span>
        </div>
        <span className="text-[11px] text-[color:var(--color-text-subtle)]">{filterCount ? `${filterCount} filter(s)` : "No active filters"}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2">
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search trip #, load #, customer"
          className="h-8 min-w-[220px] max-w-[320px]"
        />
        <Select className="h-8 w-[170px]" value={status} onChange={(event) => onStatusChange(event.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Select className="h-8 w-[180px]" value={movementMode} onChange={(event) => onMovementModeChange(event.target.value)}>
          <option value="">All movement modes</option>
          {MOVEMENT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Select className="h-8 w-[140px]" value={sortMode} onChange={(event) => onSortModeChange(event.target.value as TripGridSortMode)}>
          <option value="newest">Newest</option>
          <option value="status">Status</option>
          <option value="loads">Loads</option>
          <option value="trip">Trip #</option>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1796px]">
          <div className="sticky top-0 z-20 border-b border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)]/95 backdrop-blur">
            <div className="grid h-10" style={{ gridTemplateColumns }}>
              {TRIP_GRID_COLUMNS.map((column) => {
                const frozenStyle =
                  column.key === "select"
                    ? { position: "sticky" as const, left: 0, zIndex: 30 }
                    : column.key === "tripNumber"
                      ? { position: "sticky" as const, left: 44, zIndex: 29 }
                      : column.key === "status"
                        ? { position: "sticky" as const, left: 214, zIndex: 28 }
                        : undefined;

                return (
                  <div
                    key={column.key}
                    className={cn(
                      "flex h-10 items-center border-r border-[color:var(--color-divider)] px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]",
                      column.align === "right" ? "justify-end" : column.align === "center" ? "justify-center" : "justify-start",
                      column.key === "select" && "justify-center",
                      column.frozen && "bg-[color:var(--color-bg-muted)]/95"
                    )}
                    style={frozenStyle}
                  >
                    {column.key === "select" ? (
                      <input
                        type="checkbox"
                        aria-label="Select all visible trips"
                        checked={allVisibleSelected}
                        onChange={(event) => onToggleSelectAllVisible(event.target.checked)}
                        className="h-4 w-4 rounded border-[color:var(--color-divider)]"
                      />
                    ) : (
                      column.label
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="max-h-[66vh] overflow-y-auto">
            {loading ? (
              <div className="px-3 py-4 text-sm text-[color:var(--color-text-muted)]">Loading trips...</div>
            ) : rows.length === 0 ? (
              <div className="px-3 py-4 text-sm text-[color:var(--color-text-muted)]">No trips match current filters.</div>
            ) : (
              rows.map((row, rowIndex) => {
                const rowActive = row.id === selectedTripId;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onSelectTrip(row.id)}
                    className={cn(
                      "grid h-[52px] w-full border-b border-[color:var(--color-divider)] text-left transition",
                      rowActive ? "bg-[color:var(--color-accent-soft)]/25" : "hover:bg-[color:var(--color-bg-muted)]"
                    )}
                    style={{ gridTemplateColumns }}
                  >
                    {TRIP_GRID_COLUMNS.map((column) => {
                      const frozenStyle =
                        column.key === "select"
                          ? { position: "sticky" as const, left: 0, zIndex: 20 }
                          : column.key === "tripNumber"
                            ? { position: "sticky" as const, left: 44, zIndex: 19 }
                            : column.key === "status"
                              ? { position: "sticky" as const, left: 214, zIndex: 18 }
                              : undefined;

                      return (
                        <div
                          key={`${row.id}-${column.key}`}
                          className={cn(
                            "flex h-[52px] items-center border-r border-[color:var(--color-divider)] px-2 text-xs text-ink",
                            rowIndex % 2 === 0 ? "bg-[color:var(--color-surface)]" : "bg-[color:var(--color-surface-elevated)]/50",
                            rowActive && "bg-[color:var(--color-accent-soft)]/25",
                            column.frozen && !rowActive && (rowIndex % 2 === 0 ? "bg-[color:var(--color-surface)]" : "bg-[color:var(--color-surface-elevated)]/50"),
                            column.align === "right" ? "justify-end" : column.align === "center" ? "justify-center" : "justify-start"
                          )}
                          style={frozenStyle}
                        >
                          {column.key === "select" ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${row.tripNumber}`}
                              checked={selectedRows.has(row.id)}
                              onChange={(event) => onToggleRowSelection(row.id, event.target.checked)}
                              onClick={(event) => event.stopPropagation()}
                              className="h-4 w-4 rounded border-[color:var(--color-divider)]"
                            />
                          ) : null}
                          {column.key === "tripNumber" ? <div className="truncate font-semibold">{row.tripNumber}</div> : null}
                          {column.key === "status" ? <StatusChip label={row.status} tone={statusTone(row.status)} /> : null}
                          {column.key === "movementMode" ? <div className="truncate">{row.movementMode}</div> : null}
                          {column.key === "loadsCount" ? <div>{row.loadsCount}</div> : null}
                          {column.key === "origin" ? <div className="truncate">{row.origin || "-"}</div> : null}
                          {column.key === "destination" ? <div className="truncate">{row.destination || "-"}</div> : null}
                          {column.key === "plannedDepartureAt" ? <div className="truncate">{formatDateTime(row.plannedDepartureAt)}</div> : null}
                          {column.key === "plannedArrivalAt" ? <div className="truncate">{formatDateTime(row.plannedArrivalAt)}</div> : null}
                          {column.key === "assignment" ? (
                            <div className="truncate text-[11px] text-[color:var(--color-text-muted)]">
                              {row.assignment.driverName} · {row.assignment.truckUnit} · {row.assignment.trailerUnit}
                            </div>
                          ) : null}
                          {column.key === "cargo" ? (
                            row.cargo === "N/A" ? (
                              <span className="text-[11px] text-[color:var(--color-text-muted)]">N/A</span>
                            ) : (
                              <StatusChip label={row.cargo === "LINKED" ? "Linked" : "Unlinked"} tone={row.cargo === "LINKED" ? "success" : "warning"} />
                            )
                          ) : null}
                          {column.key === "updatedAt" ? <div className="truncate">{formatDateTime(row.updatedAt)}</div> : null}
                        </div>
                      );
                    })}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

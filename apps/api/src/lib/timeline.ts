import { sortTimelineEntries } from "./notes-v1";

export type TimelineKind = "NOTE" | "SYSTEM_EVENT" | "EXCEPTION" | "DOCUMENT_EVENT";

export type UnifiedTimelineEntry = {
  id: string;
  kind: TimelineKind;
  timestamp: Date;
  actor: { id: string | null; name: string | null; role: string | null } | null;
  payload: Record<string, unknown>;
  type: string;
  message: string;
  time: Date;
};

export function buildUnifiedTimeline(params: {
  notes: UnifiedTimelineEntry[];
  systemEvents: UnifiedTimelineEntry[];
  exceptions: UnifiedTimelineEntry[];
  documentEvents: UnifiedTimelineEntry[];
}) {
  return sortTimelineEntries([
    ...params.notes,
    ...params.systemEvents,
    ...params.exceptions,
    ...params.documentEvents,
  ]);
}

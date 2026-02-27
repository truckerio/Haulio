export type DispatchTimelineItem = {
  id: string;
  kind?: string | null;
  payload?: {
    pinned?: boolean | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

export function splitPinnedTimeline<T extends DispatchTimelineItem>(items: T[]) {
  const pinnedNotes = items.filter((item) => item?.kind === "NOTE" && Boolean(item?.payload?.pinned));
  const timelineEvents = items.filter((item) => !(item?.kind === "NOTE" && Boolean(item?.payload?.pinned)));
  return { pinnedNotes, timelineEvents };
}

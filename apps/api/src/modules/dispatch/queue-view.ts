import { LoadStatus, type Prisma } from "@truckerio/db";

export type DispatchQueueView = "active" | "recent" | "history";

export const QUEUE_VIEW_RECENT_DAYS = 90;

export const COMPLETED_LOAD_STATUSES: LoadStatus[] = [
  LoadStatus.DELIVERED,
  LoadStatus.POD_RECEIVED,
  LoadStatus.READY_TO_INVOICE,
  LoadStatus.INVOICED,
  LoadStatus.PAID,
  LoadStatus.CANCELLED,
];

export const isCompletedStatus = (status?: LoadStatus | null) =>
  Boolean(status && COMPLETED_LOAD_STATUSES.includes(status));

export function normalizeDispatchQueueView(value?: string | null): DispatchQueueView {
  if (value === "recent" || value === "history" || value === "active") return value;
  return "active";
}

type DispatchQueueFilterResult = {
  where: Prisma.LoadWhereInput;
  orderBy: Prisma.LoadOrderByWithRelationInput[];
  useRiskSort: boolean;
};

export function buildDispatchQueueFilters(queueView: DispatchQueueView, now = new Date()): DispatchQueueFilterResult {
  if (queueView === "active") {
    return {
      where: {
        OR: [
          { status: { notIn: COMPLETED_LOAD_STATUSES } },
          { status: LoadStatus.DELIVERED },
        ],
      },
      orderBy: [{ assignedDriverId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      useRiskSort: true,
    };
  }
  if (queueView === "recent") {
    const since = new Date(now.getTime() - QUEUE_VIEW_RECENT_DAYS * 24 * 60 * 60 * 1000);
    return {
      where: {
        status: { in: COMPLETED_LOAD_STATUSES },
        completedAt: { gte: since },
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      useRiskSort: false,
    };
  }
  return {
    where: {
      status: { in: COMPLETED_LOAD_STATUSES },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    useRiskSort: false,
  };
}

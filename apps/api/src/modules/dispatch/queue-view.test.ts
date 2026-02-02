import assert from "node:assert/strict";
import { LoadStatus } from "@truckerio/db";
import { buildDispatchQueueFilters, COMPLETED_LOAD_STATUSES, QUEUE_VIEW_RECENT_DAYS } from "./queue-view";

const active = buildDispatchQueueFilters("active", new Date("2026-02-01T00:00:00Z"));
assert.ok(active.useRiskSort, "Active queue should use risk sorting");
assert.ok(active.where.OR, "Active queue should build OR filter");
assert.deepStrictEqual(active.where.OR?.[1], { status: LoadStatus.DELIVERED });

const recentNow = new Date("2026-02-01T00:00:00Z");
const recent = buildDispatchQueueFilters("recent", recentNow);
const expectedSince = new Date(recentNow.getTime() - QUEUE_VIEW_RECENT_DAYS * 24 * 60 * 60 * 1000);
assert.deepStrictEqual(recent.where.status, { in: COMPLETED_LOAD_STATUSES });
assert.deepStrictEqual(recent.where.completedAt, { gte: expectedSince });
assert.deepStrictEqual(recent.orderBy[0], { completedAt: "desc" });

const history = buildDispatchQueueFilters("history", recentNow);
assert.deepStrictEqual(history.where.status, { in: COMPLETED_LOAD_STATUSES });
assert.ok(!history.where.completedAt, "History queue should not require completedAt cutoff");
assert.deepStrictEqual(history.orderBy[0], { completedAt: "desc" });

console.log("dispatch queue view tests passed");

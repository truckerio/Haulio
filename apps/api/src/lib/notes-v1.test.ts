import assert from "node:assert/strict";
import { LoadNoteSource, NoteType, Role } from "@truckerio/db";
import {
  canRoleViewNoteType,
  compareTimelineEntries,
  ensureRoleCanCreateNoteType,
  isNoteExpired,
  resolveNoteIndicator,
  sortTimelineEntries,
} from "./notes-v1";

// Permission tests (view/create by note type).
assert.equal(
  ensureRoleCanCreateNoteType({
    role: Role.ADMIN,
    noteType: NoteType.COMPLIANCE,
    source: LoadNoteSource.OPS,
  }),
  NoteType.COMPLIANCE
);
assert.equal(
  ensureRoleCanCreateNoteType({
    role: Role.BILLING,
    noteType: NoteType.BILLING,
    source: LoadNoteSource.OPS,
  }),
  NoteType.BILLING
);
assert.throws(
  () =>
    ensureRoleCanCreateNoteType({
      role: Role.BILLING,
      noteType: NoteType.OPERATIONAL,
      source: LoadNoteSource.OPS,
    }),
  /cannot create/
);
assert.equal(
  ensureRoleCanCreateNoteType({
    role: Role.DRIVER,
    noteType: NoteType.OPERATIONAL,
    source: LoadNoteSource.DRIVER,
  }),
  NoteType.OPERATIONAL
);
assert.throws(
  () =>
    ensureRoleCanCreateNoteType({
      role: Role.DRIVER,
      noteType: NoteType.OPERATIONAL,
      source: LoadNoteSource.OPS,
    }),
  /must use DRIVER source/
);
assert.equal(canRoleViewNoteType({ role: Role.SAFETY, noteType: NoteType.COMPLIANCE }), true);
assert.equal(canRoleViewNoteType({ role: Role.SAFETY, noteType: NoteType.BILLING }), false);

// Expiry tests.
const now = new Date("2026-02-26T19:00:00.000Z");
assert.equal(isNoteExpired({ expiresAt: null, now }), false);
assert.equal(isNoteExpired({ expiresAt: new Date("2026-02-26T18:59:59.000Z"), now }), true);
assert.equal(isNoteExpired({ expiresAt: new Date("2026-02-26T19:00:01.000Z"), now }), false);

// Grid indicator tests.
assert.equal(resolveNoteIndicator({ hasAny: false, hasAlert: false }), "NONE");
assert.equal(resolveNoteIndicator({ hasAny: true, hasAlert: false }), "NORMAL");
assert.equal(resolveNoteIndicator({ hasAny: true, hasAlert: true }), "ALERT");

// Timeline ordering tests (deterministic by timestamp then id desc).
const unsorted = [
  { id: "b", timestamp: new Date("2026-04-07T10:00:00.000Z") },
  { id: "c", timestamp: new Date("2026-04-07T10:00:00.000Z") },
  { id: "a", timestamp: new Date("2026-04-08T00:00:00.000Z") },
];
const sorted = sortTimelineEntries(unsorted);
assert.deepStrictEqual(
  sorted.map((item) => item.id),
  ["a", "c", "b"]
);
assert.ok(compareTimelineEntries(sorted[1], sorted[2]) < 0);

console.log("notes v1 tests passed");

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(__dirname, "../../index.ts");
const source = fs.readFileSync(sourcePath, "utf8");

assert.ok(
  source.includes('"/loads/:id/notes/:noteId"'),
  "expected immutable delete route to exist for compatibility"
);
assert.ok(
  source.includes("res.status(405).json({ error: NOTE_DELETE_DISABLED_MESSAGE });"),
  "expected delete route to return 405 immutable message"
);
assert.ok(
  !/app\.(put|patch)\(\s*["']\/loads\/:id\/notes\/:noteId["']/.test(source),
  "unexpected mutable update route for load notes"
);
assert.ok(
  source.includes("replyToNoteId"),
  "expected clarification/reply support on note create payloads"
);
assert.ok(
  source.includes("Clarification target note not found"),
  "expected clarification target validation for immutable reply notes"
);
assert.ok(
  source.includes("Only the primary driver can add notes"),
  "expected primary-driver restriction for driver note endpoint"
);

console.log("notes immutability contract tests passed");

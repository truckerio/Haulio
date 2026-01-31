import assert from "node:assert/strict";
import { parseSuggestionLogPayload } from "./validation";

const ok = parseSuggestionLogPayload({ modelVersion: "assist_v1", suggestions: [] });
assert.ok(ok.success, "Valid payload should pass");

const bad = parseSuggestionLogPayload({ modelVersion: "" });
assert.ok(!bad.success, "Empty modelVersion should fail");

console.log("assignment assist validation tests passed");

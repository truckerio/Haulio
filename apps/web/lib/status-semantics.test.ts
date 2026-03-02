import assert from "node:assert/strict";
import { toneFromSemantic, toneFromSeverity } from "./status-semantics";

assert.equal(toneFromSemantic("blocked"), "danger");
assert.equal(toneFromSemantic("attention"), "warning");
assert.equal(toneFromSemantic("info"), "info");
assert.equal(toneFromSemantic("complete"), "success");
assert.equal(toneFromSemantic("neutral"), "neutral");

assert.equal(toneFromSeverity("error"), "danger");
assert.equal(toneFromSeverity("warning"), "warning");
assert.equal(toneFromSeverity("info"), "info");
assert.equal(toneFromSeverity("success"), "success");
assert.equal(toneFromSeverity("neutral"), "neutral");

console.log("status semantics tests passed");


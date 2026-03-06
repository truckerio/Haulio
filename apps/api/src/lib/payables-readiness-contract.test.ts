import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(__dirname, "../index.ts"), "utf8");

const previewAnchor = "async function buildPayablePreviewLines";
const previewIndex = source.indexOf(previewAnchor);
assert.ok(previewIndex >= 0, "payables preview builder must exist");
const previewBlock = source.slice(previewIndex, previewIndex + 8000);
assert.ok(
  previewBlock.includes("hasVerifiedPod"),
  "payables preview must carry POD readiness into pay facts"
);
assert.ok(
  previewBlock.includes("hasVerifiedBol"),
  "payables preview must carry BOL readiness into pay facts"
);

const anomalyAnchor = "function detectPayableAnomalies";
const anomalyIndex = source.indexOf(anomalyAnchor);
assert.ok(anomalyIndex >= 0, "payables anomaly detector must exist");
const anomalyBlock = source.slice(anomalyIndex, anomalyIndex + 10000);
assert.ok(
  anomalyBlock.includes('code: "MISSING_POD"'),
  "payables anomaly detector must flag missing POD"
);
assert.ok(
  anomalyBlock.includes('code: "MISSING_BOL"'),
  "payables anomaly detector must flag missing BOL"
);
assert.ok(
  anomalyBlock.includes('code: "MILES_UNAPPROVED"'),
  "payables anomaly detector must flag unapproved miles"
);

console.log("payables readiness contract tests passed");


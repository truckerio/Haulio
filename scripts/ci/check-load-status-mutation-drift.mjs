#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const targetFile = path.join(repoRoot, "apps/api/src/index.ts");
const source = fs.readFileSync(targetFile, "utf8");

function extractCallSnippet(text, offset) {
  const openIndex = text.indexOf("(", offset);
  if (openIndex === -1) return text.slice(offset, offset + 320);
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(offset, index + 1);
      }
    }
  }
  return text.slice(offset, offset + 1200);
}

function nearestFunctionName(text, offset) {
  const segment = text.slice(0, offset);
  const functionMatches = Array.from(segment.matchAll(/(?:async\s+function|function)\s+([A-Za-z0-9_]+)\s*\(/g));
  if (functionMatches.length === 0) return null;
  return functionMatches[functionMatches.length - 1][1] ?? null;
}

function lineFromOffset(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

const updatePattern = /(prisma|tx)\.load\.(update|updateMany)\s*\(\s*\{/g;
const violations = [];

for (const match of source.matchAll(updatePattern)) {
  const index = match.index ?? 0;
  const snippet = extractCallSnippet(source, index);
  if (!/\bstatus\s*:/.test(snippet)) {
    continue;
  }
  const fnName = nearestFunctionName(source, index);
  if (fnName !== "transitionLoadStatus") {
    violations.push({
      line: lineFromOffset(source, index),
      fnName: fnName ?? "unknown",
      match: match[0],
    });
  }
}

if (violations.length > 0) {
  console.error("Direct Load.status mutation drift detected outside transitionLoadStatus:");
  for (const violation of violations) {
    console.error(
      `- apps/api/src/index.ts:${violation.line} function=${violation.fnName} pattern=${violation.match}`
    );
  }
  process.exit(1);
}

console.log("Load status mutation drift check passed.");

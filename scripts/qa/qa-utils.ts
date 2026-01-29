import fs from "fs";
import path from "path";
import { repoRoot } from "./qa-paths";

export type QaStatus = "pass" | "fail" | "skip";
export type QaResult = {
  name: string;
  status: QaStatus;
  details?: string;
  error?: string;
  startedAt: string;
  finishedAt: string;
};

const resultsPath = path.resolve(repoRoot, "scripts/qa/qa-results.json");

export function resetResults() {
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify({ results: [] }, null, 2));
}

export function readResults(): { results: QaResult[] } {
  if (!fs.existsSync(resultsPath)) {
    return { results: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(resultsPath, "utf8"));
  } catch {
    return { results: [] };
  }
}

export function writeResult(result: QaResult) {
  const current = readResults();
  current.results.push(result);
  fs.writeFileSync(resultsPath, JSON.stringify(current, null, 2));
}

export async function runStep(name: string, fn: () => Promise<{ details?: string } | void>) {
  const startedAt = new Date().toISOString();
  try {
    const output = await fn();
    writeResult({
      name,
      status: "pass",
      details: output?.details,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as Error;
    writeResult({
      name,
      status: "fail",
      error: err.stack || err.message,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    throw error;
  }
}

export function recordSkip(name: string, details: string) {
  writeResult({
    name,
    status: "skip",
    details,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
}

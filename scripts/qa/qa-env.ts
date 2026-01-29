import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { repoRoot } from "./qa-paths";

const envCandidates = [
  path.resolve(repoRoot, ".env.qa"),
  path.resolve(repoRoot, ".env"),
  path.resolve(repoRoot, "packages", "db", ".env"),
];

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
}

export function getQaDatabaseUrl() {
  const url = process.env.QA_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("QA_DATABASE_URL or DATABASE_URL must be set");
  }
  const lower = url.toLowerCase();
  const hasQa = lower.includes("qa") || lower.includes("schema=qa");
  if (!hasQa) {
    throw new Error("Refusing to run QA against non-qa database. Set QA_DATABASE_URL to a qa database/schema.");
  }
  return url;
}

export function getApiBase() {
  return process.env.QA_API_BASE || "http://localhost:4000";
}

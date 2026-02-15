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

function isQaDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).toLowerCase();
    const schema = (parsed.searchParams.get("schema") || "").toLowerCase();
    const dbLooksQa = dbName.includes("qa");
    const schemaLooksQa = schema.includes("qa");
    return dbLooksQa || schemaLooksQa;
  } catch {
    const lower = url.toLowerCase();
    return lower.includes("schema=qa") || lower.includes("/qa");
  }
}

export function getQaDatabaseUrl() {
  const url = process.env.QA_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("QA_DATABASE_URL or DATABASE_URL must be set");
  }
  const hasQa = isQaDatabaseUrl(url);
  if (!hasQa) {
    throw new Error("Refusing to run QA against non-qa database. Use a QA database name or schema in QA_DATABASE_URL.");
  }
  return url;
}

export function getApiBase() {
  if (process.env.QA_API_BASE) return process.env.QA_API_BASE;
  const port = process.env.QA_API_PORT || "4010";
  return `http://localhost:${port}`;
}

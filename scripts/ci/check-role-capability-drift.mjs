#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

const schemaPath = path.join(repoRoot, "packages/db/prisma/schema.prisma");
const apiCapabilitiesPath = path.join(repoRoot, "apps/api/src/lib/capabilities.ts");
const webCapabilitiesPath = path.join(repoRoot, "apps/web/lib/capabilities.ts");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parsePrismaRoles(source) {
  const match = source.match(/enum\s+Role\s*{([\s\S]*?)}/);
  if (!match) throw new Error("Role enum not found in Prisma schema");
  return new Set(
    match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[A-Z_]+$/.test(line))
  );
}

function parseApiCanonicalRoles(source) {
  const match = source.match(/CANONICAL_ROLES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!match) throw new Error("CANONICAL_ROLES not found in API capabilities");
  return new Set(Array.from(match[1].matchAll(/Role\.([A-Z_]+)/g)).map((entry) => entry[1]));
}

function parseWebCanonicalRoles(source) {
  const match = source.match(/export type CanonicalRole\s*=\s*([\s\S]*?);/);
  if (!match) throw new Error("CanonicalRole type not found in Web capabilities");
  return new Set(Array.from(match[1].matchAll(/"([A-Z_]+)"/g)).map((entry) => entry[1]));
}

function equalSets(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function toSortedList(values) {
  return Array.from(values).sort();
}

function listSourceFiles(dirPath) {
  const output = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
        stack.push(fullPath);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
      if (/\.(test|spec)\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
      output.push(fullPath);
    }
  }
  return output;
}

function findForbiddenRoleTokens() {
  const forbidden = ["OPS_MANAGER"];
  const offenders = [];
  const scanRoots = [path.join(repoRoot, "apps/api/src"), path.join(repoRoot, "apps/web")];
  for (const root of scanRoots) {
    for (const filePath of listSourceFiles(root)) {
      const source = readFile(filePath);
      for (const token of forbidden) {
        if (source.includes(token)) {
          offenders.push({ filePath, token });
        }
      }
    }
  }
  return offenders;
}

const prismaRoles = parsePrismaRoles(readFile(schemaPath));
const apiRoles = parseApiCanonicalRoles(readFile(apiCapabilitiesPath));
const webRoles = parseWebCanonicalRoles(readFile(webCapabilitiesPath));

let failed = false;
if (!equalSets(prismaRoles, apiRoles) || !equalSets(prismaRoles, webRoles)) {
  failed = true;
  console.error("Role drift detected between Prisma/API/Web.");
  console.error("Prisma:", toSortedList(prismaRoles).join(", "));
  console.error("API   :", toSortedList(apiRoles).join(", "));
  console.error("Web   :", toSortedList(webRoles).join(", "));
}

const forbiddenOffenders = findForbiddenRoleTokens();
if (forbiddenOffenders.length > 0) {
  failed = true;
  console.error("Forbidden role token usage found:");
  for (const offender of forbiddenOffenders) {
    console.error(`- ${path.relative(repoRoot, offender.filePath)} -> ${offender.token}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log("Role/capability drift check passed.");

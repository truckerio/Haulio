import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import multer from "multer";
import { nanoid } from "nanoid";
import { prisma } from "@truckerio/db";

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || "15");
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

let cachedRepoRoot: string | null = null;

function findRepoRoot(startDir: string) {
  if (cachedRepoRoot) return cachedRepoRoot;
  let current = startDir;
  while (true) {
    if (
      fsSync.existsSync(path.join(current, "pnpm-workspace.yaml")) ||
      fsSync.existsSync(path.join(current, ".git"))
    ) {
      cachedRepoRoot = current;
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      cachedRepoRoot = startDir;
      return startDir;
    }
    current = parent;
  }
}

export function getUploadDir() {
  const configured = process.env.UPLOAD_DIR;
  if (!configured) {
    return path.join(findRepoRoot(process.cwd()), "uploads");
  }
  if (path.isAbsolute(configured)) {
    return configured;
  }
  return path.resolve(findRepoRoot(process.cwd()), configured);
}

export async function ensureUploadDirs() {
  const base = getUploadDir();
  await fs.mkdir(base, { recursive: true });
  await fs.mkdir(path.join(base, "docs"), { recursive: true });
  await fs.mkdir(path.join(base, "invoices"), { recursive: true });
  await fs.mkdir(path.join(base, "packets"), { recursive: true });
  await fs.mkdir(path.join(base, "org"), { recursive: true });
}

export function toRelativeUploadPath(absOrRelPath: string) {
  if (!absOrRelPath) return "";
  const normalized = absOrRelPath.replace(/\\/g, "/");
  if (!path.isAbsolute(absOrRelPath)) {
    return normalized.replace(/^\/+/, "");
  }
  const baseDir = getUploadDir().replace(/\\/g, "/");
  const rel = path.relative(baseDir, normalized).replace(/\\/g, "/");
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    return rel;
  }
  const marker = normalized.lastIndexOf("/uploads/");
  if (marker !== -1) {
    return normalized.slice(marker + "/uploads/".length).replace(/^\/+/, "");
  }
  for (const segment of ["/invoices/", "/packets/", "/docs/"]) {
    const idx = normalized.lastIndexOf(segment);
    if (idx !== -1) {
      return normalized.slice(idx + 1).replace(/^\/+/, "");
    }
  }
  return "";
}

export function resolveUploadPath(relPath: string) {
  const baseDir = getUploadDir();
  const cleaned = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const resolved = path.resolve(baseDir, cleaned);
  const baseResolved = path.resolve(baseDir) + path.sep;
  if (!resolved.startsWith(baseResolved)) {
    throw new Error("Invalid upload path");
  }
  return resolved;
}

export function buildDocFilename(loadNumber: string, type: string, mimeType: string) {
  const safeType = type.toLowerCase();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const ext = mimeType.includes("pdf") ? "pdf" : mimeType.includes("png") ? "png" : "jpg";
  return `${loadNumber}-${safeType}-${stamp}-${nanoid(6)}.${ext}`;
}

export async function saveDocumentFile(file: Express.Multer.File, loadId: string, orgId: string, type: string) {
  await ensureUploadDirs();
  const load = await prisma.load.findFirst({
    where: { id: loadId, orgId },
    select: { loadNumber: true },
  });
  if (!load) {
    throw new Error("Load not found");
  }
  const filename = buildDocFilename(load.loadNumber, type, file.mimetype);
  const target = resolveUploadPath(path.posix.join("docs", filename));
  await fs.writeFile(target, file.buffer);
  return { filename, target };
}

export async function saveLoadConfirmationFile(file: Express.Multer.File, orgId: string, docId: string) {
  await ensureUploadDirs();
  const original = file.originalname || "load-confirmation";
  const safeName = path.basename(original).replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = path.posix.join("org", orgId, "load-confirmations", docId, safeName);
  const target = resolveUploadPath(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, file.buffer);
  return { filename: safeName, storageKey };
}

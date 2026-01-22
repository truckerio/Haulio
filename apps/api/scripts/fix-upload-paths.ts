import "dotenv/config";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { prisma } from "@truckerio/db";
import { resolveUploadPath, toRelativeUploadPath } from "../src/lib/uploads";

// Usage: pnpm --filter @truckerio/api exec tsx scripts/fix-upload-paths.ts
async function main() {
  let invoiceUpdates = 0;
  let invoiceMoves = 0;
  const repoRoot = (() => {
    let current = process.cwd();
    while (true) {
      if (fsSync.existsSync(path.join(current, "pnpm-workspace.yaml")) || fsSync.existsSync(path.join(current, ".git"))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return process.cwd();
      }
      current = parent;
    }
  })();
  const legacyBases = [
    path.join(repoRoot, "apps", "api", "uploads"),
    path.join(repoRoot, "apps", "worker", "uploads"),
  ];
  const invoices = await prisma.invoice.findMany({
    select: { id: true, pdfPath: true, packetPath: true },
  });

  const moveIfNeeded = async (absPath: string, relPath: string) => {
    const target = resolveUploadPath(relPath);
    if (path.resolve(absPath) === path.resolve(target)) return false;
    try {
      await fs.access(target);
      return false;
    } catch {}
    try {
      await fs.access(absPath);
    } catch {
      return false;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.rename(absPath, target);
    } catch (error: any) {
      if (error?.code === "EXDEV") {
        await fs.copyFile(absPath, target);
        await fs.unlink(absPath);
      } else {
        throw error;
      }
    }
    return true;
  };

  const moveFromLegacy = async (relPath: string) => {
    const target = resolveUploadPath(relPath);
    try {
      await fs.access(target);
      return false;
    } catch {}
    for (const base of legacyBases) {
      const candidate = path.join(base, relPath);
      try {
        await fs.access(candidate);
      } catch {
        continue;
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      try {
        await fs.rename(candidate, target);
      } catch (error: any) {
        if (error?.code === "EXDEV") {
          await fs.copyFile(candidate, target);
          await fs.unlink(candidate);
        } else {
          throw error;
        }
      }
      return true;
    }
    return false;
  };

  for (const invoice of invoices) {
    const data: { pdfPath?: string | null; packetPath?: string | null } = {};
    if (invoice.pdfPath) {
      let rel = toRelativeUploadPath(invoice.pdfPath);
      if (rel) {
        if (!rel.startsWith("invoices/")) {
          rel = path.posix.join("invoices", path.basename(rel));
        }
        if (path.isAbsolute(invoice.pdfPath)) {
          const moved = await moveIfNeeded(invoice.pdfPath, rel);
          if (moved) invoiceMoves += 1;
        } else {
          const moved = await moveFromLegacy(rel);
          if (moved) invoiceMoves += 1;
        }
        if (rel !== invoice.pdfPath) {
          data.pdfPath = rel;
        }
      }
    }
    if (invoice.packetPath) {
      let rel = toRelativeUploadPath(invoice.packetPath);
      if (rel) {
        if (!rel.startsWith("packets/")) {
          rel = path.posix.join("packets", path.basename(rel));
        }
        if (path.isAbsolute(invoice.packetPath)) {
          const moved = await moveIfNeeded(invoice.packetPath, rel);
          if (moved) invoiceMoves += 1;
        } else {
          const moved = await moveFromLegacy(rel);
          if (moved) invoiceMoves += 1;
        }
        if (rel !== invoice.packetPath) {
          data.packetPath = rel;
        }
      }
    }
    if (Object.keys(data).length > 0) {
      await prisma.invoice.update({ where: { id: invoice.id }, data });
      invoiceUpdates += 1;
    }
  }

  let docUpdates = 0;
  let docMoves = 0;
  const docs = await prisma.document.findMany({ select: { id: true, filename: true } });
  for (const doc of docs) {
    if (doc.filename.includes("/") || doc.filename.includes("\\")) {
      const base = path.basename(doc.filename);
      if (base && base !== doc.filename) {
        if (path.isAbsolute(doc.filename)) {
          const rel = path.posix.join("docs", base);
          const moved = await moveIfNeeded(doc.filename, rel);
          if (moved) docMoves += 1;
        } else {
          const rel = path.posix.join("docs", base);
          const moved = await moveFromLegacy(rel);
          if (moved) docMoves += 1;
        }
        await prisma.document.update({ where: { id: doc.id }, data: { filename: base } });
        docUpdates += 1;
      }
    }
  }

  console.log(`Updated invoices: ${invoiceUpdates}`);
  console.log(`Moved invoice/packet files: ${invoiceMoves}`);
  console.log(`Updated documents: ${docUpdates}`);
  console.log(`Moved document files: ${docMoves}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

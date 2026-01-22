import fs from "fs";
import path from "path";
import archiver from "archiver";
import { prisma } from "@truckerio/db";
import { ensureUploadDirs, resolveUploadPath, toRelativeUploadPath } from "./uploads";

export async function generatePacketZip(params: {
  orgId: string;
  invoiceNumber: string;
  invoicePath: string;
  loadId: string;
  requiredDocs: string[];
}) {
  await ensureUploadDirs();
  const filename = `${params.invoiceNumber}.zip`;
  const relativePath = path.posix.join("packets", filename);
  const filePath = resolveUploadPath(relativePath);

  const docRecords = await prisma.document.findMany({
    where: { loadId: params.loadId, orgId: params.orgId },
  });

  const missing = params.requiredDocs.filter(
    (docType) => !docRecords.some((doc) => doc.type === docType && doc.status === "VERIFIED")
  );
  if (missing.length > 0) {
    return { missing, filePath: null } as const;
  }

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));
    archive.pipe(output);
    const invoiceRelPath = toRelativeUploadPath(params.invoicePath);
    if (!invoiceRelPath) {
      reject(new Error("Invalid invoice path"));
      return;
    }
    const invoiceAbsPath = resolveUploadPath(invoiceRelPath);
    archive.file(invoiceAbsPath, { name: path.basename(invoiceRelPath) });
    for (const doc of docRecords) {
      const docName = path.basename(doc.filename);
      const docRelPath =
        doc.filename.includes("/") || doc.filename.includes("\\")
          ? toRelativeUploadPath(doc.filename)
          : path.posix.join("docs", docName);
      if (!docRelPath) {
        continue;
      }
      const docPath = resolveUploadPath(docRelPath);
      archive.file(docPath, { name: `docs/${docName}` });
    }
    archive.finalize();
  });

  return { missing: [], filePath: relativePath } as const;
}

import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import pdfParse from "pdf-parse";
import { prisma, LoadConfirmationStatus } from "@truckerio/db";

const TEXT_THRESHOLD = 40;
let cachedRepoRoot: string | null = null;

function findRepoRoot(startDir: string) {
  if (cachedRepoRoot) return cachedRepoRoot;
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml")) || fs.existsSync(path.join(current, ".git"))) {
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

function getUploadDir() {
  const configured = process.env.UPLOAD_DIR;
  if (!configured) {
    return path.join(findRepoRoot(process.cwd()), "uploads");
  }
  if (path.isAbsolute(configured)) {
    return configured;
  }
  return path.resolve(findRepoRoot(process.cwd()), configured);
}

function resolveUploadPath(relPath: string) {
  const baseDir = getUploadDir();
  const cleaned = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const resolved = path.resolve(baseDir, cleaned);
  const baseResolved = path.resolve(baseDir) + path.sep;
  if (!resolved.startsWith(baseResolved)) {
    throw new Error("Invalid upload path");
  }
  return resolved;
}

function normalizeReference(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.length > 64 ? trimmed.slice(0, 64) : trimmed;
}

function parseOptionalNonNegativeInt(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) return null;
  return num as number;
}

function normalizeLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function matchFirst(text: string, regexes: RegExp[]) {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function parseCityStateZip(line: string) {
  const comma = line.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/i);
  if (comma) {
    return { city: comma[1].trim(), state: comma[2].toUpperCase(), zip: comma[3] };
  }
  const plain = line.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (plain) {
    return { city: plain[1].trim(), state: plain[2].toUpperCase(), zip: plain[3] };
  }
  return { city: "", state: "", zip: "" };
}

function extractStop(lines: string[], labels: string[], type: "PICKUP" | "DELIVERY") {
  const idx = lines.findIndex((line) => labels.some((label) => line.toLowerCase().includes(label)));
  if (idx === -1) return null;
  const labelLine = lines[idx];
  const colonIdx = labelLine.indexOf(":");
  let cursor = idx + 1;
  let name = "";
  if (colonIdx !== -1 && colonIdx < labelLine.length - 1) {
    name = labelLine.slice(colonIdx + 1).trim();
  }
  if (!name) {
    name = lines[cursor] ?? "";
    cursor += 1;
  }
  const address1 = lines[cursor] ?? "";
  cursor += 1;
  const cityStateZipLine = lines[cursor] ?? "";
  const parsed = parseCityStateZip(cityStateZipLine);
  return {
    type,
    name,
    address1,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
  };
}

function extractDraftFromText(text: string, fallbackLoadNumber: string) {
  const lines = normalizeLines(text);
  const loadNumber =
    matchFirst(text, [
      /load\s*(?:number|no\.?|#)?\s*[:#]?\s*([A-Z0-9-]{4,})/i,
      /confirmation\s*(?:number|no\.?|#)?\s*[:#]?\s*([A-Z0-9-]{4,})/i,
      /order\s*(?:number|no\.?|#)?\s*[:#]?\s*([A-Z0-9-]{4,})/i,
    ]) ?? fallbackLoadNumber;

  const shipperReferenceNumber = normalizeReference(
    matchFirst(text, [/shipper\s*(?:ref|reference|po|#)?\s*[:#]?\s*([A-Z0-9-]{3,})/i, /pickup\s*(?:ref|reference|po|#)?\s*[:#]?\s*([A-Z0-9-]{3,})/i])
  );
  const consigneeReferenceNumber = normalizeReference(
    matchFirst(text, [/consignee\s*(?:ref|reference|po|#)?\s*[:#]?\s*([A-Z0-9-]{3,})/i, /delivery\s*(?:ref|reference|po|#)?\s*[:#]?\s*([A-Z0-9-]{3,})/i])
  );
  const palletCount = parseOptionalNonNegativeInt(
    matchFirst(text, [/pallets?\s*[:#]?\s*(\d{1,4})/i, /plt\s*[:#]?\s*(\d{1,4})/i])
  );
  const weightLbs = parseOptionalNonNegativeInt(
    matchFirst(text, [/weight\s*[:#]?\s*([\d,]{2,})\s*(?:lbs|pounds)?/i, /wt\s*[:#]?\s*([\d,]{2,})/i])?.replace(/,/g, "")
  );

  const shipperStop = extractStop(lines, ["shipper", "pickup", "origin"], "PICKUP");
  const consigneeStop = extractStop(lines, ["consignee", "delivery", "receiver", "destination"], "DELIVERY");

  return {
    loadNumber,
    shipperReferenceNumber,
    consigneeReferenceNumber,
    palletCount,
    weightLbs,
    stops: [
      shipperStop ?? { type: "PICKUP", name: "", address1: "", city: "", state: "", zip: "" },
      consigneeStop ?? { type: "DELIVERY", name: "", address1: "", city: "", state: "", zip: "" },
    ],
  };
}

function isDraftReady(draft: any) {
  if (!draft?.loadNumber || String(draft.loadNumber).trim().length < 2) return false;
  if (!Array.isArray(draft.stops) || draft.stops.length < 2) return false;
  return draft.stops.every((stop) =>
    [stop.name, stop.address1, stop.city, stop.state, stop.zip].every((field) => typeof field === "string" && field.trim().length > 0)
  );
}

async function logExtractEvent(params: { orgId: string; docId: string; type: string; message: string }) {
  await prisma.loadConfirmationExtractEvent.create({
    data: {
      orgId: params.orgId,
      docId: params.docId,
      type: params.type,
      message: params.message,
    },
  });
}

async function logAuditEvent(params: { orgId: string; userId?: string | null; docId: string; action: string; summary: string; meta?: Record<string, unknown> }) {
  await prisma.auditLog.create({
    data: {
      orgId: params.orgId,
      userId: params.userId ?? null,
      action: params.action,
      entity: "LoadConfirmationDocument",
      entityId: params.docId,
      summary: params.summary,
      meta: params.meta ?? null,
    },
  });
}

export async function processLoadConfirmations() {
  const docs = await prisma.loadConfirmationDocument.findMany({
    where: { status: LoadConfirmationStatus.UPLOADED },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  for (const doc of docs) {
    const claimed = await prisma.loadConfirmationDocument.updateMany({
      where: { id: doc.id, status: LoadConfirmationStatus.UPLOADED },
      data: { status: LoadConfirmationStatus.EXTRACTING },
    });
    if (claimed.count === 0) continue;

    await logExtractEvent({ orgId: doc.orgId, docId: doc.id, type: "EXTRACT_START", message: "Extraction started" });
    await logAuditEvent({
      orgId: doc.orgId,
      docId: doc.id,
      action: "LOAD_CONFIRMATION_EXTRACT_START",
      summary: `Extraction started for ${doc.filename}`,
    });

    try {
      const filePath = resolveUploadPath(doc.storageKey);
      const buffer = await fsPromises.readFile(filePath);
      let extractedText = "";
      let scanned = false;

      if (doc.contentType.includes("pdf") || doc.filename.toLowerCase().endsWith(".pdf")) {
        const result = await pdfParse(buffer);
        extractedText = result.text || "";
        const normalized = extractedText.replace(/\s+/g, " ").trim();
        if (!normalized || normalized.length < TEXT_THRESHOLD) {
          scanned = true;
        }
      } else {
        scanned = true;
      }

      const draft = extractDraftFromText(extractedText, `LC-${doc.id.slice(-6).toUpperCase()}`);
      const ready = !scanned && isDraftReady(draft);
      const status = scanned ? LoadConfirmationStatus.NEEDS_REVIEW : ready ? LoadConfirmationStatus.READY_TO_CREATE : LoadConfirmationStatus.NEEDS_REVIEW;
      const errorMessage = scanned ? "Scanned PDF: please enter fields manually" : ready ? null : "Review required";

      await prisma.loadConfirmationDocument.update({
        where: { id: doc.id },
        data: {
          extractedJson: {
            loadNumber: draft.loadNumber,
            shipperReferenceNumber: draft.shipperReferenceNumber,
            consigneeReferenceNumber: draft.consigneeReferenceNumber,
            palletCount: draft.palletCount,
            weightLbs: draft.weightLbs,
            textLength: extractedText.length,
            scanned,
          },
          normalizedDraft: draft,
          status,
          errorMessage,
        },
      });

      await logExtractEvent({
        orgId: doc.orgId,
        docId: doc.id,
        type: status === LoadConfirmationStatus.READY_TO_CREATE ? "EXTRACT_READY" : "EXTRACT_REVIEW",
        message: scanned ? "Scanned PDF detected" : "Extraction completed",
      });
      await logAuditEvent({
        orgId: doc.orgId,
        docId: doc.id,
        action: scanned ? "LOAD_CONFIRMATION_SCANNED" : "LOAD_CONFIRMATION_EXTRACT_DONE",
        summary: scanned ? `Scanned PDF requires manual review for ${doc.filename}` : `Extraction completed for ${doc.filename}`,
      });
    } catch (error) {
      await prisma.loadConfirmationDocument.update({
        where: { id: doc.id },
        data: {
          status: LoadConfirmationStatus.FAILED,
          errorMessage: (error as Error).message || "Extraction failed",
        },
      });
      await logExtractEvent({ orgId: doc.orgId, docId: doc.id, type: "EXTRACT_FAILED", message: "Extraction failed" });
      await logAuditEvent({
        orgId: doc.orgId,
        docId: doc.id,
        action: "LOAD_CONFIRMATION_EXTRACT_FAILED",
        summary: `Extraction failed for ${doc.filename}`,
      });
    }
  }
}

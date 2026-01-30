import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import pdfParse from "pdf-parse";
import { prisma, LoadConfirmationStatus } from "@truckerio/db";

const SCANNED_TEXT_THRESHOLD = Number(process.env.LOAD_CONFIRMATION_SCANNED_TEXT_THRESHOLD_CHARS || "300");
const OCR_MAX_FILE_MB = Number(process.env.LOAD_CONFIRMATION_OCR_MAX_FILE_MB || "20");
const OCR_MAX_PAGES = Number(process.env.LOAD_CONFIRMATION_OCR_MAX_PAGES || "10");
const OCR_TIMEOUT_MS = Number(process.env.LOAD_CONFIRMATION_OCR_TIMEOUT_MS || "120000");
const OCR_LANG = process.env.LOAD_CONFIRMATION_OCR_LANG || "eng";
const OCR_INSTALL_MESSAGE =
  "OCR tools not installed. Install ocrmypdf/tesseract/poppler-utils to extract scanned PDFs.";
const LEARNING_EXAMPLE_LIMIT = Number(process.env.LOAD_CONFIRMATION_LEARNING_LIMIT || "500");
const LEARNING_MAX_BYTES = Number(process.env.LOAD_CONFIRMATION_LEARNING_MAX_BYTES || String(50 * 1024 * 1024));
const LEARNING_MIN_SIMILARITY = Number(process.env.LOAD_CONFIRMATION_LEARNING_MIN_SIMILARITY || "0.78");
let cachedRepoRoot: string | null = null;
const auditUserCache = new Map<string, string>();

type DraftStop = {
  type: "PICKUP" | "DELIVERY";
  name: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  apptStart?: string | null;
  apptEnd?: string | null;
  notes?: string | null;
};

type DraftLoad = {
  loadNumber: string;
  status: string | null;
  loadType: string | null;
  customerName: string;
  customerRef: string | null;
  externalTripId: string | null;
  truckUnit: string | null;
  trailerUnit: string | null;
  rate: number | null;
  salesRepName: string | null;
  dropName: string | null;
  miles: number | null;
  desiredInvoiceDate: string | null;
  shipperReferenceNumber: string | null;
  consigneeReferenceNumber: string | null;
  palletCount: number | null;
  weightLbs: number | null;
  stops: DraftStop[];
};

type LearningExample = {
  id: string;
  docFingerprint: string | null;
  brokerName: string | null;
  extractedText: string | null;
  extractedDraft: DraftLoad | null;
  correctedDraft: DraftLoad;
  createdAt: Date;
};

type ExtractionSynonyms = {
  loadNumber?: string[];
  status?: string[];
  loadType?: string[];
  customerName?: string[];
  customerRef?: string[];
  externalTripId?: string[];
  truckUnit?: string[];
  trailerUnit?: string[];
  rate?: string[];
  salesRepName?: string[];
  dropName?: string[];
  miles?: string[];
  desiredInvoiceDate?: string[];
  shipperReferenceNumber?: string[];
  consigneeReferenceNumber?: string[];
  palletCount?: string[];
  weightLbs?: string[];
  pickupLabels?: string[];
  deliveryLabels?: string[];
  pickupDate?: string[];
  pickupTimeStart?: string[];
  pickupTimeEnd?: string[];
  deliveryDate?: string[];
  deliveryDateEnd?: string[];
  deliveryTimeEnd?: string[];
  shipCity?: string[];
  shipState?: string[];
  consCity?: string[];
  consState?: string[];
};

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

function getTempBaseDir() {
  return path.join(findRepoRoot(process.cwd()), "apps", "worker", ".tmp", "load-confirmations");
}

async function createTempDir(docId: string) {
  const base = getTempBaseDir();
  await fsPromises.mkdir(base, { recursive: true });
  return fsPromises.mkdtemp(path.join(base, `${docId}-`));
}

async function cleanupTempDir(dirPath: string | null) {
  if (!dirPath) return;
  try {
    await fsPromises.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only.
  }
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function normalizeNumeric(value: string) {
  return value.replace(/[^\d.]/g, "");
}

function extractBrokerName(text: string) {
  const lines = normalizeLines(text);
  for (const line of lines) {
    const match = line.match(/broker\s*[:#-]?\s*(.+)$/i);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 2) return name;
    }
  }
  return null;
}

function tokenize(text: string) {
  const tokens = new Set<string>();
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  for (const token of normalized.split(/\s+/)) {
    if (token.length < 3) continue;
    tokens.add(token);
  }
  return tokens;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function extractLabelValuePairs(text: string) {
  const pairs: Array<{ label: string; value: string }> = [];
  for (const line of normalizeLines(text)) {
    const match = line.match(/^([^:]{2,40})\s*[:#-]\s*(.+)$/);
    if (!match) continue;
    const label = match[1].trim();
    const value = match[2].trim();
    if (!label || !value) continue;
    pairs.push({ label, value });
  }
  return pairs;
}

function addSynonym(map: ExtractionSynonyms, field: keyof ExtractionSynonyms, label: string) {
  const cleaned = label.trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 40) return;
  const existing = map[field] ?? [];
  if (existing.length >= 25) return;
  if (!existing.some((value) => value.toLowerCase() === cleaned.toLowerCase())) {
    existing.push(cleaned);
  }
  map[field] = existing;
}

function buildSynonymMap(examples: LearningExample[]) {
  const map: ExtractionSynonyms = {};
  for (const example of examples) {
    if (!example.extractedText || !example.correctedDraft) continue;
    const pairs = extractLabelValuePairs(example.extractedText);
    const corrected = example.correctedDraft;
    const pickupStop = corrected.stops?.[0];
    const deliveryStop = corrected.stops?.[1];
    const pickupName = pickupStop?.name ?? "";
    const deliveryName = deliveryStop?.name ?? "";
    const pickupCity = pickupStop?.city ?? "";
    const pickupState = pickupStop?.state ?? "";
    const deliveryCity = deliveryStop?.city ?? "";
    const deliveryState = deliveryStop?.state ?? "";
    const pickupDate = pickupStop?.apptStart ? pickupStop.apptStart.split("T")[0] : "";
    const pickupTimeStart = pickupStop?.apptStart ? pickupStop.apptStart.split("T")[1]?.slice(0, 5) : "";
    const pickupTimeEnd = pickupStop?.apptEnd ? pickupStop.apptEnd.split("T")[1]?.slice(0, 5) : "";
    const deliveryDate = deliveryStop?.apptStart ? deliveryStop.apptStart.split("T")[0] : "";
    const deliveryDateEnd = deliveryStop?.apptEnd ? deliveryStop.apptEnd.split("T")[0] : "";
    const deliveryTimeEnd = deliveryStop?.apptEnd ? deliveryStop.apptEnd.split("T")[1]?.slice(0, 5) : "";
    for (const pair of pairs) {
      const normalizedValue = normalizeValue(pair.value);
      if (corrected.status && normalizedValue === normalizeValue(corrected.status)) {
        addSynonym(map, "status", pair.label);
      }
      if (corrected.loadType && normalizedValue === normalizeValue(corrected.loadType)) {
        addSynonym(map, "loadType", pair.label);
      }
      if (corrected.customerName && normalizedValue === normalizeValue(corrected.customerName)) {
        addSynonym(map, "customerName", pair.label);
      }
      if (corrected.customerRef && normalizedValue === normalizeValue(corrected.customerRef)) {
        addSynonym(map, "customerRef", pair.label);
      }
      if (corrected.externalTripId && normalizedValue === normalizeValue(corrected.externalTripId)) {
        addSynonym(map, "externalTripId", pair.label);
      }
      if (corrected.truckUnit && normalizedValue === normalizeValue(corrected.truckUnit)) {
        addSynonym(map, "truckUnit", pair.label);
      }
      if (corrected.trailerUnit && normalizedValue === normalizeValue(corrected.trailerUnit)) {
        addSynonym(map, "trailerUnit", pair.label);
      }
      if (corrected.salesRepName && normalizedValue === normalizeValue(corrected.salesRepName)) {
        addSynonym(map, "salesRepName", pair.label);
      }
      if (corrected.dropName && normalizedValue === normalizeValue(corrected.dropName)) {
        addSynonym(map, "dropName", pair.label);
      }
      if (corrected.desiredInvoiceDate && normalizedValue === normalizeValue(corrected.desiredInvoiceDate)) {
        addSynonym(map, "desiredInvoiceDate", pair.label);
      }
      if (corrected.rate != null) {
        const numeric = Number(normalizeNumeric(pair.value));
        if (Number.isFinite(numeric) && Math.abs(numeric - corrected.rate) < 0.01) {
          addSynonym(map, "rate", pair.label);
        }
      }
      if (corrected.miles != null) {
        const numeric = Number(normalizeNumeric(pair.value));
        if (Number.isFinite(numeric) && Math.abs(numeric - corrected.miles) < 1) {
          addSynonym(map, "miles", pair.label);
        }
      }
      if (corrected.loadNumber && normalizedValue === normalizeValue(corrected.loadNumber)) {
        addSynonym(map, "loadNumber", pair.label);
      }
      if (corrected.shipperReferenceNumber && normalizedValue === normalizeValue(corrected.shipperReferenceNumber)) {
        addSynonym(map, "shipperReferenceNumber", pair.label);
      }
      if (corrected.consigneeReferenceNumber && normalizedValue === normalizeValue(corrected.consigneeReferenceNumber)) {
        addSynonym(map, "consigneeReferenceNumber", pair.label);
      }
      if (corrected.palletCount != null && normalizeNumeric(pair.value) === String(corrected.palletCount)) {
        addSynonym(map, "palletCount", pair.label);
      }
      if (corrected.weightLbs != null && normalizeNumeric(pair.value) === String(corrected.weightLbs)) {
        addSynonym(map, "weightLbs", pair.label);
      }
      if (pickupName && normalizedValue === normalizeValue(pickupName)) {
        addSynonym(map, "pickupLabels", pair.label);
      }
      if (deliveryName && normalizedValue === normalizeValue(deliveryName)) {
        addSynonym(map, "deliveryLabels", pair.label);
      }
      if (pickupCity && normalizedValue === normalizeValue(pickupCity)) {
        addSynonym(map, "shipCity", pair.label);
      }
      if (pickupState && normalizedValue === normalizeValue(pickupState)) {
        addSynonym(map, "shipState", pair.label);
      }
      if (deliveryCity && normalizedValue === normalizeValue(deliveryCity)) {
        addSynonym(map, "consCity", pair.label);
      }
      if (deliveryState && normalizedValue === normalizeValue(deliveryState)) {
        addSynonym(map, "consState", pair.label);
      }
      if (pickupDate && normalizedValue === normalizeValue(pickupDate)) {
        addSynonym(map, "pickupDate", pair.label);
      }
      if (pickupTimeStart && normalizedValue === normalizeValue(pickupTimeStart)) {
        addSynonym(map, "pickupTimeStart", pair.label);
      }
      if (pickupTimeEnd && normalizedValue === normalizeValue(pickupTimeEnd)) {
        addSynonym(map, "pickupTimeEnd", pair.label);
      }
      if (deliveryDate && normalizedValue === normalizeValue(deliveryDate)) {
        addSynonym(map, "deliveryDate", pair.label);
      }
      if (deliveryDateEnd && normalizedValue === normalizeValue(deliveryDateEnd)) {
        addSynonym(map, "deliveryDateEnd", pair.label);
      }
      if (deliveryTimeEnd && normalizedValue === normalizeValue(deliveryTimeEnd)) {
        addSynonym(map, "deliveryTimeEnd", pair.label);
      }
    }
  }
  return map;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegexesFromLabels(labels: string[], capturePattern: string) {
  return labels.map((label) => new RegExp(`${escapeRegex(label)}\\s*[:#-]?\\s*(${capturePattern})`, "i"));
}

function estimateConfidence(draft: DraftLoad, usedLearning: boolean) {
  let score = usedLearning ? 0.8 : 0.4;
  if (draft.loadNumber && !draft.loadNumber.startsWith("LC-")) score += 0.1;
  if (draft.customerName) score += 0.05;
  if (draft.stops?.[0]?.name) score += 0.05;
  if (draft.stops?.[1]?.name) score += 0.05;
  if (draft.stops?.[0]?.apptStart) score += 0.05;
  if (draft.stops?.[1]?.apptStart) score += 0.05;
  if (draft.shipperReferenceNumber) score += 0.05;
  if (draft.consigneeReferenceNumber) score += 0.05;
  return Math.min(0.98, score);
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {}
) {
  const timeoutMs = options.timeoutMs ?? OCR_TIMEOUT_MS;
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function commandExists(command: string, versionArgs: string[] = ["--version"]) {
  try {
    await runCommand(command, versionArgs, { timeoutMs: 5000 });
    return true;
  } catch {
    return false;
  }
}

function enforceFileSizeLimit(sizeBytes: number) {
  const maxBytes = OCR_MAX_FILE_MB * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    throw new Error(`File exceeds OCR limit of ${OCR_MAX_FILE_MB}MB`);
  }
}

function enforcePageLimit(pageCount: number) {
  if (pageCount > OCR_MAX_PAGES) {
    throw new Error(`PDF has ${pageCount} pages (max ${OCR_MAX_PAGES})`);
  }
}

async function extractPdfTextFromBuffer(buffer: Buffer) {
  const result = await pdfParse(buffer);
  return {
    text: result.text || "",
    numpages: typeof result.numpages === "number" ? result.numpages : 1,
  };
}

async function extractPdfTextFromPath(filePath: string) {
  const buffer = await fsPromises.readFile(filePath);
  return extractPdfTextFromBuffer(buffer);
}

async function ocrPdfWithOcrmypdf(inputPath: string, outputPath: string, cwd: string) {
  await runCommand(
    "ocrmypdf",
    [
      "--skip-text",
      "--deskew",
      "--rotate-pages",
      "--force-ocr",
      "--tesseract-timeout",
      String(Math.max(10, Math.floor(OCR_TIMEOUT_MS / 1000))),
      inputPath,
      outputPath,
    ],
    { cwd }
  );
}

async function ocrPdfWithTesseract(inputPath: string, tempDir: string, pageCount: number) {
  const hasPdftoppm = (await commandExists("pdftoppm", ["-v"])) || (await commandExists("pdftoppm"));
  const hasTesseract = await commandExists("tesseract");
  if (!hasPdftoppm || !hasTesseract) {
    throw new Error(OCR_INSTALL_MESSAGE);
  }
  const pageLimit = Math.min(pageCount, OCR_MAX_PAGES);
  const prefix = path.join(tempDir, "page");
  await runCommand(
    "pdftoppm",
    ["-png", "-r", "300", "-f", "1", "-l", String(pageLimit), inputPath, prefix],
    { cwd: tempDir }
  );
  const files = (await fsPromises.readdir(tempDir))
    .filter((name) => name.startsWith("page-") && name.endsWith(".png"))
    .sort();
  if (files.length === 0) {
    throw new Error("pdftoppm produced no images");
  }
  const textParts: string[] = [];
  for (const file of files) {
    const imgPath = path.join(tempDir, file);
    const { stdout } = await runCommand(
      "tesseract",
      [imgPath, "stdout", "-l", OCR_LANG],
      { cwd: tempDir }
    );
    textParts.push(stdout.trim());
  }
  return textParts.join("\n\n").trim();
}

async function ocrImageWithTesseract(filePath: string, tempDir: string) {
  const hasTesseract = await commandExists("tesseract");
  if (!hasTesseract) {
    throw new Error(OCR_INSTALL_MESSAGE);
  }
  const { stdout } = await runCommand("tesseract", [filePath, "stdout", "-l", OCR_LANG], { cwd: tempDir });
  return stdout.trim();
}

async function performOcrForDocument(params: {
  docId: string;
  filePath: string;
  isPdf: boolean;
  pageCount: number;
}) {
  let tempDir: string | null = null;
  try {
    tempDir = await createTempDir(params.docId);
    if (params.isPdf) {
      enforcePageLimit(params.pageCount);
      const inputPdf = path.join(tempDir, "input.pdf");
      const outputPdf = path.join(tempDir, "output-ocr.pdf");
      await fsPromises.copyFile(params.filePath, inputPdf);
      const hasOcrmypdf = await commandExists("ocrmypdf");
      if (hasOcrmypdf) {
        await ocrPdfWithOcrmypdf(inputPdf, outputPdf, tempDir);
        const { text } = await extractPdfTextFromPath(outputPdf);
        return { text: text.trim(), tool: "ocrmypdf" as const };
      }
      const text = await ocrPdfWithTesseract(inputPdf, tempDir, params.pageCount);
      return { text, tool: "tesseract" as const };
    }
    const text = await ocrImageWithTesseract(params.filePath, tempDir);
    return { text, tool: "tesseract" as const };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

function normalizeReference(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.length > 64 ? trimmed.slice(0, 64) : trimmed;
}

function parseOptionalNonNegativeInt(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) return null;
  return num as number;
}

function normalizeLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function labelMatches(label: string, candidates: string[]) {
  const normalized = normalizeLabel(label);
  if (!normalized) return false;
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeLabel(candidate);
    if (!normalizedCandidate) return false;
    return normalized === normalizedCandidate || normalized.includes(normalizedCandidate);
  });
}

function extractValueByLabels(
  pairs: Array<{ label: string; value: string }>,
  labels: string[],
  synonyms?: string[]
) {
  const candidates = [...labels, ...(synonyms ?? [])];
  for (const pair of pairs) {
    if (labelMatches(pair.label, candidates)) {
      return pair.value;
    }
  }
  return null;
}

type DateParts = { year: number; month: number; day: number };
type TimeParts = { hour: number; minute: number };

function parseDateParts(value: string | null) {
  if (!value) return null;
  const iso = value.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }
  const us = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (us) {
    const year = Number(us[3].length === 2 ? `20${us[3]}` : us[3]);
    return { year, month: Number(us[1]), day: Number(us[2]) };
  }
  return null;
}

function parseTimeParts(value: string | null) {
  if (!value) return null;
  const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour, minute };
}

function formatDateParts(parts: DateParts | null) {
  if (!parts) return null;
  const yyyy = String(parts.year).padStart(4, "0");
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTimeParts(parts: TimeParts | null) {
  if (!parts) return null;
  const hh = String(parts.hour).padStart(2, "0");
  const mm = String(parts.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseDateRange(value: string | null) {
  if (!value) return { start: null, end: null };
  const parts = value.split(/\s*(?:-|\sto\s)\s*/i);
  const start = parseDateParts(parts[0] ?? null);
  const end = parseDateParts(parts[1] ?? null);
  return { start, end };
}

function parseTimeRange(value: string | null) {
  if (!value) return { start: null, end: null };
  const parts = value.split(/\s*(?:-|\sto\s)\s*/i);
  const start = parseTimeParts(parts[0] ?? null);
  const end = parseTimeParts(parts[1] ?? null);
  return { start, end };
}

function combineDateTime(date: string | null, time: string | null) {
  if (!date) return null;
  const hhmm = time ?? "00:00";
  return `${date}T${hhmm}`;
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
  const idx = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return labels.some((label) => lower.includes(label.toLowerCase()));
  });
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

function extractDraftFromText(text: string, fallbackLoadNumber: string, synonyms: ExtractionSynonyms = {}) {
  const lines = normalizeLines(text);
  const pairs = extractLabelValuePairs(text);
  const loadNumberRegexes = [
    /load\s*(?:number|no\.?|#)?\s*[:#]?\s*([A-Z0-9-]{4,})/i,
    /confirmation\s*(?:number|no\.?|#)?\s*[:#]?\s*([A-Z0-9-]{4,})/i,
    /order\s*(?:number|no\.?|#)?\s*[:#]?\s*([A-Z0-9-]{4,})/i,
    ...buildRegexesFromLabels(synonyms.loadNumber ?? [], "[A-Z0-9-]{4,}"),
  ];
  const loadNumber = matchFirst(text, loadNumberRegexes) ?? fallbackLoadNumber;

  const status =
    extractValueByLabels(pairs, ["status", "load status"], synonyms.status) ??
    null;
  const loadType =
    extractValueByLabels(pairs, ["type", "equipment", "equip", "trailer type"], synonyms.loadType) ??
    null;
  const customerName =
    extractValueByLabels(pairs, ["customer", "bill to", "billto", "account"], synonyms.customerName) ??
    "";
  const customerRef =
    extractValueByLabels(pairs, ["cust ref", "customer ref", "po", "reference", "ref"], synonyms.customerRef) ??
    null;
  const externalTripId =
    extractValueByLabels(pairs, ["trip", "trip id", "trip#"], synonyms.externalTripId) ??
    null;
  const truckUnit =
    extractValueByLabels(pairs, ["unit", "truck", "tractor"], synonyms.truckUnit) ??
    null;
  const trailerUnit =
    extractValueByLabels(pairs, ["trailer", "trl"], synonyms.trailerUnit) ??
    null;
  const salesRepName =
    extractValueByLabels(pairs, ["sales", "sales rep", "salesperson"], synonyms.salesRepName) ??
    null;
  const dropName =
    extractValueByLabels(pairs, ["drop name", "drop"], synonyms.dropName) ??
    null;
  const rateValue =
    extractValueByLabels(pairs, ["total rev", "total revenue", "rate", "linehaul", "amount"], synonyms.rate) ??
    null;
  const rate = rateValue ? Number(normalizeNumeric(rateValue)) : null;
  const milesValue = extractValueByLabels(pairs, ["miles", "mi"], synonyms.miles);
  const miles = milesValue ? Number(normalizeNumeric(milesValue)) : null;
  const invDateValue =
    extractValueByLabels(pairs, ["inv date", "invoice date"], synonyms.desiredInvoiceDate) ??
    null;
  const invDate = formatDateParts(parseDateParts(invDateValue));

  const shipperName =
    extractValueByLabels(pairs, ["shipper", "pickup", "origin", "ship from"], synonyms.pickupLabels) ??
    "";
  const shipCity =
    extractValueByLabels(pairs, ["ship city", "origin city", "pickup city"], synonyms.shipCity) ??
    "";
  const shipState =
    extractValueByLabels(pairs, ["ship st", "ship state", "origin state", "pickup state"], synonyms.shipState) ??
    "";
  const consigneeName =
    extractValueByLabels(pairs, ["consignee", "delivery", "receiver", "destination", "ship to"], synonyms.deliveryLabels) ??
    "";
  const consCity =
    extractValueByLabels(pairs, ["cons city", "dest city", "delivery city"], synonyms.consCity) ??
    "";
  const consState =
    extractValueByLabels(pairs, ["cons st", "dest state", "delivery state"], synonyms.consState) ??
    "";

  const pickupDateValue =
    extractValueByLabels(pairs, ["pu date", "pickup date", "ship date", "origin date"], synonyms.pickupDate) ??
    null;
  const pickupTimeValue =
    extractValueByLabels(pairs, ["pu time f", "pickup time f", "pu time", "pickup time"], synonyms.pickupTimeStart) ??
    null;
  const pickupTimeEndValue =
    extractValueByLabels(pairs, ["pu time t", "pickup time t"], synonyms.pickupTimeEnd) ??
    null;
  const deliveryDateValue =
    extractValueByLabels(pairs, ["del date f", "del date", "delivery date"], synonyms.deliveryDate) ??
    null;
  const deliveryDateEndValue =
    extractValueByLabels(pairs, ["del date t"], synonyms.deliveryDateEnd) ??
    null;
  const deliveryTimeEndValue =
    extractValueByLabels(pairs, ["del time t", "delivery time", "del time"], synonyms.deliveryTimeEnd) ??
    null;

  const pickupDateParts = parseDateParts(pickupDateValue);
  const pickupDate = formatDateParts(pickupDateParts);
  const pickupTimeRange = parseTimeRange(pickupTimeValue);
  const pickupTimeStart = formatTimeParts(pickupTimeRange.start ?? parseTimeParts(pickupTimeValue));
  const pickupTimeEnd = formatTimeParts(
    parseTimeParts(pickupTimeEndValue) ?? pickupTimeRange.end ?? pickupTimeRange.start
  );

  const deliveryDateParts = parseDateParts(deliveryDateValue);
  const deliveryDateEndParts = parseDateParts(deliveryDateEndValue);
  const deliveryDate = formatDateParts(deliveryDateParts);
  const deliveryDateEnd = formatDateParts(deliveryDateEndParts ?? deliveryDateParts);
  const deliveryTimeEnd = formatTimeParts(parseTimeParts(deliveryTimeEndValue));

  const shipperStop = extractStop(
    lines,
    ["shipper", "pickup", "origin", ...(synonyms.pickupLabels ?? [])],
    "PICKUP"
  );
  const consigneeStop = extractStop(
    lines,
    ["consignee", "delivery", "receiver", "destination", ...(synonyms.deliveryLabels ?? [])],
    "DELIVERY"
  );

  const pickupStop: DraftStop = {
    type: "PICKUP",
    name: shipperName || shipperStop?.name || "",
    address1: shipperStop?.address1 ?? "",
    city: shipCity || shipperStop?.city || "",
    state: shipState || shipperStop?.state || "",
    zip: shipperStop?.zip ?? "",
    apptStart: combineDateTime(pickupDate, pickupTimeStart),
    apptEnd: combineDateTime(pickupDate, pickupTimeEnd ?? pickupTimeStart),
  };
  const deliveryStop: DraftStop = {
    type: "DELIVERY",
    name: consigneeName || consigneeStop?.name || "",
    address1: consigneeStop?.address1 ?? "",
    city: consCity || consigneeStop?.city || "",
    state: consState || consigneeStop?.state || "",
    zip: consigneeStop?.zip ?? "",
    apptStart: combineDateTime(deliveryDate, null),
    apptEnd: deliveryTimeEnd ? combineDateTime(deliveryDateEnd, deliveryTimeEnd) : null,
  };

  const shipperReferenceNumber = normalizeReference(
    matchFirst(text, [
      /shipper\s*(?:ref|reference|po|#)?\s*[:#]?\s*([A-Z0-9-]{3,})/i,
      /pickup\s*(?:ref|reference|po|#)?\s*[:#]?\s*([A-Z0-9-]{3,})/i,
      ...buildRegexesFromLabels(synonyms.shipperReferenceNumber ?? [], "[A-Z0-9-]{3,}"),
    ])
  );
  const consigneeReferenceNumber = normalizeReference(
    matchFirst(text, [
      /consignee\s*(?:ref|reference|po|#)?\s*[:#]?\s*([A-Z0-9-]{3,})/i,
      /delivery\s*(?:ref|reference|po|#)?\s*[:#]?\s*([A-Z0-9-]{3,})/i,
      ...buildRegexesFromLabels(synonyms.consigneeReferenceNumber ?? [], "[A-Z0-9-]{3,}"),
    ])
  );
  const palletCount = parseOptionalNonNegativeInt(
    matchFirst(text, [
      /pallets?\s*[:#]?\s*(\d{1,4})/i,
      /plt\s*[:#]?\s*(\d{1,4})/i,
      ...buildRegexesFromLabels(synonyms.palletCount ?? [], "\\d{1,4}"),
    ])
  );
  const weightLbs = parseOptionalNonNegativeInt(
    matchFirst(text, [
      /weight\s*[:#]?\s*([\d,]{2,})\s*(?:lbs|pounds)?/i,
      /wt\s*[:#]?\s*([\d,]{2,})/i,
      ...buildRegexesFromLabels(synonyms.weightLbs ?? [], "[\\d,]{2,}"),
    ])?.replace(/,/g, "")
  );

  return {
    loadNumber,
    status,
    loadType,
    customerName,
    customerRef,
    externalTripId,
    truckUnit,
    trailerUnit,
    rate: Number.isFinite(rate ?? NaN) ? rate : null,
    salesRepName,
    dropName,
    miles: Number.isFinite(miles ?? NaN) ? miles : null,
    desiredInvoiceDate: invDate,
    shipperReferenceNumber,
    consigneeReferenceNumber,
    palletCount,
    weightLbs,
    stops: [pickupStop, deliveryStop],
  };
}

function isDraftReady(draft: any) {
  if (!draft?.customerName || String(draft.customerName).trim().length < 2) return false;
  if (!Array.isArray(draft.stops) || draft.stops.length < 2) return false;
  const hasPickupDate = draft.stops.some((stop: any) => stop.type === "PICKUP" && stop.apptStart);
  const hasDeliveryDate = draft.stops.some((stop: any) => stop.type === "DELIVERY" && stop.apptStart);
  if (!hasPickupDate || !hasDeliveryDate) return false;
  return draft.stops.every((stop: any) =>
    [stop.name, stop.city, stop.state].every(
      (field) => typeof field === "string" && field.trim().length > 0
    )
  );
}

async function getLearningExamples(orgId: string) {
  return prisma.loadConfirmationLearningExample.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: LEARNING_EXAMPLE_LIMIT,
  }) as Promise<LearningExample[]>;
}

function findTemplateMatch(params: {
  examples: LearningExample[];
  docFingerprint: string | null;
  brokerName: string | null;
  extractedText: string;
}) {
  if (params.docFingerprint) {
    const match = params.examples.find((example) => example.docFingerprint === params.docFingerprint);
    if (match) {
      return { example: match, reason: "fingerprint", similarity: 1 };
    }
  }
  if (params.brokerName) {
    const tokens = tokenize(params.extractedText);
    let best: { example: LearningExample; similarity: number } | null = null;
    for (const example of params.examples) {
      if (!example.brokerName || example.brokerName.toLowerCase() !== params.brokerName.toLowerCase()) continue;
      if (!example.extractedText) continue;
      const similarity = jaccardSimilarity(tokens, tokenize(example.extractedText));
      if (similarity < LEARNING_MIN_SIMILARITY) continue;
      if (!best || similarity > best.similarity) {
        best = { example, similarity };
      }
    }
    if (best) {
      return { example: best.example, reason: "broker", similarity: best.similarity };
    }
  }
  return null;
}

function applyLearning(params: {
  extractedText: string;
  fallbackLoadNumber: string;
  docFingerprint: string | null;
  brokerName: string | null;
  examples: LearningExample[];
}) {
  const templateMatch = findTemplateMatch({
    examples: params.examples,
    docFingerprint: params.docFingerprint,
    brokerName: params.brokerName,
    extractedText: params.extractedText,
  });
  if (templateMatch?.example?.correctedDraft) {
    const draft = templateMatch.example.correctedDraft;
    return {
      draft,
      source: "learning-template",
      confidence: {
        score: estimateConfidence(draft, true),
        reviewRequired: true,
        flags: [
          templateMatch.reason === "fingerprint" ? "Template matched (fingerprint)" : "Template matched (broker)",
        ],
      },
      learning: {
        matched: true,
        reason: templateMatch.reason,
        similarity: templateMatch.similarity,
      },
      synonymsUsed: false,
    };
  }

  const synonyms = buildSynonymMap(params.examples);
  const draft = extractDraftFromText(params.extractedText, params.fallbackLoadNumber, synonyms);
  const synonymsUsed = Object.values(synonyms).some((values) => (values ?? []).length > 0);
  return {
    draft,
    source: "parser",
    confidence: {
      score: estimateConfidence(draft, false),
      reviewRequired: true,
      flags: synonymsUsed ? ["Synonyms applied"] : ["Parser only"],
    },
    learning: {
      matched: false,
    },
    synonymsUsed,
  };
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

async function resolveAuditUserId(orgId: string, preferredUserId?: string | null) {
  if (preferredUserId) return preferredUserId;
  const cached = auditUserCache.get(orgId);
  if (cached) return cached;
  const user = await prisma.user.findFirst({
    where: { orgId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!user) {
    throw new Error("No active user available for audit logging");
  }
  auditUserCache.set(orgId, user.id);
  return user.id;
}

async function logAuditEvent(params: {
  orgId: string;
  userId?: string | null;
  docId: string;
  action: string;
  summary: string;
  meta?: Record<string, unknown>;
}) {
  const auditUserId = await resolveAuditUserId(params.orgId, params.userId);
  await prisma.auditLog.create({
    data: {
      orgId: params.orgId,
      userId: auditUserId,
      action: params.action,
      entity: "LoadConfirmationDocument",
      entityId: params.docId,
      summary: params.summary,
      meta: params.meta ? (params.meta as any) : undefined,
    },
  });
}

export async function processLoadConfirmations() {
  const staleMinutes = Number(process.env.LOAD_CONFIRMATION_EXTRACT_TIMEOUT_MIN || "5");
  const staleCutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
  const docs = await prisma.loadConfirmationDocument.findMany({
    where: {
      OR: [
        { status: LoadConfirmationStatus.UPLOADED },
        { status: LoadConfirmationStatus.EXTRACTING, updatedAt: { lt: staleCutoff } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  for (const doc of docs) {
    const claimed = await prisma.loadConfirmationDocument.updateMany({
      where: {
        id: doc.id,
        OR: [
          { status: LoadConfirmationStatus.UPLOADED },
          { status: LoadConfirmationStatus.EXTRACTING, updatedAt: { lt: staleCutoff } },
        ],
      },
      data: { status: LoadConfirmationStatus.EXTRACTING },
    });
    if (claimed.count === 0) continue;

    if (doc.status === LoadConfirmationStatus.EXTRACTING) {
      await logExtractEvent({
        orgId: doc.orgId,
        docId: doc.id,
        type: "EXTRACT_RETRY",
        message: `Extraction retry after ${staleMinutes}m`,
      });
      await logAuditEvent({
        orgId: doc.orgId,
        userId: doc.uploadedByUserId,
        docId: doc.id,
        action: "LOAD_CONFIRMATION_EXTRACT_RETRY",
        summary: `Extraction retry for ${doc.filename}`,
      });
    }

    await logExtractEvent({ orgId: doc.orgId, docId: doc.id, type: "EXTRACT_START", message: "Extraction started" });
    await logAuditEvent({
      orgId: doc.orgId,
      userId: doc.uploadedByUserId,
      docId: doc.id,
      action: "LOAD_CONFIRMATION_EXTRACT_START",
      summary: `Extraction started for ${doc.filename}`,
    });

    try {
      const filePath = resolveUploadPath(doc.storageKey);
      const buffer = await fsPromises.readFile(filePath);
      enforceFileSizeLimit(doc.sizeBytes ?? buffer.length);
      const isPdf = doc.contentType.includes("pdf") || doc.filename.toLowerCase().endsWith(".pdf");
      let extractedText = "";
      let scanned = !isPdf;
      let pageCount = 1;
      let ocrUsed = false;
      let ocrTool: string | null = null;
      let ocrError: string | null = null;

      if (isPdf) {
        const embedded = await extractPdfTextFromBuffer(buffer);
        extractedText = embedded.text;
        pageCount = embedded.numpages;
        enforcePageLimit(pageCount);
        const normalized = normalizeWhitespace(extractedText);
        scanned = !normalized || normalized.length < SCANNED_TEXT_THRESHOLD;
      }

      if (scanned) {
        const existingJson =
          doc.extractedJson && typeof doc.extractedJson === "object" && !Array.isArray(doc.extractedJson)
            ? (doc.extractedJson as Record<string, unknown>)
            : {};
        await prisma.loadConfirmationDocument.updateMany({
          where: { id: doc.id, orgId: doc.orgId },
          data: {
            errorMessage: "Scanned PDF detected — running OCR…",
            extractedJson: {
              ...existingJson,
              scanned: true,
              ocrPending: true,
            },
          },
        });
        await logExtractEvent({
          orgId: doc.orgId,
          docId: doc.id,
          type: "EXTRACT_OCR_START",
          message: "Scanned document detected; running OCR",
        });
        await logAuditEvent({
          orgId: doc.orgId,
          userId: doc.uploadedByUserId,
          docId: doc.id,
          action: "LOAD_CONFIRMATION_OCR_START",
          summary: `Running OCR for ${doc.filename}`,
        });

        try {
          const ocrResult = await performOcrForDocument({
            docId: doc.id,
            filePath,
            isPdf,
            pageCount,
          });
          const normalizedOcr = normalizeWhitespace(ocrResult.text);
          if (normalizedOcr) {
            extractedText = ocrResult.text;
            ocrUsed = true;
            ocrTool = ocrResult.tool;
          } else {
            ocrError = "OCR completed but produced no text. Please review manually.";
          }
          await logExtractEvent({
            orgId: doc.orgId,
            docId: doc.id,
            type: "EXTRACT_OCR_DONE",
            message: ocrUsed ? `OCR completed using ${ocrTool}` : "OCR completed with no text",
          });
          await logAuditEvent({
            orgId: doc.orgId,
            userId: doc.uploadedByUserId,
            docId: doc.id,
            action: "LOAD_CONFIRMATION_OCR_DONE",
            summary: ocrUsed ? `OCR completed using ${ocrTool}` : "OCR completed without text",
          });
        } catch (error) {
          ocrError = error instanceof Error ? error.message : "OCR failed";
          await logExtractEvent({
            orgId: doc.orgId,
            docId: doc.id,
            type: "EXTRACT_OCR_FAILED",
            message: ocrError,
          });
          await logAuditEvent({
            orgId: doc.orgId,
            userId: doc.uploadedByUserId,
            docId: doc.id,
            action: "LOAD_CONFIRMATION_OCR_FAILED",
            summary: ocrError,
          });
        }
      }

      const brokerName = extractedText ? extractBrokerName(extractedText) : null;
      const examples = extractedText ? await getLearningExamples(doc.orgId) : [];
      const learningResult = extractedText
        ? applyLearning({
            extractedText,
            fallbackLoadNumber: `LC-${doc.id.slice(-6).toUpperCase()}`,
            docFingerprint: doc.sha256 ?? null,
            brokerName,
            examples,
          })
        : {
            draft: extractDraftFromText(extractedText, `LC-${doc.id.slice(-6).toUpperCase()}`),
            source: "parser",
            confidence: { score: 0.1, reviewRequired: true, flags: ["No text extracted"] },
            learning: { matched: false },
            synonymsUsed: false,
          };

      const draft = learningResult.draft;
      const ready = isDraftReady(draft);
      const status = ready ? LoadConfirmationStatus.READY_TO_CREATE : LoadConfirmationStatus.NEEDS_REVIEW;
      const errorMessage = ocrError ? ocrError : ready ? null : "Review required";

      await prisma.loadConfirmationDocument.update({
        where: { id: doc.id },
        data: {
          extractedJson: {
            loadNumber: draft.loadNumber,
            status: draft.status,
            loadType: draft.loadType,
            customerName: draft.customerName,
            customerRef: draft.customerRef,
            externalTripId: draft.externalTripId,
            truckUnit: draft.truckUnit,
            trailerUnit: draft.trailerUnit,
            rate: draft.rate,
            salesRepName: draft.salesRepName,
            dropName: draft.dropName,
            miles: draft.miles,
            desiredInvoiceDate: draft.desiredInvoiceDate,
            shipperReferenceNumber: draft.shipperReferenceNumber,
            consigneeReferenceNumber: draft.consigneeReferenceNumber,
            palletCount: draft.palletCount,
            weightLbs: draft.weightLbs,
            textLength: extractedText.length,
            scanned,
            pageCount,
            ocrUsed,
            ocrTool: ocrTool ?? undefined,
            ocrError: ocrError ?? undefined,
            ocrPending: false,
            brokerName: brokerName ?? undefined,
            confidence: learningResult.confidence,
            learning: learningResult.learning,
          },
          extractedText,
          extractedDraft: draft,
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
        userId: doc.uploadedByUserId,
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
        userId: doc.uploadedByUserId,
        docId: doc.id,
        action: "LOAD_CONFIRMATION_EXTRACT_FAILED",
        summary: `Extraction failed for ${doc.filename}`,
      });
    }
  }
}

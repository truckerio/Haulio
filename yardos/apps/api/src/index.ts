import express from "express";
import cors from "cors";
import { z } from "zod";
import crypto from "crypto";
import multer from "multer";
import fs from "fs";
import path from "path";
import type {
  ContextResponse,
  EventsResponse,
  Load,
  LoadImportMode,
  LoadImportResponse,
  PlanApplyRequest,
  PlanApplyResponse,
  PlanPreviewRequest,
  PlanPreviewResponse,
  PlanRejectRequest,
  PlanRejectResponse,
  SuggestedPlansRequest,
  SuggestedPlansResponse,
  TrailerSpec,
  Violation,
} from "@yardos/contracts";
import {
  DEFAULT_TRAILER_SPEC,
  buildSuggestedPlans,
  createDeterministicPlacements,
  normalizeTrailerSpec,
  summarizePlan,
} from "@yardos/planning-core";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});

type TrailerRow = { id: string; unit: string; type: string; status: string };
type EventRow = {
  id: string;
  createdAt: string;
  type: string;
  loadId?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
};
type DbState = {
  orgId: string;
  trailerSpecDefaults: TrailerSpec;
  loads: Load[];
  trailers: TrailerRow[];
  events: EventRow[];
};
const constraintValues = [
  "NO_MIX",
  "NO_SPLIT",
  "DIRECT_NO_TOUCH",
  "TEMP_CONTROLLED",
  "HAZMAT",
  "STACK_LIMITED",
  "UNKNOWN",
] as const;

function buildDefaultDb(): DbState {
  return {
    orgId: "acme-logistics",
    trailerSpecDefaults: DEFAULT_TRAILER_SPEC,
    loads: [
      {
        id: "L18236",
        loadNumber: "L18236",
        pallets: 16,
        weightLbs: 21000,
        cubeFt: 780,
        stopWindow: "2026-02-23T08:00:00.000Z..2026-02-23T11:00:00.000Z",
        lane: "East Hub -> Dallas, TX",
        constraints: ["NO_SPLIT"],
        destinationCode: "DFW",
        status: "PLANNED",
        trailerId: null,
        trailerUnit: null,
      },
      {
        id: "L17491",
        loadNumber: "L17491",
        pallets: 12,
        weightLbs: 17500,
        cubeFt: 620,
        stopWindow: "2026-02-23T09:00:00.000Z..2026-02-23T14:00:00.000Z",
        lane: "East Hub -> Austin, TX",
        constraints: ["NO_MIX"],
        destinationCode: "AUS",
        status: "PLANNED",
        trailerId: null,
        trailerUnit: null,
      },
      {
        id: "L19025",
        loadNumber: "L19025",
        pallets: 20,
        weightLbs: 24500,
        cubeFt: 900,
        stopWindow: "2026-02-24T08:00:00.000Z..2026-02-24T12:00:00.000Z",
        lane: "East Hub -> Houston, TX",
        constraints: ["DIRECT_NO_TOUCH"],
        destinationCode: "HOU",
        status: "PLANNED",
        trailerId: null,
        trailerUnit: null,
      },
      {
        id: "L17765",
        loadNumber: "L17765",
        pallets: 8,
        weightLbs: 4000,
        cubeFt: 300,
        stopWindow: "2026-02-23T07:00:00.000Z..2026-02-23T10:00:00.000Z",
        lane: "East Hub -> Waco, TX",
        constraints: [],
        destinationCode: "ACT",
        status: "PLANNED",
        trailerId: null,
        trailerUnit: null,
      },
      {
        id: "L18440",
        loadNumber: "L18440",
        pallets: 10,
        weightLbs: 12000,
        cubeFt: 500,
        stopWindow: "2026-02-24T10:00:00.000Z..2026-02-24T16:00:00.000Z",
        lane: "East Hub -> San Antonio, TX",
        constraints: [],
        destinationCode: "SAT",
        status: "PLANNED",
        trailerId: null,
        trailerUnit: null,
      },
    ],
    trailers: [
      { id: "TR-5301", unit: "53V-01", type: "53 VAN", status: "AVAILABLE" },
      { id: "TR-5302", unit: "53V-02", type: "53 VAN", status: "AVAILABLE" },
      { id: "TR-RFR1", unit: "RFR-01", type: "REEFER", status: "AVAILABLE" },
    ],
    events: [],
  };
}

const DATA_FILE = process.env.YARDOS_DATA_FILE || path.resolve(process.cwd(), "data", "yardos-db.json");
let db: DbState = buildDefaultDb();

const loadSchema = z.object({
  id: z.string().min(1),
  loadNumber: z.string().nullable().optional(),
  pallets: z.number().int().nonnegative(),
  weightLbs: z.number().nonnegative(),
  cubeFt: z.number().nullable().optional(),
  stopWindow: z.string().nullable().optional(),
  lane: z.string().nullable().optional(),
  constraints: z.array(z.enum(constraintValues)),
  destinationCode: z.string().nullable().optional(),
  trailerId: z.string().nullable().optional(),
  trailerUnit: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

const placementSchema = z.object({
  loadId: z.string().min(1),
  palletIndex: z.number().int().nonnegative(),
  slotIndex: z.number().int().nonnegative(),
  laneIndex: z.number().int().nonnegative(),
  dims: z
    .object({
      x: z.number().positive(),
      y: z.number().positive(),
      z: z.number().positive(),
    })
    .optional(),
  dimsLabel: z.string().optional(),
  weightLbs: z.number().nonnegative(),
  sequenceIndex: z.number().int().optional(),
  destinationCode: z.string().nullable().optional(),
  stopWindow: z.string().nullable().optional(),
});

const violationSchema = z.object({
  loadId: z.string().nullable().optional(),
  palletIndices: z.array(z.number().int().nonnegative()).optional(),
  severity: z.enum(["low", "warning", "high", "critical"]),
  reason: z.string().min(1),
  suggestedFix: z.string().optional(),
  type: z.string().min(1),
});

const trailerSpecSchema = z.object({
  trailerId: z.string().optional(),
  trailerUnit: z.string().optional(),
  trailerType: z.string().optional(),
  interiorLengthM: z.number().positive().optional(),
  interiorWidthM: z.number().positive().optional(),
  interiorHeightM: z.number().positive().optional(),
  laneCount: z.number().int().positive().optional(),
  slotCount: z.number().int().positive().optional(),
  legalWeightLbs: z.number().positive().optional(),
  driveAxleX: z.number().optional(),
  trailerAxleX: z.number().optional(),
});

const previewSchema = z.object({
  planId: z.string().optional(),
  trailerId: z.union([z.string().min(1), z.literal(""), z.null()]).optional(),
  trailerSpec: trailerSpecSchema.optional(),
  loads: z.array(loadSchema),
  placements: z.array(placementSchema).optional(),
  violations: z.array(violationSchema).optional(),
  source: z.string().optional(),
});

const applySchema = z.object({
  planId: z.string().min(1),
  trailerId: z.union([z.string().min(1), z.literal(""), z.null()]).optional(),
  trailerSpec: trailerSpecSchema.optional(),
  loads: z.array(loadSchema),
  placements: z.array(placementSchema),
  violations: z.array(violationSchema).optional(),
  source: z.string().optional(),
  note: z.string().max(800).optional(),
});

const rejectSchema = z.object({
  planId: z.string().min(1),
  reason: z.string().min(2),
  source: z.string().optional(),
  loadIds: z.array(z.string().min(1)).optional(),
});

const suggestSchema = z.object({
  loadIds: z.array(z.string().min(1)).optional(),
  trailerId: z.string().nullable().optional(),
  trailerSpec: trailerSpecSchema.optional(),
});

const eventRowSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  type: z.string().min(1),
  loadId: z.string().nullable().optional(),
  message: z.string().min(1),
  meta: z.record(z.unknown()).nullable().optional(),
});

const trailerRowSchema = z.object({
  id: z.string().min(1),
  unit: z.string().min(1),
  type: z.string().min(1),
  status: z.string().min(1),
});

const dbStateSchema = z.object({
  orgId: z.string().min(1),
  trailerSpecDefaults: trailerSpecSchema.transform((value) => normalizeTrailerSpec(value)),
  loads: z.array(loadSchema),
  trailers: z.array(trailerRowSchema),
  events: z.array(eventRowSchema),
});

function persistDb() {
  const dir = path.dirname(DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

function loadDbFromDisk(): DbState {
  const fallback = buildDefaultDb();
  try {
    const dir = path.dirname(DATA_FILE);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(fallback, null, 2), "utf8");
      return fallback;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsedJson = JSON.parse(raw);
    const parsed = dbStateSchema.safeParse(parsedJson);
    if (!parsed.success) return fallback;
    return {
      orgId: parsed.data.orgId,
      trailerSpecDefaults: normalizeTrailerSpec(parsed.data.trailerSpecDefaults),
      loads: parsed.data.loads,
      trailers: parsed.data.trailers,
      events: parsed.data.events,
    };
  } catch {
    return fallback;
  }
}

db = loadDbFromDisk();

function nowIso() {
  return new Date().toISOString();
}

function loadSelection(loadIds?: string[]) {
  const idSet = new Set((loadIds ?? []).map((id) => id.trim()).filter(Boolean));
  if (idSet.size === 0) return [...db.loads];
  return db.loads.filter((load) => idSet.has(load.id));
}

function parseBooleanFlag(raw?: string) {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(value)) return true;
  if (["0", "false", "no", "n"].includes(value)) return false;
  return null;
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function parseCsvRecords(text: string): Array<Record<string, string>> {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];
  const headers = parseCsvRow(lines[0]).map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  const rows: Array<Record<string, string>> = [];

  for (let row = 1; row < lines.length; row += 1) {
    const values = parseCsvRow(lines[row]);
    const record: Record<string, string> = {};
    for (let col = 0; col < headers.length; col += 1) {
      const key = headers[col] || `col${col + 1}`;
      record[key] = (values[col] ?? "").trim();
    }
    rows.push(record);
  }

  return rows;
}

function pick(record: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const value = record[normalized];
    if (value && value.trim().length > 0) return value.trim();
  }
  return "";
}

function parseNumberValue(value: string, fallback = 0) {
  if (!value) return fallback;
  const parsed = Number(value.replace(/,/g, ""));
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function parseConstraints(raw: string): Load["constraints"] {
  if (!raw) return [];
  const allowed = new Set<Load["constraints"][number]>(constraintValues);
  return raw
    .split(/[|,;]/g)
    .map((value) => value.trim().toUpperCase().replace(/[^A-Z_]/g, ""))
    .filter(Boolean)
    .map((value) => (allowed.has(value as Load["constraints"][number]) ? (value as Load["constraints"][number]) : "UNKNOWN"));
}

function normalizeStatus(raw: string) {
  const value = raw.trim().toUpperCase();
  if (!value) return "PLANNED";
  return value;
}

function parseLoadRows(records: Array<Record<string, string>>): { loads: Load[]; errors: Array<{ row: number; message: string }> } {
  const loads: Load[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  records.forEach((record, idx) => {
    const row = idx + 2;
    const fallbackNumber = pick(record, ["loadnumber", "loadid", "id"]);
    const id = pick(record, ["id", "loadid"]) || fallbackNumber || `L${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const pallets = Math.max(0, Math.floor(parseNumberValue(pick(record, ["pallets", "palletcount"]), 0)));
    const weightLbs = Math.max(0, parseNumberValue(pick(record, ["weightlbs", "weight", "weightlb"]), 0));
    const cubeFt = parseNumberValue(pick(record, ["cubeft", "cube", "volumeft3"]), 0);

    if (!id) {
      errors.push({ row, message: "Missing load id." });
      return;
    }
    if (pallets <= 0) {
      errors.push({ row, message: `Load ${id} has invalid pallets value.` });
      return;
    }
    if (weightLbs <= 0) {
      errors.push({ row, message: `Load ${id} has invalid weight value.` });
      return;
    }

    const candidate: Load = {
      id,
      loadNumber: pick(record, ["loadnumber", "loadid", "id"]) || id,
      pallets,
      weightLbs,
      cubeFt: cubeFt > 0 ? cubeFt : null,
      stopWindow: pick(record, ["stopwindow", "deliverywindow", "window"]) || null,
      lane: pick(record, ["lane", "corridor", "route"]) || null,
      constraints: parseConstraints(pick(record, ["constraints", "rules"])),
      destinationCode: pick(record, ["destinationcode", "destination", "dest"]) || null,
      trailerId: pick(record, ["trailerid"]) || null,
      trailerUnit: pick(record, ["trailerunit"]) || null,
      status: normalizeStatus(pick(record, ["status"])),
    };

    const parsed = loadSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ row, message: `Load ${id} failed validation.` });
      return;
    }
    loads.push(parsed.data);
  });

  return { loads, errors };
}

function parseFileToLoads(fileName: string, buffer: Buffer): { loads: Load[]; errors: Array<{ row: number; message: string }> } {
  const text = buffer.toString("utf8");
  if (fileName.toLowerCase().endsWith(".json")) {
    try {
      const payload = JSON.parse(text) as unknown;
      const sourceArray = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object" && Array.isArray((payload as { loads?: unknown[] }).loads)
          ? (payload as { loads: unknown[] }).loads
          : [];

      const loads: Load[] = [];
      const errors: Array<{ row: number; message: string }> = [];
      sourceArray.forEach((row, idx) => {
        const parsed = loadSchema.safeParse(row);
        if (!parsed.success) {
          errors.push({ row: idx + 1, message: "Invalid JSON load object." });
          return;
        }
        loads.push(parsed.data);
      });
      return { loads, errors };
    } catch {
      return { loads: [], errors: [{ row: 1, message: "Invalid JSON file." }] };
    }
  }

  const records = parseCsvRecords(text);
  return parseLoadRows(records);
}

function applyImport(params: { loads: Load[]; mode: LoadImportMode }) {
  let imported = 0;
  let updated = 0;

  if (params.mode === "replace") {
    db.loads = [];
  }

  for (const load of params.loads) {
    const idx = db.loads.findIndex((row) => row.id === load.id);
    if (idx >= 0) {
      if (params.mode === "append") continue;
      db.loads[idx] = { ...db.loads[idx], ...load };
      updated += 1;
      continue;
    }
    db.loads.push(load);
    imported += 1;
  }

  db.loads.sort((a, b) => (a.loadNumber ?? a.id).localeCompare(b.loadNumber ?? b.id));
  return { imported, updated };
}

function enqueueEvent(type: string, message: string, payload?: { loadId?: string | null; meta?: Record<string, unknown> | null }) {
  db.events.push({
    id: crypto.randomUUID(),
    createdAt: nowIso(),
    type,
    loadId: payload?.loadId ?? null,
    message,
    meta: payload?.meta ?? null,
  });
  if (db.events.length > 5000) {
    db.events = db.events.slice(db.events.length - 5000);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "yardos-api", now: nowIso() });
});

app.get("/integrations/yardos/import-template.csv", (_req, res) => {
  const lines = [
    "id,loadNumber,pallets,weightLbs,cubeFt,lane,stopWindow,constraints,destinationCode,status",
    "L30001,L30001,14,18500,700,East Hub -> Dallas TX,2026-02-25T08:00:00Z..2026-02-25T12:00:00Z,NO_SPLIT|NO_MIX,DFW,PLANNED",
    "L30002,L30002,10,12200,510,East Hub -> Austin TX,2026-02-25T09:00:00Z..2026-02-25T13:00:00Z,,AUS,PLANNED",
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=yardos-load-import-template.csv");
  res.send(lines.join("\n"));
});

app.post("/integrations/yardos/import-loads", upload.single("file"), (req, res) => {
  const modeSchema = z.enum(["append", "upsert", "replace"]).default("upsert");
  const parsedMode = modeSchema.safeParse((req.body?.mode ?? "").toString().trim().toLowerCase() || "upsert");
  if (!parsedMode.success) {
    res.status(400).json({ error: "Invalid import mode." });
    return;
  }

  const file = req.file;
  if (!file || !file.buffer || !file.originalname) {
    res.status(400).json({ error: "Upload a CSV or JSON file using 'file' field." });
    return;
  }

  const { loads, errors } = parseFileToLoads(file.originalname, file.buffer);
  const mode = parsedMode.data as LoadImportMode;
  const { imported, updated } = applyImport({ loads, mode });
  const skipped = errors.length + Math.max(0, loads.length - imported - updated);

  enqueueEvent("LOADS_IMPORTED", `Imported load file ${file.originalname}.`, {
    meta: {
      fileName: file.originalname,
      mode,
      imported,
      updated,
      skipped,
    },
  });
  persistDb();

  const response: LoadImportResponse = {
    ok: true,
    mode,
    imported,
    updated,
    skipped,
    totalLoads: db.loads.length,
    errors,
  };
  res.json(response);
});

app.post("/integrations/yardos/trailer-spec", (req, res) => {
  const parsed = trailerSpecSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid trailer spec payload." });
    return;
  }
  db.trailerSpecDefaults = normalizeTrailerSpec(parsed.data);
  enqueueEvent("TRAILER_SPEC_UPDATED", "Trailer default specification updated.", {
    meta: db.trailerSpecDefaults,
  });
  persistDb();
  res.json({ ok: true, trailerSpecDefaults: db.trailerSpecDefaults });
});

app.get("/integrations/yardos/context", (req, res) => {
  const querySchema = z.object({
    loadIds: z.string().optional(),
    trailerId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    search: z.string().optional(),
    status: z.string().optional(),
    lane: z.string().optional(),
    destination: z.string().optional(),
    constraint: z.string().optional(),
    assigned: z.string().optional(),
    sortBy: z.enum(["id", "weight", "pallets"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
  });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const limit = parsed.data.limit ?? 120;
  const requestedLoadIds = (parsed.data.loadIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const search = parsed.data.search?.trim().toLowerCase() ?? "";
  const status = parsed.data.status?.trim().toUpperCase() ?? "";
  const lane = parsed.data.lane?.trim().toLowerCase() ?? "";
  const destination = parsed.data.destination?.trim().toLowerCase() ?? "";
  const constraint = parsed.data.constraint?.trim().toUpperCase() ?? "";
  const assigned = parseBooleanFlag(parsed.data.assigned);
  const sortBy = parsed.data.sortBy ?? "id";
  const sortDir = parsed.data.sortDir ?? "asc";

  let selectedLoads = loadSelection(requestedLoadIds);
  if (search) {
    selectedLoads = selectedLoads.filter((load) => {
      const hay = `${load.id} ${load.loadNumber ?? ""} ${load.lane ?? ""} ${load.destinationCode ?? ""}`.toLowerCase();
      return hay.includes(search);
    });
  }
  if (status) {
    selectedLoads = selectedLoads.filter((load) => (load.status ?? "").toUpperCase() === status);
  }
  if (lane) {
    selectedLoads = selectedLoads.filter((load) => (load.lane ?? "").toLowerCase().includes(lane));
  }
  if (destination) {
    selectedLoads = selectedLoads.filter((load) => (load.destinationCode ?? "").toLowerCase().includes(destination));
  }
  if (constraint) {
    selectedLoads = selectedLoads.filter((load) => load.constraints.includes(constraint as Load["constraints"][number]));
  }
  if (assigned !== null) {
    selectedLoads = selectedLoads.filter((load) => (assigned ? Boolean(load.trailerId) : !load.trailerId));
  }

  selectedLoads = [...selectedLoads].sort((a, b) => {
    let left = 0;
    let right = 0;
    if (sortBy === "weight") {
      left = a.weightLbs;
      right = b.weightLbs;
    } else if (sortBy === "pallets") {
      left = a.pallets;
      right = b.pallets;
    } else {
      const idCmp = (a.loadNumber ?? a.id).localeCompare(b.loadNumber ?? b.id);
      return sortDir === "asc" ? idCmp : -idCmp;
    }
    return sortDir === "asc" ? left - right : right - left;
  });
  selectedLoads = selectedLoads.slice(0, limit);

  const trailers = parsed.data.trailerId
    ? db.trailers.filter((trailer) => trailer.id === parsed.data.trailerId)
    : db.trailers.slice(0, 120);

  const response: ContextResponse = {
    orgId: db.orgId,
    generatedAt: nowIso(),
    source: "yardos",
    loads: selectedLoads,
    trailers,
    trailerSpecDefaults: db.trailerSpecDefaults,
  };

  res.json(response);
});

app.post("/integrations/yardos/suggested-plans", (req, res) => {
  const parsed = suggestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const body = parsed.data as SuggestedPlansRequest;
  const loads = loadSelection(body.loadIds);
  if (loads.length === 0) {
    res.status(400).json({ error: "No loads selected" });
    return;
  }

  const plans = buildSuggestedPlans(loads, body.trailerSpec);
  const response: SuggestedPlansResponse = {
    ok: true,
    plans,
  };
  res.json(response);
});

app.post("/integrations/yardos/plan-preview", (req, res) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const body = parsed.data as PlanPreviewRequest;
  const trailerSpec = normalizeTrailerSpec(body.trailerSpec);
  const generated = !body.placements || body.placements.length === 0
    ? createDeterministicPlacements(body.loads, trailerSpec)
    : { placements: body.placements, violations: [] as Violation[] };

  const mergedViolations = [
    ...(body.violations ?? []),
    ...generated.violations,
  ];

  const summary = summarizePlan({
    loads: body.loads,
    placements: generated.placements,
    trailerSpec,
    violations: mergedViolations,
  });

  const notes: string[] = [];
  if (summary.overweight) notes.push("Plan exceeds legal trailer weight.");
  if (summary.axleBalance.status !== "GOOD") notes.push("Axle balance is outside preferred range.");
  if (summary.violationsBySeverity.high > 0 || summary.violationsBySeverity.critical > 0) {
    notes.push("High-severity violations detected.");
  }
  if (notes.length === 0) notes.push("Plan preview passed baseline checks.");

  const response: PlanPreviewResponse = {
    ok: true,
    summary,
    notes,
  };
  res.json(response);
});

app.post("/integrations/yardos/plan-apply", (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const body = parsed.data as PlanApplyRequest;
  const touchedLoads = [...new Set(body.placements.map((placement) => placement.loadId).filter(Boolean))];
  if (touchedLoads.length === 0) {
    res.status(400).json({ error: "Plan has no placements to apply" });
    return;
  }

  const trailerId = body.trailerId?.trim() ? body.trailerId.trim() : null;
  const trailer = trailerId ? db.trailers.find((row) => row.id === trailerId) : null;
  if (trailerId && !trailer) {
    res.status(404).json({ error: "Trailer not found" });
    return;
  }

  for (const load of db.loads) {
    if (!touchedLoads.includes(load.id)) continue;
    load.status = "ASSIGNED";
    if (trailer) {
      load.trailerId = trailer.id;
      load.trailerUnit = trailer.unit;
    }
    enqueueEvent("LOAD_UPDATED", `Plan ${body.planId} applied to ${load.loadNumber ?? load.id}.`, {
      loadId: load.id,
      meta: {
        planId: body.planId,
        source: body.source ?? "yardos.ui",
        trailerId: trailer?.id ?? null,
      },
    });
  }

  enqueueEvent("PLAN_APPLIED", `Plan ${body.planId} was applied.`, {
    meta: {
      planId: body.planId,
      touchedLoads,
      note: body.note ?? null,
      source: body.source ?? "yardos.ui",
    },
  });
  persistDb();

  const summary = summarizePlan({
    loads: body.loads,
    placements: body.placements,
    trailerSpec: body.trailerSpec,
    violations: body.violations ?? [],
  });

  const response: PlanApplyResponse = {
    ok: true,
    planId: body.planId,
    touchedLoads,
    eventsQueued: touchedLoads.length,
    summary,
  };
  res.json(response);
});

app.post("/integrations/yardos/plan-reject", (req, res) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const body = parsed.data as PlanRejectRequest;
  const touchedLoads = [...new Set((body.loadIds ?? []).map((id) => id.trim()).filter(Boolean))];

  enqueueEvent("PLAN_REJECTED", `Plan ${body.planId} rejected: ${body.reason}`, {
    meta: {
      planId: body.planId,
      reason: body.reason,
      source: body.source ?? "yardos.ui",
      touchedLoads,
    },
  });
  persistDb();

  const response: PlanRejectResponse = {
    ok: true,
    planId: body.planId,
    reason: body.reason,
    touchedLoads,
  };
  res.json(response);
});

app.get("/integrations/yardos/events", (req, res) => {
  const querySchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(300).optional(),
  });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const cursorRaw = parsed.data.cursor?.trim();
  const cursorDate = cursorRaw ? new Date(cursorRaw) : null;
  if (cursorRaw && (!cursorDate || Number.isNaN(cursorDate.getTime()))) {
    res.status(400).json({ error: "Invalid cursor value" });
    return;
  }

  const limit = parsed.data.limit ?? 120;
  const rows = db.events
    .filter((event) => {
      if (!cursorDate) return true;
      return new Date(event.createdAt).getTime() > cursorDate.getTime();
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const sliced = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? sliced[sliced.length - 1]?.createdAt ?? null : null;

  const response: EventsResponse = {
    orgId: db.orgId,
    nextCursor,
    events: sliced,
  };

  res.json(response);
});

const port = Number(process.env.PORT || 4100);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`yardos-api listening on http://localhost:${port}`);
});

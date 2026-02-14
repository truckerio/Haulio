import { LoadStatus, LoadType, Prisma } from "@truckerio/db";
import { formatLoadStatusLabel, mapExternalLoadStatus } from "./load-status";

export const TMS_LOAD_SHEET_HEADERS = [
  "Load",
  "Trip",
  "Status",
  "Customer",
  "Cust Ref",
  "Unit",
  "Trailer",
  "As Wgt",
  "Total Rev",
  "PU Date F",
  "PU Time F",
  "PU Time T",
  "Shipper",
  "Ship City",
  "Ship St",
  "Del Date F",
  "Del Time T",
  "Consignee",
  "Cons City",
  "Cons St",
  "Sales",
  "Drop Name",
  "Load Notes (Shipper)",
  "Load Notes (Consignee)",
  "Inv Date",
  "Del Date T",
  "Type",
] as const;

type HeaderKey =
  | "load"
  | "trip"
  | "status"
  | "customer"
  | "custref"
  | "unit"
  | "trailer"
  | "aswgt"
  | "totalrev"
  | "pudatef"
  | "putimef"
  | "putimet"
  | "shipper"
  | "shipcity"
  | "shipst"
  | "deldatef"
  | "deltimet"
  | "consignee"
  | "conscity"
  | "consst"
  | "sales"
  | "dropname"
  | "loadnotesshipper"
  | "loadnotesconsignee"
  | "loadnotes"
  | "invdate"
  | "deldatet"
  | "type";

const normalizedHeaderToKey: Record<string, HeaderKey> = {
  load: "load",
  loadnumber: "load",
  loadno: "load",
  trip: "trip",
  tripnumber: "trip",
  tripno: "trip",
  status: "status",
  loadstatus: "status",
  customer: "customer",
  customername: "customer",
  custref: "custref",
  customerref: "custref",
  customerreference: "custref",
  unit: "unit",
  truck: "unit",
  truckunit: "unit",
  tractor: "unit",
  powerunit: "unit",
  trailer: "trailer",
  trailerno: "trailer",
  trailernumber: "trailer",
  aswgt: "aswgt",
  weight: "aswgt",
  weightlbs: "aswgt",
  weightlb: "aswgt",
  totalrev: "totalrev",
  totalrevenue: "totalrev",
  revenue: "totalrev",
  rate: "totalrev",
  pudatef: "pudatef",
  pudate: "pudatef",
  pickupdate: "pudatef",
  pickupdatefrom: "pudatef",
  putimef: "putimef",
  putime: "putimef",
  pickuptime: "putimef",
  pickuptimefrom: "putimef",
  putimet: "putimet",
  pickuptimeto: "putimet",
  pickuptimeend: "putimet",
  shipper: "shipper",
  shippername: "shipper",
  pickupname: "shipper",
  shipcity: "shipcity",
  pickupcity: "shipcity",
  shipst: "shipst",
  pickupstate: "shipst",
  deldatef: "deldatef",
  deldate: "deldatef",
  deliverydate: "deldatef",
  deliverydatefrom: "deldatef",
  deltimet: "deltimet",
  deltime: "deltimet",
  deliverytime: "deltimet",
  consignee: "consignee",
  consigneename: "consignee",
  receiver: "consignee",
  deliveryname: "consignee",
  conscity: "conscity",
  consigneecity: "conscity",
  receivercity: "conscity",
  deliverycity: "conscity",
  consst: "consst",
  consigneestate: "consst",
  receiverstate: "consst",
  deliverystate: "consst",
  sales: "sales",
  salesrep: "sales",
  salesrepname: "sales",
  dropname: "dropname",
  drop: "dropname",
  dropoff: "dropname",
  dropoffname: "dropname",
  loadnotesshipper: "loadnotesshipper",
  pickupnotes: "loadnotesshipper",
  shippernotes: "loadnotesshipper",
  loadnotesconsignee: "loadnotesconsignee",
  deliverynotes: "loadnotesconsignee",
  consigneenotes: "loadnotesconsignee",
  receivernotes: "loadnotesconsignee",
  loadnotes: "loadnotesshipper",
  invdate: "invdate",
  invoicedate: "invdate",
  deldatet: "deldatet",
  deliverydateto: "deldatet",
  deliverydateend: "deldatet",
  type: "type",
  loadtype: "type",
};

const requiredKeys: HeaderKey[] = [
  "load",
  "customer",
  "shipper",
  "shipcity",
  "shipst",
  "consignee",
  "conscity",
  "consst",
  "pudatef",
  "deldatef",
];

const keyLabels: Record<HeaderKey, string> = {
  load: "Load",
  trip: "Trip",
  status: "Status",
  customer: "Customer",
  custref: "Cust Ref",
  unit: "Unit",
  trailer: "Trailer",
  aswgt: "As Wgt",
  totalrev: "Total Rev",
  pudatef: "PU Date F",
  putimef: "PU Time F",
  putimet: "PU Time T",
  shipper: "Shipper",
  shipcity: "Ship City",
  shipst: "Ship St",
  deldatef: "Del Date F",
  deltimet: "Del Time T",
  consignee: "Consignee",
  conscity: "Cons City",
  consst: "Cons St",
  sales: "Sales",
  dropname: "Drop Name",
  loadnotesshipper: "Load Notes (Shipper)",
  loadnotesconsignee: "Load Notes (Consignee)",
  loadnotes: "Load Notes",
  invdate: "Inv Date",
  deldatet: "Del Date T",
  type: "Type",
};

type EquipmentRef = { id: string; unit: string };
type CustomerRef = { id: string; name: string };

export type TmsLoadSheetContext = {
  orgId: string;
  timeZone: string;
  defaultOperatingEntityId: string;
  existingLoadNumbers: Set<string>;
  trucksByUnit: Map<string, EquipmentRef>;
  trailersByUnit: Map<string, EquipmentRef>;
  customersByName: Map<string, CustomerRef>;
};

type DateParts = { year: number; month: number; day: number };
type TimeParts = { hour: number; minute: number };

type StopDraft = {
  name: string;
  city: string;
  state: string;
  notes?: string | null;
  appointmentStart: Date | null;
  appointmentEnd: Date | null;
};

export type TmsLoadSheetRowData = {
  loadNumber: string;
  externalTripId: string | null;
  status: LoadStatus;
  statusLabel: string;
  customerName: string;
  customerRef: string | null;
  truckId: string | null;
  truckUnit: string | null;
  trailerId: string | null;
  trailerUnit: string | null;
  weightLbs: number | null;
  rate: Prisma.Decimal | null;
  loadType: LoadType;
  salesRepName: string | null;
  dropName: string | null;
  pickupNotes: string | null;
  deliveryNotes: string | null;
  desiredInvoiceDate: Date | null;
  pickupStop: StopDraft;
  deliveryStop: StopDraft;
  warnings: string[];
  errors: string[];
};

export type TmsPreviewRow = {
  rowNumber: number;
  data: Record<string, string>;
  warnings: string[];
  errors: string[];
};

export type TmsPreviewResponse = {
  columns: string[];
  rows: TmsPreviewRow[];
  summary: { total: number; valid: number; invalid: number; warnings: number };
  headerWarnings: string[];
};

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

export function parseCsvText(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { columns: [] as string[], rows: [] as Record<string, string>[] };
  }
  const columns = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    columns.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
  return { columns, rows };
}

export function validateTmsHeaders(columns: string[]) {
  const columnMap = buildColumnMap(columns);
  const presentKeys = new Set(columnMap.keys());
  const missingRequired = requiredKeys.filter((key) => !presentKeys.has(key));
  const allKeys = Array.from(
    new Set(
      TMS_LOAD_SHEET_HEADERS.map((header) => normalizedHeaderToKey[normalizeHeader(header)]).filter(
        (key): key is HeaderKey => Boolean(key)
      )
    )
  );
  const missingOptional = allKeys
    .filter((key) => !requiredKeys.includes(key) && !presentKeys.has(key))
    .map((key) => keyLabels[key]);
  const unexpected = columns.filter((header) => !normalizedHeaderToKey[normalizeHeader(header)]);
  const missingRequiredLabels = missingRequired.map((key) => keyLabels[key]);
  return { missingRequired, missingRequiredLabels, missingOptional, unexpected };
}

function parseDateParts(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const mmdd = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmdd) {
    const month = Number(mmdd[1]);
    const day = Number(mmdd[2]);
    const year = Number(mmdd[3]);
    if (!isValidDateParts({ year, month, day })) return null;
    return { year, month, day } as DateParts;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!isValidDateParts({ year, month, day })) return null;
    return { year, month, day } as DateParts;
  }
  return null;
}

function isValidDateParts(parts: DateParts) {
  if (parts.month < 1 || parts.month > 12) return false;
  if (parts.day < 1 || parts.day > 31) return false;
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    probe.getUTCFullYear() === parts.year &&
    probe.getUTCMonth() === parts.month - 1 &&
    probe.getUTCDate() === parts.day
  );
}

function parseTimeParts(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return null;
  }
  const ampm = match[3]?.toUpperCase();
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) {
      hour = ampm === "AM" ? 0 : 12;
    } else if (ampm === "PM") {
      hour += 12;
    }
  } else if (hour > 23) {
    return null;
  }
  return { hour, minute } as TimeParts;
}

function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return (asUtc - date.getTime()) / 60000;
}

function zonedPartsToUtc(dateParts: DateParts, timeParts: TimeParts | null, timeZone: string) {
  const time = timeParts ?? { hour: 0, minute: 0 };
  const utcGuess = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, time.hour, time.minute));
  const offset = getTimeZoneOffsetMinutes(timeZone, utcGuess);
  return new Date(utcGuess.getTime() - offset * 60000);
}

function parseCurrency(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[$,\s]/g, "");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return num;
}

function parseWeight(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[,\s]/g, "");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

function mapLoadType(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { loadType: LoadType.COMPANY, warning: null as string | null };
  }
  const key = trimmed.toUpperCase().replace(/[^A-Z]/g, "");
  if (key === "BROKERED") return { loadType: LoadType.BROKERED, warning: null as string | null };
  if (key === "COMPANY") return { loadType: LoadType.COMPANY, warning: null as string | null };
  if (["VAN", "DRYVAN", "DRY"].includes(key)) return { loadType: LoadType.VAN, warning: null as string | null };
  if (["REEFER", "REFRIGERATED"].includes(key)) return { loadType: LoadType.REEFER, warning: null as string | null };
  if (["FLATBED", "FLAT"].includes(key)) return { loadType: LoadType.FLATBED, warning: null as string | null };
  if (["OTHER", "UNKNOWN"].includes(key)) return { loadType: LoadType.OTHER, warning: null as string | null };
  return {
    loadType: LoadType.COMPANY,
    warning: `Unknown load type "${trimmed}". Defaulted to COMPANY.`,
  };
}

function isRowEmpty(row: Record<string, string>) {
  return Object.values(row).every((value) => !String(value ?? "").trim());
}

function buildColumnMap(columns: string[]) {
  const map = new Map<HeaderKey, string>();
  for (const header of columns) {
    const key = normalizedHeaderToKey[normalizeHeader(header)];
    if (key) {
      map.set(key, header);
    }
  }
  return map;
}

function makePreviewData(rowData: TmsLoadSheetRowData) {
  return {
    loadNumber: rowData.loadNumber,
    status: rowData.statusLabel,
    customer: rowData.customerName,
    unit: rowData.truckUnit ?? "",
    trailer: rowData.trailerUnit ?? "",
    pickup: rowData.pickupStop.city && rowData.pickupStop.state ? `${rowData.pickupStop.city}, ${rowData.pickupStop.state}` : "",
    delivery:
      rowData.deliveryStop.city && rowData.deliveryStop.state
        ? `${rowData.deliveryStop.city}, ${rowData.deliveryStop.state}`
        : "",
  };
}

export function evaluateTmsRow(params: {
  row: Record<string, string>;
  rowNumber: number;
  context: TmsLoadSheetContext;
  seenLoadNumbers: Set<string>;
}) {
  const { row, context, seenLoadNumbers } = params;
  const errors: string[] = [];
  const warnings: string[] = [];
  const columnMap = buildColumnMap(Object.keys(row));
  const getValue = (key: HeaderKey) => {
    const header = columnMap.get(key);
    return header ? row[header] ?? "" : "";
  };

  if (isRowEmpty(row)) {
    errors.push("Empty row");
  }

  for (const key of requiredKeys) {
    if (!getValue(key).trim()) {
      errors.push(`${keyLabels[key]} is required`);
    }
  }

  const loadNumber = getValue("load").trim();
  if (loadNumber) {
    const loadKey = loadNumber.toLowerCase();
    if (context.existingLoadNumbers.has(loadKey)) {
      errors.push("Load number already exists");
    }
    if (seenLoadNumbers.has(loadKey)) {
      errors.push("Duplicate load number in file");
    }
    seenLoadNumbers.add(loadKey);
  }

  const statusMapped = mapExternalLoadStatus(getValue("status"));
  if (statusMapped.warning) warnings.push(statusMapped.warning);

  const loadTypeMapped = mapLoadType(getValue("type"));
  if (loadTypeMapped.warning) warnings.push(loadTypeMapped.warning);

  const customerName = getValue("customer").trim();
  const customerRef = getValue("custref").trim() || null;
  const externalTripId = getValue("trip").trim() || null;
  const salesRepName = getValue("sales").trim() || null;
  const dropName = getValue("dropname").trim() || null;
  const shipperNotes =
    getValue("loadnotesshipper").trim() ||
    getValue("loadnotes").trim() ||
    null;
  const consigneeNotes = getValue("loadnotesconsignee").trim() || null;

  const truckUnit = getValue("unit").trim();
  let truckId: string | null = null;
  if (truckUnit) {
    const match = context.trucksByUnit.get(truckUnit.toLowerCase());
    if (match) {
      truckId = match.id;
    } else {
      warnings.push(`Truck unit "${truckUnit}" not found`);
    }
  } else {
    warnings.push("Unit is blank; load will be unassigned");
  }

  const trailerUnit = getValue("trailer").trim();
  let trailerId: string | null = null;
  if (trailerUnit) {
    const match = context.trailersByUnit.get(trailerUnit.toLowerCase());
    if (match) {
      trailerId = match.id;
    } else {
      warnings.push(`Trailer "${trailerUnit}" not found`);
    }
  } else {
    warnings.push("Trailer is blank; load will be unassigned");
  }

  const weight = getValue("aswgt").trim();
  const weightLbs = weight ? parseWeight(weight) : null;
  if (weight && weightLbs === null) {
    errors.push("Invalid As Wgt");
  }

  const rateRaw = getValue("totalrev").trim();
  const rateValue = rateRaw ? parseCurrency(rateRaw) : null;
  if (rateRaw && rateValue === null) {
    errors.push("Invalid Total Rev");
  }
  const rate = rateValue === null ? null : new Prisma.Decimal(rateValue);

  const pickupDateParts = parseDateParts(getValue("pudatef"));
  if (!pickupDateParts && getValue("pudatef").trim()) {
    errors.push("Invalid PU Date F");
  }
  const pickupStartTime = parseTimeParts(getValue("putimef"));
  if (!pickupStartTime && getValue("putimef").trim()) {
    errors.push("Invalid PU Time F");
  }
  const pickupEndTime = parseTimeParts(getValue("putimet"));
  if (!pickupEndTime && getValue("putimet").trim()) {
    errors.push("Invalid PU Time T");
  }
  if (!getValue("putimef").trim()) {
    warnings.push("PU Time F missing; using 00:00");
  }
  if (!getValue("putimet").trim()) {
    warnings.push("PU Time T missing; end equals start");
  }

  const pickupStart =
    pickupDateParts && (pickupStartTime || !getValue("putimef").trim())
      ? zonedPartsToUtc(pickupDateParts, pickupStartTime, context.timeZone)
      : null;
  const pickupEnd =
    pickupDateParts && (pickupEndTime || !getValue("putimet").trim())
      ? zonedPartsToUtc(pickupDateParts, pickupEndTime ?? pickupStartTime, context.timeZone)
      : pickupStart;

  const deliveryDateParts = parseDateParts(getValue("deldatef"));
  if (!deliveryDateParts && getValue("deldatef").trim()) {
    errors.push("Invalid Del Date F");
  }
  const deliveryEndDateParts = parseDateParts(getValue("deldatet"));
  if (!deliveryEndDateParts && getValue("deldatet").trim()) {
    errors.push("Invalid Del Date T");
  }
  const deliveryEndTime = parseTimeParts(getValue("deltimet"));
  if (!deliveryEndTime && getValue("deltimet").trim()) {
    errors.push("Invalid Del Time T");
  }
  if (!getValue("deltimet").trim()) {
    warnings.push("Del Time T missing; delivery end left blank");
  }

  const deliveryStart =
    deliveryDateParts && !getValue("deldatef").trim()
      ? null
      : deliveryDateParts
        ? zonedPartsToUtc(deliveryDateParts, null, context.timeZone)
        : null;
  const deliveryEnd =
    deliveryDateParts && deliveryEndTime
      ? zonedPartsToUtc(deliveryEndDateParts ?? deliveryDateParts, deliveryEndTime, context.timeZone)
      : null;

  const invoiceDateParts = parseDateParts(getValue("invdate"));
  if (!invoiceDateParts && getValue("invdate").trim()) {
    warnings.push("Inv Date invalid; ignored");
  }
  const desiredInvoiceDate = invoiceDateParts ? zonedPartsToUtc(invoiceDateParts, null, context.timeZone) : null;

  const pickupStop: StopDraft = {
    name: getValue("shipper").trim(),
    city: getValue("shipcity").trim(),
    state: getValue("shipst").trim(),
    notes: shipperNotes,
    appointmentStart: pickupStart,
    appointmentEnd: pickupEnd ?? pickupStart,
  };
  const deliveryStop: StopDraft = {
    name: getValue("consignee").trim(),
    city: getValue("conscity").trim(),
    state: getValue("consst").trim(),
    notes: consigneeNotes,
    appointmentStart: deliveryStart,
    appointmentEnd: deliveryEnd,
  };

  const rowData: TmsLoadSheetRowData = {
    loadNumber,
    externalTripId,
    status: statusMapped.status,
    statusLabel: formatLoadStatusLabel(statusMapped.status),
    customerName,
    customerRef,
    truckId,
    truckUnit: truckUnit || null,
    trailerId,
    trailerUnit: trailerUnit || null,
    weightLbs,
    rate,
    loadType: loadTypeMapped.loadType,
    salesRepName,
    dropName,
    pickupNotes: shipperNotes,
    deliveryNotes: consigneeNotes,
    desiredInvoiceDate,
    pickupStop,
    deliveryStop,
    warnings,
    errors,
  };

  return rowData;
}

export function previewTmsLoadSheet(params: { csvText: string; context: TmsLoadSheetContext }) {
  const { columns, rows } = parseCsvText(params.csvText);
  const { missingRequired, missingRequiredLabels, missingOptional, unexpected } = validateTmsHeaders(columns);
  const headerWarnings: string[] = [];
  if (missingRequired.length > 0) {
    headerWarnings.push(`Missing required headers: ${missingRequiredLabels.join(", ")}`);
  }
  if (missingOptional.length > 0) {
    headerWarnings.push(`Missing optional headers: ${missingOptional.join(", ")}`);
  }
  if (unexpected.length > 0) {
    headerWarnings.push(`Unexpected headers: ${unexpected.join(", ")}`);
  }
  if (missingRequired.length > 0) {
    return {
      columns,
      rows: [] as TmsPreviewRow[],
      summary: { total: 0, valid: 0, invalid: 0, warnings: 0 },
      headerWarnings,
    } as TmsPreviewResponse;
  }

  const seenLoadNumbers = new Set<string>();
  const previewRows: TmsPreviewRow[] = rows.map((row, index) => {
    const rowNumber = index + 2;
    const rowData = evaluateTmsRow({
      row,
      rowNumber,
      context: params.context,
      seenLoadNumbers,
    });
    return {
      rowNumber,
      data: makePreviewData(rowData),
      warnings: rowData.warnings,
      errors: rowData.errors,
    };
  });

  const valid = previewRows.filter((row) => row.errors.length === 0).length;
  const invalid = previewRows.length - valid;
  const warnings = previewRows.reduce((sum, row) => sum + row.warnings.length, 0);
  return {
    columns,
    rows: previewRows,
    summary: { total: previewRows.length, valid, invalid, warnings },
    headerWarnings,
  } as TmsPreviewResponse;
}

function safeParts(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return values;
}

export function formatDateForSheet(date: Date | null | undefined, timeZone: string) {
  if (!date) return "";
  const parts = safeParts(timeZone, date);
  return `${parts.month}/${parts.day}/${parts.year}`;
}

export function formatTimeForSheet(date: Date | null | undefined, timeZone: string) {
  if (!date) return "";
  const parts = safeParts(timeZone, date);
  return `${parts.hour}:${parts.minute}`;
}

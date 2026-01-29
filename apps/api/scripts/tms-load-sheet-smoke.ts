import assert from "node:assert/strict";
import { previewTmsLoadSheet, TMS_LOAD_SHEET_HEADERS } from "../src/lib/tms-load-sheet";

const header = TMS_LOAD_SHEET_HEADERS.join(",");
const csv = [
  header,
  "TMS-1001,TRIP-1,Flying,Acme Foods,PO-1,TRK-1,TRL-9,40000,2500,01/20/2026,08:00,,Acme DC,Chicago,IL,01/21/2026,,Fresh Mart,Dallas,TX,A. Lee,Store 14,Handle with care,,01/21/2026,Van",
  "TMS-1002,TRIP-2,Planned,Acme Foods,PO-2,TRK-1,,41000,2600,2026-01-22,07:30,09:00,North Hub,Milwaukee,WI,2026-01-23,,South Hub,Atlanta,GA,B. Kim,,Date-only delivery window,,,Reefer",
].join("\n");

const context = {
  orgId: "org-demo",
  timeZone: "America/Chicago",
  defaultOperatingEntityId: "op-demo",
  existingLoadNumbers: new Set<string>(),
  trucksByUnit: new Map([["trk-1", { id: "truck-1", unit: "TRK-1" }]]),
  trailersByUnit: new Map<string, { id: string; unit: string }>(),
  customersByName: new Map([["acme foods", { id: "cust-1", name: "Acme Foods" }]]),
};

const preview = previewTmsLoadSheet({ csvText: csv, context });

assert.equal(preview.summary.total, 2);
assert.ok(preview.summary.warnings > 0, "Expected warnings for missing trailer/time and unknown status");
assert.ok(preview.rows[0].warnings.some((w) => w.includes("Unknown status")), "Unknown status should warn");
assert.ok(preview.rows[0].warnings.some((w) => w.includes("Trailer")), "Missing trailer should warn");
assert.ok(preview.rows[1].warnings.some((w) => w.includes("Del Time T missing")), "Date-only delivery should warn");

console.log("tms-load-sheet-smoke: PASS");

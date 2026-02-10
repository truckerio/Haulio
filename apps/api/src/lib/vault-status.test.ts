import assert from "node:assert/strict";
import { getVaultStatus } from "./vault-status";
import type { VaultDocType } from "@truckerio/db";

const now = new Date("2026-02-01T12:00:00Z");
const INSURANCE = "INSURANCE" as VaultDocType;
const OTHER = "OTHER" as VaultDocType;
const REGISTRATION = "REGISTRATION" as VaultDocType;

assert.equal(getVaultStatus({ docType: INSURANCE, expiresAt: null, now }), "NEEDS_DETAILS");
assert.equal(getVaultStatus({ docType: OTHER, expiresAt: null, now }), "VALID");
assert.equal(getVaultStatus({ docType: REGISTRATION, expiresAt: new Date("2026-01-01T00:00:00Z"), now }), "EXPIRED");
assert.equal(
  getVaultStatus({ docType: INSURANCE, expiresAt: new Date("2026-02-20T00:00:00Z"), now, expiringDays: 30 }),
  "EXPIRING_SOON"
);
assert.equal(
  getVaultStatus({ docType: INSURANCE, expiresAt: new Date("2026-04-15T00:00:00Z"), now, expiringDays: 30 }),
  "VALID"
);

console.log("vault status tests passed");

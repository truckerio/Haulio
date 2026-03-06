import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/index.ts", "utf8");

assert.ok(
  source.includes('"/finance/move-contracts"') && source.includes("MOVE_CONTRACT_CREATED"),
  "move contracts create route must exist with audit logging"
);
assert.ok(
  source.includes('"/finance/move-contracts/:id/versions"') && source.includes("MOVE_CONTRACT_VERSION_CREATED"),
  "move contracts versioning route must exist with audit logging"
);
assert.ok(
  source.includes('"/finance/move-contracts/preview"') && source.includes("computeMoveContractCompensation"),
  "move contracts preview route must exist and use contract compensation engine"
);
assert.ok(
  source.includes("selectApplicableMoveContract(") &&
    source.includes("moveContractId") &&
    source.includes("moveContractModel"),
  "payables preview lines must attach move contract metadata"
);

console.log("move contracts contract tests passed");

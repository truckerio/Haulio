import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const financePage = fs.readFileSync(path.resolve(process.cwd(), "app/finance/page.tsx"), "utf8");
const summaryRail = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceSummaryRail.tsx"), "utf8");

assert.ok(
  financePage.includes("<FinanceSummaryRail />"),
  "finance page must render finance summary rail"
);
assert.ok(
  summaryRail.includes('apiFetch<WalletResponse>("/finance/wallets")'),
  "finance summary rail must fetch wallets endpoint"
);
assert.ok(
  summaryRail.includes('apiFetch<JournalsResponse>("/finance/journals?limit=40")'),
  "finance summary rail must fetch journals endpoint"
);
assert.ok(
  summaryRail.includes("capabilities.canViewSettlementPreview"),
  "finance summary rail must use capability gating"
);
assert.ok(
  summaryRail.includes("isForbiddenError(err)"),
  "finance summary rail must fail closed on forbidden responses"
);
assert.ok(
  summaryRail.includes('label="Restricted"'),
  "finance summary rail must display restricted label when blocked"
);
assert.ok(
  summaryRail.includes("unbalanced") && summaryRail.includes("duplicateIdempotency"),
  "finance summary rail must compute journal anomaly flags"
);

console.log("finance summary rail contract tests passed");

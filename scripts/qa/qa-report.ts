import fs from "fs";
import path from "path";
import { readResults } from "./qa-utils";
import { repoRoot } from "./qa-paths";

const reportPath = path.resolve(repoRoot, "QA_REPORT.md");
const testsLogPath = path.resolve(repoRoot, "scripts/qa/qa-tests.log");
const apiLogPath = path.resolve(repoRoot, "scripts/qa/qa-api.log");

function safeRead(filePath: string) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function formatStatus(status: string) {
  if (status === "pass") return "PASS";
  if (status === "fail") return "FAIL";
  return "SKIP";
}

function main() {
  const { results } = readResults();
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  const lines: string[] = [];
  lines.push("# QA Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Passed: ${passed}`);
  lines.push(`- Failed: ${failed}`);
  lines.push(`- Skipped: ${skipped}`);
  lines.push("");
  lines.push("## Automated Checks");

  if (results.length === 0) {
    lines.push("- No QA results found. Run `pnpm qa:all` or `pnpm qa:smoke`.");
  } else {
    for (const result of results) {
      const status = formatStatus(result.status);
      lines.push(`- ${status} ${result.name}${result.details ? ` — ${result.details}` : ""}`);
    }
  }

  const failures = results.filter((r) => r.status === "fail");
  if (failures.length > 0) {
    lines.push("");
    lines.push("## Failure Details");
    for (const failure of failures) {
      lines.push(`### ${failure.name}`);
      lines.push("");
      if (failure.error) {
        lines.push("```");
        lines.push(failure.error.trim());
        lines.push("```");
      } else {
        lines.push("_No error output captured._");
      }
      lines.push("");
    }
  }

  if (fs.existsSync(testsLogPath) || fs.existsSync(apiLogPath)) {
    lines.push("## Logs");
    if (fs.existsSync(testsLogPath)) {
      lines.push("");
      lines.push(`### ${path.relative(repoRoot, testsLogPath)}`);
      lines.push("```");
      lines.push(safeRead(testsLogPath).trim() || "(empty)");
      lines.push("```");
    }
    if (fs.existsSync(apiLogPath)) {
      lines.push("");
      lines.push(`### ${path.relative(repoRoot, apiLogPath)}`);
      lines.push("```");
      lines.push(safeRead(apiLogPath).trim() || "(empty)");
      lines.push("```");
    }
    lines.push("");
  }

  lines.push("## Manual UI Checks Remaining");
  lines.push("- Login as dispatcher: create load, assign driver, verify load details summary strip + sticky sidebar.");
  lines.push("- Documents/POD: upload POD, verify/reject flow visible in billing queue.");
  lines.push("- Billing queue filters: Missing POD, Needs Verify, Verified, Rejected, Ready to Invoice.");
  lines.push("- Invoice PDF: operating entity header + refs + pallet/weight fields show.");
  lines.push("- Load confirmations: upload PDF/image, review draft, create load.");
  lines.push("- Driver tracking: start tracking, verify last ping shows on load details.");

  lines.push("");
  lines.push("## How To Run");
  lines.push("- `pnpm qa:setup`");
  lines.push("- `pnpm qa:tests`");
  lines.push("- `pnpm qa:smoke`");
  lines.push("- `pnpm qa:report`");
  lines.push("- `pnpm qa:all`");

  fs.writeFileSync(reportPath, lines.join("\n"));
  console.log(`QA report written to ${reportPath}`);
}

main();

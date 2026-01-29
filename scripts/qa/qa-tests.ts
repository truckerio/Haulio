import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { getQaDatabaseUrl } from "./qa-env";
import { repoRoot } from "./qa-paths";
import { runStep } from "./qa-utils";

async function main() {
  const qaUrl = getQaDatabaseUrl();
  process.env.DATABASE_URL = qaUrl;

  await runStep("qa.tests.unit-integration", async () => {
    const logPath = path.resolve(repoRoot, "scripts/qa/qa-tests.log");
    const result = spawnSync("pnpm", ["-r", "--if-present", "test"], {
      env: { ...process.env, DATABASE_URL: qaUrl },
      encoding: "utf8",
      shell: true,
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    fs.writeFileSync(logPath, output);
    if (result.status !== 0) {
      throw new Error(`Tests failed (exit ${result.status}). See ${logPath}`);
    }
    return { details: `pnpm -r --if-present test (log: ${logPath})` };
  });
}

main().catch((error) => {
  console.error("QA tests failed:", error.message);
  process.exitCode = 1;
});

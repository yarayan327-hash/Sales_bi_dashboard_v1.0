import fs from "fs";
import path from "path";
import { validateLatestData } from "../src/report/validateLatestData";

function getDefaultReportDateKSA() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const ksa = new Date(utcMs + 3 * 60 * 60 * 1000);
  ksa.setDate(ksa.getDate() - 1);

  const y = ksa.getFullYear();
  const m = String(ksa.getMonth() + 1).padStart(2, "0");
  const d = String(ksa.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function main() {
  const reportDate = process.argv[2] || getDefaultReportDateKSA();
  const outputDir = path.resolve("output");

  const result = validateLatestData({
    reportDate,
    outputDir,
  });

  const latestDir = path.join(outputDir, "latest");
  const outPath = path.join(latestDir, "validation_result.json");

  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

  console.log("=== Latest Data Validation ===");
  console.log(`reportDate: ${result.reportDate}`);
  console.log(`ok: ${result.ok ? "YES" : "NO"}`);

  if (result.issues.length === 0) {
    console.log("No issues found.");
  } else {
    for (const issue of result.issues) {
      console.log(`[${issue.level.toUpperCase()}] ${issue.code}: ${issue.message}`);
    }
  }

  if (!result.ok) {
    process.exit(1);
  }
}

main();
import fs from "fs";
import path from "path";
import Papa from "papaparse";

import { getDefaultReportDateKSA } from "../src/report/reportUtils";
import { buildDailyMetricsPayload } from "../src/report/buildDailyMetricsPayload";
import { buildSalesFollowupPayload } from "../src/report/buildSalesFollowupPayload";
import { buildTeamPkPayload } from "../src/report/buildTeamPkPayload";
import { buildMtdGapPayload } from "../src/report/buildMtdGapPayload";
import { buildReportPayload } from "../src/report/buildReportPayload";

const DATA_DIR = path.resolve("../public/data");
const OUTPUT_DIR = path.resolve("output");
const LATEST_DIR = path.resolve("output/latest");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readCSV(file: string) {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  const parsed = Papa.parse(raw, {
    header: true,
    skipEmptyLines: true
  });
  return parsed.data as any[];
}

function writeJsonBoth(name: string, reportDate: string, data: any) {
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${name}_${reportDate}.json`),
    JSON.stringify(data, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(LATEST_DIR, `${name}.json`),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(LATEST_DIR);

  const reportDate = process.argv[2] || getDefaultReportDateKSA();

  const agents = readCSV("dim_agents.csv");
  const targets = readCSV("dim_targets.csv");
  const leads = readCSV("fact_leads.csv");
  const trials = readCSV("fact_trials.csv");
  const orders = readCSV("fact_orders.csv");
  const calls = readCSV("fact_calls.csv");

  const dailyMetrics = buildDailyMetricsPayload({
    reportDate,
    leads,
    trials,
    orders
  });

  const salesFollowup = buildSalesFollowupPayload({
    reportDate,
    agents,
    trials,
    calls
  });

  const teamPk = buildTeamPkPayload({
    reportDate,
    orders
  });

  const mtdGap = buildMtdGapPayload({
    reportDate,
    agents,
    targets,
    orders
  });

  const reportPayload = buildReportPayload({
    daily_metrics: dailyMetrics,
    sales_followup: salesFollowup,
    team_pk: teamPk,
    mtd_gap: mtdGap
  });

  writeJsonBoth("daily_metrics", reportDate, dailyMetrics);
  writeJsonBoth("sales_followup", reportDate, salesFollowup);
  writeJsonBoth("team_pk", reportDate, teamPk);
  writeJsonBoth("mtd_gap", reportDate, mtdGap);
  writeJsonBoth("report_payload", reportDate, reportPayload);

  console.log(`✅ Daily metrics generated for ${reportDate}`);
}

main();
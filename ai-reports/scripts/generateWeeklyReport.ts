import fs from "fs";
import path from "path";
import Papa from "papaparse";

import { transformAgents } from "../src/transformers/agents";
import { transformLeads } from "../src/transformers/leads";
import { transformTrials } from "../src/transformers/trials";
import { transformOrders } from "../src/transformers/orders";
import { attachSalesMeta } from "../src/transformers/joinSales";

import { buildWeeklyReportPayload } from "../src/report/buildWeeklyReportPayload";
import { buildWeeklyDiagnosis } from "../src/report/buildWeeklyDiagnosis";
import { buildWeeklyReportText } from "../src/report/buildWeeklyReportText";

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
    skipEmptyLines: true,
  });
  return parsed.data as any[];
}

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

function writeTextBoth(name: string, reportDate: string, text: string) {
  fs.writeFileSync(path.join(OUTPUT_DIR, `${name}_${reportDate}.txt`), text, "utf8");
  fs.writeFileSync(path.join(LATEST_DIR, `${name}.txt`), text, "utf8");
}

function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(LATEST_DIR);

  const reportDate = process.argv[2] || getDefaultReportDateKSA();

  const rawAgents = readCSV("dim_agents.csv");
  const rawTargets = readCSV("dim_targets.csv");
  const rawLeads = readCSV("fact_leads.csv");
  const rawTrials = readCSV("fact_trials.csv");
  const rawOrders = readCSV("fact_orders.csv");

  const agents = transformAgents(rawAgents);
  const leadsBase = transformLeads(rawLeads);
  const trialsBase = transformTrials(rawTrials);
  const orders = transformOrders(rawOrders);

  const leads = attachSalesMeta(leadsBase, agents, (r: any) => ({
    sales_id: r.sales_id,
  }));

  const trials = attachSalesMeta(trialsBase, agents, (r: any) => ({
    sales_id: r.agent_id ?? r.sales_id,
  }));

  const monthlyTarget = (rawTargets ?? []).reduce((s: number, r: any) => {
    const n = Number(String(r.monthly_target_usd ?? "").replace(/,/g, "").trim());
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  const payload = buildWeeklyReportPayload({
    reportDate,
    monthlyTarget,
    leads,
    trials,
    orders,
  });

  const diagnosis = buildWeeklyDiagnosis(payload);
  const reportText = buildWeeklyReportText({
    payload,
    diagnosis,
  });

  writeJsonBoth("weekly_payload", reportDate, payload);
  writeJsonBoth("weekly_diagnosis", reportDate, diagnosis);
  writeTextBoth("weekly_report", reportDate, reportText);

  console.log(`✅ Weekly report generated for ${reportDate}`);
}

main();
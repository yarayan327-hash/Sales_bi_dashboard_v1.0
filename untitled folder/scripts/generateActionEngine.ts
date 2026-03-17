import fs from "fs";
import path from "path";
import Papa from "papaparse";

import { transformAgents } from "../src/transformers/agents";
import { transformCalls } from "../src/transformers/calls";
import { transformTrials } from "../src/transformers/trials";
import { transformLeads } from "../src/transformers/leads";
import { attachSalesMeta } from "../src/transformers/joinSales";

import { buildUnreachedLeads } from "../src/actionEngine/buildUnreachedLeads";
import { buildPreclassUnfollowed } from "../src/actionEngine/buildPreclassUnfollowed";
import { buildPostclassUnfollowed } from "../src/actionEngine/buildPostclassUnfollowed";
import { buildSalesTodo } from "../src/actionEngine/buildSalesTodo";
import { buildGroupMentions } from "../src/actionEngine/buildGroupMentions";
import { buildActionPayload } from "../src/actionEngine/buildActionPayload";

import { getDefaultReportDateKSA } from "../src/report/reportUtils";

const DATA_DIR = path.resolve("../public/data");
const OUTPUT_DIR = path.resolve("output");
const LATEST_DIR = path.resolve("output/latest");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

function readCSV(file: string) {
  const filePath = path.join(DATA_DIR, file);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = Papa.parse(raw, {
    header: true,
    skipEmptyLines: true,
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

  const rawAgents = readCSV("dim_agents.csv");
  const rawLeads = readCSV("fact_leads.csv");
  const rawTrials = readCSV("fact_trials.csv");
  const rawCalls = readCSV("fact_calls.csv");

  const agents = transformAgents(rawAgents);
  const leads = transformLeads(rawLeads);
  const trialsBase = transformTrials(rawTrials);
  const calls = transformCalls(rawCalls);

  // 给试听课补齐销售组/销售名
  const trials = attachSalesMeta(trialsBase, agents, (r: any) => ({
    sales_id: r.agent_id ?? r.sales_id,
    sales_name: r.sales_name,
  }));

  const unreachedLeads = buildUnreachedLeads({
    reportDate,
    leads,
    calls,
    agents,
  });

  const preclassUnfollowed = buildPreclassUnfollowed({
    reportDate,
    trials,
    calls,
  });

  const postclassUnfollowed = buildPostclassUnfollowed({
    reportDate,
    trials,
    calls,
  });

  const salesTodo = buildSalesTodo({
    unreachedLeads,
    preclassUnfollowed,
    postclassUnfollowed,
  });

  const groupMentions = buildGroupMentions({
    salesTodo,
  });

  const actionPayload = buildActionPayload({
    report_date: reportDate,
    unreached_leads: unreachedLeads,
    preclass_unfollowed: preclassUnfollowed,
    postclass_unfollowed: postclassUnfollowed,
    sales_todo: salesTodo,
    group_mentions: groupMentions,
  });

  writeJsonBoth("unreached_leads", reportDate, unreachedLeads);
  writeJsonBoth("preclass_unfollowed", reportDate, preclassUnfollowed);
  writeJsonBoth("postclass_unfollowed", reportDate, postclassUnfollowed);
  writeJsonBoth("sales_todo", reportDate, salesTodo);
  writeJsonBoth("group_mentions", reportDate, groupMentions);
  writeJsonBoth("action_payload", reportDate, actionPayload);

  console.log(`✅ Action engine generated for ${reportDate}`);
}

main();
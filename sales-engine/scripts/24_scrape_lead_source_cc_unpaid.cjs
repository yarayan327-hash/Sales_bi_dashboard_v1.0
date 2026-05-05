const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const STORAGE_STATE = path.join(ROOT, "public/data/crm_storage_state.json");
const OUT = path.join(ROOT, "public/data/fact_lead_source.csv");
const RAW = path.join(ROOT, "sales-engine/data/input/lead_source_cc_unpaid_latest.csv");
const LOG_DIR = path.join(ROOT, "sales-engine/logs");

const GROUPS = [
  { group_id: "5977", group_name: "前端销售部001组" },
  { group_id: "5978", group_name: "前端销售部002组" },
];

const TARGET_SALES = [
  "51habiba.hassan",
  "EGCC-eman.amr",
  "EGCC-nadahassan",
  "51nadamuhammad",
  "EGCC-fatmamohamed",
  "EGCC-maiwaheed",
  "EGCC-tasneemmahmoud",
];

function csvEscape(v) {
  v = String(v ?? "");
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split(",").map(x => x.replace(/^"|"$/g, ""));
  return lines.map(line => {
    const cells = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = !q;
      else if (ch === "," && !q) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    const o = {};
    headers.forEach((h, i) => o[h] = cells[i] ?? "");
    return o;
  });
}

function writeCsv(file, rows, headers) {
  fs.writeFileSync(
    file,
    headers.join(",") + "\n" + rows.map(r => headers.map(h => csvEscape(r[h])).join(",")).join("\n") + "\n",
    "utf8"
  );
}

async function fetchPage(page, params) {
  const qs = new URLSearchParams(params).toString();
  const url = `https://crmapi.51talk.com/UnPaidList/getUnPaidData?${qs}`;
  return await page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: "include" });
    const text = await res.text();
    try { return { url, status: res.status, json: JSON.parse(text) }; }
    catch { return { url, status: res.status, text }; }
  }, url);
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(RAW), { recursive: true });

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "0",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext(
    fs.existsSync(STORAGE_STATE) ? { storageState: STORAGE_STATE } : {}
  );
  const page = await context.newPage();

  await page.goto("https://crm.51talk.com/CcWorkBench/#//CcWorkBench/unPaidList", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(5000);

  const all = [];
  const samples = [];

  for (const g of GROUPS) {
    let pageNo = 1;
    while (pageNo <= 200) {
      const ret = await fetchPage(page, {
        page: String(pageNo),
        limit: "100",
        group_id: g.group_id,
      });

      samples.push({ group: g, pageNo, url: ret.url, status: ret.status, code: ret.json?.code, count: ret.json?.count });

      if (!ret.json || ret.json.code !== 0) {
        throw new Error(`UnPaid API failed: ${JSON.stringify(ret).slice(0, 1000)}`);
      }

      const data = ret.json.data || [];
      console.log(`${g.group_name} page ${pageNo}: ${data.length}`);

      for (const x of data) {
        if (!TARGET_SALES.includes(x.admin_name || "")) continue;
        all.push({
          stu_id: x.user_id || "",
          user_id: x.user_id || "",
          student_name: x.nick_name || "",
          source: x.is_recommed || x.source || "",
          source_code: x.source || "",
          register_time: x.register_time_local || x.register_time || "",
          add_time: x.register_time_local || x.register_time || "",
          dispatch_time: [x.dispatch_date, x.dispatch_time].filter(Boolean).join(" ").trim(),
          sales_name: x.admin_name || "",
          sales_group: x.admin_group_name || g.group_name,
          group_id: g.group_id,
          pay_intention: x.pay_intention || "",
          last_free_status: x.last_free_status || "",
          last_free_time_local: x.last_free_time_local || "",
          remark: x.remark || "",
          remark_more: x.remark_more || "",
          call_status: x.call_status || "",
          is_first_dispatch: x.is_first_dispatch || "",
          course_type: x.course_type || "",
          updated_from: "cc_unpaid_list",
        });
      }

      if (data.length < 100) break;
      pageNo++;
    }
  }

  fs.writeFileSync(
    path.join(LOG_DIR, "lead_source_cc_unpaid_api_samples.json"),
    JSON.stringify(samples, null, 2),
    "utf8"
  );

  const headers = [
    "stu_id","user_id","student_name","source","source_code","register_time","add_time",
    "dispatch_time","sales_name","sales_group","group_id","pay_intention",
    "last_free_status","last_free_time_local","remark","remark_more","call_status",
    "is_first_dispatch","course_type","updated_from"
  ];

  writeCsv(RAW, all, headers);

  const oldRows = readCsv(OUT);
  const map = new Map();
  for (const r of oldRows) map.set(String(r.stu_id || r.user_id || ""), r);
  for (const r of all) map.set(String(r.stu_id || r.user_id || ""), r);

  const finalRows = Array.from(map.values()).filter(r => String(r.stu_id || r.user_id || "").trim());
  writeCsv(OUT, finalRows, headers);

  console.log("RESULT", JSON.stringify({
    incomingRows: all.length,
    oldRows: oldRows.length,
    finalRows: finalRows.length,
    raw: RAW,
    out: OUT,
  }, null, 2));

  await browser.close();
}

main().catch(e => {
  console.error(e.stack || e);
  process.exit(1);
});

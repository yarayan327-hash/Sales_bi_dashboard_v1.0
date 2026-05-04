#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const INPUT_DIR = path.join(ROOT, "sales-engine/data/input");
const LOG_DIR = path.join(ROOT, "sales-engine/logs");

const RAW_OUT = path.join(INPUT_DIR, "call_voice_export_calls_latest.csv");
const FACT_OUT = path.join(ROOT, "public/data/fact_calls.csv");

const SCRAPER = path.join(ROOT, "sales-engine/scripts/04_crm_scrape_voice_links.cjs");

function pad(n) {
  return String(n).padStart(2, "0");
}

function ksaNow() {
  return new Date(Date.now() + 3 * 3600 * 1000);
}

function fmtDate(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function monthStartEnd() {
  const now = ksaNow();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m, now.getUTCDate()));

  return { start, end };
}

function addDays(d, days) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function clean(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function csvEscape(v) {
  const s = clean(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const nx = text[i + 1];

    if (q) {
      if (ch === '"' && nx === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        q = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') q = true;
      else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (ch !== "\r") {
        cur += ch;
      }
    }
  }

  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map(h => h.replace(/^\uFEFF/, "").trim());

  return rows
    .slice(1)
    .filter(r => r.some(x => clean(x)))
    .map(r => {
      const o = {};
      headers.forEach((h, i) => {
        o[h] = r[i] || "";
      });
      return o;
    });
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  return parseCsv(fs.readFileSync(file, "utf8"));
}

function writeCsv(file, rows, cols) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const content = [
    cols.join(","),
    ...rows.map(r => cols.map(c => csvEscape(r[c])).join(",")),
  ].join("\n") + "\n";

  fs.writeFileSync(file, content, "utf8");
}

function normalizeRawCall(r) {
  return {
    user_id: clean(r.user_id || r.stu_id || ""),
    sales_name: clean(r.sales_name || r.cc_name || ""),
    seat_id: clean(r.group_name || r.seat_id || ""),
    outbound_time: clean(r.call_time || r.outbound_time || ""),
    connect_time_sec: clean(r.connect_time_sec || ""),
    call_duration_sec: clean(r.call_duration_sec || ""),
    ring_duration_sec: clean(r.ring_duration_sec || ""),
    call_status: clean(r.call_status || ""),
    recording_url: clean(r.play_url || r.down_url || r.recording_url || ""),
  };
}

function normalizeFactCall(r) {
  return {
    user_id: clean(r.user_id),
    sales_name: clean(r.sales_name),
    seat_id: clean(r.seat_id),
    outbound_time: clean(r.outbound_time),
    connect_time_sec: clean(r.connect_time_sec),
    call_duration_sec: clean(r.call_duration_sec),
    ring_duration_sec: clean(r.ring_duration_sec),
    call_status: clean(r.call_status),
    recording_url: clean(r.recording_url),
  };
}

function keyOf(r) {
  return [
    clean(r.user_id),
    clean(r.sales_name),
    clean(r.outbound_time),
    clean(r.call_status),
  ].join("|");
}

function upsertCalls(existing, incoming) {
  const cols = [
    "user_id",
    "sales_name",
    "seat_id",
    "outbound_time",
    "connect_time_sec",
    "call_duration_sec",
    "ring_duration_sec",
    "call_status",
    "recording_url",
  ];

  const map = new Map();

  for (const r of existing.map(normalizeFactCall)) {
    const k = keyOf(r);
    if (r.user_id && r.outbound_time) map.set(k, r);
  }

  for (const r of incoming.map(normalizeRawCall)) {
    const k = keyOf(r);
    if (r.user_id && r.outbound_time) {
      const old = map.get(k) || {};
      map.set(k, { ...old, ...r });
    }
  }

  return { rows: Array.from(map.values()), cols };
}

function runScraperForWindow(startDate, endDate) {
  const env = {
    ...process.env,
    CRM_SCRAPE_MODE: "incremental",
    CRM_SCRAPE_START: `${startDate} 00:00:00`,
    CRM_SCRAPE_END: `${endDate} 23:59:59`,
    CRM_OUTPUT_CSV: RAW_OUT,
    HEADLESS: process.env.HEADLESS || "1",
  };

  console.log(`\n===== scrape calls ${startDate} => ${endDate} =====`);

  const res = spawnSync("node", [SCRAPER], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });

  fs.appendFileSync(
    path.join(LOG_DIR, "crm_calls_scraper_detail.log"),
    `\n\n===== ${startDate} => ${endDate} =====\nSTDOUT:\n${res.stdout || ""}\nSTDERR:\n${res.stderr || ""}\n`,
    "utf8"
  );

  process.stdout.write(res.stdout || "");
  process.stderr.write(res.stderr || "");

  if (res.status !== 0) {
    throw new Error(`04_crm_scrape_voice_links.cjs failed for ${startDate} => ${endDate}`);
  }
}

function main() {
  fs.mkdirSync(INPUT_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  if (!fs.existsSync(SCRAPER)) {
    throw new Error(`missing scraper: ${SCRAPER}`);
  }

  const { start, end } = monthStartEnd();

  if (fs.existsSync(RAW_OUT)) {
    fs.copyFileSync(RAW_OUT, RAW_OUT + ".bak");
    fs.unlinkSync(RAW_OUT);
  }

  let cur = new Date(start.getTime());

  while (cur <= end) {
    const winStart = new Date(cur.getTime());
    let winEnd = addDays(winStart, 6);
    if (winEnd > end) winEnd = new Date(end.getTime());

    runScraperForWindow(fmtDate(winStart), fmtDate(winEnd));

    cur = addDays(winEnd, 1);
  }

  const rawRows = readCsv(RAW_OUT);
  const existingRows = readCsv(FACT_OUT);
  const merged = upsertCalls(existingRows, rawRows);

  writeCsv(FACT_OUT, merged.rows, merged.cols);

  console.log("\n===== RESULT =====");
  console.log(JSON.stringify({
    rawRows: rawRows.length,
    oldRows: existingRows.length,
    finalRows: merged.rows.length,
    rawCsv: RAW_OUT,
    factCsv: FACT_OUT,
  }, null, 2));
}

try {
  main();
} catch (e) {
  console.error(e.stack || e);
  process.exit(1);
}

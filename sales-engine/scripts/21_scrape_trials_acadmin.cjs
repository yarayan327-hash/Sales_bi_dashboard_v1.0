#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT, "public/data");
const INPUT_DIR = path.join(ROOT, "sales-engine/data/input");
const LOG_DIR = path.join(ROOT, "sales-engine/logs");
const STORAGE_STATE = path.join(ROOT, "public/data/crm_storage_state.json");

const URL = "https://acadmin.51talk.com/admin/index#/admin/appoint/appoint/list";
const API_BASE = "https://acadmin.51talk.com/api/admin/appoint/Appoint/list";

const OUT_LATEST = path.join(INPUT_DIR, "trials_acadmin_latest.csv");
const FACT_TRIALS = path.join(DATA_DIR, "fact_trials.csv");

const FINAL_COLS = [
  "id","course_name","start_time_bj","class_start_ksa",
  "booking_type","course_type","teacher_name","teacher_id",
  "student_name","user_id","booking_id_51","merithub_id",
  "class_status","textbook","booked_at","agent_id",
  "duration_minutes","is_ordered"
];

function mkdirs() {
  for (const d of [DATA_DIR, INPUT_DIR, LOG_DIR, path.dirname(STORAGE_STATE)]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function pad(n){ return String(n).padStart(2,"0"); }
function ymd(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

function getRange() {
  if (process.env.TRIAL_START_DATE && process.env.TRIAL_END_DATE) {
    return { startDate: process.env.TRIAL_START_DATE, endDate: process.env.TRIAL_END_DATE };
  }
  const now = new Date();
  const s = new Date(now); s.setDate(s.getDate() - Number(process.env.TRIAL_SCRAPE_DAYS_BEFORE || 3));
  const e = new Date(now); e.setDate(e.getDate() + Number(process.env.TRIAL_SCRAPE_DAYS_AFTER || 3));
  return { startDate: ymd(s), endDate: ymd(e) };
}

function esc(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

function writeCsv(file, rows, cols) {
  fs.writeFileSync(file, [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c] ?? "")).join(","))].join("\n") + "\n", "utf8");
}

function parseCsv(raw) {
  raw = raw.replace(/^\uFEFF/, "");
  const out = []; let row = [], cur = "", q = false;
  for (let i=0;i<raw.length;i++) {
    const ch = raw[i], nx = raw[i+1];
    if (ch === '"' && q && nx === '"') { cur += '"'; i++; }
    else if (ch === '"') q = !q;
    else if (ch === "," && !q) { row.push(cur); cur = ""; }
    else if ((ch === "\n" || ch === "\r") && !q) {
      if (ch === "\r" && nx === "\n") i++;
      row.push(cur);
      if (row.some(x => String(x).trim() !== "")) out.push(row);
      row=[]; cur="";
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); if (row.some(x => String(x).trim() !== "")) out.push(row); }
  if (!out.length) return [];
  const h = out[0].map(x => String(x).trim());
  return out.slice(1).map(r => Object.fromEntries(h.map((k,i)=>[k,r[i]??""])));
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  return parseCsv(fs.readFileSync(file, "utf8"));
}

function clean(v){
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    return String(
      v.name || v.real_name || v.nickname || v.user_name || v.english_name || v.mobile || v.id || ""
    ).replace(/\s+/g," ").trim();
  }
  return String(v).replace(/\s+/g," ").trim();
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
  }
  return "";
}


function fmtRange(start, end) {
  if (!start) return "";
  const s = String(start).trim();
  const e = String(end || "").trim();

  const sm = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  const em = e.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);

  if (!sm) return s;

  const date = `${sm[1]}-${sm[2]}-${sm[3]}`;
  const st = `${sm[4]}:${sm[5]}`;
  const et = em ? `${em[4]}:${em[5]}` : "";

  return et ? `${date} ${st} ~ ${et}` : `${date} ${st}`;
}

function addHoursLocal(dt, hours) {
  const m = String(dt || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
  d.setHours(d.getHours() + hours);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function bjToKsaRange(start, end) {
  const s = addHoursLocal(start, -5);
  const e = addHoursLocal(end, -5);
  return fmtRange(s, e);
}

function statusNorm(v) {
  const s = clean(v);
  if (["cancel","on","end","absent","s_absent","t_absent","invalid"].includes(s)) return s;
  if (s.includes("已取消")) return "cancel";
  if (s.includes("未开始") || s.includes("未结束")) return "on";
  if (s.includes("已结束")) return "end";
  if (s.includes("学生缺席")) return "s_absent";
  if (s.includes("老师缺席")) return "t_absent";
  if (s.includes("无效")) return "invalid";
  return s;
}

function normalizeRow(r) {
  const start = clean(pick(r, ["start_time","start_time_bj","class_start_bj","bj_time","上课时间（北京）"]));
  const end = clean(pick(r, ["end_time","end_time_bj"]));

  return {
    id: clean(pick(r, ["id","主键ID","pk_id"])),
    course_name: clean(pick(r, ["title","course_name","lesson_name","name","课程名称"])),
    start_time_bj: fmtRange(start, end),
    class_start_ksa: clean(pick(r, ["class_start_ksa","start_time_ksa","ksa_time","上课时间（沙特）","class_time_ksa"])) || bjToKsaRange(start, end),
    booking_type: clean(pick(r, ["booking_type","appoint_type","预约类型"])) || (String(pick(r, ["appoint_type"])).trim() === "2" ? "代约" : "自约"),
    course_type: clean(pick(r, ["course_type","type","课程类型"])) || "free",
    teacher_name: clean(pick(r, ["teacher_name","teacher","tea_name","老师"])),
    teacher_id: clean(pick(r, ["teacher_id","tea_id","老师ID"])),
    student_name: clean(pick(r, ["student_name","student","stu_name","学生"])) || "student",
    user_id: clean(pick(r, ["user_id","student_id","stu_id","学生ID"])).replace(/[^\d]/g,""),
    booking_id_51: clean(pick(r, ["booking_id_51","appoint_id_51","appoint_id","51talk预约ID","appoint_51_id"])),
    merithub_id: clean(pick(r, ["merithub_id","merithubID","p_class_id","merithub"])),
    class_status: statusNorm(pick(r, ["class_status","status","state","课程状态"])),
    textbook: clean(pick(r, ["textbook","book_name","教材"])),
    booked_at: clean(pick(r, ["booked_at","create_time","created_at","add_time","预约时间"])),
    agent_id: clean(pick(r, ["agent_id","admin_id","cc_id"])),
    duration_minutes: clean(pick(r, ["duration_minutes","duration","时长"])) || "30",
    is_ordered: clean(pick(r, ["is_ordered","ordered","是否成交"]))
  };
}

function keyOf(r) {
  if (clean(r.id)) return "id:" + clean(r.id);
  if (clean(r.booking_id_51)) return "booking:" + clean(r.booking_id_51);
  if (clean(r.merithub_id)) return "merithub:" + clean(r.merithub_id);
  return `fallback:${clean(r.user_id)}|${clean(r.class_start_ksa)}|${clean(r.teacher_id)}`;
}

async function loginIfNeeded(page) {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);

  const needLogin = await page.locator('input[type="password"]').count();
  if (!needLogin) return;

  const username = process.env.ACADMIN_USERNAME || process.env.CRM_USERNAME;
  const password = process.env.ACADMIN_PASSWORD || process.env.CRM_PASSWORD;
  if (!username || !password) throw new Error("missing ACADMIN_USERNAME/ACADMIN_PASSWORD or CRM_USERNAME/CRM_PASSWORD");

  await page.locator('input[name="user_name"], input[name="username"], input[type="text"]').first().fill(username);
  await page.locator('input[name="password"], input[type="password"]').first().fill(password);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(5000);
  await page.context().storageState({ path: STORAGE_STATE });
}

function extractRows(json) {
  const candidates = [
    json?.res?.list,
    json?.res?.data,
    json?.res?.rows,
    json?.data?.list,
    json?.data?.rows,
    json?.data?.records,
    json?.list,
    json?.rows,
    json?.records
  ];
  for (const x of candidates) if (Array.isArray(x)) return x;
  return [];
}

function extractTotal(json) {
  return Number(json?.res?.total ?? json?.data?.total ?? json?.total ?? 0);
}

async function fetchPage(context, startDate, endDate, pageNo) {
  const url = `${API_BASE}?isAjax=1&page=${pageNo}&start_date=${startDate}&end_date=${endDate}`;

  const res = await context.request.get(url, {
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Referer": URL,
      "X-Requested-With": "XMLHttpRequest",
    },
    timeout: 60000,
  });

  const text = await res.text();
  try {
    return { ok: res.ok(), status: res.status(), url, json: JSON.parse(text), text: text.slice(0, 1000) };
  } catch {
    return { ok: res.ok(), status: res.status(), url, json: null, text: text.slice(0, 1000) };
  }
}

function merge(newRows) {
  const oldRows = readCsv(FACT_TRIALS);
  const map = new Map();

  for (const raw of oldRows) {
    const r = {};
    for (const c of FINAL_COLS) r[c] = raw[c] ?? "";
    map.set(keyOf(r), r);
  }

  let addedOrUpdated = 0;

  for (const raw of newRows) {
    const r = normalizeRow(raw);
    const k = keyOf(r);
    if (!k || k === "fallback:||") continue;

    const prev = map.get(k) || {};
    map.set(k, { ...prev, ...r });
    addedOrUpdated += 1;
  }

  const finalRows = Array.from(map.values());
  writeCsv(FACT_TRIALS, finalRows, FINAL_COLS);

  return { oldRows: oldRows.length, incomingRows: newRows.length, upsertedRows: addedOrUpdated, finalRows: finalRows.length };
}

async function main() {
  mkdirs();
  const { startDate, endDate } = getRange();

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "0",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const context = await browser.newContext(fs.existsSync(STORAGE_STATE) ? { storageState: STORAGE_STATE } : {});
  const page = await context.newPage();

  try {
    await loginIfNeeded(page);

    const all = [];
    let total = 0;

    for (let pageNo = 1; pageNo <= Number(process.env.TRIAL_MAX_PAGES || 300); pageNo++) {
      const resp = await fetchPage(context, startDate, endDate, pageNo);

      if (!resp.ok || !resp.json) {
        console.log("bad response", resp.status, resp.url, resp.text);
        break;
      }

      if (pageNo === 1) {
        total = extractTotal(resp.json);
        console.log("API:", resp.url);
        console.log("total:", total);
        console.log("top keys:", Object.keys(resp.json || {}));
        fs.writeFileSync(path.join(LOG_DIR, "acadmin_trials_api_sample.json"), JSON.stringify(resp.json, null, 2), "utf8");

        if (resp.json && resp.json.code && ![0, 10000].includes(Number(resp.json.code))) {
          throw new Error("ACADMIN API failed: " + JSON.stringify(resp.json).slice(0, 1000));
        }

        if (String(resp.json?.msg || "").includes("登录") || String(resp.text || "").includes("登录")) {
          throw new Error("ACADMIN login expired. Please refresh storage_state.");
        }
      }

      const rows = extractRows(resp.json);
      console.log(`page ${pageNo}: ${rows.length}`);

      if (!rows.length) break;
      all.push(...rows);

      if (total && all.length >= total) break;
    }

    const normalized = all.map(normalizeRow);
    writeCsv(OUT_LATEST, normalized, FINAL_COLS);

    const stat = merge(all);
    console.log("Generated:", OUT_LATEST);
    console.log("Upserted:", FACT_TRIALS);
    console.log(JSON.stringify(stat, null, 2));

  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

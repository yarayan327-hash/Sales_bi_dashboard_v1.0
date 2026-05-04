#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const LOG_DIR = path.join(ROOT, "sales-engine/logs");
const STORAGE_STATE = path.join(ROOT, "public/data/crm_storage_state.json");

const CRM_HOME_URL = "https://crm.51talk.com/admin/main.php";
const ORDER_URL = "https://crm.51talk.com/admin/order/new_order_list_new.php";

const OUT = path.join(ROOT, "public/data/fact_orders.csv");
const INPUT = path.join(ROOT, "sales-engine/data/input/orders_crm_latest.csv");

const HEADLESS = process.env.HEADLESS !== "0";

const DEFAULT_AGENTS = [
  "51habiba.hassan",
  "EGCC-eman.amr",
  "EGCC-nadahassan",
  "51nadamuhammad",
  "EGCC-fatmamohamed",
  "EGCC-maiwaheed",
  "EGCC-tasneemmahmoud",
];

function clean(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function csvEscape(v) {
  const s = clean(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(file, rows, cols) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = [cols.join(",")]
    .concat(rows.map(r => cols.map(c => csvEscape(r[c])).join(",")))
    .join("\n");
  fs.writeFileSync(file, body + "\n", "utf8");
}

function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (q) {
      if (ch === '"' && nx === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (ch !== "\r") cur += ch;
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).filter(r => r.some(x => clean(x))).map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i] || "");
    return o;
  });
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  return parseCsv(fs.readFileSync(file, "utf8"));
}

function getAgents() {
  const candidates = [
    path.join(ROOT, "public/data/dim_agent.csv"),
    path.join(ROOT, "public/data/dim_agents.csv"),
    path.join(ROOT, "public/data/dim_cc.csv"),
  ];

  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    const rows = readCsv(f);
    const names = [];
    for (const r of rows) {
      const values = Object.values(r).map(clean);
      for (const v of values) {
        if (
          DEFAULT_AGENTS.includes(v) ||
          /^51habiba\.hassan$|^EGCC-eman\.amr$|^EGCC-nadahassan$|^51nadamuhammad$|^EGCC-fatmamohamed$|^EGCC-maiwaheed$|^EGCC-tasneemmahmoud$/i.test(v)
        ) {
          names.push(v);
        }
      }
    }
    const uniq = [...new Set(names)];
    if (uniq.length) return uniq;
  }

  return DEFAULT_AGENTS;
}

function pad(n) { return String(n).padStart(2, "0"); }

function ksaDate() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 3 * 3600000);
}

function monthRange() {
  const d = ksaDate();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return {
    start: `${y}-${pad(m)}-01`,
    end: `${y}-${pad(m)}-${pad(d.getDate())}`,
  };
}

function normOrder(r) {
  const pick = (...ks) => {
    for (const k of ks) {
      if (r[k] !== undefined && clean(r[k])) return clean(r[k]);
    }
    return "";
  };

  return {
    order_id: pick("order_id", "订单ID", "订单号", "id"),
    user_name: pick("user_name", "用户姓名", "学员姓名", "姓名"),
    user_id: pick("user_id", "学员ID", "用户ID", "stu_id").replace(/[^\d]/g, ""),
    sales_name_raw: pick("sales_name_raw", "归属人", "销售", "销售姓名", "CC"),
    sales_group: pick("sales_group", "销售组", "组别", "团队"),
    original_price: pick("original_price", "原价", "套餐金额", "定价币种套餐金额"),
    paid_amount: pick("paid_amount", "支付金额", "定价币种支付金额", "实付金额"),
    package_name: pick("package_name", "套餐", "套餐名称", "产品名称"),
    order_time: pick("order_time", "订单时间", "创建时间", "下单时间"),
    payment_method: pick("payment_method", "支付方式"),
    pay_currency: pick("pay_currency", "币种", "支付币种", "定价币种"),
    discount_amount: pick("discount_amount", "优惠金额", "定价币种优惠金额"),
    order_status: pick("order_status", "订单状态", "状态"),
    processed_time: pick("processed_time", "支付时间", "处理时间", "成功时间"),
    search_keyword: pick("search_keyword") || "crm_direct",
  };
}

function upsert(existing, incoming) {
  const cols = [
    "order_id", "user_name", "user_id", "sales_name_raw", "sales_group",
    "original_price", "paid_amount", "package_name", "order_time",
    "payment_method", "pay_currency", "discount_amount", "order_status",
    "processed_time", "search_keyword"
  ];

  const map = new Map();
  for (const r of existing.map(normOrder)) {
    if (r.order_id) map.set(r.order_id, r);
  }
  for (const r of incoming.map(normOrder)) {
    if (r.order_id) map.set(r.order_id, r);
  }

  return { rows: [...map.values()], cols };
}

async function ensureLogin(page) {
  await page.goto(CRM_HOME_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);

  if (page.url().includes("admin_login")) {
    throw new Error("CRM login expired. Refresh public/data/crm_storage_state.json first.");
  }
}

async function setDateAndAgent(page, start, end, agent) {
  await page.evaluate(({ start, end, agent }) => {
    const setValue = (el, value) => {
      if (!el) return false;
      el.value = value;
      el.setAttribute("value", value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };

    const inputs = Array.from(document.querySelectorAll("input"));
    const dateInputs = inputs.filter(x => {
      const t = `${x.name || ""} ${x.id || ""} ${x.placeholder || ""}`.toLowerCase();
      return /start|end|time|date|开始|截止|日期/.test(t);
    });

    if (dateInputs[0]) setValue(dateInputs[0], start);
    if (dateInputs[1]) setValue(dateInputs[1], end);

    for (const name of ["start_time", "start_date", "begin_time", "begin_date", "stime"]) {
      setValue(document.querySelector(`input[name="${name}"], #${name}`), start);
    }
    for (const name of ["end_time", "end_date", "finish_time", "etime"]) {
      setValue(document.querySelector(`input[name="${name}"], #${name}`), end);
    }

    const selects = Array.from(document.querySelectorAll("select"));
    const ownerSelect = selects.find(s =>
      Array.from(s.options).some(o => (o.textContent || "").trim() === agent)
    );

    if (ownerSelect) {
      const opt = Array.from(ownerSelect.options).find(o => (o.textContent || "").trim() === agent);
      ownerSelect.value = opt.value;
      ownerSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, { start, end, agent });

  await page.waitForTimeout(800);
}

async function clickSearch(page) {
  const selectors = [
    'input[value*="搜索"]',
    'input[value*="查询"]',
    'button:has-text("搜索")',
    'button:has-text("查询")',
    'a:has-text("搜索")',
    'a:has-text("查询")',
    'input[type="submit"]',
    'button[type="submit"]'
  ];

  for (const s of selectors) {
    const loc = page.locator(s).first();
    if (await loc.count()) {
      await loc.click().catch(() => {});
      await page.waitForTimeout(4000);
      return;
    }
  }

  await page.keyboard.press("Enter").catch(() => {});
  await page.waitForTimeout(4000);
}

async function scrapeOrders(page, agent) {
  const rows = await page.evaluate((agent) => {
    const tables = Array.from(document.querySelectorAll("table"));
    const out = [];

    for (const table of tables) {
      const trs = Array.from(table.querySelectorAll("tr"));
      if (trs.length < 2) continue;

      let headerCells = [];
      let headerIndex = -1;

      for (let i = 0; i < trs.length; i++) {
        const hs = Array.from(trs[i].querySelectorAll("th,td"))
          .map(x => (x.innerText || "").trim().replace(/\s+/g, " "));
        const hjoin = hs.join(" ");
        if (hjoin.includes("订单号") && hjoin.includes("学员ID") && hjoin.includes("套餐内容")) {
          headerCells = hs;
          headerIndex = i;
          break;
        }
      }

      if (headerIndex < 0 || !headerCells.length) continue;

      for (const tr of trs.slice(headerIndex + 1)) {
        const cells = Array.from(tr.querySelectorAll("td"))
          .map(x => (x.innerText || "").trim().replace(/\s+/g, " "));

        if (cells.length < 10) continue;
        if (!/^\d{7,}$/.test(cells[0] || "")) continue;

        const obj = {};
        headerCells.forEach((h, i) => { if (h) obj[h] = cells[i] || ""; });
        obj.__agent = agent;
        out.push(obj);
      }
    }

    return out;
  }, agent);

  return rows.map(r => ({
    order_id: r["订单号"] || "",
    user_name: r["用户"] || "",
    user_id: r["学员ID"] || "",
    sales_name_raw: r["业绩归属销售"] || agent,
    sales_group: r["业绩归属销售组"] || "",
    original_price: r["总金额(套餐定价币种)"] || "",
    paid_amount: r["定价币种支付金额"] || "",
    package_name: r["套餐内容"] || "",
    order_time: r["订单时间"] || "",
    payment_method: r["支付方式"] || "",
    pay_currency: r["支付币种"] || "",
    discount_amount: r["优惠金额(支付币种优惠金额)"] || "",
    order_status: r["订单状态"] || "",
    processed_time: r["处理时间"] || "",
    search_keyword: r["搜索词"] || `crm_direct_${agent}`,
  })).filter(x => x.order_id);
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(INPUT), { recursive: true });

  const agents = getAgents();
  const { start, end } = monthRange();

  console.log("agents:", agents);
  console.log("date range:", start, end);

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const context = await browser.newContext(
    fs.existsSync(STORAGE_STATE) ? { storageState: STORAGE_STATE } : {}
  );

  const page = await context.newPage();

  await ensureLogin(page);

  const allRows = [];

  for (const agent of agents) {
    console.log("===== agent:", agent, "=====");
    await page.goto(ORDER_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    const body = await page.locator("body").innerText().catch(() => "");
    if (page.url().includes("admin_login") || body.includes("登录")) {
      throw new Error("CRM order page redirected to login.");
    }

    await setDateAndAgent(page, start, end, agent);
    await clickSearch(page);

    const htmlFile = path.join(LOG_DIR, `crm_orders_${agent.replace(/[^a-zA-Z0-9_.-]/g, "_")}.html`);
    fs.writeFileSync(htmlFile, await page.content(), "utf8");

    const rows = await scrapeOrders(page, agent);
    console.log("rows:", rows.length);
    allRows.push(...rows);
  }

  await page.screenshot({
    path: path.join(LOG_DIR, "crm_orders_last_page.png"),
    fullPage: true,
  });

  if (!allRows.length) {
    throw new Error("No CRM order rows scraped for target agents.");
  }

  const existing = readCsv(OUT);
  const merged = upsert(existing, allRows);

  writeCsv(INPUT, allRows, merged.cols);
  writeCsv(OUT, merged.rows, merged.cols);

  console.log(JSON.stringify({
    incomingRows: allRows.length,
    finalRows: merged.rows.length,
    input: INPUT,
    output: OUT,
  }, null, 2));

  await browser.close();
}

main().catch(e => {
  console.error(e.stack || e);
  process.exit(1);
});

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(REPO_ROOT, "public/data");
const OUTPUT_DIR = path.join(__dirname, "../output");
const LATEST_DIR = path.join(OUTPUT_DIR, "latest");

function parseCsv(raw: string): Record<string, string>[] {
  raw = raw.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length <= 1) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"' && inQuotes && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }

    out.push(cur);
    return out.map((x) => x.trim());
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

function normalizeDate(val: any): string {
  if (!val) return "";
  let s = String(val).trim();
  s = s.split(/[T ]/)[0];
  s = s.replace(/\//g, "-");

  const parts = s.split("-");
  if (parts.length !== 3) return "";

  const y = parts[0];
  const m = parts[1].padStart(2, "0");
  const d = parts[2].padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function normalizeNum(val: any): number {
  if (!val) return 0;
  const s = String(val).replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function pick(r: any, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

function loadCsv(name: string): any[] {
  const p = path.join(DATA_DIR, name);

  if (!fs.existsSync(p)) {
    console.warn(`Missing CSV: ${p}`);
    return [];
  }

  return parseCsv(fs.readFileSync(p, "utf-8"));
}

function rate(a: number, b: number): number {
  if (!b) return 0;
  return Number((a / b).toFixed(4));
}

async function run(queryDate: string) {
  const reportDate = normalizeDate(queryDate);
  const monthStart = `${reportDate.slice(0, 7)}-01`;

  const leads = loadCsv("fact_leads.csv");
  const trials = loadCsv("fact_trials.csv");
  const orders = loadCsv("fact_orders.csv");

  const leadDate = (r: any) =>
    normalizeDate(pick(r, ["assigned_time", "add_time", "create_time", "分配时间", "线索创建时间"]));

  const trialDate = (r: any) =>
    normalizeDate(pick(r, ["class_start_ksa", "start_time_bj", "上课时间（沙特）", "上课时间（北京）"]));

  const orderDate = (r: any) =>
    normalizeDate(pick(r, ["processed_time", "order_time", "处理时间", "订单时间"]));

  const inMtd = (d: string) => d >= monthStart && d <= reportDate;

  const mtdLeads = leads.filter((r) => inMtd(leadDate(r)));
  const yLeads = leads.filter((r) => leadDate(r) === reportDate);

  const mtdTrials = trials.filter((r) => inMtd(trialDate(r)));
  const yTrials = trials.filter((r) => trialDate(r) === reportDate);

  const isAttended = (r: any) => {
    const st = String(pick(r, ["class_status", "课程状态"])).toLowerCase();
    return st.includes("end") || st.includes("on") || st.includes("attend") || st.includes("success");
  };

  const mtdAttended = mtdTrials.filter(isAttended);
  const yAttended = yTrials.filter(isAttended);

  const mtdOrders = orders.filter((r) => inMtd(orderDate(r)));
  const yOrders = orders.filter((r) => orderDate(r) === reportDate);

  const mtdGmv = mtdOrders.reduce(
    (sum, r) => sum + normalizeNum(pick(r, ["paid_amount", "定价币种支付金额"])),
    0
  );

  const yGmv = yOrders.reduce(
    (sum, r) => sum + normalizeNum(pick(r, ["paid_amount", "定价币种支付金额"])),
    0
  );

  const payload = {
    report_date: reportDate,
    yesterday: {
      leads: yLeads.length,
      booked: yTrials.length,
      attended: yAttended.length,
      orders: yOrders.length,
      gmv: yGmv,
      booking_rate: rate(yTrials.length, yLeads.length),
      attendance_rate: rate(yAttended.length, yTrials.length),
      attended_conversion_rate: rate(yOrders.length, yAttended.length),
      lead_conversion_rate: rate(yOrders.length, yLeads.length),
      aov: yOrders.length ? Math.round(yGmv / yOrders.length) : 0,
    },
    mtd: {
      leads: mtdLeads.length,
      booked: mtdTrials.length,
      attended: mtdAttended.length,
      orders: mtdOrders.length,
      gmv: mtdGmv,
      booking_rate: rate(mtdTrials.length, mtdLeads.length),
      attendance_rate: rate(mtdAttended.length, mtdTrials.length),
      attended_conversion_rate: rate(mtdOrders.length, mtdAttended.length),
      lead_conversion_rate: rate(mtdOrders.length, mtdLeads.length),
      aov: mtdOrders.length ? Math.round(mtdGmv / mtdOrders.length) : 0,
    },
    vs_last_month_same_period: {
      leads_delta: 0,
      booked_delta: 0,
      attended_delta: 0,
      orders_delta: 0,
      gmv_delta: 0,
    },
    debug: {
      source_rows: {
        leads: leads.length,
        trials: trials.length,
        orders: orders.length,
      },
      ranges: {
        yesterday: reportDate,
        mtd: {
          start: monthStart,
          end: reportDate,
        },
      },
    },
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(LATEST_DIR, { recursive: true });

  fs.writeFileSync(
    path.join(OUTPUT_DIR, `daily_metrics_${reportDate}.json`),
    JSON.stringify(payload, null, 2)
  );

  fs.writeFileSync(
    path.join(LATEST_DIR, "daily_metrics.json"),
    JSON.stringify(payload, null, 2)
  );

  console.log(`✅ daily_metrics generated: ${reportDate}`);
  console.log(
    `MTD leads=${payload.mtd.leads}, trials=${payload.mtd.booked}, attended=${payload.mtd.attended}, orders=${payload.mtd.orders}, gmv=${payload.mtd.gmv}`
  );
}

const target =
  process.argv[2] ||
  new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);

run(target);

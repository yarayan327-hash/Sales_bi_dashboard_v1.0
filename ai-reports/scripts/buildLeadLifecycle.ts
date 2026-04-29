import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(REPO_ROOT, "public/data");

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

function loadCsv(name: string): Record<string, string>[] {
  const p = path.join(DATA_DIR, name);
  if (!fs.existsSync(p)) return [];
  return parseCsv(fs.readFileSync(p, "utf-8"));
}

function writeCsv(filePath: string, rows: Record<string, any>[]) {
  if (!rows.length) {
    fs.writeFileSync(filePath, "", "utf-8");
    return;
  }

  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");

  fs.writeFileSync(filePath, "\uFEFF" + csv, "utf-8");
}

function pick(r: any, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function normalizeUserId(v: any): string {
  const s = String(v ?? "").trim();
  const m = s.match(/\d+/);
  const uid = m ? m[0] : "";
  if (!uid || uid === "0") return "";
  return uid;
}

function normalizeDate(v: any): string {
  if (!v) return "";
  let s = String(v).trim().replace(/\//g, "-");
  s = s.split("T")[0].split(" ")[0];
  const ps = s.split("-");
  if (ps.length !== 3) return "";
  return `${ps[0]}-${ps[1].padStart(2, "0")}-${ps[2].padStart(2, "0")}`;
}

function pickTime(r: any, keys: string[]): string {
  const raw = pick(r, keys);
  const s = String(raw ?? "").trim();
  if (!s) return "";

  // 必须包含 YYYY-MM-DD 或 YYYY/MM/DD 才认为是时间
  if (!/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) return "";

  return s;
}

function toTimeMs(v: any): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const d = new Date(s.replace(/\//g, "-"));
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function num(v: any): number {
  const s = String(v ?? "").replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function isConnectedCall(r: any): boolean {
  const status = pick(r, ["call_status", "接听状态", "answered_status"]).toLowerCase();
  const duration = num(pick(r, ["call_duration_sec", "通话时长", "call_duration"]));
  return status.includes("双方接通") || status.includes("connected") || duration > 0;
}

function callDuration(r: any): number {
  const raw = pick(r, ["call_duration_sec", "通话时长", "call_duration"]);
  const s = String(raw ?? "").trim();

  if (!s) return 0;

  const hms = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hms) {
    const h = Number(hms[1]);
    const m = Number(hms[2]);
    const sec = Number(hms[3]);
    return h * 3600 + m * 60 + sec;
  }

  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0 && n <= 24 * 3600) return n;
  }

  return 0;
}

function callSlot(ms: number): string {
  if (!ms) return "";
  const h = new Date(ms).getHours();
  if (h >= 9 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "late";
}

function mergeOrders(factOrders: any[], manualOrders: any[]) {
  const m = new Map<string, any>();

  for (const r of factOrders) {
    const oid = pick(r, ["order_id", "订单号"]);
    if (oid) m.set(oid, r);
  }

  for (const r of manualOrders) {
    const oid = pick(r, ["order_id", "订单号"]);
    if (oid) m.set(oid, r);
  }

  return Array.from(m.values());
}

function main() {
  const leads = loadCsv("fact_leads.csv");
  const trials = loadCsv("fact_trials.csv");
  const calls = loadCsv("fact_calls.csv");
  const orders = mergeOrders(loadCsv("fact_orders.csv"), loadCsv("manual_orders.csv"));

  const leadMap = new Map<string, any[]>();
  for (const r of leads) {
    const uid = normalizeUserId(pick(r, ["user_id", "stu_id", "学员ID", "学生ID"]));
    if (!uid) continue;
    if (!leadMap.has(uid)) leadMap.set(uid, []);
    leadMap.get(uid)!.push(r);
  }

  const trialMap = new Map<string, any[]>();
  for (const r of trials) {
    const uid = normalizeUserId(pick(r, ["user_id", "学员ID", "学生ID"]));
    if (!uid) continue;
    if (!trialMap.has(uid)) trialMap.set(uid, []);
    trialMap.get(uid)!.push(r);
  }

  const callMap = new Map<string, any[]>();
  for (const r of calls) {
    const uid = normalizeUserId(pick(r, ["user_id", "学员ID", "学生ID"]));
    if (!uid) continue;
    if (!callMap.has(uid)) callMap.set(uid, []);
    callMap.get(uid)!.push(r);
  }

  const orderMap = new Map<string, any[]>();
  for (const r of orders) {
    const uid = normalizeUserId(pick(r, ["user_id", "学员ID", "学生ID"]));
    if (!uid) continue;
    if (!orderMap.has(uid)) orderMap.set(uid, []);
    orderMap.get(uid)!.push(r);
  }

  const userIds = new Set<string>([
    ...leadMap.keys(),
    ...trialMap.keys(),
    ...callMap.keys(),
    ...orderMap.keys(),
  ]);

  const rows: Record<string, any>[] = [];

  for (const userId of Array.from(userIds).sort()) {
    const userLeads = (leadMap.get(userId) || []).sort(
      (a, b) => toTimeMs(pick(a, ["assigned_time", "add_time", "分配时间"])) - toTimeMs(pick(b, ["assigned_time", "add_time", "分配时间"]))
    );

    const firstLead = userLeads[0] || {};
    const currentLead = userLeads[userLeads.length - 1] || {};

    const userTrials = (trialMap.get(userId) || []).sort(
      (a, b) => toTimeMs(pick(a, ["class_start_ksa", "start_time_bj", "上课时间（沙特）", "上课时间（北京）"])) - toTimeMs(pick(b, ["class_start_ksa", "start_time_bj", "上课时间（沙特）", "上课时间（北京）"]))
    );

    const userCalls = (callMap.get(userId) || []).sort(
      (a, b) => toTimeMs(pickTime(a, ["outbound_time", "外呼时间", "通话时间"])) - toTimeMs(pickTime(b, ["outbound_time", "外呼时间", "通话时间"]))
    );

    const userOrders = (orderMap.get(userId) || []).sort(
      (a, b) => toTimeMs(pick(a, ["processed_time", "order_time", "处理时间", "订单时间"])) - toTimeMs(pick(b, ["processed_time", "order_time", "处理时间", "订单时间"]))
    );

    const latestTrial = userTrials[userTrials.length - 1] || {};
    const latestOrder = userOrders[userOrders.length - 1] || {};

    const attendedTrials = userTrials.filter((r) => {
      const s = pick(r, ["class_status", "课程状态"]).toLowerCase();
      return s.includes("end") || s.includes("on") || s.includes("attend") || s.includes("success");
    });

    const cancelledTrials = userTrials.filter((r) => {
      const s = pick(r, ["class_status", "课程状态"]).toLowerCase();
      return s.includes("cancel");
    });

    const absentTrials = userTrials.filter((r) => {
      const s = pick(r, ["class_status", "课程状态"]).toLowerCase();
      return s.includes("absent");
    });

    const connectedCalls = userCalls.filter(isConnectedCall);
    const effectiveCalls = connectedCalls.filter((r) => callDuration(r) > 20);
    const shortCalls = connectedCalls.filter((r) => {
      const d = callDuration(r);
      return d > 0 && d <= 20;
    });

    const totalConnectedDurationSec = connectedCalls.reduce((sum, r) => sum + callDuration(r), 0);

    const callDays = new Set(
      userCalls.map((r) => normalizeDate(pickTime(r, ["outbound_time", "外呼时间", "通话时间"]))).filter(Boolean)
    );

    const callSlots = new Set(
      userCalls.map((r) => callSlot(toTimeMs(pickTime(r, ["outbound_time", "外呼时间", "通话时间"])))).filter(Boolean)
    );

    const attendedTimeMs = attendedTrials.length
      ? toTimeMs(pick(attendedTrials[attendedTrials.length - 1], ["class_start_ksa", "start_time_bj", "上课时间（沙特）", "上课时间（北京）"]))
      : 0;

    const postClassEffectiveCalls = attendedTimeMs
      ? effectiveCalls.filter((r) => toTimeMs(pickTime(r, ["outbound_time", "外呼时间", "通话时间"])) > attendedTimeMs)
      : [];

    const postWithin6h = postClassEffectiveCalls.some((r) => {
      const t = toTimeMs(pickTime(r, ["outbound_time", "外呼时间", "通话时间"]));
      return t > attendedTimeMs && t <= attendedTimeMs + 6 * 3600 * 1000;
    });

    const postAfter6h = postClassEffectiveCalls.some((r) => {
      const t = toTimeMs(pickTime(r, ["outbound_time", "外呼时间", "通话时间"]));
      return t > attendedTimeMs + 6 * 3600 * 1000;
    });

    let leadQualityCategory = "unknown";
    let leadQualityReason = "data_missing_or_insufficient";
    let leadQualityConfidence = "low";

    if (userCalls.length >= 5 && callSlots.size >= 3 && effectiveCalls.length === 0) {
      leadQualityCategory = "low_quality_lead";
      leadQualityReason = "no_answer_multiple_time_slots";
      leadQualityConfidence = "medium";
    } else if (userCalls.length > 0 && userCalls.length < 5 && effectiveCalls.length === 0) {
      leadQualityCategory = "unknown";
      leadQualityReason = "insufficient_contact_attempts";
      leadQualityConfidence = "low";
    } else if (effectiveCalls.length > 0 || userTrials.length > 0 || userOrders.length > 0) {
      leadQualityCategory = "valid_lead";
      leadQualityReason = "has_engagement_or_conversion_signal";
      leadQualityConfidence = "medium";
    }

    const isOrdered = userOrders.length > 0;

    let finalStatus = "unknown";
    if (isOrdered) finalStatus = "closed";
    else if (attendedTrials.length > 0) finalStatus = "attended_not_closed";
    else if (userTrials.length > 0) finalStatus = "booked_not_attended";
    else finalStatus = "no_booking";

    rows.push({
      user_id: userId,

      current_cc_id: pick(currentLead, ["sales_id", "new_admin_id", "销售ID"]),
      current_cc_name: pick(currentLead, ["sales_name", "销售名称"]),
      current_cc_group: pick(currentLead, ["sales_group", "销售组"]),
      current_assigned_time: pick(currentLead, ["assigned_time", "add_time", "分配时间"]),

      first_cc_id: pick(firstLead, ["sales_id", "new_admin_id", "销售ID"]),
      first_cc_name: pick(firstLead, ["sales_name", "销售名称"]),
      first_assigned_time: pick(firstLead, ["assigned_time", "add_time", "分配时间"]),

      assign_count: userLeads.length,
      is_reassigned: userLeads.length > 1 ? "TRUE" : "FALSE",
      lead_source_raw: pick(currentLead, ["lead_source", "desc", "线索来源", "线索状态"]),

      has_trial_booked: userTrials.length > 0 ? "TRUE" : "FALSE",
      trial_count: userTrials.length,
      first_trial_time: pick(userTrials[0] || {}, ["class_start_ksa", "start_time_bj", "上课时间（沙特）", "上课时间（北京）"]),
      latest_trial_time: pick(latestTrial, ["class_start_ksa", "start_time_bj", "上课时间（沙特）", "上课时间（北京）"]),
      latest_trial_status: pick(latestTrial, ["class_status", "课程状态"]),
      is_cancelled: cancelledTrials.length > 0 ? "TRUE" : "FALSE",
      is_absent: absentTrials.length > 0 ? "TRUE" : "FALSE",
      is_attended: attendedTrials.length > 0 ? "TRUE" : "FALSE",

      outbound_call_count: userCalls.length,
      connected_call_count: connectedCalls.length,
      effective_connected_call_count: effectiveCalls.length,
      short_call_count_lt20s: shortCalls.length,
      total_connected_duration_sec: totalConnectedDurationSec,
      distinct_call_days: callDays.size,
      distinct_call_time_slots: callSlots.size,
      first_call_time: pickTime(userCalls[0] || {}, ["outbound_time", "外呼时间", "通话时间"]),
      last_call_time: pickTime(userCalls[userCalls.length - 1] || {}, ["outbound_time", "外呼时间", "通话时间"]),
      last_call_duration_sec: callDuration(userCalls[userCalls.length - 1] || {}),

      post_class_call_within_6h: postWithin6h ? "TRUE" : "FALSE",
      post_class_call_after_6h: postAfter6h ? "TRUE" : "FALSE",

      is_ordered: isOrdered ? "TRUE" : "FALSE",
      order_id: pick(latestOrder, ["order_id", "订单号"]),
      order_time: pick(latestOrder, ["order_time", "订单时间"]),
      processed_time: pick(latestOrder, ["processed_time", "处理时间"]),
      paid_amount: pick(latestOrder, ["paid_amount", "定价币种支付金额"]),
      package_name: pick(latestOrder, ["package_name", "套餐内容"]),
      payment_method: pick(latestOrder, ["payment_method", "支付方式"]),
      closed_sales_name: pick(latestOrder, ["sales_name_raw", "业绩归属销售"]),
      closed_sales_group: pick(latestOrder, ["sales_group", "业绩归属销售组"]),

      lead_quality_category: leadQualityCategory,
      lead_quality_reason: leadQualityReason,
      lead_quality_confidence: leadQualityConfidence,

      final_status: finalStatus,
      data_join_status: "joined_by_user_id_only",
      missing_data_flags: [
        userLeads.length ? "" : "missing_lead",
        userTrials.length ? "" : "missing_trial",
        userCalls.length ? "" : "missing_call",
        userOrders.length ? "" : "missing_order",
      ].filter(Boolean).join("|"),
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const latestPath = path.join(DATA_DIR, "lead_lifecycle_latest.csv");
  const datedPath = path.join(DATA_DIR, `lead_lifecycle_${today}.csv`);

  writeCsv(latestPath, rows);
  writeCsv(datedPath, rows);

  console.log(`✅ lead lifecycle generated`);
  console.log(`rows=${rows.length}`);
  console.log(`latest=${latestPath}`);
  console.log(`dated=${datedPath}`);
  console.log(`columns=${Object.keys(rows[0] || {}).length}`);
  console.log(JSON.stringify(rows.slice(0, 3), null, 2));
}

main();

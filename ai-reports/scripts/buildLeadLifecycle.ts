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
  return parseDateTimeMs(v);
}

function num(v: any): number {
  const s = String(v ?? "").replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function bool01(v: boolean): string {
  return v ? "1" : "0";
}

function parseDateTimeMs(v: any): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;

  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return 0;

  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const h = Number(m[4] ?? 0);
  const mi = Number(m[5] ?? 0);
  const sec = Number(m[6] ?? 0);

  // 按本地业务时间解析，不使用 JS Date 自动时区漂移
  return new Date(y, mo, d, h, mi, sec).getTime();
}

function isConnectedCall(r: any): boolean {
  const status = getCallStatus(r).toLowerCase();
  const duration = callDuration(r);
  return status.includes("双方接通") || status.includes("connected") || duration > 0;
}

function callDuration(r: any): number {
  const raw = getCallDurationRaw(r);
  const s = String(raw ?? "").trim();

  if (!s) return 0;

  // 拒绝日期时间，避免把 2026/4/1 20:29 误解析成通话时长
  if (/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) return 0;

  // 只接受明确的时长格式：00:03:49 或 00:03:49(To. 00:03:49)
  const embedded = s.match(/(?:^|\s)(\d{1,2}):(\d{2}):(\d{2})(?:\(To\.|\s|$)/);
  if (embedded) {
    const h = Number(embedded[1]);
    const m = Number(embedded[2]);
    const sec = Number(embedded[3]);
    const total = h * 3600 + m * 60 + sec;
    if (total >= 0 && total <= 24 * 3600) return total;
  }

  // 只接受纯数字秒数
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

function getCallTime(r: any): string {
  // 正常字段：outbound_time
  // 当前 fact_calls.csv 存在错位：真实外呼时间落在 connect_time_sec
  return pickTime(r, ["outbound_time", "外呼时间", "通话时间"]) ||
    pickTime(r, ["connect_time_sec"]);
}

function getCallStatus(r: any): string {
  // 正常字段：call_status
  // 当前错位：真实状态落在 ring_duration_sec
  return pick(r, ["call_status", "接听状态", "answered_status"]) ||
    pick(r, ["ring_duration_sec"]);
}

function getCallDurationRaw(r: any): string {
  // 正常字段：call_duration_sec
  // 当前错位：真实通话时长落在 call_status，例如 00:03:49(To. 00:03:49)
  return pick(r, ["call_duration_sec", "通话时长", "call_duration"]) ||
    pick(r, ["call_status"]);
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
  const reportDate = process.argv[2] || new Date().toISOString().slice(0, 10);
  const monthStart = `${reportDate.slice(0, 7)}-01`;
  const monthEnd = reportDate;

  const inMonth = (d: string) => d >= monthStart && d <= monthEnd;

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

    const currentAssignedTime = pick(currentLead, ["assigned_time", "add_time", "分配时间"]);
    const currentAssignedDate = normalizeDate(currentAssignedTime);

    // 生命周期主表只输出当月进入/分配的线索。
    // 没有 leads 记录的 user_id 不进入主表，避免 trial/call/order 孤儿数据污染 cohort。
    if (!currentAssignedDate || !inMonth(currentAssignedDate)) {
      continue;
    }

    const userTrials = (trialMap.get(userId) || []).sort(
      (a, b) => toTimeMs(pick(a, ["class_start_ksa", "start_time_bj", "上课时间（沙特）", "上课时间（北京）"])) - toTimeMs(pick(b, ["class_start_ksa", "start_time_bj", "上课时间（沙特）", "上课时间（北京）"]))
    );

    const userCalls = (callMap.get(userId) || []).sort(
      (a, b) => toTimeMs(getCallTime(a)) - toTimeMs(getCallTime(b))
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
      userCalls.map((r) => normalizeDate(getCallTime(r))).filter(Boolean)
    );

    const callSlots = new Set(
      userCalls.map((r) => callSlot(toTimeMs(getCallTime(r)))).filter(Boolean)
    );

    const attendedTimeMs = attendedTrials.length
      ? toTimeMs(pick(attendedTrials[attendedTrials.length - 1], ["class_start_ksa", "start_time_bj", "上课时间（沙特）", "上课时间（北京）"]))
      : 0;

    const postClassEffectiveCalls = attendedTimeMs
      ? effectiveCalls.filter((r) => toTimeMs(getCallTime(r)) > attendedTimeMs)
      : [];

    const postWithin6h = postClassEffectiveCalls.some((r) => {
      const t = toTimeMs(getCallTime(r));
      return t > attendedTimeMs && t <= attendedTimeMs + 6 * 3600 * 1000;
    });

    const postAfter6h = postClassEffectiveCalls.some((r) => {
      const t = toTimeMs(getCallTime(r));
      return t > attendedTimeMs + 6 * 3600 * 1000;
    });

    let leadQualityCategory = "unknown";
    let leadQualityReason = "data_missing_or_insufficient";
    let leadQualityConfidence = "low";

    if (userOrders.length > 0 || attendedTrials.length > 0 || effectiveCalls.length > 0) {
      leadQualityCategory = "valid_lead";
      leadQualityReason = "has_order_attendance_or_effective_call";
      leadQualityConfidence = "medium";
    } else if (userCalls.length >= 5 && callSlots.size >= 3 && effectiveCalls.length === 0) {
      leadQualityCategory = "low_quality_lead";
      leadQualityReason = "no_answer_multiple_time_slots";
      leadQualityConfidence = "medium";
    } else if (userCalls.length > 0 && userCalls.length < 5 && effectiveCalls.length === 0) {
      leadQualityCategory = "unknown";
      leadQualityReason = "insufficient_contact_attempts";
      leadQualityConfidence = "low";
    } else if (userTrials.length > 0) {
      leadQualityCategory = "valid_lead";
      leadQualityReason = "has_booking_signal";
      leadQualityConfidence = "low";
    }

    const isOrdered = userOrders.length > 0;

    let finalStatus = "unknown";
    if (isOrdered) finalStatus = "closed";
    else if (attendedTrials.length > 0) finalStatus = "attended_not_closed";
    else if (userTrials.length > 0) finalStatus = "booked_not_attended";
    else finalStatus = "no_booking";

    rows.push({
      report_date: reportDate,
      report_month: reportDate.slice(0, 7),
      user_id: userId,

      current_cc_id: pick(currentLead, ["sales_id", "new_admin_id", "销售ID"]),
      current_cc_name: pick(currentLead, ["sales_name", "销售名称"]),
      current_cc_group: pick(currentLead, ["sales_group", "销售组"]),
      current_assigned_time: pick(currentLead, ["assigned_time", "add_time", "分配时间"]),

      first_cc_id: pick(firstLead, ["sales_id", "new_admin_id", "销售ID"]),
      first_cc_name: pick(firstLead, ["sales_name", "销售名称"]),
      first_assigned_time: pick(firstLead, ["assigned_time", "add_time", "分配时间"]),

      assign_count: userLeads.length,
      is_reassigned: bool01(userLeads.length > 1),
      lead_source_raw: pick(currentLead, ["lead_source", "desc", "线索来源", "线索状态"]),

      has_trial_booked: bool01(userTrials.length > 0),
      trial_count: userTrials.length,
      first_trial_time: pick(userTrials[0] || {}, ["class_start_ksa", "start_time_bj", "上课时间（沙特）", "上课时间（北京）"]),
      latest_trial_time: pick(latestTrial, ["class_start_ksa", "start_time_bj", "上课时间（沙特）", "上课时间（北京）"]),
      latest_trial_status: pick(latestTrial, ["class_status", "课程状态"]),
      is_cancelled: bool01(cancelledTrials.length > 0),
      is_absent: bool01(absentTrials.length > 0),
      is_attended: bool01(attendedTrials.length > 0),

      outbound_call_count: userCalls.length,
      connected_call_count: connectedCalls.length,
      effective_connected_call_count: effectiveCalls.length,
      short_call_count_lt20s: shortCalls.length,
      total_connected_duration_sec: totalConnectedDurationSec,
      distinct_call_days: callDays.size,
      distinct_call_time_slots: callSlots.size,
      first_call_time: getCallTime(userCalls[0] || {}),
      last_call_time: getCallTime(userCalls[userCalls.length - 1] || {}),
      last_call_duration_sec: callDuration(userCalls[userCalls.length - 1] || {}),

      post_class_call_within_6h: bool01(postWithin6h),
      post_class_call_after_6h: bool01(postAfter6h),

      is_ordered: bool01(isOrdered),
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

  const latestPath = path.join(DATA_DIR, "lead_lifecycle_latest.csv");
  const datedPath = path.join(DATA_DIR, `lead_lifecycle_${reportDate}.csv`);

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

// src/metrics/tab0ProjectOverview.ts
import { isAttendedStatus } from "../utils/status";

export type Scope = "mtd" | "daily" | "all";

export interface Tab0Inputs {
  reportDate: string; // KSA YYYY-MM-DD (T-1)
  scope?: Scope;
  agents?: any[];
  leads?: any[];
  trials?: any[];
  orders?: any[];
}

export interface Tab0ProjectOverviewResult {
  scope: Scope;
  range: { start: string; end: string; mode: "mtd" | "daily" | "all" };
  mtd: { leads: number; booked: number; attended: number; orders: number; gmv: number };
  rates: {
    booking_rate: number;
    attendance_rate: number;
    attended_conversion: number;
    lead_conversion: number;
    aov: number;
  };
  vs_last_month_same_period: {
    leads_delta: number;
    booked_delta: number;
    attended_delta: number;
    orders_delta: number;
    gmv_delta: number;
  };
  debug?: any;
}

function toNum(x: any) {
  const n = Number(String(x ?? "0").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function ymdToDate(s: string) {
  const [y, m, d] = String(s || "").slice(0, 10).split("-").map((n) => Number(n));
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}
function fmtYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function monthStartYMD(reportDate: string) {
  const d = ymdToDate(reportDate);
  d.setDate(1);
  return fmtYMD(d);
}
function shiftMonthKeepDay(ymd: string, deltaMonths: number) {
  const d = ymdToDate(ymd);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + deltaMonths);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return fmtYMD(d);
}
function inRangeYMD(ymd: string, start: string, end: string) {
  if (!ymd) return false;
  return ymd >= start && ymd <= end;
}

/**
 * Robust date parser -> YYYY-MM-DD
 * Supports:
 * - "YYYY-MM-DD" / "YYYY-MM-DD HH:mm:ss"
 * - "YYYY/MM/DD HH:mm" / "YYYY/M/D H:mm"
 * - "DD/MM/YYYY HH:mm"
 */
function toYMD(raw: any): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYY/MM/DD ...
  let m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) {
    const y = m[1];
    const mo = String(Number(m[2])).padStart(2, "0");
    const d = String(Number(m[3])).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  // YYYY-MM-DD ...
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = m[1];
    const mo = String(Number(m[2])).padStart(2, "0");
    const d = String(Number(m[3])).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  // DD/MM/YYYY ...
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = String(Number(m[1])).padStart(2, "0");
    const mo = String(Number(m[2])).padStart(2, "0");
    const y = m[3];
    return `${y}-${mo}-${d}`;
  }

  return "";
}

function pickLeadYmd(r: any) {
  return toYMD(r.assigned_date_ksa ?? r.assigned_time_ksa ?? r.assigned_time ?? r.assigned_date);
}

function pickTrialYmd(r: any) {
  const ymd = toYMD(r.start_date_ksa);
  if (ymd) return ymd;

  const s = String(r.start_time_ksa ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}$/);
  if (m) return m[1];

  return toYMD(r.class_date_ksa ?? r.class_date ?? r.start_time ?? r.start_time_bj);
}

function pickOrderYmd(r: any) {
  // STRICT: processed_time only
  return toYMD(r.processed_time_ksa ?? r.processed_time);
}

function countBy(arr: any[], pick: (r: any) => string) {
  const m: Record<string, number> = {};
  for (const r of arr) {
    const k = String(pick(r) ?? "").trim() || "(empty)";
    m[k] = (m[k] || 0) + 1;
  }
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([k, v]) => ({ k, v }));
}

/** ✅ IMPORTANT: named export for App.tsx import */
export function computeTab0ProjectOverview(input: Tab0Inputs): Tab0ProjectOverviewResult {
  const reportDate = String(input.reportDate || "").slice(0, 10);
  const scope: Scope = (input.scope as Scope) || "mtd";

  const leads = Array.isArray(input.leads) ? input.leads : [];
  const trials = Array.isArray(input.trials) ? input.trials : [];
  const orders = Array.isArray(input.orders) ? input.orders : [];

  const start =
    scope === "daily" ? reportDate : scope === "mtd" ? monthStartYMD(reportDate) : "0000-01-01";
  const end = reportDate;

  // current period
  const leads_in = leads.filter((r) => inRangeYMD(pickLeadYmd(r), start, end));
  const trials_in = trials.filter((r) => inRangeYMD(pickTrialYmd(r), start, end));
  const orders_in = orders.filter((r) => inRangeYMD(pickOrderYmd(r), start, end));

  const leads_cnt = leads_in.length;
  const booked_cnt = trials_in.length;
  const attended_cnt = trials_in.filter((r) => isAttendedStatus(r.class_status)).length;

  const orders_cnt = orders_in.length;
  const gmv = orders_in.reduce((sum, r) => sum + toNum(r.paid_amount ?? r.amount ?? r.gmv), 0);

  const booking_rate = leads_cnt ? booked_cnt / leads_cnt : 0;
  const attendance_rate = booked_cnt ? attended_cnt / booked_cnt : 0;
  const attended_conversion = attended_cnt ? orders_cnt / attended_cnt : 0;
  const lead_conversion = leads_cnt ? orders_cnt / leads_cnt : 0;
  const aov = orders_cnt ? gmv / orders_cnt : 0;

  // last month same period
  const lm_start = shiftMonthKeepDay(start, -1);
  const lm_end = shiftMonthKeepDay(end, -1);

  const leads_lm = leads.filter((r) => inRangeYMD(pickLeadYmd(r), lm_start, lm_end));
  const trials_lm = trials.filter((r) => inRangeYMD(pickTrialYmd(r), lm_start, lm_end));
  const orders_lm = orders.filter((r) => inRangeYMD(pickOrderYmd(r), lm_start, lm_end));

  const leads_lm_cnt = leads_lm.length;
  const booked_lm_cnt = trials_lm.length;
  const attended_lm_cnt = trials_lm.filter((r) => isAttendedStatus(r.class_status)).length;
  const orders_lm_cnt = orders_lm.length;
  const gmv_lm = orders_lm.reduce((sum, r) => sum + toNum(r.paid_amount ?? r.amount ?? r.gmv), 0);

  return {
    scope,
    range: { start, end, mode: scope },
    mtd: { leads: leads_cnt, booked: booked_cnt, attended: attended_cnt, orders: orders_cnt, gmv },
    rates: { booking_rate, attendance_rate, attended_conversion, lead_conversion, aov },
    vs_last_month_same_period: {
      leads_delta: leads_cnt - leads_lm_cnt,
      booked_delta: booked_cnt - booked_lm_cnt,
      attended_delta: attended_cnt - attended_lm_cnt,
      orders_delta: orders_cnt - orders_lm_cnt,
      gmv_delta: gmv - gmv_lm,
    },
    debug: {
      reportDate,
      scope,
      range: { start, end },
      lm_range: { start: lm_start, end: lm_end },
      totals: { leads: leads.length, trials: trials.length, orders: orders.length },
      in_range: { leads: leads_cnt, trials: booked_cnt, attended: attended_cnt, orders: orders_cnt, gmv },
      trials_in_status_counts: countBy(trials_in, (r) => String(r.class_status ?? "(empty)")),
      orders_in_date_counts: countBy(orders_in, (r) => pickOrderYmd(r)),
      sample: {
        orders_samples: orders.slice(0, 10).map((r) => ({
          processed_time: r.processed_time,
          parsed_order_ymd: pickOrderYmd(r),
          paid_amount: r.paid_amount,
        })),
      },
    },
  };
}
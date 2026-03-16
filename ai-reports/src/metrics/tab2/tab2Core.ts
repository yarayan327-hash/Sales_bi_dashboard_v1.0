// src/metrics/tab2/tab2Core.ts
import { attachSalesMeta } from "../../transformers/joinSales";
import { isAttendedStatus } from "../../utils/status";

const EFFECTIVE_SEC = 20;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function toNum(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function normalizeSalesKey(v: any) {
  return String(v ?? "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function safeSalesName(v: any) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function ymdFromTs(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateStartTs(reportDate: string) {
  return new Date(`${String(reportDate).slice(0, 10)} 00:00:00`).getTime();
}

function sundayStartYmd(reportDate: string) {
  const dt = new Date(`${String(reportDate).slice(0, 10)} 00:00:00`);
  const day = dt.getDay(); // 0=Sun
  dt.setDate(dt.getDate() - day);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthStartYmd(reportDate: string) {
  const dt = new Date(`${String(reportDate).slice(0, 10)} 00:00:00`);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function inRangeYmd(ymd: string, start: string, end: string) {
  return !!ymd && ymd >= start && ymd <= end;
}

function sortRows(rows: any[]) {
  return [...rows].sort((a, b) => {
    const ga = String(a.sales_group || "999");
    const gb = String(b.sales_group || "999");
    if (ga !== gb) return ga.localeCompare(gb);
    return Number(b.attended ?? 0) - Number(a.attended ?? 0);
  });
}

function emptyAggRow(sales_group: string, sales_agent: string) {
  return {
    sales_group,
    sales_agent,
    attended: 0,
    pre_2h: 0,
    post_6h: 0,
    post_24h: 0,
    post_48h: 0,
    post_7d: 0,
    unfollowed_7d: 0,
  };
}

function buildAggRows(
  attendedTrials: any[],
  callsByUser: Map<string, any[]>,
  startYmd: string,
  endYmd: string
) {
  const map = new Map<string, any>();

  for (const t of attendedTrials) {
    const startTs = Number(t.start_ts_ms ?? 0);
    const classYmd =
      String(t.class_date_ksa ?? "").slice(0, 10) || (startTs ? ymdFromTs(startTs) : "");
    if (!startTs || !inRangeYmd(classYmd, startYmd, endYmd)) continue;

    const uid = String(t.user_id ?? "").trim();
    const salesGroup = String(t.sales_group ?? "").trim();
    const salesAgent =
      safeSalesName(t.sales_name ?? t.sales_agent ?? t.sales_id ?? "") || "(empty)";
    const salesKey = normalizeSalesKey(salesAgent);

    const rowKey = `${salesGroup}||${salesAgent}`;
    if (!map.has(rowKey)) {
      map.set(rowKey, emptyAggRow(salesGroup, salesAgent));
    }
    const row = map.get(rowKey);
    row.attended += 1;

    const userCalls = callsByUser.get(uid) ?? [];

    // 优先统计同一销售名下的通话
    const sameSalesCalls =
      salesKey
        ? userCalls.filter((c) => normalizeSalesKey(c.sales_agent) === salesKey)
        : userCalls;

    const usableCalls = sameSalesCalls.length ? sameSalesCalls : userCalls;

    // 课前2小时
    const hasPre2h = usableCalls.some((c) => {
      const ts = Number(c.outbound_ts_ms ?? 0);
      return ts >= startTs - 2 * HOUR_MS && ts < startTs;
    });
    if (hasPre2h) row.pre_2h += 1;

    // 课后首次有效通话，用于互斥分桶
    const afterCalls = usableCalls
      .map((c) => Number(c.outbound_ts_ms ?? 0))
      .filter((ts) => Number.isFinite(ts) && ts >= startTs)
      .sort((a, b) => a - b);

    const firstAfterTs = afterCalls.length ? afterCalls[0] : null;

    if (firstAfterTs === null) {
      row.unfollowed_7d += 1;
      continue;
    }

    const delta = firstAfterTs - startTs;

    if (delta < 6 * HOUR_MS) {
      row.post_6h += 1;
    } else if (delta < 24 * HOUR_MS) {
      row.post_24h += 1;
    } else if (delta < 48 * HOUR_MS) {
      row.post_48h += 1;
    } else if (delta < 7 * DAY_MS) {
      row.post_7d += 1;
    } else {
      row.unfollowed_7d += 1;
    }
  }

  return sortRows(Array.from(map.values()));
}

export function computeTab2(input: any) {
  const reportDate = String(input.reportDate ?? "").slice(0, 10);

  const agentsArr = Array.isArray(input.agents) ? input.agents : [];
  const trials = Array.isArray(input.trials) ? input.trials : [];
  const calls = Array.isArray(input.calls) ? input.calls : [];
  const orders = Array.isArray(input.orders) ? input.orders : [];

  // 试听课补销售信息
  const trials2 = attachSalesMeta(trials, agentsArr, (r: any) => ({
    sales_id: r.agent_id ?? r.sales_id,
  }));

  // 订单这版先保留给 debug
  const orders2 = attachSalesMeta(orders, agentsArr, (r: any) => ({
    sales_name: r.sales_name ?? r.sales_name_raw,
  }));

  const attendedTrials = trials2.filter((r: any) => isAttendedStatus(r.class_status));

  // calls: 只要有效通话 + 有 user_id + 有 outbound_ts_ms
  const effectiveCalls = calls.filter((c: any) => {
    const dur = toNum(c.call_duration_sec);
    const uid = String(c.user_id ?? "").trim();
    const ts = Number(c.outbound_ts_ms ?? 0);
    return dur >= EFFECTIVE_SEC && !!uid && Number.isFinite(ts) && ts > 0;
  });

  const callsByUser = new Map<string, any[]>();
  for (const c of effectiveCalls) {
    const uid = String(c.user_id ?? "").trim();
    if (!uid) continue;
    if (!callsByUser.has(uid)) callsByUser.set(uid, []);
    callsByUser.get(uid)!.push(c);
  }

  // 排序，后面取首次跟进更稳
  for (const arr of callsByUser.values()) {
    arr.sort((a, b) => Number(a.outbound_ts_ms ?? 0) - Number(b.outbound_ts_ms ?? 0));
  }

  const weekStart = sundayStartYmd(reportDate);
  const monthStart = monthStartYmd(reportDate);

  const weeklyBySales = buildAggRows(attendedTrials, callsByUser, weekStart, reportDate);
  const monthlyBySales = buildAggRows(attendedTrials, callsByUser, monthStart, reportDate);

  const weeklyAttended = weeklyBySales.reduce((s, r) => s + Number(r.attended ?? 0), 0);
  const monthlyAttended = monthlyBySales.reduce((s, r) => s + Number(r.attended ?? 0), 0);

  return {
    weeklyRange: { start: weekStart, end: reportDate },
    monthlyRange: { start: monthStart, end: reportDate },

    // 新结构
    weeklyBySales,
    monthlyBySales,

    // 兼容旧字段，避免别的地方炸掉
    a_byDate: [],
    b_bySalesDate: monthlyBySales,
    d_unfollowed: [],

    debug: {
      attendedTrials: attendedTrials.length,
      attendedWeekly: weeklyAttended,
      attendedMonthly: monthlyAttended,
      effectiveCalls: effectiveCalls.length,
      callsUsers: callsByUser.size,
      ordersUsers: new Set(
        orders2.map((o: any) => String(o.user_id ?? "").trim()).filter(Boolean)
      ).size,
      note: "Tab2 upgraded: per-sales weekly/monthly summary. Buckets are exclusive: <6h / 6-24h / 24-48h / 48h-7d / >7d.",
      reportDate,
      weeklyRange: { start: weekStart, end: reportDate },
      monthlyRange: { start: monthStart, end: reportDate },
      sample_calls: effectiveCalls.slice(0, 10).map((c: any) => ({
        user_id: c.user_id,
        sales_agent: c.sales_agent,
        outbound_time_raw: c.outbound_time_raw,
        outbound_ts_ms: c.outbound_ts_ms,
        call_status_text: c.call_status_text,
        call_duration_sec: c.call_duration_sec,
      })),
      sample_trials: attendedTrials.slice(0, 10).map((t: any) => ({
        user_id: t.user_id,
        sales_group: t.sales_group,
        sales_name: t.sales_name,
        class_status: t.class_status,
        class_start_ksa: t.class_start_ksa,
        start_ts_ms: t.start_ts_ms,
      })),
    },
  };
}
// src/metrics/tab2/tab2Core.ts

const EFFECTIVE_SEC = 20;

function extractUserId(raw: any) {
  const s = String(raw ?? "").trim();
  const m = s.match(/\((\d+)\)/);
  if (m) return m[1];
  const m2 = s.match(/\b(\d{5,})\b/);
  if (m2) return m2[1];
  return s;
}

function toNum(x: any) {
  const n = Number(String(x ?? "0").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function toYMD(raw: any) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
}

function parseDateTime(raw: any) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] || 0)
  );
}

function parseTrialStart(raw: any) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    0
  );
}

function addHours(d: Date, h: number) {
  return new Date(d.getTime() + h * 3600 * 1000);
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 3600 * 1000);
}

function fmtYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBack(ymd: string, days: number) {
  const d = parseTrialStart(`${ymd} 00:00`) || new Date();
  d.setDate(d.getDate() - days);
  return fmtYMD(d);
}

function parseDurationSec(raw: any) {
  const s = String(raw ?? "").trim();
  if (/^\d+$/.test(s)) return Number(s);

  const m1 = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (m1) return Number(m1[1]) * 3600 + Number(m1[2]) * 60 + Number(m1[3]);

  return 0;
}

function isEffectiveCall(c: any) {
  const dur =
    parseDurationSec(c.call_duration_sec) ||
    parseDurationSec(c.connect_time_sec) ||
    parseDurationSec(c.ring_duration_sec);

  if (dur >= EFFECTIVE_SEC) return true;

  const status = String(c.call_status ?? "").trim();
  const recording = String(c.recording_url ?? c.play_url ?? c.down_url ?? "").trim();

  // 当前 CRM voice export 没有稳定 duration 字段，先用“双方接通 + 有录音”作为有效通话兜底。
  return status === "双方接通" && recording.length > 0;
}

function normalizeSalesName(name: any) {
  return String(name ?? "").trim();
}

export function computeTab2(input: any) {
  const reportDate = String(input.reportDate || "").slice(0, 10);

  const trials = Array.isArray(input.trials) ? input.trials : [];
  const calls = Array.isArray(input.calls) ? input.calls : [];
  const agents = Array.isArray(input.agents) ? input.agents : [];

  const groupBySalesName = new Map<string, string>();
  for (const a of agents) {
    const name = normalizeSalesName(a.sales_name ?? a.sales_agent ?? a.agent_name);
    const group = String(a.sales_group ?? "").trim();
    if (name) groupBySalesName.set(name.toLowerCase(), group);
  }

  const normalizedCalls = calls
    .map((c: any) => {
      const uid = extractUserId(c.user_id);
      const time = parseDateTime(c.outbound_time ?? c.call_time);
      const salesName = normalizeSalesName(c.sales_name);
      return {
        ...c,
        _uid: uid,
        _time: time,
        _sales_name: salesName,
        _effective: isEffectiveCall(c),
      };
    })
    .filter((c: any) => c._uid && c._time && c._effective);

  const callsByUid = new Map<string, any[]>();
  for (const c of normalizedCalls) {
    if (!callsByUid.has(c._uid)) callsByUid.set(c._uid, []);
    callsByUid.get(c._uid)!.push(c);
  }

  function buildRows(startYmd: string, endYmd: string) {
    const rows = new Map<string, any>();

    const attended = trials.filter((t: any) => {
      const ymd = toYMD(t.class_start_ksa ?? t.start_time_ksa ?? t.start_time_bj ?? t.start_time);
      return ymd >= startYmd && ymd <= endYmd && String(t.class_status ?? "").trim() === "end";
    });

    for (const t of attended) {
      const uid = extractUserId(t.user_id);
      const salesAgent = normalizeSalesName(t.sales_agent ?? t.sales_name ?? t.admin_name);
      if (!uid || !salesAgent) continue;

      const salesGroup =
        String(groupBySalesName.get(salesAgent.toLowerCase()) ?? "").trim() ||
        String(t.sales_group ?? "").trim() ||
        "(empty)";

      const key = `${salesGroup}__${salesAgent}`;

      if (!rows.has(key)) {
        rows.set(key, {
          sales_group: salesGroup,
          sales_agent: salesAgent,
          attended: 0,
          pre_2h: 0,
          "0~6h": 0,
          "6~24h": 0,
          "24~48h": 0,
          "48h~7d": 0,
          unfollowed_7d: 0,
        });
      }

      const row = rows.get(key);
      row.attended += 1;

      const classStart = parseTrialStart(t.class_start_ksa ?? t.start_time_ksa ?? t.start_time_bj ?? t.start_time);
      if (!classStart) {
        row.unfollowed_7d += 1;
        continue;
      }

      const userCalls = callsByUid.get(uid) || [];

      const hasPre2h = userCalls.some((c: any) => c._time >= addHours(classStart, -2) && c._time < classStart);
      const has0to6 = userCalls.some((c: any) => c._time >= classStart && c._time < addHours(classStart, 6));
      const has6to24 = userCalls.some((c: any) => c._time >= addHours(classStart, 6) && c._time < addHours(classStart, 24));
      const has24to48 = userCalls.some((c: any) => c._time >= addHours(classStart, 24) && c._time < addHours(classStart, 48));
      const has48to7d = userCalls.some((c: any) => c._time >= addHours(classStart, 48) && c._time < addDays(classStart, 7));

      if (hasPre2h) row.pre_2h += 1;
      else if (has0to6) row["0~6h"] += 1;
      else if (has6to24) row["6~24h"] += 1;
      else if (has24to48) row["24~48h"] += 1;
      else if (has48to7d) row["48h~7d"] += 1;
      else row.unfollowed_7d += 1;
    }

    return Array.from(rows.values()).sort((a, b) => b.attended - a.attended);
  }

  const weeklyStart = daysBack(reportDate, 1);
  const monthStart = `${reportDate.slice(0, 8)}01`;

  const weeklyBySales = buildRows(weeklyStart, reportDate);
  const monthlyBySales = buildRows(monthStart, reportDate);

  const weeklyAttended = weeklyBySales.reduce((s, r) => s + toNum(r.attended), 0);
  const monthlyAttended = monthlyBySales.reduce((s, r) => s + toNum(r.attended), 0);

  const callUsers = new Set(normalizedCalls.map((c: any) => c._uid)).size;

  return {
    weekly_attended: weeklyAttended,
    monthly_attended: monthlyAttended,
    effective_calls: normalizedCalls.length,
    call_users: callUsers,

    weekly_by_sales: weeklyBySales,
    monthly_by_sales: monthlyBySales,

    weeklyBySales,
    monthlyBySales,

    weekly_start: weeklyStart,
    weekly_end: reportDate,
    month_start: monthStart,
    month_end: reportDate,

    debug: {
      reportDate,
      trials: trials.length,
      calls: calls.length,
      effective_calls: normalizedCalls.length,
      call_users: callUsers,
      weeklyAttended,
      monthlyAttended,
      weekly_by_sales_sample: weeklyBySales.slice(0, 5),
      monthly_by_sales_sample: monthlyBySales.slice(0, 5),
      sample_calls: normalizedCalls.slice(0, 10).map((c: any) => ({
        raw_user_id: c.user_id,
        uid: c._uid,
        outbound_time: c.outbound_time,
        call_status: c.call_status,
        recording_url: c.recording_url ? "yes" : "no",
      })),
    },
  };
}

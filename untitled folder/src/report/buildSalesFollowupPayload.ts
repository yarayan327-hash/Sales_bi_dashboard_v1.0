// src/report/buildSalesFollowupPayload.ts
import {
  extractUserId,
  normalizeName,
  parseCallsOutboundToTs,
  parseDurationSecFromCallStatus,
  parseKsaDateTimeToTs,
  parseLooseYmd,
  inRangeYmd,
  monthStartYmd,
  s
} from "./reportUtils";

const EFFECTIVE_SEC = 20;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type Input = {
  reportDate: string;
  agents: any[];
  trials: any[];
  calls: any[];
};

function sundayStartYmd(reportDate: string) {
  const d = new Date(`${reportDate} 00:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function slotByHour(hour: number) {
  if (hour >= 13 && hour < 15) return "13:00-15:00";
  if (hour >= 15 && hour < 17) return "15:00-17:00";
  if (hour >= 17 && hour < 19) return "17:00-19:00";
  if (hour >= 19 && hour < 21) return "19:00-21:00";
  return "other";
}

function buildAgentLookups(agents: any[]) {
  const byId = new Map<string, any>();
  const byName = new Map<string, any>();

  for (const a of agents) {
    byId.set(s(a.sales_id), a);
    byName.set(normalizeName(a.sales_name), a);
  }
  return { byId, byName };
}

function initAgg(extra: Record<string, any> = {}) {
  return {
    booked: 0,
    attended: 0,

    pre_2h_call_users: 0,
    pre_2h_connected_users: 0,

    post_6h_call_users: 0,
    post_6h_connected_users: 0,

    post_24h_call_users: 0,
    post_24h_connected_users: 0,

    post_48h_call_users: 0,
    post_48h_connected_users: 0,

    post_7d_call_users: 0,
    post_7d_connected_users: 0,

    post_over_7d_call_users: 0,
    post_over_7d_connected_users: 0,

    first_connect_interval_hours_sum: 0,
    first_connect_interval_count: 0,

    ...extra
  };
}

function finalize(rows: any[]) {
  return rows.map((r) => {
    const bookedBase = Number(r.booked ?? 0);
    const attendedBase = Number(r.attended ?? 0);

    return {
      ...r,
      pre_2h_touch_rate: bookedBase ? r.pre_2h_call_users / bookedBase : 0,
      pre_2h_connect_rate: r.pre_2h_call_users ? r.pre_2h_connected_users / r.pre_2h_call_users : 0,

      post_6h_touch_rate: attendedBase ? r.post_6h_call_users / attendedBase : 0,
      post_6h_connect_rate: r.post_6h_call_users ? r.post_6h_connected_users / r.post_6h_call_users : 0,

      post_24h_touch_rate: attendedBase ? r.post_24h_call_users / attendedBase : 0,
      post_24h_connect_rate: r.post_24h_call_users ? r.post_24h_connected_users / r.post_24h_call_users : 0,

      post_48h_touch_rate: attendedBase ? r.post_48h_call_users / attendedBase : 0,
      post_48h_connect_rate: r.post_48h_call_users ? r.post_48h_connected_users / r.post_48h_call_users : 0,

      post_7d_touch_rate: attendedBase ? r.post_7d_call_users / attendedBase : 0,
      post_7d_connect_rate: r.post_7d_call_users ? r.post_7d_connected_users / r.post_7d_call_users : 0,

      post_over_7d_touch_rate: attendedBase ? r.post_over_7d_call_users / attendedBase : 0,
      post_over_7d_connect_rate: r.post_over_7d_call_users ? r.post_over_7d_connected_users / r.post_over_7d_call_users : 0,

      attendance_rate: bookedBase ? attendedBase / bookedBase : 0,
      first_connect_interval_hours:
        r.first_connect_interval_count
          ? r.first_connect_interval_hours_sum / r.first_connect_interval_count
          : 0
    };
  });
}

function aggregate(trials: any[], callsByUser: Map<string, any[]>, keyFn: (t: any) => string, labelFn: (t: any) => any) {
  const map = new Map<string, any>();

  for (const t of trials) {
    const key = keyFn(t);
    if (!map.has(key)) {
      map.set(key, initAgg(labelFn(t)));
    }
    const row = map.get(key);

    const classStatus = s(t.class_status).toLowerCase();
    const isBooked = classStatus !== "cancel";
    const isAttended = classStatus === "end";
    const startTs = Number(t.start_ts_ms ?? 0);
    const uid = s(t.user_id);

    if (isBooked) row.booked += 1;
    if (isAttended) row.attended += 1;

    const userCalls = (callsByUser.get(uid) ?? []).filter((c) => {
      const salesKeyTrial = normalizeName(t.sales_name);
      const salesKeyCall = normalizeName(c.sales_agent);
      return !salesKeyTrial || salesKeyTrial === salesKeyCall;
    });

    if (!startTs) continue;

    // 课前2h
    const preCalls = userCalls.filter((c) => c.ts >= startTs - 2 * HOUR_MS && c.ts < startTs);
    if (preCalls.length > 0) {
      row.pre_2h_call_users += 1;
      if (preCalls.some((c) => c.connected)) row.pre_2h_connected_users += 1;
    }

    if (!isAttended) continue;

    // 课后分桶，非互相包含
    const postCalls = userCalls.filter((c) => c.ts >= startTs).sort((a, b) => a.ts - b.ts);

    const in6h = postCalls.filter((c) => c.ts < startTs + 6 * HOUR_MS);
    const in24h = postCalls.filter((c) => c.ts >= startTs + 6 * HOUR_MS && c.ts < startTs + 24 * HOUR_MS);
    const in48h = postCalls.filter((c) => c.ts >= startTs + 24 * HOUR_MS && c.ts < startTs + 48 * HOUR_MS);
    const in7d = postCalls.filter((c) => c.ts >= startTs + 48 * HOUR_MS && c.ts < startTs + 7 * DAY_MS);
    const over7d = postCalls.filter((c) => c.ts >= startTs + 7 * DAY_MS);

    if (in6h.length) {
      row.post_6h_call_users += 1;
      if (in6h.some((c) => c.connected)) row.post_6h_connected_users += 1;
    }
    if (in24h.length) {
      row.post_24h_call_users += 1;
      if (in24h.some((c) => c.connected)) row.post_24h_connected_users += 1;
    }
    if (in48h.length) {
      row.post_48h_call_users += 1;
      if (in48h.some((c) => c.connected)) row.post_48h_connected_users += 1;
    }
    if (in7d.length) {
      row.post_7d_call_users += 1;
      if (in7d.some((c) => c.connected)) row.post_7d_connected_users += 1;
    }
    if (over7d.length) {
      row.post_over_7d_call_users += 1;
      if (over7d.some((c) => c.connected)) row.post_over_7d_connected_users += 1;
    }

    const firstConnected = postCalls.find((c) => c.connected);
    if (firstConnected) {
      row.first_connect_interval_hours_sum += (firstConnected.ts - startTs) / HOUR_MS;
      row.first_connect_interval_count += 1;
    }
  }

  return finalize(Array.from(map.values()));
}

export function buildSalesFollowupPayload(input: Input) {
  const { byId } = buildAgentLookups(input.agents);

  const monthStart = monthStartYmd(input.reportDate);
  const weekStart = sundayStartYmd(input.reportDate);

  const trialsEnriched = input.trials.map((t) => {
    const agent = byId.get(s(t.agent_id)) || null;
    const startTs = parseKsaDateTimeToTs(t.class_start_ksa);
    const ymd = parseLooseYmd(t.class_start_ksa);

    return {
      ...t,
      start_ts_ms: startTs,
      class_ymd: ymd,
      sales_id: s(t.agent_id),
      sales_group: agent?.sales_group || "",
      sales_name: agent?.sales_name || ""
    };
  });

  const callsEnriched = input.calls
    .map((c) => {
      const uid = extractUserId(c.user_id);
      const salesAgent = s(c.seat_id || c.sales_agent || c.sales_name);
      const ts = parseCallsOutboundToTs(c.connect_time_sec || c.connect_time || c.outbound_time);
      const duration = parseDurationSecFromCallStatus(c.call_status);
      const connected = s(c.ring_duration_sec || c.call_status).includes("双方接通");

      return {
        ...c,
        user_id: uid,
        sales_agent: salesAgent,
        ts,
        duration,
        connected
      };
    })
    .filter((c) => !!c.user_id && !!c.ts && c.duration >= EFFECTIVE_SEC);

  const callsByUser = new Map<string, any[]>();
  for (const c of callsEnriched) {
    if (!callsByUser.has(c.user_id)) callsByUser.set(c.user_id, []);
    callsByUser.get(c.user_id)!.push(c);
  }

  for (const arr of callsByUser.values()) {
    arr.sort((a, b) => a.ts - b.ts);
  }

  const weeklyTrials = trialsEnriched.filter((t) => inRangeYmd(t.class_ymd, weekStart, input.reportDate));
  const monthlyTrials = trialsEnriched.filter((t) => inRangeYmd(t.class_ymd, monthStart, input.reportDate));

  const weeklyBySales = aggregate(
    weeklyTrials,
    callsByUser,
    (t) => `${t.sales_group}||${t.sales_name}`,
    (t) => ({ sales_group: t.sales_group, sales_agent: t.sales_name })
  );

  const monthlyBySales = aggregate(
    monthlyTrials,
    callsByUser,
    (t) => `${t.sales_group}||${t.sales_name}`,
    (t) => ({ sales_group: t.sales_group, sales_agent: t.sales_name })
  );

  const bookingTypeAnalysis = aggregate(
    monthlyTrials,
    callsByUser,
    (t) => s(t.booking_type || "(empty)"),
    (t) => ({ booking_type: s(t.booking_type || "(empty)") })
  );

  const timeSlotAnalysis = aggregate(
    monthlyTrials.filter((t) => !!t.start_ts_ms),
    callsByUser,
    (t) => {
      const d = new Date(t.start_ts_ms);
      return slotByHour(d.getHours());
    },
    (t) => {
      const d = new Date(t.start_ts_ms);
      return { time_slot: slotByHour(d.getHours()) };
    }
  ).filter((r) => r.time_slot !== "other");

  return {
    weekly_range: { start: weekStart, end: input.reportDate },
    monthly_range: { start: monthStart, end: input.reportDate },
    weekly_by_sales: weeklyBySales,
    monthly_by_sales: monthlyBySales,
    booking_type_analysis: bookingTypeAnalysis,
    time_slot_analysis: timeSlotAnalysis,
    debug: {
      calls_effective: callsEnriched.length,
      weekly_trials: weeklyTrials.length,
      monthly_trials: monthlyTrials.length
    }
  };
}
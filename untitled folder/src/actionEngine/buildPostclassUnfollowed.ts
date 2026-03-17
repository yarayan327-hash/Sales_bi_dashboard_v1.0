function safeNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseTs(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const HOUR_MS = 60 * 60 * 1000;

export function buildPostclassUnfollowed(input: {
  reportDate: string;
  trials: any[];
  calls: any[];
}) {
  const trials = Array.isArray(input.trials) ? input.trials : [];
  const calls = Array.isArray(input.calls) ? input.calls : [];
  const reportDate = String(input.reportDate ?? "").slice(0, 10);

  const callsByUser = new Map<string, any[]>();
  for (const c of calls) {
    const uid = String(c.user_id ?? "").trim();
    if (!uid) continue;
    if (!callsByUser.has(uid)) callsByUser.set(uid, []);
    callsByUser.get(uid)!.push(c);
  }

  for (const arr of callsByUser.values()) {
    arr.sort((a, b) => parseTs(a.outbound_ts_ms) - parseTs(b.outbound_ts_ms));
  }

  return trials
    .filter((t) => {
      const classDate = String(t.class_date_ksa ?? "").slice(0, 10);
      const status = String(t.class_status ?? "").trim().toLowerCase();
      return classDate <= reportDate && status === "end";
    })
    .map((t) => {
      const uid = String(t.user_id ?? "").trim();
      const startTs = parseTs(t.start_ts_ms);
      const userCalls = callsByUser.get(uid) ?? [];

      const postCalls = userCalls.filter((c) => parseTs(c.outbound_ts_ms) >= startTs);
      const post6h = postCalls.filter((c) => parseTs(c.outbound_ts_ms) < startTs + 6 * HOUR_MS);
      const post24h = postCalls.filter((c) => parseTs(c.outbound_ts_ms) < startTs + 24 * HOUR_MS);

      const post6hConnected = post6h.filter((c) => safeNum(c.call_duration_sec) >= 20);
      const post24hConnected = post24h.filter((c) => safeNum(c.call_duration_sec) >= 20);

      return {
        user_id: uid,
        sales_group: String(t.sales_group ?? ""),
        sales_agent: String(t.sales_name ?? t.sales_agent ?? ""),
        booking_type: String(t.booking_type ?? ""),
        class_start_ksa: String(t.class_start_ksa ?? ""),
        textbook: String(t.textbook ?? ""),
        teacher_id: String(t.teacher_id ?? ""),
        teacher_name: String(t.teacher_name ?? ""),
        post_6h_call_count: post6h.length,
        post_6h_connected_count: post6hConnected.length,
        post_24h_call_count: post24h.length,
        post_24h_connected_count: post24hConnected.length,
        missing_post_6h_touch: post6h.length === 0,
        missing_post_24h_touch: post24h.length === 0,
      };
    })
    .filter((r) => r.missing_post_6h_touch || r.missing_post_24h_touch)
    .sort((a, b) => String(a.class_start_ksa).localeCompare(String(b.class_start_ksa)));
}
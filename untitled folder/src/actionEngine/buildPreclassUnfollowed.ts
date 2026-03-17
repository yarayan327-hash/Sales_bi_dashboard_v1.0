function safeNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseTs(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const HOUR_MS = 60 * 60 * 1000;

export function buildPreclassUnfollowed(input: {
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
      return classDate <= reportDate && status !== "cancel";
    })
    .map((t) => {
      const uid = String(t.user_id ?? "").trim();
      const startTs = parseTs(t.start_ts_ms);
      const userCalls = callsByUser.get(uid) ?? [];

      const pre2hCalls = userCalls.filter((c) => {
        const ts = parseTs(c.outbound_ts_ms);
        return ts >= startTs - 2 * HOUR_MS && ts < startTs;
      });

      const pre2hConnected = pre2hCalls.filter((c) => safeNum(c.call_duration_sec) >= 20);

      return {
        user_id: uid,
        sales_group: String(t.sales_group ?? ""),
        sales_agent: String(t.sales_name ?? t.sales_agent ?? ""),
        booking_type: String(t.booking_type ?? ""),
        class_start_ksa: String(t.class_start_ksa ?? ""),
        class_status: String(t.class_status ?? ""),
        textbook: String(t.textbook ?? ""),
        teacher_id: String(t.teacher_id ?? ""),
        teacher_name: String(t.teacher_name ?? ""),
        pre_2h_call_count: pre2hCalls.length,
        pre_2h_connected_count: pre2hConnected.length,
        missing_pre_2h_touch: pre2hCalls.length === 0,
        missing_pre_2h_connect: pre2hConnected.length === 0,
      };
    })
    .filter((r) => r.missing_pre_2h_touch)
    .sort((a, b) => String(a.class_start_ksa).localeCompare(String(b.class_start_ksa)));
}
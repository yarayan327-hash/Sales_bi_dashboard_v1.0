// src/transformers/trials.ts
type AnyRow = Record<string, any>;

function s(v: any) {
  return String(v ?? "").trim();
}

/**
 * 解析：
 * - "2026-03-01 23:00 ~ 23:30"
 * - "2026/3/1 23:00 ~ 23:30"
 * - "2026-03-01 23:00"
 * -> ts ms
 */
function parseStartTsMs(raw: any): number | null {
  const text = s(raw);
  if (!text) return null;

  const normalized = text.replace(/\//g, "-").replace("T", " ");

  // 匹配 "YYYY-MM-DD HH:mm ~ HH:mm"
  let m = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})\s*~/
  );
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const hh = Number(m[4]);
    const mm = Number(m[5]);
    return new Date(y, mo - 1, d, hh, mm, 0).getTime();
  }

  // 匹配 "YYYY-MM-DD HH:mm"
  m = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const hh = Number(m[4]);
    const mm = Number(m[5]);
    return new Date(y, mo - 1, d, hh, mm, 0).getTime();
  }

  const t = Date.parse(normalized);
  return Number.isFinite(t) ? t : null;
}

export function transformTrials(rows: AnyRow[]): AnyRow[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r) => {
      const user_id = s(r.user_id);
      if (!user_id) return null;

      const class_status = s(
        r.class_status ??
          r.status ??
          r.attendance_status ??
          r.attend_status ??
          r.trial_status
      );

      /**
       * 优先用 KSA 字段
       */
      const class_start_ksa = s(
        r.class_start_ksa || r.class_date_ksa || r.start_time_ksa || r.class_date
      );

      const class_date_ksa =
        class_start_ksa && class_start_ksa.length >= 10
          ? class_start_ksa.slice(0, 10).replace(/\//g, "-")
          : "";

      const booked_at = s(r.booked_at);

      const agent_id = s(r.agent_id || r.sales_id || r.consultant_id);
      const sales_id = agent_id;

      /**
       * 给 tab2 用的关键字段
       */
      const start_ts_ms =
        parseStartTsMs(r.class_start_ksa) ||
        parseStartTsMs(r.start_time_ksa) ||
        parseStartTsMs(r.class_date_ksa) ||
        parseStartTsMs(r.class_date);

      const is_booked = !!class_start_ksa;
      const is_attended = class_status === "end";

      return {
        ...r,
        user_id,
        class_status,
        class_start_ksa,
        class_date_ksa,
        booked_at,
        agent_id,
        sales_id,
        start_ts_ms,
        is_booked,
        is_attended,
      };
    })
    .filter(Boolean) as AnyRow[];
}
// src/transformers/calls.ts
type AnyRow = Record<string, any>;

function s(v: any) {
  return String(v ?? "").trim();
}

/**
 * 你的 calls user_id 可能是：
 * - "student (62442011)"
 * - "Deema (61472117)"
 * - "61472117"
 */
function extractUserId(raw: string): string {
  const t = s(raw);
  const m = t.match(/\((\d+)\)/);
  if (m) return m[1];
  if (/^\d+$/.test(t)) return t;
  return t;
}

/**
 * 解析时间字符串 -> ts ms
 * 支持：
 * - 2026/2/7 21:39
 * - 2026-02-07 21:39
 * - 2026-02-07T21:39:00
 *
 * 说明：
 * 你当前 calls 原始表看起来已经是业务侧时间，
 * 这里先不强行做时区换算，只做稳定解析。
 */
function toTsMs(raw: any): number | null {
  const text = s(raw);
  if (!text) return null;

  const normalized = text.replace(/\//g, "-").replace("T", " ");
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? t : null;
}

/**
 * 从 call_status 里解析通话时长秒数
 *
 * 样例：
 * - "00:01:49(To. 00:01:49)"
 * - "00:00:05(To. 00:00:05)"
 * - "0:00:00"
 * - "客户未接听"
 * - "用户忙"
 * - "双方接通"
 *
 * 优先匹配 HH:MM:SS
 */
function parseDurationSec(raw: any): number {
  const text = s(raw);
  if (!text) return 0;

  const m = text.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return 0;

  const hh = Number(m[1] || 0);
  const mm = Number(m[2] || 0);
  const ss = Number(m[3] || 0);

  return hh * 3600 + mm * 60 + ss;
}

export function transformCalls(rows: AnyRow[]): AnyRow[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r) => {
      const user_id = extractUserId(s(r.user_id));
      if (!user_id || user_id === "0") return null;

      /**
       * 你原始表实际可用的销售坐席更像在 seat_id 里：
       * - EGCC-eman.amr
       * - 51habiba.hassan
       */
      const sales_agent = s(r.seat_id || r.sales_agent || r.agent || r.sales_name);

      /**
       * 根据你给的原始样例：
       * connect_time_sec 实际存的是时间
       */
      const outbound_time_raw = s(r.connect_time_sec || r.connect_time || r.outbound_time);
      const outbound_ts_ms = toTsMs(outbound_time_raw);

      /**
       * 根据你原始样例：
       * call_status 实际存的是通话时长文本
       * ring_duration_sec 更像状态文本（双方接通 / 客户未接听 / 用户忙）
       */
      const call_status_text = s(r.ring_duration_sec || r.call_status || r.status);
      const duration_text = s(r.call_status);
      const call_duration_sec = parseDurationSec(duration_text);

      return {
        ...r,
        user_id,
        sales_agent,
        outbound_time_raw,
        outbound_ts_ms,
        call_status_text,
        call_duration_sec,
      };
    })
    .filter(Boolean) as AnyRow[];
}
import { HEADERS } from "../../config/headers";
import { pick } from "../../utils/csv";
import { extractDigits } from "../../utils/text";
import { parseAnyDateToKsa } from "../../utils/time";
import { CallFact } from "../../types/normalized";

// connect_time in your export may be blank; we will derive from "接听状态/双方接听时间" if possible
function parseConnectSeconds(connectTimeRaw: string): number {
  // some exports may store seconds directly, some empty
  const s = (connectTimeRaw || "").trim();
  if (!s) return 0;
  // If it looks like "0:00:05"
  const m = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  // If number-like
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDurationSeconds(durRaw: string): number {
  const s = (durRaw || "").trim();
  if (!s) return 0;
  const m = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeCalls(rows: Record<string, string>[]): CallFact[] {
  return rows.map(r => {
    const uid_raw = pick(r, HEADERS.fact_calls.user_id);
    const user_id = extractDigits(uid_raw);

    const sales_name = pick(r, HEADERS.fact_calls.sales_name);

    const outbound_time = pick(r, HEADERS.fact_calls.outbound_time);
    const outbound_dt_ksa = parseAnyDateToKsa(outbound_time);

    const connect_time = pick(r, HEADERS.fact_calls.connect_time);
    const call_duration = pick(r, HEADERS.fact_calls.call_duration);

    return {
      user_id,
      sales_name,
      outbound_dt_ksa,
      connect_seconds: parseConnectSeconds(connect_time),
      duration_seconds: parseDurationSeconds(call_duration),
    };
  }).filter(x => x.user_id && x.outbound_dt_ksa);
}

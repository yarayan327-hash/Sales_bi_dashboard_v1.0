import { HEADERS } from "../../config/headers";
import { pick } from "../../utils/csv";
import { extractDigits } from "../../utils/text";
import { parseAnyDateToKsa, parseKsaRangeToDates, formatDateKey, diffMinutes } from "../../utils/time";
import { TrialFact } from "../../types/normalized";
import { toNumber } from "../../utils/number";

export function normalizeTrials(rows: Record<string, string>[]): TrialFact[] {
  return rows.map(r => {
    const record_id = pick(r, HEADERS.fact_trials.record_id) || `${Math.random()}`;
    const user_id = extractDigits(pick(r, HEADERS.fact_trials.user_id));
    const agent_id = pick(r, HEADERS.fact_trials.agent_id);
    const class_status = pick(r, HEADERS.fact_trials.class_status);
    const start_time_ksa = pick(r, HEADERS.fact_trials.start_time_ksa);
    const start_range_ksa_raw = start_time_ksa;

    const range = parseKsaRangeToDates(start_time_ksa);
    const class_start_ksa = range?.start ?? null;
    const class_end_ksa = range?.end ?? null;
    const class_date_ksa = class_start_ksa ? formatDateKey(class_start_ksa) : "";

    const booked_at_raw = pick(r, HEADERS.fact_trials.booked_at);
    const booked_at_dt_ksa = parseAnyDateToKsa(booked_at_raw);

    const duration_raw = pick(r, HEADERS.fact_trials.duration_minutes);
    const duration_minutes = duration_raw ? toNumber(duration_raw) : (class_start_ksa && class_end_ksa ? diffMinutes(class_start_ksa, class_end_ksa) : null);

    const is_ordered = pick(r, HEADERS.fact_trials.is_ordered);

    return {
      record_id,
      user_id,
      agent_id,
      class_status,
      start_range_ksa_raw,
      class_start_ksa,
      class_end_ksa,
      class_date_ksa,
      duration_minutes: duration_minutes ? Number(duration_minutes) : null,
      booked_at_dt_ksa,
      is_ordered,
    };
  }).filter(x => x.user_id && x.class_start_ksa && x.class_end_ksa && x.class_date_ksa);
}
